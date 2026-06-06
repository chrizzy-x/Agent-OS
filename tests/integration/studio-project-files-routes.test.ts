import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getFiles } from '../../app/api/studio/projects/[id]/files/route.js';
import { GET as getFile, PUT as putFile, DELETE as deleteFile } from '../../app/api/studio/projects/[id]/file/route.js';
import { POST as createDirectory } from '../../app/api/studio/projects/[id]/directory/route.js';

const {
  requireRouteCapability,
  listProjectFiles,
  readProjectFile,
  writeProjectFile,
  deleteProjectFile,
  createProjectDirectory,
} = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  listProjectFiles: vi.fn(),
  readProjectFile: vi.fn(),
  writeProjectFile: vi.fn(),
  deleteProjectFile: vi.fn(),
  createProjectDirectory: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability,
}));

vi.mock('../../src/studio/files.js', () => ({
  listProjectFiles,
  readProjectFile,
  writeProjectFile,
  deleteProjectFile,
  createProjectDirectory,
}));

describe('studio project file routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
  });

  it('lists project files', async () => {
    listProjectFiles.mockResolvedValue([{ id: 'file-1', path: 'src/index.ts', name: 'index.ts', kind: 'file' }]);
    const response = await getFiles(new NextRequest('http://localhost/api/studio/projects/project-1/files'), {
      params: Promise.resolve({ id: 'project-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listProjectFiles).toHaveBeenCalledWith({ ownerAgentId: 'agent-1', projectId: 'project-1' });
    expect(body.files).toHaveLength(1);
  });

  it('reads, writes, deletes, and creates directories inside the project scope', async () => {
    readProjectFile.mockResolvedValue({ path: 'README.md', content: '# hi', encoding: 'utf8', contentType: 'text/markdown', sizeBytes: 4 });
    writeProjectFile.mockResolvedValue({ path: 'README.md', sizeBytes: 4 });
    deleteProjectFile.mockResolvedValue({ path: 'README.md', deleted: true });
    createProjectDirectory.mockResolvedValue({ path: 'src' });

    const getResponse = await getFile(new NextRequest('http://localhost/api/studio/projects/project-1/file?path=README.md'), {
      params: Promise.resolve({ id: 'project-1' }),
    });
    const putResponse = await putFile(new NextRequest('http://localhost/api/studio/projects/project-1/file', {
      method: 'PUT',
      body: JSON.stringify({ path: 'README.md', content: '# hi', encoding: 'utf8' }),
      headers: { 'Content-Type': 'application/json' },
    }), {
      params: Promise.resolve({ id: 'project-1' }),
    });
    const deleteResponse = await deleteFile(new NextRequest('http://localhost/api/studio/projects/project-1/file', {
      method: 'DELETE',
      body: JSON.stringify({ path: 'README.md' }),
      headers: { 'Content-Type': 'application/json' },
    }), {
      params: Promise.resolve({ id: 'project-1' }),
    });
    const mkdirResponse = await createDirectory(new NextRequest('http://localhost/api/studio/projects/project-1/directory', {
      method: 'POST',
      body: JSON.stringify({ path: 'src' }),
      headers: { 'Content-Type': 'application/json' },
    }), {
      params: Promise.resolve({ id: 'project-1' }),
    });

    expect(getResponse.status).toBe(200);
    expect(putResponse.ok).toBe(true);
    expect(deleteResponse.ok).toBe(true);
    expect(mkdirResponse.ok).toBe(true);
    expect(writeProjectFile).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      projectId: 'project-1',
      path: 'README.md',
      content: '# hi',
      encoding: 'utf8',
      contentType: null,
    });
  });
});
