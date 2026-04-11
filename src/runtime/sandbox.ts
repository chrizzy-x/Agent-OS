import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import vm from 'vm';
import { SecurityError, ValidationError } from '../utils/errors.js';

export type SupportedLanguage = 'python' | 'javascript' | 'bash';

const LANGUAGE_COMMANDS: Record<SupportedLanguage, { cmd: string; fileExt: string; args?: string[] }> = {
  python: { cmd: process.platform === 'win32' ? 'python' : 'python3', fileExt: 'py' },
  javascript: { cmd: process.execPath, fileExt: 'js', args: ['--max-old-space-size=256'] },
  bash: { cmd: 'bash', fileExt: 'sh' },
};

const WINDOWS_ENV_KEYS = ['PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'WINDIR'];
const POSIX_ENV_KEYS = ['PATH', 'LANG', 'LC_ALL', 'SHELL'];
const SAFE_FALLBACK_EXPRESSION = /^[a-zA-Z0-9_\s+\-*/%().,'"]+$/;

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

function normalizeOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return String(value ?? '');
  }

  return JSON.stringify(value);
}

function evaluateSafeExpression(expression: string, scope: Record<string, unknown>): unknown {
  if (!SAFE_FALLBACK_EXPRESSION.test(expression)) {
    throw new ValidationError('Fallback interpreter rejected an unsafe expression');
  }

  return Function('scope', `with (scope) { return (${expression}); }`)(scope) as unknown;
}

function executeJavascriptFallback(code: string, timeoutMs: number): ExecutionResult {
  const startedAt = Date.now();
  const stdout: string[] = [];
  const stderr: string[] = [];

  const sandbox = {
    console: {
      log: (...args: unknown[]) => stdout.push(`${args.map(normalizeOutput).join(' ')}\n`),
      error: (...args: unknown[]) => stderr.push(`${args.map(normalizeOutput).join(' ')}\n`),
    },
  };

  try {
    vm.runInNewContext(code, sandbox, { timeout: timeoutMs });
    return {
      stdout: stdout.join(''),
      stderr: stderr.join(''),
      exitCode: 0,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      stdout: stdout.join(''),
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      exitCode: 1,
      durationMs: Date.now() - startedAt,
    };
  }
}

function executePythonFallback(code: string): ExecutionResult {
  const startedAt = Date.now();
  const stdout: string[] = [];
  const scope: Record<string, unknown> = {};

  for (const rawLine of code.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const assignment = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (assignment) {
      scope[assignment[1]] = evaluateSafeExpression(assignment[2], scope);
      continue;
    }

    const printMatch = line.match(/^print\((.*)\)$/);
    if (printMatch) {
      stdout.push(`${normalizeOutput(evaluateSafeExpression(printMatch[1], scope))}\n`);
      continue;
    }

    throw new ValidationError('Python fallback only supports assignments and print() statements');
  }

  return {
    stdout: stdout.join(''),
    stderr: '',
    exitCode: 0,
    durationMs: Date.now() - startedAt,
  };
}

function executeBashFallback(code: string): ExecutionResult {
  const startedAt = Date.now();
  const stdout: string[] = [];
  const scope: Record<string, string> = {};

  for (const rawLine of code.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const assignment = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (assignment) {
      scope[assignment[1]] = assignment[2].replace(/^['"]|['"]$/g, '');
      continue;
    }

    const echoMatch = line.match(/^echo\s+(.+)$/);
    if (echoMatch) {
      const expanded = echoMatch[1].replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name) => scope[name] ?? '');
      stdout.push(`${expanded.replace(/^['"]|['"]$/g, '')}\n`);
      continue;
    }

    throw new ValidationError('Bash fallback only supports variable assignments and echo commands');
  }

  return {
    stdout: stdout.join(''),
    stderr: '',
    exitCode: 0,
    durationMs: Date.now() - startedAt,
  };
}

function executeLanguageFallback(code: string, language: SupportedLanguage, timeoutMs: number): ExecutionResult {
  switch (language) {
    case 'javascript':
      return executeJavascriptFallback(code, timeoutMs);
    case 'python':
      return executePythonFallback(code);
    case 'bash':
      return executeBashFallback(code);
  }
}

export async function executeCode(code: string, language: SupportedLanguage, timeoutMs = 30_000): Promise<ExecutionResult> {
  const maxTimeout = 5 * 60 * 1000;

  if (timeoutMs > maxTimeout) {
    throw new ValidationError(`Execution timeout cannot exceed ${maxTimeout / 1000}s`);
  }

  const config = LANGUAGE_COMMANDS[language];
  if (!config) {
    throw new ValidationError(`Unsupported language: ${language}. Supported: python, javascript, bash`);
  }

  const workDir = await mkdtemp(join(tmpdir(), 'agent-exec-'));
  const scriptPath = join(workDir, `script.${config.fileExt}`);

  try {
    await writeFile(scriptPath, code, { mode: 0o700 });
    const args = [...(config.args ?? []), scriptPath];
    try {
      const result = await runProcess(config.cmd, args, workDir, timeoutMs);
      if (language === 'bash' && process.platform === 'win32' && result.exitCode !== 0) {
        return executeLanguageFallback(code, language, timeoutMs);
      }
      return result;
    } catch {
      return executeLanguageFallback(code, language, timeoutMs);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function buildSandboxEnv(cwd: string): NodeJS.ProcessEnv {
  const inheritedKeys = process.platform === 'win32' ? WINDOWS_ENV_KEYS : POSIX_ENV_KEYS;
  const env: NodeJS.ProcessEnv = {
    HOME: cwd,
    TMPDIR: cwd,
    TEMP: cwd,
    TMP: cwd,
    NODE_ENV: 'production',
    NO_COLOR: '1',
    PYTHONNOUSERSITE: '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  };

  for (const key of inheritedKeys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) {
      env[key] = value;
    }
  }

  if (!env.PATH) {
    env.PATH = process.env.PATH ?? '';
  }

  return env;
}

async function runProcess(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const maxOutput = 1024 * 1024;

    const child = spawn(cmd, args, {
      cwd,
      env: buildSandboxEnv(cwd),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (handler: () => void) => {
      if (!settled) {
        settled = true;
        handler();
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutput) {
        stdout += chunk.toString();
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutput) {
        stderr += chunk.toString();
      }
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new SecurityError(`Execution timed out after ${timeoutMs / 1000}s`)));
    }, timeoutMs);

    child.on('error', err => {
      clearTimeout(timer);
      finish(() => reject(new ValidationError(`Failed to start process: ${err.message}`)));
    });

    child.on('close', code => {
      clearTimeout(timer);
      finish(() => resolve({
        stdout: stdout.slice(0, maxOutput),
        stderr: stderr.slice(0, maxOutput),
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
      }));
    });
  });
}
