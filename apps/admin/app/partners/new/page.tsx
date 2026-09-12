import { Container } from '@colina/ui';
import { PartnerForm } from '@/components/partner-form';

export const metadata = {
  title: 'New partner — Colina Admin',
};

export default function NewPartnerPage() {
  return (
    <main>
      <Container className="max-w-2xl py-10">
        <PartnerForm mode="create" />
      </Container>
    </main>
  );
}
