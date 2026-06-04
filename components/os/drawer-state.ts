'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export type DrawerId =
  | 'session-history'
  | 'workflow-graph'
  | 'workflow-code'
  | 'installed-skills'
  | 'installed-apps'
  | 'secrets'
  | 'logs'
  | 'settings'
  | 'app-preview'
  | 'app-install'
  | 'route-detail'
  | 'primitive-detail'
  | 'ffp-logs'
  | 'secret-details'
  | 'secret-history'
  | 'secret-assign'
  | 'search-result'
  | 'connector-detail'
  | 'connector-health'
  | 'vault-create'
  | 'vault-detail'
  | 'vault-history'
  | 'vault-assign'
  | 'vault-runtime'
  | 'developer-detail'
  | 'sdk-detail';

export type DrawerState<T extends string = DrawerId> = {
  id: T;
  entityId?: string | null;
};

export function useRouteDrawer<T extends string = DrawerId>(param = 'drawer', entityParam = 'item') {
  const router = useRouter();
  const pathname = usePathname();
  const [current, setCurrent] = useState<DrawerState<T> | null>(null);

  const syncFromLocation = useCallback(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const id = searchParams.get(param);
    if (!id) {
      setCurrent(null);
      return;
    }
    setCurrent({
      id: id as T,
      entityId: searchParams.get(entityParam),
    });
  }, [entityParam, param]);

  useEffect(() => {
    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, [syncFromLocation]);

  function update(next: DrawerState<T> | null) {
    const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    if (!next) {
      params.delete(param);
      params.delete(entityParam);
    } else {
      params.set(param, next.id);
      if (next.entityId) params.set(entityParam, next.entityId);
      else params.delete(entityParam);
    }
    setCurrent(next);
    router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }

  return {
    current,
    openDrawer: (id: T, entityId?: string | null) => update({ id, entityId }),
    closeDrawer: () => update(null),
  };
}
