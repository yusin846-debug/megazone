import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";

export function ssoConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_WORKSPACE_DOMAIN);
}

export function createAuth(client = db, provider: "postgresql" | "sqlite" = "postgresql") {
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required");
  return betterAuth({
    appName: "egg is going",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(client, { provider }),
    user: { modelName: "authUser", additionalFields: { appUserId: { type: "string", required: false, input: false } } },
    account: { modelName: "authAccount", accountLinking: { enabled: true, trustedProviders: ["google"] } },
    verification: { modelName: "authVerification" },
    session: { modelName: "authSession", expiresIn: 60 * 60 * 24, updateAge: 60 * 60 },
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
    socialProviders: ssoConfigured() ? {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        hd: process.env.GOOGLE_WORKSPACE_DOMAIN!, prompt: "select_account", disableSignUp: true,
      },
    } : {},
    rateLimit: {
      enabled: true, storage: "database", modelName: "authRateLimit",
      window: 60, max: 100, customRules: { "/sign-in/email": { window: 60, max: 10 } },
    },
    advanced: { database: { joins: true }, ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
    databaseHooks: {
      session: { create: { before: async session => {
        const identity = await client.authUser.findUnique({ where: { id: session.userId }, select: { appUserId: true, email: true } });
        if (!identity?.appUserId || (identity.email.endsWith("@egg.test") && process.env.EGG_DEMO_LOGIN !== "true")) return false;
      } } },
    },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }
