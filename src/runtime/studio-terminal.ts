import { createHash, randomUUID } from 'crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, join, relative } from 'path';
import { deleteProjectFile, listProjectFilePaths, readProjectFileBuffer, writeProjectFile } from '../studio/files.js';
import type { StudioTerminalEvent, StudioTerminalSession } from '../studio/types.js';
import { getProject } from '../projects/service.js';
import { NotFoundError, PermissionError, ValidationError } from '../utils/errors.js';

const DONE_PREFIX = '__AGENTOS_DONE__:';
const MAX_EVENT_HISTORY = 500;
const EXCLUDED_SYNC_DIRECTORIES = new Set(['.agentos', '.git', '.next', '.turbo', '.vercel', 'node_modules']);
const ADVANCED_MODE_MESSAGE = 'Advanced mode must be enabled for this browser session before using Code Studio terminal';

type InternalStudioTerminalSession = StudioTerminalSession & {
  ownerAgentId: string;
  workspaceRoot: string;
  shellCommand: string;
  shellArgs: string[];
  child: ChildProcessWithoutNullStreams;
  eventCursor: number;
  commandCursor: number;
  stdoutBuffer: string;
  fileHashes: Map<string, string>;
  syncPromise: Promise<void> | null;
  pendingSync: boolean;
  closing: boolean;
};

type ShellConfig = {
  name: string;
  command: string;
  args: string[];
  scriptExtension: 'ps1' | 'sh';
  wrapCommand: (scriptPath: string, marker: string) => string;
};

declare global {
  // eslint-disable-next-line no-var
  var __agentosStudioTerminals: Map<string, InternalStudioTerminalSession> | undefined;
}

const studioTerminalSessions = globalThis.__agentosStudioTerminals ?? new Map<string, InternalStudioTerminalSession>();
globalThis.__agentosStudioTerminals = studioTerminalSessions;

function nowIso(): string {
  return new Date().toISOString();
}

function getShellConfig(): ShellConfig {
  if (process.platform === 'win32') {
    return {
      name: 'PowerShell',
      command: process.env.ComSpec?.toLowerCase().includes('pwsh') ? process.env.ComSpec : 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '-'],
      scriptExtension: 'ps1',
      wrapCommand: (scriptPath, marker) => {
        const safePath = scriptPath.replace(/'/g, "''");
        return [
          `$__agentos_status = 0`,
          `try {`,
          `  . '${safePath}'`,
          `  if (-not $?) { $__agentos_status = 1 }`,
          `} catch {`,
          `  $__agentos_status = 1`,
          `  Write-Error $_`,
          `} finally {`,
          `  Write-Output "${DONE_PREFIX}${marker}:$__agentos_status"`,
          `}`,
          '',
        ].join('\n');
      },
    };
  }

  return {
    name: 'Bash',
    command: process.env.SHELL || 'bash',
    args: ['--noprofile', '--norc', '-i'],
    scriptExtension: 'sh',
    wrapCommand: (scriptPath, marker) => {
      const safePath = scriptPath.replace(/'/g, `'\\''`);
      return [
        `source '${safePath}'`,
        `__agentos_status=$?`,
        `printf "${DONE_PREFIX}%s:%s\\n" "${marker}" "$__agentos_status"`,
        `unset __agentos_status`,
        '',
      ].join('\n');
    },
  };
}

function ensureAdvancedMode(enabled: boolean): void {
  if (!enabled) {
    throw new PermissionError(ADVANCED_MODE_MESSAGE);
  }
}

function checksum(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex');
}

function nextEvent(
  session: InternalStudioTerminalSession,
  event: Omit<StudioTerminalEvent, 'id' | 'createdAt'>,
): StudioTerminalEvent {
  const fullEvent: StudioTerminalEvent = {
    id: String(++session.eventCursor),
    createdAt: nowIso(),
    ...event,
  };
  session.updatedAt = fullEvent.createdAt;
  session.events = [...session.events, fullEvent].slice(-MAX_EVENT_HISTORY);
  return fullEvent;
}

function publicSession(session: InternalStudioTerminalSession): StudioTerminalSession {
  return {
    id: session.id,
    projectId: session.projectId,
    shell: session.shell,
    cwd: session.cwd,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    events: [...session.events],
  };
}

function getSession(ownerAgentId: string, sessionId: string): InternalStudioTerminalSession {
  const session = studioTerminalSessions.get(sessionId);
  if (!session || session.ownerAgentId !== ownerAgentId) {
    throw new NotFoundError(`Studio terminal session not found: ${sessionId}`);
  }
  return session;
}

async function writeWorkspaceFile(workspaceRoot: string, relativePath: string, buffer: Buffer): Promise<void> {
  const destination = join(workspaceRoot, ...relativePath.split('/'));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
}

async function hydrateWorkspace(params: {
  ownerAgentId: string;
  projectId: string;
  workspaceRoot: string;
}): Promise<Map<string, string>> {
  const fileHashes = new Map<string, string>();
  const paths = await listProjectFilePaths({
    ownerAgentId: params.ownerAgentId,
    projectId: params.projectId,
  });

  await mkdir(join(params.workspaceRoot, '.agentos', 'commands'), { recursive: true });

  for (const filePath of paths) {
    const buffer = await readProjectFileBuffer({
      ownerAgentId: params.ownerAgentId,
      projectId: params.projectId,
      path: filePath,
    });
    await writeWorkspaceFile(params.workspaceRoot, filePath, buffer);
    fileHashes.set(filePath, checksum(buffer));
  }

  return fileHashes;
}

async function collectWorkspaceFiles(
  root: string,
  currentDir = root,
): Promise<Array<{ path: string; buffer: Buffer }>> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: Array<{ path: string; buffer: Buffer }> = [];

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);
    const relativePath = relative(root, absolutePath).replace(/\\/g, '/');

    if (!relativePath) {
      continue;
    }

    if (entry.isDirectory()) {
      if (EXCLUDED_SYNC_DIRECTORIES.has(entry.name)) {
        continue;
      }
      files.push(...await collectWorkspaceFiles(root, absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const buffer = await readFile(absolutePath);
    files.push({ path: relativePath, buffer });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function syncWorkspace(session: InternalStudioTerminalSession): Promise<void> {
  const nextFiles = await collectWorkspaceFiles(session.workspaceRoot);
  const nextHashes = new Map(nextFiles.map(file => [file.path, checksum(file.buffer)]));
  let writes = 0;
  let deletes = 0;

  for (const file of nextFiles) {
    const currentHash = session.fileHashes.get(file.path);
    const nextHash = nextHashes.get(file.path);
    if (!nextHash || currentHash === nextHash) {
      continue;
    }

    await writeProjectFile({
      ownerAgentId: session.ownerAgentId,
      projectId: session.projectId,
      path: file.path,
      content: file.buffer.toString('base64'),
      encoding: 'base64',
    });
    writes += 1;
  }

  for (const existingPath of session.fileHashes.keys()) {
    if (nextHashes.has(existingPath)) {
      continue;
    }
    await deleteProjectFile({
      ownerAgentId: session.ownerAgentId,
      projectId: session.projectId,
      path: existingPath,
    });
    deletes += 1;
  }

  session.fileHashes = nextHashes;
  nextEvent(session, {
    type: 'sync',
    message: writes || deletes
      ? `Synced ${writes} file${writes === 1 ? '' : 's'} and removed ${deletes} file${deletes === 1 ? '' : 's'}`
      : 'Files already in sync',
  });
}

function scheduleSync(session: InternalStudioTerminalSession): void {
  if (session.syncPromise) {
    session.pendingSync = true;
    return;
  }

  session.syncPromise = (async () => {
    do {
      session.pendingSync = false;
      try {
        await syncWorkspace(session);
      } catch (error) {
        nextEvent(session, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to sync Code Studio workspace',
        });
      }
    } while (session.pendingSync);
  })().finally(() => {
    session.syncPromise = null;
  });
}

function flushStdoutBuffer(session: InternalStudioTerminalSession): void {
  if (!session.stdoutBuffer) {
    return;
  }
  nextEvent(session, {
    type: 'stdout',
    chunk: session.stdoutBuffer,
  });
  session.stdoutBuffer = '';
}

function handleDoneMarker(session: InternalStudioTerminalSession, line: string): boolean {
  if (!line.startsWith(DONE_PREFIX)) {
    return false;
  }

  const [, marker, rawExitCode] = line.split(':');
  const exitCode = Number.parseInt(rawExitCode ?? '0', 10);
  session.status = session.child.exitCode === null ? 'idle' : session.status;
  nextEvent(session, {
    type: 'status',
    status: session.status,
    exitCode: Number.isFinite(exitCode) ? exitCode : 0,
    message: marker ? `Command ${marker} finished` : 'Command finished',
  });
  scheduleSync(session);
  return true;
}

function handleStdout(session: InternalStudioTerminalSession, chunk: string): void {
  session.stdoutBuffer += chunk;
  const lines = session.stdoutBuffer.split(/\r?\n/);
  session.stdoutBuffer = lines.pop() ?? '';

  for (const line of lines) {
    if (handleDoneMarker(session, line)) {
      continue;
    }
    nextEvent(session, {
      type: 'stdout',
      chunk: `${line}\n`,
    });
  }
}

function attachProcessListeners(session: InternalStudioTerminalSession): void {
  session.child.stdout.on('data', (chunk: Buffer) => {
    handleStdout(session, chunk.toString());
  });

  session.child.stderr.on('data', (chunk: Buffer) => {
    nextEvent(session, {
      type: 'stderr',
      chunk: chunk.toString(),
    });
  });

  session.child.on('error', error => {
    session.status = 'error';
    nextEvent(session, {
      type: 'error',
      status: 'error',
      message: error.message,
    });
  });

  session.child.on('close', code => {
    flushStdoutBuffer(session);
    session.status = session.closing ? 'closed' : 'exited';
    nextEvent(session, {
      type: 'exit',
      status: session.status,
      exitCode: code,
      message: session.closing ? 'Terminal closed' : 'Terminal process exited',
    });
  });
}

async function createCommandScript(
  session: InternalStudioTerminalSession,
  input: string,
  shellConfig: ShellConfig,
  marker: string,
): Promise<string> {
  const directory = join(session.workspaceRoot, '.agentos', 'commands');
  await mkdir(directory, { recursive: true });
  const scriptPath = join(directory, `${marker}.${shellConfig.scriptExtension}`);
  await writeFile(scriptPath, input, 'utf8');
  return scriptPath;
}

export async function createStudioTerminal(params: {
  ownerAgentId: string;
  projectId: string;
  advancedMode: boolean;
}): Promise<StudioTerminalSession> {
  ensureAdvancedMode(params.advancedMode);
  await getProject({
    ownerAgentId: params.ownerAgentId,
    projectId: params.projectId,
  });

  const shellConfig = getShellConfig();
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'agentos-studio-'));
  const fileHashes = await hydrateWorkspace({
    ownerAgentId: params.ownerAgentId,
    projectId: params.projectId,
    workspaceRoot,
  });

  const child = spawn(shellConfig.command, shellConfig.args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      AGENTOS_PROJECT_ID: params.projectId,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const timestamp = nowIso();
  const session: InternalStudioTerminalSession = {
    id: randomUUID(),
    ownerAgentId: params.ownerAgentId,
    projectId: params.projectId,
    shell: shellConfig.name,
    shellCommand: shellConfig.command,
    shellArgs: shellConfig.args,
    cwd: workspaceRoot,
    workspaceRoot,
    status: 'starting',
    createdAt: timestamp,
    updatedAt: timestamp,
    events: [],
    child,
    eventCursor: 0,
    commandCursor: 0,
    stdoutBuffer: '',
    fileHashes,
    syncPromise: null,
    pendingSync: false,
    closing: false,
  };

  studioTerminalSessions.set(session.id, session);
  attachProcessListeners(session);
  session.status = 'idle';
  nextEvent(session, {
    type: 'session',
    status: 'idle',
    message: `Terminal ready in ${basename(workspaceRoot)}`,
  });
  return publicSession(session);
}

export async function getStudioTerminal(params: {
  ownerAgentId: string;
  sessionId: string;
}): Promise<StudioTerminalSession> {
  return publicSession(getSession(params.ownerAgentId, params.sessionId));
}

export async function listStudioTerminalEvents(params: {
  ownerAgentId: string;
  sessionId: string;
  cursor?: string | null;
}): Promise<StudioTerminalEvent[]> {
  const session = getSession(params.ownerAgentId, params.sessionId);
  const cursor = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
  if (!Number.isFinite(cursor) || cursor <= 0) {
    return [...session.events];
  }
  return session.events.filter(event => Number.parseInt(event.id, 10) > cursor);
}

export async function sendStudioTerminalInput(params: {
  ownerAgentId: string;
  sessionId: string;
  input: string;
  advancedMode: boolean;
}): Promise<{ accepted: true; marker: string; session: StudioTerminalSession }> {
  ensureAdvancedMode(params.advancedMode);
  const session = getSession(params.ownerAgentId, params.sessionId);
  const input = params.input.trimEnd();
  if (!input.trim()) {
    throw new ValidationError('terminal input is required');
  }
  if (session.status === 'closed' || session.status === 'exited' || session.status === 'error') {
    throw new ValidationError('terminal session is not available');
  }

  const marker = `${++session.commandCursor}-${Date.now()}`;
  const shellConfig = getShellConfig();
  const scriptPath = await createCommandScript(session, input, shellConfig, marker);
  const wrapped = shellConfig.wrapCommand(scriptPath, marker);

  session.status = 'running';
  nextEvent(session, {
    type: 'status',
    status: 'running',
    message: `Running command ${marker}`,
  });
  session.child.stdin.write(wrapped);

  return {
    accepted: true,
    marker,
    session: publicSession(session),
  };
}

export async function closeStudioTerminal(params: {
  ownerAgentId: string;
  sessionId: string;
}): Promise<{ closed: true }> {
  const session = getSession(params.ownerAgentId, params.sessionId);
  session.closing = true;
  session.status = 'closed';

  try {
    session.child.stdin.end();
  } catch {
    // no-op
  }

  session.child.kill();
  await session.syncPromise?.catch(() => undefined);
  await rm(session.workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
  studioTerminalSessions.delete(session.id);
  return { closed: true };
}

export async function snapshotWorkspaceFileStats(params: {
  ownerAgentId: string;
  sessionId: string;
}): Promise<Array<{ path: string; sizeBytes: number }>> {
  const session = getSession(params.ownerAgentId, params.sessionId);
  const files = await collectWorkspaceFiles(session.workspaceRoot);
  return Promise.all(files.map(async file => ({
    path: file.path,
    sizeBytes: (await stat(join(session.workspaceRoot, ...file.path.split('/')))).size,
  })));
}
