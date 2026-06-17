# AgentOS V6.6.2 Release Notes

## Summary

AgentOS V6.6.2 makes Super AgentOS the locked primary product surface across desktop and mobile.

## UI/UX Execution Lock

- `/` and `/studio` open Super AgentOS first.
- Desktop uses the mandatory Sidebar / Super AgentOS / Context layout.
- Mobile uses an AgentOS top bar, conversation-first main view, bottom navigation, and More drawer.
- NL Studio, Workflow Studio, and Code Studio are visually distinct work modes.
- Sidebar navigation, status, Panic, and compact context rows are first-class.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`

## Docs

- README, public docs, API docs, audit notes, and launch notes identify V6.6.2 as the current release.
- Health examples, migration notes, and Studio-first UI wording are aligned with this release.

## Production

- Production URL: https://www.agentos.services
- Deployment alias: https://www.agentos.services
- Deployed: June 13, 2026
- Supabase sync: `library_items` and `agent_runtime_controls` verified present.
