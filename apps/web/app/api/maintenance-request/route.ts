import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@colina/db';
import { sendLeadNotification } from '@/lib/lead-email';
import { getClientIp, rateLimitCheck } from '@/lib/rate-limit';
import { isSameOrigin } from '@/lib/request-origin';
import { HONEYPOT_FIELD, maintenanceRequestInputSchema } from '@/lib/schemas';

// Generic English messages for the API contract. The client never renders
// these — it shows its own translated banner — so they stay untranslated.
const SERVER_MESSAGES = {
  name: 'Name must be at least 2 characters.',
  email: 'Email must be a valid address or empty.',
  phone: 'Phone must be at least 6 characters.',
  message: 'Message must be at least 10 characters.',
};

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

  // Honeypot first: a filled trap means a bot. Answer success so the bot
  // can't tell it was caught — store nothing, send nothing.
  if (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Record<string, unknown>)[HONEYPOT_FIELD] === 'string' &&
    ((body as Record<string, unknown>)[HONEYPOT_FIELD] as string).trim() !== ''
  ) {
    return NextResponse.json({ ok: true });
  }

  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: 'bad_origin' },
      { status: 400 }
    );
  }

  const retryAfter = rateLimitCheck(`maintenance-request:${getClientIp(req)}`);
  if (retryAfter > 0) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // Never trust client validation alone (agent.md): re-validate here.
  const parsed = maintenanceRequestInputSchema(SERVER_MESSAGES).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_failed',
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const saved = await prisma.maintenanceRequest.create({
      data: {
        name: parsed.data.name,
        company: parsed.data.company,
        phone: parsed.data.phone,
        email: parsed.data.email,
        machineModel: parsed.data.machineModel,
        message: parsed.data.message,
        status: 'NEW',
      },
    });

    // Notification is best-effort: the row is already saved, so a mail
    // failure is logged server-side and never fails the submission.
    await sendLeadNotification({
      subject: `New maintenance request from ${saved.name}`,
      text: [
        `Name: ${saved.name}`,
        `Company: ${saved.company ?? '-'}`,
        `Phone: ${saved.phone}`,
        `Email: ${saved.email ?? '-'}`,
        `Machine/model: ${saved.machineModel ?? '-'}`,
        `Message: ${saved.message}`,
      ].join('\n'),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/maintenance-request] write failed:', error);
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      { status: 500 }
    );
  }
}
