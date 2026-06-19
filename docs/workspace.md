# AgentOS Workspace State

The shell bootstrap endpoint returns accessible workspaces, sessions, projects, unread notification count, and connected external-agent count.

The browser stores:

- active workspace globally
- active project per workspace
- active session per workspace
- left and right sidebar collapse state

Stored identifiers are validated against each authenticated bootstrap response. Workspace changes update the URL and dispatch an in-app workspace event. Studio safely cancels active streaming before switching and reloads the selected workspace context without a document refresh.
