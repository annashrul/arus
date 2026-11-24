import React, { useEffect, useMemo, useState } from 'react';
import {
  AGE_GROUPS,
  Athlete,
  AttendanceRecord,
  ClubAnnouncement,
  ClubCompetition,
  ClubInvoice,
  ClubProfile,
  Coach,
  currentMonthLabel,
  EquipmentItem,
  FinanceTransaction,
  formatDateID,
  formatRupiah,
  PaymentRequest,
  PoolFacility,
  SwimTime,
  todayISO,
  TrainingSchedule,
  UserRole,
} from '../types/club';
import {
  downloadFullClubExcel,
  downloadJSONBackup,
  downloadSchedulesICS,
} from '../lib/exportUtils';
import { downloadClubSummaryPdf } from '../lib/pdfExport';
import { ClubReminder } from '../lib/reminders';
import { computeConsecutiveAbsences } from '../lib/attendanceAlerts';
import { ExportActionMenu } from './ExportActionMenu';
import { PrintReportKind } from './PrintReportModal';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Award,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
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
  | 'invoices'
  | 'clubops';

interface OverviewViewProps {
  club: ClubProfile;
  athletes: Athlete[];
  swimTimes: SwimTime[];
  transactions: FinanceTransaction[];
  schedules: TrainingSchedule[];
  attendance: AttendanceRecord[];
  invoices: ClubInvoice[];
  paymentRequests?: PaymentRequest[];
  announcements: ClubAnnouncement[];
  coaches?: Coach[];
  pools?: PoolFacility[];
  equipment?: EquipmentItem[];
  competitions?: ClubCompetition[];
  reminders: ClubReminder[];
  onOpenReminders: () => void;
  onOpenPrintReport: (kind: PrintReportKind) => void;
  onNavigate: (section: NavSection) => void;
  onOpenVerificationQueue?: () => void;
  onLoadSampleData?: () => Promise<void>;
  seedingSample?: boolean;
  userRole?: UserRole;
  coachDisplayName?: string;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  club,
  athletes,
  swimTimes,
  transactions,
  schedules,
  attendance,
  invoices,
  paymentRequests = [],
  announcements,
  coaches = [],
  pools = [],
  equipment = [],
  competitions = [],
  reminders,
  onOpenReminders,
  onOpenPrintReport,
  onNavigate,
  onOpenVerificationQueue,
  onLoadSampleData,
  seedingSample,
  userRole = 'admin',
  coachDisplayName,
}) => {
  const isCoach = userRole === 'coach';
  const [todayDate, setTodayDate] = useState<string>(() => todayISO());

  useEffect(() => {
    const timer = window.setInterval(() => {
      const latest = todayISO();
      setTodayDate((prev) => (prev !== latest ? latest : prev));
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

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

  const todayCashflow = useMemo(() => {
    let income = 0;
    let expense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    const items: FinanceTransaction[] = [];

    for (const tx of transactions) {
      if (tx.transactionDate !== todayDate) continue;
      items.push(tx);
      if (tx.type === 'pemasukan') {
        income += tx.amount;
        incomeCount += 1;
      } else {
        expense += tx.amount;
        expenseCount += 1;
      }
    }

    const totalVolume = income + expense;
    const maxVal = Math.max(income, expense, 1);
    const incomeSharePct = totalVolume > 0 ? Math.round((income / totalVolume) * 100) : 0;
    const expenseSharePct = totalVolume > 0 ? 100 - incomeSharePct : 0;

    return {
      income,
      expense,
      net: income - expense,
      incomeCount,
      expenseCount,
      totalCount: items.length,
      totalVolume,
      incomeBarPct: income > 0 ? Math.max(6, Math.round((income / maxVal) * 100)) : 0,
      expenseBarPct: expense > 0 ? Math.max(6, Math.round((expense / maxVal) * 100)) : 0,
      incomeSharePct,
      expenseSharePct,
      recentItems: items.slice(0, 3),
    };
  }, [transactions, todayDate]);

  const activeAthletesCount = useMemo(
    () => athletes.filter((a) => a.status === 'Aktif').length,
    [athletes]
  );

  const athleteSummary = useMemo(() => {
    let active = 0;
    let leave = 0;
    let inactive = 0;
    let maleActive = 0;
    let femaleActive = 0;
    const groupCounts = new Map<string, number>();

    for (const a of athletes) {
      if (a.status === 'Aktif') {
        active++;
        if (a.gender === 'Putra') maleActive++;
        else femaleActive++;
        groupCounts.set(a.ageGroup, (groupCounts.get(a.ageGroup) || 0) + 1);
      } else if (a.status === 'Cuti') {
        leave++;
      } else {
        inactive++;
      }
    }

    const total = athletes.length;
    const activePct = total > 0 ? Math.round((active / total) * 100) : 0;
    const activeGroups = AGE_GROUPS.map((g) => ({
      group: g,
      count: groupCounts.get(g) || 0,
    })).filter((item) => item.count > 0);

    return {
      total,
      active,
      leave,
      inactive,
      maleActive,
      femaleActive,
      activePct,
      activeGroups,
    };
  }, [athletes]);

  const currentMonth = useMemo(() => currentMonthLabel(), []);
  const currentYM = useMemo(() => todayISO().slice(0, 7), []);

  const currentMonthBilling = useMemo(() => {
    const monthLower = currentMonth.trim().toLowerCase();
    const monthInvoices = invoices.filter((inv) => {
      if (inv.status === 'Dibatalkan') return false;
      const period = (inv.periodMonth || '').trim().toLowerCase();
      if (period) return period === monthLower;
      return inv.dueDate.startsWith(currentYM);
    });

    let totalAmount = 0;
    let paidCount = 0;
    let paidAmount = 0;
    let pendingCount = 0;
    let pendingAmount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;

    const invoicedSppAthleteIds = new Set<string>();
    for (const inv of monthInvoices) {
      totalAmount += inv.amount;
      if (inv.category === 'Iuran Bulanan (SPP)') {
        invoicedSppAthleteIds.add(inv.athleteId);
      }
      if (inv.status === 'Lunas') {
        paidCount++;
        paidAmount += inv.amount;
      } else if (inv.status === 'Jatuh Tempo') {
        overdueCount++;
        overdueAmount += inv.amount;
      } else {
        pendingCount++;
        pendingAmount += inv.amount;
      }
    }

    const activeWithoutSppCount = athletes.filter(
      (a) => a.status === 'Aktif' && a.monthlyFee > 0 && !invoicedSppAthleteIds.has(a.id)
    ).length;

    const collectionRatePct =
      totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

    return {
      totalCount: monthInvoices.length,
      totalAmount,
      paidCount,
      paidAmount,
      pendingCount,
      pendingAmount,
      overdueCount,
      overdueAmount,
      collectionRatePct,
      activeWithoutSppCount,
    };
  }, [invoices, athletes, currentMonth, currentYM]);

  const pendingVerificationSummary = useMemo(() => {
    const requestByInvoiceId = new Map<string, PaymentRequest>();
    for (const pr of paymentRequests) {
      if (pr.status === 'Menunggu Verifikasi' && pr.invoiceId) {
        requestByInvoiceId.set(pr.invoiceId, pr);
      }
    }
    let count = 0;
    let amount = 0;
    for (const inv of invoices) {
      if (inv.status === 'Lunas' || inv.status === 'Dibatalkan') continue;
      const hasPendingPr = requestByInvoiceId.has(inv.id);
      if (inv.status === 'Menunggu Verifikasi' || hasPendingPr) {
        count += 1;
        amount += inv.amount;
      }
    }
    return { count, amount, requestByInvoiceId };
  }, [invoices, paymentRequests]);

  const unpaidInvoices = useMemo(
    () =>
      invoices.filter(
        (i) =>
          i.status === 'Belum Lunas' ||
          i.status === 'Jatuh Tempo' ||
          i.status === 'Menunggu Verifikasi'
      ),
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

  const coachMetrics = useMemo(() => {
    let hadir = 0;
    for (const rec of attendance) {
      if (rec.status === 'Hadir') hadir++;
    }
    const attendanceRatePct =
      attendance.length > 0 ? Math.round((hadir / attendance.length) * 100) : 0;
    const { alerts: consecutiveAbsenceAlerts } = computeConsecutiveAbsences(
      athletes,
      attendance,
      club,
      3
    );
    const upcomingCompetitions = [...competitions]
      .filter((c) => c.status !== 'Selesai')
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return {
      hadir,
      totalAttendance: attendance.length,
      attendanceRatePct,
      consecutiveAbsenceAlerts,
      upcomingCompetitions,
    };
  }, [attendance, athletes, club, competitions]);

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
            {isCoach
              ? `Dashboard Pelatih · ${coachDisplayName || club.headCoach}`
              : `Ringkasan ${club.name}`}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {isCoach
              ? `Pantau atlet binaan, presensi latihan, catatan waktu kejuaraan, dan jadwal ${club.name}.`
              : 'Pantau kas klub, prestasi atlet, jadwal latihan, dan pengingat tagihan dalam satu layar.'}
          </p>
        </div>

        <div className="w-full sm:w-auto shrink-0">
          <ExportActionMenu
            label="Ekspor & Cetak"
            options={
              isCoach
                ? [
                    {
                      id: 'coach-ath-pdf',
                      label: 'Download PDF Atlet & Waktu (.pdf)',
                      description: 'Rekap profil atlet & catatan waktu (tanpa data keuangan)',
                      format: 'pdf',
                      disabled: athletes.length === 0 && swimTimes.length === 0,
                      onSelect: () =>
                        downloadClubSummaryPdf({
                          kind: 'athletes',
                          club,
                          athletes,
                          swimTimes,
                          periodLabel: 'Seluruh Periode',
                          hideFinancial: true,
                        }),
                    },
                    {
                      id: 'coach-sch-pdf',
                      label: 'Download PDF Jadwal & Presensi (.pdf)',
                      description: 'Rekap jadwal sesi latihan & kehadiran atlet',
                      format: 'pdf',
                      disabled: schedules.length === 0 && attendance.length === 0,
                      onSelect: () =>
                        downloadClubSummaryPdf({
                          kind: 'schedules',
                          club,
                          athletes,
                          schedules,
                          attendance,
                          periodLabel: 'Seluruh Periode',
                          hideFinancial: true,
                        }),
                    },
                    {
                      id: 'coach-excel',
                      label: 'Workbook Excel Pelatih (.xlsx)',
                      description: 'Atlet, Waktu, Jadwal, Presensi, Kolam, Alat & Kejuaraan',
                      format: 'excel',
                      disabled: athletes.length === 0 && schedules.length === 0,
                      onSelect: () =>
                        downloadFullClubExcel(club, {
                          athletes,
                          swimTimes,
                          transactions: [],
                          schedules,
                          attendance,
                          invoices: [],
                          coaches: [],
                          pools,
                          equipment,
                          competitions,
                          hideFinancial: true,
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
                      id: 'print-coach',
                      label: 'Mode Cetak Laporan A4',
                      description: 'Pratinjau dokumen atlet, jadwal & operasional pelatih',
                      format: 'print',
                      dividerBefore: true,
                      onSelect: () => onOpenPrintReport('athletes'),
                    },
                  ]
                : [
                    {
                      id: 'full-pdf',
                      label: 'Download PDF (.pdf)',
                      description: 'Ringkasan eksekutif klub siap bagikan atau arsip',
                      format: 'pdf',
                      disabled: isEmptyClub,
                      onSelect: () =>
                        downloadClubSummaryPdf({
                          kind: 'executive',
                          club,
                          athletes,
                          swimTimes,
                          transactions,
                          schedules,
                          attendance,
                          invoices,
                          coaches,
                          pools,
                          equipment,
                          competitions,
                          periodLabel: 'Seluruh Periode',
                        }),
                    },
                    {
                      id: 'full-excel',
                      label: 'Workbook Excel (.xlsx)',
                      description: 'Semua data klub (Kas, Atlet, Waktu, Jadwal, Presensi, Invoice, Pelatih & Klub)',
                      format: 'excel',
                      disabled: isEmptyClub,
                      onSelect: () =>
                        downloadFullClubExcel(club, {
                          athletes,
                          swimTimes,
                          transactions,
                          schedules,
                          attendance,
                          invoices,
                          coaches,
                          pools,
                          equipment,
                          competitions,
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
                      description: 'Arsip seluruh data klub termasuk pelatih, kolam & administrasi',
                      format: 'json',
                      disabled: isEmptyClub,
                      onSelect: () =>
                        downloadJSONBackup(club, {
                          athletes,
                          swimTimes,
                          transactions,
                          schedules,
                          attendance,
                          invoices,
                          announcements,
                          coaches,
                          pools,
                          equipment,
                          competitions,
                        }),
                    },
                    {
                      id: 'print-executive',
                      label: 'Mode Cetak Laporan A4',
                      description: 'Pratinjau laporan resmi dengan kop surat & tanda tangan',
                      format: 'print',
                      dividerBefore: true,
                      onSelect: () => onOpenPrintReport('executive'),
                    },
                  ]
            }
          />
        </div>
      </div>

      {/* Header Banner / Quick Empty Prompt */}
      {!isCoach && isEmptyClub && onLoadSampleData && (
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

      {/* Real-Time Today's Cashflow Visual (Admin Only) */}
      {!isCoach && (
      <section
        aria-label="Arus Kas Real-Time Hari Ini"
        className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <Activity className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                  Arus Kas Hari Ini (Real-Time)
                </h2>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  Live · {formatDateID(todayDate)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
                {todayCashflow.totalCount} transaksi tercatat hari ini ({todayCashflow.incomeCount} masuk · {todayCashflow.expenseCount} keluar)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
          >
            Buka Buku Kas <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 3 Real-Time Numeric Columns + Visual Comparison Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {/* Kas Masuk Hari Ini */}
          <div className="border border-slate-200 rounded-lg p-3.5 space-y-2 bg-emerald-50/25">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                Kas Masuk Hari Ini
              </span>
              <span className="font-mono-tabular text-[11px] text-slate-500">
                {todayCashflow.incomeCount} trx
              </span>
            </div>
            <div className="font-mono-tabular text-lg sm:text-xl font-bold text-emerald-700 truncate">
              +{formatRupiah(todayCashflow.income)}
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${todayCashflow.incomeBarPct}%` }}
              />
            </div>
          </div>

          {/* Kas Keluar Hari Ini */}
          <div className="border border-slate-200 rounded-lg p-3.5 space-y-2 bg-red-50/20">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <ArrowUpRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
                Kas Keluar Hari Ini
              </span>
              <span className="font-mono-tabular text-[11px] text-slate-500">
                {todayCashflow.expenseCount} trx
              </span>
            </div>
            <div className="font-mono-tabular text-lg sm:text-xl font-bold text-red-700 truncate">
              -{formatRupiah(todayCashflow.expense)}
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-300"
                style={{ width: `${todayCashflow.expenseBarPct}%` }}
              />
            </div>
          </div>

          {/* Selisih Bersih Hari Ini */}
          <div className="border border-slate-200 rounded-lg p-3.5 space-y-2 bg-slate-50/60">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-medium">Selisih Bersih Hari Ini</span>
              <span
                className={`font-mono-tabular text-[11px] font-semibold ${
                  todayCashflow.net > 0
                    ? 'text-emerald-700'
                    : todayCashflow.net < 0
                    ? 'text-red-700'
                    : 'text-slate-500'
                }`}
              >
                {todayCashflow.net > 0
                  ? 'Surplus'
                  : todayCashflow.net < 0
                  ? 'Defisit'
                  : 'Seimbang'}
              </span>
            </div>
            <div
              className={`font-mono-tabular text-lg sm:text-xl font-bold truncate ${
                todayCashflow.net > 0
                  ? 'text-emerald-700'
                  : todayCashflow.net < 0
                  ? 'text-red-700'
                  : 'text-slate-900'
              }`}
            >
              {todayCashflow.net > 0 ? '+' : ''}
              {formatRupiah(todayCashflow.net)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono-tabular truncate">
              Proporsi: {todayCashflow.incomeSharePct}% masuk · {todayCashflow.expenseSharePct}% keluar
            </div>
          </div>
        </div>

        {/* Visual Split Ratio Bar & Today's Activity Strip */}
        <div className="space-y-2.5 pt-1">
          <div
            className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex"
            role="img"
            aria-label={`Proporsi kas hari ini: ${todayCashflow.incomeSharePct}% masuk, ${todayCashflow.expenseSharePct}% keluar`}
          >
            {todayCashflow.totalVolume > 0 ? (
              <>
                {todayCashflow.income > 0 && (
                  <div
                    className="h-full bg-emerald-600 transition-all duration-300"
                    style={{ width: `${todayCashflow.incomeSharePct}%` }}
                  />
                )}
                {todayCashflow.expense > 0 && (
                  <div
                    className="h-full bg-red-500 transition-all duration-300"
                    style={{ width: `${todayCashflow.expenseSharePct}%` }}
                  />
                )}
              </>
            ) : (
              <div className="h-full w-full bg-slate-200/70" />
            )}
          </div>

          {todayCashflow.recentItems.length > 0 ? (
            <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
              {todayCashflow.recentItems.map((tx) => (
                <div
                  key={tx.id}
                  className="py-1.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 truncate text-slate-700">
                    <span className="font-medium text-slate-900">{tx.description}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-slate-500">{tx.category}</span>
                  </div>
                  <span
                    className={`font-mono-tabular font-semibold whitespace-nowrap shrink-0 ${
                      tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {tx.type === 'pemasukan' ? '+' : '-'}
                    {formatRupiah(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Belum ada arus kas tercatat hari ini ({formatDateID(todayDate)}). Transaksi baru atau pelunasan invoice akan muncul otomatis secara real-time di panel ini.
            </p>
          )}
        </div>
      </section>
      )}

      {/* Executive Login Brief: Active Athletes & Current Month Billing Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Card 1: Active Athletes Quick Brief */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                Ringkasan Atlet Aktif
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {athleteSummary.total === 0
                  ? 'Belum ada atlet terdaftar di klub'
                  : `${athleteSummary.total} atlet terdaftar · ${athleteSummary.activePct}% berstatus aktif`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('athletes')}
              className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Kelola Atlet <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-mono-tabular text-2xl sm:text-3xl font-bold text-slate-900">
                {athleteSummary.active}{' '}
                <span className="text-xs sm:text-sm font-normal text-slate-500">atlet aktif</span>
              </div>
              <div className="text-xs font-mono-tabular text-slate-600">
                Putra {athleteSummary.maleActive} · Putri {athleteSummary.femaleActive}
              </div>
            </div>

            {athleteSummary.total > 0 && (
              <div
                className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex"
                aria-label="Distribusi status atlet"
              >
                {athleteSummary.active > 0 && (
                  <div
                    className="h-full bg-emerald-600"
                    style={{ width: `${(athleteSummary.active / athleteSummary.total) * 100}%` }}
                  />
                )}
                {athleteSummary.leave > 0 && (
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${(athleteSummary.leave / athleteSummary.total) * 100}%` }}
                  />
                )}
                {athleteSummary.inactive > 0 && (
                  <div
                    className="h-full bg-slate-400"
                    style={{ width: `${(athleteSummary.inactive / athleteSummary.total) * 100}%` }}
                  />
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-3 divide-x divide-slate-200 text-xs">
              <div className="pr-2">
                <span className="text-slate-500 block">Aktif Berlatih</span>
                <span className="font-mono-tabular font-semibold text-emerald-700">
                  {athleteSummary.active} atlet
                </span>
              </div>
              <div className="px-3">
                <span className="text-slate-500 block">Cuti / Izin</span>
                <span className="font-mono-tabular font-semibold text-amber-700">
                  {athleteSummary.leave} atlet
                </span>
              </div>
              <div className="pl-3">
                <span className="text-slate-500 block">Nonaktif</span>
                <span className="font-mono-tabular font-semibold text-slate-600">
                  {athleteSummary.inactive} atlet
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              {athleteSummary.activeGroups.length > 0
                ? `Kelompok aktif: ${athleteSummary.activeGroups
                    .map((g) => `${g.group} (${g.count})`)
                    .join(' · ')}`
                : 'Tambahkan atlet untuk mulai memantau kelompok umur.'}
            </p>
          </div>
        </div>

        {/* Card 2: Current Month Billing Status Brief (Admin) or Attendance & Competition Readiness (Coach) */}
        {!isCoach ? (
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                  Status Tagihan {currentMonth}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentMonthBilling.totalCount === 0
                    ? `Belum ada invoice diterbitkan untuk periode ${currentMonth}`
                    : `${currentMonthBilling.totalCount} tagihan bulan berjalan · Total ${formatRupiah(currentMonthBilling.totalAmount)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('invoices')}
                className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Buka Tagihan <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-mono-tabular text-2xl sm:text-3xl font-bold text-slate-900">
                  {currentMonthBilling.collectionRatePct}%{' '}
                  <span className="text-xs sm:text-sm font-normal text-slate-500">terbayar</span>
                </div>
                <div className="text-xs font-mono-tabular text-emerald-700 font-semibold">
                  {formatRupiah(currentMonthBilling.paidAmount)} lunas
                </div>
              </div>

              {currentMonthBilling.totalAmount > 0 && (
                <div
                  className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex"
                  aria-label="Proporsi pelunasan tagihan bulan berjalan"
                >
                  {currentMonthBilling.paidAmount > 0 && (
                    <div
                      className="h-full bg-emerald-600"
                      style={{
                        width: `${(currentMonthBilling.paidAmount / currentMonthBilling.totalAmount) * 100}%`,
                      }}
                    />
                  )}
                  {currentMonthBilling.pendingAmount > 0 && (
                    <div
                      className="h-full bg-amber-500"
                      style={{
                        width: `${(currentMonthBilling.pendingAmount / currentMonthBilling.totalAmount) * 100}%`,
                      }}
                    />
                  )}
                  {currentMonthBilling.overdueAmount > 0 && (
                    <div
                      className="h-full bg-red-600"
                      style={{
                        width: `${(currentMonthBilling.overdueAmount / currentMonthBilling.totalAmount) * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="grid grid-cols-3 divide-x divide-slate-200 text-xs">
                <div className="pr-2 min-w-0">
                  <span className="text-slate-500 block">Lunas ({currentMonthBilling.paidCount})</span>
                  <span className="font-mono-tabular font-semibold text-emerald-700 truncate block">
                    {formatRupiah(currentMonthBilling.paidAmount)}
                  </span>
                </div>
                <div className="px-3 min-w-0">
                  <span className="text-slate-500 block">
                    Menunggu ({currentMonthBilling.pendingCount})
                  </span>
                  <span className="font-mono-tabular font-semibold text-amber-700 truncate block">
                    {formatRupiah(currentMonthBilling.pendingAmount)}
                  </span>
                </div>
                <div className="pl-3 min-w-0">
                  <span className="text-slate-500 block">
                    Jatuh Tempo ({currentMonthBilling.overdueCount})
                  </span>
                  <span className="font-mono-tabular font-semibold text-red-600 truncate block">
                    {formatRupiah(currentMonthBilling.overdueAmount)}
                  </span>
                </div>
              </div>
              {pendingVerificationSummary.count > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenVerificationQueue ? onOpenVerificationQueue() : onNavigate('invoices')
                  }
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 hover:bg-sky-100/80 transition-colors cursor-pointer text-left"
                >
                  <span className="font-medium truncate">
                    {pendingVerificationSummary.count} bukti bayar masuk ({formatRupiah(pendingVerificationSummary.amount)}) siap dikonfirmasi
                  </span>
                  <span className="font-semibold text-sky-800 whitespace-nowrap shrink-0 inline-flex items-center gap-0.5">
                    Periksa <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              ) : (
                <p className="text-[11px] text-slate-500 truncate">
                  {currentMonthBilling.activeWithoutSppCount > 0
                    ? `${currentMonthBilling.activeWithoutSppCount} atlet aktif belum diterbitkan SPP ${currentMonth}.`
                    : currentMonthBilling.totalCount === 0
                    ? `Gunakan Generator SPP Massal di Invoice & Adm untuk menerbitkan tagihan ${currentMonth}.`
                    : currentMonthBilling.overdueCount + currentMonthBilling.pendingCount === 0
                    ? `Seluruh tagihan periode ${currentMonth} telah lunas.`
                    : `${currentMonthBilling.pendingCount + currentMonthBilling.overdueCount} tagihan bulan ${currentMonth} menunggu pelunasan.`}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                  Disiplin Presensi & Kesiapan Lomba
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {coachMetrics.totalAttendance === 0
                    ? 'Belum ada log presensi latihan tercatat'
                    : `${coachMetrics.totalAttendance} catatan presensi · ${coachMetrics.hadir} kali hadir`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('schedules')}
                className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Input Presensi <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-mono-tabular text-2xl sm:text-3xl font-bold text-slate-900">
                  {coachMetrics.attendanceRatePct}%{' '}
                  <span className="text-xs sm:text-sm font-normal text-slate-500">kehadiran</span>
                </div>
                <div className="text-xs font-mono-tabular text-sky-800 font-semibold">
                  {coachMetrics.upcomingCompetitions.length} lomba mendatang
                </div>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-700 transition-all duration-300"
                  style={{ width: `${coachMetrics.attendanceRatePct}%` }}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="grid grid-cols-3 divide-x divide-slate-200 text-xs">
                <div className="pr-2 min-w-0">
                  <span className="text-slate-500 block">Sesi Rutin</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {schedules.length} jadwal
                  </span>
                </div>
                <div className="px-3 min-w-0">
                  <span className="text-slate-500 block">Absen 3x+</span>
                  <span
                    className={`font-mono-tabular font-semibold ${
                      coachMetrics.consecutiveAbsenceAlerts.length > 0
                        ? 'text-red-600'
                        : 'text-emerald-700'
                    }`}
                  >
                    {coachMetrics.consecutiveAbsenceAlerts.length} atlet
                  </span>
                </div>
                <div className="pl-3 min-w-0">
                  <span className="text-slate-500 block">Total Medali</span>
                  <span className="font-mono-tabular font-semibold text-amber-700">
                    {medalStats.gold + medalStats.silver + medalStats.bronze} medali
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                {coachMetrics.consecutiveAbsenceAlerts.length > 0
                  ? `Perlu tindak lanjut: ${coachMetrics.consecutiveAbsenceAlerts
                      .slice(0, 2)
                      .map((a) => `${a.athlete.fullName} (${a.streak}x)`)
                      .join(', ')}`
                  : 'Semua atlet aktif disiplin mengikuti sesi latihan.'}
              </p>
            </div>
          </div>
        )}
      </div>

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
      {!isCoach ? (
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
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
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
            onClick={() => onNavigate('schedules')}
            className="text-left bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer min-w-0"
          >
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3 gap-1">
              <span className="truncate">Tingkat Presensi</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="font-mono-tabular text-base sm:text-2xl font-bold text-slate-900">
              {coachMetrics.attendanceRatePct}%
            </div>
            <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 truncate">
              {coachMetrics.hadir} hadir dari {coachMetrics.totalAttendance} log
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('schedules')}
            className="text-left bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer min-w-0"
          >
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3 gap-1">
              <span className="truncate">Absen 3x+ Beruntun</span>
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  coachMetrics.consecutiveAbsenceAlerts.length > 0
                    ? 'text-red-600'
                    : 'text-slate-400'
                }`}
              />
            </div>
            <div className="font-mono-tabular text-base sm:text-2xl font-bold text-slate-900">
              {coachMetrics.consecutiveAbsenceAlerts.length}{' '}
              <span className="text-xs sm:text-sm font-normal text-slate-500">atlet</span>
            </div>
            <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 truncate">
              {coachMetrics.consecutiveAbsenceAlerts.length > 0
                ? 'Perlu follow-up pelatih'
                : 'Semua kehadiran aman'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('clubops')}
            className="text-left bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer min-w-0"
          >
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3 gap-1">
              <span className="truncate">Jadwal & Kejuaraan</span>
              <CalendarDays className="w-4 h-4 text-sky-700 shrink-0" />
            </div>
            <div className="font-mono-tabular text-base sm:text-2xl font-bold text-slate-900">
              {schedules.length} <span className="text-xs sm:text-sm font-normal text-slate-500">sesi</span>
            </div>
            <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 truncate">
              {coachMetrics.upcomingCompetitions.length} lomba · {equipment.length} item alat
            </div>
          </button>
        </div>
      )}

      {/* Main 2-Column Analytical Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        <div className="lg:col-span-2">
          {isCoach ? (
            <SwimTimeTrendChart swimTimes={swimTimes} compact />
          ) : (
            <CashflowTrendChart transactions={transactions} />
          )}
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

      {/* Swim Time Progression Trend (Admin only here since Coach displays it in main grid above) */}
      {!isCoach && <SwimTimeTrendChart swimTimes={swimTimes} compact />}

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

        {/* Unpaid Invoices & Announcements (Admin) or Competitions & Announcements (Coach) */}
        {!isCoach ? (
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
                            inv.status === 'Jatuh Tempo'
                              ? 'text-red-600'
                              : inv.status === 'Menunggu Verifikasi'
                              ? 'text-sky-700'
                              : 'text-amber-700'
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
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Agenda Kejuaraan Mendatang
                  </h2>
                  <p className="text-xs text-slate-500">Kalender target lomba & time trial klub</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('clubops')}
                  className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  Info Klub <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {coachMetrics.upcomingCompetitions.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-500">
                  Belum ada agenda kejuaraan mendatang.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {coachMetrics.upcomingCompetitions.slice(0, 4).map((comp) => (
                    <div key={comp.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{comp.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {comp.location} · {comp.poolCourse} · {comp.level}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono-tabular text-xs font-semibold text-slate-900">
                          {formatDateID(comp.startDate)}
                        </div>
                        <div className="text-[11px] font-medium text-sky-700">{comp.status}</div>
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
                    Pengumuman & Surat Klub Terbaru
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigate('clubops')}
                    className="text-xs font-medium text-sky-700 hover:text-sky-800 cursor-pointer"
                  >
                    Lihat Pengumuman
                  </button>
                </div>
                <div className="space-y-2">
                  {announcements.slice(0, 3).map((ann) => (
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
        )}
      </div>
    </div>
  );
};
