import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecurityError, ValidationError } from '../utils/errors.js';

export type SupportedLanguage = 'python' | 'javascript' | 'bash';

const LANGUAGE_COMMANDS: Record<SupportedLanguage, { cmd: string; fileExt: string; args?: string[] }> = {
  python: { cmd: process.platform === 'win32' ? 'python' : 'python3', fileExt: 'py' },
  javascript: { cmd: process.execPath, fileExt: 'js', args: ['--max-old-space-size=256'] },
  bash: { cmd: 'bash', fileExt: 'sh' },
};

const WINDOWS_ENV_KEYS = ['PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'WINDIR'];
const POSIX_ENV_KEYS = ['PATH', 'LANG', 'LC_ALL', 'SHELL'];

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export async function executeCode(
  code: string,
  language: SupportedLanguage,
  timeoutMs = 30_000
): Promise<ExecutionResult> {
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
    return await runProcess(config.cmd, args, workDir, timeoutMs);
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

async function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<ExecutionResult> {
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
      finish(() => reject(new Error(`Failed to start process: ${err.message}`)));
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
