import Link from 'next/link';

export default function DocsFooter() {
  return (
    <footer className="border-t border-gray-100 mt-16 py-8">
      <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
        <Link href="/" className="font-mono font-bold text-gray-900">Agent OS</Link>
        <div className="flex items-center gap-5 flex-wrap justify-center">
          <Link href="/docs" className="hover:text-gray-700">Docs</Link>
          <Link href="/docs/api" className="hover:text-gray-700">API Reference</Link>
          <Link href="/docs/launch" className="hover:text-gray-700">Launch Notes</Link>
          <Link href="/docs/audit" className="hover:text-gray-700">Audit</Link>
          <Link href="/docs/primitives" className="hover:text-gray-700">Primitives</Link>
          <Link href="/docs/skills" className="hover:text-gray-700">Skills</Link>
          <Link href="/marketplace" className="hover:text-gray-700">Marketplace</Link>
        </div>
        <span>MIT License</span>
      </div>
    </footer>
  );
}
