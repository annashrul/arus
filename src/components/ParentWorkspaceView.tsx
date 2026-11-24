import React, { useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString, LIMITS } from '../lib/validation';
import { compressPaymentProofImage } from '../lib/paymentProof';
import { computeConsecutiveAbsences } from '../lib/attendanceAlerts';
import { downloadSchedulesICS } from '../lib/exportUtils';
import { downloadClubSummaryPdf } from '../lib/pdfExport';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useQueryParam } from '../lib/useQueryParams';
import {
  ANNOUNCEMENT_TYPES,
  Athlete,
  AttendanceRecord,
  ClubAnnouncement,
  ClubCompetition,
  ClubInvoice,
  ClubProfile,
  downloadCSV,
  formatDateID,
  formatRupiah,
  INVOICE_STATUSES,
  PaymentRequest,
  POOL_COURSES,
  PROOF_PAYMENT_METHODS,
  ProofPaymentMethod,
  SWIM_STROKES,
  SwimTime,
  TrainingSchedule,
} from '../types/club';
import { BottomSheetSelect } from './BottomSheetSelect';
import { ExportActionMenu } from './ExportActionMenu';
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel';
import { QrisCodeCard } from './QrisCodeCard';
import { SwimTimeTrendChart } from './TrendCharts';
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  Bell,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Filter,
  ImagePlus,
  Loader2,
  MapPin,
  Printer,
  Receipt,
  Timer,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';

export type ParentNavSection = 'overview' | 'progress' | 'schedules' | 'billing' | 'info';

interface ParentWorkspaceViewProps {
  club: ClubProfile;
  activeSection: ParentNavSection;
  onNavigate: (section: ParentNavSection) => void;
  athletes: Athlete[];
  swimTimes: SwimTime[];
  schedules: TrainingSchedule[];
  attendance: AttendanceRecord[];
  invoices: ClubInvoice[];
  paymentRequests: PaymentRequest[];
  announcements: ClubAnnouncement[];
  competitions: ClubCompetition[];
  isPreview?: boolean;
}

export const ParentWorkspaceView: React.FC<ParentWorkspaceViewProps> = ({
  club,
  activeSection,
  onNavigate,
  athletes,
  swimTimes,
  schedules,
  attendance,
  invoices,
  paymentRequests,
  announcements,
  competitions,
  isPreview = false,
}) => {
  const [selectedChildParam, setSelectedChildParam] = useQueryParam('wm_anak', 'all');

  // Progress filters
  const [strokeFilter, setStrokeFilter] = useQueryParam('wm_gaya', 'all');
  const [courseFilter, setCourseFilter] = useQueryParam('wm_kolam', 'all');
  const [onlyPBParam, setOnlyPBParam] = useQueryParam<'0' | '1'>('wm_pb', '0', {
    allowed: ['0', '1'],
  });
  const onlyPB = onlyPBParam === '1';

  // Schedule filters
  const [scheduleDayFilter, setScheduleDayFilter] = useQueryParam('wm_hari', 'all');

  // Billing filters
  const [invStatusFilter, setInvStatusFilter] = useQueryParam('wm_inv_status', 'all', {
    allowed: ['all', ...INVOICE_STATUSES],
  });

  // Info filters
  const [infoTypeFilter, setInfoTypeFilter] = useQueryParam('wm_info_tipe', 'all');

  // Modals
  const [payModalInv, setPayModalInv] = useState<ClubInvoice | null>(null);
  const [payerName, setPayerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ProofPaymentMethod>('Transfer Bank');
  const [proofNote, setProofNote] = useState('');
  const [proofImageDataUrl, setProofImageDataUrl] = useState('');
  const [proofCompressing, setProofCompressing] = useState(false);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofSuccessMsg, setProofSuccessMsg] = useState<string | null>(null);
  const proofFileRef = useRef<HTMLInputElement | null>(null);

  const [detailInv, setDetailInv] = useState<ClubInvoice | null>(null);
  const [selectedAnn, setSelectedAnn] = useState<ClubAnnouncement | null>(null);
  const [copiedBank, setCopiedBank] = useState(false);

  // Resolve scoped child(ren)
  const effectiveChildFilter = useMemo(() => {
    if (athletes.length <= 1) return athletes[0]?.id || 'all';
    if (selectedChildParam === 'all') return 'all';
    return athletes.some((a) => a.id === selectedChildParam) ? selectedChildParam : 'all';
  }, [athletes, selectedChildParam]);

  const scopedAthletes = useMemo(() => {
    if (effectiveChildFilter === 'all') return athletes;
    return athletes.filter((a) => a.id === effectiveChildFilter);
  }, [athletes, effectiveChildFilter]);

  const scopedAthleteIds = useMemo(
    () => new Set(scopedAthletes.map((a) => a.id)),
    [scopedAthletes]
  );

  const scopedAgeGroups = useMemo(
    () => new Set(scopedAthletes.map((a) => a.ageGroup)),
    [scopedAthletes]
  );

  const scopedTimes = useMemo(
    () =>
      [...swimTimes]
        .filter((t) => scopedAthleteIds.has(t.athleteId))
        .sort((a, b) => b.meetDate.localeCompare(a.meetDate)),
    [swimTimes, scopedAthleteIds]
  );

  const filteredTimes = useMemo(
    () =>
      scopedTimes.filter((t) => {
        if (strokeFilter !== 'all' && t.stroke !== strokeFilter) return false;
        if (courseFilter !== 'all' && t.poolCourse !== courseFilter) return false;
        if (onlyPB && !t.isPersonalBest) return false;
        return true;
      }),
    [scopedTimes, strokeFilter, courseFilter, onlyPB]
  );

  const scopedAttendance = useMemo(
    () =>
      [...attendance]
        .filter((r) => scopedAthleteIds.has(r.athleteId))
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)),
    [attendance, scopedAthleteIds]
  );

  const scopedSchedules = useMemo(() => {
    const dayRank: Record<string, number> = {
      Senin: 0,
      Selasa: 1,
      Rabu: 2,
      Kamis: 3,
      Jumat: 4,
      Sabtu: 5,
      Minggu: 6,
    };
    return [...schedules]
      .filter((s) => {
        if (s.ageGroup === 'Semua Kelompok') return true;
        if (scopedAgeGroups.size === 0) return true;
        return scopedAgeGroups.has(s.ageGroup);
      })
      .sort((a, b) => {
        const d = (dayRank[a.dayOfWeek] ?? 7) - (dayRank[b.dayOfWeek] ?? 7);
        return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
      });
  }, [schedules, scopedAgeGroups]);

  const filteredSchedules = useMemo(
    () =>
      scopedSchedules.filter(
        (s) => scheduleDayFilter === 'all' || s.dayOfWeek === scheduleDayFilter
      ),
    [scopedSchedules, scheduleDayFilter]
  );

  const scopedInvoices = useMemo(
    () =>
      [...invoices]
        .filter((i) => scopedAthleteIds.has(i.athleteId))
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [invoices, scopedAthleteIds]
  );

  const filteredInvoices = useMemo(
    () =>
      scopedInvoices.filter(
        (i) => invStatusFilter === 'all' || i.status === invStatusFilter
      ),
    [scopedInvoices, invStatusFilter]
  );

  const paymentReqByInvoiceId = useMemo(() => {
    const map = new Map<string, PaymentRequest>();
    for (const pr of paymentRequests) {
      if (pr.invoiceId) map.set(pr.invoiceId, pr);
    }
    return map;
  }, [paymentRequests]);

  const paymentReqById = useMemo(
    () => new Map(paymentRequests.map((pr) => [pr.id, pr])),
    [paymentRequests]
  );

  const getMatchingPaymentRequest = (inv: ClubInvoice): PaymentRequest | undefined => {
    if (inv.paymentToken && paymentReqById.has(inv.paymentToken)) {
      return paymentReqById.get(inv.paymentToken);
    }
    return paymentReqByInvoiceId.get(inv.id);
  };

  // Summary metrics
  const pbSummaryList = useMemo(() => {
    const bestByEvent = new Map<string, SwimTime>();
    for (const t of scopedTimes) {
      const key = `${t.athleteId}__${t.eventName}__${t.poolCourse}`;
      const existing = bestByEvent.get(key);
      if (!existing || t.timeMs < existing.timeMs) {
        bestByEvent.set(key, t);
      }
    }
    return Array.from(bestByEvent.values()).sort((a, b) => a.eventName.localeCompare(b.eventName));
  }, [scopedTimes]);

  const attendanceStats = useMemo(() => {
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
    const total = scopedAttendance.length;
    const rate = total > 0 ? Math.round((hadir / total) * 100) : 0;
    return { hadir, izin, sakit, alpa, total, rate };
  }, [scopedAttendance]);

  const { alerts: consecutiveAbsenceAlerts } = useMemo(
    () => computeConsecutiveAbsences(scopedAthletes, scopedAttendance, club, 3),
    [scopedAthletes, scopedAttendance, club]
  );

  const billingStats = useMemo(() => {
    let paid = 0;
    let verifying = 0;
    let unpaid = 0;
    let unpaidCount = 0;
    let overdueCount = 0;
    const actionableInvoices: ClubInvoice[] = [];
    const rejectedInvoices: ClubInvoice[] = [];

    for (const inv of scopedInvoices) {
      if (inv.status === 'Lunas') {
        paid += inv.amount;
      } else if (inv.status === 'Menunggu Verifikasi') {
        verifying += inv.amount;
      } else if (inv.status === 'Belum Lunas' || inv.status === 'Jatuh Tempo') {
        unpaid += inv.amount;
        unpaidCount += 1;
        actionableInvoices.push(inv);
        if (inv.status === 'Jatuh Tempo') overdueCount += 1;
        const pr = getMatchingPaymentRequest(inv);
        if (inv.paymentRejectionReason || pr?.rejectionReason) {
          rejectedInvoices.push(inv);
        }
      }
    }
    return { paid, verifying, unpaid, unpaidCount, overdueCount, actionableInvoices, rejectedInvoices };
  }, [scopedInvoices, paymentReqById, paymentReqByInvoiceId]);

  const upcomingCompetitions = useMemo(
    () =>
      [...competitions]
        .filter((c) => c.status !== 'Selesai' && c.status !== 'Dibatalkan')
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [competitions]
  );

  const filteredAnnouncements = useMemo(
    () =>
      [...announcements]
        .filter((a) => infoTypeFilter === 'all' || a.docType === infoTypeFilter)
        .sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || '')),
    [announcements, infoTypeFilter]
  );

  // Infinite scroll hooks
  const {
    visibleItems: visibleTimes,
    visibleCount: visibleTimesCount,
    totalCount: totalTimesCount,
    hasMore: hasMoreTimes,
    loadMore: loadMoreTimes,
    sentinelRef: timesSentinelRef,
  } = useInfiniteScroll(filteredTimes, {
    initialCount: 16,
    step: 16,
    resetKey: `${activeSection}|${effectiveChildFilter}|${strokeFilter}|${courseFilter}|${onlyPB}`,
  });

  const {
    visibleItems: visibleAttendance,
    visibleCount: visibleAttCount,
    totalCount: totalAttCount,
    hasMore: hasMoreAtt,
    loadMore: loadMoreAtt,
    sentinelRef: attSentinelRef,
  } = useInfiniteScroll(scopedAttendance, {
    initialCount: 16,
    step: 16,
    resetKey: `${activeSection}|${effectiveChildFilter}`,
  });

  const {
    visibleItems: visibleInvoices,
    visibleCount: visibleInvCount,
    totalCount: totalInvCount,
    hasMore: hasMoreInv,
    loadMore: loadMoreInv,
    sentinelRef: invSentinelRef,
  } = useInfiniteScroll(filteredInvoices, {
    initialCount: 16,
    step: 16,
    resetKey: `${activeSection}|${effectiveChildFilter}|${invStatusFilter}`,
  });

  const {
    visibleItems: visibleAnnouncements,
    visibleCount: visibleAnnCount,
    totalCount: totalAnnCount,
    hasMore: hasMoreAnn,
    loadMore: loadMoreAnn,
    sentinelRef: annSentinelRef,
  } = useInfiniteScroll(filteredAnnouncements, {
    initialCount: 12,
    step: 12,
    resetKey: `${activeSection}|${infoTypeFilter}`,
  });

  const {
    visibleItems: visibleCompetitions,
    visibleCount: visibleCompCount,
    totalCount: totalCompCount,
    hasMore: hasMoreComp,
    loadMore: loadMoreComp,
    sentinelRef: compSentinelRef,
  } = useInfiniteScroll(competitions, {
    initialCount: 12,
    step: 12,
    resetKey: activeSection,
  });

  // Handlers
  const handleCopyBank = async () => {
    if (!club.bankAccountNumber) return;
    try {
      await navigator.clipboard.writeText(club.bankAccountNumber);
      setCopiedBank(true);
      setTimeout(() => setCopiedBank(false), 2000);
    } catch {
      // ignore
    }
  };

  const openPayModal = (inv: ClubInvoice) => {
    const ath = athletes.find((a) => a.id === inv.athleteId);
    setPayModalInv(inv);
    setPayerName(inv.proofPayerName || inv.parentName || ath?.parentName || '');
    setPaymentMethod(
      PROOF_PAYMENT_METHODS.includes(inv.proofMethod as ProofPaymentMethod)
        ? (inv.proofMethod as ProofPaymentMethod)
        : club.qrisPayload
        ? 'QRIS'
        : 'Transfer Bank'
    );
    setProofNote(inv.proofNote || '');
    setProofImageDataUrl('');
    setProofError(null);
    setProofSuccessMsg(null);
  };

  const handleSelectProofFile = async (file: File | null | undefined) => {
    if (!file) return;
    setProofError(null);
    setProofCompressing(true);
    try {
      const compressed = await compressPaymentProofImage(file);
      setProofImageDataUrl(compressed);
    } catch (err) {
      setProofError(err instanceof Error ? err.message : 'Gagal memproses gambar bukti bayar.');
    } finally {
      setProofCompressing(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalInv) return;
    setProofError(null);

    const cleanPayer = clampString(payerName, LIMITS.paymentProof.payerNameMax);
    const cleanNote = clampString(proofNote, LIMITS.paymentProof.noteMax);

    if (cleanPayer.length < LIMITS.paymentProof.payerNameMin) {
      setProofError('Masukkan nama pengirim / wali minimal 2 karakter.');
      return;
    }
    if (!proofImageDataUrl) {
      setProofError('Unggah foto atau tangkapan layar bukti pembayaran terlebih dahulu.');
      return;
    }

    const canUpdateInvoice =
      payModalInv.status === 'Belum Lunas' || payModalInv.status === 'Jatuh Tempo';
    const matchingPr = getMatchingPaymentRequest(payModalInv);
    const canUpdatePr =
      matchingPr &&
      (matchingPr.status === 'Menunggu Pembayaran' || matchingPr.status === 'Ditolak');

    if (!canUpdateInvoice && !canUpdatePr) {
      setProofError('Invoice ini tidak dalam status menunggu pembayaran.');
      return;
    }

    const submittedIso = new Date().toISOString();
    setSubmittingProof(true);
    try {
      const batch = writeBatch(db);
      if (canUpdateInvoice) {
        batch.update(doc(db, 'invoices', payModalInv.id), {
          status: 'Menunggu Verifikasi',
          proofImageDataUrl,
          proofPayerName: cleanPayer,
          proofMethod: paymentMethod,
          proofNote: cleanNote,
          proofSubmittedAt: submittedIso,
          paymentRejectionReason: '',
          updatedAt: serverTimestamp(),
        });
      }
      if (canUpdatePr && matchingPr) {
        batch.update(doc(db, 'paymentRequests', matchingPr.id), {
          status: 'Menunggu Verifikasi',
          proofImageDataUrl,
          payerName: cleanPayer,
          paymentMethod,
          proofNote: cleanNote,
          submittedAt: submittedIso,
          rejectionReason: '',
          updatedAt: serverTimestamp(),
        });
      }
      await batch
        .commit()
        .catch((err) => handleFirestoreError(err, OperationType.UPDATE, `invoices/${payModalInv.id}`));

      setPayModalInv(null);
      setProofSuccessMsg(
        `Bukti pembayaran ${payModalInv.invoiceNumber} berhasil dikirim dan menunggu verifikasi admin klub.`
      );
      setTimeout(() => setProofSuccessMsg(null), 6000);
    } catch (err) {
      setProofError(err instanceof Error ? err.message : 'Gagal mengirim bukti pembayaran.');
    } finally {
      setSubmittingProof(false);
    }
  };

  const handleExportProgressCSV = () => {
    downloadCSV(
      `progres-atlet-${club.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
      ['Atlet', 'Nomor Lomba', 'Kolam', 'Waktu', 'Kejuaraan', 'Tanggal', 'Lokasi', 'Hasil/Medali', 'Personal Best'],
      filteredTimes.map((t) => [
        t.athleteName,
        t.eventName,
        t.poolCourse,
        t.formattedTime,
        t.championshipName,
        t.meetDate,
        t.location || '-',
        t.medal,
        t.isPersonalBest ? 'Ya' : 'Tidak',
      ])
    );
  };

  // Empty state if parent email hasn't been linked to any athlete yet
  if (athletes.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center space-y-3">
        <Users className="w-10 h-10 text-slate-300 mx-auto" />
        <h2 className="font-display text-lg font-semibold text-slate-900">
          {isPreview
            ? 'Belum Ada Atlet Terhubung untuk Pratinjau Wali Murid'
            : 'Belum Ada Data Atlet Tertaut ke Akun Anda'}
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          {isPreview
            ? 'Tambahkan data atlet terlebih dahulu atau tautkan atlet pada menu Invoice & Adm → Akses Role untuk melihat portal wali murid.'
            : `Hubungi pengurus/admin ${club.name} untuk menautkan profil atlet anak Anda ke email Google akun ini melalui menu Akses Role.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Child Context Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-sky-700">Portal Wali Murid · {club.name}</div>
          <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 truncate mt-0.5">
            {scopedAthletes.length === 1
              ? `${scopedAthletes[0].fullName} (${scopedAthletes[0].ageGroup})`
              : `Memantau ${scopedAthletes.length} Atlet Terhubung`}
          </h1>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {scopedAthletes.length === 1
              ? `Pelatih: ${scopedAthletes[0].coachName || club.headCoach} · Status: ${scopedAthletes[0].status}`
              : scopedAthletes.map((a) => `${a.fullName} (${a.ageGroup})`).join(' · ')}
          </p>
        </div>

        {athletes.length > 1 && (
          <div className="w-full sm:w-64 shrink-0">
            <BottomSheetSelect
              value={effectiveChildFilter}
              onChange={setSelectedChildParam}
              title="Pilih Atlet Anak"
              triggerPrefix="Anak:"
              icon={<Users className="w-3.5 h-3.5" />}
              options={[
                { value: 'all', label: `Semua Anak (${athletes.length})` },
                ...athletes.map((a) => ({
                  value: a.id,
                  label: a.fullName,
                  badge: a.ageGroup,
                })),
              ]}
            />
          </div>
        )}
      </div>

      {proofSuccessMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{proofSuccessMsg}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: OVERVIEW                                                   */}
      {/* ================================================================= */}
      {activeSection === 'overview' && (
        <div className="space-y-5">
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => onNavigate('progress')}
              className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Rekor Personal Best</span>
                <Award className="w-4 h-4 text-sky-700 shrink-0" />
              </div>
              <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-slate-900">
                {scopedTimes.filter((t) => t.isPersonalBest).length}{' '}
                <span className="text-xs font-normal text-slate-500">nomor</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {scopedTimes.length} catatan kejuaraan
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('schedules')}
              className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Kehadiran Latihan</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
              <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-slate-900">
                {attendanceStats.rate}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono-tabular">
                {attendanceStats.hadir} hadir dari {attendanceStats.total} sesi
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('billing')}
              className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Tagihan Belum Lunas</span>
                <Receipt className="w-4 h-4 text-amber-600 shrink-0" />
              </div>
              <div
                className={`font-mono-tabular text-lg sm:text-2xl font-bold truncate ${
                  billingStats.overdueCount > 0 ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {formatRupiah(billingStats.unpaid)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono-tabular">
                {billingStats.unpaidCount} invoice aktif
                {billingStats.verifying > 0 ? ` · ${formatRupiah(billingStats.verifying)} diverifikasi` : ''}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('info')}
              className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Agenda Lomba</span>
                <Trophy className="w-4 h-4 text-slate-700 shrink-0" />
              </div>
              <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-slate-900">
                {upcomingCompetitions.length}{' '}
                <span className="text-xs font-normal text-slate-500">agenda</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {announcements.length} pengumuman klub
              </div>
            </button>
          </div>

          {/* Alerts: Rejected proof, Overdue invoice, or 3x Consecutive Absence */}
          {(billingStats.rejectedInvoices.length > 0 ||
            consecutiveAbsenceAlerts.length > 0 ||
            billingStats.actionableInvoices.length > 0) && (
            <div className="space-y-2.5">
              {billingStats.rejectedInvoices.map((inv) => {
                const pr = getMatchingPaymentRequest(inv);
                const reason = inv.paymentRejectionReason || pr?.rejectionReason || '';
                return (
                  <div
                    key={`rej-${inv.id}`}
                    className="bg-red-50/70 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-0.5">
                        <div className="font-semibold text-red-900">
                          Bukti Bayar {inv.invoiceNumber} ({inv.athleteName}) Perlu Diunggah Ulang
                        </div>
                        {reason && <p className="text-red-700">Alasan admin: {reason}</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openPayModal(inv)}
                      className="px-3.5 min-h-[38px] text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Unggah Ulang Bukti
                    </button>
                  </div>
                );
              })}

              {consecutiveAbsenceAlerts.map((al) => (
                <div
                  key={`abs-${al.athlete.id}`}
                  className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-0.5">
                      <div className="font-semibold text-amber-950">
                        Perhatian Kehadiran: {al.athlete.fullName} tidak hadir {al.streak} sesi berturut-turut
                      </div>
                      <p className="text-amber-800">
                        Rincian: {al.breakdownSummary} · Terakhir {formatDateID(al.lastSessionDate)} ({al.lastSessionTitle})
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('schedules')}
                    className="px-3.5 min-h-[38px] text-xs font-medium text-amber-900 bg-white border border-amber-300 hover:bg-amber-100/60 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Lihat Log Presensi
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Actionable Invoices Quick List */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Tagihan SPP & Lomba
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('billing')}
                  className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  Semua Tagihan <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {billingStats.actionableInvoices.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 space-y-1.5">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                  <p className="font-medium text-slate-800">Semua tagihan sudah dibayar atau sedang diverifikasi.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {billingStats.actionableInvoices.slice(0, 4).map((inv) => (
                    <div key={inv.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {inv.description}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5 truncate">
                          {inv.athleteName} · Tempo {formatDateID(inv.dueDate)} ·{' '}
                          <span className={inv.status === 'Jatuh Tempo' ? 'text-red-600 font-semibold' : 'text-amber-700'}>
                            {inv.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono-tabular text-xs font-bold text-slate-900">
                          {formatRupiah(inv.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openPayModal(inv)}
                          className="px-3 min-h-[34px] text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          Bayar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming Schedules */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Jadwal Latihan Anak
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('schedules')}
                  className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  Semua Jadwal <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {scopedSchedules.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  <Clock className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                  Belum ada jadwal latihan untuk kelompok umur anak Anda.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {scopedSchedules.slice(0, 4).map((sch) => (
                    <div key={sch.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900">{sch.title}</span>
                        <span className="font-mono-tabular text-xs text-sky-700 font-semibold whitespace-nowrap shrink-0">
                          {sch.dayOfWeek}, {sch.startTime}–{sch.endTime}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {sch.poolLocation}
                        {sch.laneInfo ? ` (${sch.laneInfo})` : ''} · Pelatih {sch.coachName}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Latest Announcements */}
          {announcements.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-sky-700" />
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Pengumuman & Surat Terbaru
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('info')}
                  className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  Semua Info <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {announcements.slice(0, 2).map((ann) => (
                  <button
                    key={ann.id}
                    type="button"
                    onClick={() => setSelectedAnn(ann)}
                    className="text-left p-3.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="text-[11px] font-medium text-sky-700">
                      {ann.docType}
                      {ann.eventDate ? ` · ${formatDateID(ann.eventDate)}` : ''}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5 truncate">
                      {ann.title}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{ann.content}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: PROGRESS & SWIM TIMES                                      */}
      {/* ================================================================= */}
      {activeSection === 'progress' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                Progres Latihan & Catatan Waktu Kejuaraan
              </h2>
              <p className="text-xs text-slate-500">
                Pantau rekor Personal Best (PB) dan grafik perkembangan kecepatan renang anak.
              </p>
            </div>
            <ExportActionMenu
              label="Ekspor Progres"
              options={[
                {
                  id: 'wm-prog-pdf',
                  label: 'Download PDF (.pdf)',
                  description: 'Laporan progres waktu kejuaraan anak',
                  format: 'pdf',
                  disabled: filteredTimes.length === 0,
                  onSelect: () =>
                    downloadClubSummaryPdf({
                      kind: 'athletes',
                      club,
                      athletes: scopedAthletes,
                      swimTimes: filteredTimes,
                      hideFinancial: true,
                      periodLabel: 'Progres Atlet Anak',
                    }),
                },
                {
                  id: 'wm-prog-csv',
                  label: 'Ekspor CSV (.csv)',
                  description: `${filteredTimes.length} catatan waktu`,
                  format: 'csv',
                  disabled: filteredTimes.length === 0,
                  onSelect: handleExportProgressCSV,
                },
              ]}
            />
          </div>

          {/* Personal Best Highlights */}
          {pbSummaryList.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
              <h3 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                Catatan Waktu Terbaik (Personal Best)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pbSummaryList.slice(0, 9).map((pb) => (
                  <div
                    key={pb.id}
                    className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {pb.eventName} · {pb.poolCourse}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {scopedAthletes.length > 1 ? `${pb.athleteName} · ` : ''}
                        {pb.championshipName}
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-400">
                        {formatDateID(pb.meetDate)}
                      </div>
                    </div>
                    <div className="font-mono-tabular text-base font-bold text-sky-800 shrink-0">
                      {pb.formattedTime}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Swim Time Trend Chart */}
          <SwimTimeTrendChart swimTimes={scopedTimes} compact />

          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <BottomSheetSelect
              value={strokeFilter}
              onChange={setStrokeFilter}
              title="Filter Gaya Renang"
              triggerPrefix="Gaya:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="all"
              options={[
                { value: 'all', label: 'Semua Gaya' },
                ...SWIM_STROKES.map((s) => ({ value: s, label: s })),
              ]}
            />
            <BottomSheetSelect
              value={courseFilter}
              onChange={setCourseFilter}
              title="Filter Lintasan Kolam"
              triggerPrefix="Kolam:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="all"
              options={[
                { value: 'all', label: 'Semua Kolam' },
                ...POOL_COURSES.map((c) => ({ value: c, label: c })),
              ]}
            />
            <label className="inline-flex items-center gap-2 px-3 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg cursor-pointer bg-white">
              <input
                type="checkbox"
                checked={onlyPB}
                onChange={(e) => setOnlyPBParam(e.target.checked ? '1' : '0')}
                className="rounded border-slate-300 text-sky-700 w-4 h-4"
              />
              Hanya Personal Best (PB)
            </label>
          </div>

          {/* Meet History List */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredTimes.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Timer className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-900">
                  Belum ada catatan waktu kejuaraan
                </p>
                <p className="text-xs text-slate-500">
                  Catatan waktu resmi hasil lomba akan tampil di sini setelah diinput oleh pelatih.
                </p>
              </div>
            ) : (
              <>
                <div className="md:hidden divide-y divide-slate-100">
                  {visibleTimes.map((st) => (
                    <div key={st.id} className="p-4 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {st.eventName} · {st.poolCourse}
                          </div>
                          <div className="text-xs text-slate-500">
                            {scopedAthletes.length > 1 ? `${st.athleteName} · ` : ''}
                            {st.championshipName}
                          </div>
                        </div>
                        <div className="font-mono-tabular text-base font-bold text-sky-800 shrink-0">
                          {st.formattedTime}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-mono-tabular">{formatDateID(st.meetDate)}</span>
                        <span className="font-medium text-slate-800">
                          {st.medal}
                          {st.isPersonalBest ? ' · PB' : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Tanggal</th>
                        <th className="py-3 px-4">Atlet & Nomor</th>
                        <th className="py-3 px-4">Kejuaraan & Lokasi</th>
                        <th className="py-3 px-4">Hasil</th>
                        <th className="py-3 px-4 text-right">Waktu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {visibleTimes.map((st) => (
                        <tr key={st.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono-tabular text-slate-600 whitespace-nowrap">
                            {formatDateID(st.meetDate)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{st.athleteName}</div>
                            <div className="text-slate-500">
                              {st.eventName} · {st.poolCourse}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">{st.championshipName}</div>
                            <div className="text-slate-500">{st.location || '-'}</div>
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800">
                            {st.medal}
                            {st.isPersonalBest && (
                              <span className="text-sky-700 font-semibold"> · PB</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular font-bold text-slate-900 whitespace-nowrap">
                            {st.formattedTime}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <InfiniteScrollSentinel
                  sentinelRef={timesSentinelRef}
                  visibleCount={visibleTimesCount}
                  totalCount={totalTimesCount}
                  hasMore={hasMoreTimes}
                  onLoadMore={loadMoreTimes}
                  itemLabel="catatan waktu"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: SCHEDULES & ATTENDANCE                                     */}
      {/* ================================================================= */}
      {activeSection === 'schedules' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                Jadwal Latihan & Rekap Kehadiran
              </h2>
              <p className="text-xs text-slate-500">
                Jadwal latihan sesuai kelompok umur anak serta riwayat presensi yang dicatat pelatih.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={scopedSchedules.length === 0}
                onClick={() => downloadSchedulesICS(club, scopedSchedules)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer disabled:opacity-50"
              >
                <Calendar className="w-3.5 h-3.5 text-sky-700" />
                Unduh Kalender (.ics)
              </button>
            </div>
          </div>

          {/* Schedule Filter & Grid */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <h3 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                Jadwal Latihan Kelompok ({filteredSchedules.length})
              </h3>
              <div className="w-full sm:w-52">
                <BottomSheetSelect
                  value={scheduleDayFilter}
                  onChange={setScheduleDayFilter}
                  title="Filter Hari Latihan"
                  triggerPrefix="Hari:"
                  icon={<Calendar className="w-3.5 h-3.5" />}
                  resetValue="all"
                  options={[
                    { value: 'all', label: 'Semua Hari' },
                    ...['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((d) => ({
                      value: d,
                      label: d,
                    })),
                  ]}
                />
              </div>
            </div>

            {filteredSchedules.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Belum ada jadwal latihan pada hari yang dipilih.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredSchedules.map((sch) => (
                  <div
                    key={sch.id}
                    className="border border-slate-200 rounded-xl p-4 space-y-2 bg-slate-50/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-sky-700">
                        {sch.dayOfWeek}
                        {sch.sessionDate ? ` (${formatDateID(sch.sessionDate)})` : ''}
                      </span>
                      <span className="font-mono-tabular text-xs font-semibold text-slate-900">
                        {sch.startTime}–{sch.endTime}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{sch.title}</div>
                    <div className="text-xs text-slate-600 space-y-1">
                      <div>
                        {sch.sessionType} · {sch.ageGroup}
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {sch.poolLocation}
                          {sch.laneInfo ? ` (${sch.laneInfo})` : ''}
                        </span>
                      </div>
                      <div className="text-slate-500">
                        Pelatih: {sch.coachName} · Target{' '}
                        <span className="font-mono-tabular">
                          {sch.targetDistanceMeters.toLocaleString('id-ID')}m
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attendance Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="col-span-2 sm:col-span-1 bg-white border border-slate-200 rounded-xl p-3.5">
              <span className="text-xs text-slate-500">Tingkat Hadir</span>
              <div className="font-mono-tabular text-xl font-bold text-sky-800 mt-1">
                {attendanceStats.rate}%
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <span className="text-xs text-slate-500">Hadir</span>
              <div className="font-mono-tabular text-lg font-bold text-emerald-700 mt-1">
                {attendanceStats.hadir}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <span className="text-xs text-slate-500">Izin</span>
              <div className="font-mono-tabular text-lg font-bold text-sky-700 mt-1">
                {attendanceStats.izin}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <span className="text-xs text-slate-500">Sakit</span>
              <div className="font-mono-tabular text-lg font-bold text-amber-700 mt-1">
                {attendanceStats.sakit}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <span className="text-xs text-slate-500">Alpa</span>
              <div className="font-mono-tabular text-lg font-bold text-red-600 mt-1">
                {attendanceStats.alpa}
              </div>
            </div>
          </div>

          {/* Attendance Log */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                Riwayat Presensi Latihan ({scopedAttendance.length})
              </h3>
            </div>
            {scopedAttendance.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada catatan presensi yang tersimpan.
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {visibleAttendance.map((rec) => (
                    <div
                      key={rec.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {rec.scheduleTitle}
                        </div>
                        <div className="text-slate-500 mt-0.5 font-mono-tabular">
                          {formatDateID(rec.sessionDate)}
                          {scopedAthletes.length > 1 ? ` · ${rec.athleteName}` : ''}
                        </div>
                      </div>
                      <span
                        className={`font-semibold shrink-0 ${
                          rec.status === 'Hadir'
                            ? 'text-emerald-700'
                            : rec.status === 'Izin'
                            ? 'text-sky-700'
                            : rec.status === 'Sakit'
                            ? 'text-amber-700'
                            : 'text-red-600'
                        }`}
                      >
                        {rec.status}
                      </span>
                    </div>
                  ))}
                </div>
                <InfiniteScrollSentinel
                  sentinelRef={attSentinelRef}
                  visibleCount={visibleAttCount}
                  totalCount={totalAttCount}
                  hasMore={hasMoreAtt}
                  onLoadMore={loadMoreAtt}
                  itemLabel="catatan presensi"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: BILLING & PAYMENT PROOF UPLOAD                             */}
      {/* ================================================================= */}
      {activeSection === 'billing' && (
        <div className="space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Belum Lunas / Jatuh Tempo</span>
              <div className="font-mono-tabular text-xl font-bold text-red-600 mt-1">
                {formatRupiah(billingStats.unpaid)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Menunggu Verifikasi Admin</span>
              <div className="font-mono-tabular text-xl font-bold text-sky-700 mt-1">
                {formatRupiah(billingStats.verifying)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Sudah Lunas</span>
              <div className="font-mono-tabular text-xl font-bold text-emerald-700 mt-1">
                {formatRupiah(billingStats.paid)}
              </div>
            </div>
          </div>

          {/* Bank Account Instructions */}
          {(club.bankName || club.bankAccountNumber || club.qrisPayload) && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-900">
                    Rekening Pembayaran Resmi {club.name}
                  </div>
                  <div className="text-slate-600">
                    {club.bankName || 'Transfer Bank'} ·{' '}
                    <span className="font-mono-tabular font-bold text-slate-900">
                      {club.bankAccountNumber || '-'}
                    </span>{' '}
                    {club.bankAccountHolder ? `a.n. ${club.bankAccountHolder}` : ''}
                    {club.qrisPayload ? ' · QRIS Dinamis Tersedia' : ''}
                  </div>
                </div>
              </div>
              {club.bankAccountNumber && (
                <button
                  type="button"
                  onClick={handleCopyBank}
                  className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[38px] text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg shrink-0 cursor-pointer"
                >
                  {copiedBank ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      No. Rek Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Salin No. Rekening
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Filter & Invoice List */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span className="text-xs font-semibold text-slate-800">
              Daftar Tagihan Anak ({filteredInvoices.length})
            </span>
            <div className="w-full sm:w-56">
              <BottomSheetSelect
                value={invStatusFilter}
                onChange={(v) => setInvStatusFilter(v as typeof invStatusFilter)}
                title="Filter Status Tagihan"
                triggerPrefix="Status:"
                icon={<Filter className="w-3.5 h-3.5" />}
                resetValue="all"
                options={[
                  { value: 'all', label: 'Semua Status' },
                  ...INVOICE_STATUSES.map((s) => ({ value: s, label: s })),
                ]}
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredInvoices.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-900">
                  Tidak ada tagihan pada filter ini
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {visibleInvoices.map((inv) => {
                    const pr = getMatchingPaymentRequest(inv);
                    const rejection = inv.paymentRejectionReason || pr?.rejectionReason || '';
                    const canUploadProof =
                      inv.status === 'Belum Lunas' || inv.status === 'Jatuh Tempo';

                    return (
                      <div key={inv.id} className="p-4 sm:p-5 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono-tabular text-xs font-bold text-slate-900">
                                {inv.invoiceNumber}
                              </span>
                              <span
                                className={`text-xs font-semibold ${
                                  inv.status === 'Lunas'
                                    ? 'text-emerald-700'
                                    : inv.status === 'Menunggu Verifikasi'
                                    ? 'text-sky-700'
                                    : inv.status === 'Jatuh Tempo'
                                    ? 'text-red-600'
                                    : inv.status === 'Dibatalkan'
                                    ? 'text-slate-400'
                                    : 'text-amber-700'
                                }`}
                              >
                                {inv.status}
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                              {inv.description}
                            </div>
                            <div className="text-xs text-slate-500">
                              {inv.athleteName} · {inv.periodMonth} · Jatuh tempo{' '}
                              <span className="font-mono-tabular">{formatDateID(inv.dueDate)}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <div className="font-mono-tabular text-base font-bold text-slate-900">
                              {formatRupiah(inv.amount)}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDetailInv(inv)}
                                className="px-3 min-h-[38px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/70 rounded-lg cursor-pointer whitespace-nowrap"
                              >
                                Kwitansi
                              </button>
                              {canUploadProof && (
                                <button
                                  type="button"
                                  onClick={() => openPayModal(inv)}
                                  className="px-3.5 min-h-[38px] text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg cursor-pointer whitespace-nowrap"
                                >
                                  Bayar & Unggah Bukti
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {rejection && canUploadProof && (
                          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                            <span className="font-semibold">Bukti sebelumnya ditolak:</span> {rejection}
                          </div>
                        )}

                        {inv.status === 'Menunggu Verifikasi' && (
                          <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900">
                            Bukti pembayaran telah dikirim
                            {inv.proofPayerName ? ` oleh ${inv.proofPayerName}` : ''}
                            {inv.proofMethod ? ` (${inv.proofMethod})` : ''}. Admin klub sedang memverifikasi.
                          </div>
                        )}

                        {inv.status === 'Lunas' && inv.paidDate && (
                          <div className="text-xs text-emerald-700 font-medium">
                            Lunas pada {formatDateID(inv.paidDate)}
                            {inv.paymentMethod ? ` via ${inv.paymentMethod}` : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <InfiniteScrollSentinel
                  sentinelRef={invSentinelRef}
                  visibleCount={visibleInvCount}
                  totalCount={totalInvCount}
                  hasMore={hasMoreInv}
                  onLoadMore={loadMoreInv}
                  itemLabel="invoice"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 5: INFO, ANNOUNCEMENTS & COMPETITIONS                         */}
      {/* ================================================================= */}
      {activeSection === 'info' && (
        <div className="space-y-6">
          {/* Announcements Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                  Pengumuman & Surat Resmi Klub ({filteredAnnouncements.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Surat tugas kejuaraan, undangan rapat wali murid, dan informasi resmi klub.
                </p>
              </div>
              <div className="w-full sm:w-56">
                <BottomSheetSelect
                  value={infoTypeFilter}
                  onChange={setInfoTypeFilter}
                  title="Filter Jenis Dokumen"
                  triggerPrefix="Jenis:"
                  icon={<Filter className="w-3.5 h-3.5" />}
                  resetValue="all"
                  options={[
                    { value: 'all', label: 'Semua Dokumen' },
                    ...ANNOUNCEMENT_TYPES.map((t) => ({ value: t, label: t })),
                  ]}
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {filteredAnnouncements.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  <FileText className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
                  Belum ada surat atau pengumuman klub.
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100">
                    {visibleAnnouncements.map((ann) => (
                      <button
                        key={ann.id}
                        type="button"
                        onClick={() => setSelectedAnn(ann)}
                        className="w-full text-left p-4 sm:p-5 hover:bg-slate-50/70 transition-colors cursor-pointer space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-sky-700">{ann.docType}</span>
                          {ann.eventDate && (
                            <span className="font-mono-tabular text-slate-500">
                              {formatDateID(ann.eventDate)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-slate-900">{ann.title}</div>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {ann.content}
                        </p>
                        <div className="text-[11px] text-slate-400">
                          Sasaran: {ann.targetGroup || 'Semua Anggota'} · Oleh {ann.authorName}
                        </div>
                      </button>
                    ))}
                  </div>
                  <InfiniteScrollSentinel
                    sentinelRef={annSentinelRef}
                    visibleCount={visibleAnnCount}
                    totalCount={totalAnnCount}
                    hasMore={hasMoreAnn}
                    onLoadMore={loadMoreAnn}
                    itemLabel="pengumuman"
                  />
                </>
              )}
            </div>
          </div>

          {/* Competitions Calendar */}
          <div className="space-y-3">
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                Kalender Kejuaraan & Target Lomba ({competitions.length})
              </h2>
              <p className="text-xs text-slate-500">
                Jadwal kejuaraan renang yang diikuti klub beserta lokasi dan status pendaftaran.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {competitions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  <Trophy className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
                  Belum ada jadwal kejuaraan yang dirilis.
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100">
                    {visibleCompetitions.map((k) => (
                      <div key={k.id} className="p-4 sm:p-5 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">{k.name}</span>
                          <span
                            className={`text-xs font-semibold ${
                              k.status === 'Pendaftaran Dibuka'
                                ? 'text-amber-700'
                                : k.status === 'Berlangsung'
                                ? 'text-sky-700'
                                : k.status === 'Selesai'
                                ? 'text-emerald-700'
                                : k.status === 'Dibatalkan'
                                ? 'text-red-600'
                                : 'text-slate-600'
                            }`}
                          >
                            {k.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono-tabular">
                            {k.startDate === k.endDate
                              ? formatDateID(k.startDate)
                              : `${formatDateID(k.startDate)} – ${formatDateID(k.endDate)}`}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>{k.level}</span>
                          <span className="text-slate-300">·</span>
                          <span>{k.poolCourse}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          Lokasi: {k.location}
                          {k.registrationFee > 0 && ` · Biaya daftar ${formatRupiah(k.registrationFee)}`}
                        </div>
                        {k.notes && <p className="text-xs text-slate-500 pt-1">{k.notes}</p>}
                      </div>
                    ))}
                  </div>
                  <InfiniteScrollSentinel
                    sentinelRef={compSentinelRef}
                    visibleCount={visibleCompCount}
                    totalCount={totalCompCount}
                    hasMore={hasMoreComp}
                    onLoadMore={loadMoreComp}
                    itemLabel="kejuaraan"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: PAY & UPLOAD RECEIPT PROOF                                 */}
      {/* ================================================================= */}
      {payModalInv && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                  Pembayaran & Unggah Bukti
                </h2>
                <p className="font-mono-tabular text-xs text-slate-500">
                  {payModalInv.invoiceNumber} · {payModalInv.athleteName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayModalInv(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal pembayaran"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">{payModalInv.description}</div>
                  <div className="text-slate-500 mt-0.5">
                    Periode {payModalInv.periodMonth} · Jatuh tempo {formatDateID(payModalInv.dueDate)}
                  </div>
                </div>
                <div className="font-mono-tabular text-base font-bold text-sky-800 shrink-0">
                  {formatRupiah(payModalInv.amount)}
                </div>
              </div>

              <QrisCodeCard
                club={club}
                invoiceNumber={payModalInv.invoiceNumber}
                amount={payModalInv.amount}
                athleteName={payModalInv.athleteName}
                periodMonth={payModalInv.periodMonth}
                compact
              />

              {club.bankAccountNumber && (
                <div className="p-3 rounded-lg border border-slate-200 text-xs flex items-center justify-between gap-2">
                  <div>
                    <div className="text-slate-500">Transfer Bank ({club.bankName || 'Bank'})</div>
                    <div className="font-mono-tabular font-bold text-slate-900">
                      {club.bankAccountNumber}{' '}
                      <span className="font-sans font-normal text-slate-600">
                        a.n. {club.bankAccountHolder || club.name}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyBank}
                    className="px-2.5 min-h-[34px] text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg shrink-0 cursor-pointer"
                  >
                    {copiedBank ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmitProof} className="space-y-3.5 pt-2 border-t border-slate-200">
                {proofError && (
                  <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{proofError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nama Pengirim / Wali <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={LIMITS.paymentProof.payerNameMax}
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      placeholder="Nama pemilik rekening"
                      className="w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Metode Bayar
                    </label>
                    <BottomSheetSelect
                      value={paymentMethod}
                      onChange={(v) => setPaymentMethod(v as ProofPaymentMethod)}
                      title="Pilih Metode Pembayaran"
                      options={PROOF_PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Foto / Screenshot Bukti Bayar <span className="text-red-600">*</span>
                  </label>
                  <input
                    ref={proofFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      void handleSelectProofFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  {proofImageDataUrl ? (
                    <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50">
                      <img
                        src={proofImageDataUrl}
                        alt="Pratinjau bukti transfer"
                        referrerPolicy="no-referrer"
                        className="w-full max-h-56 object-contain rounded-lg bg-white border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => proofFileRef.current?.click()}
                        className="w-full min-h-[38px] text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                      >
                        Ganti Gambar Bukti Bayar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={proofCompressing}
                      onClick={() => proofFileRef.current?.click()}
                      className="w-full border border-dashed border-slate-300 rounded-xl p-5 flex flex-col items-center justify-center gap-1.5 text-xs text-slate-600 hover:border-sky-600 hover:bg-sky-50/40 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {proofCompressing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin text-sky-700" />
                          <span>Mengompres gambar bukti bayar...</span>
                        </>
                      ) : (
                        <>
                          <ImagePlus className="w-5 h-5 text-sky-700" />
                          <span className="font-semibold text-slate-900">
                            Pilih Foto Struk / Screenshot Transfer
                          </span>
                          <span className="text-[11px] text-slate-400">
                            JPG, PNG, atau WebP (otomatis dikompres)
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Catatan (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.paymentProof.noteMax}
                    value={proofNote}
                    onChange={(e) => setProofNote(e.target.value)}
                    placeholder="Contoh: Transfer BCA jam 14.20"
                    className="w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="pt-2 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPayModalInv(null)}
                    className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submittingProof || proofCompressing}
                    className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg disabled:opacity-60 cursor-pointer"
                  >
                    {submittingProof ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {submittingProof ? 'Mengirim...' : 'Kirim Bukti Bayar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: INVOICE DETAIL / RECEIPT                                   */}
      {/* ================================================================= */}
      {detailInv && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 pb-safe">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <div className="text-xs font-semibold text-sky-700">{club.name}</div>
                <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  Rincian Tagihan & Kwitansi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailInv(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer no-print"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-500 block">No. Invoice</span>
                  <span className="font-mono-tabular font-bold text-slate-900">
                    {detailInv.invoiceNumber}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Status</span>
                  <span className="font-semibold text-slate-900">{detailInv.status}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Nama Atlet</span>
                  <span className="font-semibold text-slate-900">{detailInv.athleteName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Periode</span>
                  <span className="font-semibold text-slate-900">{detailInv.periodMonth}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{detailInv.description}</div>
                  <div className="text-slate-500 mt-0.5">{detailInv.category}</div>
                </div>
                <div className="font-mono-tabular text-base font-bold text-slate-900">
                  {formatRupiah(detailInv.amount)}
                </div>
              </div>

              {detailInv.paidDate && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                  Dibayar lunas tanggal {formatDateID(detailInv.paidDate)}
                  {detailInv.paymentMethod ? ` melalui ${detailInv.paymentMethod}` : ''}.
                </div>
              )}

              {detailInv.proofImageDataUrl && (
                <div className="space-y-1.5">
                  <div className="font-medium text-slate-700">Bukti Bayar Terlampir</div>
                  <img
                    src={detailInv.proofImageDataUrl}
                    alt="Bukti pembayaran"
                    referrerPolicy="no-referrer"
                    className="w-full max-h-56 object-contain rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200 flex justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak
              </button>
              <button
                type="button"
                onClick={() => setDetailInv(null)}
                className="px-4 min-h-[38px] text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: ANNOUNCEMENT READER                                        */}
      {/* ================================================================= */}
      {selectedAnn && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6 pb-safe">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <div className="text-xs font-semibold text-sky-700">{selectedAnn.docType}</div>
                <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                  {selectedAnn.title}
                </h3>
                <div className="text-xs text-slate-500 mt-1">
                  {selectedAnn.eventDate ? `${formatDateID(selectedAnn.eventDate)} · ` : ''}
                  Sasaran: {selectedAnn.targetGroup || 'Semua Anggota'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnn(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {selectedAnn.content}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Diterbitkan oleh: {selectedAnn.authorName}</span>
              <button
                type="button"
                onClick={() => setSelectedAnn(null)}
                className="px-4 min-h-[36px] font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
