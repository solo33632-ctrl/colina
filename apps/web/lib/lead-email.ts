// Lead notification email (nodemailer + the SMTP_* / CONTACT_NOTIFY_TO
// vars from `.env.example`). Best-effort by design: routes call this
// AFTER the row is saved, and a `false` result only gets logged — a
// failed notification must never fail the visitor's submission.

import nodemailer from 'nodemailer';

export type LeadEmail = {
  subject: string;
  text: string;
};

export async function sendLeadNotification({
  subject,
  text,
}: LeadEmail): Promise<boolean> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, CONTACT_NOTIFY_TO } =
    process.env;

  if (!SMTP_HOST || !CONTACT_NOTIFY_TO) {
    console.warn(
      '[lead-email] SMTP_HOST or CONTACT_NOTIFY_TO is missing — skipping notification.'
    );
    return false;
  }

  try {
    const port = Number(SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: SMTP_USER
        ? { user: SMTP_USER, pass: SMTP_PASSWORD ?? '' }
        : undefined,
    });
    await transporter.sendMail({
      from: SMTP_USER ?? 'website@localhost',
      to: CONTACT_NOTIFY_TO,
      subject,
      text,
    });
    return true;
  } catch (error) {
    console.error('[lead-email] sending failed:', error);
    return false;
  }
}
