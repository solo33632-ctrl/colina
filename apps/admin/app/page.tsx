import { Card, Container } from '@colina/ui';

export default function AdminHomePage() {
  return (
    <main>
      <Container className="py-16">
        <Card
          title="Colina Admin"
          description="Internal admin panel. Content management arrives in later phases."
        />
      </Container>
    </main>
  );
}
