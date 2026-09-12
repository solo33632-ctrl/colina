// Generic SMTP sender for the admin app (nodemailer + the SMTP_* vars
// from `.env.example`). Kept separate from apps/web's lead-specific
// helper on purpose: that one always notifies CONTACT_NOTIFY_TO, this one
// takes an explicit recipient (password-reset links). ~15 lines of
// transporter setup overlap; the contracts differ.
//
// Best-effort like its sibling: returns false (logged) instead of
// throwing, so callers decide how a mail failure affects their response.

import nodemailer from 'nodemailer';

export type AdminEmail = {
  to: string;
  subject: string;
  text: string;
};

export async function sendAdminEmail({
  to,
  subject,
  text,
}: AdminEmail): Promise<boolean> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;

  if (!SMTP_HOST) {
    console.warn('[admin-mail] SMTP_HOST is missing — skipping email.');
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
      from: SMTP_USER ?? 'admin@localhost',
      to,
      subject,
      text,
    });
    return true;
  } catch (error) {
    console.error('[admin-mail] sending failed:', error);
    return false;
  }
}
