import { Container } from '@colina/ui';
import { CategoryForm } from '@/components/category-form';

export const metadata = {
  title: 'New category — Colina Admin',
};

export default function NewCategoryPage() {
  return (
    <main>
      <Container className="max-w-2xl py-10">
        <CategoryForm mode="create" />
      </Container>
    </main>
  );
}
