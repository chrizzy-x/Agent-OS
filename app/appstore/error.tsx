'use client';

import { Button, ErrorState } from '@/components/os/ui';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="App Store error" body="The App Store could not be loaded." action={<Button onClick={() => reset()}>Retry</Button>} />;
}
