import { z } from "zod";

const productionRequiredValues = {
  NEXTAUTH_SECRET: "dev-secret-1234567890",
  TOKEN_PEPPER: "dev-pepper-1234567890123456",
  DATABASE_URL: "postgresql://ehs:ehs@localhost:5433/ehs",
  S3_ACCESS_KEY: "minio",
  S3_SECRET_KEY: "minio123",
} as const;

function isProductionRuntime(nodeEnv: string) {
  return (
    nodeEnv === "production" &&
    process.env.ALLOW_DEV_DEFAULT_ENV !== "true" &&
    process.env.npm_lifecycle_event !== "build" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  );
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
    NEXTAUTH_SECRET: z.string().min(16).default(productionRequiredValues.NEXTAUTH_SECRET),
    DATABASE_URL: z.string().url().default(productionRequiredValues.DATABASE_URL),
    REDIS_URL: z.string().url().default("redis://localhost:6380"),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default("EHS <noreply@ehs.local>"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_TRANSLATION_MODEL: z.string().default("gpt-5.2"),
    OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
    S3_REGION: z.string().default("us-east-1"),
    S3_ACCESS_KEY: z.string().default(productionRequiredValues.S3_ACCESS_KEY),
    S3_SECRET_KEY: z.string().default(productionRequiredValues.S3_SECRET_KEY),
    S3_BUCKET: z.string().default("ehs-attachments"),
    S3_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .transform((value) => value !== "false"),
    RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(60),
    TOKEN_PEPPER: z.string().min(16).default(productionRequiredValues.TOKEN_PEPPER),
    SEED_DEFAULT_PASSWORD: z.string().default("ChangeMe123!"),
  })
  .superRefine((value, ctx) => {
    if (!isProductionRuntime(value.NODE_ENV)) return;

    for (const [key, devValue] of Object.entries(productionRequiredValues)) {
      if (value[key as keyof typeof productionRequiredValues] === devValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be explicitly configured for production`,
        });
      }
    }
  });

export const env = envSchema.parse(process.env);
