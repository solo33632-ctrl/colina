import argon2 from 'argon2';
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { logSecurityEvent, prisma } from '@colina/db';
import { routing } from '@/i18n/routing';
import { getClientIp, LOGIN_RATE_LIMIT, rateLimitCheck } from './rate-limit';
import { loginInputSchema } from './schemas';

// Generic failure — never reveal whether the email exists (agent.md:
// no account-enumeration via error messages).
const GENERIC_FAILURE = 'Invalid email or password.';

// How this sign-in attempt is named in the `source` column of a
// SecurityEvent row, matching the rate limiter's `login:` bucket prefix.
const SECURITY_EVENT_SOURCE = 'admin-login';

// The email a rejected attempt used, as a short string for the SecurityEvent
// row — and nothing else. next-auth hands `authorize()` the whole credential
// record, so this is built field by field on purpose: the password, and any
// future field, is never passed to the writer and can never be logged. A
// missing or malformed email is recorded as a fixed marker rather than
// stringified, so junk shapes cannot bloat the row.
function attemptedEmail(
  credentials: Partial<Record<'email' | 'password', unknown>> | undefined
) {
  const email = credentials?.email;
  if (typeof email !== 'string' || email.trim() === '') {
    return 'no valid email submitted';
  }
  return email.trim();
}

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
        const retryAfter = rateLimitCheck(`login:${ip}`, LOGIN_RATE_LIMIT);
        if (retryAfter > 0) {
          // Same generic failure: a throttled attacker must not be able
          // to distinguish "wrong password" from "rate limited". The warn
          // line is the operator-visible signal (server log only).
          //
          // This attempt is recorded as its own RATE_LIMITED row, not just
          // logged to the console: the LOGIN_FAILED rows below stop at the
          // limit, so without this a sustained brute-force run and a visitor
          // who mistyped ten times would leave identical traces, and the
          // part of the run the limiter actually stopped would be invisible.
          // `detail` follows the public endpoints' `retry-after: Ns`
          // convention. No credentials are named: this branch runs before
          // they are parsed, so there is no email to record.
          console.warn(`[auth] login rate-limited for ip ${ip}`);
          await logSecurityEvent({
            type: 'RATE_LIMITED',
            source: SECURITY_EVENT_SOURCE,
            ip,
            detail: `retry-after: ${retryAfter}s`,
          });
          throw new Error(GENERIC_FAILURE);
        }

        // Every rejection below records one LOGIN_FAILED row, with the same
        // generic answer for all three causes: what the visitor sees, the
        // server log and the database must not disagree about whether the
        // email exists, or the log itself becomes the enumeration oracle.
        // Best-effort writer, so a failed insert cannot change the answer.
        const logFailure = () =>
          logSecurityEvent({
            type: 'LOGIN_FAILED',
            source: SECURITY_EVENT_SOURCE,
            ip,
            detail: attemptedEmail(credentials),
          });

        const parsed = loginInputSchema({
          email: GENERIC_FAILURE,
          password: GENERIC_FAILURE,
        }).safeParse(credentials);
        if (!parsed.success) {
          await logFailure();
          return null;
        }

        const user = await prisma.adminUser.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) {
          await logFailure();
          return null;
        }

        // argon2.verify resolves boolean (true = match). No timing
        // games beyond this: misses cost one hash either way.
        const ok = await argon2.verify(user.passwordHash, parsed.data.password);
        if (!ok) {
          await logFailure();
          return null;
        }

        // A successful sign-in records nothing: this table is for refused
        // requests, and a success would just be noise an admin has to
        // filter past (the AuditLog side already records deliberate admin
        // activity).
        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
  session: {
    // JWT sessions: standard for the Credentials provider (no DB adapter).
    strategy: 'jwt',
  },
  pages: {
    // NextAuth's own sign-in redirect. This is a single static string, so it
    // cannot be locale-aware: it is only a last-resort fallback. The
    // locale-correct redirect for an unauthenticated page request is built
    // per-request in `proxy.ts`, and the login form navigates explicitly
    // after a successful `signIn`. The default locale is the safest fallback
    // because it is the app's primary UI language.
    signIn: `/${routing.defaultLocale}/login`,
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
