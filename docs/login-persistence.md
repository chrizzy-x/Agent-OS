# Login Persistence

Phase 09 keeps browser login state durable without storing auth tokens in browser storage.

## Session model

- Access credentials live in the `agent_access` httpOnly cookie.
- Refresh credentials live in the `agent_refresh` httpOnly cookie.
- The browser may keep a non-secret `agentos.browserSessionSeen` marker so expired-session recovery can survive normal browser restarts.
- The marker contains no token, agent id, secret, or capability data.

## Recovery behavior

- Normal page loads call `/api/session`.
- If the access cookie is expired but the refresh cookie is valid, the server rotates the refresh session and issues a new access cookie.
- If refresh fails and the browser has a recent marker, the UI should show an expired-session recovery state.
- If no marker exists, the UI should show a signed-out state.

## Logout behavior

- Logout calls `DELETE /api/session`.
- The server clears access, refresh, and legacy session cookies.
- The browser clears legacy local auth fields and the non-secret session marker.
