import React from 'react';
import { ChevronDown } from 'lucide-react';

interface InfiniteScrollSentinelProps {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  visibleCount: number;
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  itemLabel?: string;
  compact?: boolean;
}

export const InfiniteScrollSentinel: React.FC<InfiniteScrollSentinelProps> = ({
  sentinelRef,
  visibleCount,
  totalCount,
  hasMore,
  onLoadMore,
  itemLabel = 'data',
  compact = false,
}) => {
  if (totalCount === 0) return null;

  return (
    <div
      ref={sentinelRef}
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-t border-slate-100 bg-slate-50/50 ${
        compact ? 'px-3.5 py-2.5' : 'px-4 py-3'
      }`}
    >
      <span className="text-xs text-slate-500 font-mono-tabular">
        Menampilkan {visibleCount.toLocaleString('id-ID')} dari{' '}
        {totalCount.toLocaleString('id-ID')} {itemLabel}
      </span>

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[40px] sm:min-h-[32px] text-xs font-medium text-sky-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Muat Lebih Banyak
        </button>
      )}
    </div>
  );
};
