import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

export type ShellNavItem = {
  href?: string;
  label: string;
  subtitle?: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string;
  locked?: boolean;
};

export function AppShell(props: {
  activePath?: string;
  sidebar?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={['os-app-shell', props.className ?? ''].filter(Boolean).join(' ')}
      data-has-sidebar={props.sidebar ? 'true' : 'false'}
      data-has-aside={props.aside ? 'true' : 'false'}
    >
      {props.sidebar ? <aside className="os-shell-sidebar">{props.sidebar}</aside> : null}
      <main className="os-shell-main">{props.children}</main>
      {props.aside ? <aside className="os-shell-aside">{props.aside}</aside> : null}
    </div>
  );
}

export function SidebarSection(props: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="os-sidebar-section">
      <div className="os-sidebar-title">{props.title}</div>
      <div className="os-sidebar-stack">{props.children}</div>
      {props.footer ? <div className="os-sidebar-footer">{props.footer}</div> : null}
    </section>
  );
}

export function SidebarNav(props: { items: ShellNavItem[] }) {
  return (
    <nav className="os-sidebar-nav" aria-label="Section navigation">
      {props.items.map(item => {
        const content = (
          <>
            <span className="os-sidebar-label">{item.label}</span>
            {item.subtitle ? <span className="os-sidebar-subtitle">{item.subtitle}</span> : null}
            {item.badge ? <span className="os-sidebar-badge">{item.badge}</span> : null}
          </>
        );
        if (item.locked) {
          return (
            <span key={`${item.href ?? item.label}-locked`} className="os-sidebar-link locked" aria-disabled="true">
              {content}
            </span>
          );
        }
        if (item.href) {
          return (
            <Link key={`${item.href}-${item.label}`} href={item.href} className={`os-sidebar-link${item.active ? ' active' : ''}`}>
              {content}
            </Link>
          );
        }
        return (
          <button key={item.label} type="button" onClick={item.onClick} className={`os-sidebar-link${item.active ? ' active' : ''}`}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="os-page-header">
      <div>
        {props.eyebrow ? <div className="os-eyebrow">{props.eyebrow}</div> : null}
        <h1 className="os-page-title">{props.title}</h1>
        {props.subtitle ? <p className="os-page-subtitle">{props.subtitle}</p> : null}
      </div>
      {props.actions ? <div className="os-page-actions">{props.actions}</div> : null}
    </header>
  );
}

export function Card(props: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={`os-card ${props.className ?? ''}`.trim()} style={props.style}>{props.children}</section>;
}

export function MetricCard(props: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="os-metric-card">
      <div className="os-metric-label">{props.label}</div>
      <div className="os-metric-value">{props.value}</div>
      {props.hint ? <div className="os-metric-hint">{props.hint}</div> : null}
    </Card>
  );
}

export function Button(props: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  className?: string;
}) {
  const className = `os-button ${props.variant ?? 'primary'} ${props.className ?? ''}`.trim();
  if (props.href) {
    return <Link href={props.href} className={className}>{props.children}</Link>;
  }
  return (
    <button type={props.type ?? 'button'} onClick={props.onClick} disabled={props.disabled} className={className}>
      {props.children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`os-input ${props.className ?? ''}`.trim()} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`os-textarea ${props.className ?? ''}`.trim()} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`os-select ${props.className ?? ''}`.trim()} />;
}

export function Badge(props: { children: ReactNode; tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' }) {
  return <span className={`os-badge ${props.tone ?? 'default'}`}>{props.children}</span>;
}

export function StatusPill(props: { status: string; label?: string }) {
  const tone = props.status.toLowerCase();
  const className = tone.includes('fail') || tone.includes('error')
    ? 'danger'
    : tone.includes('pending') || tone.includes('draft') || tone.includes('warning')
      ? 'warning'
      : tone.includes('public') || tone.includes('active') || tone.includes('verified') || tone.includes('success')
        ? 'success'
        : tone.includes('sdk') || tone.includes('external')
          ? 'accent'
          : 'default';
  return <Badge tone={className}>{props.label ?? props.status}</Badge>;
}

export function Tabs(props: {
  tabs: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="os-tabs" role="tablist">
      {props.tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={props.active === tab.key}
          className={`os-tab${props.active === tab.key ? ' active' : ''}`}
          onClick={() => props.onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState(props: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="os-empty-state">
      <div className="os-empty-title">{props.title}</div>
      <div className="os-empty-body">{props.body}</div>
      {props.action ? <div className="os-empty-action">{props.action}</div> : null}
    </Card>
  );
}

export function LoadingState(props: { label?: string }) {
  return (
    <Card className="os-loading-state">
      <div className="os-loading-bar" />
      <div className="os-loading-bar short" />
      <div className="os-loading-copy">{props.label ?? 'Loading'}</div>
    </Card>
  );
}

export function ErrorState(props: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="os-error-state">
      <div className="os-empty-title">{props.title}</div>
      <div className="os-empty-body">{props.body}</div>
      {props.action ? <div className="os-empty-action">{props.action}</div> : null}
    </Card>
  );
}

export function SearchBar(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="os-search">
      <span className="os-search-icon" aria-hidden="true">/</span>
      <Input {...props} />
    </div>
  );
}

export function FilterChips(props: {
  items: string[];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="os-chip-row" role="toolbar" aria-label="Filters">
      {props.items.map(item => (
        <button
          key={item}
          type="button"
          className={`os-chip${props.active === item ? ' active' : ''}`}
          onClick={() => props.onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function DataTable(props: {
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="os-table-wrap">
      <table className="os-table">
        <thead>
          <tr>
            {props.columns.map(column => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => <td key={`cell-${rowIndex}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityFeed(props: {
  items: Array<{ id: string; title: string; subtitle?: string; status?: string; time?: string }>;
}) {
  return (
    <div className="os-feed">
      {props.items.map(item => (
        <div key={item.id} className="os-feed-item">
          <div className="os-feed-head">
            <strong>{item.title}</strong>
            {item.status ? <StatusPill status={item.status} /> : null}
          </div>
          {item.subtitle ? <div className="os-feed-subtitle">{item.subtitle}</div> : null}
          {item.time ? <div className="os-feed-time">{item.time}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function AppCard(props: {
  href?: string;
  title: string;
  description: string;
  runtime?: string;
  verified?: boolean;
  installs?: number;
  rating?: number;
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  const content = (
    <Card className="os-entity-card">
      <div className="os-entity-head">
        <div>
          <div className="os-entity-title">{props.title}</div>
          <div className="os-entity-copy">{props.description}</div>
        </div>
        <div className="os-entity-badges">
          {props.runtime ? <Badge tone="accent">{props.runtime}</Badge> : null}
          {props.verified ? <Badge tone="success">Verified</Badge> : null}
          {props.badge}
        </div>
      </div>
      <div className="os-entity-meta">
        {typeof props.rating === 'number' ? <span>{props.rating.toFixed(1)} *</span> : null}
        {typeof props.installs === 'number' ? <span>{props.installs.toLocaleString()} installs</span> : null}
      </div>
      {props.footer ? <div className="os-entity-footer">{props.footer}</div> : null}
    </Card>
  );
  if (props.href) {
    return <Link href={props.href} className="os-card-link">{content}</Link>;
  }
  return content;
}

export function SkillCard(props: {
  href: string;
  title: string;
  description: string;
  category: string;
  installs: number;
  rating?: number;
  footer?: ReactNode;
}) {
  return (
    <AppCard
      href={props.href}
      title={props.title}
      description={props.description}
      runtime={props.category}
      installs={props.installs}
      rating={props.rating}
      footer={props.footer}
    />
  );
}

export function WorkflowCard(props: {
  title: string;
  description: string;
  status: string;
  footer?: ReactNode;
}) {
  return (
    <Card className="os-entity-card">
      <div className="os-entity-head">
        <div>
          <div className="os-entity-title">{props.title}</div>
          <div className="os-entity-copy">{props.description}</div>
        </div>
        <StatusPill status={props.status} />
      </div>
      {props.footer ? <div className="os-entity-footer">{props.footer}</div> : null}
    </Card>
  );
}

export function AgentCard(props: {
  title: string;
  description: string;
  status: string;
  footer?: ReactNode;
}) {
  return <WorkflowCard title={props.title} description={props.description} status={props.status} footer={props.footer} />;
}

export function ProjectCard(props: {
  title: string;
  description: string;
  status: string;
  kind: string;
  footer?: ReactNode;
}) {
  return (
    <Card className="os-entity-card">
      <div className="os-entity-head">
        <div>
          <div className="os-entity-title">{props.title}</div>
          <div className="os-entity-copy">{props.description}</div>
        </div>
        <div className="os-entity-badges">
          <Badge>{props.kind}</Badge>
          <StatusPill status={props.status} />
        </div>
      </div>
      {props.footer ? <div className="os-entity-footer">{props.footer}</div> : null}
    </Card>
  );
}

export function SecretCard(props: {
  title: string;
  maskedValue: string;
  status: string;
  footer?: ReactNode;
}) {
  return (
    <Card className="os-entity-card">
      <div className="os-entity-head">
        <div>
          <div className="os-entity-title">{props.title}</div>
          <div className="os-entity-copy">{props.maskedValue}</div>
        </div>
        <StatusPill status={props.status} />
      </div>
      {props.footer ? <div className="os-entity-footer">{props.footer}</div> : null}
    </Card>
  );
}

export function CommandCard(props: { name: string; description: string; payload?: string }) {
  return (
    <Card className="os-command-card">
      <div className="os-entity-title">{props.name}</div>
      <div className="os-entity-copy">{props.description}</div>
      {props.payload ? <pre className="os-code-block">{props.payload}</pre> : null}
    </Card>
  );
}

export function PermissionCard(props: { title: string; description: string; required?: boolean }) {
  return (
    <Card className="os-command-card">
      <div className="os-entity-head">
        <div className="os-entity-title">{props.title}</div>
        <Badge tone={props.required ? 'warning' : 'default'}>{props.required ? 'Required' : 'Optional'}</Badge>
      </div>
      <div className="os-entity-copy">{props.description}</div>
    </Card>
  );
}
