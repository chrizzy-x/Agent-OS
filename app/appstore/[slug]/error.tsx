'use client';

import { Button, ErrorState } from '@/components/os/ui';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="App detail error" body="This app detail could not be loaded." action={<Button onClick={() => reset()}>Retry</Button>} />;
}
