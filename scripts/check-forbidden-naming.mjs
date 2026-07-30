#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SCAN_ROOTS = [
  'components',
  'app',
  'src',
  'docs',
  'README.md',
  path.join('tests', 'playwright'),
  path.join('tests', 'unit'),
  path.join('tests', 'integration'),
];

export const FORBIDDEN_NAMING_PATTERNS = [
  { id: 'powered_by', label: 'powered by', pattern: /\bpowered\s+by\b/i },
  { id: 'ai_provider', label: 'AI provider', pattern: /\bAI\s+provider\b/i },
  { id: 'ai_model', label: 'AI model', pattern: /\bAI\s+models?\b/i },
  { id: 'ai_assistant', label: 'AI assistant', pattern: /\bAI\s+assistant\b/i },
  { id: 'ai_powered', label: 'AI-powered', pattern: /\bAI[-\s]+powered\b/i },
  { id: 'external_ai', label: 'external AI', pattern: /\bexternal\s+AI\b/i },
  { id: 'native_ai', label: 'native AI', pattern: /\bnative\s+AI\b/i },
  { id: 'multi_ai', label: 'multi-AI', pattern: /\bmulti[-\s]+AI\b/i },
  { id: 'ai_orchestration', label: 'AI orchestration', pattern: /\bAI\s+orchestration\b/i },
  { id: 'ai_runtime', label: 'AI runtime', pattern: /\bAI\s+runtime\b|\bai[-_]runtime\b/i },
  { id: 'ai_brain', label: 'AI brain', pattern: /\bAI\s+brain\b/i },
  { id: 'model_wrapper', label: 'model wrapper', pattern: /\bmodel\s+wrapper\b/i },
  { id: 'llm_wrapper', label: 'LLM wrapper', pattern: /\bLLM\s+wrapper\b/i },
  { id: 'chatbot_wrapper', label: 'chatbot wrapper', pattern: /\bchatbot\s+wrapper\b/i },
  { id: 'standalone_ai', label: 'AI', pattern: /\bAI\b/ },
  { id: 'ai_implementation_name', label: 'generic AI implementation name', pattern: /\bai[-_][a-z0-9]+/i },
];

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mdx',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

const IGNORED_SEGMENTS = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'agentos-artifacts',
  'coverage',
  'node_modules',
  'playwright-report',
  'test-results',
]);

const IGNORED_FILES = new Set([
  path.join('tests', 'unit', 'forbidden-naming-scanner.test.ts'),
]);

const VENDOR_ALLOWLIST = [
  /OpenAI/,
  /Anthropic/,
  /Google/,
  /Gemini/,
  /Claude/,
  /@anthropic-ai\/sdk/,
  /@openai\//,
];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function shouldScanPath(root, filePath) {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith('..')) return false;
  if (IGNORED_FILES.has(relative)) return false;
  const segments = relative.split(path.sep);
  if (segments.some(segment => IGNORED_SEGMENTS.has(segment))) return false;
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function isVendorOnlyLine(line) {
  const withoutVendors = VENDOR_ALLOWLIST.reduce((current, expression) => current.replace(expression, ''), line);
  return withoutVendors === line ? false : !FORBIDDEN_NAMING_PATTERNS.some(({ id, pattern }) => {
    if (id === 'standalone_ai' || id === 'ai_implementation_name') return pattern.test(withoutVendors);
    return pattern.test(line);
  });
}

function collectFiles(root, entry) {
  const absolute = path.resolve(root, entry);
  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    return [];
  }

  if (stats.isFile()) return shouldScanPath(root, absolute) ? [absolute] : [];
  if (!stats.isDirectory()) return [];

  const files = [];
  for (const child of readdirSync(absolute)) {
    const childPath = path.join(absolute, child);
    const relativeSegments = path.relative(root, childPath).split(path.sep);
    if (relativeSegments.some(segment => IGNORED_SEGMENTS.has(segment))) continue;
    files.push(...collectFiles(root, path.relative(root, childPath)));
  }
  return files;
}

export function scanForbiddenNaming(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const roots = options.roots ?? DEFAULT_SCAN_ROOTS;
  const violations = [];

  for (const scanRoot of roots) {
    for (const filePath of collectFiles(root, scanRoot)) {
      const relativePath = toPosix(path.relative(root, filePath));
      const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!line.trim() || isVendorOnlyLine(line)) return;
        for (const rule of FORBIDDEN_NAMING_PATTERNS) {
          if (!rule.pattern.test(line)) continue;
          violations.push({
            file: relativePath,
            line: index + 1,
            rule: rule.id,
            label: rule.label,
            text: line.trim(),
          });
        }
      });
    }
  }

  return violations;
}

export function formatForbiddenNamingViolations(violations) {
  return violations.map(violation =>
    `${violation.file}:${violation.line} ${violation.label} -> ${violation.text}`,
  ).join('\n');
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const violations = scanForbiddenNaming();
  if (violations.length > 0) {
    console.error(formatForbiddenNamingViolations(violations));
    process.exit(1);
  }
  console.log('Forbidden naming scan passed.');
}
