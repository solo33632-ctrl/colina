import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Card, Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import { LeadBadge, leadKindTone, leadStatusTone } from '@/components/lead-badges';
import { LeadDeleteButton } from '@/components/lead-delete-button';
import { LeadStatusForm } from '@/components/lead-status-form';
import { intlLocale, relativeTime } from '@/lib/format';
import { isLeadStatus, type LeadStatus } from '@/lib/lead-status';
import { quoteMachineSlug, type LeadKind } from '@/lib/leads-query';
import { sectionMetadata } from '@/lib/metadata';
import { normalizeWhatsappNumber } from '@/lib/whatsapp';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Leads', 'heading');
}

type Props = {
  params: Promise<{ kind: string; id: string }>;
};

type LeadDetail = {
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  machineModel: string | null;
  message: string;
  status: LeadStatus;
  createdAt: Date;
  /** A maintenance row whose machine reference is a real catalogue slug. */
  quote: boolean;
};

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-stone-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-stone-900">{value}</dd>
    </div>
  );
}

export default async function LeadDetailPage({ params }: Props) {
  const { kind, id } = await params;
  if (kind !== 'contact' && kind !== 'maintenance') {
    notFound();
  }

  // Separate branches (not a shared union): each row type only exposes its
  // own fields, so TypeScript narrows each fetch independently.
  let lead: LeadDetail;
  if (kind === 'contact') {
    const row = await prisma.contactMessage.findUnique({ where: { id } });
    if (!row) {
      notFound();
    }
    lead = {
      name: row.name,
      company: null,
      phone: row.phone,
      email: row.email,
      machineModel: null,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt,
      quote: false,
    };
  } else {
    const row = await prisma.maintenanceRequest.findUnique({ where: { id } });
    if (!row) {
      notFound();
    }
    // A quote is a maintenance row that names a machine page. The slug is
    // checked against the catalogue so a hand-typed "Line 2 (old)" is not
    // misclassified; the list uses the same rule, so both views agree.
    const slug = quoteMachineSlug(row.machineModel);
    const machine = slug
      ? await prisma.machine.findUnique({
          where: { slug },
          select: { id: true },
        })
      : null;
    lead = {
      name: row.name,
      company: row.company,
      phone: row.phone,
      email: row.email,
      machineModel: row.machineModel,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt,
      quote: machine !== null,
    };
  }

  const locale = await getLocale();
  const intl = intlLocale(locale);
  const t = await getTranslations('Leads');
  const common = await getTranslations('Common');

  const badgeKind: LeadKind = lead.quote ? 'quote' : kind;
  const status = isLeadStatus(lead.status) ? lead.status : null;
  const fullDate = lead.createdAt.toLocaleString(intl, {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const received = relativeTime(lead.createdAt, locale) ?? t('justNow');

  // Display-only links: the visitor's own text is never interpreted, and the
  // digits a wa.me link takes come from the same normalizer the settings form
  // uses. An invalid or local-only number simply gets no WhatsApp button.
  const phoneHref = lead.phone
    ? `tel:${lead.phone.replace(/[^\d+]/g, '')}`
    : null;
  const whatsapp = lead.phone ? normalizeWhatsappNumber(lead.phone) : null;
  const whatsappHref =
    whatsapp?.ok && whatsapp.value ? `https://wa.me/${whatsapp.value}` : null;

  const fields: { label: string; value: ReactNode }[] = [];
  if (lead.company) {
    fields.push({ label: t('form.company'), value: lead.company });
  }
  if (lead.phone && phoneHref) {
    fields.push({
      label: t('form.phone'),
      value: (
        <a
          href={phoneHref}
          dir="ltr"
          className="rounded text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {lead.phone}
        </a>
      ),
    });
  }
  if (lead.email) {
    fields.push({
      label: t('form.email'),
      value: (
        <a
          href={`mailto:${lead.email}`}
          dir="ltr"
          className="break-all rounded text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {lead.email}
        </a>
      ),
    });
  }
  if (lead.machineModel) {
    fields.push({ label: t('form.machineModel'), value: lead.machineModel });
  }
  fields.push({
    label: t('table.received'),
    value: (
      <time dateTime={lead.createdAt.toISOString()} title={fullDate}>
        {fullDate}
      </time>
    ),
  });

  return (
    <main>
      <Container className="max-w-4xl py-10">
        <Link
          href="/leads"
          className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t('detail.back')}
        </Link>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <LeadBadge tone={leadKindTone(badgeKind)}>
              {t(`kinds.${badgeKind}`)}
            </LeadBadge>
            {status ? (
              <LeadBadge tone={leadStatusTone(status)}>
                {t(`statuses.${status}`)}
              </LeadBadge>
            ) : null}
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold text-stone-900">
            {lead.name}
          </h1>
          {lead.company ? (
            <p className="mt-1 break-words text-sm text-stone-500">
              {lead.company}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-stone-500">
            {t('table.received')}:{' '}
            <time
              dateTime={lead.createdAt.toISOString()}
              title={fullDate}
              className="text-stone-600"
            >
              {received}
            </time>
            <span aria-hidden="true"> · </span>
            <span className="text-stone-600">{fullDate}</span>
          </p>

          {whatsappHref || phoneHref || lead.email ? (
            <div
              role="group"
              aria-label={t('detail.contactHeading')}
              className="mt-4 flex flex-wrap gap-2"
            >
              {whatsappHref ? (
                <Button
                  href={whatsappHref}
                  size="sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('actions.whatsapp')}
                </Button>
              ) : null}
              {phoneHref ? (
                <Button href={phoneHref} size="sm" variant="secondary">
                  {t('actions.call')}
                </Button>
              ) : null}
              {lead.email ? (
                <Button
                  href={`mailto:${lead.email}`}
                  size="sm"
                  variant="secondary"
                >
                  {t('actions.email')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            <Card>
              <h2 className="text-sm font-semibold text-stone-900">
                {common('details')}
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <DetailField label={t('form.name')} value={lead.name} />
                {fields.map((field) => (
                  <DetailField
                    key={field.label}
                    label={field.label}
                    value={field.value}
                  />
                ))}
              </dl>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-stone-900">
                {t('form.message')}
              </h2>
              {/* Visitor input: a text node only, never HTML. `pre-line`
                  preserves the line breaks the form accepted. */}
              <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-stone-800">
                {lead.message}
              </p>
            </Card>
          </div>

          <Card className="h-fit">
            <LeadStatusForm
              kind={kind}
              leadId={id}
              currentStatus={lead.status}
            />
            <div className="mt-6 border-t border-stone-200 pt-5">
              <LeadDeleteButton kind={kind} id={id} itemName={lead.name} />
            </div>
          </Card>
        </div>
      </Container>
    </main>
  );
}
