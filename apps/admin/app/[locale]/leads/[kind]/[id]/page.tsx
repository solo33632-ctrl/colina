import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Card, Container } from '@colina/ui';
import { LeadStatusForm } from '@/components/lead-status-form';

export const metadata = {
  title: 'Lead detail — Colina Admin',
};

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
    badge = 'Contact message';
    status = lead.status;
    submitted = lead.createdAt.toLocaleString('en-GB');
    rows.push({ label: 'Name', value: lead.name });
    if (lead.email) {
      rows.push({ label: 'Email', value: lead.email });
    }
    if (lead.phone) {
      rows.push({ label: 'Phone', value: lead.phone });
    }
    rows.push({ label: 'Message', value: lead.message });
  } else {
    const lead = await prisma.maintenanceRequest.findUnique({
      where: { id },
    });
    if (!lead) {
      notFound();
    }
    title = lead.name;
    badge = 'Maintenance request';
    status = lead.status;
    submitted = lead.createdAt.toLocaleString('en-GB');
    rows.push({ label: 'Name', value: lead.name });
    if (lead.company) {
      rows.push({ label: 'Company', value: lead.company });
    }
    if (lead.email) {
      rows.push({ label: 'Email', value: lead.email });
    }
    rows.push({ label: 'Phone', value: lead.phone });
    if (lead.machineModel) {
      rows.push({ label: 'Machine / model', value: lead.machineModel });
    }
    rows.push({ label: 'Message', value: lead.message });
  }
  rows.push({ label: 'Submitted', value: submitted });

  return (
    <main>
      <Container className="max-w-2xl py-10">
        <p className="text-sm text-stone-500">
          {badge} · {status}
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
