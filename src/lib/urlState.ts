import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';

const URL_CHANGE = 'arus:url-change';
const listen = (notify: () => void) => {
  window.addEventListener('popstate', notify);
  window.addEventListener(URL_CHANGE, notify);
  return () => {
    window.removeEventListener('popstate', notify);
    window.removeEventListener(URL_CHANGE, notify);
  };
};

/** URL state is shared by all views and survives refresh, copied links and history navigation. */
export function useUrlState<T extends string | boolean>(
  key: string,
  defaultValue: T,
  options?: { values?: readonly string[]; history?: 'push' | 'replace' }
): [T, Dispatch<SetStateAction<T>>] {
  const search = useSyncExternalStore(listen, () => window.location.search, () => '');
  const raw = new URLSearchParams(search).get(key);
  const value = raw === null || (options?.values && !options.values.includes(raw))
    ? defaultValue
    : (typeof defaultValue === 'boolean' ? raw === 'true' : raw) as T;
  const setValue = useCallback((update: SetStateAction<T>) => {
    const url = new URL(window.location.href);
    const current = url.searchParams.get(key);
    const previous = (current === null ? defaultValue : typeof defaultValue === 'boolean' ? current === 'true' : current) as T;
    const next = typeof update === 'function' ? (update as (previous: T) => T)(previous) : update;
    if (next === defaultValue) url.searchParams.delete(key);
    else url.searchParams.set(key, String(next));
    if (url.href === window.location.href) return;
    window.history[options?.history === 'push' ? 'pushState' : 'replaceState']({}, '', url);
    window.dispatchEvent(new Event(URL_CHANGE));
  }, [key, defaultValue, options?.history]);
  return [value, setValue];
}
