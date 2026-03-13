'use client';

import { useState } from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export default function CodeBlock({ code, language = 'typescript' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative rounded-lg bg-gray-950 border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-500 font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono text-gray-200 whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}
