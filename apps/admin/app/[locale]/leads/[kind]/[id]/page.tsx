import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Card, Container } from '@colina/ui';
import { LeadStatusForm } from '@/components/lead-status-form';
import { intlLocale } from '@/lib/format';
import { isLeadStatus } from '@/lib/lead-status';
import { sectionMetadata } from '@/lib/metadata';

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

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-stone-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-stone-900">
        {value}
      </dd>
    </div>
  );
}

export default async function LeadDetailPage({ params }: Props) {
  const { kind, id } = await params;
  if (kind !== 'contact' && kind !== 'maintenance') {
    notFound();
  }

  const locale = await getLocale();
  const intl = intlLocale(locale);
  const t = await getTranslations('Leads');

  // Separate branches (not a shared union): each row type only exposes
  // its own fields, so TypeScript narrows each fetch independently.
  const rows: { label: string; value: string }[] = [];
  let title = '';
  let badge = '';
  let status = '';
  let submitted = '';

  if (kind === 'contact') {
    const lead = await prisma.contactMessage.findUnique({ where: { id } });
    if (!lead) {
      notFound();
    }
    title = lead.name;
    badge = t('kinds.contact');
    status = lead.status;
    submitted = lead.createdAt.toLocaleString(intl);
    rows.push({ label: t('form.name'), value: lead.name });
    if (lead.email) {
      rows.push({ label: t('form.email'), value: lead.email });
    }
    if (lead.phone) {
      rows.push({ label: t('form.phone'), value: lead.phone });
    }
    rows.push({ label: t('form.message'), value: lead.message });
  } else {
    const lead = await prisma.maintenanceRequest.findUnique({
      where: { id },
    });
    if (!lead) {
      notFound();
    }
    title = lead.name;
    badge = t('kinds.maintenance');
    status = lead.status;
    submitted = lead.createdAt.toLocaleString(intl);
    rows.push({ label: t('form.name'), value: lead.name });
    if (lead.company) {
      rows.push({ label: t('form.company'), value: lead.company });
    }
    if (lead.email) {
      rows.push({ label: t('form.email'), value: lead.email });
    }
    rows.push({ label: t('form.phone'), value: lead.phone });
    if (lead.machineModel) {
      rows.push({ label: t('form.machineModel'), value: lead.machineModel });
    }
    rows.push({ label: t('form.message'), value: lead.message });
  }
  rows.push({ label: t('form.submitted'), value: submitted });

  return (
    <main>
      <Container className="max-w-2xl py-10">
        <p className="text-sm text-stone-500">
          {badge} · {isLeadStatus(status) ? t(`statuses.${status}`) : status}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-stone-900">{title}</h1>
        <Card className="mt-6">
          <dl className="grid gap-4">
            {rows.map((row) => (
              <Definition key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
          <LeadStatusForm kind={kind} leadId={id} currentStatus={status} />
        </Card>
      </Container>
    </main>
  );
}
