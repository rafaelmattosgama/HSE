import crypto from "node:crypto";
import { env } from "@/lib/env";

export function hashAccessToken(token: string): string {
  return crypto.createHash("sha256").update(`${token}:${env.TOKEN_PEPPER}`).digest("hex");
}

export function generateAccessTokenValue() {
  return crypto.randomBytes(32).toString("hex");
}