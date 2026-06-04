import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from "@azure/storage-blob";

const PRESIGN_EXPIRY = 5 * 60; // 5 minutes

// ---------------------------------------------------------------------------
// Backend selection
//
// The web app talks to one object-storage backend, chosen at runtime by env:
//   - Azure Blob Storage when AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_CONTAINER
//     and AZURE_STORAGE_KEY are all present (e.g. on Azure Container Apps).
//   - Otherwise the default S3/MinIO path (unchanged), used in dev and on AWS.
//
// Public function signatures below are backend-agnostic; callers never change.
// ---------------------------------------------------------------------------

/** True when the Azure Blob backend is fully configured. */
function useAzure(): boolean {
  return Boolean(
    process.env.AZURE_STORAGE_ACCOUNT &&
      process.env.AZURE_STORAGE_CONTAINER &&
      process.env.AZURE_STORAGE_KEY,
  );
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

/** Lazy shared-key credential built from AZURE_STORAGE_ACCOUNT/AZURE_STORAGE_KEY. */
function getAzureCredential(): StorageSharedKeyCredential {
  if (_azureCredential) return _azureCredential;
  _azureCredential = new StorageSharedKeyCredential(
    process.env.AZURE_STORAGE_ACCOUNT as string,
    process.env.AZURE_STORAGE_KEY as string,
  );
  return _azureCredential;
}

/** Lazy BlobServiceClient for the configured storage account. */
function getAzureService(): BlobServiceClient {
  if (_azureService) return _azureService;
  const account = process.env.AZURE_STORAGE_ACCOUNT as string;
  _azureService = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    getAzureCredential(),
  );
  return _azureService;
}

/**
 * Build a Blob SAS URL scoped to a single blob.
 * `permissions` is an Azure permission string (e.g. "r" for GET, "racw" for PUT).
 */
function buildAzureSasUrl(objectKey: string, permissions: string): string {
  const containerName = getContainerName();
  const now = Date.now();
  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: objectKey,
      permissions: BlobSASPermissions.parse(permissions),
      // Match the S3 presign window: a small clock-skew allowance on start,
      // and PRESIGN_EXPIRY seconds of validity.
      startsOn: new Date(now - 5 * 60 * 1000),
      expiresOn: new Date(now + PRESIGN_EXPIRY * 1000),
      protocol: SASProtocol.HttpsAndHttp,
    },
    getAzureCredential(),
  ).toString();
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

// Export for testing (reset singletons)
export function _resetClientForTest(): void {
  _client = null;
  _azureCredential = null;
  _azureService = null;
}
