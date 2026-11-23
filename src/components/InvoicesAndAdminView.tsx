import React, { useMemo, useState } from 'react';
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
import { clampString, isValidBlueprintDate, LIMITS } from '../lib/validation';
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
  InvoiceStatus,
  PAYMENT_METHODS,
  PaymentMethod,
  todayISO,
} from '../types/club';
import {
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
  const [savingInv, setSavingInv] = useState(false);

  // Batch SPP Generator Modal
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchPeriod, setBatchPeriod] = useState(currentMonthLabel());
  const [batchDueDate, setBatchDueDate] = useState(todayISO());
  const [batchError, setBatchError] = useState<string | null>(null);
  const [savingBatch, setSavingBatch] = useState(false);

  // Settle / Mark Paid Modal
  const [payModalInv, setPayModalInv] = useState<ClubInvoice | null>(null);
  const [payDate, setPayDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Transfer Bank');
  const [payNotes, setPayNotes] = useState('');
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
    setCreateInvOpen(true);
  };

  const handleSelectInvAthlete = (id: string) => {
    setInvAthleteId(id);
    const ath = athletes.find((a) => a.id === id);
    if (ath && invCategory === 'Iuran Bulanan (SPP)') {
      setInvAmount(String(ath.monthlyFee));
      setInvDesc(`Iuran Latihan ${ath.ageGroup} — ${invPeriod}`);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvError(null);
    const ath = athletes.find((a) => a.id === invAthleteId);
    if (!ath) {
      setInvError('Pilih atlet terlebih dahulu.');
      return;
    }
    const parsedAmount = Number(invAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 500000000) {
      setInvError('Nominal tagihan tidak valid.');
      return;
    }
    if (!isValidBlueprintDate(invDueDate)) {
      setInvError('Tanggal jatuh tempo harus valid.');
      return;
    }
    const cleanDesc = clampString(invDesc, LIMITS.invoice.descriptionMax);
    const cleanPeriod = clampString(invPeriod, LIMITS.invoice.periodMonthMax);
    if (cleanDesc.length < 2 || cleanPeriod.length < 3) {
      setInvError('Periode dan keterangan tagihan wajib diisi.');
      return;
    }

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

    const cleanPeriod = clampString(batchPeriod, LIMITS.invoice.periodMonthMax);
    if (cleanPeriod.length < 3) {
      setBatchError('Periode bulan minimal 3 karakter.');
      return;
    }
    if (!isValidBlueprintDate(batchDueDate)) {
      setBatchError('Tanggal jatuh tempo tidak valid.');
      return;
    }

    const activeAthletes = athletes.filter((a) => a.status === 'Aktif' && a.monthlyFee > 0);
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
    const targets = activeAthletes.filter((a) => !alreadyBilledIds.has(a.id));

    if (targets.length === 0) {
      setBatchError(
        `Semua atlet aktif (${activeAthletes.length} orang) sudah memiliki tagihan SPP untuk periode ${cleanPeriod}.`
      );
      return;
    }

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
    if (!isValidBlueprintDate(payDate)) return;

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
    } finally {
      setPaying(false);
    }
  };

  const handleMarkOverdue = async (inv: ClubInvoice) => {
    try {
      await updateDoc(doc(db, 'invoices', inv.id), {
        status: 'Jatuh Tempo',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `invoices/${inv.id}`);
    }
  };

  const handleDeleteInvoice = async (inv: ClubInvoice) => {
    try {
      await deleteDoc(doc(db, 'invoices', inv.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `invoices/${inv.id}`);
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

    const cleanTitle = clampString(annTitle, LIMITS.announcement.titleMax);
    const cleanContent = clampString(annContent, LIMITS.announcement.contentMax);
    const cleanAuthor = clampString(annAuthor, LIMITS.announcement.authorNameMax);

    if (cleanTitle.length < 2 || cleanContent.length < 5 || cleanAuthor.length < 2) {
      setAnnError('Judul, isi surat/pengumuman, dan penandatangan wajib diisi.');
      return;
    }
    if (annDate && !isValidBlueprintDate(annDate)) {
      setAnnError('Format tanggal kegiatan tidak valid.');
      return;
    }

    setSavingAnn(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        clubId: club.id,
        ownerId: userId,
        title: cleanTitle,
        docType: annType,
        eventDate: annDate || '',
        targetGroup: clampString(annTarget, LIMITS.announcement.targetGroupMax),
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
    try {
      await deleteDoc(doc(db, 'announcements', ann.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `announcements/${ann.id}`);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSaved(false);

    const cleanName = clampString(sName, LIMITS.club.nameMax);
    const cleanCity = clampString(sCity, LIMITS.club.cityMax);
    const cleanCoach = clampString(sCoach, LIMITS.club.headCoachMax);
    const parsedFee = Number(sFee);

    if (cleanName.length < 2 || cleanCity.length < 2 || cleanCoach.length < 2) {
      setSettingsError('Nama klub, kota, dan kepala pelatih minimal 2 karakter.');
      return;
    }
    if (!Number.isFinite(parsedFee) || parsedFee < 0 || parsedFee > 50000000) {
      setSettingsError('Nominal iuran default tidak valid.');
      return;
    }

    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'clubs', club.id), {
        name: cleanName,
        city: cleanCity,
        address: clampString(sAddress, LIMITS.club.addressMax),
        headCoach: cleanCoach,
        phone: clampString(sPhone, LIMITS.club.phoneMax),
        email: clampString(sEmail, LIMITS.club.emailMax),
        bankName: clampString(sBankName, LIMITS.club.bankNameMax),
        bankAccountNumber: clampString(sBankNo, LIMITS.club.bankAccountNumberMax),
        bankAccountHolder: clampString(sBankHolder, LIMITS.club.bankAccountHolderMax),
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
          onClick={() => setActiveTab('invoices')}
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
          onClick={() => setActiveTab('letters')}
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
          onClick={() => setActiveTab('settings')}
          className={`px-3.5 sm:px-4 min-h-[44px] sm:min-h-[36px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Profil & Rekening
        </button>
      </div>

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
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoice(inv)}
                            className="px-3 min-h-[40px] text-xs font-medium text-red-700 bg-red-50 rounded-lg cursor-pointer"
                          >
                            Hapus
                          </button>
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
                              <button
                                type="button"
                                onClick={() => handleDeleteInvoice(inv)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                                title="Hapus invoice"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPreviewAnn(ann)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Buka & Cetak Surat
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnnouncement(ann)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                      title="Hapus dokumen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
              {settingsError}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Klub</label>
              <input
                type="text"
                required
                maxLength={LIMITS.club.nameMax}
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kota</label>
              <input
                type="text"
                required
                maxLength={LIMITS.club.cityMax}
                value={sCity}
                onChange={(e) => setSCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
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
              onChange={(e) => setSAddress(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kepala Pelatih
              </label>
              <input
                type="text"
                required
                maxLength={LIMITS.club.headCoachMax}
                value={sCoach}
                onChange={(e) => setSCoach(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Iuran SPP Default (Rp)
              </label>
              <input
                type="number"
                required
                min={0}
                max={50000000}
                value={sFee}
                onChange={(e) => setSFee(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Telepon / WhatsApp Admin
              </label>
              <input
                type="text"
                maxLength={LIMITS.club.phoneMax}
                value={sPhone}
                onChange={(e) => setSPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Klub</label>
              <input
                type="email"
                maxLength={LIMITS.club.emailMax}
                value={sEmail}
                onChange={(e) => setSEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-4">
            <h3 className="text-xs font-semibold text-slate-800">
              Informasi Rekening Transfer Resmi
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Bank</label>
                <input
                  type="text"
                  maxLength={LIMITS.club.bankNameMax}
                  value={sBankName}
                  onChange={(e) => setSBankName(e.target.value)}
                  placeholder="Bank Mandiri"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nomor Rekening
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.club.bankAccountNumberMax}
                  value={sBankNo}
                  onChange={(e) => setSBankNo(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Atas Nama</label>
                <input
                  type="text"
                  maxLength={LIMITS.club.bankAccountHolderMax}
                  value={sBankHolder}
                  onChange={(e) => setSBankHolder(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
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

            <form onSubmit={handleCreateInvoice} className="mt-5 space-y-4">
              {invError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                  {invError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Atlet</label>
                <select
                  value={invAthleteId}
                  onChange={(e) => handleSelectInvAthlete(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName} ({a.ageGroup})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kategori Tagihan
                  </label>
                  <select
                    value={invCategory}
                    onChange={(e) => setInvCategory(e.target.value as InvoiceCategory)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {INVOICE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Periode / Bulan
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={LIMITS.invoice.periodMonthMax}
                    value={invPeriod}
                    onChange={(e) => setInvPeriod(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Deskripsi Rincian Tagihan
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.invoice.descriptionMax}
                  value={invDesc}
                  onChange={(e) => setInvDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nominal (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={500000000}
                    value={invAmount}
                    onChange={(e) => setInvAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Batas Jatuh Tempo
                  </label>
                  <input
                    type="date"
                    required
                    value={invDueDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
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
                  onChange={(e) => setInvNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
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

            <form onSubmit={handleBatchGenerateSPP} className="mt-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Sistem akan otomatis menerbitkan invoice SPP bulanan untuk seluruh atlet berstatus <strong>Aktif</strong> yang belum memiliki tagihan pada periode ini.
              </p>

              {batchError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                  {batchError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Periode Tagihan (Contoh: Desember 2026)
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.invoice.periodMonthMax}
                  value={batchPeriod}
                  onChange={(e) => setBatchPeriod(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal Jatuh Tempo
                </label>
                <input
                  type="date"
                  required
                  value={batchDueDate}
                  onChange={(e) => setBatchDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                />
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

            <form onSubmit={handleSettleInvoice} className="mt-5 space-y-4">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Bayar
                  </label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Metode Bayar
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
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
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Contoh: Diterima via transfer Mandiri"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
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

            <form onSubmit={handleCreateAnnouncement} className="mt-5 space-y-4">
              {annError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                  {annError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Judul Dokumen
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.announcement.titleMax}
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="Contoh: Surat Tugas Kejuaraan Daerah 2026"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jenis Dokumen
                  </label>
                  <select
                    value={annType}
                    onChange={(e) => setAnnType(e.target.value as AnnouncementDocType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {ANNOUNCEMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Acara / Berlaku
                  </label>
                  <input
                    type="date"
                    value={annDate}
                    onChange={(e) => setAnnDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
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
                    onChange={(e) => setAnnTarget(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Penandatangan
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={LIMITS.announcement.authorNameMax}
                    value={annAuthor}
                    onChange={(e) => setAnnAuthor(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Isi Surat / Pengumuman
                </label>
                <textarea
                  rows={6}
                  required
                  maxLength={LIMITS.announcement.contentMax}
                  value={annContent}
                  onChange={(e) => setAnnContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
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
