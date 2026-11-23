import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Calendar, FileJson } from 'lucide-react';

export interface ExportOption {
  id: string;
  label: string;
  description?: string;
  format: 'csv' | 'excel' | 'ics' | 'json';
  disabled?: boolean;
  onSelect: () => void;
}

interface ExportActionMenuProps {
  label?: string;
  options: ExportOption[];
  disabled?: boolean;
  className?: string;
}

export const ExportActionMenu: React.FC<ExportActionMenuProps> = ({
  label = 'Ekspor',
  options,
  disabled = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const getIcon = (fmt: ExportOption['format']) => {
    switch (fmt) {
      case 'excel':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />;
      case 'ics':
        return <Calendar className="w-4 h-4 text-sky-700 shrink-0" />;
      case 'json':
        return <FileJson className="w-4 h-4 text-slate-700 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-slate-600 shrink-0" />;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/20 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 z-50 w-full sm:w-72 bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl shadow-lg p-2 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto my-2" />
            <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-100 mb-1">
              Pilih Format Ekspor Data
            </div>
            <div className="space-y-0.5">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    opt.onSelect();
                    setOpen(false);
                  }}
                  className="w-full flex items-start gap-3 px-3 py-2.5 min-h-[44px] text-left rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <div className="mt-0.5">{getIcon(opt.format)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 truncate">{opt.label}</div>
                    {opt.description && (
                      <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                        {opt.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
