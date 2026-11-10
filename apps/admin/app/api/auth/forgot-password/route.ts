import { after, NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@colina/db';
import { sendAdminEmail } from '@/lib/mail';
import {
  getClientIp,
  PASSWORD_RESET_RATE_LIMIT,
  rateLimitCheck,
} from '@/lib/rate-limit';
import { isSameOrigin } from '@/lib/request-origin';
import { forgotPasswordInputSchema } from '@/lib/schemas';

// Always answers success, whether or not the email belongs to an admin:
// distinguishing would leak account existence (agent.md). The account
// lookup, token write and email run AFTER the response (`after`), so the
// SMTP/database cost is not observable either — the search and the send
// must not become a timing oracle.
export async function POST(req: NextRequest) {
  // CSRF perimeter for a cookie-less public endpoint: a present-but-foreign
  // Origin (or no Origin at all, matching apps/web) is refused before any
  // body parsing, rate-limit accounting or account work. Generic empty 403:
  // no detail about why, no echo of the supplied origin.
  if (!isSameOrigin(req)) {
    return new NextResponse(null, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 }
    );
  }

  const parsed = forgotPasswordInputSchema({
    email: 'Enter a valid email address.',
  }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_failed' },
      { status: 400 }
    );
  }

  // Reset emails are abuse-sensitive (inbox-bombing), so this bucket is
  // tighter than login. Still generic on limit: existence stays hidden.
  const retryAfter = await rateLimitCheck(
    `forgot:${getClientIp(req.headers)}`,
    PASSWORD_RESET_RATE_LIMIT
  );
  if (retryAfter > 0) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const email = parsed.data.email;

  // Runs after the 200 is sent. Any failure here is server-log only: the
  // caller already has the same generic answer as a missing account.
  after(async () => {
    try {
      const user = await prisma.adminUser.findUnique({ where: { email } });
      if (!user) {
        return;
      }

      // 256-bit single-use token. Only its SHA-256 hash is stored — the raw
      // token travels solely inside the emailed link, expiring in 1 hour.
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await prisma.adminUser.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: tokenHash,
          passwordResetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3001';
      const link = `${base}/reset-password?token=${rawToken}`;
      await sendAdminEmail({
        to: user.email,
        subject: 'Reset your Colina admin password',
        text: [
          'A password reset was requested for your Colina admin account.',
          'If this was you, set a new password within the next hour:',
          '',
          link,
          '',
          'If you did not request this, ignore this email — your password is unchanged.',
        ].join('\n'),
      });
    } catch (error) {
      console.error('[admin] forgot-password side effect failed:', error);
    }
  });

  return NextResponse.json({ ok: true });
}
