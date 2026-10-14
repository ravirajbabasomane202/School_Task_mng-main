import { useEffect, useState } from 'react';

function getMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query)?.matches ?? false;
}

/** Subscribes to a CSS media query. Returns false when matchMedia is unavailable (SSR / old tests). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getMatch(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia(query);
    if (!mql) return undefined;
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari < 14
    mql.addListener?.(onChange);
    return () => mql.removeListener?.(onChange);
  }, [query]);

  return matches;
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useIsMd = () => useMediaQuery('(min-width: 768px)');
/** True below the md breakpoint (phones / small tablets). False when matchMedia is unavailable, so tests render the desktop table. */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
