import { prisma } from '@colina/db';
import { Button, Card, Container } from '@colina/ui';

export const metadata = {
  title: 'Partners — Colina Admin',
};

export default async function PartnersPage() {
  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">Partners</h1>
          <Button href="/partners/new" size="sm">
            New partner
          </Button>
        </div>
        {partners.length === 0 ? (
          <Card className="mt-6" description="No partners yet." />
        ) : (
          <ul className="mt-6 grid gap-4">
            {partners.map((partner) => (
              <li key={partner.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {partner.nameEn}
                      </p>
                      <p className="text-sm text-stone-500">{partner.nameAr}</p>
                    </div>
                    <a
                      href={`/partners/${partner.id}/edit`}
                      className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      Edit
                    </a>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
