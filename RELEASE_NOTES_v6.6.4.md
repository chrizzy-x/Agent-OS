# AgentOS v6.6.4 - Marketplace & Capability Layer

Release date: June 20, 2026

V6.6.4 makes App Store and Skill Store first-class AgentOS primitives. Apps are complete products. Skills are reusable capabilities. Installed marketplace assets sync into ownership, Library, Workspace assets, search metadata, and execution records.

## Shipped

- `/appstore` rebuilt as a consumer App Store with live search, category chips, rotating featured hero, discovery sections, responsive 6/4/2 app grids, install, open, and device-install actions.
- `/appstore/[slug]` now includes overview, screenshots, features, analytics, changelog, similar apps, reviews, install to workspace, install to device, and launch.
- `/appstore/updates` adds available updates, update all, individual update, release notes, and rollback.
- `/skills` rebuilt as a compact capability registry with live search, category chips, dependency-aware install, and immediate availability for Super AgentOS, workflows, subagents, and apps.
- `/skills/[slug]` now includes overview, capabilities, permissions, inputs, outputs, examples, dependencies, compatibility, developer, version history, execution preview, modify access, and revoke access.
- `/developer/[handle]` adds public developer profiles keyed by safe public handles.
- Marketplace ownership persists independently from local device installs. Removing a device install does not remove account ownership.
- Workspace asset registry records installed apps and skills alongside Library sync.
- App listings now support logo URL, developer handle, keywords, tags, features, rating, review count, platforms, downloads, and active-user analytics.
- Skill metadata now supports required and optional dependencies, compatibility, examples, inputs, outputs, version history, and installation permission state.

## API

- `GET /api/apps/discovery`
- `GET /api/apps/updates`
- `POST /api/apps/updates`
- `POST /api/apps/[slug]/rollback`
- `DELETE /api/apps/[slug]/device-install`
- `GET /api/skills/discovery`
- `GET /api/skills/[id]/preview`
- `PATCH /api/skills/[id]/installation`
- `GET /api/developers/[handle]`
- `POST /api/skills/install` with `slug`, `permissionsApproved`, `installDependencies`, and optional dependency selections.

## Database

Apply `src/storage/migrations/030_v664_marketplace_capability_layer.sql`.
