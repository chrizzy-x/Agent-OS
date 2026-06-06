import { Button, EmptyState } from '@/components/os/ui';

export default function NotFound() {
  return <EmptyState title="App not found" body="This app does not exist or is no longer available." action={<Button href="/appstore">Back to App Store</Button>} />;
}
