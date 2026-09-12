import { Container } from '@colina/ui';
import { NewsForm } from '@/components/news-form';

export const metadata = {
  title: 'New post — Colina Admin',
};

export default function NewNewsPage() {
  return (
    <main>
      <Container className="max-w-2xl py-10">
        <NewsForm mode="create" />
      </Container>
    </main>
  );
}
