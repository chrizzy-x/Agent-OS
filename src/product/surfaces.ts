export type ProductSurfaceId =
  | 'home'
  | 'studio'
  | 'search'
  | 'tasks'
  | 'projects'
  | 'library'
  | 'appstore'
  | 'skillstore'
  | 'subagents'
  | 'workflows'
  | 'memory'
  | 'vault'
  | 'universal-mcp'
  | 'developer'
  | 'community'
  | 'ffp'
  | 'docs'
  | 'settings'
  | 'workspace';

export type SurfaceAccessLevel = 'public' | 'signed_in' | 'enterprise';
export type SurfaceStatus = 'active' | 'coming_soon';
export type SurfaceMobileVisibility = 'drawer' | 'context' | 'hidden';

export type ProductSurface = {
  id: ProductSurfaceId;
  label: string;
  title: string;
  href: string;
  icon: string;
  access: SurfaceAccessLevel;
  status: SurfaceStatus;
  mobileVisibility: SurfaceMobileVisibility;
  required: boolean;
  navigation: boolean;
  aliases?: readonly string[];
  disabledReason?: string;
  primaryAction?: { label: string; href: string };
};

export const PRODUCT_SURFACES: readonly ProductSurface[] = [
  { id: 'home', label: 'Home', title: 'Home', href: '/', icon: 'H', access: 'public', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true },
  { id: 'studio', label: 'Studio', title: 'Studio', href: '/studio', icon: 'S', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, primaryAction: { label: 'Create', href: '/studio?mode=nl' } },
  { id: 'search', label: 'Search', title: 'Search', href: '/search', icon: 'Q', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: false, navigation: true },
  { id: 'tasks', label: 'Tasks', title: 'Tasks', href: '/tasks', icon: 'J', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: false, navigation: true, primaryAction: { label: 'New Chat', href: '/studio?mode=nl' } },
  { id: 'projects', label: 'Projects', title: 'Projects', href: '/projects', icon: 'P', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, primaryAction: { label: 'Create', href: '/projects?create=1' } },
  { id: 'library', label: 'Library', title: 'Library', href: '/library', icon: 'L', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true },
  { id: 'appstore', label: 'App Store', title: 'App Store', href: '/appstore', icon: 'A', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, primaryAction: { label: 'Add app', href: '/appstore' } },
  { id: 'skillstore', label: 'Skill Store', title: 'Skill Store', href: '/skillstore', icon: 'K', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, aliases: ['/skills'], primaryAction: { label: 'Add skill', href: '/skillstore' } },
  { id: 'subagents', label: 'Subagents', title: 'Subagents', href: '/subagents', icon: 'G', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, aliases: ['/agents'], primaryAction: { label: 'Create', href: '/subagents?create=1' } },
  { id: 'workflows', label: 'Workflows', title: 'Workflows', href: '/workflows', icon: 'W', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, primaryAction: { label: 'Create', href: '/studio?mode=workflow&new=1' } },
  { id: 'memory', label: 'Memory', title: 'Memory', href: '/memory', icon: 'M', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true },
  { id: 'vault', label: 'Vault', title: 'Vault', href: '/vault', icon: 'V', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, primaryAction: { label: 'Save', href: '/vault?create=secret' } },
  { id: 'universal-mcp', label: 'Universal MCP', title: 'Universal MCP', href: '/mcp', icon: 'U', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, aliases: ['/connectors'] },
  { id: 'developer', label: 'Developer', title: 'Developer', href: '/developer', icon: 'D', access: 'enterprise', status: 'active', mobileVisibility: 'drawer', required: false, navigation: true, aliases: ['/publish'], primaryAction: { label: 'Publish', href: '/publish/app' } },
  { id: 'community', label: 'Community', title: 'Community', href: '/community', icon: 'C', access: 'public', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true },
  {
    id: 'ffp',
    label: 'FFP',
    title: 'FFP',
    href: '/ffp',
    icon: 'F',
    access: 'public',
    status: 'coming_soon',
    mobileVisibility: 'drawer',
    required: true,
    navigation: true,
    disabledReason: 'Fabric Furge Protocol is visible for roadmap context, but runtime routing, validators, proof events, and consensus are disabled.',
  },
  { id: 'docs', label: 'Docs', title: 'Docs', href: '/resources', icon: 'D', access: 'public', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, aliases: ['/docs'] },
  { id: 'settings', label: 'Settings', title: 'Settings', href: '/settings', icon: 'T', access: 'signed_in', status: 'active', mobileVisibility: 'drawer', required: true, navigation: true, aliases: ['/profile', '/billing'], primaryAction: { label: 'Save', href: '/settings' } },
  { id: 'workspace', label: 'Workspace', title: 'Workspace', href: '/workspace', icon: 'W', access: 'signed_in', status: 'active', mobileVisibility: 'context', required: true, navigation: false, aliases: ['/workspaces'] },
] as const;

export const REQUIRED_PRODUCT_SURFACE_IDS = PRODUCT_SURFACES
  .filter(surface => surface.required)
  .map(surface => surface.id);

export const NAVIGATION_SURFACES = PRODUCT_SURFACES.filter(surface => surface.navigation);

export function getProductSurfaceById(id: ProductSurfaceId) {
  return PRODUCT_SURFACES.find(surface => surface.id === id) ?? null;
}

export function isProductSurfaceActivePath(pathname: string, surface: ProductSurface) {
  if (surface.href === '/') return pathname === '/';
  return pathname === surface.href
    || pathname.startsWith(`${surface.href}/`)
    || Boolean(surface.aliases?.some(alias => pathname === alias || pathname.startsWith(`${alias}/`)));
}

export function pageTitleForProductPath(pathname: string) {
  if (pathname === '/') return 'Home';
  return PRODUCT_SURFACES.find(surface => isProductSurfaceActivePath(pathname, surface))?.title ?? 'AgentOS';
}

export function primaryActionForProductPath(pathname: string) {
  return PRODUCT_SURFACES.find(surface => isProductSurfaceActivePath(pathname, surface))?.primaryAction ?? null;
}
