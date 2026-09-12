import { prisma } from '@colina/db';
import { Button, Card, Container } from '@colina/ui';

export const metadata = {
  title: 'Machines — Colina Admin',
};

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function MachinesPage({ searchParams }: Props) {
  const { category: categoryFilter } = await searchParams;
  const [categories, machines] = await Promise.all([
    prisma.machineCategory.findMany({ orderBy: { nameEn: 'asc' } }),
    prisma.machine.findMany({
      where: categoryFilter ? { categoryId: categoryFilter } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { category: { select: { nameEn: true } } },
    }),
  ]);

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">Machines</h1>
          <Button href="/machines/new" size="sm">
            New machine
          </Button>
        </div>
        <form method="get" className="mt-6 flex items-end gap-3">
          <div>
            <label
              htmlFor="machine-category-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              Filter by category
            </label>
            <select
              id="machine-category-filter"
              name="category"
              defaultValue={categoryFilter ?? ''}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nameEn}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
        </form>
        {machines.length === 0 ? (
          <Card className="mt-6" description="No machines yet." />
        ) : (
          <ul className="mt-6 grid gap-4">
            {machines.map((machine) => (
              <li key={machine.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {machine.nameEn}
                      </p>
                      <p className="text-sm text-stone-500">
                        {machine.slug} · {machine.category.nameEn}
                      </p>
                    </div>
                    <a
                      href={`/machines/${machine.id}/edit`}
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
