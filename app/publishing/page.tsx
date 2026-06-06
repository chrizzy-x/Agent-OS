import { redirect } from 'next/navigation';

export default async function Page({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const params = await searchParams;
  redirect(params.slug ? `/developer/publish?slug=${encodeURIComponent(params.slug)}` : '/developer/publish');
}
