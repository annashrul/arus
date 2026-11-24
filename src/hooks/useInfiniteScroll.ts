import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseInfiniteScrollOptions {
  initialCount?: number;
  step?: number;
  resetKey?: string;
}

export function useInfiniteScroll<T>(
  items: T[],
  options?: UseInfiniteScrollOptions
) {
  const initialCount = options?.initialCount ?? 20;
  const step = options?.step ?? 20;
  const resetKey = options?.resetKey ?? '';

  const [visibleCount, setVisibleCount] = useState(initialCount);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset pagination cleanly whenever filter/search/tab key changes
  useEffect(() => {
    setVisibleCount(initialCount);
  }, [resetKey, initialCount]);

  const totalCount = items.length;
  const clampedCount = Math.min(visibleCount, totalCount);
  const hasMore = clampedCount < totalCount;

  const visibleItems = useMemo(
    () => items.slice(0, clampedCount),
    [items, clampedCount]
  );

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + step, totalCount));
  }, [step, totalCount]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((prev) => Math.min(prev + step, totalCount));
          }
        }
      },
      {
        root: null,
        rootMargin: '220px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, step, totalCount, clampedCount]);

  return {
    visibleItems,
    visibleCount: clampedCount,
    totalCount,
    hasMore,
    loadMore,
    sentinelRef,
    reset: () => setVisibleCount(initialCount),
  };
}
