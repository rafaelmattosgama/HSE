import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
  async uploadObject(input: {
    key: string;
    contentType: string;
    body: Buffer;
  }) {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.key,
        ContentType: input.contentType,
        Body: input.body,
      }),
    );

    return {
      bucket: env.S3_BUCKET,
      key: input.key,
    };
  },
  async deleteObject(input: { key: string }) {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.key,
      }),
    );
  },
  async getObjectBuffer(input: { key: string }) {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.key,
      }),
    );

    const bytes = await response.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : Buffer.alloc(0);
  },
};
