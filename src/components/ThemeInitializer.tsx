'use client';

import { useEffect } from 'react';

export function ThemeInitializer() {
  useEffect(() => {
    try {
      const theme = localStorage.getItem('theme');
      const shouldUseDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', shouldUseDark);
    } catch {}

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem('theme')) {
          return;
        }
      } catch {}
      document.documentElement.classList.toggle('dark', event.matches);
    };

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return null;
}
