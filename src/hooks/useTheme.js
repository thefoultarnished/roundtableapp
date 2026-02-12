import { useEffect } from 'react';

export function useTheme() {
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = storedTheme === 'dark' || (!storedTheme && systemPrefersDark);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Also set body classes
    document.body.classList.add('h-screen', 'antialiased', 'overflow-hidden');
  }, []);
}
