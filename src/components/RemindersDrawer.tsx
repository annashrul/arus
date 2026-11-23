import React, { useMemo, useState } from 'react';
import { ClubProfile } from '../types/club';
import {
  buildDailyScheduleWhatsAppDigest,
  ClubReminder,
  ReminderCategory,
} from '../lib/reminders';
import { NavSection } from './OverviewView';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Receipt,
  RotateCcw,
  X,
} from 'lucide-react';

interface RemindersDrawerProps {
  open: boolean;
  onClose: () => void;
  club: ClubProfile;
  reminders: ClubReminder[];
  dismissedIds: string[];
  onDismiss: (id: string) => void;
  onResetDismissed: () => void;
  onNavigate: (section: NavSection) => void;
}

export const RemindersDrawer: React.FC<RemindersDrawerProps> = ({
  open,
  onClose,
  club,
  reminders,
  dismissedIds,
  onDismiss,
  onResetDismissed,
  onNavigate,
}) => {
  const [filterCat, setFilterCat] = useState<'all' | ReminderCategory>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedDigest, setCopiedDigest] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });
  const [browserNotifMsg, setBrowserNotifMsg] = useState<string | null>(null);

  const visibleReminders = useMemo(() => {
    return reminders.filter((r) => {
      if (dismissedIds.includes(r.id)) return false;
      if (filterCat === 'all') return true;
      if (filterCat === 'schedule') return r.category === 'schedule' || r.category === 'attendance';
      return r.category === filterCat;
    });
  }, [reminders, dismissedIds, filterCat]);

  const urgentCount = useMemo(
    () => reminders.filter((r) => !dismissedIds.includes(r.id) && r.severity === 'urgent').length,
    [reminders, dismissedIds]
  );

  if (!open) return null;

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyDigest = () => {
    const active = reminders.filter((r) => !dismissedIds.includes(r.id));
    if (active.length === 0) return;
    navigator.clipboard.writeText(buildDailyScheduleWhatsAppDigest(club, active));
    setCopiedDigest(true);
    setTimeout(() => setCopiedDigest(false), 2000);
  };

  const handleTriggerBrowserNotification = async () => {
    setBrowserNotifMsg(null);
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPermission('unsupported');
      setBrowserNotifMsg('Browser ini belum mendukung notifikasi desktop/mobile.');
      return;
    }

    let perm = window.Notification.permission;
    if (perm === 'default') {
      try {
        perm = await window.Notification.requestPermission();
        setNotifPermission(perm);
      } catch {
        setBrowserNotifMsg('Gagal meminta izin notifikasi browser.');
        return;
      }
    }

    if (perm !== 'granted') {
      setBrowserNotifMsg('Izin notifikasi ditolak di pengaturan browser Anda.');
      return;
    }

    const active = reminders.filter((r) => !dismissedIds.includes(r.id));
    const headline =
      active.length > 0
        ? `${active.length} pengingat aktif (${urgentCount} mendesak) — ${active[0].title}`
        : `Semua jadwal latihan dan tagihan ${club.name} dalam kondisi aman.`;

    try {
      new window.Notification(`Pengingat ${club.name}`, {
        body: headline,
      });
      setBrowserNotifMsg('Notifikasi pengingat berhasil dikirim ke perangkat Anda.');
    } catch {
      setBrowserNotifMsg('Tidak dapat memicu notifikasi pada tab tersemat ini.');
    }
  };

  const getCategoryIcon = (r: ClubReminder) => {
    if (r.category === 'invoice') {
      return (
        <Receipt
          className={`w-4 h-4 shrink-0 ${
            r.severity === 'urgent' ? 'text-red-600' : 'text-amber-600'
          }`}
        />
      );
    }
    if (r.category === 'attendance') {
      return <Clock className="w-4 h-4 shrink-0 text-amber-600" />;
    }
    if (r.category === 'announcement') {
      return <FileText className="w-4 h-4 shrink-0 text-sky-700" />;
    }
    return <CalendarDays className="w-4 h-4 shrink-0 text-sky-700" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch justify-end bg-slate-900/40 backdrop-blur-[1px] no-print">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <aside
        aria-label="Pusat Notifikasi Pengingat"
        className="relative z-10 w-full sm:max-w-md bg-white border-t sm:border-t-0 sm:border-l border-slate-200 rounded-t-2xl sm:rounded-none h-[88vh] sm:h-full flex flex-col pb-safe"
      >
        <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3" />

        {/* Drawer Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bell className="w-5 h-5 text-sky-700 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-slate-900 truncate">
                Notifikasi & Pengingat
              </h2>
              <p className="text-xs text-slate-500 truncate">
                <span className="font-mono-tabular">{reminders.length - dismissedIds.length}</span> aktif
                {urgentCount > 0 && (
                  <>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="text-red-600 font-medium font-mono-tabular">
                      {urgentCount} mendesak
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Tutup panel pengingat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Strip: Browser Notification & Copy WhatsApp Digest */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleTriggerBrowserNotification}
              disabled={notifPermission === 'unsupported'}
              className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[40px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer disabled:opacity-50"
            >
              <BellRing className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              <span className="truncate">
                {notifPermission === 'granted' ? 'Kirim Notif Uji' : 'Aktifkan Notif'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleCopyDigest}
              disabled={reminders.length - dismissedIds.length === 0}
              className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[40px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer disabled:opacity-50"
            >
              {copiedDigest ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Ringkasan Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Salin Rekap WA</span>
                </>
              )}
            </button>
          </div>
          {browserNotifMsg && (
            <p className="text-[11px] text-slate-600">{browserNotifMsg}</p>
          )}
        </div>

        {/* Category Filter */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'invoice', label: 'Tagihan' },
              { id: 'schedule', label: 'Jadwal & Presensi' },
              { id: 'announcement', label: 'Agenda' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterCat(tab.id)}
              className={`px-3 min-h-[36px] text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                filterCat === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Reminder List */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
          {visibleReminders.length === 0 ? (
            <div className="py-12 text-center space-y-2.5">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">Tidak ada pengingat aktif</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Semua tagihan jatuh tempo, jadwal latihan hari ini/besok, dan agenda terdekat sudah terpantau.
              </p>
              {dismissedIds.length > 0 && (
                <button
                  type="button"
                  onClick={onResetDismissed}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-700 hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Tampilkan {dismissedIds.length} pengingat yang ditunda
                </button>
              )}
            </div>
          ) : (
            visibleReminders.map((r) => (
              <div
                key={r.id}
                className={`border rounded-xl p-3.5 space-y-2.5 ${
                  r.severity === 'urgent'
                    ? 'border-red-200 bg-red-50/40'
                    : r.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50/30'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5">{getCategoryIcon(r)}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-900">{r.title}</span>
                        {r.severity === 'urgent' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                            <AlertTriangle className="w-3 h-3" />
                            Mendesak
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
                        {r.description}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 font-mono-tabular">{r.meta}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(r.targetNav);
                        onClose();
                      }}
                      className="px-2.5 min-h-[36px] text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg cursor-pointer"
                    >
                      {r.actionLabel}
                    </button>
                    {r.whatsappText && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(r.id, r.whatsappText!)}
                        className="inline-flex items-center gap-1 px-2.5 min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                      >
                        {copiedId === r.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            Tersalin
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Salin WA
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDismiss(r.id)}
                    className="px-2.5 min-h-[36px] text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Tandai Selesai
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {dismissedIds.length > 0 && visibleReminders.length > 0 && (
          <div className="px-4 sm:px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>{dismissedIds.length} pengingat ditunda hari ini</span>
            <button
              type="button"
              onClick={onResetDismissed}
              className="font-medium text-sky-700 hover:underline cursor-pointer"
            >
              Pulihkan Semua
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
