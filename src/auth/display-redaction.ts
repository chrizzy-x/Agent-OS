const SENSITIVE_AGENT_ID_KEYS = new Set([
  'agentId',
  'agent_id',
  'subAgentId',
  'sub_agent_id',
  'childAgentId',
  'child_agent_id',
  'parentAgentId',
  'parent_agent_id',
  'ownerAgentId',
  'owner_agent_id',
  'ownerId',
  'owner_id',
  'actorId',
  'actor_id',
  'userId',
  'user_id',
  'callerId',
  'caller_id',
  'createdBy',
  'created_by',
  'triggeredBy',
  'triggered_by',
  'owner_email',
  'author_id',
  'author_agent_id',
  'developer_id',
  'publisherId',
  'publisher_id',
]);

export function redactAgentIdentifiers(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactAgentIdentifiers);
  }

  if (typeof value === 'string') {
    return value.replace(/\bagent_[A-Za-z0-9_-]{8,}\b/g, '[private-agent]');
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_AGENT_ID_KEYS.has(key) ? '[private]' : redactAgentIdentifiers(nested),
    ]),
  );
}

export function omitAgentIdentifierFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitAgentIdentifierFields);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_AGENT_ID_KEYS.has(key))
      .map(([key, nested]) => [key, omitAgentIdentifierFields(nested)]),
  );
}

export function formatRedactedJson(value: unknown): string {
  return JSON.stringify(redactAgentIdentifiers(value), null, 2);
}
