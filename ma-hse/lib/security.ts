import crypto from "node:crypto";
import { env } from "@/lib/env";

export function hashSensitiveValue(value: string): string {
  return crypto.createHash("sha256").update(`${value}:${env.TOKEN_PEPPER}`).digest("hex");
}

export function hashAccessToken(token: string): string {
  return hashSensitiveValue(token);
}

export function generateAccessTokenValue() {
  return crypto.randomBytes(32).toString("hex");
}
