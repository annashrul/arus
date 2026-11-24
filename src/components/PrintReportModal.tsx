import React, { useMemo, useState } from 'react';
import {
  Athlete,
  AttendanceRecord,
  ClubCompetition,
  ClubInvoice,
  ClubProfile,
  Coach,
  DAYS_OF_WEEK,
  EquipmentItem,
  FinanceTransaction,
  formatDateID,
  formatRupiah,
  PoolFacility,
  SwimTime,
  todayISO,
  TrainingSchedule,
} from '../types/club';
import {
  buildAthletesSheet,
  buildAttendanceSheet,
  buildCoachesSheet,
  buildCompetitionsSheet,
  buildEquipmentSheet,
  buildFinanceSheet,
  buildInvoicesSheet,
  buildPoolsSheet,
  buildSchedulesSheet,
  buildSwimTimesSheet,
  downloadExcelWorkbook,
  downloadFullClubExcel,
} from '../lib/exportUtils';
import { downloadClubSummaryPdf } from '../lib/pdfExport';
import { ExportActionMenu } from './ExportActionMenu';
import { Calendar, SlidersHorizontal, X } from 'lucide-react';
import { BottomSheetSelect } from './BottomSheetSelect';

export type PrintReportKind =
  | 'executive'
  | 'finance'
  | 'athletes'
  | 'schedules'
  | 'invoices'
  | 'clubops';

type PeriodScope = 'all' | 'this_month' | 'last_3_months' | 'this_year';

interface PrintReportModalProps {
  open: boolean;
  initialReport: PrintReportKind;
  onClose: () => void;
  club: ClubProfile;
  athletes: Athlete[];
  swimTimes: SwimTime[];
  transactions: FinanceTransaction[];
  schedules: TrainingSchedule[];
  attendance: AttendanceRecord[];
  invoices: ClubInvoice[];
  coaches?: Coach[];
  pools?: PoolFacility[];
  equipment?: EquipmentItem[];
  competitions?: ClubCompetition[];
}

function getScopeStartDate(scope: PeriodScope, today: string): string | null {
  if (scope === 'all') return null;
  if (scope === 'this_month') return `${today.slice(0, 7)}-01`;
  if (scope === 'this_year') return `${today.slice(0, 4)}-01-01`;
  // last_3_months
  const [y, m] = today.split('-').map(Number);
  const dt = new Date(y, m - 3, 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}-01`;
}

export const PrintReportModal: React.FC<PrintReportModalProps> = ({
  open,
  initialReport,
  onClose,
  club,
  athletes,
  swimTimes,
  transactions,
  schedules,
  attendance,
  invoices,
  coaches = [],
  pools = [],
  equipment = [],
  competitions = [],
}) => {
  const [reportKind, setReportKind] = useState<PrintReportKind>(initialReport);
  const [periodScope, setPeriodScope] = useState<PeriodScope>('all');
  const [includeKop, setIncludeKop] = useState(true);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  React.useEffect(() => {
    if (open) {
      setReportKind(initialReport);
    }
  }, [open, initialReport]);

  const today = todayISO();
  const scopeStart = useMemo(() => getScopeStartDate(periodScope, today), [periodScope, today]);

  const scopedTransactions = useMemo(
    () =>
      [...transactions]
        .filter((t) => (!scopeStart ? true : t.transactionDate >= scopeStart))
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)),
    [transactions, scopeStart]
  );

  const scopedSwimTimes = useMemo(
    () =>
      [...swimTimes]
        .filter((s) => (!scopeStart ? true : s.meetDate >= scopeStart))
        .sort((a, b) => b.meetDate.localeCompare(a.meetDate)),
    [swimTimes, scopeStart]
  );

  const scopedAttendance = useMemo(
    () =>
      [...attendance]
        .filter((a) => (!scopeStart ? true : a.sessionDate >= scopeStart))
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)),
    [attendance, scopeStart]
  );

  const scopedInvoices = useMemo(
    () =>
      [...invoices]
        .filter((i) => (!scopeStart ? true : i.dueDate >= scopeStart))
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [invoices, scopeStart]
  );

  const sortedSchedules = useMemo(() => {
    const dayOrder = new Map<string, number>();
    DAYS_OF_WEEK.forEach((d, idx) => dayOrder.set(d, idx));
    return [...schedules].sort((a, b) => {
      const diff = (dayOrder.get(a.dayOfWeek) ?? 0) - (dayOrder.get(b.dayOfWeek) ?? 0);
      return diff !== 0 ? diff : a.startTime.localeCompare(b.startTime);
    });
  }, [schedules]);

  const sortedAthletes = useMemo(
    () => [...athletes].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [athletes]
  );

  const financeSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of scopedTransactions) {
      if (tx.type === 'pemasukan') income += tx.amount;
      else expense += tx.amount;
    }
    return { income, expense, balance: income - expense };
  }, [scopedTransactions]);

  const invoiceSummary = useMemo(() => {
    let paid = 0;
    let pending = 0;
    let overdue = 0;
    for (const inv of scopedInvoices) {
      if (inv.status === 'Lunas') paid += inv.amount;
      else if (inv.status === 'Belum Lunas') pending += inv.amount;
      else if (inv.status === 'Jatuh Tempo') overdue += inv.amount;
    }
    return { paid, pending, overdue };
  }, [scopedInvoices]);

  const attendanceTotals = useMemo(() => {
    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;
    for (const rec of scopedAttendance) {
      if (rec.status === 'Hadir') hadir++;
      else if (rec.status === 'Izin') izin++;
      else if (rec.status === 'Sakit') sakit++;
      else if (rec.status === 'Alpa') alpa++;
    }
    const rate = scopedAttendance.length > 0 ? Math.round((hadir / scopedAttendance.length) * 100) : 0;
    return { hadir, izin, sakit, alpa, rate };
  }, [scopedAttendance]);

  if (!open) return null;

  const periodLabel: Record<PeriodScope, string> = {
    all: 'Seluruh Periode',
    this_month: 'Bulan Ini',
    last_3_months: '3 Bulan Terakhir',
    this_year: 'Tahun Berjalan',
  };

  const reportTitles: Record<PrintReportKind, string> = {
    executive: 'Laporan Eksekutif Manajemen Klub',
    finance: 'Laporan Keuangan & Buku Kas Klub',
    athletes: 'Laporan Database Atlet & Catatan Waktu Kejuaraan',
    schedules: 'Laporan Jadwal Latihan & Rekap Presensi',
    invoices: 'Laporan Rekap Tagihan & Tunggakan SPP',
    clubops: 'Laporan Pelatih, Fasilitas Kolam, Inventaris & Lomba',
  };

  const handleExportReportExcel = () => {
    const slug = club.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (reportKind === 'executive') {
      downloadFullClubExcel(club, {
        athletes: sortedAthletes,
        swimTimes: scopedSwimTimes,
        transactions: scopedTransactions,
        schedules: sortedSchedules,
        attendance: scopedAttendance,
        invoices: scopedInvoices,
        coaches,
        pools,
        equipment,
        competitions,
      });
    } else if (reportKind === 'finance') {
      downloadExcelWorkbook(`laporan-kas-${slug}-${today}.xlsx`, [
        buildFinanceSheet(scopedTransactions),
      ]);
    } else if (reportKind === 'athletes') {
      downloadExcelWorkbook(`laporan-atlet-waktu-${slug}-${today}.xlsx`, [
        buildAthletesSheet(sortedAthletes),
        buildSwimTimesSheet(scopedSwimTimes),
      ]);
    } else if (reportKind === 'schedules') {
      downloadExcelWorkbook(`laporan-jadwal-presensi-${slug}-${today}.xlsx`, [
        buildSchedulesSheet(sortedSchedules),
        buildAttendanceSheet(scopedAttendance),
      ]);
    } else if (reportKind === 'clubops') {
      downloadExcelWorkbook(`laporan-pelatih-fasilitas-${slug}-${today}.xlsx`, [
        buildCoachesSheet(coaches),
        buildPoolsSheet(pools),
        buildEquipmentSheet(equipment),
        buildCompetitionsSheet(competitions),
      ]);
    } else {
      downloadExcelWorkbook(`laporan-tagihan-${slug}-${today}.xlsx`, [
        buildInvoicesSheet(scopedInvoices),
      ]);
    }
  };

  const handleDownloadPdf = () => {
    downloadClubSummaryPdf({
      kind: reportKind,
      club,
      orientation,
      periodLabel: periodLabel[periodScope],
      includeKop,
      includeSignature,
      athletes: sortedAthletes,
      swimTimes: scopedSwimTimes,
      transactions: scopedTransactions,
      schedules: sortedSchedules,
      attendance: scopedAttendance,
      invoices: scopedInvoices,
      coaches,
      pools,
      equipment,
      competitions,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-[1px] overflow-y-auto print:static print:bg-white print:overflow-visible">
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 12mm; } }`}</style>

      {/* Top Sticky Control Bar (Hidden on print) */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 no-print">
        <div className="max-w-5xl mx-auto space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
                Mode Cetak Laporan Resmi
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Pratinjau dokumen siap cetak A4 atau unduh langsung sebagai PDF / Excel.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ExportActionMenu
                label="Ekspor & Cetak"
                variant="primary"
                menuTitle="Pilih Format Dokumen"
                options={[
                  {
                    id: 'modal-pdf',
                    label: 'Download PDF (.pdf)',
                    description: `Unduh ${reportTitles[reportKind]} (${orientation === 'landscape' ? 'Landscape' : 'Portrait'})`,
                    format: 'pdf',
                    onSelect: handleDownloadPdf,
                  },
                  {
                    id: 'modal-excel',
                    label: 'Ekspor Excel (.xlsx)',
                    description: 'Unduh data laporan dalam format spreadsheet',
                    format: 'excel',
                    onSelect: handleExportReportExcel,
                  },
                  {
                    id: 'modal-print',
                    label: 'Cetak / Print A4',
                    description: 'Buka dialog cetak browser atau simpan ke PDF sistem',
                    format: 'print',
                    dividerBefore: true,
                    onSelect: () => window.print(),
                  },
                ]}
              />
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg min-h-[42px] min-w-[42px] flex items-center justify-center border border-slate-200 cursor-pointer"
                aria-label="Tutup mode cetak laporan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Report Options Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {(
                [
                  { id: 'executive', label: 'Eksekutif' },
                  { id: 'finance', label: 'Keuangan Kas' },
                  { id: 'athletes', label: 'Atlet & Waktu' },
                  { id: 'schedules', label: 'Jadwal & Presensi' },
                  { id: 'invoices', label: 'Tagihan SPP' },
                  { id: 'clubops', label: 'Pelatih & Klub' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setReportKind(tab.id)}
                  className={`px-3 min-h-[36px] text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                    reportKind === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="w-40">
                <BottomSheetSelect
                  value={periodScope}
                  onChange={(v) => setPeriodScope(v as PeriodScope)}
                  title="Pilih Periode Laporan"
                  icon={<Calendar className="w-3.5 h-3.5" />}
                  ariaLabel="Periode laporan"
                  options={[
                    { value: 'all', label: 'Semua Periode' },
                    { value: 'this_month', label: 'Bulan Ini' },
                    { value: 'last_3_months', label: '3 Bulan Terakhir' },
                    { value: 'this_year', label: 'Tahun Ini' },
                  ]}
                />
              </div>

              <div className="w-36">
                <BottomSheetSelect
                  value={orientation}
                  onChange={(v) => setOrientation(v as 'portrait' | 'landscape')}
                  title="Orientasi Kertas A4"
                  icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                  ariaLabel="Orientasi halaman"
                  options={[
                    { value: 'portrait', label: 'A4 Portrait', description: 'Vertikal standar surat resmi' },
                    { value: 'landscape', label: 'A4 Landscape', description: 'Mendatar untuk tabel lebar' },
                  ]}
                />
              </div>

              <label className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] border border-slate-200 rounded-lg cursor-pointer bg-white text-slate-700">
                <input
                  type="checkbox"
                  checked={includeKop}
                  onChange={(e) => setIncludeKop(e.target.checked)}
                  className="rounded border-slate-300 text-sky-700"
                />
                <span>Kop Surat</span>
              </label>

              <label className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] border border-slate-200 rounded-lg cursor-pointer bg-white text-slate-700">
                <input
                  type="checkbox"
                  checked={includeSignature}
                  onChange={(e) => setIncludeSignature(e.target.checked)}
                  className="rounded border-slate-300 text-sky-700"
                />
                <span>Tanda Tangan</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Printable A4 Sheet Container */}
      <div className="py-5 sm:py-8 px-3 sm:px-6 print:p-0">
        <div
          className={`bg-white border border-slate-200 rounded-xl shadow-sm mx-auto p-5 sm:p-10 space-y-6 print-only-container ${
            orientation === 'landscape' ? 'max-w-[1120px]' : 'max-w-[820px]'
          }`}
        >
          {/* Kop Surat Resmi */}
          {includeKop && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-slate-900 pb-4">
              <div className="flex items-center gap-3.5">
                <img
                  src="/src/assets/images/swim_club_emblem_1795440060748.jpg"
                  alt={club.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                />
                <div>
                  <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                    {club.name}
                  </h1>
                  <p className="text-xs text-slate-600">
                    {club.address || club.city}
                    {club.phone ? ` · Telp: ${club.phone}` : ''}
                    {club.email ? ` · ${club.email}` : ''}
                  </p>
                </div>
              </div>
              <div className="sm:text-right text-xs text-slate-600 shrink-0">
                <div className="font-semibold text-slate-900">{reportTitles[reportKind]}</div>
                <div className="font-mono-tabular mt-0.5">
                  Periode: {periodLabel[periodScope]} · Cetak: {formatDateID(today)}
                </div>
              </div>
            </div>
          )}

          {!includeKop && (
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <h1 className="font-display text-lg font-bold text-slate-900">
                {reportTitles[reportKind]}
              </h1>
              <span className="font-mono-tabular text-xs text-slate-500">
                {periodLabel[periodScope]} · {formatDateID(today)}
              </span>
            </div>
          )}

          {/* REPORT SECTION: EXECUTIVE */}
          {reportKind === 'executive' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Saldo Kas Bersih</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-slate-900 mt-1">
                    {formatRupiah(financeSummary.balance)}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Atlet Aktif / Total</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-slate-900 mt-1">
                    {athletes.filter((a) => a.status === 'Aktif').length} / {athletes.length}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Rekor Personal Best</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-sky-800 mt-1">
                    {scopedSwimTimes.filter((s) => s.isPersonalBest).length} nomor
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Tagihan Belum Lunas</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-amber-700 mt-1">
                    {formatRupiah(invoiceSummary.pending + invoiceSummary.overdue)}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 mb-2">
                  Rekor Personal Best Terbaru ({Math.min(scopedSwimTimes.filter((s) => s.isPersonalBest).length, 8)})
                </h3>
                <table className="w-full text-left border-collapse text-xs border border-slate-200">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-3">Atlet</th>
                      <th className="py-2 px-3">Nomor Lomba</th>
                      <th className="py-2 px-3">Kejuaraan</th>
                      <th className="py-2 px-3 text-right">Waktu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scopedSwimTimes
                      .filter((s) => s.isPersonalBest)
                      .slice(0, 8)
                      .map((st) => (
                        <tr key={st.id}>
                          <td className="py-2 px-3 font-medium text-slate-900">{st.athleteName}</td>
                          <td className="py-2 px-3 text-slate-700">
                            {st.eventName} · {st.poolCourse}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {st.championshipName} ({formatDateID(st.meetDate)})
                          </td>
                          <td className="py-2 px-3 text-right font-mono-tabular font-semibold text-sky-800">
                            {st.formattedTime}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 mb-2">
                  Transaksi Kas Terbaru ({Math.min(scopedTransactions.length, 8)})
                </h3>
                <table className="w-full text-left border-collapse text-xs border border-slate-200">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-3">Tanggal</th>
                      <th className="py-2 px-3">Keterangan</th>
                      <th className="py-2 px-3">Kategori</th>
                      <th className="py-2 px-3 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scopedTransactions.slice(0, 8).map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2 px-3 font-mono-tabular text-slate-600">
                          {formatDateID(tx.transactionDate)}
                        </td>
                        <td className="py-2 px-3 text-slate-900">{tx.description}</td>
                        <td className="py-2 px-3 text-slate-600">{tx.category}</td>
                        <td
                          className={`py-2 px-3 text-right font-mono-tabular font-semibold ${
                            tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {tx.type === 'pemasukan' ? '+' : '-'}
                          {formatRupiah(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REPORT SECTION: FINANCE */}
          {reportKind === 'finance' && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Total Pemasukan</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-emerald-700 mt-1">
                    {formatRupiah(financeSummary.income)}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Total Pengeluaran</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-red-700 mt-1">
                    {formatRupiah(financeSummary.expense)}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Saldo Bersih ({scopedTransactions.length} trx)</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-slate-900 mt-1">
                    {formatRupiah(financeSummary.balance)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs border border-slate-200">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-2.5">Tanggal</th>
                      <th className="py-2 px-2.5">Tipe</th>
                      <th className="py-2 px-2.5">Kategori & Keterangan</th>
                      <th className="py-2 px-2.5">Metode</th>
                      <th className="py-2 px-2.5 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scopedTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500">
                          Tidak ada transaksi pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      scopedTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-2 px-2.5 font-mono-tabular whitespace-nowrap">
                            {formatDateID(tx.transactionDate)}
                          </td>
                          <td className="py-2 px-2.5 capitalize">{tx.type}</td>
                          <td className="py-2 px-2.5">
                            <span className="font-medium text-slate-900">{tx.description}</span>
                            <span className="text-slate-500"> · {tx.category}</span>
                          </td>
                          <td className="py-2 px-2.5 text-slate-600">{tx.paymentMethod}</td>
                          <td
                            className={`py-2 px-2.5 text-right font-mono-tabular font-semibold whitespace-nowrap ${
                              tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {tx.type === 'pemasukan' ? '+' : '-'}
                            {formatRupiah(tx.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REPORT SECTION: ATHLETES & TIMES */}
          {reportKind === 'athletes' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 mb-2">
                  Daftar Atlet Terdaftar ({sortedAthletes.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2 px-2.5">Nama Atlet</th>
                        <th className="py-2 px-2.5">KU / Gender</th>
                        <th className="py-2 px-2.5">Pelatih</th>
                        <th className="py-2 px-2.5">Wali & Kontak</th>
                        <th className="py-2 px-2.5 text-right">SPP</th>
                        <th className="py-2 px-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedAthletes.map((ath) => (
                        <tr key={ath.id}>
                          <td className="py-2 px-2.5 font-medium text-slate-900">{ath.fullName}</td>
                          <td className="py-2 px-2.5">
                            {ath.ageGroup} · {ath.gender}
                          </td>
                          <td className="py-2 px-2.5">{ath.coachName || club.headCoach}</td>
                          <td className="py-2 px-2.5 font-mono-tabular">
                            {ath.parentName || '-'} ({ath.parentPhone || '-'})
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono-tabular">
                            {formatRupiah(ath.monthlyFee)}
                          </td>
                          <td className="py-2 px-2.5">{ath.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 mb-2">
                  Catatan Waktu Kejuaraan ({scopedSwimTimes.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2 px-2.5">Atlet</th>
                        <th className="py-2 px-2.5">Nomor & Kolam</th>
                        <th className="py-2 px-2.5">Kejuaraan & Tanggal</th>
                        <th className="py-2 px-2.5">Hasil</th>
                        <th className="py-2 px-2.5 text-right">Waktu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scopedSwimTimes.map((st) => (
                        <tr key={st.id}>
                          <td className="py-2 px-2.5 font-medium text-slate-900">{st.athleteName}</td>
                          <td className="py-2 px-2.5">
                            {st.eventName} · {st.poolCourse}
                          </td>
                          <td className="py-2 px-2.5">
                            {st.championshipName} ({formatDateID(st.meetDate)})
                          </td>
                          <td className="py-2 px-2.5">
                            {st.medal}
                            {st.isPersonalBest ? ' · PB' : ''}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono-tabular font-semibold text-sky-800">
                            {st.formattedTime}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* REPORT SECTION: SCHEDULES & ATTENDANCE */}
          {reportKind === 'schedules' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Total Sesi Terjadwal</div>
                  <div className="font-mono-tabular text-base font-bold text-slate-900 mt-1">
                    {sortedSchedules.length} sesi
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Presensi Hadir</div>
                  <div className="font-mono-tabular text-base font-bold text-emerald-700 mt-1">
                    {attendanceTotals.hadir} ({attendanceTotals.rate}%)
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Izin / Sakit</div>
                  <div className="font-mono-tabular text-base font-bold text-amber-700 mt-1">
                    {attendanceTotals.izin} / {attendanceTotals.sakit}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Alpa (Tanpa Ket.)</div>
                  <div className="font-mono-tabular text-base font-bold text-red-700 mt-1">
                    {attendanceTotals.alpa}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 mb-2">
                  Matriks Jadwal Latihan Klub
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2 px-2.5">Hari / Jam</th>
                        <th className="py-2 px-2.5">Program & Fokus</th>
                        <th className="py-2 px-2.5">Kelompok</th>
                        <th className="py-2 px-2.5">Lokasi & Lintasan</th>
                        <th className="py-2 px-2.5">Pelatih</th>
                        <th className="py-2 px-2.5 text-right">Target</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedSchedules.map((sch) => (
                        <tr key={sch.id}>
                          <td className="py-2 px-2.5 font-mono-tabular whitespace-nowrap">
                            {sch.dayOfWeek} {sch.startTime}–{sch.endTime}
                            {sch.sessionDate ? ` (${formatDateID(sch.sessionDate)})` : ''}
                          </td>
                          <td className="py-2 px-2.5">
                            <span className="font-medium text-slate-900">{sch.title}</span>
                            <span className="text-slate-500"> · {sch.sessionType}</span>
                          </td>
                          <td className="py-2 px-2.5">{sch.ageGroup}</td>
                          <td className="py-2 px-2.5">
                            {sch.poolLocation}
                            {sch.laneInfo ? ` (${sch.laneInfo})` : ''}
                          </td>
                          <td className="py-2 px-2.5">{sch.coachName}</td>
                          <td className="py-2 px-2.5 text-right font-mono-tabular">
                            {sch.targetDistanceMeters.toLocaleString('id-ID')}m
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {scopedAttendance.length > 0 && (
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900 mb-2">
                    Log Presensi Terbaru ({Math.min(scopedAttendance.length, 25)})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs border border-slate-200">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-2.5">Tanggal</th>
                          <th className="py-2 px-2.5">Sesi Latihan</th>
                          <th className="py-2 px-2.5">Nama Atlet</th>
                          <th className="py-2 px-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {scopedAttendance.slice(0, 25).map((rec) => (
                          <tr key={rec.id}>
                            <td className="py-2 px-2.5 font-mono-tabular">
                              {formatDateID(rec.sessionDate)}
                            </td>
                            <td className="py-2 px-2.5">{rec.scheduleTitle}</td>
                            <td className="py-2 px-2.5 font-medium text-slate-900">
                              {rec.athleteName}
                            </td>
                            <td className="py-2 px-2.5 font-medium">{rec.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* REPORT SECTION: INVOICES */}
          {reportKind === 'invoices' && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Total Lunas</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-emerald-700 mt-1">
                    {formatRupiah(invoiceSummary.paid)}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Belum Lunas</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-amber-700 mt-1">
                    {formatRupiah(invoiceSummary.pending)}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Jatuh Tempo</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-red-700 mt-1">
                    {formatRupiah(invoiceSummary.overdue)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs border border-slate-200">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-2.5">No. Invoice</th>
                      <th className="py-2 px-2.5">Atlet & Wali</th>
                      <th className="py-2 px-2.5">Rincian</th>
                      <th className="py-2 px-2.5">Jatuh Tempo</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scopedInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-2 px-2.5 font-mono-tabular font-semibold">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="font-medium text-slate-900">{inv.athleteName}</div>
                          <div className="text-slate-500">
                            {inv.parentName || '-'} {inv.parentPhone ? `(${inv.parentPhone})` : ''}
                          </div>
                        </td>
                        <td className="py-2 px-2.5">
                          {inv.description} · {inv.periodMonth}
                        </td>
                        <td className="py-2 px-2.5 font-mono-tabular">{formatDateID(inv.dueDate)}</td>
                        <td className="py-2 px-2.5 font-medium">{inv.status}</td>
                        <td className="py-2 px-2.5 text-right font-mono-tabular font-semibold">
                          {formatRupiah(inv.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REPORT SECTION: CLUBOPS */}
          {reportKind === 'clubops' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Pelatih Aktif</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-slate-900 mt-1">
                    {coaches.filter((c) => c.status === 'Aktif').length} / {coaches.length}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Fasilitas Kolam</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-slate-900 mt-1">
                    {pools.length} lokasi
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Perlengkapan</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-slate-900 mt-1">
                    {equipment.reduce((acc, e) => acc + e.quantity, 0)} unit
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Agenda Kejuaraan</div>
                  <div className="font-mono-tabular text-sm sm:text-base font-bold text-sky-800 mt-1">
                    {competitions.length} lomba
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 mb-2">
                  Daftar Pelatih & Staf ({coaches.length})
                </h3>
                <table className="w-full text-left border-collapse text-xs border border-slate-200">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-2.5">Nama</th>
                      <th className="py-2 px-2.5">Peran & Lisensi</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5 text-right">Honorarium/Bln</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {coaches.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 px-2.5 font-medium text-slate-900">{c.fullName}</td>
                        <td className="py-2 px-2.5">{c.role} · {c.licenseLevel}</td>
                        <td className="py-2 px-2.5">{c.status}</td>
                        <td className="py-2 px-2.5 text-right font-mono-tabular">
                          {formatRupiah(c.monthlyHonorarium)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 mb-2">
                  Kalender Target Kejuaraan ({competitions.length})
                </h3>
                <table className="w-full text-left border-collapse text-xs border border-slate-200">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-2.5">Nama Kejuaraan</th>
                      <th className="py-2 px-2.5">Tanggal</th>
                      <th className="py-2 px-2.5">Lokasi</th>
                      <th className="py-2 px-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {competitions.map((k) => (
                      <tr key={k.id}>
                        <td className="py-2 px-2.5 font-medium text-slate-900">{k.name}</td>
                        <td className="py-2 px-2.5 font-mono-tabular">
                          {formatDateID(k.startDate)}
                        </td>
                        <td className="py-2 px-2.5">{k.location} ({k.poolCourse})</td>
                        <td className="py-2 px-2.5">{k.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Signature Block */}
          {includeSignature && (
            <div className="pt-8 grid grid-cols-2 gap-8 text-xs text-slate-700 break-inside-avoid">
              <div className="text-center max-w-[220px]">
                <div>Mengetahui,</div>
                <div>Kepala Pelatih {club.name}</div>
                <div className="mt-16 font-semibold text-slate-900 border-t border-slate-300 pt-1">
                  {club.headCoach}
                </div>
              </div>
              <div className="text-center max-w-[220px] ml-auto">
                <div>
                  {club.city}, {formatDateID(today)}
                </div>
                <div>Administrasi & Keuangan Klub</div>
                <div className="mt-16 font-semibold text-slate-900 border-t border-slate-300 pt-1">
                  Pengurus {club.name}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
