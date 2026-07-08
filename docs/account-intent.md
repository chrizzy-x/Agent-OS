# AgentOS Account Intent

Phase 07 defines signup as an intent selection, not a permanent product fork.

## Supported intents

- Retail intent supports Free and Pro.
- Enterprise intent supports Enterprise Plus and Enterprise Max.
- Free starts with browser-session access only.
- Pro, Enterprise Plus, and Enterprise Max can receive bearer-token/API access when the backend capability is active.
- Enterprise Plus and Enterprise Max expose SDK, developer console, app publishing, and skill publishing capabilities through backend gates.

## Product rules

- Super AgentOS, NL Studio, workspace, Library, Vault, apps, skills, workflows, and subagents remain part of the product for every account.
- Retail users should not see full enterprise publishing controls as normal usable controls unless they upgrade.
- Enterprise controls must be capability-gated by the backend, not by copy alone.
- Users can change plan and account intent in Settings while beta billing is disabled.
- Free accounts must show an honest no-token state instead of an empty bearer token or fake quickstart.

## Backend fields

- `account_type` is the current plan family: `retail` or `enterprise`.
- `account_intent` stores the selected onboarding intent and follows plan changes.
- `plan` stores one of `retail_free`, `retail_pro`, `enterprise_plus`, or `enterprise_max`.
- `plan_selection_skipped` means the default plan for the selected intent was used: Free for retail, Enterprise Plus for enterprise.
