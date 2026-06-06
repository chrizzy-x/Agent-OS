'use client';

import { Button, ErrorState } from '@/components/os/ui';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Marketplace error" body="The marketplace could not be loaded." action={<Button onClick={() => reset()}>Retry</Button>} />;
}
