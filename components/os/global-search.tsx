'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function GlobalSearch(props: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = query.trim();
    router.push(next ? `/search?q=${encodeURIComponent(next)}` : '/search');
  }

  return (
    <form className={['agentos-global-search', props.className ?? ''].filter(Boolean).join(' ')} onSubmit={submit} role="search">
      <span aria-hidden="true">/</span>
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Search anything..."
        aria-label="Search anything"
      />
    </form>
  );
}
