import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { prisma } from '@colina/db';
import {
  getClientIp,
  PASSWORD_RESET_RATE_LIMIT,
  rateLimitCheck,
} from '@/lib/rate-limit';
import { resetPasswordInputSchema } from '@/lib/schemas';

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

  // Same tight bucket as forgot-password: tokens are unguessable (256-bit)
  // so this is volumetric-abuse protection, not brute-force defense.
  const retryAfter = rateLimitCheck(
    `reset:${getClientIp(req.headers)}`,
    PASSWORD_RESET_RATE_LIMIT
  );
  if (retryAfter > 0) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const parsed = resetPasswordInputSchema({
    token: 'This reset link is invalid or expired.',
    password: 'Password must be at least 12 characters.',
  }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_failed' },
      { status: 400 }
    );
  }

  // Match on the stored hash, never the raw token — and only while the
  // token is still inside its 1-hour window.
  const tokenHash = createHash('sha256')
    .update(parsed.data.token)
    .digest('hex');
  const user = await prisma.adminUser.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: { gt: new Date() },
    },
  });
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'invalid_token' },
      { status: 400 }
    );
  }

  // Rotate the credential and burn the token in one write: the old
  // password stops working here, and the link cannot be reused.
  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      passwordHash: await argon2.hash(parsed.data.password),
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
