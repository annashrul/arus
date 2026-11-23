import React, { useEffect, useMemo, useState } from 'react';
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
  todayISO,
} from '../types/club';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Layers,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';

interface InvoicesAndAdminViewProps {
  club: ClubProfile;
  userId: string;
  invoices: ClubInvoice[];
  athletes: Athlete[];
  announcements: ClubAnnouncement[];
}

export const InvoicesAndAdminView: React.FC<InvoicesAndAdminViewProps> = ({
  club,
  userId,
  invoices,
  athletes,
  announcements,
}) => {
  const [activeTab, setActiveTab] = useState<'invoices' | 'letters' | 'settings'>('invoices');
  const [listError, setListError] = useState<string | null>(null);
  const [confirmDeleteInvId, setConfirmDeleteInvId] = useState<string | null>(null);
  const [confirmDeleteAnnId, setConfirmDeleteAnnId] = useState<string | null>(null);

  // Invoice filters
  const [invSearch, setInvSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

  // Preview / Print Invoice Modal
  const [previewInv, setPreviewInv] = useState<ClubInvoice | null>(null);
  const [copiedWa, setCopiedWa] = useState(false);

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
  const [previewAnn, setPreviewAnn] = useState<ClubAnnouncement | null>(null);

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
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsFieldErrors, setSettingsFieldErrors] = useState<
    FieldErrors<
      'name' | 'city' | 'address' | 'coach' | 'fee' | 'phone' | 'email' | 'bankName' | 'bankNo' | 'bankHolder'
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
  }, [club]);

  const filteredInvoices = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    return [...invoices]
      .filter((inv) => {
        if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
        if (q) {
          const hay = `${inv.invoiceNumber} ${inv.athleteName} ${inv.description} ${inv.periodMonth}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [invoices, invSearch, statusFilter]);

  const invoiceTotals = useMemo(() => {
    let paid = 0;
    let pending = 0;
    let overdue = 0;
    for (const inv of invoices) {
      if (inv.status === 'Lunas') paid += inv.amount;
      else if (inv.status === 'Belum Lunas') pending += inv.amount;
      else if (inv.status === 'Jatuh Tempo') overdue += inv.amount;
    }
    return { paid, pending, overdue };
  }, [invoices]);

  const activeZeroFeeAthletesCount = useMemo(
    () => athletes.filter((a) => a.status === 'Aktif' && a.monthlyFee <= 0).length,
    [athletes]
  );

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

    setSavingInv(true);
    try {
      await addDoc(collection(db, 'invoices'), {
        clubId: club.id,
        ownerId: userId,
        invoiceNumber,
        athleteId: ath.id,
        athleteName: clampString(ath.fullName, LIMITS.athlete.fullNameMax),
        parentName: clampString(ath.parentName || '', LIMITS.athlete.parentNameMax),
        parentPhone: clampString(ath.parentPhone || '', LIMITS.athlete.parentPhoneMax),
        periodMonth: cleanPeriod,
        category: invCategory,
        description: cleanDesc,
        amount: Math.round(parsedAmount),
        dueDate: invDueDate,
        status: 'Belum Lunas',
        paidDate: '',
        paymentMethod: '',
        notes: clampString(invNotes, LIMITS.invoice.notesMax),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, 'invoices'));
      setCreateInvOpen(false);
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
      const batch = writeBatch(db);
      const ym = batchDueDate.slice(0, 7).replace('-', '/');
      targets.forEach((ath, idx) => {
        const seq = String(invoices.length + idx + 1).padStart(3, '0');
        const invNumber = `INV/${ym}/SPP-${seq}`;
        const ref = doc(collection(db, 'invoices'));
        batch.set(ref, {
          clubId: club.id,
          ownerId: userId,
          invoiceNumber: invNumber,
          athleteId: ath.id,
          athleteName: clampString(ath.fullName, LIMITS.athlete.fullNameMax),
          parentName: clampString(ath.parentName || '', LIMITS.athlete.parentNameMax),
          parentPhone: clampString(ath.parentPhone || '', LIMITS.athlete.parentPhoneMax),
          periodMonth: cleanPeriod,
          category: 'Iuran Bulanan (SPP)',
          description: `Iuran Latihan Reguler ${ath.ageGroup} — ${cleanPeriod}`,
          amount: Math.round(ath.monthlyFee),
          dueDate: batchDueDate,
          status: 'Belum Lunas',
          paidDate: '',
          paymentMethod: '',
          notes: `Transfer ke ${club.bankName || 'Rekening Klub'} ${club.bankAccountNumber || ''}`.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit().catch((err) =>
        handleFirestoreError(err, OperationType.WRITE, 'invoices/batch_spp')
      );
      setBatchOpen(false);
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
        notes: clampString(payNotes || payModalInv.notes || '', LIMITS.invoice.notesMax),
        updatedAt: serverTimestamp(),
      });

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
      setConfirmDeleteInvId(null);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `invoices/${inv.id}`);
      } catch (handled) {
        setListError(handled instanceof Error ? handled.message : 'Gagal menghapus invoice.');
      }
    }
  };

  const handleCopyWhatsAppReminder = (inv: ClubInvoice) => {
    const msg = [
      `Yth. Bapak/Ibu ${inv.parentName || 'Wali Atlet'} (${inv.athleteName}),`,
      ``,
      `Berikut informasi tagihan resmi *${club.name}*:`,
      `No. Invoice: ${inv.invoiceNumber}`,
      `Keterangan: ${inv.description}`,
      `Nominal: ${formatRupiah(inv.amount)}`,
      `Jatuh Tempo: ${formatDateID(inv.dueDate)}`,
      `Status: ${inv.status}`,
      ``,
      club.bankName
        ? `Pembayaran via ${club.bankName} No. Rek ${club.bankAccountNumber || '-'} a.n. ${club.bankAccountHolder || club.name}.`
        : '',
      `Terima kasih atas dukungan Bapak/Ibu.`,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(msg);
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSaved(false);

    const errors: FieldErrors<
      'name' | 'city' | 'address' | 'coach' | 'fee' | 'phone' | 'email' | 'bankName' | 'bankNo' | 'bankHolder'
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
              className="col-span-2 sm:col-span-1 sm:order-3 inline-flex items-center justify-center gap-2 px-4 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 whitespace-nowrap cursor-pointer disabled:opacity-50"
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
              className="sm:order-2 inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Layers className="w-3.5 h-3.5 text-sky-700" />
              SPP Massal
            </button>
            <button
              type="button"
              onClick={handleExportInvoicesCSV}
              disabled={filteredInvoices.length === 0}
              className="sm:order-1 inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh CSV
            </button>
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

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 min-h-[40px] sm:min-h-[32px] text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                Semua
              </button>
              {INVOICE_STATUSES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 min-h-[40px] sm:min-h-[32px] text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {st}
                </button>
              ))}
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
                  {filteredInvoices.map((inv) => (
                    <div key={inv.id} className="p-4 space-y-2.5">
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
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono-tabular text-sm font-bold text-slate-900">
                            {formatRupiah(inv.amount)}
                          </div>
                          <div
                            className={`text-xs font-medium mt-0.5 ${
                              inv.status === 'Lunas'
                                ? 'text-emerald-700'
                                : inv.status === 'Jatuh Tempo'
                                ? 'text-red-600'
                                : inv.status === 'Dibatalkan'
                                ? 'text-slate-400'
                                : 'text-amber-700'
                            }`}
                          >
                            {inv.status}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="font-mono-tabular text-xs text-slate-500">
                          Tempo {formatDateID(inv.dueDate)}
                        </span>
                        <div className="inline-flex flex-wrap items-center gap-1.5">
                          {(inv.status === 'Belum Lunas' || inv.status === 'Jatuh Tempo') && (
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
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCopiedWa(false);
                              setPreviewInv(inv);
                            }}
                            className="px-3 min-h-[40px] text-xs font-medium text-sky-700 bg-sky-50 rounded-lg cursor-pointer"
                          >
                            Cetak
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
                  ))}
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
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-slate-800 whitespace-nowrap">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{inv.athleteName}</div>
                            <div className="text-xs text-slate-500">
                              {inv.description} · {inv.category}
                            </div>
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
                                inv.status === 'Lunas'
                                  ? 'text-emerald-700'
                                  : inv.status === 'Jatuh Tempo'
                                  ? 'text-red-600'
                                  : inv.status === 'Dibatalkan'
                                  ? 'text-slate-400'
                                  : 'text-amber-700'
                              }
                            >
                              {inv.status}
                            </span>
                            {inv.paidDate && (
                              <div className="font-mono-tabular text-[11px] text-slate-400">
                                Lunas {formatDateID(inv.paidDate)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {(inv.status === 'Belum Lunas' || inv.status === 'Jatuh Tempo') && (
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
                              )}
                              {inv.status === 'Belum Lunas' && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkOverdue(inv)}
                                  className="px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded cursor-pointer"
                                  title="Tandai Jatuh Tempo"
                                >
                                  Jatuh Tempo
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setCopiedWa(false);
                                  setPreviewInv(inv);
                                }}
                                className="p-1.5 text-slate-500 hover:text-sky-700 rounded hover:bg-sky-50 cursor-pointer"
                                title="Lihat & Cetak Invoice"
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
                      ))}
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
                      onClick={() => setPreviewAnn(ann)}
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
                <select
                  value={invAthleteId}
                  onChange={(e) => handleSelectInvAthlete(e.target.value)}
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg bg-white ${
                    invFieldErrors.athleteId ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                >
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName} ({a.ageGroup})
                    </option>
                  ))}
                </select>
                {invFieldErrors.athleteId && (
                  <p className="text-[11px] text-red-600 mt-1">{invFieldErrors.athleteId}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kategori Tagihan <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={invCategory}
                    onChange={(e) => {
                      setInvCategory(e.target.value as InvoiceCategory);
                      setInvFieldErrors((p) => ({ ...p, category: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg bg-white ${
                      invFieldErrors.category ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  >
                    {INVOICE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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
                  <select
                    value={payMethod}
                    onChange={(e) => {
                      setPayMethod(e.target.value as PaymentMethod);
                      setPayFieldErrors((p) => ({ ...p, payMethod: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg bg-white ${
                      payFieldErrors.payMethod ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
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
                onClick={() => setPreviewInv(null)}
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
            </div>
          </div>
        </div>
      )}

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
                  <select
                    value={annType}
                    onChange={(e) => {
                      setAnnType(e.target.value as AnnouncementDocType);
                      setAnnFieldErrors((p) => ({ ...p, type: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg bg-white ${
                      annFieldErrors.type ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  >
                    {ANNOUNCEMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
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
                onClick={() => setPreviewAnn(null)}
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
    </div>
  );
};
