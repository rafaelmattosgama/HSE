import { z } from "zod";

const productionRequiredValues = {
  NEXTAUTH_SECRET: "dev-secret-1234567890",
  TOKEN_PEPPER: "dev-pepper-1234567890123456",
  DATABASE_URL: "postgresql://ehs:ehs@localhost:5433/ehs",
  S3_ACCESS_KEY: "minio",
  S3_SECRET_KEY: "minio123",
  NEXTAUTH_URL: "http://localhost:3000",
  APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
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
    APP_ENV: z.enum(["development", "production"]).default("development"),
    DEPLOY_VERSION: z.string().trim().min(1).optional(),
    APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
    NEXTAUTH_URL_INTERNAL: z.string().url().optional(),
    NEXTAUTH_SECRET: z.string().min(16).default(productionRequiredValues.NEXTAUTH_SECRET),
    DATABASE_URL: z.string().url().default(productionRequiredValues.DATABASE_URL),
    REDIS_URL: z.string().url().default("redis://localhost:6380"),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default("EHS <noreply@ehs.local>"),
    AGENT_ENABLED: z
      .string()
      .optional()
      .transform((value) => value === "true"),
    AGENT_MOCK_MODE: z
      .string()
      .optional()
      .transform((value) => value === "true"),
    AGENT_RATE_LIMIT_ENABLED: z
      .string()
      .optional()
      .transform((value) => value !== "false"),
    AGENT_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    AGENT_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20),
    AGENT_MAX_MESSAGE_CHARS: z.coerce.number().int().positive().default(4000),
    AGENT_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    AGENT_MAX_TOOL_CALLS: z.coerce.number().int().positive().default(8),
    AGENT_MAX_OUTPUT_CHARS: z.coerce.number().int().positive().default(4000),
    OPENAI_API_KEY: z.string().optional(),
    TRANSLATION_PROVIDER: z.enum(["openai", "disabled"]).default("openai"),
    OPENAI_AGENT_MODEL: z.string().default("gpt-5.4-mini"),
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
    AUTH_LOGIN_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(5),
    AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(60),
    AUTH_LOGIN_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(3),
    TOKEN_PEPPER: z.string().min(16).default(productionRequiredValues.TOKEN_PEPPER),
    SEED_DEFAULT_PASSWORD: z.string().default("ChangeMe123!"),
    N0_ADMIN_EMAIL: z.string().email().optional(),
    N0_PLANT_CODE: z.string().optional(),
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
