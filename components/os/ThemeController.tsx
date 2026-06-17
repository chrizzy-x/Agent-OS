'use client';

import { useEffect } from 'react';

const THEME_KEY = 'agentos.theme';

type ThemePreference = 'light' | 'dark' | 'system';

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(preference: ThemePreference) {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  window.localStorage.setItem(THEME_KEY, preference);
}

export default function ThemeController() {
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const preference = isThemePreference(stored) ? stored : 'system';
    applyTheme(preference);

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onMediaChange = () => {
      const current = document.documentElement.dataset.themePreference;
      if (current === 'system') applyTheme('system');
    };
    const onThemeChange = (event: Event) => {
      const preference = (event as CustomEvent<{ theme?: unknown }>).detail?.theme;
      if (isThemePreference(preference)) applyTheme(preference);
    };

    media.addEventListener('change', onMediaChange);
    window.addEventListener('agentos:set-theme', onThemeChange);
    return () => {
      media.removeEventListener('change', onMediaChange);
      window.removeEventListener('agentos:set-theme', onThemeChange);
    };
  }, []);

  return null;
}
