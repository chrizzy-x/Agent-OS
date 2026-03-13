import { AsyncLocalStorage } from 'async_hooks';
import type { AgentContext } from './permissions.js';
import { AuthError } from '../utils/errors.js';

// AsyncLocalStorage lets us propagate the authenticated AgentContext through
// the entire async call stack of a request without passing it explicitly
// through every function signature. Used by the HTTP middleware in index.ts.
const storage = new AsyncLocalStorage<AgentContext>();

// Run a callback with an AgentContext bound to the current async context.
// All calls inside fn() can retrieve the context via getAgentContext().
export function runWithAgentContext<T>(ctx: AgentContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

// Retrieve the AgentContext for the current request.
// Throws AuthError if called outside of a runWithAgentContext() scope.
export function getAgentContext(): AgentContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new AuthError('No agent context found — request must be authenticated first');
  }
  return ctx;
}

// Check whether code is currently running inside an agent context.
// Useful for conditional logic in shared utilities.
export function hasAgentContext(): boolean {
  return storage.getStore() !== undefined;
}
