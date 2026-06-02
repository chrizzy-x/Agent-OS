import { omitAgentIdentifierFields, redactAgentIdentifiers } from '../auth/display-redaction.js';
import { redactSecretsDeep, redactSecretsInString } from '../security/secret-redaction.js';

export function sanitizeOutput<T>(value: T): T {
  return redactSecretsDeep(redactAgentIdentifiers(omitAgentIdentifierFields(value))) as T;
}

export function sanitizeErrorMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? '');
  return redactSecretsInString(String(redactAgentIdentifiers(message)));
}
