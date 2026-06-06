import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';

export type EvalCase = {
  id: string;
  suiteId: string;
  input: { tool: string; arguments?: Record<string, unknown>; workspaceId?: string };
  expectedOutput: Record<string, unknown> | null;
  scoringCriteria: 'exact' | 'contains' | 'llm_judge';
  createdAt: string;
};

export type EvalSuite = {
  id: string;
  name: string;
  agentId: string;
  createdBy: string | null;
  createdAt: string;
};

export type EvalRun = {
  id: string;
  suiteId: string;
  triggeredBy: string | null;
  status: 'running' | 'complete' | 'failed';
  passCount: number;
  failCount: number;
  score: number | null;
  startedAt: string;
  completedAt: string | null;
};

export type EvalResult = {
  id: string;
  runId: string;
  caseId: string;
  actualOutput: Record<string, unknown> | null;
  passed: boolean;
  score: number;
  reasoning: string;
};

const localSuites = new Map<string, EvalSuite>();
const localCases = new Map<string, EvalCase[]>();
const localRuns = new Map<string, EvalRun[]>();
const localResults = new Map<string, EvalResult[]>();
let anthropicClient: Anthropic | null = null;

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function containsExpected(actual: unknown, expected: unknown): boolean {
  if (expected === null || expected === undefined) {
    return true;
  }

  if (typeof expected !== 'object' || expected === null || Array.isArray(expected)) {
    return deepEqual(actual, expected);
  }

  if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
    return false;
  }

  return Object.entries(expected as Record<string, unknown>).every(([key, value]) => containsExpected((actual as Record<string, unknown>)[key], value));
}

async function getAnthropicClient(): Promise<Anthropic | null> {
  if (anthropicClient) {
    return anthropicClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

async function judgeWithLlm(actualOutput: unknown, expectedOutput: unknown): Promise<{ score: number; reasoning: string }> {
  const client = await getAnthropicClient();
  if (!client) {
    return {
      score: containsExpected(actualOutput, expectedOutput) ? 0.8 : 0.2,
      reasoning: 'Fallback judge used because ANTHROPIC_API_KEY is not configured.',
    };
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: 'Score the actual output against the expected output from 0 to 1. Return strict JSON with keys score and reasoning.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ actualOutput, expectedOutput }),
      },
    ],
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(text) as { score?: number; reasoning?: string };
    return {
      score: typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : 0,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning returned.',
    };
  } catch {
    return { score: 0, reasoning: 'Judge response was invalid JSON.' };
  }
}

export async function createEvalSuite(params: { name: string; agentId: string; createdBy?: string | null }): Promise<EvalSuite> {
  const suite: EvalSuite = {
    id: randomUUID(),
    name: params.name,
    agentId: params.agentId,
    createdBy: params.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('eval_suites')
      .insert({
        id: suite.id,
        name: suite.name,
        agent_id: suite.agentId,
        created_by: suite.createdBy,
      })
      .select('id,name,agent_id,created_by,created_at')
      .single();

    if (!error && data) {
      return {
        id: String(data.id),
        name: String(data.name),
        agentId: String(data.agent_id),
        createdBy: typeof data.created_by === 'string' ? data.created_by : null,
        createdAt: String(data.created_at),
      };
    }
  } catch {
    // Fall back to local state below.
  }

  localSuites.set(suite.id, suite);
  return suite;
}

export async function addEvalCase(params: {
  suiteId: string;
  input: { tool: string; arguments?: Record<string, unknown>; workspaceId?: string };
  expectedOutput?: Record<string, unknown> | null;
  scoringCriteria?: 'exact' | 'contains' | 'llm_judge';
}): Promise<EvalCase> {
  const testCase: EvalCase = {
    id: randomUUID(),
    suiteId: params.suiteId,
    input: params.input,
    expectedOutput: params.expectedOutput ?? null,
    scoringCriteria: params.scoringCriteria ?? 'exact',
    createdAt: new Date().toISOString(),
  };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('eval_cases')
      .insert({
        id: testCase.id,
        suite_id: testCase.suiteId,
        input: testCase.input,
        expected_output: testCase.expectedOutput,
        scoring_criteria: testCase.scoringCriteria,
      })
      .select('id,suite_id,input,expected_output,scoring_criteria,created_at')
      .single();

    if (!error && data) {
      return {
        id: String(data.id),
        suiteId: String(data.suite_id),
        input: data.input as EvalCase['input'],
        expectedOutput: (data.expected_output as Record<string, unknown> | null | undefined) ?? null,
        scoringCriteria: (data.scoring_criteria as EvalCase['scoringCriteria']) ?? 'exact',
        createdAt: String(data.created_at),
      };
    }
  } catch {
    // Fall back to local state below.
  }

  const cases = localCases.get(params.suiteId) ?? [];
  cases.push(testCase);
  localCases.set(params.suiteId, cases);
  return testCase;
}

export async function listEvalRuns(suiteId: string): Promise<EvalRun[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('eval_runs')
      .select('id,suite_id,triggered_by,status,pass_count,fail_count,score,started_at,completed_at')
      .eq('suite_id', suiteId)
      .order('started_at', { ascending: false })
      .limit(50);

    if (!error) {
      return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
        id: String(row.id),
        suiteId: String(row.suite_id),
        triggeredBy: typeof row.triggered_by === 'string' ? row.triggered_by : null,
        status: (row.status as EvalRun['status']) ?? 'running',
        passCount: Number(row.pass_count ?? 0),
        failCount: Number(row.fail_count ?? 0),
        score: typeof row.score === 'number' ? row.score : null,
        startedAt: String(row.started_at),
        completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
      }));
    }
  } catch {
    // Fall back to local state below.
  }

  return [...(localRuns.get(suiteId) ?? [])].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export async function getEvalRun(runId: string): Promise<{ run: EvalRun | null; results: EvalResult[] }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: run } = await supabase
      .from('eval_runs')
      .select('id,suite_id,triggered_by,status,pass_count,fail_count,score,started_at,completed_at')
      .eq('id', runId)
      .maybeSingle();
    const { data: results } = await supabase
      .from('eval_results')
      .select('id,run_id,case_id,actual_output,passed,score,reasoning')
      .eq('run_id', runId);

    if (run) {
      return {
        run: {
          id: String(run.id),
          suiteId: String(run.suite_id),
          triggeredBy: typeof run.triggered_by === 'string' ? run.triggered_by : null,
          status: (run.status as EvalRun['status']) ?? 'running',
          passCount: Number(run.pass_count ?? 0),
          failCount: Number(run.fail_count ?? 0),
          score: typeof run.score === 'number' ? run.score : null,
          startedAt: String(run.started_at),
          completedAt: typeof run.completed_at === 'string' ? run.completed_at : null,
        },
        results: ((results ?? []) as Array<Record<string, unknown>>).map(row => ({
          id: String(row.id),
          runId: String(row.run_id),
          caseId: String(row.case_id),
          actualOutput: (row.actual_output as Record<string, unknown> | null | undefined) ?? null,
          passed: Boolean(row.passed),
          score: Number(row.score ?? 0),
          reasoning: typeof row.reasoning === 'string' ? row.reasoning : '',
        })),
      };
    }
  } catch {
    // Fall back to local state below.
  }

  for (const runs of localRuns.values()) {
    const run = runs.find(item => item.id === runId);
    if (run) {
      return { run, results: localResults.get(runId) ?? [] };
    }
  }

  return { run: null, results: [] };
}

export async function listEvalSuites(agentId: string): Promise<EvalSuite[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('eval_suites')
      .select('id,name,agent_id,created_by,created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error) {
      return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
        id: String(row.id),
        name: String(row.name),
        agentId: String(row.agent_id),
        createdBy: typeof row.created_by === 'string' ? row.created_by : null,
        createdAt: String(row.created_at),
      }));
    }
  } catch {
    // Fall back to local state below.
  }

  return [...localSuites.values()].filter(s => s.agentId === agentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findEvalSuite(params: { suiteId?: string; suiteName?: string; agentId: string }): Promise<EvalSuite | null> {
  if (!params.suiteId && !params.suiteName) {
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('eval_suites')
      .select('id,name,agent_id,created_by,created_at')
      .eq('agent_id', params.agentId);

    if (params.suiteId) {
      query = query.eq('id', params.suiteId);
    }
    if (params.suiteName) {
      query = query.eq('name', params.suiteName);
    }

    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      return {
        id: String(data.id),
        name: String(data.name),
        agentId: String(data.agent_id),
        createdBy: typeof data.created_by === 'string' ? data.created_by : null,
        createdAt: String(data.created_at),
      };
    }
  } catch {
    // Fall back to local state below.
  }

  return [...localSuites.values()].find(suite => suite.agentId === params.agentId && (suite.id === params.suiteId || suite.name === params.suiteName)) ?? null;
}

async function listCases(suiteId: string): Promise<EvalCase[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('eval_cases')
      .select('id,suite_id,input,expected_output,scoring_criteria,created_at')
      .eq('suite_id', suiteId)
      .order('created_at', { ascending: true });

    if (!error) {
      return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
        id: String(row.id),
        suiteId: String(row.suite_id),
        input: row.input as EvalCase['input'],
        expectedOutput: (row.expected_output as Record<string, unknown> | null | undefined) ?? null,
        scoringCriteria: (row.scoring_criteria as EvalCase['scoringCriteria']) ?? 'exact',
        createdAt: String(row.created_at),
      }));
    }
  } catch {
    // Fall back to local state below.
  }

  return [...(localCases.get(suiteId) ?? [])].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function persistRun(run: EvalRun): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('eval_runs').upsert({
      id: run.id,
      suite_id: run.suiteId,
      triggered_by: run.triggeredBy,
      status: run.status,
      pass_count: run.passCount,
      fail_count: run.failCount,
      score: run.score,
      started_at: run.startedAt,
      completed_at: run.completedAt,
    });
    return;
  } catch {
    const runs = localRuns.get(run.suiteId) ?? [];
    const index = runs.findIndex(item => item.id === run.id);
    if (index >= 0) {
      runs[index] = run;
    } else {
      runs.unshift(run);
    }
    localRuns.set(run.suiteId, runs);
  }
}

async function persistResult(result: EvalResult): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('eval_results').insert({
      id: result.id,
      run_id: result.runId,
      case_id: result.caseId,
      actual_output: result.actualOutput,
      passed: result.passed,
      score: result.score,
      reasoning: result.reasoning,
    });
    return;
  } catch {
    const results = localResults.get(result.runId) ?? [];
    results.push(result);
    localResults.set(result.runId, results);
  }
}

export async function triggerEvalRun(params: {
  suite: EvalSuite;
  triggeredBy?: string | null;
}): Promise<EvalRun> {
  const run: EvalRun = {
    id: randomUUID(),
    suiteId: params.suite.id,
    triggeredBy: params.triggeredBy ?? null,
    status: 'running',
    passCount: 0,
    failCount: 0,
    score: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  await persistRun(run);
  return run;
}

export async function executeEvalRun(params: {
  run: EvalRun;
  suite: EvalSuite;
}): Promise<void> {
  const cases = await listCases(params.suite.id);
  const { executeUniversalToolCall } = await import('../mcp/registry.js');

  try {
    for (const testCase of cases) {
      const actualOutput = await executeUniversalToolCall({
        agentContext: {
          agentId: params.suite.agentId,
          tier: 'retail_free',
          allowedDomains: [],
          quotas: {
            storageQuotaBytes: 1024 * 1024 * 1024,
            memoryQuotaBytes: 100 * 1024 * 1024,
            rateLimitPerMin: 100,
          },
        },
        name: testCase.input.tool,
        arguments: {
          ...(testCase.input.arguments ?? {}),
          ...(testCase.input.workspaceId ? { workspaceId: testCase.input.workspaceId } : {}),
        },
      });

      let score = 0;
      let passed = false;
      let reasoning = '';

      if (testCase.scoringCriteria === 'exact') {
        passed = deepEqual(actualOutput, testCase.expectedOutput);
        score = passed ? 1 : 0;
        reasoning = passed ? 'Exact match.' : 'Actual output did not exactly match expected output.';
      } else if (testCase.scoringCriteria === 'contains') {
        passed = containsExpected(actualOutput, testCase.expectedOutput);
        score = passed ? 1 : 0;
        reasoning = passed ? 'Expected subset was present.' : 'Expected subset was missing.';
      } else {
        const judged = await judgeWithLlm(actualOutput, testCase.expectedOutput);
        score = judged.score;
        passed = score >= 0.7;
        reasoning = judged.reasoning;
      }

      const result: EvalResult = {
        id: randomUUID(),
        runId: params.run.id,
        caseId: testCase.id,
        actualOutput: (actualOutput as Record<string, unknown> | null | undefined) ?? null,
        passed,
        score,
        reasoning,
      };

      await persistResult(result);
      params.run.passCount += passed ? 1 : 0;
      params.run.failCount += passed ? 0 : 1;
      params.run.score = Number(((params.run.passCount + params.run.failCount) === 0 ? 0 : (params.run.passCount / (params.run.passCount + params.run.failCount))).toFixed(4));
      await persistRun({ ...params.run });
    }

    params.run.status = 'complete';
    params.run.completedAt = new Date().toISOString();
    await persistRun({ ...params.run });
  } catch (error) {
    params.run.status = 'failed';
    params.run.completedAt = new Date().toISOString();
    await persistRun({ ...params.run });
    throw error;
  }
}



