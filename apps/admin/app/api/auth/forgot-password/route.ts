import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@colina/db';
import { sendAdminEmail } from '@/lib/mail';
import {
  getClientIp,
  PASSWORD_RESET_RATE_LIMIT,
  rateLimitCheck,
} from '@/lib/rate-limit';
import { forgotPasswordInputSchema } from '@/lib/schemas';

// Always answers success, whether or not the email belongs to an admin:
// distinguishing would leak account existence (agent.md).
export async function POST(req: NextRequest) {
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
  const retryAfter = rateLimitCheck(
    `forgot:${getClientIp(req.headers)}`,
    PASSWORD_RESET_RATE_LIMIT
  );
  if (retryAfter > 0) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const user = await prisma.adminUser.findUnique({
    where: { email: parsed.data.email },
  });

  if (user) {
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
    // Failure only logs: the response stays identical either way.
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
  }

  return NextResponse.json({ ok: true });
}
