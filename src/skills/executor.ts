import { executeCode } from '../runtime/sandbox.js';
import { SecurityError, ValidationError } from '../utils/errors.js';

const maxSourceLength = 40_000;
const maxPayloadLength = 16_000;
const maxResultLength = 64_000;

type CapabilityDefinition = { name?: string; description?: string };

function ensureSerializable(value: unknown, label: string): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return 'null';
    }
    if (serialized.length > maxPayloadLength) {
      throw new ValidationError(`${label} payload is too large`);
    }
    return serialized;
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label} must be JSON serializable`;
    throw new ValidationError(message);
  }
}

function parseCapabilityDefinitions(raw: unknown): CapabilityDefinition[] {
  return Array.isArray(raw) ? raw as CapabilityDefinition[] : [];
}

function buildWrapper(sourceCode: string, capability: string, params: unknown): string {
  if (sourceCode.length > maxSourceLength) {
    throw new ValidationError('Skill source code exceeds the maximum supported size');
  }

  const encodedParams = Buffer.from(ensureSerializable(params, 'Skill params'), 'utf8').toString('base64');

  return [
    "'use strict';",
    'const params = JSON.parse(Buffer.from(' + JSON.stringify(encodedParams) + ", 'base64').toString('utf8'));",
    'const safeStringify = (value) => JSON.stringify(value, (_key, current) => typeof current === \"bigint\" ? current.toString() : current);',
    '(async () => {',
    '  try {',
    '    const console = { log() {}, info() {}, warn() {}, error() {} };',
    `    ${sourceCode}`,
    '    if (typeof Skill !== \"function\") { throw new Error(\"Skill must define a Skill class\"); }',
    '    const instance = new Skill({});',
    `    if (typeof instance[${JSON.stringify(capability)}] !== 'function') { throw new Error('Requested capability is not callable'); }`,
    `    const result = await Promise.resolve(instance[${JSON.stringify(capability)}](params));`,
    '    const payload = safeStringify({ ok: true, result });',
    `    if (!payload || payload.length > ${maxResultLength}) { throw new Error('Skill result exceeds the maximum supported size'); }`,
    '    process.stdout.write(payload);',
    '  } catch (error) {',
    '    const message = error instanceof Error ? error.message : String(error);',
    '    process.stdout.write(JSON.stringify({ ok: false, error: message }));',
    '    process.exitCode = 1;',
    '  }',
    '})().catch((error) => {',
    '  const message = error instanceof Error ? error.message : String(error);',
    '  process.stdout.write(JSON.stringify({ ok: false, error: message }));',
    '  process.exitCode = 1;',
    '});',
  ].join('\n');
}

export async function executeSkillCapability(params: {
  sourceCode: string;
  capability: string;
  capabilityDefinitions: unknown;
  input: unknown;
}) {
  const { sourceCode, capability, capabilityDefinitions, input } = params;

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(capability)) {
    throw new ValidationError('Invalid capability name');
  }

  const definitions = parseCapabilityDefinitions(capabilityDefinitions);
  const capabilityExists = definitions.some(entry => entry?.name === capability);
  if (!capabilityExists) {
    const available = definitions.map(entry => entry.name).filter(Boolean).join(', ');
    throw new ValidationError(
      available
        ? `Capability '${capability}' not found. Available: ${available}`
        : `Capability '${capability}' not found.`
    );
  }

  const wrappedCode = buildWrapper(sourceCode, capability, input);
  const execution = await executeCode(wrappedCode, 'javascript', 10_000);

  if (!execution.stdout) {
    throw new SecurityError('Skill execution returned no output');
  }

  let parsed: { ok?: boolean; result?: unknown; error?: string };
  try {
    parsed = JSON.parse(execution.stdout);
  } catch {
    throw new SecurityError('Skill execution returned an invalid result payload');
  }

  if (!parsed.ok) {
    throw new SecurityError(parsed.error ?? 'Skill execution failed');
  }

  return {
    result: parsed.result,
    executionTimeMs: execution.durationMs,
    stderr: execution.stderr,
  };
}
