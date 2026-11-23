import React, { useMemo } from 'react';
import {
  Athlete,
  AttendanceRecord,
  ClubAnnouncement,
  ClubInvoice,
  ClubProfile,
  FinanceTransaction,
  formatDateID,
  formatRupiah,
  SwimTime,
  TrainingSchedule,
} from '../types/club';
import {
  downloadFullClubExcel,
  downloadJSONBackup,
  downloadSchedulesICS,
} from '../lib/exportUtils';
import { ClubReminder } from '../lib/reminders';
import { ExportActionMenu } from './ExportActionMenu';
import { PrintReportKind } from './PrintReportModal';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Award,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  Printer,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { CashflowTrendChart, SwimTimeTrendChart } from './TrendCharts';

export type NavSection =
  | 'overview'
  | 'finance'
  | 'athletes'
  | 'schedules'
  | 'invoices';

interface OverviewViewProps {
  club: ClubProfile;
  athletes: Athlete[];
  swimTimes: SwimTime[];
  transactions: FinanceTransaction[];
  schedules: TrainingSchedule[];
  attendance: AttendanceRecord[];
  invoices: ClubInvoice[];
  announcements: ClubAnnouncement[];
  reminders: ClubReminder[];
  onOpenReminders: () => void;
  onOpenPrintReport: (kind: PrintReportKind) => void;
  onNavigate: (section: NavSection) => void;
  onLoadSampleData?: () => Promise<void>;
  seedingSample?: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  club,
  athletes,
  swimTimes,
  transactions,
  schedules,
  attendance,
  invoices,
  announcements,
  reminders,
  onOpenReminders,
  onOpenPrintReport,
  onNavigate,
  onLoadSampleData,
  seedingSample,
}) => {
  const financeTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      if (tx.type === 'pemasukan') income += tx.amount;
      else expense += tx.amount;
    }
    return {
      income,
      expense,
      balance: income - expense,
    };
  }, [transactions]);

  const activeAthletesCount = useMemo(
    () => athletes.filter((a) => a.status === 'Aktif').length,
    [athletes]
  );

  const unpaidInvoices = useMemo(
    () => invoices.filter((i) => i.status === 'Belum Lunas' || i.status === 'Jatuh Tempo'),
    [invoices]
  );

  const unpaidTotal = useMemo(
    () => unpaidInvoices.reduce((acc, inv) => acc + inv.amount, 0),
    [unpaidInvoices]
  );

  const personalBestCount = useMemo(
    () => swimTimes.filter((st) => st.isPersonalBest).length,
    [swimTimes]
  );

  const medalStats = useMemo(() => {
    let gold = 0;
    let silver = 0;
    let bronze = 0;
    for (const st of swimTimes) {
      if (st.medal === 'Emas') gold++;
      else if (st.medal === 'Perak') silver++;
      else if (st.medal === 'Perunggu') bronze++;
    }
    return { gold, silver, bronze };
  }, [swimTimes]);

  const recentPBs = useMemo(
    () =>
      [...swimTimes]
        .filter((s) => s.isPersonalBest)
        .sort((a, b) => b.meetDate.localeCompare(a.meetDate))
        .slice(0, 5),
    [swimTimes]
  );

  const upcomingSchedules = useMemo(() => schedules.slice(0, 5), [schedules]);

  const isEmptyClub =
    athletes.length === 0 &&
    transactions.length === 0 &&
    schedules.length === 0 &&
    invoices.length === 0;

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Overview Action Bar: Export All & Print Report */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900">
            Ringkasan {club.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Pantau kas klub, prestasi atlet, jadwal latihan, dan pengingat tagihan dalam satu layar.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
          <ExportActionMenu
            label="Ekspor Klub"
            disabled={isEmptyClub}
            options={[
              {
                id: 'full-excel',
                label: 'Workbook Excel (.xls)',
                description: 'Semua data klub (7 sheet: Kas, Atlet, Waktu, Jadwal, Presensi, Invoice)',
                format: 'excel',
                onSelect: () =>
                  downloadFullClubExcel(club, {
                    athletes,
                    swimTimes,
                    transactions,
                    schedules,
                    attendance,
                    invoices,
                  }),
              },
              {
                id: 'schedules-ics',
                label: 'Kalender Latihan (.ics)',
                description: 'Impor jadwal latihan ke Google / Apple Calendar',
                format: 'ics',
                disabled: schedules.length === 0,
                onSelect: () => downloadSchedulesICS(club, schedules),
              },
              {
                id: 'full-json',
                label: 'Backup Lengkap (.json)',
                description: 'Arsip seluruh data klub termasuk surat administrasi',
                format: 'json',
                onSelect: () =>
                  downloadJSONBackup(club, {
                    athletes,
                    swimTimes,
                    transactions,
                    schedules,
                    attendance,
                    invoices,
                    announcements,
                  }),
              },
            ]}
          />
          <button
            type="button"
            onClick={() => onOpenPrintReport('executive')}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-sky-700" />
            <span>Mode Cetak</span>
          </button>
        </div>
      </div>

      {/* Header Banner / Quick Empty Prompt */}
      {isEmptyClub && onLoadSampleData && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
              Workspace {club.name} Siap Digunakan
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Belum ada data atlet, transaksi kas, atau jadwal latihan. Anda dapat mulai mengisi secara manual atau memuat data contoh klub renang Indonesia.
            </p>
          </div>
          <button
            type="button"
            onClick={onLoadSampleData}
            disabled={seedingSample}
            className="w-full sm:w-auto px-4 min-h-[44px] bg-sky-700 text-white text-sm sm:text-xs font-medium rounded-lg hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {seedingSample ? 'Memuat Data...' : 'Muat Data Contoh Klub'}
          </button>
        </div>
      )}

      {/* Priority Reminders Strip (Real data-driven alerts) */}
      {reminders.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-sky-700 shrink-0" />
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 truncate">
                Pengingat Hari Ini ({reminders.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenReminders}
              className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Kelola Semua <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {reminders.slice(0, 3).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onNavigate(r.targetNav)}
                className={`text-left border rounded-lg p-3 transition-colors cursor-pointer min-w-0 ${
                  r.severity === 'urgent'
                    ? 'border-red-200 bg-red-50/40 hover:bg-red-50/70'
                    : r.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50/30 hover:bg-amber-50/60'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 truncate">{r.title}</span>
                  {r.severity === 'urgent' && (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-600 mt-1 truncate">{r.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4-Column KPI Strip (2x2 on mobile for compact scanning) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onNavigate('finance')}
          className="text-left bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer min-w-0"
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3 gap-1">
            <span className="truncate">Saldo Kas Klub</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="font-mono-tabular text-base sm:text-2xl font-bold text-slate-900 truncate">
            {formatRupiah(financeTotals.balance)}
          </div>
          <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] sm:text-xs text-slate-500">
            <span className="truncate">Masuk {formatRupiah(financeTotals.income)}</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('athletes')}
          className="text-left bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer min-w-0"
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3 gap-1">
            <span className="truncate">Atlet Aktif & PB</span>
            <Users className="w-4 h-4 text-sky-700 shrink-0" />
          </div>
          <div className="font-mono-tabular text-base sm:text-2xl font-bold text-slate-900">
            {activeAthletesCount} <span className="text-xs sm:text-sm font-normal text-slate-500">atlet</span>
          </div>
          <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] sm:text-xs text-slate-500">
            <span>{athletes.length} total</span>
            <span aria-hidden="true">·</span>
            <span>{personalBestCount} PB</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('invoices')}
          className="text-left bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer min-w-0"
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3 gap-1">
            <span className="truncate">Tagihan Tertunda</span>
            <Receipt className="w-4 h-4 text-amber-600 shrink-0" />
          </div>
          <div className="font-mono-tabular text-base sm:text-2xl font-bold text-slate-900 truncate">
            {formatRupiah(unpaidTotal)}
          </div>
          <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] sm:text-xs text-slate-500">
            <span>{unpaidInvoices.length} invoice</span>
            <span aria-hidden="true">·</span>
            <span>{invoices.filter((i) => i.status === 'Jatuh Tempo').length} tempo</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('schedules')}
          className="text-left bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer min-w-0"
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3 gap-1">
            <span className="truncate">Latihan & Medali</span>
            <CalendarDays className="w-4 h-4 text-slate-700 shrink-0" />
          </div>
          <div className="font-mono-tabular text-base sm:text-2xl font-bold text-slate-900">
            {schedules.length} <span className="text-xs sm:text-sm font-normal text-slate-500">sesi</span>
          </div>
          <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] sm:text-xs text-slate-500">
            <span>{medalStats.gold} Emas</span>
            <span aria-hidden="true">·</span>
            <span>{medalStats.silver} Perak</span>
            <span aria-hidden="true">·</span>
            <span>{medalStats.bronze} Perunggu</span>
          </div>
        </button>
      </div>

      {/* Main 2-Column Analytical Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        <div className="lg:col-span-2">
          <CashflowTrendChart transactions={transactions} />
        </div>

        {/* Upcoming Training Sessions */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Jadwal Latihan Terdekat
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('schedules')}
              className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 cursor-pointer"
            >
              Semua <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {upcomingSchedules.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-sm text-slate-500">
              <Clock className="w-7 h-7 text-slate-300 mb-2" />
              <p>Belum ada jadwal latihan.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingSchedules.map((sch) => (
                <div key={sch.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 leading-snug">
                      {sch.title}
                    </p>
                    <span className="font-mono-tabular text-xs text-slate-600 whitespace-nowrap shrink-0">
                      {sch.startTime}–{sch.endTime}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>{sch.dayOfWeek}</span>
                    <span aria-hidden="true">·</span>
                    <span>{sch.ageGroup}</span>
                    <span aria-hidden="true">·</span>
                    <span>{sch.poolLocation}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Swim Time Progression Trend */}
      <SwimTimeTrendChart swimTimes={swimTimes} compact />

      {/* Bottom 2-Column Operational Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Personal Bests */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Rekor Personal Best (PB) Terbaru
              </h2>
              <p className="text-xs text-slate-500">Catatan waktu resmi kejuaraan per atlet</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('athletes')}
              className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              Kelola <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentPBs.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              <Award className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              Belum ada catatan waktu kejuaraan.
            </div>
          ) : (
            <>
              <div className="sm:hidden divide-y divide-slate-100">
                {recentPBs.map((st) => (
                  <div key={st.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-slate-900 truncate">{st.athleteName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {st.eventName} · {st.medal}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 truncate">
                        {st.championshipName} · <span className="font-mono-tabular">{formatDateID(st.meetDate)}</span>
                      </div>
                    </div>
                    <div className="font-mono-tabular text-sm font-bold text-sky-800 whitespace-nowrap shrink-0">
                      {st.formattedTime}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                      <th className="py-2.5 pr-3">Atlet & Nomor Lomba</th>
                      <th className="py-2.5 px-3">Kejuaraan</th>
                      <th className="py-2.5 pl-3 text-right">Waktu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {recentPBs.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-slate-900">{st.athleteName}</div>
                          <div className="text-xs text-slate-500">
                            {st.eventName} · {st.medal}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-600">
                          <div>{st.championshipName}</div>
                          <div className="font-mono-tabular text-slate-400">
                            {formatDateID(st.meetDate)}
                          </div>
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono-tabular font-semibold text-sky-800 whitespace-nowrap">
                          {st.formattedTime}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Unpaid Invoices & Announcements */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Tagihan Perlu Tindak Lanjut
                </h2>
                <p className="text-xs text-slate-500">Invoice SPP dan registrasi lomba aktif</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('invoices')}
                className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 cursor-pointer"
              >
                Buka Invoice <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {unpaidInvoices.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500 flex flex-col items-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mb-1.5" />
                Semua invoice tagihan sudah lunas.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {unpaidInvoices.slice(0, 4).map((inv) => (
                  <div key={inv.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {inv.athleteName}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {inv.invoiceNumber} · {inv.category} · Jatuh tempo {formatDateID(inv.dueDate)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono-tabular text-sm font-semibold text-slate-900">
                        {formatRupiah(inv.amount)}
                      </div>
                      <div
                        className={`text-xs font-medium inline-flex items-center gap-1 ${
                          inv.status === 'Jatuh Tempo' ? 'text-red-600' : 'text-amber-700'
                        }`}
                      >
                        {inv.status === 'Jatuh Tempo' ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {inv.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {announcements.length > 0 && (
            <div className="pt-5 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Administrasi & Pengumuman Terbaru
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('invoices')}
                  className="text-xs font-medium text-sky-700 hover:text-sky-800 cursor-pointer"
                >
                  Lihat Surat
                </button>
              </div>
              <div className="space-y-2">
                {announcements.slice(0, 2).map((ann) => (
                  <div key={ann.id} className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">{ann.title}</span>
                    <span className="mx-1.5 text-slate-400">·</span>
                    <span>{ann.docType}</span>
                    {ann.eventDate && (
                      <>
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="font-mono-tabular">{formatDateID(ann.eventDate)}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
