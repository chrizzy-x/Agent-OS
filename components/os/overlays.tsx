'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';

type DrawerPlacement = 'right' | 'bottom';
type DrawerSize = 'sm' | 'md' | 'lg';

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )).filter(node => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');
}

function useOverlayBehavior(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = getFocusableElements(panelRef.current);
    (focusable[0] ?? panelRef.current)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;
      const nodes = getFocusableElements(panelRef.current);
      if (nodes.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const activeIndex = nodes.findIndex(node => node === document.activeElement);
      const nextIndex = event.shiftKey
        ? (activeIndex <= 0 ? nodes.length - 1 : activeIndex - 1)
        : (activeIndex === nodes.length - 1 ? 0 : activeIndex + 1);
      event.preventDefault();
      nodes[nextIndex]?.focus();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open, panelRef]);
}

export function Drawer(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  placement?: DrawerPlacement;
  mobilePlacement?: DrawerPlacement;
  size?: DrawerSize;
  routeSafe?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  useOverlayBehavior(props.open, props.onClose, panelRef);

  if (!props.open) return null;

  return (
    <div className="os-overlay" data-open="true">
      <button type="button" className="os-overlay-backdrop" aria-label="Close drawer" onClick={props.onClose} />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={props.description ? descriptionId : undefined}
        tabIndex={-1}
        className={`os-drawer ${props.placement ?? 'right'} ${props.size ?? 'md'}`}
        data-mobile-placement={props.mobilePlacement ?? 'bottom'}
        data-route-safe={props.routeSafe ? 'true' : 'false'}
      >
        <header className="os-drawer-header">
          <div>
            <h2 id={titleId} className="os-drawer-title">{props.title}</h2>
            {props.description ? <p id={descriptionId} className="os-drawer-description">{props.description}</p> : null}
          </div>
          <button type="button" className="os-drawer-close" onClick={props.onClose} aria-label="Close drawer">Close</button>
        </header>
        <div className="os-drawer-body">{props.children}</div>
        {props.footer ? <footer className="os-drawer-footer">{props.footer}</footer> : null}
      </section>
    </div>
  );
}

export function ConfirmModal(props: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  useOverlayBehavior(props.open, props.onClose, panelRef);

  if (!props.open) return null;

  return (
    <div className="os-overlay" data-open="true">
      <button type="button" className="os-overlay-backdrop" aria-label="Close confirmation" onClick={props.onClose} />
      <section
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="os-modal"
      >
        <div className="os-modal-head">
          <h2 id={titleId} className="os-drawer-title">{props.title}</h2>
          <button type="button" className="os-drawer-close" onClick={props.onClose} aria-label="Close confirmation">Close</button>
        </div>
        <p id={bodyId} className="os-drawer-description">{props.body}</p>
        <div className="os-modal-actions">
          <button type="button" className="os-button secondary" onClick={props.onClose}>{props.cancelLabel ?? 'Cancel'}</button>
          <button
            type="button"
            className={`os-button ${props.tone === 'danger' ? 'danger' : 'primary'}`}
            onClick={props.onConfirm}
            disabled={props.busy}
          >
            {props.busy ? 'Working...' : props.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
