import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, RotateCcw, Search, X } from 'lucide-react';

export interface BottomSheetOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

interface BottomSheetSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: BottomSheetOption[];
  title: string;
  subtitle?: string;
  placeholder?: string;
  triggerPrefix?: string;
  icon?: React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  resetValue?: string;
  resetLabel?: string;
  ariaLabel?: string;
  className?: string;
  hasError?: boolean;
  disabled?: boolean;
}

export const BottomSheetSelect: React.FC<BottomSheetSelectProps> = ({
  value,
  onChange,
  options,
  title,
  subtitle,
  placeholder = 'Pilih opsi...',
  triggerPrefix,
  icon,
  searchable,
  searchPlaceholder = 'Cari pilihan...',
  resetValue,
  resetLabel = 'Reset',
  ariaLabel,
  className = '',
  hasError = false,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const showSearch = searchable ?? options.length > 7;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.description && opt.description.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  const showReset = resetValue !== undefined && value !== resetValue;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        aria-label={ariaLabel || title}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`w-full inline-flex items-center justify-between gap-2 px-3 min-h-[44px] sm:min-h-[38px] text-left text-sm sm:text-xs font-medium rounded-lg border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          hasError
            ? 'border-red-400 bg-red-50/40 text-slate-900'
            : showReset
            ? 'border-sky-300 bg-sky-50/60 text-sky-900 hover:bg-sky-50'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
        } ${className}`}
      >
        <span className="inline-flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
          <span className="truncate">
            {triggerPrefix && (
              <span className="text-slate-400 font-normal mr-1">{triggerPrefix}</span>
            )}
            <span className={selectedOption ? 'text-slate-900' : 'text-slate-400 font-normal'}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div
              className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full sm:max-w-md bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl max-h-[85vh] flex flex-col overflow-hidden pb-safe">
              {/* Mobile drag handle */}
              <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 shrink-0" />

              {/* Sheet header */}
              <div className="px-4 sm:px-5 pt-3 sm:pt-4 pb-3 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-slate-900 truncate">
                    {title}
                  </h3>
                  {subtitle && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{subtitle}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {showReset && (
                    <button
                      type="button"
                      onClick={() => handleSelect(resetValue)}
                      className="inline-flex items-center gap-1 px-2.5 min-h-[36px] text-xs font-medium text-sky-700 hover:bg-sky-50 rounded-lg cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {resetLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                    aria-label="Tutup pilihan"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Search box when options are numerous */}
              {showSearch && (
                <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 bg-slate-50/70 shrink-0">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={searchPlaceholder}
                      className="w-full pl-9 pr-8 min-h-[42px] sm:min-h-[36px] text-base sm:text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                        aria-label="Hapus pencarian"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Option list */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {filteredOptions.length === 0 ? (
                  <div className="py-10 px-4 text-center text-xs text-slate-500">
                    Tidak ada pilihan yang cocok dengan &ldquo;{query}&rdquo;.
                  </div>
                ) : (
                  filteredOptions.map((opt) => {
                    const active = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelect(opt.value)}
                        className={`w-full px-4 sm:px-5 py-3 min-h-[52px] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                          active ? 'bg-sky-50/80' : 'hover:bg-slate-50 active:bg-slate-100'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm truncate ${
                                active ? 'font-semibold text-sky-900' : 'font-medium text-slate-800'
                              }`}
                            >
                              {opt.label}
                            </span>
                            {opt.badge && (
                              <span className="text-[11px] font-mono-tabular text-slate-500 shrink-0">
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          {opt.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                              {opt.description}
                            </p>
                          )}
                        </div>
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                            active ? 'bg-sky-700 text-white' : 'border border-slate-300'
                          }`}
                        >
                          {active && <Check className="w-3.5 h-3.5" />}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
