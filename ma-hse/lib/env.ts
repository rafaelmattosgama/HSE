import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(16).default("dev-secret-1234567890"),
  DATABASE_URL: z.string().url().default("postgresql://ehs:ehs@localhost:5433/ehs"),
  REDIS_URL: z.string().url().default("redis://localhost:6380"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("EHS <noreply@ehs.local>"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().default("minio"),
  S3_SECRET_KEY: z.string().default("minio123"),
  S3_BUCKET: z.string().default("ehs-attachments"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(60),
  TOKEN_PEPPER: z.string().min(16).default("dev-pepper-1234567890123456"),
  SEED_DEFAULT_PASSWORD: z.string().default("ChangeMe123!"),
});

export const env = envSchema.parse(process.env);
