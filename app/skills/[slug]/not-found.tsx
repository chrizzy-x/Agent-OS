import { Button, EmptyState } from '@/components/os/ui';

export default function NotFound() {
  return <EmptyState title="Skill not found" body="This skill does not exist or is no longer available." action={<Button href="/skills">Back to Skill Store</Button>} />;
}
