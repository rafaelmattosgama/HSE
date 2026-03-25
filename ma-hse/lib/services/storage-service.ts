import { S3Client, HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export const StorageService = {
  client: s3,
  async checkBucketReady() {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  },
  async getPresignedUploadUrl(input: {
    key: string;
    contentType: string;
    expiresInSec?: number;
  }) {
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      ContentType: input.contentType,
    });

    const url = await getSignedUrl(s3, command, {
      expiresIn: input.expiresInSec ?? 600,
    });

    return {
      bucket: env.S3_BUCKET,
      key: input.key,
      uploadUrl: url,
    };
  },
};