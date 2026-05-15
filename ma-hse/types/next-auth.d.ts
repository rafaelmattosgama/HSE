import { RoleCode } from "@prisma/client";
import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      language: string;
      mustChangePassword: boolean;
      plantRoles: {
        plantId: string;
        plantCode: string;
        role: RoleCode;
        canSeeClinical: boolean;
      }[];
    };
  }

  interface User {
    id: string;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    mustChangePassword?: boolean;
  }
}
