'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession } from '@/src/auth/browser-session';

type VaultSecret = {
  id: string;
  name: string;
  maskedValue: string;
  status: string;
  version: number;
  updatedAt: string;
};

export default function VaultPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [form, setForm] = useState({ name: '', value: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch('/api/vault', { cache: 'no-store' });
    const data = await res.json();
    setSecrets(res.ok ? data.secrets ?? [] : []);
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      const session = await fetchBrowserSession();
      if (!active) return;
      if (!session) {
        router.replace('/signin');
        return;
      }
      await load();
      if (active) setLoading(false);
    }
    void bootstrap();
    return () => { active = false; };
  }, [router]);

  async function saveSecret() {
    if (!form.name.trim() || !form.value || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, value: form.value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? 'Failed to save secret.');
        return;
      }
      setForm({ name: '', value: '' });
      setMessage('Secret saved. Plaintext was not returned.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSecret(secretId: string) {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`/api/vault?secretId=${encodeURIComponent(secretId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? 'Failed to delete secret.');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/vault" />
      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Secrets Vault</div>
          <h1 style={{ color: 'var(--text-primary)', margin: '8px 0', fontSize: '28px' }}>Workspace credentials</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>Secrets are encrypted at rest and never returned after creation.</p>
        </div>

        <section style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)', padding: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, .6fr) minmax(220px, 1fr) auto', gap: '10px' }} className="vault-form">
            <input className="input-dark" value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value.toUpperCase() }))} placeholder="OPENAI_API_KEY" />
            <input className="input-dark" value={form.value} onChange={event => setForm(prev => ({ ...prev, value: event.target.value }))} placeholder="Secret value" type="password" />
            <button type="button" className="btn-primary" disabled={busy || !form.name || !form.value} onClick={() => void saveSecret()}>Save</button>
          </div>
          {message && <p style={{ color: message.includes('Failed') ? '#fca5a5' : '#86efac', margin: '12px 0 0', fontSize: '13px' }}>{message}</p>}
        </section>

        <section style={{ border: '1px solid var(--border)', background: 'var(--border)', display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {secrets.map(secret => (
            <div key={secret.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px 90px', gap: '12px', alignItems: 'center', padding: '16px 18px', background: 'var(--bg-secondary)' }} className="vault-row">
              <div>
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{secret.name}</strong>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>{secret.maskedValue} · v{secret.version} · {secret.status}</div>
              </div>
              <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{new Date(secret.updatedAt).toLocaleDateString()}</span>
              <button type="button" className="btn-outline" disabled={busy} onClick={() => void deleteSecret(secret.id)} style={{ fontSize: '12px', padding: '7px 10px' }}>Delete</button>
            </div>
          ))}
          {secrets.length === 0 && (
            <div style={{ padding: '48px 24px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', textAlign: 'center' }}>No secrets stored.</div>
          )}
        </section>
      </main>
      <style>{`
        @media (max-width: 720px) {
          .vault-form, .vault-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
