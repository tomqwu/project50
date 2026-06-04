import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
  type UserDelegationKey,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

const PRESIGN_EXPIRY = 5 * 60; // 5 minutes

// ---------------------------------------------------------------------------
// Backend selection
//
// The web app talks to one object-storage backend, chosen at runtime by env.
// There are THREE Azure modes plus the S3/MinIO default:
//
//   1. Shared-key SAS  — when AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_CONTAINER
//      and AZURE_STORAGE_KEY are all set. Convenient for local/dev; SAS URLs
//      are signed with the long-lived account key. (Unchanged behavior.)
//
//   2. Managed identity (user-delegation SAS) — when AZURE_STORAGE_ACCOUNT and
//      AZURE_STORAGE_CONTAINER are set but AZURE_STORAGE_KEY is NOT. The app
//      authenticates via DefaultAzureCredential (its managed identity, optionally
//      pinned by AZURE_CLIENT_ID) and signs SAS URLs with a short-lived
//      user-delegation key fetched from the service — no account key needed.
//
//   3. S3 / MinIO (default) — used in dev and on AWS when no Azure account is
//      configured. (Unchanged behavior.)
//
// Public function signatures below are backend-agnostic; callers never change.
// ---------------------------------------------------------------------------

/** True when the Azure shared-key (account key) backend is fully configured. */
function useAzureKey(): boolean {
  return Boolean(
    process.env.AZURE_STORAGE_ACCOUNT &&
      process.env.AZURE_STORAGE_CONTAINER &&
      process.env.AZURE_STORAGE_KEY,
  );
}

/**
 * True when the Azure managed-identity backend is configured: account +
 * container present, but NO account key (so we sign user-delegation SAS).
 */
function useAzureIdentity(): boolean {
  return Boolean(
    process.env.AZURE_STORAGE_ACCOUNT &&
      process.env.AZURE_STORAGE_CONTAINER &&
      !process.env.AZURE_STORAGE_KEY,
  );
}

/** True when either Azure backend is active (shared-key or managed identity). */
function useAzure(): boolean {
  return useAzureKey() || useAzureIdentity();
}

function getBucket(): string {
  return process.env.S3_BUCKET ?? "project50-media";
}

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    },
    forcePathStyle: true,
  });
  return _client;
}

// ---------------------------------------------------------------------------
// Azure Blob backend (lazy-initialized, mirrors the S3 behaviors)
// ---------------------------------------------------------------------------

let _azureCredential: StorageSharedKeyCredential | null = null;
let _azureService: BlobServiceClient | null = null;

/** The Azure container name (mirrors getBucket for the Blob backend). */
function getContainerName(): string {
  // useAzure() guarantees these are set when this is reached.
  return process.env.AZURE_STORAGE_CONTAINER as string;
}

/** The configured Azure storage account name. */
function getAzureAccount(): string {
  return process.env.AZURE_STORAGE_ACCOUNT as string;
}

/** Lazy shared-key credential built from AZURE_STORAGE_ACCOUNT/AZURE_STORAGE_KEY. */
function getAzureCredential(): StorageSharedKeyCredential {
  if (_azureCredential) return _azureCredential;
  _azureCredential = new StorageSharedKeyCredential(
    getAzureAccount(),
    process.env.AZURE_STORAGE_KEY as string,
  );
  return _azureCredential;
}

/**
 * Lazy BlobServiceClient for the configured storage account.
 *
 * In managed-identity mode the client is built from DefaultAzureCredential
 * (the app's managed identity, optionally pinned via AZURE_CLIENT_ID) so no
 * account key is required. In shared-key mode it uses the account-key
 * credential as before.
 */
function getAzureService(): BlobServiceClient {
  if (_azureService) return _azureService;
  const url = `https://${getAzureAccount()}.blob.core.windows.net`;
  if (useAzureIdentity()) {
    _azureService = new BlobServiceClient(
      url,
      new DefaultAzureCredential({
        managedIdentityClientId: process.env.AZURE_CLIENT_ID,
      }),
    );
  } else {
    _azureService = new BlobServiceClient(url, getAzureCredential());
  }
  return _azureService;
}

// ---------------------------------------------------------------------------
// User-delegation key cache (managed-identity mode)
//
// A user-delegation key is fetched from the service via the managed identity
// and is valid for ~1h. We cache it and refresh only when it is within
// REFRESH_SKEW of expiry, so each presign avoids a network round-trip.
// ---------------------------------------------------------------------------

// Request a 1-hour key; refresh when within 5 minutes of expiry.
const DELEGATION_KEY_TTL_MS = 60 * 60 * 1000;
const DELEGATION_KEY_REFRESH_SKEW_MS = 5 * 60 * 1000;

let _delegationKey: UserDelegationKey | null = null;
let _delegationKeyExpiry = 0;

/**
 * Return a valid user-delegation key, fetching a fresh one from the service
 * when the cache is empty or close to expiring. Cached for ~1h.
 */
async function getUserDelegationKey(): Promise<UserDelegationKey> {
  const now = Date.now();
  if (
    _delegationKey &&
    now < _delegationKeyExpiry - DELEGATION_KEY_REFRESH_SKEW_MS
  ) {
    return _delegationKey;
  }
  const startsOn = new Date(now);
  const expiresOn = new Date(now + DELEGATION_KEY_TTL_MS);
  _delegationKey = await getAzureService().getUserDelegationKey(
    startsOn,
    expiresOn,
  );
  _delegationKeyExpiry = expiresOn.getTime();
  return _delegationKey;
}

/**
 * Build a Blob SAS URL scoped to a single blob.
 * `permissions` is an Azure permission string (e.g. "r" for GET, "racw" for PUT).
 *
 * Signs with the account-key credential in shared-key mode, or with a cached
 * user-delegation key (managed identity) in identity mode.
 */
async function buildAzureSasUrl(
  objectKey: string,
  permissions: string,
): Promise<string> {
  const containerName = getContainerName();
  const now = Date.now();
  const sasOptions = {
    containerName,
    blobName: objectKey,
    permissions: BlobSASPermissions.parse(permissions),
    // Match the S3 presign window: a small clock-skew allowance on start,
    // and PRESIGN_EXPIRY seconds of validity.
    startsOn: new Date(now - 5 * 60 * 1000),
    expiresOn: new Date(now + PRESIGN_EXPIRY * 1000),
    protocol: SASProtocol.HttpsAndHttp,
  };
  let sas: string;
  if (useAzureIdentity()) {
    const userDelegationKey = await getUserDelegationKey();
    sas = generateBlobSASQueryParameters(
      sasOptions,
      userDelegationKey,
      getAzureAccount(),
    ).toString();
  } else {
    sas = generateBlobSASQueryParameters(
      sasOptions,
      getAzureCredential(),
    ).toString();
  }
  const blobClient = getAzureService()
    .getContainerClient(containerName)
    .getBlobClient(objectKey);
  return `${blobClient.url}?${sas}`;
}

/** Idempotent: create the Azure container if it does not exist. */
async function ensureAzureContainer(): Promise<void> {
  await getAzureService()
    .getContainerClient(getContainerName())
    .createIfNotExists();
}

// ---------------------------------------------------------------------------
// Public API (backend-agnostic)
// ---------------------------------------------------------------------------

/**
 * Build a media object key for a user's upload.
 * PURE — no Date.now/Math.random; the caller provides `suffix`.
 * Identical across both backends.
 */
export function newMediaKey(userId: string, ext: string, suffix: string): string {
  return `media/${userId}/${suffix}.${ext}`;
}

/**
 * The object-storage key prefix under which all of a user's uploaded media
 * lives (`media/<userId>/`). Account deletion sweeps this prefix to remove any
 * orphaned blobs. PURE — no env/IO. Identical across both backends.
 */
export function userMediaPrefix(userId: string): string {
  return `media/${userId}/`;
}

/** Return a presigned PUT URL for uploading an object. */
export async function presignPut(
  objectKey: string,
  contentType: string,
): Promise<string> {
  if (useAzure()) {
    // create + write so a brand-new blob can be uploaded via the SAS URL.
    return buildAzureSasUrl(objectKey, "racw");
  }
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: PRESIGN_EXPIRY });
}

/** Return a presigned GET URL for downloading/viewing an object. */
export async function presignGet(objectKey: string): Promise<string> {
  if (useAzure()) {
    return buildAzureSasUrl(objectKey, "r");
  }
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  });
  return getSignedUrl(getClient(), command, { expiresIn: PRESIGN_EXPIRY });
}

/**
 * Upload a Buffer directly to object storage (server-side upload).
 * Use for server-generated files such as rendered recap MP4s.
 *
 * Ensures the bucket/container exists first so this works on fresh storage
 * (e.g. CI with MinIO, or a freshly-provisioned Azure account).
 */
export async function putObject(
  objectKey: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (useAzure()) {
    await ensureAzureContainer();
    await getAzureService()
      .getContainerClient(getContainerName())
      .getBlockBlobClient(objectKey)
      .upload(body, body.length, {
        blobHTTPHeaders: { blobContentType: contentType },
      });
    return;
  }
  await ensureBucket();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
    Body: body,
    ContentType: contentType,
  });
  await getClient().send(command);
}

/**
 * Idempotent: create the configured object-storage container/bucket if it does
 * not exist. Routes to Azure container-ensure or S3 bucket-ensure by env.
 */
export async function ensureBucket(): Promise<void> {
  if (useAzure()) {
    await ensureAzureContainer();
    return;
  }
  const client = getClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: getBucket() }));
  } catch (err: unknown) {
    const code =
      (err as { name?: string; Code?: string })?.name ||
      (err as { name?: string; Code?: string })?.Code;
    // 404 / NoSuchBucket / NotFound means we need to create it
    if (
      code === "NotFound" ||
      code === "NoSuchBucket" ||
      (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode === 404
    ) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: getBucket() }));
      } catch (createErr: unknown) {
        const createCode =
          (createErr as { name?: string; Code?: string })?.name ||
          (createErr as { name?: string; Code?: string })?.Code;
        // Swallow "already owned" or "BucketAlreadyExists"
        if (
          createCode !== "BucketAlreadyOwnedByYou" &&
          createCode !== "BucketAlreadyExists"
        ) {
          throw createErr;
        }
      }
    } else {
      throw err;
    }
  }
}

/**
 * Readiness probe for object storage: resolves true when the configured
 * container/bucket is reachable, false on any error. Never throws — callers use
 * the boolean to build a readiness response.
 */
export async function checkStorage(): Promise<boolean> {
  try {
    if (useAzure()) {
      await getAzureService().getContainerClient(getContainerName()).exists();
      return true;
    }
    await getClient().send(new HeadBucketCommand({ Bucket: getBucket() }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a single object from storage by its objectKey.
 *
 * Idempotent: deleting a key that does not exist is a no-op on both backends
 * (S3 DeleteObject is idempotent; Azure deleteIfExists swallows 404). Routes to
 * the configured backend by env. Throws only on real errors (e.g. auth/network)
 * so callers can decide whether to log-and-continue.
 */
export async function deleteObject(objectKey: string): Promise<void> {
  if (useAzure()) {
    await getAzureService()
      .getContainerClient(getContainerName())
      .deleteBlob(objectKey, { deleteSnapshots: "include" })
      .catch((err: unknown) => {
        // 404 (blob already gone) is fine; rethrow anything else.
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404) return;
        throw err;
      });
    return;
  }
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: objectKey }),
  );
}

/**
 * Belt-and-suspenders sweep: delete EVERY object under a user's media prefix
 * (`media/<userId>/`). Used by account deletion alongside the explicit
 * per-row objectKey deletes, so any blob that the DB no longer references is
 * still removed (a real GDPR requirement).
 *
 * - S3/MinIO: paginate ListObjectsV2 by prefix and batch-delete (DeleteObjects,
 *   up to 1000 keys/request).
 * - Azure Blob: list blobs by prefix and delete each.
 *
 * Safe no-op when the prefix is empty (no objects listed). Routes by env.
 */
export async function deleteUserMedia(userId: string): Promise<void> {
  const prefix = userMediaPrefix(userId);

  if (useAzure()) {
    const container = getAzureService().getContainerClient(getContainerName());
    for await (const blob of container.listBlobsFlat({ prefix })) {
      await container.deleteBlob(blob.name, { deleteSnapshots: "include" });
    }
    return;
  }

  const client = getClient();
  const bucket = getBucket();
  let continuationToken: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const keys = (listed.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => Boolean(k));
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );
    }
    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined;
  } while (continuationToken);
}

// Export for testing (reset singletons)
export function _resetClientForTest(): void {
  _client = null;
  _azureCredential = null;
  _azureService = null;
  _delegationKey = null;
  _delegationKeyExpiry = 0;
}
