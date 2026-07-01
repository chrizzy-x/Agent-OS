import { redirect } from 'next/navigation';

export default async function Page({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const params = await searchParams;
  redirect(`/publish/app${params.slug ? `?slug=${encodeURIComponent(params.slug)}` : ''}`);
}
