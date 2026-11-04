import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Logical bucket selector.
 *
 * - `uploads`: private order files, lifecycle-expired after a short period (e.g. 7 days).
 * - `catalog`: public, long-lived assets — catalog product photos, company logo.
 */
export type BucketKind = "uploads" | "catalog";

/** Local dev: uploads go to `.local-uploads` via `/api/upload-url` PUT, not to R2. */
export function isLocalObjectStorage(): boolean {
  return process.env.R2_ACCOUNT_ID === "local-dev";
}

/**
 * Resolve the underlying bucket name for a logical bucket kind.
 *
 * When catalog-specific env vars are not set, falls back to the main bucket
 * so single-bucket deployments keep working unchanged.
 */
export function getObjectStorageBucket(kind: BucketKind = "uploads"): string {
  const mainBucket =
    process.env.AWS_S3_BUCKET || process.env.R2_BUCKET_NAME || "print-uploads";

  if (kind === "catalog") {
    return (
      process.env.AWS_S3_CATALOG_BUCKET ||
      process.env.R2_CATALOG_BUCKET_NAME ||
      mainBucket
    );
  }
  return mainBucket;
}

function createS3Client(): S3Client {
  const awsRegion = process.env.AWS_REGION;
  const awsKey = process.env.AWS_ACCESS_KEY_ID;
  const awsSecret = process.env.AWS_SECRET_ACCESS_KEY;
  const awsBucket = process.env.AWS_S3_BUCKET;
  const useAwsS3 = Boolean(awsRegion && awsKey && awsSecret && awsBucket);

  if (useAwsS3) {
    return new S3Client({
      region: awsRegion!,
      credentials: {
        accessKeyId: awsKey!,
        secretAccessKey: awsSecret!,
      },
    });
  }

  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;

  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

let s3ClientSingleton: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3ClientSingleton) {
    s3ClientSingleton = createS3Client();
  }
  return s3ClientSingleton;
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  kind: BucketKind = "uploads",
  opts?: {
    /**
     * Exact body size in bytes. When set, `content-length` becomes a signed
     * header, so the storage rejects a PUT with a different body size.
     */
    contentLength?: number;
  },
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getObjectStorageBucket(kind),
    Key: key,
    ContentType: contentType,
    ...(opts?.contentLength !== undefined ? { ContentLength: opts.contentLength } : {}),
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 600 });
}

export async function getPresignedDownloadUrl(
  key: string,
  kind: BucketKind = "uploads",
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getObjectStorageBucket(kind),
    Key: key,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
}

/** Server-side upload (e.g. generated layout PDFs too large for Vercel response body). */
export async function putObjectBuffer(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  opts?: { contentDisposition?: string; kind?: BucketKind },
): Promise<void> {
  const kind = opts?.kind ?? "uploads";
  const command = new PutObjectCommand({
    Bucket: getObjectStorageBucket(kind),
    Key: key,
    Body: body,
    ContentType: contentType,
    ...(opts?.contentDisposition
      ? { ContentDisposition: opts.contentDisposition }
      : {}),
  });
  await getS3Client().send(command);
}

/**
 * Read the first `maxBytes` of an object (all of it when smaller) and its full
 * size. Returns null when the object no longer exists (lifecycle-expired).
 */
export async function getObjectHead(
  key: string,
  maxBytes: number,
  kind: BucketKind = "uploads",
): Promise<{ bytes: Buffer; totalSize: number } | null> {
  try {
    const res = await getS3Client().send(
      new GetObjectCommand({
        Bucket: getObjectStorageBucket(kind),
        Key: key,
        Range: `bytes=0-${Math.max(0, maxBytes - 1)}`,
      }),
    );
    const bytes = Buffer.from(await res.Body!.transformToByteArray());
    const total = /\/(\d+)$/.exec(res.ContentRange ?? "")?.[1];
    return { bytes, totalSize: total ? Number(total) : (res.ContentLength ?? bytes.byteLength) };
  } catch (error) {
    if (error instanceof NoSuchKey || (error as { name?: string })?.name === "NoSuchKey") return null;
    throw error;
  }
}

/**
 * The whole object when it is at most `maxBytes` (one HEAD, then one GET), or
 * `{ tooBig, size }` without downloading it; null when it does not exist.
 */
export async function getObjectBytesIfSmall(
  key: string,
  maxBytes: number,
  kind: BucketKind = "uploads",
): Promise<{ bytes: Buffer; size: number } | { tooBig: true; size: number } | null> {
  const bucket = getObjectStorageBucket(kind);
  try {
    const head = await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const size: number = head.ContentLength ?? 0;
    if (size > maxBytes) return { tooBig: true, size };
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = Buffer.from(await res.Body!.transformToByteArray());
    return { bytes, size: bytes.byteLength };
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (error instanceof NoSuchKey || name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}

/**
 * Server-side copy inside one logical bucket (storefront order files are moved
 * out of the lifecycle-expired `uploads/` prefix). Returns false when the
 * source object does not exist.
 */
export async function copyObject(
  sourceKey: string,
  destKey: string,
  kind: BucketKind = "uploads",
): Promise<boolean> {
  const bucket = getObjectStorageBucket(kind);
  try {
    await getS3Client().send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: destKey,
        CopySource: `${bucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
      }),
    );
    return true;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (error instanceof NoSuchKey || name === "NoSuchKey" || name === "NotFound") return false;
    throw error;
  }
}

/** Delete up to 1000 objects in one request; missing keys are not an error. */
export async function deleteObjects(keys: readonly string[], kind: BucketKind = "uploads"): Promise<void> {
  if (keys.length === 0) return;
  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: getObjectStorageBucket(kind),
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  );
}
