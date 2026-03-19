import { describe, expect, it } from 'vitest';
import { toPublicCrewOverview, toPublicOpsMetrics } from '../../src/ops/public.js';

describe('public ops views', () => {
  it('removes the per-item crew matrix for anonymous responses', () => {
    const overview = {
      project: { name: 'Agent OS' },
      summary: { platformFeatures: 70, runtimeFunctions: 32, totalCatalogItems: 102 },
      settings: { operation_mode: 'single_agent' as const, consensus_mode_enabled: false },
      items: [{
        feature: {
          slug: 'filesystem',
          id: 1,
          name: 'Filesystem (fs)',
          kind: 'platform_feature',
          categoryName: 'Core Infrastructure',
          categoryBadge: 'CORE',
          short: 'Read and write files in isolated cloud storage for each agent.',
        },
        activePair: {
          infra_agent_id: 'infra_real_active',
          status: 'healthy',
          infra_agent: { name: 'Filesystem Primary', status: 'healthy' },
        },
        standbyPair: {
          infra_agent_id: 'infra_real_standby',
          status: 'healthy',
          infra_agent: { name: 'Filesystem Standby', status: 'healthy' },
        },
        activeHealth: { status: 'healthy', health_score: 1, summary: 'Healthy coverage confirmed.' },
        standbyHealth: { status: 'healthy', health_score: 1, summary: 'Healthy coverage confirmed.' },
        openTasks: [{ id: 'task_1', task_type: 'health_check', status: 'queued' }],
        coverageState: 'covered',
      }],
      failoverEvents: [{ id: 'event_1', feature_slug: 'filesystem', reason: 'test', created_at: '2026-03-15T00:00:00.000Z' }],
    };

    const result = toPublicCrewOverview(overview);

    expect(result.requiresAuthForDetails).toBe(true);
    expect(result.coverage).toEqual({
      totalCatalogItems: 1,
      fullyCovered: 1,
      degradedCoverage: 0,
      uncovered: 0,
    });
    expect(result.protectedSummary).toMatch(/authenticated ops access/i);
    expect(result).not.toHaveProperty('items');
    expect(result).not.toHaveProperty('failoverEvents');
    expect(result).not.toHaveProperty('project');
  });

  it('keeps public metrics while removing internal project metadata', () => {
    const metrics = {
      project: { name: 'Agent OS' },
      summary: { platformFeatures: 70, runtimeFunctions: 32, totalCatalogItems: 102 },
      settings: { operation_mode: 'single_agent' as const, consensus_mode_enabled: false },
      metrics: {
        totalCatalogItems: 102,
        fullyCovered: 102,
        coveragePercent: 100,
        healthyActiveAgents: 102,
        degradedActiveAgents: 0,
        openTasks: 0,
        failoverEvents: 0,
      },
    };

    const result = toPublicOpsMetrics(metrics);

    expect(result.requiresAuthForDetails).toBe(true);
    expect(result.metrics.coveragePercent).toBe(100);
    expect(result).not.toHaveProperty('project');
  });
});
