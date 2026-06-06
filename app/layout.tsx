import type { Metadata, Viewport } from 'next';
import './globals.css';
import { APP_URL } from '@/lib/config';

export const metadata: Metadata = {
  title: 'AgentOS',
  description:
    'AgentOS is your AI operating system for Studio, projects, apps, skills, memory, and Vault.',
  keywords: 'AI operating system, AgentOS, Studio, projects, apps, skills, memory, Vault',
  metadataBase: new URL(APP_URL),
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AgentOS',
  },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'AgentOS',
    description: 'The AI operating system for Studio, projects, apps, skills, memory, and Vault.',
    url: APP_URL,
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'AgentOS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentOS',
    description: 'The AI operating system for Studio, projects, apps, skills, memory, and Vault.',
    images: ['/logo.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
