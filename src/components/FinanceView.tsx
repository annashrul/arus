import React, { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString, isValidBlueprintDate, LIMITS } from '../lib/validation';
import {
  Athlete,
  ClubProfile,
  downloadCSV,
  FinanceTransaction,
  formatDateID,
  formatRupiah,
  PAYMENT_METHODS,
  PaymentMethod,
  todayISO,
  TRANSACTION_CATEGORIES,
  TransactionCategory,
  TransactionType,
} from '../types/club';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Edit3,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { CashflowTrendChart } from './TrendCharts';

interface FinanceViewProps {
  club: ClubProfile;
  userId: string;
  transactions: FinanceTransaction[];
  athletes: Athlete[];
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  club,
  userId,
  transactions,
  athletes,
}) => {
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<FinanceTransaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form fields
  const [type, setType] = useState<TransactionType>('pemasukan');
  const [category, setCategory] = useState<TransactionCategory>('Iuran Bulanan (SPP)');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Transfer Bank');
  const [referenceNo, setReferenceNo] = useState('');
  const [selectedAthleteId, setSelectedAthleteId] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...transactions]
      .filter((tx) => {
        if (filterType !== 'all' && tx.type !== filterType) return false;
        if (filterCategory !== 'all' && tx.category !== filterCategory) return false;
        if (monthFilter && !tx.transactionDate.startsWith(monthFilter)) return false;
        if (q) {
          const hay = `${tx.description} ${tx.category} ${tx.athleteName || ''} ${tx.referenceNo || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }, [transactions, filterType, filterCategory, monthFilter, searchQuery]);

  const summary = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    const byCategory = new Map<string, { income: number; expense: number }>();

    for (const tx of filtered) {
      if (tx.type === 'pemasukan') totalIncome += tx.amount;
      else totalExpense += tx.amount;

      const cur = byCategory.get(tx.category) || { income: 0, expense: 0 };
      if (tx.type === 'pemasukan') cur.income += tx.amount;
      else cur.expense += tx.amount;
      byCategory.set(tx.category, cur);
    }

    return {
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      categories: Array.from(byCategory.entries())
        .map(([name, val]) => ({ name, ...val, total: val.income + val.expense }))
        .sort((a, b) => b.total - a.total),
    };
  }, [filtered]);

  const openCreateModal = (defaultType: TransactionType = 'pemasukan') => {
    setEditingTx(null);
    setType(defaultType);
    setCategory(defaultType === 'pemasukan' ? 'Iuran Bulanan (SPP)' : 'Sewa Kolam');
    setDescription('');
    setAmount('');
    setTransactionDate(todayISO());
    setPaymentMethod('Transfer Bank');
    setReferenceNo('');
    setSelectedAthleteId('');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (tx: FinanceTransaction) => {
    setEditingTx(tx);
    setType(tx.type);
    setCategory(tx.category);
    setDescription(tx.description);
    setAmount(String(tx.amount));
    setTransactionDate(tx.transactionDate);
    setPaymentMethod(tx.paymentMethod);
    setReferenceNo(tx.referenceNo || '');
    setSelectedAthleteId(tx.athleteId || '');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedAmount = Number(amount);
    const cleanDesc = clampString(description, LIMITS.transaction.descriptionMax);
    if (cleanDesc.length < 2) {
      setErrorMsg('Keterangan transaksi minimal 2 karakter.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 1000000000) {
      setErrorMsg('Nominal harus lebih dari 0 dan maksimal Rp 1.000.000.000.');
      return;
    }
    if (!isValidBlueprintDate(transactionDate)) {
      setErrorMsg('Format tanggal harus YYYY-MM-DD.');
      return;
    }

    const athleteObj = athletes.find((a) => a.id === selectedAthleteId);

    setSaving(true);
    try {
      const payload = {
        type,
        category,
        description: cleanDesc,
        amount: Math.round(parsedAmount),
        transactionDate,
        paymentMethod,
        referenceNo: clampString(referenceNo, LIMITS.transaction.referenceNoMax),
        athleteId: athleteObj ? athleteObj.id : '',
        athleteName: athleteObj ? clampString(athleteObj.fullName, LIMITS.transaction.athleteNameMax) : '',
      };

      if (editingTx) {
        const path = `transactions/${editingTx.id}`;
        try {
          await updateDoc(doc(db, 'transactions', editingTx.id), {
            ...payload,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        try {
          await addDoc(collection(db, 'transactions'), {
            ...payload,
            clubId: club.id,
            ownerId: userId,
            invoiceId: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'transactions');
        }
      }
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan transaksi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tx: FinanceTransaction) => {
    const path = `transactions/${tx.id}`;
    try {
      await deleteDoc(doc(db, 'transactions', tx.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleExportCSV = () => {
    downloadCSV(
      `laporan-keuangan-${club.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
      ['Tanggal', 'Tipe', 'Kategori', 'Keterangan', 'Atlet', 'Metode', 'Referensi', 'Nominal (IDR)'],
      filtered.map((tx) => [
        tx.transactionDate,
        tx.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
        tx.category,
        tx.description,
        tx.athleteName || '-',
        tx.paymentMethod,
        tx.referenceNo || '-',
        tx.amount,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Catatan Keuangan Klub
          </h1>
          <p className="text-sm text-slate-500">
            Buku kas pemasukan iuran SPP, sponsor, sewa kolam, honorarium pelatih, dan operasional kejuaraan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh CSV
          </button>
          <button
            type="button"
            onClick={() => openCreateModal('pengeluaran')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-red-600" />
            Catat Pengeluaran
          </button>
          <button
            type="button"
            onClick={() => openCreateModal('pemasukan')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Catat Pemasukan
          </button>
        </div>
      </div>

      {/* 3-Column Financial Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Total Pemasukan (Filter Aktif)</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono-tabular text-2xl font-bold text-emerald-700">
            {formatRupiah(summary.totalIncome)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Total Pengeluaran (Filter Aktif)</span>
            <ArrowUpRight className="w-4 h-4 text-red-600" />
          </div>
          <div className="font-mono-tabular text-2xl font-bold text-red-700">
            {formatRupiah(summary.totalExpense)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Selisih / Saldo Kas</span>
            <span className="font-mono-tabular text-slate-400">{filtered.length} transaksi</span>
          </div>
          <div
            className={`font-mono-tabular text-2xl font-bold ${
              summary.netBalance >= 0 ? 'text-slate-900' : 'text-red-700'
            }`}
          >
            {formatRupiah(summary.netBalance)}
          </div>
        </div>
      </div>

      {/* Category Distribution Breakdown */}
      {summary.categories.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900 mb-3">
            Ringkasan per Pos Keuangan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {summary.categories.slice(0, 4).map((cat) => (
              <div key={cat.name} className="space-y-1">
                <div className="text-xs text-slate-600 truncate">{cat.name}</div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-900">
                  {cat.income > 0 && (
                    <span className="text-emerald-700">+{formatRupiah(cat.income)}</span>
                  )}
                  {cat.income > 0 && cat.expense > 0 && <span className="mx-1 text-slate-400">/</span>}
                  {cat.expense > 0 && (
                    <span className="text-red-700">-{formatRupiah(cat.expense)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cashflow Trend Chart */}
      <CashflowTrendChart
        transactions={transactions}
        title="Grafik Tren Pemasukan, Pengeluaran & Saldo Kas"
      />

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'pemasukan', label: 'Pemasukan' },
              { id: 'pengeluaran', label: 'Pengeluaran' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterType === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 flex-1 lg:justify-end">
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari keterangan, atlet, ref..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-sky-600"
          >
            <option value="all">Semua Kategori</option>
            {TRANSACTION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 text-xs font-mono-tabular border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-sky-600"
            aria-label="Filter bulan transaksi"
          />
          {monthFilter && (
            <button
              type="button"
              onClick={() => setMonthFilter('')}
              className="text-xs text-sky-700 hover:underline cursor-pointer"
            >
              Reset Bulan
            </button>
          )}
        </div>
      </div>

      {/* Transactions Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-medium text-slate-900">
              Belum ada catatan keuangan yang sesuai
            </p>
            <p className="text-xs text-slate-500">
              Catat pemasukan SPP atau pengeluaran operasional kolam untuk memantau saldo kas klub.
            </p>
            <button
              type="button"
              onClick={() => openCreateModal('pemasukan')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-700 text-white text-xs font-medium rounded-lg hover:bg-sky-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Transaksi Pertama
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map((tx) => (
                <div key={tx.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono-tabular text-slate-500">
                        {formatDateID(tx.transactionDate)} · {tx.paymentMethod}
                      </div>
                      <div className="font-medium text-sm text-slate-900 mt-0.5">
                        {tx.description}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {tx.category}
                        {tx.athleteName ? ` · ${tx.athleteName}` : ''}
                      </div>
                    </div>
                    <div
                      className={`font-mono-tabular text-sm font-bold whitespace-nowrap shrink-0 ${
                        tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {tx.type === 'pemasukan' ? '+' : '-'}
                      {formatRupiah(tx.amount)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono-tabular text-[11px] text-slate-400">
                      {tx.referenceNo || '-'}
                    </span>
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(tx)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tx)}
                        className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Kategori & Keterangan</th>
                    <th className="py-3 px-4">Metode / Ref</th>
                    <th className="py-3 px-4 text-right">Nominal</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                        {formatDateID(tx.transactionDate)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{tx.description}</div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>{tx.category}</span>
                          {tx.athleteName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Atlet: {tx.athleteName}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        <div>{tx.paymentMethod}</div>
                        {tx.referenceNo && (
                          <div className="font-mono-tabular text-slate-400">{tx.referenceNo}</div>
                        )}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-tabular font-semibold whitespace-nowrap ${
                          tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {tx.type === 'pemasukan' ? '+' : '-'}
                        {formatRupiah(tx.amount)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(tx)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                            title="Edit transaksi"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(tx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                            title="Hapus transaksi"
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

      {/* Add / Edit Transaction Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {editingTx ? 'Edit Catatan Transaksi' : 'Catat Transaksi Keuangan'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setType('pemasukan')}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    type === 'pemasukan'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Pemasukan
                </button>
                <button
                  type="button"
                  onClick={() => setType('pengeluaran')}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    type === 'pengeluaran'
                      ? 'bg-white text-red-700 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Pengeluaran
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {TRANSACTION_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Keterangan Transaksi
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.transaction.descriptionMax}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: Sewa lintasan kolam bulan Desember"
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
                    max={1000000000}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="450000"
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Metode Pembayaran
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Atlet Terkait (Opsional)
                  </label>
                  <select
                    value={selectedAthleteId}
                    onChange={(e) => setSelectedAthleteId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">-- Tidak terkait atlet --</option>
                    {athletes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.fullName} ({a.ageGroup})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nomor Referensi / Kwitansi
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.transaction.referenceNoMax}
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="TRF-202611-01"
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : editingTx ? 'Simpan Perubahan' : 'Simpan Transaksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
