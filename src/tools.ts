import { memSet, memGet, memDelete, memList, memIncr, memExpire } from './primitives/mem.js';
import { fsWrite, fsRead, fsList, fsDelete, fsMkdir, fsStat } from './primitives/fs.js';
import { dbQuery, dbTransaction, dbCreateTable, dbInsert, dbUpdate, dbDelete } from './primitives/db.js';
import { netHttpGet, netHttpPost, netHttpPut, netHttpDelete, netDnsResolve } from './primitives/net.js';
import { eventsPublish, eventsSubscribe, eventsUnsubscribe, eventsListTopics } from './primitives/events.js';
import { procExecute, procSchedule, procSpawn, procKill, procList } from './primitives/proc.js';
import { xAccountsList, xDraftCreate, xMentionsPull, xMetricsSync, xPublishNow, xQueueApprove, xQueueSchedule } from './integrations/x/service.js';
import type { AgentContext } from './auth/permissions.js';

export type ToolHandler = (ctx: AgentContext, input: unknown) => Promise<unknown>;

export const TOOLS: Record<string, ToolHandler> = {
  // Memory primitive
  mem_set: memSet,
  mem_get: memGet,
  mem_delete: memDelete,
  mem_list: memList,
  mem_incr: memIncr,
  mem_expire: memExpire,

  // Filesystem primitive
  fs_write: fsWrite,
  fs_read: fsRead,
  fs_list: fsList,
  fs_delete: fsDelete,
  fs_mkdir: fsMkdir,
  fs_stat: fsStat,

  // Database primitive
  db_query: dbQuery,
  db_transaction: dbTransaction,
  db_create_table: dbCreateTable,
  db_insert: dbInsert,
  db_update: dbUpdate,
  db_delete: dbDelete,

  // Network primitive
  net_http_get: netHttpGet,
  net_http_post: netHttpPost,
  net_http_put: netHttpPut,
  net_http_delete: netHttpDelete,
  net_dns_resolve: netDnsResolve,

  // Events primitive
  events_publish: eventsPublish,
  events_subscribe: eventsSubscribe,
  events_unsubscribe: eventsUnsubscribe,
  events_list_topics: eventsListTopics,

  // Process primitive
  proc_execute: procExecute,
  proc_schedule: procSchedule,
  proc_spawn: procSpawn,
  proc_kill: procKill,
  proc_list: procList,

  // X account management tools
  x_accounts_list: xAccountsList,
  x_draft_create: xDraftCreate,
  x_mentions_pull: xMentionsPull,
  x_metrics_sync: xMetricsSync,
  x_publish_now: xPublishNow,
  x_queue_approve: xQueueApprove,
  x_queue_schedule: xQueueSchedule,
};