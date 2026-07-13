'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import AnimatedSignalField from './AnimatedSignalField';
import { AGENTOS_HERO_ASSET, EXECUTION_NODES } from './constants';
import ExecutionNode from './ExecutionNode';

function ConnectorLines() {
  return (
    <svg className="agentos-connector-field" viewBox="0 0 1160 390" aria-hidden="true" focusable="false">
      <path className="agentos-connector-line understand" d="M255 105 C360 120 410 160 490 184" />
      <path className="agentos-connector-line plan" d="M250 292 C350 270 410 225 492 202" />
      <path className="agentos-connector-line execute" d="M905 105 C805 120 748 160 668 184" />
      <path className="agentos-connector-line deliver" d="M910 292 C810 270 750 225 668 202" />
    </svg>
  );
}

export default function LiquidGlassExecutionStage() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    if (reduced.matches || coarse.matches) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const tick = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      stage.style.setProperty('--agentos-lens-x', `${(currentX * 4).toFixed(2)}px`);
      stage.style.setProperty('--agentos-lens-y', `${(currentY * 4).toFixed(2)}px`);
      stage.style.setProperty('--agentos-logo-x', `${(currentX * 2).toFixed(2)}px`);
      stage.style.setProperty('--agentos-logo-y', `${(currentY * 2).toFixed(2)}px`);
      stage.style.setProperty('--agentos-reflect-x', `${(currentX * 6).toFixed(2)}px`);
      stage.style.setProperty('--agentos-reflect-y', `${(currentY * 6).toFixed(2)}px`);
      stage.style.setProperty('--agentos-drop-x', `${(currentX * 2.5).toFixed(2)}px`);
      stage.style.setProperty('--agentos-drop-y', `${(currentY * 2.5).toFixed(2)}px`);
      stage.style.setProperty('--agentos-signal-x', `${(currentX * 2).toFixed(2)}px`);
      stage.style.setProperty('--agentos-signal-y', `${(currentY * 2).toFixed(2)}px`);

      if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      frame = 0;
    };

    const start = () => {
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      start();
    };

    const handlePointerLeave = () => {
      targetX = 0;
      targetY = 0;
      start();
    };

    stage.addEventListener('pointermove', handlePointerMove);
    stage.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      stage.removeEventListener('pointermove', handlePointerMove);
      stage.removeEventListener('pointerleave', handlePointerLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      id="product-demo"
      ref={stageRef}
      className="agentos-logo-stage"
      aria-label="Super AgentOS execution demonstration"
      style={
        {
          '--agentos-lens-x': '0px',
          '--agentos-lens-y': '0px',
          '--agentos-logo-x': '0px',
          '--agentos-logo-y': '0px',
          '--agentos-reflect-x': '0px',
          '--agentos-reflect-y': '0px',
          '--agentos-drop-x': '0px',
          '--agentos-drop-y': '0px',
          '--agentos-signal-x': '0px',
          '--agentos-signal-y': '0px',
        } as CSSProperties
      }
    >
      <AnimatedSignalField className="agentos-signal-field-main" />
      <ConnectorLines />
      <div className="agentos-lens-caustic" aria-hidden="true" />
      <div className="agentos-glass-lens agentos-liquid-glass">
        <div className="agentos-lens-inner" aria-hidden="true" />
        <div className="agentos-lens-signal-refraction" aria-hidden="true">
          <AnimatedSignalField className="agentos-signal-field-refracted" refracted />
        </div>
        <Image
          src={AGENTOS_HERO_ASSET}
          alt="AgentOS visual identity showing a human silhouette with a multicoloured signal"
          width={600}
          height={600}
          priority
          className="agentos-hero-logo"
        />
      </div>
      {EXECUTION_NODES.map((node, index) => (
        <ExecutionNode
          key={node.title}
          title={node.title}
          body={node.body}
          tone={node.tone}
          position={node.position}
          icon={node.icon}
          index={index}
        />
      ))}
    </div>
  );
}
