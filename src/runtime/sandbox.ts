import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecurityError, ValidationError } from '../utils/errors.js';

export type SupportedLanguage = 'python' | 'javascript' | 'bash';

const LANGUAGE_COMMANDS: Record<SupportedLanguage, { cmd: string; fileExt: string; args?: string[] }> = {
  python: { cmd: 'python3', fileExt: 'py' },
  javascript: { cmd: 'node', fileExt: 'js', args: ['--max-old-space-size=512'] },
  bash: { cmd: 'bash', fileExt: 'sh' },
};

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

// Execute code in a sandboxed subprocess with a strict timeout.
// Each execution gets an isolated temporary directory that is cleaned up afterward.
// Note: this sandbox relies on process-level isolation — for production,
// Docker-based isolation is recommended. Vercel serverless does not support Docker.
export async function executeCode(
  code: string,
  language: SupportedLanguage,
  timeoutMs = 30_000
): Promise<ExecutionResult> {
  const MAX_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  if (timeoutMs > MAX_TIMEOUT) {
    throw new ValidationError(`Execution timeout cannot exceed ${MAX_TIMEOUT / 1000}s`);
  }

  const config = LANGUAGE_COMMANDS[language];
  if (!config) {
    throw new ValidationError(`Unsupported language: ${language}. Supported: python, javascript, bash`);
  }

  // Create an isolated temp directory for this execution
  const workDir = await mkdtemp(join(tmpdir(), 'agent-exec-'));
  const scriptPath = join(workDir, `script.${config.fileExt}`);

  try {
    await writeFile(scriptPath, code, { mode: 0o700 });

    const args = [...(config.args ?? []), scriptPath];
    const result = await runProcess(config.cmd, args, workDir, timeoutMs);
    return result;
  } finally {
    // Always clean up the temp directory
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const child = spawn(cmd, args, {
      cwd,
      // Deny network access at the env level (can't write to /etc/hosts but limit env vars)
      env: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: cwd,
        TMPDIR: cwd,
      },
      // Don't inherit parent stdin
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const MAX_OUTPUT = 1 * 1024 * 1024; // 1MB max output

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT) {
        stdout += chunk.toString();
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT) {
        stderr += chunk.toString();
      }
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new SecurityError(`Execution timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start process: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.slice(0, MAX_OUTPUT),
        stderr: stderr.slice(0, MAX_OUTPUT),
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
      });
    });
  });
}
