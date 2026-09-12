import Link from 'next/link';
import { prisma } from '@colina/db';
import { Button, Card, Container } from '@colina/ui';

export const metadata = {
  title: 'Categories — Colina Admin',
};

export default async function CategoriesPage() {
  const categories = await prisma.machineCategory.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { machines: true } } },
  });

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">Categories</h1>
          <Button href="/categories/new" size="sm">
            New category
          </Button>
        </div>
        {categories.length === 0 ? (
          <Card className="mt-6" description="No categories yet." />
        ) : (
          <ul className="mt-6 grid gap-4">
            {categories.map((category) => (
              <li key={category.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {category.nameEn}
                      </p>
                      <p className="text-sm text-stone-500">
                        {category.slug} · {category._count.machines}{' '}
                        {category._count.machines === 1
                          ? 'machine'
                          : 'machines'}
                      </p>
                    </div>
                    <Link
                      href={`/categories/${category.id}/edit`}
                      className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      Edit
                    </Link>
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
