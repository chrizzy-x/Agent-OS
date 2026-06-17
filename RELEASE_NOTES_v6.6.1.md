# AgentOS V6.6.2 Release Notes

Production closure release for the existing v6.6 line. This release does not redesign AgentOS or add demo flows.

## Shipped

- Appstore generic browsing is public-only, even for signed-in users. Private, workspace, and internal records remain available through owner/admin views instead of appearing as marketplace apps.
- Local Appstore catalog fallback is disabled by default and can only be enabled in development with `AGENTOS_ALLOW_LOCAL_APPSTORE_FALLBACK=1`.
- Same-origin client API calls now retry once after a successful browser-session refresh, preserving page state after access-token expiry.
- AgentOS actions now return additive `executionId`, `notificationId`, `auditId`, and `deepLink` fields while preserving existing response shapes.
- Completed actions write audit metadata, success notifications, and execution action metadata.
- Recovery actions persist requested action metadata onto execution records.
- Migration `028_v661_production_closure.sql` adds additive audit, execution recovery, runtime-control, and library linkage fields.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`
- Browser QA across desktop and mobile product surfaces
