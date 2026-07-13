'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { COMMAND_DEMOS } from './constants';

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <path d="M6.5 15.5 15.5 6.5M8.5 6.5h7v7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
    </svg>
  );
}

export default function CommandDemonstration({ entryHref }: { entryHref: string }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [typedText, setTypedText] = useState('');
  const [rippling, setRippling] = useState(false);
  const navigationTimer = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setTypedText(COMMAND_DEMOS[0]);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    let commandIndex = 0;

    function schedule(callback: () => void, delay: number) {
      const timer = window.setTimeout(callback, delay);
      timers.push(timer);
    }

    function typeCommand(text: string, position: number) {
      if (cancelled) return;
      setTypedText(text.slice(0, position));
      if (position < text.length) {
        schedule(() => typeCommand(text, position + 1), 42);
        return;
      }
      schedule(() => deleteCommand(text, text.length), 1600);
    }

    function deleteCommand(text: string, position: number) {
      if (cancelled) return;
      setTypedText(text.slice(0, position));
      if (position > 0) {
        schedule(() => deleteCommand(text, position - 1), 22);
        return;
      }
      commandIndex = (commandIndex + 1) % COMMAND_DEMOS.length;
      schedule(() => typeCommand(COMMAND_DEMOS[commandIndex], 0), 250);
    }

    schedule(() => typeCommand(COMMAND_DEMOS[0], 0), 1800);

    return () => {
      cancelled = true;
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [reducedMotion]);

  useEffect(() => {
    return () => {
      if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
    };
  }, []);

  const openAgentOS = () => {
    if (rippling) return;
    setRippling(true);
    navigationTimer.current = window.setTimeout(() => {
      router.push(entryHref);
    }, reducedMotion ? 0 : 390);
  };

  return (
    <div className={`agentos-command-demo ${rippling ? 'is-submitting' : ''}`}>
      <p className="agentos-sr-only">
        Command examples show Super AgentOS receiving a goal, planning execution, using workspace capabilities and delivering a finished result.
      </p>
      <div className="agentos-command-shell agentos-liquid-glass">
        <span className="agentos-command-ripple" aria-hidden="true" />
        <span className="agentos-command-energy" aria-hidden="true" />
        <div className="agentos-command-text" aria-hidden="true">
          <span>{typedText || '\u00A0'}</span>
          {!reducedMotion ? <i className="agentos-command-cursor" /> : null}
        </div>
        <button type="button" className="agentos-command-submit" aria-label="Open AgentOS" onClick={openAgentOS}>
          <ArrowIcon />
        </button>
      </div>
    </div>
  );
}
