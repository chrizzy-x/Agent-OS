import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'AgentOS — One command. Every task, end to end.',
  description: 'Super AgentOS understands your goal, plans the work, uses the right capabilities and delivers the finished result.',
  openGraph: {
    title: 'AgentOS — One command. Every task, end to end.',
    description: 'Super AgentOS understands your goal, plans the work, uses the right capabilities and delivers the finished result.',
    url: '/',
    type: 'website',
    images: [{ url: '/agentos-landing-hero.webp', width: 600, height: 600, alt: 'AgentOS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentOS — One command. Every task, end to end.',
    description: 'Super AgentOS understands your goal, plans the work, uses the right capabilities and delivers the finished result.',
    images: ['/agentos-landing-hero.webp'],
  },
};

export default function Page() {
  return <LandingPage />;
}
