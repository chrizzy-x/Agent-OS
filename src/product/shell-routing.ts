export type ShellNavigationContext = {
  workspaceId: string | null;
  projectId: string | null;
  sessionId: string | null;
};

const EXCLUDED_CONTEXT_PREFIXES = ['/signin', '/signup', '/login', '/forgot-password', '/onboarding'];

export function appendShellContextToHref(href: string, context: ShellNavigationContext) {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  if (EXCLUDED_CONTEXT_PREFIXES.some(prefix => href === prefix || href.startsWith(`${prefix}/`))) return href;

  const [pathAndQuery, hash = ''] = href.split('#', 2);
  const [pathname, query = ''] = pathAndQuery.split('?', 2);
  const params = new URLSearchParams(query);

  if (context.workspaceId && !params.has('workspace')) params.set('workspace', context.workspaceId);
  if (context.projectId && !params.has('project')) params.set('project', context.projectId);
  if (context.sessionId && pathname === '/studio' && !params.has('session')) params.set('session', context.sessionId);

  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`;
}
