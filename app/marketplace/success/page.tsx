'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type State = 'confirming' | 'success' | 'error';

function SuccessContent() {
  const searchParams = useSearchParams();
  const skillId    = searchParams.get('skill_id');
  const skillSlug  = searchParams.get('skill_slug');
  const txHash     = searchParams.get('tx');
  const wallet     = searchParams.get('wallet');
  const amountUsdc = searchParams.get('amount');
  const network    = searchParams.get('network') ?? 'solana';
  const reference  = searchParams.get('reference');

  const [state, setState] = useState<State>('confirming');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agentos_token') : null;
      if (!token) { if (!cancelled) { setState('error'); setErrorMsg('Not signed in. Please sign in — your payment is safe.'); } return; }
      if (!skillId || !txHash || !wallet || !amountUsdc || !reference) {
        if (!cancelled) { setState('error'); setErrorMsg('Missing payment details. Contact support with your transaction hash.'); }
        return;
      }
      try {
        const res = await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ txHash, wallet, amountUsdc, network, skillId, reference }),
        });
        const data = await res.json();
        if (!cancelled) {
          if (res.ok) setState('success');
          else { setState('error'); setErrorMsg(data.error ?? 'Activation failed. Contact support.'); }
        }
      } catch {
        if (!cancelled) { setState('error'); setErrorMsg('Network error. Your payment may have gone through — contact support.'); }
      }
    }

    void confirm();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="absolute top-0 left-0 right-0 px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 12px rgba(124,58,237,0.4)' }}>A</div>
          <span className="font-mono font-bold text-sm">Agent<span className="gradient-text">OS</span></span>
        </Link>
        <Link href="/marketplace" className="text-sm" style={{ color: 'var(--text-muted)' }}>Marketplace</Link>
      </div>

      <div className="w-full max-w-md text-center">
        {state === 'confirming' && (
          <div>
            <div className="w-16 h-16 rounded-2xl mx-auto mb-6 animate-pulse"
              style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }} />
            <h1 className="text-2xl font-black mb-2">Activating skill...</h1>
            <p style={{ color: 'var(--text-muted)' }}>Verifying your payment on-chain.</p>
          </div>
        )}

        {state === 'success' && (
          <div>
            <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl"
              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>✓</div>
            <h1 className="text-2xl font-black mb-2">Skill activated</h1>
            <p className="mb-8" style={{ color: 'var(--text-muted)' }}>Ready to use. Go to your dashboard to start calling it.</p>
            <div className="flex flex-col gap-3">
              <Link href="/dashboard" className="btn-primary px-8 py-3 text-sm font-semibold">Go to Dashboard →</Link>
              {skillSlug && <Link href={`/marketplace/${skillSlug}`} className="btn-outline px-8 py-3 text-sm">Back to skill</Link>}
            </div>
          </div>
        )}

        {state === 'error' && (
          <div>
            <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>✕</div>
            <h1 className="text-2xl font-black mb-2">Something went wrong</h1>
            <p className="mb-6 text-sm" style={{ color: '#fca5a5' }}>{errorMsg}</p>
            <div className="flex flex-col gap-3">
              <Link href="/dashboard" className="btn-primary px-8 py-3 text-sm">Dashboard</Link>
              <Link href="/marketplace" className="btn-outline px-8 py-3 text-sm">Marketplace</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-12 h-12 rounded-xl animate-pulse"
          style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }} />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
