import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getObjectStorageBucket(kind),
    Key: key,
    ContentType: contentType,
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
