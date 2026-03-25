import pino from "pino";
import { env } from "@/lib/env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
          },
        },
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function withRequestContext(context: Record<string, unknown>) {
  return logger.child(context);
}