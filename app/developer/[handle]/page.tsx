import { notFound } from 'next/navigation';
import DeveloperProfilePage from '@/components/pages/DeveloperProfilePage';
import { getPublicDeveloperProfile } from '@/src/developers/service';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const developer = await getPublicDeveloperProfile(handle);
  if (!developer) notFound();
  return <DeveloperProfilePage developer={omitAgentIdentifierFields(developer) as typeof developer} />;
}
