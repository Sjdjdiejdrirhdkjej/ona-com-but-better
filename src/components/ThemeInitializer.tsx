'use client';

import { useEffect } from 'react';

export function ThemeInitializer() {
  useEffect(() => {
    try {
      const theme = localStorage.getItem('theme');
      const shouldUseDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', shouldUseDark);
    } catch {}
  }, []);

  return null;
}
