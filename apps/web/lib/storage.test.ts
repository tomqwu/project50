import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AWS SDK presigner
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed"),
}));

// Mock S3Client and commands
const mockSend = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ _type: "PutObject", ...input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ _type: "GetObject", ...input })),
  HeadBucketCommand: vi.fn().mockImplementation((input) => ({ _type: "HeadBucket", ...input })),
  CreateBucketCommand: vi.fn().mockImplementation((input) => ({ _type: "CreateBucket", ...input })),
}));

// ---------------------------------------------------------------------------
// Azure Blob SDK mocks
// ---------------------------------------------------------------------------
const azureUpload = vi.fn().mockResolvedValue({});
const azureCreateIfNotExists = vi.fn().mockResolvedValue({});
const azureExists = vi.fn().mockResolvedValue(true);
// User-delegation key returned by the service (managed-identity mode). Each
// call returns a fresh object so tests can assert caching by identity.
const azureGetUserDelegationKey = vi.fn(async () => ({
  signedObjectId: "obj",
  signedTenantId: "tenant",
  signedService: "b",
  signedVersion: "2024",
  value: "delegation-key-value",
}));
const getBlockBlobClient = vi.fn(() => ({ upload: azureUpload }));
const getBlobClient = vi.fn((blobName: string) => ({
  url: `https://acct.blob.core.windows.net/cont/${blobName}`,
}));
const getContainerClient = vi.fn(() => ({
  createIfNotExists: azureCreateIfNotExists,
  exists: azureExists,
  getBlobClient,
  getBlockBlobClient,
}));

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: vi.fn().mockImplementation((url: string) => ({
    _url: url,
    getContainerClient,
    getUserDelegationKey: azureGetUserDelegationKey,
  })),
  StorageSharedKeyCredential: vi
    .fn()
    .mockImplementation((account: string, key: string) => ({ account, key })),
  generateBlobSASQueryParameters: vi.fn(
    (opts: { permissions: { toString(): string } }) => ({
      toString: () => `sv=2024&sig=fake&sp=${opts.permissions.toString()}`,
    }),
  ),
  BlobSASPermissions: { parse: vi.fn((p: string) => ({ toString: () => p })) },
  SASProtocol: { HttpsAndHttp: "https,http" },
}));

// ---------------------------------------------------------------------------
// Azure identity (managed identity) mock
// ---------------------------------------------------------------------------
vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi
    .fn()
    .mockImplementation((opts?: { managedIdentityClientId?: string }) => ({
      _kind: "DefaultAzureCredential",
      managedIdentityClientId: opts?.managedIdentityClientId,
    })),
}));

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  presignPut,
  presignGet,
  putObject,
  newMediaKey,
  ensureBucket,
  checkStorage,
  _resetClientForTest,
} from "./storage";

function clearAzureEnv() {
  delete process.env.AZURE_STORAGE_ACCOUNT;
  delete process.env.AZURE_STORAGE_CONTAINER;
  delete process.env.AZURE_STORAGE_KEY;
  delete process.env.AZURE_CLIENT_ID;
}

function setAzureEnv() {
  process.env.AZURE_STORAGE_ACCOUNT = "myacct";
  process.env.AZURE_STORAGE_CONTAINER = "media";
  process.env.AZURE_STORAGE_KEY = Buffer.from("supersecretkey").toString("base64");
}

/** Managed-identity mode: account + container, NO account key. */
function setAzureIdentityEnv() {
  process.env.AZURE_STORAGE_ACCOUNT = "myacct";
  process.env.AZURE_STORAGE_CONTAINER = "media";
  delete process.env.AZURE_STORAGE_KEY;
  process.env.AZURE_CLIENT_ID = "mi-client-id";
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetClientForTest();
  // Reset env vars
  process.env.S3_BUCKET = "project50-media";
  process.env.S3_ENDPOINT = "http://localhost:9000";
  process.env.S3_ACCESS_KEY = "minioadmin";
  process.env.S3_SECRET_KEY = "minioadmin";
  // Default to the S3 backend; Azure tests opt in explicitly.
  clearAzureEnv();
});

describe("getClient (singleton / env fallbacks)", () => {
  it("reuses the same client instance on second call (singleton)", async () => {
    // Call presignPut twice — should reuse client
    await presignPut("k1", "image/png");
    await presignPut("k2", "image/jpeg");
    // S3Client constructor should only be called once
    const { S3Client } = await import("@aws-sdk/client-s3");
    // Each _resetClientForTest in beforeEach clears it, so first call here creates one
    expect(vi.mocked(S3Client)).toHaveBeenCalledTimes(1);
  });

  it("uses default env values when S3_ENDPOINT/KEY/SECRET are undefined", async () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    delete process.env.S3_BUCKET;
    // This should not throw — covers the ?? fallback branches
    await presignPut("k", "image/png");
  });
});

describe("ensureBucket — httpStatusCode=404 path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetClientForTest();
    process.env.S3_BUCKET = "project50-media";
  });

  it("creates bucket when error has $metadata.httpStatusCode=404 with no name", async () => {
    // Covers line 72: ?.$metadata?.httpStatusCode === 404
    const errWithStatus = Object.assign(new Error("Not Found"), {
      name: "SomeOtherError",
      $metadata: { httpStatusCode: 404 },
    });
    mockSend
      .mockRejectedValueOnce(errWithStatus)
      .mockResolvedValueOnce({});
    await ensureBucket();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

describe("newMediaKey", () => {
  it("returns media/<userId>/<suffix>.<ext>", () => {
    expect(newMediaKey("user123", "jpg", "abc123")).toBe("media/user123/abc123.jpg");
  });

  it("is pure — same inputs return same output", () => {
    const k1 = newMediaKey("u1", "png", "suf");
    const k2 = newMediaKey("u1", "png", "suf");
    expect(k1).toBe(k2);
  });

  it("handles different extensions", () => {
    expect(newMediaKey("u1", "webp", "s")).toBe("media/u1/s.webp");
    expect(newMediaKey("u1", "jpeg", "s")).toBe("media/u1/s.jpeg");
  });
});

describe("presignPut", () => {
  it("calls getSignedUrl with a PutObjectCommand carrying the right Bucket/Key/ContentType", async () => {
    const { uploadUrl } = await presignPut("media/u1/img.jpg", "image/jpeg");
    expect(uploadUrl).toBe("https://signed");
    expect(getSignedUrl).toHaveBeenCalledOnce();
    const [, cmd] = (getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, { Bucket?: string; Key?: string; ContentType?: string }];
    expect(cmd.Bucket).toBe("project50-media");
    expect(cmd.Key).toBe("media/u1/img.jpg");
    expect(cmd.ContentType).toBe("image/jpeg");
  });

  it("returns the signed URL from getSignedUrl", async () => {
    (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce("https://put-url");
    const { uploadUrl } = await presignPut("some/key", "image/png");
    expect(uploadUrl).toBe("https://put-url");
  });

  it("returns uploadHeaders with ONLY content-type for the S3 backend", async () => {
    const { uploadHeaders } = await presignPut("some/key", "image/webp");
    expect(uploadHeaders).toEqual({ "content-type": "image/webp" });
    // No Azure-specific header on the S3 path (byte-identical behavior).
    expect(uploadHeaders["x-ms-blob-type"]).toBeUndefined();
  });
});

describe("presignGet", () => {
  it("calls getSignedUrl with a GetObjectCommand carrying the right Bucket/Key", async () => {
    const url = await presignGet("media/u1/img.jpg");
    expect(url).toBe("https://signed");
    expect(getSignedUrl).toHaveBeenCalledOnce();
    const [, cmd] = (getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, { Bucket?: string; Key?: string }];
    expect(cmd.Bucket).toBe("project50-media");
    expect(cmd.Key).toBe("media/u1/img.jpg");
  });

  it("returns the signed URL from getSignedUrl", async () => {
    (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce("https://get-url");
    const url = await presignGet("some/key");
    expect(url).toBe("https://get-url");
  });
});

describe("putObject", () => {
  it("calls ensureBucket (HeadBucket) before sending PutObjectCommand", async () => {
    // HeadBucket for ensureBucket, then PutObject
    mockSend
      .mockResolvedValueOnce({}) // HeadBucket OK (bucket exists)
      .mockResolvedValueOnce({}); // PutObject OK
    const body = Buffer.from("mp4-bytes");
    await putObject("media/u1/recap-DAY-abc.mp4", body, "video/mp4");
    expect(mockSend).toHaveBeenCalledTimes(2);
    // First call must be HeadBucket (from ensureBucket)
    const [headCmd] = mockSend.mock.calls[0] as [{ _type?: string }];
    expect(headCmd._type).toBe("HeadBucket");
    // Second call must be PutObject
    const [putCmd] = mockSend.mock.calls[1] as [{ _type?: string; Bucket?: string; Key?: string; Body?: Buffer; ContentType?: string }];
    expect(putCmd._type).toBe("PutObject");
    expect(putCmd.Bucket).toBe("project50-media");
    expect(putCmd.Key).toBe("media/u1/recap-DAY-abc.mp4");
    expect(putCmd.Body).toBe(body);
    expect(putCmd.ContentType).toBe("video/mp4");
  });

  it("creates the bucket when missing, then uploads (fresh-storage scenario)", async () => {
    // Simulates CI where bucket doesn't exist yet: HeadBucket 404, CreateBucket OK, PutObject OK
    const notFoundErr = Object.assign(new Error("Not Found"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    mockSend
      .mockRejectedValueOnce(notFoundErr) // HeadBucket → bucket missing
      .mockResolvedValueOnce({})          // CreateBucket OK
      .mockResolvedValueOnce({});         // PutObject OK
    const body = Buffer.from("recap-bytes");
    const result = await putObject("media/u1/recap.mp4", body, "video/mp4");
    expect(result).toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("sends a PutObjectCommand with the correct Bucket, Key, Body, and ContentType", async () => {
    // HeadBucket succeeds (bucket exists), then PutObject
    mockSend
      .mockResolvedValueOnce({}) // HeadBucket OK
      .mockResolvedValueOnce({}); // PutObject OK
    const body = Buffer.from("mp4-bytes");
    await putObject("media/u1/recap-DAY-abc.mp4", body, "video/mp4");
    const [putCmd] = mockSend.mock.calls[1] as [{ Bucket?: string; Key?: string; Body?: Buffer; ContentType?: string }];
    expect(putCmd.Bucket).toBe("project50-media");
    expect(putCmd.Key).toBe("media/u1/recap-DAY-abc.mp4");
    expect(putCmd.Body).toBe(body);
    expect(putCmd.ContentType).toBe("video/mp4");
  });

  it("resolves to undefined on success", async () => {
    mockSend
      .mockResolvedValueOnce({}) // HeadBucket OK
      .mockResolvedValueOnce({}); // PutObject OK
    const result = await putObject("media/u1/f.mp4", Buffer.from("x"), "video/mp4");
    expect(result).toBeUndefined();
  });

  it("propagates S3 errors from PutObject", async () => {
    mockSend
      .mockResolvedValueOnce({})                        // HeadBucket OK
      .mockRejectedValueOnce(new Error("Access Denied")); // PutObject fails
    await expect(putObject("media/u1/f.mp4", Buffer.from("x"), "video/mp4")).rejects.toThrow("Access Denied");
  });
});

describe("ensureBucket", () => {
  it("does nothing when HeadBucket succeeds (bucket already exists)", async () => {
    mockSend.mockResolvedValueOnce({}); // HeadBucket OK
    await ensureBucket();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("creates bucket when HeadBucket returns 404", async () => {
    const notFoundErr = Object.assign(new Error("Not Found"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    mockSend
      .mockRejectedValueOnce(notFoundErr) // HeadBucket fails
      .mockResolvedValueOnce({}); // CreateBucket OK
    await ensureBucket();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("swallows BucketAlreadyOwnedByYou on create", async () => {
    const notFoundErr = Object.assign(new Error("Not Found"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    const alreadyOwned = Object.assign(new Error("Already owned"), {
      name: "BucketAlreadyOwnedByYou",
    });
    mockSend
      .mockRejectedValueOnce(notFoundErr)
      .mockRejectedValueOnce(alreadyOwned);
    await expect(ensureBucket()).resolves.toBeUndefined();
  });

  it("swallows BucketAlreadyExists on create", async () => {
    const notFoundErr = Object.assign(new Error("Not Found"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    const alreadyExists = Object.assign(new Error("Already exists"), {
      name: "BucketAlreadyExists",
    });
    mockSend
      .mockRejectedValueOnce(notFoundErr)
      .mockRejectedValueOnce(alreadyExists);
    await expect(ensureBucket()).resolves.toBeUndefined();
  });

  it("rethrows unexpected HeadBucket errors", async () => {
    const unexpectedErr = Object.assign(new Error("Access denied"), {
      name: "AccessDenied",
    });
    mockSend.mockRejectedValueOnce(unexpectedErr);
    await expect(ensureBucket()).rejects.toThrow("Access denied");
  });

  it("rethrows unexpected CreateBucket errors", async () => {
    const notFoundErr = Object.assign(new Error("Not Found"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    const createErr = Object.assign(new Error("Create failed"), {
      name: "InternalError",
    });
    mockSend
      .mockRejectedValueOnce(notFoundErr)
      .mockRejectedValueOnce(createErr);
    await expect(ensureBucket()).rejects.toThrow("Create failed");
  });

  it("creates bucket when Code is NoSuchBucket", async () => {
    const noSuchBucketErr = Object.assign(new Error("No Such Bucket"), {
      name: "NoSuchBucket",
    });
    mockSend
      .mockRejectedValueOnce(noSuchBucketErr)
      .mockResolvedValueOnce({}); // CreateBucket OK
    await ensureBucket();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("creates bucket when error uses Code property (not name) for 404", async () => {
    // Covers the `.Code` branch on line 67
    const errWithCode = Object.assign(new Error("Not Found"), {
      name: undefined as unknown as string,
      Code: "NotFound",
    });
    mockSend
      .mockRejectedValueOnce(errWithCode)
      .mockResolvedValueOnce({});
    await ensureBucket();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("swallows BucketAlreadyOwnedByYou using Code property", async () => {
    // Covers the `.Code` branch on line 80
    const notFoundErr = Object.assign(new Error("Not Found"), { name: "NotFound" });
    const alreadyOwned = Object.assign(new Error("Already owned"), {
      name: undefined as unknown as string,
      Code: "BucketAlreadyOwnedByYou",
    });
    mockSend
      .mockRejectedValueOnce(notFoundErr)
      .mockRejectedValueOnce(alreadyOwned);
    await expect(ensureBucket()).resolves.toBeUndefined();
  });
});

describe("checkStorage (readiness probe)", () => {
  it("returns true when the bucket HEAD succeeds", async () => {
    mockSend.mockResolvedValueOnce({});
    await expect(checkStorage()).resolves.toBe(true);
    // HeadBucket was the command issued
    const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
    expect(vi.mocked(HeadBucketCommand)).toHaveBeenCalledWith({ Bucket: "project50-media" });
  });

  it("returns false when the bucket HEAD throws (storage unreachable)", async () => {
    mockSend.mockRejectedValueOnce(new Error("connection refused"));
    await expect(checkStorage()).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Azure Blob backend (env-selected; @azure/storage-blob mocked)
// ---------------------------------------------------------------------------
describe("Azure Blob backend", () => {
  beforeEach(() => {
    setAzureEnv();
  });

  describe("env selection", () => {
    it("does NOT use Azure when only some vars are set (S3 path stays active)", async () => {
      // Container missing → neither shared-key nor managed-identity mode
      // qualifies, so the default S3 path stays active.
      delete process.env.AZURE_STORAGE_KEY;
      delete process.env.AZURE_STORAGE_CONTAINER;
      await presignPut("media/u1/img.jpg", "image/jpeg");
      // S3 presigner used, not Azure SAS
      expect(getSignedUrl).toHaveBeenCalledOnce();
      const { generateBlobSASQueryParameters } = await import("@azure/storage-blob");
      expect(vi.mocked(generateBlobSASQueryParameters)).not.toHaveBeenCalled();
    });
  });

  describe("presignPut → Blob SAS URL", () => {
    it("returns a SAS URL with create+write perms scoped to the blob", async () => {
      const { uploadUrl: url, uploadHeaders } = await presignPut("media/u1/img.jpg", "image/jpeg");
      expect(getSignedUrl).not.toHaveBeenCalled();
      expect(url).toContain("https://acct.blob.core.windows.net/cont/media/u1/img.jpg");
      expect(url).toContain("?sv=2024");
      // Azure Put Blob requires the blob-type header in addition to content-type.
      expect(uploadHeaders).toEqual({
        "content-type": "image/jpeg",
        "x-ms-blob-type": "BlockBlob",
      });
      // racw permission requested for upload
      const { generateBlobSASQueryParameters, BlobSASPermissions } = await import(
        "@azure/storage-blob"
      );
      expect(vi.mocked(BlobSASPermissions.parse)).toHaveBeenCalledWith("racw");
      const [opts] = vi.mocked(generateBlobSASQueryParameters).mock.calls[0] as unknown as [
        { containerName: string; blobName: string; expiresOn: Date; startsOn: Date },
      ];
      expect(opts.containerName).toBe("media");
      expect(opts.blobName).toBe("media/u1/img.jpg");
      // 5-minute (PRESIGN_EXPIRY) validity window
      expect(opts.expiresOn.getTime() - opts.startsOn.getTime()).toBe(10 * 60 * 1000);
      // Shared-key mode signs with the StorageSharedKeyCredential — NOT a
      // user-delegation key — so the service is never asked for one.
      const [, cred] = vi.mocked(generateBlobSASQueryParameters).mock
        .calls[0] as unknown as [unknown, { account?: string }];
      expect(cred.account).toBe("myacct");
      expect(azureGetUserDelegationKey).not.toHaveBeenCalled();
    });
  });

  describe("presignGet → Blob SAS URL", () => {
    it("returns a read-only SAS URL scoped to the blob", async () => {
      const url = await presignGet("media/u1/img.jpg");
      expect(getSignedUrl).not.toHaveBeenCalled();
      expect(url).toContain("https://acct.blob.core.windows.net/cont/media/u1/img.jpg");
      const { BlobSASPermissions } = await import("@azure/storage-blob");
      expect(vi.mocked(BlobSASPermissions.parse)).toHaveBeenCalledWith("r");
    });
  });

  describe("client lazy-init / singletons", () => {
    it("constructs the BlobServiceClient and credential once across calls", async () => {
      await presignPut("a", "image/png");
      await presignGet("b");
      const { BlobServiceClient, StorageSharedKeyCredential } = await import(
        "@azure/storage-blob"
      );
      expect(vi.mocked(BlobServiceClient)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(StorageSharedKeyCredential)).toHaveBeenCalledTimes(1);
      // Account endpoint built from AZURE_STORAGE_ACCOUNT
      expect(vi.mocked(BlobServiceClient).mock.calls[0]?.[0]).toBe(
        "https://myacct.blob.core.windows.net",
      );
    });
  });

  describe("putObject → block blob upload", () => {
    it("ensures the container then uploads the buffer with content type", async () => {
      const body = Buffer.from("recap-bytes");
      const result = await putObject("media/u1/recap.mp4", body, "video/mp4");
      expect(result).toBeUndefined();
      expect(azureCreateIfNotExists).toHaveBeenCalledOnce();
      expect(getBlockBlobClient).toHaveBeenCalledWith("media/u1/recap.mp4");
      expect(azureUpload).toHaveBeenCalledWith(body, body.length, {
        blobHTTPHeaders: { blobContentType: "video/mp4" },
      });
      // S3 path untouched
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("propagates upload errors", async () => {
      azureUpload.mockRejectedValueOnce(new Error("AuthorizationFailure"));
      await expect(
        putObject("media/u1/f.mp4", Buffer.from("x"), "video/mp4"),
      ).rejects.toThrow("AuthorizationFailure");
    });
  });

  describe("ensureBucket → container ensure", () => {
    it("creates the container if missing via createIfNotExists", async () => {
      await ensureBucket();
      expect(azureCreateIfNotExists).toHaveBeenCalledOnce();
      expect(getContainerClient).toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("checkStorage → container probe", () => {
    it("returns true when the container exists() probe succeeds", async () => {
      await expect(checkStorage()).resolves.toBe(true);
      expect(azureExists).toHaveBeenCalledOnce();
    });

    it("returns false when the container probe throws", async () => {
      azureExists.mockRejectedValueOnce(new Error("network down"));
      await expect(checkStorage()).resolves.toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Azure managed-identity backend (user-delegation SAS; no account key)
// ---------------------------------------------------------------------------
describe("Azure managed-identity backend (user-delegation SAS)", () => {
  beforeEach(() => {
    setAzureIdentityEnv();
  });

  describe("mode selection", () => {
    it("uses identity mode (account + container, NO key): SAS, no S3, no account-key credential", async () => {
      await presignGet("media/u1/img.jpg");
      expect(getSignedUrl).not.toHaveBeenCalled();
      const { StorageSharedKeyCredential, generateBlobSASQueryParameters } =
        await import("@azure/storage-blob");
      // No account-key credential is ever constructed.
      expect(vi.mocked(StorageSharedKeyCredential)).not.toHaveBeenCalled();
      // A user-delegation key was fetched and SAS was generated.
      expect(azureGetUserDelegationKey).toHaveBeenCalledOnce();
      expect(vi.mocked(generateBlobSASQueryParameters)).toHaveBeenCalledOnce();
    });

    it("builds the BlobServiceClient with DefaultAzureCredential pinned to AZURE_CLIENT_ID", async () => {
      await presignGet("media/u1/img.jpg");
      const { DefaultAzureCredential } = await import("@azure/identity");
      const { BlobServiceClient } = await import("@azure/storage-blob");
      expect(vi.mocked(DefaultAzureCredential)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(DefaultAzureCredential).mock.calls[0]?.[0]).toEqual({
        managedIdentityClientId: "mi-client-id",
      });
      // Endpoint built from the account; second ctor arg is the credential.
      expect(vi.mocked(BlobServiceClient).mock.calls[0]?.[0]).toBe(
        "https://myacct.blob.core.windows.net",
      );
      const cred = vi.mocked(BlobServiceClient).mock.calls[0]?.[1] as {
        _kind?: string;
      };
      expect(cred._kind).toBe("DefaultAzureCredential");
    });

    it("passes managedIdentityClientId=undefined when AZURE_CLIENT_ID is unset", async () => {
      delete process.env.AZURE_CLIENT_ID;
      await presignGet("media/u1/img.jpg");
      const { DefaultAzureCredential } = await import("@azure/identity");
      expect(vi.mocked(DefaultAzureCredential).mock.calls[0]?.[0]).toEqual({
        managedIdentityClientId: undefined,
      });
    });
  });

  describe("presignPut → user-delegation SAS URL", () => {
    it("signs a create+write SAS with the user-delegation key and account name", async () => {
      const { uploadUrl: url, uploadHeaders } = await presignPut("media/u1/img.jpg", "image/jpeg");
      expect(getSignedUrl).not.toHaveBeenCalled();
      expect(url).toContain(
        "https://acct.blob.core.windows.net/cont/media/u1/img.jpg",
      );
      expect(url).toContain("?sv=2024");
      // Managed-identity mode still returns the Azure PUT headers.
      expect(uploadHeaders).toEqual({
        "content-type": "image/jpeg",
        "x-ms-blob-type": "BlockBlob",
      });
      const { generateBlobSASQueryParameters, BlobSASPermissions } =
        await import("@azure/storage-blob");
      expect(vi.mocked(BlobSASPermissions.parse)).toHaveBeenCalledWith("racw");
      const [opts, cred, account] = vi.mocked(generateBlobSASQueryParameters)
        .mock.calls[0] as unknown as [
        { containerName: string; blobName: string; expiresOn: Date; startsOn: Date },
        { value?: string },
        string,
      ];
      expect(opts.containerName).toBe("media");
      expect(opts.blobName).toBe("media/u1/img.jpg");
      // 5-minute (PRESIGN_EXPIRY) validity window
      expect(opts.expiresOn.getTime() - opts.startsOn.getTime()).toBe(
        10 * 60 * 1000,
      );
      // Signed with the user-delegation key + account name (3-arg overload).
      expect(cred.value).toBe("delegation-key-value");
      expect(account).toBe("myacct");
    });
  });

  describe("presignGet → user-delegation SAS URL", () => {
    it("signs a read-only SAS with the user-delegation key", async () => {
      const url = await presignGet("media/u1/img.jpg");
      expect(url).toContain(
        "https://acct.blob.core.windows.net/cont/media/u1/img.jpg",
      );
      const { BlobSASPermissions } = await import("@azure/storage-blob");
      expect(vi.mocked(BlobSASPermissions.parse)).toHaveBeenCalledWith("r");
      expect(azureGetUserDelegationKey).toHaveBeenCalledOnce();
    });
  });

  describe("user-delegation key caching", () => {
    it("fetches the key once and reuses it across multiple presigns", async () => {
      await presignPut("a", "image/png");
      await presignGet("b");
      await presignPut("c", "image/jpeg");
      // Key fetched once, reused for all three SAS signings.
      expect(azureGetUserDelegationKey).toHaveBeenCalledOnce();
      const { generateBlobSASQueryParameters } = await import(
        "@azure/storage-blob"
      );
      expect(vi.mocked(generateBlobSASQueryParameters)).toHaveBeenCalledTimes(3);
      // BlobServiceClient + credential built once (lazy singletons).
      const { BlobServiceClient } = await import("@azure/storage-blob");
      const { DefaultAzureCredential } = await import("@azure/identity");
      expect(vi.mocked(BlobServiceClient)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(DefaultAzureCredential)).toHaveBeenCalledTimes(1);
    });

    it("requests a key valid for ~1h on first fetch", async () => {
      await presignGet("a");
      const [startsOn, expiresOn] = azureGetUserDelegationKey.mock
        .calls[0] as unknown as [Date, Date];
      expect(expiresOn.getTime() - startsOn.getTime()).toBe(60 * 60 * 1000);
    });

    it("refreshes the key once it is near expiry", async () => {
      const realNow = Date.now;
      const base = 1_700_000_000_000;
      try {
        // First presign at t=base → fetch key #1 (expires at base + 1h).
        Date.now = () => base;
        await presignGet("a");
        expect(azureGetUserDelegationKey).toHaveBeenCalledTimes(1);

        // Advance to within the 5-min refresh skew of expiry → refetch.
        Date.now = () => base + 60 * 60 * 1000 - 4 * 60 * 1000;
        await presignGet("b");
        expect(azureGetUserDelegationKey).toHaveBeenCalledTimes(2);
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe("putObject → block blob upload (identity client)", () => {
    it("ensures the container then uploads via the credential-based client", async () => {
      const body = Buffer.from("recap-bytes");
      await putObject("media/u1/recap.mp4", body, "video/mp4");
      expect(azureCreateIfNotExists).toHaveBeenCalledOnce();
      expect(getBlockBlobClient).toHaveBeenCalledWith("media/u1/recap.mp4");
      expect(azureUpload).toHaveBeenCalledWith(body, body.length, {
        blobHTTPHeaders: { blobContentType: "video/mp4" },
      });
      const { DefaultAzureCredential } = await import("@azure/identity");
      expect(vi.mocked(DefaultAzureCredential)).toHaveBeenCalledTimes(1);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("ensureBucket / checkStorage (identity client)", () => {
    it("creates the container via createIfNotExists", async () => {
      await ensureBucket();
      expect(azureCreateIfNotExists).toHaveBeenCalledOnce();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("probes the container via exists() and never signs SAS", async () => {
      await expect(checkStorage()).resolves.toBe(true);
      expect(azureExists).toHaveBeenCalledOnce();
      expect(azureGetUserDelegationKey).not.toHaveBeenCalled();
    });

    it("returns false when the container probe throws", async () => {
      azureExists.mockRejectedValueOnce(new Error("identity denied"));
      await expect(checkStorage()).resolves.toBe(false);
    });
  });
});
