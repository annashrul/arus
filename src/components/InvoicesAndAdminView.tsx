import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  clampString,
  FieldErrors,
  isValidBankAccountFormat,
  isValidBlueprintDate,
  isValidEmailFormat,
  isValidPhoneFormat,
  LIMITS,
} from '../lib/validation';
import {
  ANNOUNCEMENT_TYPES,
  AnnouncementDocType,
  Athlete,
  ClubAnnouncement,
  ClubInvoice,
  ClubProfile,
  currentMonthLabel,
  downloadCSV,
  formatDateID,
  formatRupiah,
  INVOICE_CATEGORIES,
  INVOICE_STATUSES,
  InvoiceCategory,
  PAYMENT_METHODS,
  PaymentMethod,
  PaymentRequest,
  PROOF_PAYMENT_METHODS,
  ProofPaymentMethod,
  todayISO,
} from '../types/club';
import { buildInvoicesSheet, downloadExcelWorkbook } from '../lib/exportUtils';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  FileText,
  Filter,
  ImagePlus,
  Layers,
  Link2,
  Loader2,
  MessageCircle,
  Plus,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { ExportActionMenu } from './ExportActionMenu';
import { BottomSheetSelect } from './BottomSheetSelect';
import { QrisCodeCard } from './QrisCodeCard';
import { WhatsAppNotifyModal, WhatsAppRecipientItem } from './WhatsAppNotifyModal';
import { buildInvoiceNotificationMessage } from '../lib/whatsapp';
import {
  buildPaymentPortalUrl,
  compressPaymentProofImage,
  generatePaymentToken,
  isValidPaymentTokenFormat,
} from '../lib/paymentProof';
import { useQueryParam } from '../lib/useQueryParams';
import {
  buildSampleQrisPayload,
  decodeQrisFromImageFile,
  extractQrisMerchantInfo,
  isValidQrisString,
} from '../lib/qris';

interface InvoicesAndAdminViewProps {
  club: ClubProfile;
  userId: string;
  invoices: ClubInvoice[];
  paymentRequests?: PaymentRequest[];
  athletes: Athlete[];
  announcements: ClubAnnouncement[];
  onOpenPrintReport: () => void;
}

export const InvoicesAndAdminView: React.FC<InvoicesAndAdminViewProps> = ({
  club,
  userId,
  invoices,
  paymentRequests = [],
  athletes,
  announcements,
  onOpenPrintReport,
}) => {
  const [activeTab, setActiveTab] = useQueryParam<'invoices' | 'letters' | 'settings'>(
    'inv_tab',
    'invoices',
    { allowed: ['invoices', 'letters', 'settings'], history: 'push' }
  );
  const [listError, setListError] = useState<string | null>(null);
  const [confirmDeleteInvId, setConfirmDeleteInvId] = useState<string | null>(null);
  const [confirmDeleteAnnId, setConfirmDeleteAnnId] = useState<string | null>(null);

  // Invoice filters (synced to URL query params)
  const [invSearch, setInvSearch] = useQueryParam('inv_q', '');
  const [statusFilter, setStatusFilter] = useQueryParam('inv_status', 'all', {
    allowed: ['all', ...INVOICE_STATUSES],
  });

  // Create Invoice Modal
  const [createInvOpen, setCreateInvOpen] = useState(false);
  const [invAthleteId, setInvAthleteId] = useState('');
  const [invCategory, setInvCategory] = useState<InvoiceCategory>('Iuran Bulanan (SPP)');
  const [invPeriod, setInvPeriod] = useState(currentMonthLabel());
  const [invDesc, setInvDesc] = useState('');
  const [invAmount, setInvAmount] = useState(String(club.defaultMonthlyFee));
  const [invDueDate, setInvDueDate] = useState(todayISO());
  const [invNotes, setInvNotes] = useState('');
  const [invError, setInvError] = useState<string | null>(null);
  const [invFieldErrors, setInvFieldErrors] = useState<
    FieldErrors<'athleteId' | 'category' | 'period' | 'desc' | 'amount' | 'dueDate' | 'notes'>
  >({});
  const [savingInv, setSavingInv] = useState(false);

  // Batch SPP Generator Modal
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchPeriod, setBatchPeriod] = useState(currentMonthLabel());
  const [batchDueDate, setBatchDueDate] = useState(todayISO());
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchFieldErrors, setBatchFieldErrors] = useState<FieldErrors<'period' | 'dueDate'>>({});
  const [savingBatch, setSavingBatch] = useState(false);

  // Settle / Mark Paid Modal
  const [payModalInv, setPayModalInv] = useState<ClubInvoice | null>(null);
  const [payDate, setPayDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Transfer Bank');
  const [payNotes, setPayNotes] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [payFieldErrors, setPayFieldErrors] = useState<
    FieldErrors<'payDate' | 'payMethod' | 'payNotes'>
  >({});
  const [paying, setPaying] = useState(false);

  // Proof Inspection & Quick Confirm / Admin Upload Modal (synced to ?inv_bukti)
  const [proofModalInvId, setProofModalInvId] = useQueryParam('inv_bukti', '', {
    history: 'push',
  });
  const proofModalInv = useMemo(
    () => (proofModalInvId ? invoices.find((i) => i.id === proofModalInvId) || null : null),
    [invoices, proofModalInvId]
  );
  const [quickConfirmingId, setQuickConfirmingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingProof, setRejectingProof] = useState(false);
  const [proofActionError, setProofActionError] = useState<string | null>(null);
  const [adminProofImage, setAdminProofImage] = useState('');
  const [adminProofPayer, setAdminProofPayer] = useState('');
  const [adminProofMethod, setAdminProofMethod] = useState<ProofPaymentMethod>('Transfer Bank');
  const [adminProofNote, setAdminProofNote] = useState('');
  const [adminProofCompressing, setAdminProofCompressing] = useState(false);
  const [adminProofSaving, setAdminProofSaving] = useState(false);
  const [copiedPortalInvId, setCopiedPortalInvId] = useState<string | null>(null);

  // Preview / Print Invoice Modal (synced to ?inv_lihat)
  const [previewInvId, setPreviewInvId] = useQueryParam('inv_lihat', '', { history: 'push' });
  const previewInv = useMemo(
    () => (previewInvId ? invoices.find((i) => i.id === previewInvId) || null : null),
    [invoices, previewInvId]
  );
  const [copiedWa, setCopiedWa] = useState(false);

  // WhatsApp Parent Notification Modal
  const [waModalData, setWaModalData] = useState<{
    title: string;
    description: string;
    recipients: WhatsAppRecipientItem[];
  } | null>(null);

  // Announcements Modal
  const [annModalOpen, setAnnModalOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annType, setAnnType] = useState<AnnouncementDocType>('Surat Tugas Lomba');
  const [annDate, setAnnDate] = useState(todayISO());
  const [annTarget, setAnnTarget] = useState('Semua Kelompok');
  const [annAuthor, setAnnAuthor] = useState(club.headCoach);
  const [annContent, setAnnContent] = useState('');
  const [annError, setAnnError] = useState<string | null>(null);
  const [annFieldErrors, setAnnFieldErrors] = useState<
    FieldErrors<'title' | 'type' | 'date' | 'target' | 'author' | 'content'>
  >({});
  const [savingAnn, setSavingAnn] = useState(false);
  const [previewAnnId, setPreviewAnnId] = useQueryParam('srt_lihat', '', { history: 'push' });
  const previewAnn = useMemo(
    () => (previewAnnId ? announcements.find((a) => a.id === previewAnnId) || null : null),
    [announcements, previewAnnId]
  );

  // Club Settings Form
  const [sName, setSName] = useState(club.name);
  const [sCity, setSCity] = useState(club.city);
  const [sAddress, setSAddress] = useState(club.address || '');
  const [sCoach, setSCoach] = useState(club.headCoach);
  const [sPhone, setSPhone] = useState(club.phone || '');
  const [sEmail, setSEmail] = useState(club.email || '');
  const [sBankName, setSBankName] = useState(club.bankName || '');
  const [sBankNo, setSBankNo] = useState(club.bankAccountNumber || '');
  const [sBankHolder, setSBankHolder] = useState(club.bankAccountHolder || '');
  const [sFee, setSFee] = useState(String(club.defaultMonthlyFee));
  const [sQrisPayload, setSQrisPayload] = useState(club.qrisPayload || '');
  const [sQrisMerchantName, setSQrisMerchantName] = useState(club.qrisMerchantName || '');
  const [qrisPreviewDataUrl, setQrisPreviewDataUrl] = useState('');
  const [qrisUploading, setQrisUploading] = useState(false);
  const [qrisUploadMsg, setQrisUploadMsg] = useState<string | null>(null);
  const qrisFileInputRef = useRef<HTMLInputElement | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsFieldErrors, setSettingsFieldErrors] = useState<
    FieldErrors<
      | 'name'
      | 'city'
      | 'address'
      | 'coach'
      | 'fee'
      | 'phone'
      | 'email'
      | 'bankName'
      | 'bankNo'
      | 'bankHolder'
      | 'qrisPayload'
      | 'qrisMerchantName'
    >
  >({});

  useEffect(() => {
    setSName(club.name);
    setSCity(club.city);
    setSAddress(club.address || '');
    setSCoach(club.headCoach);
    setSPhone(club.phone || '');
    setSEmail(club.email || '');
    setSBankName(club.bankName || '');
    setSBankNo(club.bankAccountNumber || '');
    setSBankHolder(club.bankAccountHolder || '');
    setSFee(String(club.defaultMonthlyFee));
    setSQrisPayload(club.qrisPayload || '');
    setSQrisMerchantName(club.qrisMerchantName || '');
  }, [club]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = sQrisPayload.trim();
    if (!trimmed || !isValidQrisString(trimmed)) {
      setQrisPreviewDataUrl('');
      return;
    }
    QRCode.toDataURL(trimmed, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 200,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrisPreviewDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrisPreviewDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [sQrisPayload]);

  const paymentReqMaps = useMemo(() => {
    const byId = new Map<string, PaymentRequest>();
    const byInvoiceId = new Map<string, PaymentRequest>();
    for (const pr of paymentRequests) {
      byId.set(pr.id, pr);
      byInvoiceId.set(pr.invoiceId, pr);
    }
    return { byId, byInvoiceId };
  }, [paymentRequests]);

  const getProofSummary = (inv: ClubInvoice) => {
    const req =
      (inv.paymentToken ? paymentReqMaps.byId.get(inv.paymentToken) : undefined) ||
      paymentReqMaps.byInvoiceId.get(inv.id);
    const proofImage = inv.proofImageDataUrl || req?.proofImageDataUrl || '';
    const payerName = inv.proofPayerName || req?.payerName || '';
    const method = inv.proofMethod || req?.paymentMethod || 'Transfer Bank';
    const note = inv.proofNote || req?.proofNote || '';
    const submittedAt = inv.proofSubmittedAt || req?.submittedAt || '';
    const effectiveStatus =
      inv.status !== 'Lunas' &&
      inv.status !== 'Dibatalkan' &&
      req?.status === 'Menunggu Verifikasi'
        ? 'Menunggu Verifikasi'
        : inv.status;
    const hasPendingProof =
      inv.status !== 'Lunas' &&
      inv.status !== 'Dibatalkan' &&
      (effectiveStatus === 'Menunggu Verifikasi' || Boolean(proofImage));
    return {
      req,
      token: inv.paymentToken || req?.id || '',
      proofImage,
      payerName,
      method,
      note,
      submittedAt,
      effectiveStatus,
      hasPendingProof,
    };
  };

  const pendingVerificationInvoices = useMemo(
    () => invoices.filter((inv) => getProofSummary(inv).hasPendingProof),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, paymentRequests]
  );

  const filteredInvoices = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    return [...invoices]
      .filter((inv) => {
        const { effectiveStatus } = getProofSummary(inv);
        if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;
        if (q) {
          const hay = `${inv.invoiceNumber} ${inv.athleteName} ${inv.description} ${inv.periodMonth}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aVer = getProofSummary(a).hasPendingProof ? 0 : 1;
        const bVer = getProofSummary(b).hasPendingProof ? 0 : 1;
        if (aVer !== bVer) return aVer - bVer;
        return b.dueDate.localeCompare(a.dueDate);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, paymentRequests, invSearch, statusFilter]);

  const invoiceTotals = useMemo(() => {
    let paid = 0;
    let pending = 0;
    let overdue = 0;
    for (const inv of invoices) {
      if (inv.status === 'Lunas') paid += inv.amount;
      else if (inv.status === 'Belum Lunas' || inv.status === 'Menunggu Verifikasi')
        pending += inv.amount;
      else if (inv.status === 'Jatuh Tempo') overdue += inv.amount;
    }
    return { paid, pending, overdue };
  }, [invoices]);

  const activeZeroFeeAthletesCount = useMemo(
    () => athletes.filter((a) => a.status === 'Aktif' && a.monthlyFee <= 0).length,
    [athletes]
  );

  const buildPaymentRequestPayload = (params: {
    invoiceId: string;
    invoiceNumber: string;
    athleteName: string;
    periodMonth: string;
    description: string;
    amount: number;
    dueDate: string;
  }) => ({
    clubId: club.id,
    ownerId: userId,
    clubName: clampString(club.name, LIMITS.club.nameMax),
    clubCity: clampString(club.city, LIMITS.club.cityMax),
    invoiceId: params.invoiceId,
    invoiceNumber: params.invoiceNumber,
    athleteName: params.athleteName,
    periodMonth: params.periodMonth,
    description: params.description,
    amount: params.amount,
    dueDate: params.dueDate,
    status: 'Menunggu Pembayaran',
    bankName: clampString(club.bankName || '', LIMITS.club.bankNameMax),
    bankAccountNumber: clampString(club.bankAccountNumber || '', LIMITS.club.bankAccountNumberMax),
    bankAccountHolder: clampString(club.bankAccountHolder || '', LIMITS.club.bankAccountHolderMax),
    qrisPayload: clampString(club.qrisPayload || '', LIMITS.club.qrisPayloadMax),
    qrisMerchantName: clampString(club.qrisMerchantName || '', LIMITS.club.qrisMerchantNameMax),
    proofImageDataUrl: '',
    payerName: '',
    paymentMethod: '',
    proofNote: '',
    submittedAt: '',
    verifiedAt: '',
    rejectionReason: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ensurePaymentRequestForInvoice = async (inv: ClubInvoice): Promise<string> => {
    const existingReq =
      (inv.paymentToken ? paymentReqMaps.byId.get(inv.paymentToken) : undefined) ||
      paymentReqMaps.byInvoiceId.get(inv.id);
    if (existingReq && isValidPaymentTokenFormat(existingReq.id)) {
      if (inv.paymentToken !== existingReq.id) {
        await updateDoc(doc(db, 'invoices', inv.id), {
          paymentToken: existingReq.id,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      return existingReq.id;
    }

    const token = isValidPaymentTokenFormat(inv.paymentToken)
      ? inv.paymentToken
      : generatePaymentToken();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'paymentRequests', token),
      buildPaymentRequestPayload({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        athleteName: inv.athleteName,
        periodMonth: inv.periodMonth,
        description: inv.description,
        amount: inv.amount,
        dueDate: inv.dueDate,
      })
    );
    if (inv.paymentToken !== token) {
      batch.update(doc(db, 'invoices', inv.id), {
        paymentToken: token,
        updatedAt: serverTimestamp(),
      });
    }
    await batch
      .commit()
      .catch((err) => handleFirestoreError(err, OperationType.WRITE, `paymentRequests/${token}`));
    return token;
  };

  const openCreateInvoice = () => {
    const firstAth = athletes[0];
    setInvAthleteId(firstAth?.id || '');
    setInvCategory('Iuran Bulanan (SPP)');
    setInvPeriod(currentMonthLabel());
    setInvDesc(`Iuran Latihan — ${currentMonthLabel()}`);
    setInvAmount(String(firstAth?.monthlyFee ?? club.defaultMonthlyFee));
    setInvDueDate(todayISO());
    setInvNotes('');
    setInvError(null);
    setInvFieldErrors({});
    setCreateInvOpen(true);
  };

  const handleSelectInvAthlete = (id: string) => {
    setInvAthleteId(id);
    setInvFieldErrors((prev) => ({ ...prev, athleteId: undefined }));
    const ath = athletes.find((a) => a.id === id);
    if (ath && invCategory === 'Iuran Bulanan (SPP)') {
      setInvAmount(String(ath.monthlyFee));
      setInvDesc(`Iuran Latihan ${ath.ageGroup} — ${invPeriod}`);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvError(null);

    const errors: FieldErrors<
      'athleteId' | 'category' | 'period' | 'desc' | 'amount' | 'dueDate' | 'notes'
    > = {};

    const ath = athletes.find((a) => a.id === invAthleteId);
    if (!ath) {
      errors.athleteId = 'Pilih atlet yang valid terlebih dahulu.';
    }

    if (!INVOICE_CATEGORIES.includes(invCategory)) {
      errors.category = 'Kategori tagihan tidak valid.';
    }

    const cleanPeriod = clampString(invPeriod, LIMITS.invoice.periodMonthMax);
    if (cleanPeriod.length < LIMITS.invoice.periodMonthMin) {
      errors.period = `Periode minimal ${LIMITS.invoice.periodMonthMin} karakter (contoh: Desember 2026).`;
    }

    const cleanDesc = clampString(invDesc, LIMITS.invoice.descriptionMax);
    if (cleanDesc.length < LIMITS.invoice.descriptionMin) {
      errors.desc = `Deskripsi rincian minimal ${LIMITS.invoice.descriptionMin} karakter.`;
    }

    const parsedAmount = Number(invAmount);
    if (
      invAmount.trim() === '' ||
      !Number.isFinite(parsedAmount) ||
      !Number.isInteger(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > 500000000
    ) {
      errors.amount = 'Nominal tagihan harus berupa bilangan bulat Rp 1 hingga Rp 500.000.000.';
    }

    if (!invDueDate.trim() || !isValidBlueprintDate(invDueDate)) {
      errors.dueDate = 'Tanggal jatuh tempo tidak valid.';
    }

    if (invNotes.trim().length > LIMITS.invoice.notesMax) {
      errors.notes = `Catatan maksimal ${LIMITS.invoice.notesMax} karakter.`;
    }

    if (Object.keys(errors).length > 0) {
      setInvFieldErrors(errors);
      setInvError(Object.values(errors)[0] || 'Periksa kembali rincian invoice.');
      return;
    }

    if (!ath) return;
    setInvFieldErrors({});

    const seq = String(invoices.length + 1).padStart(3, '0');
    const ym = invDueDate.slice(0, 7).replace('-', '/');
    const invoiceNumber = `INV/${ym}/${seq}-${Math.floor(10 + Math.random() * 89)}`;

    const cleanAthleteName = clampString(ath.fullName, LIMITS.athlete.fullNameMax);
    const cleanParentName = clampString(ath.parentName || '', LIMITS.athlete.parentNameMax);
    const cleanParentPhone = clampString(ath.parentPhone || '', LIMITS.athlete.parentPhoneMax);
    const roundedAmount = Math.round(parsedAmount);

    setSavingInv(true);
    try {
      const invRef = doc(collection(db, 'invoices'));
      const paymentToken = generatePaymentToken();
      const batch = writeBatch(db);
      batch.set(invRef, {
        clubId: club.id,
        ownerId: userId,
        invoiceNumber,
        athleteId: ath.id,
        athleteName: cleanAthleteName,
        parentName: cleanParentName,
        parentPhone: cleanParentPhone,
        periodMonth: cleanPeriod,
        category: invCategory,
        description: cleanDesc,
        amount: roundedAmount,
        dueDate: invDueDate,
        status: 'Belum Lunas',
        paidDate: '',
        paymentMethod: '',
        paymentToken,
        notes: clampString(invNotes, LIMITS.invoice.notesMax),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'paymentRequests', paymentToken),
        buildPaymentRequestPayload({
          invoiceId: invRef.id,
          invoiceNumber,
          athleteName: cleanAthleteName,
          periodMonth: cleanPeriod,
          description: cleanDesc,
          amount: roundedAmount,
          dueDate: invDueDate,
        })
      );
      await batch
        .commit()
        .catch((err) => handleFirestoreError(err, OperationType.CREATE, 'invoices'));

      const paymentPortalUrl = buildPaymentPortalUrl(paymentToken);
      setCreateInvOpen(false);
      setWaModalData({
        title: 'Kirim Notifikasi Invoice ke Orang Tua',
        description: `Invoice ${invoiceNumber} telah diterbitkan beserta tautan portal bayar & unggah bukti.`,
        recipients: [
          {
            id: invoiceNumber,
            athleteName: cleanAthleteName,
            parentName: cleanParentName,
            parentPhone: cleanParentPhone,
            subtitle: `${invoiceNumber} · ${formatRupiah(roundedAmount)}`,
            message: buildInvoiceNotificationMessage(club, {
              invoiceNumber,
              athleteName: cleanAthleteName,
              parentName: cleanParentName,
              description: cleanDesc,
              periodMonth: cleanPeriod,
              amount: roundedAmount,
              dueDate: invDueDate,
              status: 'Belum Lunas',
              paymentPortalUrl,
            }),
          },
        ],
      });
    } catch (err) {
      setInvError(err instanceof Error ? err.message : 'Gagal membuat invoice.');
    } finally {
      setSavingInv(false);
    }
  };

  const handleBatchGenerateSPP = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchError(null);

    const errors: FieldErrors<'period' | 'dueDate'> = {};
    const cleanPeriod = clampString(batchPeriod, LIMITS.invoice.periodMonthMax);
    if (cleanPeriod.length < LIMITS.invoice.periodMonthMin) {
      errors.period = `Periode bulan minimal ${LIMITS.invoice.periodMonthMin} karakter.`;
    }
    if (!batchDueDate.trim() || !isValidBlueprintDate(batchDueDate)) {
      errors.dueDate = 'Tanggal jatuh tempo tidak valid.';
    }

    if (Object.keys(errors).length > 0) {
      setBatchFieldErrors(errors);
      setBatchError(Object.values(errors)[0] || 'Periksa kembali data tagihan massal.');
      return;
    }

    const activeBillableAthletes = athletes.filter((a) => a.status === 'Aktif' && a.monthlyFee > 0);
    if (activeBillableAthletes.length === 0) {
      setBatchError(
        'Tidak ada atlet aktif dengan nominal iuran bulanan lebih dari Rp 0. Perbarui iuran pada data atlet terlebih dahulu.'
      );
      return;
    }

    const alreadyBilledIds = new Set(
      invoices
        .filter(
          (i) =>
            i.category === 'Iuran Bulanan (SPP)' &&
            i.periodMonth.toLowerCase() === cleanPeriod.toLowerCase() &&
            i.status !== 'Dibatalkan'
        )
        .map((i) => i.athleteId)
    );
    const targets = activeBillableAthletes.filter((a) => !alreadyBilledIds.has(a.id));

    if (targets.length === 0) {
      setBatchError(
        `Semua atlet aktif (${activeBillableAthletes.length} orang) sudah memiliki tagihan SPP untuk periode ${cleanPeriod}.`
      );
      return;
    }

    setBatchFieldErrors({});
    setSavingBatch(true);
    try {
      const ym = batchDueDate.slice(0, 7).replace('-', '/');
      const createdRecipients: WhatsAppRecipientItem[] = [];
      const CHUNK_SIZE = 180; // 2 writes per athlete = 360 ops < 500 Firestore batch cap

      for (let start = 0; start < targets.length; start += CHUNK_SIZE) {
        const chunk = targets.slice(start, start + CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((ath, offset) => {
          const idx = start + offset;
          const seq = String(invoices.length + idx + 1).padStart(3, '0');
          const invNumber = `INV/${ym}/SPP-${seq}`;
          const ref = doc(collection(db, 'invoices'));
          const paymentToken = generatePaymentToken();
          const cleanAthleteName = clampString(ath.fullName, LIMITS.athlete.fullNameMax);
          const cleanParentName = clampString(ath.parentName || '', LIMITS.athlete.parentNameMax);
          const cleanParentPhone = clampString(ath.parentPhone || '', LIMITS.athlete.parentPhoneMax);
          const description = `Iuran Latihan Reguler ${ath.ageGroup} — ${cleanPeriod}`;
          const roundedAmount = Math.round(ath.monthlyFee);

          batch.set(ref, {
            clubId: club.id,
            ownerId: userId,
            invoiceNumber: invNumber,
            athleteId: ath.id,
            athleteName: cleanAthleteName,
            parentName: cleanParentName,
            parentPhone: cleanParentPhone,
            periodMonth: cleanPeriod,
            category: 'Iuran Bulanan (SPP)',
            description,
            amount: roundedAmount,
            dueDate: batchDueDate,
            status: 'Belum Lunas',
            paidDate: '',
            paymentMethod: '',
            paymentToken,
            notes: `Transfer ke ${club.bankName || 'Rekening Klub'} ${club.bankAccountNumber || ''}`.trim(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          batch.set(
            doc(db, 'paymentRequests', paymentToken),
            buildPaymentRequestPayload({
              invoiceId: ref.id,
              invoiceNumber: invNumber,
              athleteName: cleanAthleteName,
              periodMonth: cleanPeriod,
              description,
              amount: roundedAmount,
              dueDate: batchDueDate,
            })
          );

          createdRecipients.push({
            id: invNumber,
            athleteName: cleanAthleteName,
            parentName: cleanParentName,
            parentPhone: cleanParentPhone,
            subtitle: `${invNumber} · ${formatRupiah(roundedAmount)}`,
            message: buildInvoiceNotificationMessage(club, {
              invoiceNumber: invNumber,
              athleteName: cleanAthleteName,
              parentName: cleanParentName,
              description,
              periodMonth: cleanPeriod,
              amount: roundedAmount,
              dueDate: batchDueDate,
              status: 'Belum Lunas',
              paymentPortalUrl: buildPaymentPortalUrl(paymentToken),
            }),
          });
        });

        await batch
          .commit()
          .catch((err) => handleFirestoreError(err, OperationType.WRITE, 'invoices/batch_spp'));
      }

      setBatchOpen(false);
      if (createdRecipients.length > 0) {
        setWaModalData({
          title: `Kirim Notifikasi SPP ${cleanPeriod}`,
          description: `${createdRecipients.length} invoice SPP baru diterbitkan beserta tautan unggah bukti bayar orang tua.`,
          recipients: createdRecipients,
        });
      }
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Gagal membuat tagihan massal.');
    } finally {
      setSavingBatch(false);
    }
  };

  const handleSettleInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalInv) return;
    setPayError(null);

    const errors: FieldErrors<'payDate' | 'payMethod' | 'payNotes'> = {};
    if (!payDate.trim() || !isValidBlueprintDate(payDate)) {
      errors.payDate = 'Tanggal pembayaran tidak valid.';
    } else if (payDate > todayISO()) {
      errors.payDate = 'Tanggal pelunasan tidak boleh melebihi hari ini.';
    }

    if (!PAYMENT_METHODS.includes(payMethod)) {
      errors.payMethod = 'Metode pembayaran tidak valid.';
    }

    if (payNotes.trim().length > LIMITS.invoice.notesMax) {
      errors.payNotes = `Catatan maksimal ${LIMITS.invoice.notesMax} karakter.`;
    }

    if (Object.keys(errors).length > 0) {
      setPayFieldErrors(errors);
      setPayError(Object.values(errors)[0] || 'Periksa kembali rincian pelunasan.');
      return;
    }

    setPayFieldErrors({});
    setPaying(true);
    try {
      const batch = writeBatch(db);
      // 1. Update invoice to Lunas
      batch.update(doc(db, 'invoices', payModalInv.id), {
        status: 'Lunas',
        paidDate: payDate,
        paymentMethod: payMethod,
        paymentRejectionReason: '',
        notes: clampString(payNotes || payModalInv.notes || '', LIMITS.invoice.notesMax),
        updatedAt: serverTimestamp(),
      });

      const { token } = getProofSummary(payModalInv);
      if (token && paymentReqMaps.byId.has(token)) {
        batch.update(doc(db, 'paymentRequests', token), {
          status: 'Terverifikasi',
          verifiedAt: new Date().toISOString(),
          rejectionReason: '',
          updatedAt: serverTimestamp(),
        });
      }

      // 2. Automatically record matching Pemasukan in transactions
      const txCategory =
        payModalInv.category === 'Iuran Bulanan (SPP)'
          ? 'Iuran Bulanan (SPP)'
          : payModalInv.category === 'Biaya Kejuaraan'
          ? 'Pendaftaran Kejuaraan'
          : payModalInv.category === 'Seragam & Perlengkapan'
          ? 'Perlengkapan & Atribut'
          : 'Lainnya';

      batch.set(doc(collection(db, 'transactions')), {
        clubId: club.id,
        ownerId: userId,
        type: 'pemasukan',
        category: txCategory,
        description: clampString(
          `Pelunasan ${payModalInv.invoiceNumber} — ${payModalInv.athleteName}`,
          LIMITS.transaction.descriptionMax
        ),
        amount: payModalInv.amount,
        transactionDate: payDate,
        paymentMethod: payMethod,
        referenceNo: clampString(payModalInv.invoiceNumber, LIMITS.transaction.referenceNoMax),
        athleteId: payModalInv.athleteId,
        athleteName: clampString(payModalInv.athleteName, LIMITS.transaction.athleteNameMax),
        invoiceId: payModalInv.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit().catch((err) =>
        handleFirestoreError(err, OperationType.WRITE, `invoices/${payModalInv.id}`)
      );
      setPayModalInv(null);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Gagal memproses pelunasan invoice.');
    } finally {
      setPaying(false);
    }
  };

  const handleQuickConfirmProof = async (inv: ClubInvoice) => {
    if (inv.status === 'Lunas' || inv.status === 'Dibatalkan') return;
    setListError(null);
    setProofActionError(null);
    setQuickConfirmingId(inv.id);
    try {
      const { req, token, method, payerName } = getProofSummary(inv);
      const resolvedMethod: PaymentMethod =
        method === 'QRIS' ? 'QRIS' : method === 'Tunai' ? 'Tunai' : 'Transfer Bank';
      const today = todayISO();
      const batch = writeBatch(db);

      batch.update(doc(db, 'invoices', inv.id), {
        status: 'Lunas',
        paidDate: today,
        paymentMethod: resolvedMethod,
        paymentRejectionReason: '',
        notes: clampString(
          inv.notes ||
            (payerName
              ? `Terverifikasi otomatis dari bukti bayar (${payerName})`
              : 'Terverifikasi dari bukti pembayaran'),
          LIMITS.invoice.notesMax
        ),
        updatedAt: serverTimestamp(),
      });

      if (token && (req || paymentReqMaps.byId.has(token))) {
        batch.update(doc(db, 'paymentRequests', token), {
          status: 'Terverifikasi',
          verifiedAt: new Date().toISOString(),
          rejectionReason: '',
          updatedAt: serverTimestamp(),
        });
      }

      const txCategory =
        inv.category === 'Iuran Bulanan (SPP)'
          ? 'Iuran Bulanan (SPP)'
          : inv.category === 'Biaya Kejuaraan'
          ? 'Pendaftaran Kejuaraan'
          : inv.category === 'Seragam & Perlengkapan'
          ? 'Perlengkapan & Atribut'
          : 'Lainnya';

      batch.set(doc(collection(db, 'transactions')), {
        clubId: club.id,
        ownerId: userId,
        type: 'pemasukan',
        category: txCategory,
        description: clampString(
          `Pelunasan ${inv.invoiceNumber} — ${inv.athleteName}`,
          LIMITS.transaction.descriptionMax
        ),
        amount: inv.amount,
        transactionDate: today,
        paymentMethod: resolvedMethod,
        referenceNo: clampString(inv.invoiceNumber, LIMITS.transaction.referenceNoMax),
        athleteId: inv.athleteId,
        athleteName: clampString(inv.athleteName, LIMITS.transaction.athleteNameMax),
        invoiceId: inv.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch
        .commit()
        .catch((err) => handleFirestoreError(err, OperationType.WRITE, `invoices/${inv.id}`));
      if (proofModalInvId === inv.id) {
        setProofModalInvId('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengonfirmasi pelunasan cepat.';
      setProofActionError(msg);
      setListError(msg);
    } finally {
      setQuickConfirmingId(null);
    }
  };

  const handleRejectProof = async (inv: ClubInvoice) => {
    const cleanReason = clampString(rejectReason, LIMITS.invoice.paymentRejectionReasonMax);
    if (cleanReason.length < 3) {
      setProofActionError('Masukkan alasan penolakan minimal 3 karakter agar orang tua bisa mengunggah ulang.');
      return;
    }
    setProofActionError(null);
    setRejectingProof(true);
    try {
      const { req, token } = getProofSummary(inv);
      const batch = writeBatch(db);
      batch.update(doc(db, 'invoices', inv.id), {
        status: 'Belum Lunas',
        paymentRejectionReason: cleanReason,
        updatedAt: serverTimestamp(),
      });
      if (token && (req || paymentReqMaps.byId.has(token))) {
        batch.update(doc(db, 'paymentRequests', token), {
          status: 'Ditolak',
          rejectionReason: cleanReason,
          updatedAt: serverTimestamp(),
        });
      }
      await batch
        .commit()
        .catch((err) => handleFirestoreError(err, OperationType.WRITE, `invoices/${inv.id}`));
      setRejectReason('');
      setProofModalInvId('');
    } catch (err) {
      setProofActionError(err instanceof Error ? err.message : 'Gagal menolak bukti pembayaran.');
    } finally {
      setRejectingProof(false);
    }
  };

  const handleOpenProofModal = (inv: ClubInvoice) => {
    const info = getProofSummary(inv);
    setProofActionError(null);
    setRejectReason('');
    setAdminProofImage(info.proofImage || '');
    setAdminProofPayer(info.payerName || inv.parentName || '');
    setAdminProofMethod(
      PROOF_PAYMENT_METHODS.includes(info.method as ProofPaymentMethod)
        ? (info.method as ProofPaymentMethod)
        : 'Transfer Bank'
    );
    setAdminProofNote(info.note || '');
    setProofModalInvId(inv.id);
  };

  const handleAdminProofFileSelected = async (file: File | null | undefined) => {
    if (!file) return;
    setProofActionError(null);
    setAdminProofCompressing(true);
    try {
      const compressed = await compressPaymentProofImage(file);
      setAdminProofImage(compressed);
    } catch (err) {
      setProofActionError(err instanceof Error ? err.message : 'Gagal memproses gambar bukti bayar.');
    } finally {
      setAdminProofCompressing(false);
    }
  };

  const handleSaveAdminUploadedProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofModalInv) return;
    const cleanPayer = clampString(adminProofPayer, LIMITS.invoice.proofPayerNameMax);
    const cleanNote = clampString(adminProofNote, LIMITS.invoice.proofNoteMax);
    if (!adminProofImage || !adminProofImage.startsWith('data:image/')) {
      setProofActionError('Pilih gambar bukti pembayaran terlebih dahulu.');
      return;
    }
    if (cleanPayer.length < 2) {
      setProofActionError('Nama pengirim minimal 2 karakter.');
      return;
    }

    setProofActionError(null);
    setAdminProofSaving(true);
    try {
      const submittedAt = new Date().toISOString();
      const { req, token } = getProofSummary(proofModalInv);
      const batch = writeBatch(db);
      batch.update(doc(db, 'invoices', proofModalInv.id), {
        status: 'Menunggu Verifikasi',
        proofImageDataUrl: adminProofImage,
        proofPayerName: cleanPayer,
        proofMethod: adminProofMethod,
        proofNote: cleanNote,
        proofSubmittedAt: submittedAt,
        paymentRejectionReason: '',
        updatedAt: serverTimestamp(),
      });
      if (token && (req || paymentReqMaps.byId.has(token))) {
        batch.update(doc(db, 'paymentRequests', token), {
          status: 'Menunggu Verifikasi',
          proofImageDataUrl: adminProofImage,
          payerName: cleanPayer,
          paymentMethod: adminProofMethod,
          proofNote: cleanNote,
          submittedAt,
          rejectionReason: '',
          updatedAt: serverTimestamp(),
        });
      }
      await batch
        .commit()
        .catch((err) =>
          handleFirestoreError(err, OperationType.WRITE, `invoices/${proofModalInv.id}`)
        );
    } catch (err) {
      setProofActionError(err instanceof Error ? err.message : 'Gagal menyimpan bukti bayar.');
    } finally {
      setAdminProofSaving(false);
    }
  };

  const handleCopyParentPaymentLink = async (inv: ClubInvoice) => {
    setListError(null);
    try {
      const token = await ensurePaymentRequestForInvoice(inv);
      const url = buildPaymentPortalUrl(token);
      if (url && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopiedPortalInvId(inv.id);
        setTimeout(() => setCopiedPortalInvId((prev) => (prev === inv.id ? null : prev)), 2500);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Gagal membuat tautan bayar orang tua.');
    }
  };

  const handleMarkOverdue = async (inv: ClubInvoice) => {
    setListError(null);
    try {
      await updateDoc(doc(db, 'invoices', inv.id), {
        status: 'Jatuh Tempo',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `invoices/${inv.id}`);
      } catch (handled) {
        setListError(handled instanceof Error ? handled.message : 'Gagal mengubah status invoice.');
      }
    }
  };

  const handleDeleteInvoice = async (inv: ClubInvoice) => {
    setListError(null);
    try {
      await deleteDoc(doc(db, 'invoices', inv.id));
      const { req, token } = getProofSummary(inv);
      if (token && (req || paymentReqMaps.byId.has(token))) {
        await deleteDoc(doc(db, 'paymentRequests', token)).catch(() => {});
      }
      setConfirmDeleteInvId(null);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `invoices/${inv.id}`);
      } catch (handled) {
        setListError(handled instanceof Error ? handled.message : 'Gagal menghapus invoice.');
      }
    }
  };

  const openSingleInvoiceWhatsApp = async (inv: ClubInvoice) => {
    const linkedAthlete = athletes.find((a) => a.id === inv.athleteId);
    const parentName = inv.parentName || linkedAthlete?.parentName || '';
    const parentPhone = inv.parentPhone || linkedAthlete?.parentPhone || '';
    let paymentPortalUrl = '';
    try {
      const token = await ensurePaymentRequestForInvoice(inv);
      paymentPortalUrl = buildPaymentPortalUrl(token);
    } catch {
      // Proceed even if portal generation fails
    }

    setWaModalData({
      title: `Kirim Tagihan ${inv.invoiceNumber}`,
      description: `Kirim detail tagihan, QRIS, dan tautan unggah bukti bayar ${inv.athleteName} ke WhatsApp orang tua.`,
      recipients: [
        {
          id: inv.id,
          athleteName: inv.athleteName,
          parentName,
          parentPhone,
          subtitle: `${inv.invoiceNumber} · ${formatRupiah(inv.amount)}`,
          message: buildInvoiceNotificationMessage(club, {
            invoiceNumber: inv.invoiceNumber,
            athleteName: inv.athleteName,
            parentName,
            description: inv.description,
            periodMonth: inv.periodMonth,
            amount: inv.amount,
            dueDate: inv.dueDate,
            status: inv.status,
            paymentPortalUrl,
          }),
        },
      ],
    });
  };

  const handleCopyWhatsAppReminder = async (inv: ClubInvoice) => {
    const linkedAthlete = athletes.find((a) => a.id === inv.athleteId);
    let paymentPortalUrl = '';
    try {
      const token = await ensurePaymentRequestForInvoice(inv);
      paymentPortalUrl = buildPaymentPortalUrl(token);
    } catch {
      // Ignore
    }
    const msg = buildInvoiceNotificationMessage(club, {
      invoiceNumber: inv.invoiceNumber,
      athleteName: inv.athleteName,
      parentName: inv.parentName || linkedAthlete?.parentName || '',
      description: inv.description,
      periodMonth: inv.periodMonth,
      amount: inv.amount,
      dueDate: inv.dueDate,
      status: inv.status,
      paymentPortalUrl,
    });

    await navigator.clipboard.writeText(msg);
    setCopiedWa(true);
    setTimeout(() => setCopiedWa(false), 2000);
  };

  const handleExportInvoicesCSV = () => {
    downloadCSV(
      `daftar-invoice-${club.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
      ['No Invoice', 'Atlet', 'Wali', 'Periode', 'Kategori', 'Deskripsi', 'Nominal', 'Jatuh Tempo', 'Status', 'Tgl Lunas'],
      filteredInvoices.map((i) => [
        i.invoiceNumber,
        i.athleteName,
        i.parentName || '-',
        i.periodMonth,
        i.category,
        i.description,
        i.amount,
        i.dueDate,
        i.status,
        i.paidDate || '-',
      ])
    );
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnnError(null);

    const errors: FieldErrors<'title' | 'type' | 'date' | 'target' | 'author' | 'content'> = {};
    const cleanTitle = clampString(annTitle, LIMITS.announcement.titleMax);
    const cleanContent = clampString(annContent, LIMITS.announcement.contentMax);
    const cleanAuthor = clampString(annAuthor, LIMITS.announcement.authorNameMax);
    const cleanTarget = clampString(annTarget, LIMITS.announcement.targetGroupMax);

    if (cleanTitle.length < LIMITS.announcement.titleMin) {
      errors.title = `Judul dokumen minimal ${LIMITS.announcement.titleMin} karakter.`;
    }
    if (!ANNOUNCEMENT_TYPES.includes(annType)) {
      errors.type = 'Jenis dokumen tidak valid.';
    }
    if (annDate.trim() && !isValidBlueprintDate(annDate.trim())) {
      errors.date = 'Format tanggal acara tidak valid.';
    }
    if (annTarget.trim().length > LIMITS.announcement.targetGroupMax) {
      errors.target = `Sasaran kelompok maksimal ${LIMITS.announcement.targetGroupMax} karakter.`;
    }
    if (cleanAuthor.length < LIMITS.announcement.authorNameMin) {
      errors.author = `Nama penandatangan minimal ${LIMITS.announcement.authorNameMin} karakter.`;
    }
    if (cleanContent.length < LIMITS.announcement.contentMin) {
      errors.content = `Isi surat/pengumuman minimal ${LIMITS.announcement.contentMin} karakter.`;
    }

    if (Object.keys(errors).length > 0) {
      setAnnFieldErrors(errors);
      setAnnError(Object.values(errors)[0] || 'Periksa kembali isi dokumen.');
      return;
    }

    setAnnFieldErrors({});
    setSavingAnn(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        clubId: club.id,
        ownerId: userId,
        title: cleanTitle,
        docType: annType,
        eventDate: annDate.trim() || '',
        targetGroup: cleanTarget,
        authorName: cleanAuthor,
        content: cleanContent,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, 'announcements'));
      setAnnModalOpen(false);
      setAnnTitle('');
      setAnnContent('');
    } catch (err) {
      setAnnError(err instanceof Error ? err.message : 'Gagal menyimpan surat/pengumuman.');
    } finally {
      setSavingAnn(false);
    }
  };

  const handleDeleteAnnouncement = async (ann: ClubAnnouncement) => {
    setListError(null);
    try {
      await deleteDoc(doc(db, 'announcements', ann.id));
      setConfirmDeleteAnnId(null);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `announcements/${ann.id}`);
      } catch (handled) {
        setListError(handled instanceof Error ? handled.message : 'Gagal menghapus dokumen.');
      }
    }
  };

  const persistQrisToClub = async (payload: string, merchantName: string, successMessage: string) => {
    const cleanPayload = clampString(payload, LIMITS.club.qrisPayloadMax);
    const cleanMerchant = clampString(merchantName, LIMITS.club.qrisMerchantNameMax);

    await updateDoc(doc(db, 'clubs', club.id), {
      qrisPayload: cleanPayload,
      qrisMerchantName: cleanMerchant,
      updatedAt: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `clubs/${club.id}`));

    setSQrisPayload(cleanPayload);
    setSQrisMerchantName(cleanMerchant);
    setSettingsFieldErrors((p) => ({ ...p, qrisPayload: undefined }));
    setQrisUploadMsg(successMessage);
    setTimeout(() => setQrisUploadMsg(null), 4500);
  };

  const handleQrisFileSelected = async (file: File | null | undefined) => {
    if (!file) return;
    setQrisUploadMsg(null);
    setSettingsFieldErrors((p) => ({ ...p, qrisPayload: undefined }));
    setQrisUploading(true);
    try {
      const decoded = await decodeQrisFromImageFile(file);
      if (decoded.qrString.length > LIMITS.club.qrisPayloadMax) {
        throw new Error(`Data QRIS melebihi batas ${LIMITS.club.qrisPayloadMax} karakter.`);
      }
      const nextMerchant = clampString(
        decoded.merchantName || sQrisMerchantName || sName || club.name,
        LIMITS.club.qrisMerchantNameMax
      );
      await persistQrisToClub(
        decoded.qrString,
        nextMerchant,
        `Gambar QRIS berhasil dibaca dan disimpan (${nextMerchant}).`
      );
    } catch (err) {
      setSettingsFieldErrors((p) => ({
        ...p,
        qrisPayload: err instanceof Error ? err.message : 'Gagal membaca gambar QRIS.',
      }));
    } finally {
      setQrisUploading(false);
      if (qrisFileInputRef.current) {
        qrisFileInputRef.current.value = '';
      }
    }
  };

  const handleUseSampleQris = async () => {
    setQrisUploadMsg(null);
    setSettingsFieldErrors((p) => ({ ...p, qrisPayload: undefined }));
    setQrisUploading(true);
    try {
      const sample = buildSampleQrisPayload(sName || club.name, sCity || club.city);
      const nextMerchant = clampString(
        sQrisMerchantName.trim() || sName || club.name,
        LIMITS.club.qrisMerchantNameMax
      );
      await persistQrisToClub(
        sample,
        nextMerchant,
        'QRIS contoh uji coba aktif dan siap digunakan di invoice.'
      );
    } catch (err) {
      setSettingsFieldErrors((p) => ({
        ...p,
        qrisPayload: err instanceof Error ? err.message : 'Gagal mengaktifkan contoh QRIS.',
      }));
    } finally {
      setQrisUploading(false);
    }
  };

  const handleRemoveQris = async () => {
    setQrisUploadMsg(null);
    setSettingsFieldErrors((p) => ({ ...p, qrisPayload: undefined }));
    setQrisUploading(true);
    try {
      await persistQrisToClub('', '', 'QRIS klub telah dihapus.');
    } catch (err) {
      setSettingsFieldErrors((p) => ({
        ...p,
        qrisPayload: err instanceof Error ? err.message : 'Gagal menghapus QRIS.',
      }));
    } finally {
      setQrisUploading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSaved(false);

    const errors: FieldErrors<
      | 'name'
      | 'city'
      | 'address'
      | 'coach'
      | 'fee'
      | 'phone'
      | 'email'
      | 'bankName'
      | 'bankNo'
      | 'bankHolder'
      | 'qrisPayload'
      | 'qrisMerchantName'
    > = {};

    const cleanName = clampString(sName, LIMITS.club.nameMax);
    const cleanCity = clampString(sCity, LIMITS.club.cityMax);
    const cleanAddress = clampString(sAddress, LIMITS.club.addressMax);
    const cleanCoach = clampString(sCoach, LIMITS.club.headCoachMax);
    const cleanPhone = clampString(sPhone, LIMITS.club.phoneMax);
    const cleanEmail = clampString(sEmail, LIMITS.club.emailMax);
    const cleanBankName = clampString(sBankName, LIMITS.club.bankNameMax);
    const cleanBankNo = clampString(sBankNo, LIMITS.club.bankAccountNumberMax);
    const cleanBankHolder = clampString(sBankHolder, LIMITS.club.bankAccountHolderMax);
    const rawQrisPayload = sQrisPayload.trim();
    const cleanQrisPayload = clampString(rawQrisPayload, LIMITS.club.qrisPayloadMax);
    const cleanQrisMerchantName = clampString(sQrisMerchantName, LIMITS.club.qrisMerchantNameMax);
    const parsedFee = Number(sFee);

    if (cleanName.length < LIMITS.club.nameMin) {
      errors.name = `Nama klub minimal ${LIMITS.club.nameMin} karakter.`;
    }
    if (cleanCity.length < LIMITS.club.cityMin) {
      errors.city = `Kota klub minimal ${LIMITS.club.cityMin} karakter.`;
    }
    if (sAddress.trim().length > LIMITS.club.addressMax) {
      errors.address = `Alamat maksimal ${LIMITS.club.addressMax} karakter.`;
    }
    if (cleanCoach.length < LIMITS.club.headCoachMin) {
      errors.coach = `Nama kepala pelatih minimal ${LIMITS.club.headCoachMin} karakter.`;
    }
    if (
      sFee.trim() === '' ||
      !Number.isFinite(parsedFee) ||
      !Number.isInteger(parsedFee) ||
      parsedFee < 0 ||
      parsedFee > 50000000
    ) {
      errors.fee = 'Iuran SPP default harus bilangan bulat antara Rp 0 hingga Rp 50.000.000.';
    }
    if (cleanPhone && !isValidPhoneFormat(cleanPhone)) {
      errors.phone = 'Format nomor telepon/WhatsApp tidak valid (8–16 digit angka).';
    }
    if (cleanEmail && !isValidEmailFormat(cleanEmail)) {
      errors.email = 'Format alamat email klub tidak valid.';
    }
    if (cleanBankNo && !isValidBankAccountFormat(cleanBankNo)) {
      errors.bankNo = 'Nomor rekening hanya boleh berisi angka, spasi, atau tanda hubung (5–30 digit).';
    }

    const anyBankFilled = Boolean(cleanBankName || cleanBankNo || cleanBankHolder);
    if (anyBankFilled) {
      if (cleanBankName.length < 2) {
        errors.bankName = 'Nama bank wajib diisi minimal 2 karakter jika rekening dicantumkan.';
      }
      if (!cleanBankNo) {
        errors.bankNo = 'Nomor rekening wajib diisi jika informasi bank dicantumkan.';
      }
      if (cleanBankHolder.length < 2) {
        errors.bankHolder = 'Nama pemilik rekening wajib diisi jika rekening dicantumkan.';
      }
    }

    if (rawQrisPayload.length > LIMITS.club.qrisPayloadMax) {
      errors.qrisPayload = `String QRIS maksimal ${LIMITS.club.qrisPayloadMax} karakter.`;
    } else if (rawQrisPayload && !isValidQrisString(rawQrisPayload)) {
      errors.qrisPayload =
        'Format string QRIS EMVCo tidak valid (harus diawali 000201 dan berisi data merchant Indonesia).';
    }

    if (sQrisMerchantName.trim().length > LIMITS.club.qrisMerchantNameMax) {
      errors.qrisMerchantName = `Nama merchant QRIS maksimal ${LIMITS.club.qrisMerchantNameMax} karakter.`;
    }

    if (Object.keys(errors).length > 0) {
      setSettingsFieldErrors(errors);
      setSettingsError(Object.values(errors)[0] || 'Periksa kembali pengaturan profil klub.');
      return;
    }

    setSettingsFieldErrors({});
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'clubs', club.id), {
        name: cleanName,
        city: cleanCity,
        address: cleanAddress,
        headCoach: cleanCoach,
        phone: cleanPhone,
        email: cleanEmail,
        bankName: cleanBankName,
        bankAccountNumber: cleanBankNo,
        bankAccountHolder: cleanBankHolder,
        defaultMonthlyFee: Math.round(parsedFee),
        qrisPayload: cleanQrisPayload,
        qrisMerchantName: cleanQrisMerchantName,
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `clubs/${club.id}`));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Gagal menyimpan profil klub.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportInvoicesExcel = () => {
    downloadExcelWorkbook(
      `rekap-invoice-${club.name.toLowerCase().replace(/\s+/g, '-')}.xls`,
      [buildInvoicesSheet(filteredInvoices)]
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 no-print">
        <div>
          <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900">
            Invoice & Administrasi Klub
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Kelola tagihan SPP bulanan, kwitansi cetak resmi, surat tugas lomba, dan profil rekening klub.
          </p>
        </div>

        {activeTab === 'invoices' && (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openCreateInvoice}
              disabled={athletes.length === 0}
              className="col-span-2 sm:col-span-1 sm:order-4 inline-flex items-center justify-center gap-2 px-4 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Buat Invoice
            </button>
            <button
              type="button"
              onClick={() => {
                setBatchError(null);
                setBatchFieldErrors({});
                setBatchOpen(true);
              }}
              disabled={athletes.filter((a) => a.status === 'Aktif').length === 0}
              className="sm:order-3 inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Layers className="w-3.5 h-3.5 text-sky-700" />
              SPP Massal
            </button>
            <button
              type="button"
              onClick={onOpenPrintReport}
              className="sm:order-2 inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-sky-700" />
              Cetak Rekap
            </button>
            <ExportActionMenu
              className="col-span-2 sm:col-span-1 sm:order-1"
              label="Ekspor"
              disabled={filteredInvoices.length === 0}
              options={[
                {
                  id: 'inv-excel',
                  label: 'Ekspor Excel (.xls)',
                  description: `${filteredInvoices.length} tagihan siap olah`,
                  format: 'excel',
                  onSelect: handleExportInvoicesExcel,
                },
                {
                  id: 'inv-csv',
                  label: 'Ekspor CSV (.csv)',
                  description: 'Format tabel standar untuk spreadsheet',
                  format: 'csv',
                  onSelect: handleExportInvoicesCSV,
                },
              ]}
            />
          </div>
        )}

        {activeTab === 'letters' && (
          <button
            type="button"
            onClick={() => {
              setAnnError(null);
              setAnnFieldErrors({});
              setAnnAuthor(club.headCoach);
              setAnnModalOpen(true);
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 whitespace-nowrap cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Buat Surat / Pengumuman
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-full sm:w-fit overflow-x-auto no-scrollbar no-print">
        <button
          type="button"
          onClick={() => {
            setActiveTab('invoices');
            setListError(null);
            setConfirmDeleteInvId(null);
            setConfirmDeleteAnnId(null);
          }}
          className={`px-3.5 sm:px-4 min-h-[44px] sm:min-h-[36px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'invoices'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Invoice ({invoices.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('letters');
            setListError(null);
            setConfirmDeleteInvId(null);
            setConfirmDeleteAnnId(null);
          }}
          className={`px-3.5 sm:px-4 min-h-[44px] sm:min-h-[36px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'letters'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Surat & Info ({announcements.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('settings');
            setListError(null);
            setSettingsError(null);
            setSettingsFieldErrors({});
          }}
          className={`px-3.5 sm:px-4 min-h-[44px] sm:min-h-[36px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Profil & Rekening
        </button>
      </div>

      {listError && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{listError}</span>
          </div>
          <button
            type="button"
            onClick={() => setListError(null)}
            className="text-red-700 hover:text-red-900 font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="space-y-5 no-print">
          {/* Summary KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 min-w-0">
              <span className="text-[11px] sm:text-xs text-slate-500 block truncate">Total Lunas</span>
              <div className="font-mono-tabular text-base sm:text-2xl font-bold text-emerald-700 mt-1 truncate">
                {formatRupiah(invoiceTotals.paid)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 min-w-0">
              <span className="text-[11px] sm:text-xs text-slate-500 block truncate">Menunggu Bayar</span>
              <div className="font-mono-tabular text-base sm:text-2xl font-bold text-amber-700 mt-1 truncate">
                {formatRupiah(invoiceTotals.pending)}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 min-w-0">
              <span className="text-[11px] sm:text-xs text-slate-500 block truncate">Jatuh Tempo</span>
              <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-red-700 mt-1 truncate">
                {formatRupiah(invoiceTotals.overdue)}
              </div>
            </div>
          </div>

          {/* Automatic Payment Proof Verification Queue Banner */}
          {pendingVerificationInvoices.length > 0 && (
            <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-display text-sm font-bold text-amber-950">
                      Deteksi Otomatis: {pendingVerificationInvoices.length} Bukti Bayar Menunggu Konfirmasi
                    </h2>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Orang tua telah mengunggah bukti transfer. Periksa gambar struk atau klik Konfirmasi Lunas 1-klik untuk memperbarui status & kas otomatis.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Menunggu Verifikasi')}
                  className="px-3 min-h-[36px] text-xs font-semibold text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg cursor-pointer shrink-0"
                >
                  Filter Antrean ({pendingVerificationInvoices.length})
                </button>
              </div>

              <div className="divide-y divide-amber-200/70 bg-white border border-amber-200 rounded-lg overflow-hidden">
                {pendingVerificationInvoices.map((inv) => {
                  const info = getProofSummary(inv);
                  const busy = quickConfirmingId === inv.id;
                  return (
                    <div
                      key={inv.id}
                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {info.proofImage ? (
                          <button
                            type="button"
                            onClick={() => handleOpenProofModal(inv)}
                            className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shrink-0 cursor-pointer"
                            title="Klik untuk memperbesar bukti bayar"
                          >
                            <img
                              src={info.proofImage}
                              alt={`Bukti ${inv.athleteName}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-center shrink-0 text-amber-700">
                            <ImagePlus className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {inv.athleteName}{' '}
                            <span className="font-mono-tabular text-xs font-normal text-slate-500">
                              ({inv.invoiceNumber})
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 truncate">
                            <span className="font-mono-tabular font-semibold text-slate-900">
                              {formatRupiah(inv.amount)}
                            </span>
                            {info.payerName ? ` · Pengirim: ${info.payerName}` : ''}
                            {info.method ? ` · ${info.method}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenProofModal(inv)}
                          className="inline-flex items-center gap-1.5 px-3 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Periksa Bukti
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleQuickConfirmProof(inv)}
                          className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[36px] text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                          Konfirmasi Lunas
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="Cari nomor invoice, nama atlet, periode..."
                className="w-full pl-9 pr-3 min-h-[44px] sm:min-h-[36px] text-sm sm:text-xs border border-slate-200 rounded-lg"
              />
            </div>

            <div className="w-full sm:w-56">
              <BottomSheetSelect
                value={statusFilter}
                onChange={(val) => setStatusFilter(val as 'all' | typeof INVOICE_STATUSES[number])}
                title="Filter Status Invoice"
                subtitle="Saring daftar tagihan berdasarkan status pelunasan."
                triggerPrefix="Status:"
                icon={<Filter className="w-3.5 h-3.5" />}
                resetValue="all"
                resetLabel="Semua"
                options={[
                  { value: 'all', label: 'Semua Status', badge: `${invoices.length}` },
                  ...INVOICE_STATUSES.map((st) => ({
                    value: st,
                    label: st,
                    badge: `${invoices.filter((i) => getProofSummary(i).effectiveStatus === st).length}`,
                  })),
                ]}
              />
            </div>
          </div>

          {/* Invoice Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredInvoices.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-sm font-medium text-slate-900">Belum ada invoice tagihan</p>
                <p className="text-xs text-slate-500">
                  Buat tagihan individual atau gunakan Buat SPP Massal untuk menerbitkan tagihan bulanan bagi seluruh atlet aktif.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Invoice Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredInvoices.map((inv) => {
                    const proof = getProofSummary(inv);
                    const isQuickBusy = quickConfirmingId === inv.id;
                    return (
                      <div
                        key={inv.id}
                        className={`p-4 space-y-2.5 ${
                          proof.hasPendingProof ? 'bg-amber-50/35' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-mono-tabular text-xs font-semibold text-slate-600">
                              {inv.invoiceNumber}
                            </div>
                            <div className="font-semibold text-sm text-slate-900 mt-0.5">
                              {inv.athleteName}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {inv.description} · {inv.category}
                            </div>
                            {proof.hasPendingProof && (
                              <div className="text-[11px] font-medium text-amber-800 mt-1">
                                Bukti masuk{proof.payerName ? ` dari ${proof.payerName}` : ''} ({proof.method})
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono-tabular text-sm font-bold text-slate-900">
                              {formatRupiah(inv.amount)}
                            </div>
                            <div
                              className={`text-xs font-medium mt-0.5 ${
                                proof.effectiveStatus === 'Lunas'
                                  ? 'text-emerald-700'
                                  : proof.effectiveStatus === 'Menunggu Verifikasi'
                                  ? 'text-sky-700'
                                  : proof.effectiveStatus === 'Jatuh Tempo'
                                  ? 'text-red-600'
                                  : proof.effectiveStatus === 'Dibatalkan'
                                  ? 'text-slate-400'
                                  : 'text-amber-700'
                              }`}
                            >
                              {proof.effectiveStatus}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="font-mono-tabular text-xs text-slate-500">
                            Tempo {formatDateID(inv.dueDate)}
                          </span>
                          <div className="inline-flex flex-wrap items-center gap-1.5">
                            {proof.hasPendingProof && (
                              <>
                                <button
                                  type="button"
                                  disabled={isQuickBusy}
                                  onClick={() => handleQuickConfirmProof(inv)}
                                  className="inline-flex items-center gap-1 px-3 min-h-[40px] text-xs font-semibold text-white bg-emerald-700 rounded-lg cursor-pointer disabled:opacity-60"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  {isQuickBusy ? 'Memproses...' : 'Konfirmasi Lunas'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenProofModal(inv)}
                                  className="inline-flex items-center gap-1 px-3 min-h-[40px] text-xs font-medium text-sky-800 bg-sky-100 rounded-lg cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Periksa Bukti
                                </button>
                              </>
                            )}
                            {!proof.hasPendingProof &&
                              (inv.status === 'Belum Lunas' || inv.status === 'Jatuh Tempo') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayModalInv(inv);
                                      setPayDate(todayISO());
                                      setPayMethod('Transfer Bank');
                                      setPayNotes('');
                                      setPayError(null);
                                      setPayFieldErrors({});
                                    }}
                                    className="px-3 min-h-[40px] text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg cursor-pointer"
                                  >
                                    Tandai Lunas
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenProofModal(inv)}
                                    className="inline-flex items-center gap-1 px-3 min-h-[40px] text-xs font-medium text-amber-800 bg-amber-50 rounded-lg cursor-pointer"
                                  >
                                    <Upload className="w-3.5 h-3.5" />
                                    Unggah Bukti
                                  </button>
                                </>
                              )}
                            {inv.status !== 'Dibatalkan' && inv.status !== 'Lunas' && (
                              <button
                                type="button"
                                onClick={() => handleCopyParentPaymentLink(inv)}
                                className="inline-flex items-center gap-1 px-3 min-h-[40px] text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                              >
                                {copiedPortalInvId === inv.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    Link Tersalin
                                  </>
                                ) : (
                                  <>
                                    <Link2 className="w-3.5 h-3.5" />
                                    Link Bayar
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openSingleInvoiceWhatsApp(inv)}
                              className="inline-flex items-center gap-1 px-3 min-h-[40px] text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              Kirim WA
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCopiedWa(false);
                                setPreviewInvId(inv.id);
                              }}
                              className="inline-flex items-center gap-1 px-3 min-h-[40px] text-xs font-medium text-sky-700 bg-sky-50 rounded-lg cursor-pointer"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              QR / Cetak
                            </button>
                            {confirmDeleteInvId === inv.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteInvoice(inv)}
                                  className="px-2.5 min-h-[40px] text-xs font-semibold text-white bg-red-600 rounded-lg cursor-pointer"
                                >
                                  Konfirmasi
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteInvId(null)}
                                  className="px-2.5 min-h-[40px] text-xs font-medium text-slate-600 bg-slate-100 rounded-lg cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteInvId(inv.id)}
                                className="px-3 min-h-[40px] text-xs font-medium text-red-700 bg-red-50 rounded-lg cursor-pointer"
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Invoice Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                        <th className="py-3 px-4">No. Invoice</th>
                        <th className="py-3 px-4">Atlet & Keterangan</th>
                        <th className="py-3 px-4">Jatuh Tempo</th>
                        <th className="py-3 px-4 text-right">Nominal</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredInvoices.map((inv) => {
                        const proof = getProofSummary(inv);
                        const isQuickBusy = quickConfirmingId === inv.id;
                        return (
                          <tr
                            key={inv.id}
                            className={
                              proof.hasPendingProof ? 'bg-amber-50/35 hover:bg-amber-50/60' : 'hover:bg-slate-50/80'
                            }
                          >
                            <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-slate-800 whitespace-nowrap">
                              {inv.invoiceNumber}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900">{inv.athleteName}</div>
                              <div className="text-xs text-slate-500">
                                {inv.description} · {inv.category}
                              </div>
                              {proof.hasPendingProof && (
                                <div className="text-[11px] font-medium text-amber-800 mt-0.5">
                                  Bukti masuk{proof.payerName ? `: ${proof.payerName}` : ''} ({proof.method})
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                              {formatDateID(inv.dueDate)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                              {formatRupiah(inv.amount)}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                              <span
                                className={
                                  proof.effectiveStatus === 'Lunas'
                                    ? 'text-emerald-700'
                                    : proof.effectiveStatus === 'Menunggu Verifikasi'
                                    ? 'text-sky-700 font-semibold'
                                    : proof.effectiveStatus === 'Jatuh Tempo'
                                    ? 'text-red-600'
                                    : proof.effectiveStatus === 'Dibatalkan'
                                    ? 'text-slate-400'
                                    : 'text-amber-700'
                                }
                              >
                                {proof.effectiveStatus}
                              </span>
                              {inv.paidDate && (
                                <div className="font-mono-tabular text-[11px] text-slate-400">
                                  Lunas {formatDateID(inv.paidDate)}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {proof.hasPendingProof && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isQuickBusy}
                                      onClick={() => handleQuickConfirmProof(inv)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded cursor-pointer"
                                      title="Konfirmasi Cepat Lunas & Catat ke Kas"
                                    >
                                      <ShieldCheck className="w-3.5 h-3.5" />
                                      {isQuickBusy ? '...' : 'Konfirmasi Lunas'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenProofModal(inv)}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-sky-800 bg-sky-50 hover:bg-sky-100 rounded cursor-pointer"
                                      title="Periksa Foto Bukti Bayar"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Bukti
                                    </button>
                                  </>
                                )}
                                {!proof.hasPendingProof &&
                                  (inv.status === 'Belum Lunas' || inv.status === 'Jatuh Tempo') && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPayModalInv(inv);
                                          setPayDate(todayISO());
                                          setPayMethod('Transfer Bank');
                                          setPayNotes('');
                                          setPayError(null);
                                          setPayFieldErrors({});
                                        }}
                                        className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded cursor-pointer"
                                      >
                                        Tandai Lunas
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenProofModal(inv)}
                                        className="p-1.5 text-amber-700 hover:bg-amber-50 rounded cursor-pointer"
                                        title="Unggah bukti bayar dari orang tua"
                                      >
                                        <Upload className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                {inv.status === 'Lunas' && proof.proofImage && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenProofModal(inv)}
                                    className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded cursor-pointer"
                                    title="Lihat bukti pembayaran"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                                {inv.status === 'Belum Lunas' && !proof.hasPendingProof && (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkOverdue(inv)}
                                    className="px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded cursor-pointer"
                                    title="Tandai Jatuh Tempo"
                                  >
                                    Jatuh Tempo
                                  </button>
                                )}
                                {inv.status !== 'Dibatalkan' && inv.status !== 'Lunas' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyParentPaymentLink(inv)}
                                    className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded cursor-pointer"
                                    title="Salin tautan bayar & upload bukti untuk orang tua"
                                  >
                                    {copiedPortalInvId === inv.id ? (
                                      <Check className="w-4 h-4 text-emerald-600" />
                                    ) : (
                                      <Link2 className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openSingleInvoiceWhatsApp(inv)}
                                  className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                                  title="Kirim notifikasi WhatsApp orang tua"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCopiedWa(false);
                                    setPreviewInvId(inv.id);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-sky-700 rounded hover:bg-sky-50 cursor-pointer"
                                  title="Lihat QRIS & Cetak Invoice"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                                {confirmDeleteInvId === inv.id ? (
                                  <span className="inline-flex items-center gap-1 ml-1">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteInvoice(inv)}
                                      className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded hover:bg-red-700 cursor-pointer"
                                    >
                                      Hapus
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteInvId(null)}
                                      className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                                    >
                                      Batal
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteInvId(inv.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                                    title="Hapus invoice"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'letters' && (
        <div className="space-y-4 no-print">
          {announcements.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
              <FileText className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-medium text-slate-900">
                Belum ada surat tugas atau pengumuman klub
              </p>
              <p className="text-xs text-slate-500">
                Buat surat tugas kejuaraan resmi, undangan rapat wali atlet, atau pengumuman peraturan kolam.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-sky-700">{ann.docType}</span>
                      {ann.eventDate && (
                        <span className="font-mono-tabular">{formatDateID(ann.eventDate)}</span>
                      )}
                    </div>
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {ann.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line line-clamp-4">
                      {ann.content}
                    </p>
                    <div className="text-xs text-slate-400 pt-1">
                      Sasaran: {ann.targetGroup || 'Semua Kelompok'} · Oleh {ann.authorName}
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewAnnId(ann.id)}
                      className="inline-flex items-center gap-1.5 min-h-[36px] text-xs font-medium text-sky-700 hover:text-sky-800 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Buka & Cetak Surat
                    </button>
                    {confirmDeleteAnnId === ann.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(ann)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 cursor-pointer"
                        >
                          Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAnnId(null)}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAnnId(ann.id)}
                        className="p-2 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                        title="Hapus dokumen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          noValidate
          className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 max-w-2xl space-y-5 no-print"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <Building2 className="w-5 h-5 text-sky-700" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Identitas Klub & Rekening Pembayaran
              </h2>
              <p className="text-xs text-slate-500">
                Informasi ini otomatis muncul pada kop surat tugas lomba dan dokumen invoice cetak.
              </p>
            </div>
          </div>

          {settingsError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{settingsError}</span>
            </div>
          )}
          {settingsSaved && (
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Pengaturan profil klub berhasil diperbarui.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Klub <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                maxLength={LIMITS.club.nameMax}
                value={sName}
                onChange={(e) => {
                  setSName(e.target.value);
                  setSettingsFieldErrors((p) => ({ ...p, name: undefined }));
                }}
                className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                  settingsFieldErrors.name ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                }`}
              />
              {settingsFieldErrors.name && (
                <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kota <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                maxLength={LIMITS.club.cityMax}
                value={sCity}
                onChange={(e) => {
                  setSCity(e.target.value);
                  setSettingsFieldErrors((p) => ({ ...p, city: undefined }));
                }}
                className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                  settingsFieldErrors.city ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                }`}
              />
              {settingsFieldErrors.city && (
                <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.city}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Alamat Sekretariat / Kolam Homebase
            </label>
            <input
              type="text"
              maxLength={LIMITS.club.addressMax}
              value={sAddress}
              onChange={(e) => {
                setSAddress(e.target.value);
                setSettingsFieldErrors((p) => ({ ...p, address: undefined }));
              }}
              className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                settingsFieldErrors.address ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
              }`}
            />
            {settingsFieldErrors.address && (
              <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.address}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kepala Pelatih <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                maxLength={LIMITS.club.headCoachMax}
                value={sCoach}
                onChange={(e) => {
                  setSCoach(e.target.value);
                  setSettingsFieldErrors((p) => ({ ...p, coach: undefined }));
                }}
                className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                  settingsFieldErrors.coach ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                }`}
              />
              {settingsFieldErrors.coach && (
                <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.coach}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Iuran SPP Default (Rp) <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                min={0}
                max={50000000}
                step={1000}
                value={sFee}
                onChange={(e) => {
                  setSFee(e.target.value);
                  setSettingsFieldErrors((p) => ({ ...p, fee: undefined }));
                }}
                className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                  settingsFieldErrors.fee ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                }`}
              />
              {settingsFieldErrors.fee && (
                <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.fee}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Telepon / WhatsApp Admin
              </label>
              <input
                type="tel"
                maxLength={LIMITS.club.phoneMax}
                value={sPhone}
                onChange={(e) => {
                  setSPhone(e.target.value);
                  setSettingsFieldErrors((p) => ({ ...p, phone: undefined }));
                }}
                placeholder="0812-3456-7890"
                className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                  settingsFieldErrors.phone ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                }`}
              />
              {settingsFieldErrors.phone && (
                <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.phone}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Klub</label>
              <input
                type="email"
                maxLength={LIMITS.club.emailMax}
                value={sEmail}
                onChange={(e) => {
                  setSEmail(e.target.value);
                  setSettingsFieldErrors((p) => ({ ...p, email: undefined }));
                }}
                placeholder="admin@klubrenang.id"
                className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                  settingsFieldErrors.email ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                }`}
              />
              {settingsFieldErrors.email && (
                <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.email}</p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-800">
                Informasi Rekening Transfer Resmi
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Jika mencantumkan rekening, lengkapi Nama Bank, Nomor Rekening, dan Atas Nama.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Bank</label>
                <input
                  type="text"
                  maxLength={LIMITS.club.bankNameMax}
                  value={sBankName}
                  onChange={(e) => {
                    setSBankName(e.target.value);
                    setSettingsFieldErrors((p) => ({ ...p, bankName: undefined }));
                  }}
                  placeholder="Bank Mandiri"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    settingsFieldErrors.bankName ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {settingsFieldErrors.bankName && (
                  <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.bankName}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nomor Rekening
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.club.bankAccountNumberMax}
                  value={sBankNo}
                  onChange={(e) => {
                    setSBankNo(e.target.value);
                    setSettingsFieldErrors((p) => ({ ...p, bankNo: undefined }));
                  }}
                  placeholder="130-00-1234567-8"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                    settingsFieldErrors.bankNo ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {settingsFieldErrors.bankNo && (
                  <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.bankNo}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Atas Nama</label>
                <input
                  type="text"
                  maxLength={LIMITS.club.bankAccountHolderMax}
                  value={sBankHolder}
                  onChange={(e) => {
                    setSBankHolder(e.target.value);
                    setSettingsFieldErrors((p) => ({ ...p, bankHolder: undefined }));
                  }}
                  placeholder="Yayasan / Klub"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    settingsFieldErrors.bankHolder ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {settingsFieldErrors.bankHolder && (
                  <p className="text-[11px] text-red-600 mt-1">{settingsFieldErrors.bankHolder}</p>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-sky-700" />
                Upload QRIS Pembayaran Klub
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Unggah gambar/screenshot kartu QRIS klub (PNG atau JPG). Sistem membaca data merchant secara otomatis dan menyisipkan nominal tagihan ke setiap invoice.
              </p>
            </div>

            <input
              ref={qrisFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => handleQrisFileSelected(e.target.files?.[0])}
            />

            {qrisUploadMsg && (
              <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{qrisUploadMsg}</span>
              </div>
            )}

            {settingsFieldErrors.qrisPayload && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span>{settingsFieldErrors.qrisPayload}</span>
              </div>
            )}

            {isValidQrisString(sQrisPayload) ? (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-2.5 shrink-0 flex flex-col items-center">
                  {qrisPreviewDataUrl ? (
                    <img
                      src={qrisPreviewDataUrl}
                      alt="Pratinjau QRIS Klub"
                      referrerPolicy="no-referrer"
                      className="w-32 h-32 object-contain block"
                    />
                  ) : (
                    <div className="w-32 h-32 flex items-center justify-center text-slate-400">
                      <QrCode className="w-8 h-8" />
                    </div>
                  )}
                  <span className="mt-1.5 text-[10px] font-semibold text-emerald-700">
                    QRIS AKTIF
                  </span>
                </div>

                <div className="flex-1 min-w-0 w-full space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      QRIS Terverifikasi & Siap Dipakai di Invoice
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {(() => {
                        const info = extractQrisMerchantInfo(sQrisPayload);
                        return `Merchant terdaftar: ${info.merchantName || club.name} · ${info.merchantCity || club.city}`;
                      })()}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nama Merchant di Invoice
                    </label>
                    <input
                      type="text"
                      maxLength={LIMITS.club.qrisMerchantNameMax}
                      value={sQrisMerchantName}
                      onChange={(e) => {
                        setSQrisMerchantName(e.target.value);
                        setSettingsFieldErrors((p) => ({ ...p, qrisMerchantName: undefined }));
                      }}
                      placeholder={club.name}
                      className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm bg-white border rounded-lg ${
                        settingsFieldErrors.qrisMerchantName
                          ? 'border-red-400 bg-red-50/40'
                          : 'border-slate-200'
                      }`}
                    />
                    {settingsFieldErrors.qrisMerchantName && (
                      <p className="text-[11px] text-red-600 mt-1">
                        {settingsFieldErrors.qrisMerchantName}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={qrisUploading}
                      onClick={() => qrisFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg cursor-pointer disabled:opacity-60"
                    >
                      {qrisUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      Ganti Gambar QRIS
                    </button>
                    <button
                      type="button"
                      disabled={qrisUploading}
                      onClick={handleRemoveQris}
                      className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer disabled:opacity-60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus QRIS
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.files?.[0];
                  handleQrisFileSelected(dropped);
                }}
                className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 text-center space-y-3"
              >
                <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 mx-auto flex items-center justify-center text-sky-700">
                  {qrisUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ImagePlus className="w-5 h-5" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-900">
                    {qrisUploading ? 'Membaca gambar QRIS...' : 'Unggah Foto / Screenshot QRIS Klub'}
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Pilih file gambar QRIS dari galeri atau komputer (PNG, JPG, WEBP). Anda tidak perlu menyalin kode atau teks apa pun.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={qrisUploading}
                    onClick={() => qrisFileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Pilih Gambar QRIS
                  </button>
                  <button
                    type="button"
                    disabled={qrisUploading}
                    onClick={handleUseSampleQris}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    Coba Contoh QRIS Uji Coba
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="w-full sm:w-auto px-5 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
            >
              {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan Klub'}
            </button>
          </div>
        </form>
      )}

      {/* Create Single Invoice Modal (Bottom sheet on mobile) */}
      {createInvOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                Buat Invoice Tagihan Baru
              </h2>
              <button
                type="button"
                onClick={() => setCreateInvOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal invoice"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} noValidate className="mt-5 space-y-4">
              {invError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{invError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Atlet <span className="text-red-600">*</span>
                </label>
                <BottomSheetSelect
                  value={invAthleteId}
                  onChange={(val) => handleSelectInvAthlete(val)}
                  title="Pilih Atlet Penerima Invoice"
                  placeholder="Pilih atlet..."
                  searchable={athletes.length > 5}
                  hasError={Boolean(invFieldErrors.athleteId)}
                  options={athletes.map((a) => ({
                    value: a.id,
                    label: a.fullName,
                    badge: a.ageGroup,
                    description: a.parentName ? `Wali: ${a.parentName}` : undefined,
                  }))}
                />
                {invFieldErrors.athleteId && (
                  <p className="text-[11px] text-red-600 mt-1">{invFieldErrors.athleteId}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kategori Tagihan <span className="text-red-600">*</span>
                  </label>
                  <BottomSheetSelect
                    value={invCategory}
                    onChange={(val) => {
                      setInvCategory(val as InvoiceCategory);
                      setInvFieldErrors((p) => ({ ...p, category: undefined }));
                    }}
                    title="Pilih Kategori Tagihan"
                    hasError={Boolean(invFieldErrors.category)}
                    options={INVOICE_CATEGORIES.map((c) => ({ value: c, label: c }))}
                  />
                  {invFieldErrors.category && (
                    <p className="text-[11px] text-red-600 mt-1">{invFieldErrors.category}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Periode / Bulan <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.invoice.periodMonthMax}
                    value={invPeriod}
                    onChange={(e) => {
                      setInvPeriod(e.target.value);
                      setInvFieldErrors((p) => ({ ...p, period: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                      invFieldErrors.period ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {invFieldErrors.period && (
                    <p className="text-[11px] text-red-600 mt-1">{invFieldErrors.period}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Deskripsi Rincian Tagihan <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.invoice.descriptionMax}
                  value={invDesc}
                  onChange={(e) => {
                    setInvDesc(e.target.value);
                    setInvFieldErrors((p) => ({ ...p, desc: undefined }));
                  }}
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    invFieldErrors.desc ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {invFieldErrors.desc && (
                  <p className="text-[11px] text-red-600 mt-1">{invFieldErrors.desc}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nominal (Rp) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500000000}
                    step={1000}
                    value={invAmount}
                    onChange={(e) => {
                      setInvAmount(e.target.value);
                      setInvFieldErrors((p) => ({ ...p, amount: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      invFieldErrors.amount ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {invFieldErrors.amount && (
                    <p className="text-[11px] text-red-600 mt-1">{invFieldErrors.amount}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Batas Jatuh Tempo <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={invDueDate}
                    onChange={(e) => {
                      setInvDueDate(e.target.value);
                      setInvFieldErrors((p) => ({ ...p, dueDate: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      invFieldErrors.dueDate ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {invFieldErrors.dueDate && (
                    <p className="text-[11px] text-red-600 mt-1">{invFieldErrors.dueDate}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Tambahan
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.invoice.notesMax}
                  value={invNotes}
                  onChange={(e) => {
                    setInvNotes(e.target.value);
                    setInvFieldErrors((p) => ({ ...p, notes: undefined }));
                  }}
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    invFieldErrors.notes ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {invFieldErrors.notes && (
                  <p className="text-[11px] text-red-600 mt-1">{invFieldErrors.notes}</p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCreateInvOpen(false)}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingInv}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingInv ? 'Menerbitkan...' : 'Terbitkan Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch SPP Modal (Bottom sheet on mobile) */}
      {batchOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-md max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                Terbitkan Tagihan SPP Massal
              </h2>
              <button
                type="button"
                onClick={() => setBatchOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal SPP massal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBatchGenerateSPP} noValidate className="mt-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Sistem akan otomatis menerbitkan invoice SPP bulanan untuk seluruh atlet berstatus <strong>Aktif</strong> yang memiliki tarif iuran lebih dari Rp 0 dan belum ditagih pada periode ini.
              </p>

              {activeZeroFeeAthletesCount > 0 && (
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Terdapat {activeZeroFeeAthletesCount} atlet aktif dengan tarif SPP Rp 0 (beasiswa/bebas iuran) yang otomatis dilewati.
                  </span>
                </div>
              )}

              {batchError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{batchError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Periode Tagihan (Contoh: Desember 2026) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.invoice.periodMonthMax}
                  value={batchPeriod}
                  onChange={(e) => {
                    setBatchPeriod(e.target.value);
                    setBatchFieldErrors((p) => ({ ...p, period: undefined }));
                  }}
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    batchFieldErrors.period ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {batchFieldErrors.period && (
                  <p className="text-[11px] text-red-600 mt-1">{batchFieldErrors.period}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal Jatuh Tempo <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={batchDueDate}
                  onChange={(e) => {
                    setBatchDueDate(e.target.value);
                    setBatchFieldErrors((p) => ({ ...p, dueDate: undefined }));
                  }}
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                    batchFieldErrors.dueDate ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {batchFieldErrors.dueDate && (
                  <p className="text-[11px] text-red-600 mt-1">{batchFieldErrors.dueDate}</p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setBatchOpen(false)}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingBatch}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingBatch ? 'Memproses...' : 'Generate SPP Massal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle / Pay Invoice Modal (Bottom sheet on mobile) */}
      {payModalInv && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-md max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                Catat Pelunasan Invoice
              </h2>
              <button
                type="button"
                onClick={() => setPayModalInv(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal pelunasan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSettleInvoice} noValidate className="mt-5 space-y-4">
              {payError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{payError}</span>
                </div>
              )}

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-mono-tabular font-semibold text-slate-800">
                  {payModalInv.invoiceNumber}
                </div>
                <div className="text-slate-700">
                  {payModalInv.athleteName} · {payModalInv.description}
                </div>
                <div className="font-mono-tabular text-base font-bold text-slate-900 pt-1">
                  {formatRupiah(payModalInv.amount)}
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Menandai lunas akan otomatis mencatat pemasukan sebesar{' '}
                <strong>{formatRupiah(payModalInv.amount)}</strong> ke Catatan Keuangan Klub.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Bayar <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    max={todayISO()}
                    value={payDate}
                    onChange={(e) => {
                      setPayDate(e.target.value);
                      setPayFieldErrors((p) => ({ ...p, payDate: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      payFieldErrors.payDate ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {payFieldErrors.payDate && (
                    <p className="text-[11px] text-red-600 mt-1">{payFieldErrors.payDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Metode Bayar <span className="text-red-600">*</span>
                  </label>
                  <BottomSheetSelect
                    value={payMethod}
                    onChange={(val) => {
                      setPayMethod(val as PaymentMethod);
                      setPayFieldErrors((p) => ({ ...p, payMethod: undefined }));
                    }}
                    title="Pilih Metode Pembayaran"
                    hasError={Boolean(payFieldErrors.payMethod)}
                    options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                  />
                  {payFieldErrors.payMethod && (
                    <p className="text-[11px] text-red-600 mt-1">{payFieldErrors.payMethod}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Pembayaran
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.invoice.notesMax}
                  value={payNotes}
                  onChange={(e) => {
                    setPayNotes(e.target.value);
                    setPayFieldErrors((p) => ({ ...p, payNotes: undefined }));
                  }}
                  placeholder="Contoh: Diterima via transfer Mandiri"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    payFieldErrors.payNotes ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {payFieldErrors.payNotes && (
                  <p className="text-[11px] text-red-600 mt-1">{payFieldErrors.payNotes}</p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setPayModalInv(null)}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                >
                  {paying ? 'Memproses...' : 'Konfirmasi Lunas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Official Invoice Preview Modal */}
      {previewInv && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-8 pb-safe space-y-5 sm:space-y-6 print-only-container">
            <div className="flex flex-wrap items-center justify-between gap-2 no-print pb-3 sm:pb-4 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-3.5 min-h-[40px] text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak / PDF
                </button>
                <button
                  type="button"
                  onClick={() => openSingleInvoiceWhatsApp(previewInv)}
                  className="inline-flex items-center gap-2 px-3.5 min-h-[40px] text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Kirim ke WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyParentPaymentLink(previewInv)}
                  className="inline-flex items-center gap-2 px-3.5 min-h-[40px] text-xs font-medium text-sky-800 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 cursor-pointer"
                >
                  {copiedPortalInvId === previewInv.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Link Bayar Tersalin
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      Salin Link Bayar
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyWhatsAppReminder(previewInv)}
                  className="inline-flex items-center gap-2 px-3.5 min-h-[40px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  {copiedWa ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Salin WhatsApp
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPreviewInvId('')}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup pratinjau invoice"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Official Printable Invoice Body */}
            <div className="space-y-5 sm:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5 sm:pb-6">
                <div className="flex items-center gap-3.5">
                  <img
                    src="/src/assets/images/swim_club_emblem_1795440060748.jpg"
                    alt={club.name}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                  />
                  <div>
                    <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">{club.name}</h2>
                    <p className="text-xs text-slate-500">
                      {club.address || club.city}
                      {club.phone ? ` · ${club.phone}` : ''}
                    </p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-xs font-semibold text-slate-500">INVOICE RESMI</div>
                  <div className="font-mono-tabular text-sm font-bold text-slate-900 mt-0.5">
                    {previewInv.invoiceNumber}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-xs">
                <div>
                  <span className="text-slate-500 block">Ditagihkan Kepada</span>
                  <div className="font-semibold text-slate-900 text-sm mt-1">
                    {previewInv.athleteName}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Wali: {previewInv.parentName || '-'} ({previewInv.parentPhone || '-'})
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="text-slate-500 block">Status & Jatuh Tempo</span>
                  <div
                    className={`text-sm font-bold mt-1 ${
                      previewInv.status === 'Lunas'
                        ? 'text-emerald-700'
                        : previewInv.status === 'Jatuh Tempo'
                        ? 'text-red-600'
                        : 'text-amber-700'
                    }`}
                  >
                    {previewInv.status}
                  </div>
                  <div className="font-mono-tabular text-slate-600 mt-0.5">
                    Jatuh tempo: {formatDateID(previewInv.dueDate)}
                  </div>
                </div>
              </div>

              <table className="w-full text-left border-collapse border-t border-b border-slate-200">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-3">Rincian Tagihan</th>
                    <th className="py-3">Periode</th>
                    <th className="py-3 text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr>
                    <td className="py-4">
                      <div className="font-medium text-slate-900">{previewInv.description}</div>
                      <div className="text-xs text-slate-500">{previewInv.category}</div>
                    </td>
                    <td className="py-4 text-xs text-slate-700">{previewInv.periodMonth}</td>
                    <td className="py-4 text-right font-mono-tabular font-bold text-slate-900">
                      {formatRupiah(previewInv.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2 text-xs">
                <div className="space-y-1 text-slate-600">
                  <div className="font-semibold text-slate-800">Informasi Pembayaran</div>
                  <div>
                    {club.bankName || 'Transfer Bank'} · No. Rek{' '}
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {club.bankAccountNumber || '-'}
                    </span>
                  </div>
                  <div>a.n. {club.bankAccountHolder || club.name}</div>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Total Tagihan</span>
                  <div className="font-mono-tabular text-2xl font-bold text-slate-900">
                    {formatRupiah(previewInv.amount)}
                  </div>
                  {previewInv.paidDate && (
                    <div className="text-emerald-700 font-medium mt-1">
                      Lunas pada {formatDateID(previewInv.paidDate)} ({previewInv.paymentMethod})
                    </div>
                  )}
                </div>
              </div>

              {previewInv.status !== 'Dibatalkan' && (
                <div className="pt-2">
                  <QrisCodeCard
                    club={club}
                    invoiceNumber={previewInv.invoiceNumber}
                    amount={previewInv.amount}
                    athleteName={previewInv.athleteName}
                    periodMonth={previewInv.periodMonth}
                    onOpenQrisSettings={() => {
                      setPreviewInvId('');
                      setActiveTab('settings');
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Proof Inspection & Quick Confirm / Admin Upload Modal (?inv_bukti=<id>) */}
      {proofModalInv && (() => {
        const proof = getProofSummary(proofModalInv);
        const busyConfirm = quickConfirmingId === proofModalInv.id;
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
            <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe space-y-4">
              <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1" />
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                    Verifikasi & Bukti Pembayaran
                  </h2>
                  <p className="text-xs font-mono-tabular text-slate-500 mt-0.5">
                    {proofModalInv.invoiceNumber} · {proofModalInv.athleteName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProofModalInvId('')}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                  aria-label="Tutup modal bukti bayar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {proofActionError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{proofActionError}</span>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">{proofModalInv.description}</div>
                  <div className="font-mono-tabular text-lg font-bold text-slate-900 mt-0.5">
                    {formatRupiah(proofModalInv.amount)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">Status Saat Ini</div>
                  <div className="text-xs font-semibold text-sky-700 mt-0.5">
                    {proof.effectiveStatus}
                  </div>
                </div>
              </div>

              {proof.proofImage ? (
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                    <img
                      src={proof.proofImage}
                      alt={`Bukti bayar ${proofModalInv.athleteName}`}
                      className="max-h-72 mx-auto rounded-lg object-contain bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div>
                      <span className="text-slate-400 block">Pengirim</span>
                      <span className="font-semibold text-slate-900">
                        {proof.payerName || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Metode</span>
                      <span className="font-semibold text-slate-900">{proof.method}</span>
                    </div>
                    {proof.submittedAt && (
                      <div className="col-span-2">
                        <span className="text-slate-400 block">Diunggah pada</span>
                        <span className="font-mono-tabular text-slate-700">
                          {new Date(proof.submittedAt).toLocaleString('id-ID')}
                        </span>
                      </div>
                    )}
                    {proof.note && (
                      <div className="col-span-2">
                        <span className="text-slate-400 block">Catatan</span>
                        <span className="text-slate-800">{proof.note}</span>
                      </div>
                    )}
                  </div>

                  {proofModalInv.status !== 'Lunas' && proofModalInv.status !== 'Dibatalkan' && (
                    <div className="space-y-3 pt-1">
                      <button
                        type="button"
                        disabled={busyConfirm}
                        onClick={() => handleQuickConfirmProof(proofModalInv)}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 min-h-[46px] text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-xl cursor-pointer"
                      >
                        {busyConfirm ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                        Konfirmasi Cepat Lunas & Catat Pemasukan
                      </button>

                      <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                        <label className="block text-xs font-medium text-slate-700">
                          Jika bukti kurang jelas / nominal salah (Tolak & Minta Upload Ulang):
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            maxLength={LIMITS.invoice.paymentRejectionReasonMax}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Alasan (misal: Nominal tidak sesuai)"
                            className="flex-1 px-3 min-h-[40px] text-sm sm:text-xs bg-white border border-slate-200 rounded-lg"
                          />
                          <button
                            type="button"
                            disabled={rejectingProof}
                            onClick={() => handleRejectProof(proofModalInv)}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg cursor-pointer disabled:opacity-60 shrink-0"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {rejectingProof ? 'Memproses...' : 'Tolak Bukti'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSaveAdminUploadedProof} className="space-y-3.5">
                  <p className="text-xs text-slate-600">
                    Belum ada bukti yang diunggah orang tua. Jika wali atlet mengirim foto bukti transfer melalui WhatsApp, unggah di sini agar tercatat & siap dikonfirmasi.
                  </p>

                  <label className="block border-2 border-dashed border-slate-300 hover:border-sky-600 rounded-xl p-4 text-center cursor-pointer bg-slate-50/50">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        handleAdminProofFileSelected(f);
                      }}
                      className="sr-only"
                    />
                    {adminProofCompressing ? (
                      <div className="py-4 flex flex-col items-center gap-1.5 text-slate-600">
                        <Loader2 className="w-5 h-5 animate-spin text-sky-700" />
                        <span className="text-xs">Mengompres foto bukti...</span>
                      </div>
                    ) : adminProofImage ? (
                      <div className="space-y-2">
                        <img
                          src={adminProofImage}
                          alt="Pratinjau bukti bayar"
                          className="max-h-52 mx-auto rounded-lg object-contain bg-white border border-slate-200"
                        />
                        <div className="text-xs font-medium text-sky-700">Ganti foto bukti</div>
                      </div>
                    ) : (
                      <div className="py-4 flex flex-col items-center gap-1 text-slate-600">
                        <Upload className="w-6 h-6 text-sky-700" />
                        <span className="text-xs font-medium text-slate-800">
                          Pilih Foto / Screenshot Bukti Bayar
                        </span>
                      </div>
                    )}
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nama Pengirim *
                      </label>
                      <input
                        type="text"
                        maxLength={LIMITS.invoice.proofPayerNameMax}
                        value={adminProofPayer}
                        onChange={(e) => setAdminProofPayer(e.target.value)}
                        className="w-full px-3 min-h-[42px] sm:min-h-[38px] text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Metode Bayar *
                      </label>
                      <BottomSheetSelect
                        value={adminProofMethod}
                        onChange={(v) => setAdminProofMethod(v as ProofPaymentMethod)}
                        title="Metode Pembayaran"
                        options={PROOF_PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Catatan (Opsional)
                    </label>
                    <input
                      type="text"
                      maxLength={LIMITS.invoice.proofNoteMax}
                      value={adminProofNote}
                      onChange={(e) => setAdminProofNote(e.target.value)}
                      placeholder="Contoh: Diterima via WA Admin"
                      className="w-full px-3 min-h-[42px] sm:min-h-[38px] text-sm border border-slate-200 rounded-lg"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={adminProofSaving || adminProofCompressing || !adminProofImage}
                    className="w-full min-h-[44px] bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    {adminProofSaving ? 'Menyimpan Bukti...' : 'Simpan Bukti & Tandai Menunggu Verifikasi'}
                  </button>
                </form>
              )}
            </div>
          </div>
        );
      })()}

      {/* Create Announcement Modal (Bottom sheet on mobile) */}
      {annModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                Buat Surat Administrasi / Pengumuman
              </h2>
              <button
                type="button"
                onClick={() => setAnnModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal surat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} noValidate className="mt-5 space-y-4">
              {annError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{annError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Judul Dokumen <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.announcement.titleMax}
                  value={annTitle}
                  onChange={(e) => {
                    setAnnTitle(e.target.value);
                    setAnnFieldErrors((p) => ({ ...p, title: undefined }));
                  }}
                  placeholder="Contoh: Surat Tugas Kejuaraan Daerah 2026"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    annFieldErrors.title ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {annFieldErrors.title && (
                  <p className="text-[11px] text-red-600 mt-1">{annFieldErrors.title}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jenis Dokumen <span className="text-red-600">*</span>
                  </label>
                  <BottomSheetSelect
                    value={annType}
                    onChange={(val) => {
                      setAnnType(val as AnnouncementDocType);
                      setAnnFieldErrors((p) => ({ ...p, type: undefined }));
                    }}
                    title="Pilih Jenis Dokumen"
                    hasError={Boolean(annFieldErrors.type)}
                    options={ANNOUNCEMENT_TYPES.map((t) => ({ value: t, label: t }))}
                  />
                  {annFieldErrors.type && (
                    <p className="text-[11px] text-red-600 mt-1">{annFieldErrors.type}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Acara / Berlaku
                  </label>
                  <input
                    type="date"
                    value={annDate}
                    onChange={(e) => {
                      setAnnDate(e.target.value);
                      setAnnFieldErrors((p) => ({ ...p, date: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      annFieldErrors.date ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {annFieldErrors.date && (
                    <p className="text-[11px] text-red-600 mt-1">{annFieldErrors.date}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ditujukan Kepada
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.announcement.targetGroupMax}
                    value={annTarget}
                    onChange={(e) => {
                      setAnnTarget(e.target.value);
                      setAnnFieldErrors((p) => ({ ...p, target: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                      annFieldErrors.target ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {annFieldErrors.target && (
                    <p className="text-[11px] text-red-600 mt-1">{annFieldErrors.target}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Penandatangan <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.announcement.authorNameMax}
                    value={annAuthor}
                    onChange={(e) => {
                      setAnnAuthor(e.target.value);
                      setAnnFieldErrors((p) => ({ ...p, author: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                      annFieldErrors.author ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {annFieldErrors.author && (
                    <p className="text-[11px] text-red-600 mt-1">{annFieldErrors.author}</p>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Isi Surat / Pengumuman <span className="text-red-600">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono-tabular">
                    {annContent.length}/{LIMITS.announcement.contentMax}
                  </span>
                </div>
                <textarea
                  rows={6}
                  maxLength={LIMITS.announcement.contentMax}
                  value={annContent}
                  onChange={(e) => {
                    setAnnContent(e.target.value);
                    setAnnFieldErrors((p) => ({ ...p, content: undefined }));
                  }}
                  className={`w-full px-3 py-2 text-base sm:text-sm border rounded-lg ${
                    annFieldErrors.content ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {annFieldErrors.content && (
                  <p className="text-[11px] text-red-600 mt-1">{annFieldErrors.content}</p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAnnModalOpen(false)}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingAnn}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingAnn ? 'Menyimpan...' : 'Simpan Dokumen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Announcement Modal */}
      {previewAnn && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-8 pb-safe space-y-5 sm:space-y-6 print-only-container">
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-200 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-3.5 min-h-[40px] text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Dokumen
              </button>
              <button
                type="button"
                onClick={() => setPreviewAnnId('')}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup pratinjau dokumen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4">
                <img
                  src="/src/assets/images/swim_club_emblem_1795440060748.jpg"
                  alt={club.name}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-lg object-cover"
                />
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900">{club.name}</h2>
                  <p className="text-xs text-slate-600">
                    {club.address || club.city} · Telp: {club.phone || '-'} · Email:{' '}
                    {club.email || '-'}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-sky-800">{previewAnn.docType}</div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {previewAnn.title}
                </h3>
                <div className="text-xs text-slate-500">
                  Ditujukan: {previewAnn.targetGroup || 'Semua Kelompok'}
                  {previewAnn.eventDate && ` · Tanggal: ${formatDateID(previewAnn.eventDate)}`}
                </div>
              </div>

              <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                {previewAnn.content}
              </div>

              <div className="pt-8 flex justify-end text-xs text-slate-700">
                <div className="text-center min-w-[180px]">
                  <div>
                    {club.city}, {formatDateID(todayISO())}
                  </div>
                  <div className="mt-14 font-semibold text-slate-900 border-t border-slate-300 pt-1">
                    {previewAnn.authorName}
                  </div>
                  <div className="text-slate-500">{club.name}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <WhatsAppNotifyModal
        open={waModalData !== null}
        onClose={() => setWaModalData(null)}
        title={waModalData?.title || 'Notifikasi WhatsApp Orang Tua'}
        description={waModalData?.description || ''}
        recipients={waModalData?.recipients || []}
      />
    </div>
  );
};
