import { Container } from '@colina/ui';
import { ServiceForm } from '@/components/service-form';

export const metadata = {
  title: 'New service — Colina Admin',
};

export default function NewServicePage() {
  return (
    <main>
      <Container className="max-w-2xl py-10">
        <ServiceForm mode="create" />
      </Container>
    </main>
  );
}
