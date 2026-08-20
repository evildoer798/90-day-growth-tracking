import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import {
  authorizeCredentials,
  createSessionFromToken,
  writeClaimsToToken,
} from "@/server/auth/credentials";
import { secureCookieOverrideForUrl } from "@/server/auth/cookie-policy";

export { authorizeCredentials } from "@/server/auth/credentials";

export const authConfig = {
  providers: [
    Credentials({
      credentials: {
        employeeId: { label: "Employee ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  useSecureCookies: secureCookieOverrideForUrl(
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL,
  ),
  callbacks: {
    jwt({ token, user }) {
      if (!user?.id) {
        return token;
      }
      return writeClaimsToToken(token, {
        id: user.id,
        employeeId: user.employeeId,
        roles: user.roles,
        traineeId: user.traineeId,
        enabled: user.enabled,
      });
    },
    session({ session, token }) {
      return createSessionFromToken(session, token);
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
