'use client';

import { Drawer } from '@/components/os/overlays';
import CodeStudioPanel from '@/components/studio/CodeStudioPanel';
import NLStudioPanel from '@/components/studio/NLStudioPanel';
import StudioContextDrawer from '@/components/studio/StudioContextDrawer';
import { useStudio } from '@/components/studio/StudioProvider';
import StudioSidebar from '@/components/studio/StudioSidebar';
import StudioTopbar from '@/components/studio/StudioTopbar';

export default function StudioShell() {
  const { loading, browserSession, mode, sidebarOpen, setSidebarOpen } = useStudio();

  if (!browserSession && !loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 520, padding: 24, textAlign: 'center' }}>
          <h1 style={{ marginTop: 0 }}>Sign in to open Studio</h1>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="studio-shell">
        <aside className="studio-sidebar-desktop">
          <StudioSidebar />
        </aside>
        <section className="studio-main">
          <StudioTopbar />
          <div style={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
            {mode === 'code' ? <CodeStudioPanel /> : <NLStudioPanel />}
          </div>
        </section>
      </div>

      <Drawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title="Studio"
        description="Chats, projects, apps, and skills"
        size="md"
      >
        <StudioSidebar />
      </Drawer>
      <StudioContextDrawer />

      <style>{`
        .studio-shell {
          height: 100vh;
          height: 100dvh;
          min-height: 100vh;
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          overflow: hidden;
        }

        .studio-sidebar-desktop {
          border-right: 1px solid var(--border);
          background: rgba(255,255,255,0.02);
        }

        .studio-main {
          min-width: 0;
          min-height: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .studio-mobile-only {
          display: none !important;
        }

        .studio-code-layout {
          min-height: 0;
          height: 100%;
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr) 240px;
        }

        .studio-code-files,
        .studio-code-editor,
        .studio-code-terminal {
          min-width: 0;
          min-height: 0;
        }

        .studio-code-files {
          grid-row: 1 / span 2;
          border-right: 1px solid var(--border);
          padding: 18px;
          overflow: auto;
        }

        .studio-code-editor {
          display: flex;
          flex-direction: column;
        }

        .studio-code-terminal {
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 1024px) {
          .studio-shell {
            grid-template-columns: minmax(0, 1fr);
          }

          .studio-sidebar-desktop {
            display: none;
          }

          .studio-mobile-only {
            display: inline-flex !important;
          }

          .studio-code-layout {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: 240px minmax(0, 1fr) 220px;
          }

          .studio-code-files {
            grid-row: auto;
            border-right: none;
            border-bottom: 1px solid var(--border);
          }
        }
      `}</style>
    </div>
  );
}
