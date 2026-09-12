import { prisma } from '@colina/db';
import { Button, Card, Container } from '@colina/ui';

export const metadata = {
  title: 'Services — Colina Admin',
};

export default async function ServicesPage() {
  const services = await prisma.maintenanceService.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">
            Maintenance services
          </h1>
          <Button href="/services/new" size="sm">
            New service
          </Button>
        </div>
        {services.length === 0 ? (
          <Card className="mt-6" description="No services yet." />
        ) : (
          <ul className="mt-6 grid gap-4">
            {services.map((service) => (
              <li key={service.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {service.titleEn}
                      </p>
                      <p className="text-sm text-stone-500">{service.slug}</p>
                    </div>
                    <a
                      href={`/services/${service.id}/edit`}
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
