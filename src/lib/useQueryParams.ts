import { useCallback, useSyncExternalStore } from 'react';

const QUERY_EVENT = 'tirta:querychange';

function getSearchSnapshot(): string {
  if (typeof window === 'undefined') return '';
  return window.location.search;
}

function subscribeQueryChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('popstate', callback);
  window.addEventListener(QUERY_EVENT, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(QUERY_EVENT, callback);
  };
}

export function batchSetQueryParams(
  updates: Record<string, string | null | undefined>,
  historyMode: 'push' | 'replace' = 'replace'
): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  let changed = false;

  for (const [key, rawVal] of Object.entries(updates)) {
    const nextVal = rawVal == null ? '' : String(rawVal);
    const prevVal = params.get(key) ?? '';
    if (nextVal === '') {
      if (params.has(key)) {
        params.delete(key);
        changed = true;
      }
    } else if (prevVal !== nextVal) {
      params.set(key, nextVal);
      changed = true;
    }
  }

  if (!changed) return;

  const qs = params.toString();
  const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  if (historyMode === 'push') {
    window.history.pushState(null, '', nextUrl);
  } else {
    window.history.replaceState(null, '', nextUrl);
  }
  window.dispatchEvent(new CustomEvent(QUERY_EVENT));
}

export function getQueryParamValue(key: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(key) ?? '';
}

export function useQueryParam<T extends string>(
  key: string,
  defaultValue: T,
  options: {
    allowed: readonly T[];
    history?: 'push' | 'replace';
  }
): [T, (next: T | ((prev: T) => T), overrideHistory?: 'push' | 'replace') => void];
export function useQueryParam(
  key: string,
  defaultValue: string,
  options?: {
    history?: 'push' | 'replace';
  }
): [string, (next: string | ((prev: string) => string), overrideHistory?: 'push' | 'replace') => void];
export function useQueryParam<T extends string = string>(
  key: string,
  defaultValue: T,
  options?: {
    allowed?: readonly T[];
    history?: 'push' | 'replace';
  }
): [T, (next: T | ((prev: T) => T), overrideHistory?: 'push' | 'replace') => void] {
  const search = useSyncExternalStore(subscribeQueryChange, getSearchSnapshot, () => '');

  const raw = new URLSearchParams(search).get(key);
  let value: T = defaultValue;
  if (raw !== null && raw !== '') {
    if (!options?.allowed || options.allowed.includes(raw as T)) {
      value = raw as T;
    }
  }

  const defaultHistory = options?.history ?? 'replace';

  const setValue = useCallback(
    (next: T | ((prev: T) => T), overrideHistory?: 'push' | 'replace') => {
      const currentRaw = new URLSearchParams(window.location.search).get(key);
      let current: T = defaultValue;
      if (currentRaw !== null && currentRaw !== '') {
        if (!options?.allowed || options.allowed.includes(currentRaw as T)) {
          current = currentRaw as T;
        }
      }
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
      const serialized = resolved === defaultValue ? '' : resolved;
      batchSetQueryParams({ [key]: serialized }, overrideHistory ?? defaultHistory);
    },
    [key, defaultValue, options?.allowed, defaultHistory]
  );

  return [value, setValue];
}

export async function copyCurrentPageUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const url = window.location.href;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const el = document.createElement('textarea');
    el.value = url;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
