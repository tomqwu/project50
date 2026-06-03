import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PRESIGN_EXPIRY = 5 * 60; // 5 minutes

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

/**
 * Build a media object key for a user's upload.
 * PURE — no Date.now/Math.random; the caller provides `suffix`.
 */
export function newMediaKey(userId: string, ext: string, suffix: string): string {
  return `media/${userId}/${suffix}.${ext}`;
}

/** Return a presigned PUT URL for uploading an object. */
export async function presignPut(
  objectKey: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: PRESIGN_EXPIRY });
}

/** Return a presigned GET URL for downloading/viewing an object. */
export async function presignGet(objectKey: string): Promise<string> {
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
 * Calls ensureBucket() first so this works on fresh storage (e.g. CI with
 * MinIO where the bucket hasn't been created yet via the presign route).
 */
export async function putObject(
  objectKey: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await ensureBucket();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
    Body: body,
    ContentType: contentType,
  });
  await getClient().send(command);
}

/** Idempotent: create S3_BUCKET if it does not exist. */
export async function ensureBucket(): Promise<void> {
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
 * Readiness probe for object storage: resolves true when the configured bucket
 * is reachable (a HEAD succeeds), false on any error. Never throws — callers use
 * the boolean to build a readiness response.
 */
export async function checkStorage(): Promise<boolean> {
  try {
    await getClient().send(new HeadBucketCommand({ Bucket: getBucket() }));
    return true;
  } catch {
    return false;
  }
}

// Export for testing (reset singleton)
export function _resetClientForTest(): void {
  _client = null;
}
