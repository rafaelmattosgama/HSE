import { compare } from "bcryptjs";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { RoleCode } from "@prisma/client";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import { ensureDefaultAdminUser } from "@/lib/auth/ensure-default-admin";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          logger.warn("login_attempt_missing_credentials");
          return null;
        }

        const normalizedEmail = credentials.email.trim().toLowerCase();
        await ensureDefaultAdminUser(normalizedEmail);

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user) {
          logger.warn({ email: normalizedEmail }, "login_attempt_user_not_found");
          return null;
        }

        if (!user.passwordHash) {
          logger.warn({ email: normalizedEmail, userId: user.id }, "login_attempt_no_password_hash");
          return null;
        }

        if (!user.isActive) {
          logger.warn({ email: normalizedEmail, userId: user.id }, "login_attempt_inactive_user");
          return null;
        }

        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) {
          logger.warn({ email: normalizedEmail, userId: user.id }, "login_attempt_invalid_password");
          return null;
        }

        logger.info({ email: normalizedEmail, userId: user.id }, "login_success");

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          mustChangePassword: user.forcePasswordChange,
        };
      },
    }),
    EmailProvider({
      server: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        auth: env.SMTP_USER
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
      },
      from: env.SMTP_FROM,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }

      if (typeof user?.mustChangePassword === "boolean") {
        token.mustChangePassword = user.mustChangePassword;
      }

      return token;
    },
    async session({ session, token }) {
      const userId = token.sub;
      if (!userId) {
        return session;
      }

        if (session.user) {
          session.user.id = userId;
          const [dbUser, roles] = await prisma.$transaction([
            prisma.user.findUnique({
              where: { id: userId },
              select: { name: true, forcePasswordChange: true, language: true },
            }),
          prisma.userPlantRole.findMany({
            where: { userId },
            include: {
              role: true,
              plant: true,
            },
          }),
          ]);

          session.user.name = dbUser?.name ?? session.user.name;
          session.user.language = dbUser?.language ?? "en";
          session.user.plantRoles = roles
            .filter((entry) => entry.role.code === RoleCode.N0_ADMIN || Boolean(entry.plant?.isActive))
            .map((entry) => ({
              plantId: entry.plantId,
              plantCode: entry.plant?.code ?? null,
              role: entry.role.code,
              canSeeClinical:
                entry.role.code === RoleCode.N0_ADMIN ||
                entry.role.code === RoleCode.N1_CORPORATE ||
                entry.role.code === RoleCode.N2_PLANT_MANAGER ||
                entry.role.code === RoleCode.N3_SAFETY ||
                entry.role.code === RoleCode.MEDICO,
            }));
        session.user.mustChangePassword = Boolean(dbUser?.forcePasswordChange ?? token.mustChangePassword);
      }

      return session;
    },
  },
  secret: env.NEXTAUTH_SECRET,
};
