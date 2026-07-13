'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { COMMAND_DEMOS, STATUS_DEMOS } from './constants';

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

export default function CommandDemonstration({ entryHref }: { entryHref: string }) {
  const reducedMotion = useReducedMotion();
  const [typedText, setTypedText] = useState('');
  const [statusIndex, setStatusIndex] = useState(0);
  const [statusVisible, setStatusVisible] = useState(true);

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
        schedule(() => typeCommand(text, position + 1), 44);
        return;
      }
      schedule(() => deleteCommand(text, text.length), 1500);
    }

    function deleteCommand(text: string, position: number) {
      if (cancelled) return;
      setTypedText(text.slice(0, position));
      if (position > 0) {
        schedule(() => deleteCommand(text, position - 1), 24);
        return;
      }
      commandIndex = (commandIndex + 1) % COMMAND_DEMOS.length;
      schedule(() => typeCommand(COMMAND_DEMOS[commandIndex], 0), 120);
    }

    schedule(() => typeCommand(COMMAND_DEMOS[0], 0), 1600);

    return () => {
      cancelled = true;
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      setStatusVisible(true);
      setStatusIndex(0);
      return;
    }

    let transitionTimer = 0;
    const interval = window.setInterval(() => {
      setStatusVisible(false);
      transitionTimer = window.setTimeout(() => {
        setStatusIndex(index => (index + 1) % STATUS_DEMOS.length);
        setStatusVisible(true);
      }, 210);
    }, 1500);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(transitionTimer);
    };
  }, [reducedMotion]);

  const visibleStatus = reducedMotion
    ? { label: 'Ready to enter AgentOS', color: '#28B36F' }
    : STATUS_DEMOS[statusIndex];

  return (
    <div className="agentos-command-demo">
      <p className="agentos-sr-only">
        Command demonstration examples show Super AgentOS receiving a goal, planning execution, using capabilities and delivering the result.
      </p>
      <div className="agentos-command-shell">
        <div className="agentos-command-text" aria-hidden="true">
          <span>{typedText || '\u00A0'}</span>
          {!reducedMotion ? <i className="agentos-command-cursor" /> : null}
        </div>
        <Link href={entryHref} className="agentos-command-submit" aria-label="Open AgentOS">
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div
        className={`agentos-status-indicator ${statusVisible ? 'visible' : 'hidden'}`}
        style={{ '--status-color': visibleStatus.color } as React.CSSProperties}
        aria-hidden="true"
      >
        <span />
        <strong>{visibleStatus.label}</strong>
      </div>
    </div>
  );
}
