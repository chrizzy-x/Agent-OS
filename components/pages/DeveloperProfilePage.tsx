import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import type { PublicDeveloperProfile } from '@/src/developers/service';

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export default function DeveloperProfilePage({ developer }: { developer: PublicDeveloperProfile }) {
  return (
    <SurfaceShell
      activePath="/developer"
      title={developer.name}
      subtitle={developer.bio ?? `Public AgentOS marketplace profile for @${developer.handle}.`}
      actions={developer.website ? <a href={developer.website} className="market-secondary-action" target="_blank" rel="noreferrer">Website</a> : undefined}
    >
      <div className="market-shell" data-surface="developer">
        <section className="market-detail-hero compact">
          <div className="market-detail-logo"><span>{developer.name.slice(0, 2).toUpperCase()}</span></div>
          <div className="market-detail-copy">
            <span className="market-developer-link">@{developer.handle}</span>
            <h2>{developer.name}</h2>
            <p>{developer.bio ?? 'No developer bio published.'}</p>
          </div>
        </section>

        <section className="market-metric-grid" aria-label="Developer metrics">
          <div><span>Apps Published</span><strong>{developer.appsPublished}</strong></div>
          <div><span>Skills Published</span><strong>{developer.skillsPublished}</strong></div>
          <div><span>Followers</span><strong>{formatCount(developer.followers)}</strong></div>
          <div><span>Total Downloads</span><strong>{formatCount(developer.totalDownloads)}</strong></div>
          <div><span>Active Users</span><strong>{formatCount(developer.totalActiveUsers)}</strong></div>
        </section>

        <section className="market-section">
          <div className="market-section-head"><h2>Apps Published</h2></div>
          {developer.apps.length ? (
            <div className="market-app-grid">
              {developer.apps.map(app => (
                <article key={app.id} className="market-app-card">
                  <Link href={`/appstore/${app.slug}`} className="market-app-card-main">
                    <div className="market-app-logo">{app.logoUrl ? <img src={app.logoUrl} alt="" /> : <span>{app.name.slice(0, 2).toUpperCase()}</span>}</div>
                    <div className="market-app-copy">
                      <h3>{app.name}</h3>
                      <p>{app.description}</p>
                    </div>
                  </Link>
                  <div className="market-app-meta">
                    <span>{app.rating > 0 ? app.rating.toFixed(1) : 'New'} rating</span>
                    <span>{formatCount(app.installCount)} installs</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="market-empty compact"><p>No public apps published.</p></div>
          )}
        </section>

        <section className="market-section">
          <div className="market-section-head"><h2>Skills Published</h2></div>
          {developer.skills.length ? (
            <div className="market-skill-grid">
              {developer.skills.map(skill => (
                <article key={skill.id} className="market-skill-card">
                  <Link href={`/skills/${skill.slug}`} className="market-skill-main">
                    <div>
                      <h3>{skill.name}</h3>
                      <p>{skill.description}</p>
                    </div>
                    <span>{skill.category}</span>
                  </Link>
                  <div className="market-skill-meta">
                    <span>{formatCount(skill.total_installs)} installs</span>
                    <span>{skill.capabilities.length} capabilities</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="market-empty compact"><p>No public skills published.</p></div>
          )}
        </section>
      </div>
    </SurfaceShell>
  );
}
