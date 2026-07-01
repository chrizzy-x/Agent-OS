import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import process from 'node:process';

const host = process.env.PLAYWRIGHT_HOST ?? '127.0.0.1';
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${port}`;
const args = process.argv.slice(2);

function waitForUrl(url, timeoutMs = 180_000) {
  const startedAt = Date.now();
  const client = url.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = client.get(url, response => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on('error', retry);
      request.setTimeout(2_500, () => {
        request.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(check, 1_000);
    };
    check();
  });
}

function killProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      // Process already exited.
    }
  }
}

let server = null;
let exitCode = 0;

try {
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    server = spawn(process.execPath, [
      'node_modules/next/dist/bin/next',
      'start',
      '-H',
      host,
      '-p',
      String(port),
    ], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    });
    await waitForUrl(baseURL);
  }

  const playwright = spawn(process.execPath, [
    'node_modules/playwright/cli.js',
    'test',
    ...args,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
    },
      stdio: 'inherit',
    });

  exitCode = await new Promise(resolve => {
    playwright.on('exit', exitCode => resolve(exitCode ?? 1));
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  killProcessTree(server);
}

process.exit(Number(exitCode));
