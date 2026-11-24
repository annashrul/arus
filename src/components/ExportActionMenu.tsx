import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  Download,
  FileDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  Printer,
} from 'lucide-react';

export interface ExportOption {
  id: string;
  label: string;
  description?: string;
  format: 'pdf' | 'csv' | 'excel' | 'ics' | 'json' | 'print';
  disabled?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void;
}

interface ExportActionMenuProps {
  label?: string;
  menuTitle?: string;
  options: ExportOption[];
  disabled?: boolean;
  variant?: 'default' | 'primary';
  className?: string;
}

export const ExportActionMenu: React.FC<ExportActionMenuProps> = ({
  label = 'Ekspor & Cetak',
  menuTitle = 'Ekspor & Cetak Laporan',
  options,
  disabled = false,
  variant = 'default',
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
      case 'pdf':
        return <FileDown className="w-4 h-4 text-red-600 shrink-0" />;
      case 'excel':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />;
      case 'print':
        return <Printer className="w-4 h-4 text-sky-700 shrink-0" />;
      case 'ics':
        return <Calendar className="w-4 h-4 text-sky-700 shrink-0" />;
      case 'json':
        return <FileJson className="w-4 h-4 text-slate-700 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-slate-600 shrink-0" />;
    }
  };

  const buttonClasses =
    variant === 'primary'
      ? 'w-full inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50'
      : 'w-full inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={buttonClasses}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${
            variant === 'primary' ? 'text-sky-100' : 'text-slate-400'
          } ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/20 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 z-50 w-full sm:w-76 bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl shadow-lg p-2 pb-safe"
          >
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto my-2" />
            <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-100 mb-1">
              {menuTitle}
            </div>
            <div className="space-y-0.5">
              {options.map((opt) => (
                <React.Fragment key={opt.id}>
                  {opt.dividerBefore && <div className="my-1 border-t border-slate-100" />}
                  <button
                    type="button"
                    role="menuitem"
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
                </React.Fragment>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
