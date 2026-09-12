import argon2 from 'argon2';
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@colina/db';
import { getClientIp, LOGIN_RATE_LIMIT, rateLimitCheck } from './rate-limit';
import { loginInputSchema } from './schemas';

// Generic failure — never reveal whether the email exists (agent.md:
// no account-enumeration via error messages).
const GENERIC_FAILURE = 'Invalid email or password.';

export const authOptions: NextAuthOptions = {
  // No public self-registration exists or will ever exist: admin accounts
  // are created via seed / future admin tooling only (Phase 10+).
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        // Credential-stuffing defense: throttle attempts per IP before
        // touching argon2 (which is deliberately expensive). `req.headers`
        // here is a plain record (RequestInternal), not Fetch Headers —
        // getClientIp handles both shapes.
        const ip = getClientIp(req?.headers);
        if (rateLimitCheck(`login:${ip}`, LOGIN_RATE_LIMIT) > 0) {
          // Same generic failure: a throttled attacker must not be able
          // to distinguish "wrong password" from "rate limited". The warn
          // line is the operator-visible signal (server log only).
          console.warn(`[auth] login rate-limited for ip ${ip}`);
          throw new Error(GENERIC_FAILURE);
        }

        const parsed = loginInputSchema({
          email: GENERIC_FAILURE,
          password: GENERIC_FAILURE,
        }).safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.adminUser.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) {
          return null;
        }

        // argon2.verify resolves boolean (true = match). No timing
        // games beyond this: misses cost one hash either way.
        const ok = await argon2.verify(user.passwordHash, parsed.data.password);
        if (!ok) {
          return null;
        }

        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
  session: {
    // JWT sessions: standard for the Credentials provider (no DB adapter).
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      // `user` is present only at sign-in: copy the DB role onto the
      // token once, then it rides along on every request.
      if (user && 'role' in user) {
        token.role = user.role as typeof token.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      if (session.user && token.role) {
        session.user.role = token.role;
      }
      return session;
    },
  },
};

// Server-component helper: `const session = await getAdminSession()`.
export function getAdminSession() {
  return getServerSession(authOptions);
}
