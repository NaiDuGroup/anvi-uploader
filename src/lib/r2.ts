import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Local dev: uploads go to `.local-uploads` via `/api/upload-url` PUT, not to R2. */
export function isLocalObjectStorage(): boolean {
  return process.env.R2_ACCOUNT_ID === "local-dev";
}

export function getObjectStorageBucket(): string {
  return process.env.AWS_S3_BUCKET || process.env.R2_BUCKET_NAME || "print-uploads";
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

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getObjectStorageBucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 600 });
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getObjectStorageBucket(),
    Key: key,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
}
