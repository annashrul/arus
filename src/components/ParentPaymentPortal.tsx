import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  compressPaymentProofImage,
  isValidPaymentTokenFormat,
} from '../lib/paymentProof';
import { clampString, LIMITS } from '../lib/validation';
import {
  ClubProfile,
  formatDateID,
  formatRupiah,
  PaymentRequest,
  PROOF_PAYMENT_METHODS,
  ProofPaymentMethod,
} from '../types/club';
import { BottomSheetSelect } from './BottomSheetSelect';
import { QrisCodeCard } from './QrisCodeCard';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ImagePlus,
  Loader2,
  Receipt,
  ShieldCheck,
  Upload,
  Waves,
} from 'lucide-react';

interface ParentPaymentPortalProps {
  token: string;
  onExitToAdmin: () => void;
}

export const ParentPaymentPortal: React.FC<ParentPaymentPortalProps> = ({
  token,
  onExitToAdmin,
}) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentReq, setPaymentReq] = useState<PaymentRequest | null>(null);

  const [payerName, setPayerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ProofPaymentMethod>('Transfer Bank');
  const [proofNote, setProofNote] = useState('');
  const [proofImageDataUrl, setProofImageDataUrl] = useState('');
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedBank, setCopiedBank] = useState(false);

  const tokenValid = isValidPaymentTokenFormat(token);

  useEffect(() => {
    if (!tokenValid) {
      setLoading(false);
      setLoadError('Tautan pembayaran tidak valid atau tidak lengkap.');
      return;
    }

    setLoading(true);
    setLoadError(null);
    const ref = doc(db, 'paymentRequests', token);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setPaymentReq(null);
          setLoadError('Tagihan tidak ditemukan atau tautan sudah kedaluwarsa.');
        } else {
          const data = { id: snap.id, ...(snap.data() as Omit<PaymentRequest, 'id'>) };
          setPaymentReq(data);
          setPayerName((prev) => prev || data.payerName || '');
          if (
            data.paymentMethod &&
            PROOF_PAYMENT_METHODS.includes(data.paymentMethod as ProofPaymentMethod)
          ) {
            setPaymentMethod(data.paymentMethod as ProofPaymentMethod);
          }
          setLoadError(null);
        }
        setLoading(false);
      },
      () => {
        setLoadError('Gagal memuat informasi tagihan. Pastikan koneksi internet stabil.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [token, tokenValid]);

  const virtualClub: ClubProfile | null = useMemo(() => {
    if (!paymentReq) return null;
    return {
      id: paymentReq.clubId,
      name: paymentReq.clubName,
      city: paymentReq.clubCity,
      headCoach: '-',
      bankName: paymentReq.bankName || '',
      bankAccountNumber: paymentReq.bankAccountNumber || '',
      bankAccountHolder: paymentReq.bankAccountHolder || '',
      qrisPayload: paymentReq.qrisPayload || '',
      qrisMerchantName: paymentReq.qrisMerchantName || paymentReq.clubName,
      defaultMonthlyFee: paymentReq.amount,
      ownerId: paymentReq.ownerId,
    };
  }, [paymentReq]);

  const handleCopyAccount = async () => {
    if (!paymentReq?.bankAccountNumber) return;
    try {
      await navigator.clipboard.writeText(paymentReq.bankAccountNumber);
      setCopiedBank(true);
      setTimeout(() => setCopiedBank(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError(null);
    setCompressing(true);
    try {
      const compressed = await compressPaymentProofImage(file);
      setProofImageDataUrl(compressed);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal memproses gambar bukti bayar.');
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentReq || !tokenValid) return;

    const cleanPayer = clampString(payerName, LIMITS.invoice.proofPayerNameMax);
    const cleanNote = clampString(proofNote, LIMITS.invoice.proofNoteMax);

    if (cleanPayer.length < 2) {
      setFormError('Nama pengirim / pembayar minimal 2 karakter.');
      return;
    }
    if (!proofImageDataUrl || !proofImageDataUrl.startsWith('data:image/')) {
      setFormError('Unggah foto atau screenshot bukti pembayaran terlebih dahulu.');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'paymentRequests', token), {
        status: 'Menunggu Verifikasi',
        proofImageDataUrl,
        payerName: cleanPayer,
        paymentMethod,
        proofNote: cleanNote,
        submittedAt: new Date().toISOString(),
        rejectionReason: '',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Gagal mengirim bukti pembayaran. Silakan coba beberapa saat lagi.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canUploadProof =
    paymentReq?.status === 'Menunggu Pembayaran' || paymentReq?.status === 'Ditolak';

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Top Portal Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-sky-700 text-white flex items-center justify-center shrink-0">
              <Waves className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-slate-900 truncate">
                {paymentReq ? paymentReq.clubName : 'Portal Pembayaran Tagihan'}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {paymentReq
                  ? `${paymentReq.clubCity} · Portal Wali Atlet`
                  : 'Konfirmasi & Bukti Transfer'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onExitToAdmin}
            className="inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dasbor Admin
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-5 sm:py-8 space-y-4">
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <Loader2 className="w-7 h-7 animate-spin text-sky-700 mx-auto" />
            <p className="text-sm text-slate-600 mt-3">Memuat detail tagihan resmi...</p>
          </div>
        ) : loadError || !paymentReq || !virtualClub ? (
          <div className="bg-white border border-red-200 rounded-xl p-6 text-center space-y-3">
            <AlertCircle className="w-9 h-9 text-red-600 mx-auto" />
            <h1 className="font-display font-bold text-lg text-slate-900">
              Tautan Pembayaran Tidak Tersedia
            </h1>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              {loadError || 'Data tagihan tidak ditemukan.'}
            </p>
            <button
              type="button"
              onClick={onExitToAdmin}
              className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium rounded-lg cursor-pointer"
            >
              Masuk ke Halaman Utama
            </button>
          </div>
        ) : (
          <>
            {/* Status Alert Banner */}
            {paymentReq.status === 'Terverifikasi' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-950">
                  <div className="font-bold">Pembayaran Terverifikasi (Lunas)</div>
                  <p className="text-xs text-emerald-800 mt-1">
                    Terima kasih, pembayaran atas nama <strong>{paymentReq.athleteName}</strong>{' '}
                    telah dikonfirmasi oleh admin klub.
                  </p>
                </div>
              </div>
            )}

            {paymentReq.status === 'Menunggu Verifikasi' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-950">
                  <div className="font-bold">Bukti Bayar Sedang Diperiksa Admin</div>
                  <p className="text-xs text-amber-800 mt-1">
                    Bukti transfer Anda sudah masuk secara otomatis ke daftar invoice admin klub.
                    Status halaman ini akan langsung berubah menjadi <strong>Lunas</strong> setelah
                    admin mengonfirmasi.
                  </p>
                </div>
              </div>
            )}

            {paymentReq.status === 'Ditolak' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm text-red-950">
                  <div className="font-bold">Bukti Pembayaran Perlu Diunggah Ulang</div>
                  <p className="text-xs text-red-800 mt-1">
                    Alasan admin:{' '}
                    <strong>
                      {paymentReq.rejectionReason ||
                        'Bukti kurang jelas atau nominal belum sesuai.'}
                    </strong>{' '}
                    Silakan unggah kembali bukti transfer yang benar di bawah ini.
                  </p>
                </div>
              </div>
            )}

            {/* Invoice Summary Card */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700">
                    <Receipt className="w-3.5 h-3.5" />
                    Tagihan Resmi Klub
                  </div>
                  <h1 className="font-display font-bold text-lg sm:text-xl text-slate-900 mt-1">
                    {paymentReq.athleteName}
                  </h1>
                  <div className="text-xs font-mono-tabular text-slate-500 mt-0.5">
                    {paymentReq.invoiceNumber} · Periode {paymentReq.periodMonth}
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                    Total Tagihan
                  </div>
                  <div className="font-display font-bold text-2xl font-mono-tabular text-slate-900 mt-0.5">
                    {formatRupiah(paymentReq.amount)}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Jatuh tempo: {formatDateID(paymentReq.dueDate)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
                  <div className="text-slate-400 font-medium">Rincian Tagihan</div>
                  <div className="text-slate-900 font-semibold mt-1">{paymentReq.description}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
                  <div className="text-slate-400 font-medium">Status Pembayaran</div>
                  <div
                    className={`font-semibold mt-1 ${
                      paymentReq.status === 'Terverifikasi'
                        ? 'text-emerald-700'
                        : paymentReq.status === 'Menunggu Verifikasi'
                        ? 'text-amber-700'
                        : paymentReq.status === 'Ditolak'
                        ? 'text-red-700'
                        : 'text-sky-700'
                    }`}
                  >
                    {paymentReq.status}
                  </div>
                </div>
              </div>
            </section>

            {/* Payment Channels (QRIS + Bank Transfer) */}
            {canUploadProof && (
              <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">
                    1. Lakukan Pembayaran
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Scan QRIS di bawah atau transfer ke rekening resmi klub sesuai nominal tagihan.
                  </p>
                </div>

                <QrisCodeCard
                  club={virtualClub}
                  invoiceNumber={paymentReq.invoiceNumber}
                  amount={paymentReq.amount}
                  athleteName={paymentReq.athleteName}
                  periodMonth={paymentReq.periodMonth}
                />

                {paymentReq.bankName && paymentReq.bankAccountNumber && (
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Building2 className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900">
                          Transfer Bank — {paymentReq.bankName}
                        </div>
                        <div className="text-sm font-mono-tabular font-bold text-slate-900 mt-0.5">
                          {paymentReq.bankAccountNumber}
                        </div>
                        <div className="text-xs text-slate-500">
                          a.n. {paymentReq.bankAccountHolder || paymentReq.clubName}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyAccount}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer shrink-0"
                    >
                      {copiedBank ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          No. Rek Tersalin
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Salin No. Rek
                        </>
                      )}
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Upload Form or Submitted Proof Preview */}
            {canUploadProof ? (
              <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
                <div className="mb-4">
                  <h2 className="font-display font-bold text-base text-slate-900">
                    2. Unggah Bukti Pembayaran
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Setelah foto bukti transfer diunggah, sistem langsung menandai tagihan ini untuk
                    konfirmasi cepat admin.
                  </p>
                </div>

                {formError && (
                  <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitProof} className="space-y-4">
                  {/* Image Upload Dropzone */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Foto / Screenshot Struk Transfer *
                    </label>
                    <label className="block border-2 border-dashed border-slate-300 hover:border-sky-600 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-50/50">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                      {compressing ? (
                        <div className="py-6 flex flex-col items-center gap-2 text-slate-600">
                          <Loader2 className="w-6 h-6 animate-spin text-sky-700" />
                          <span className="text-xs font-medium">Mengompres foto bukti bayar...</span>
                        </div>
                      ) : proofImageDataUrl ? (
                        <div className="space-y-2.5">
                          <img
                            src={proofImageDataUrl}
                            alt="Pratinjau bukti pembayaran"
                            className="max-h-64 mx-auto rounded-lg border border-slate-200 object-contain bg-white"
                          />
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700">
                            <ImagePlus className="w-4 h-4" />
                            Ketuk untuk mengganti foto bukti
                          </div>
                        </div>
                      ) : (
                        <div className="py-5 flex flex-col items-center gap-1.5 text-slate-600">
                          <Upload className="w-7 h-7 text-sky-700" />
                          <div className="text-sm font-medium text-slate-800">
                            Pilih atau Ambil Foto Bukti Bayar
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Format JPG, PNG, atau WebP (otomatis dikompres agar cepat terkirim)
                          </div>
                        </div>
                      )}
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nama Pengirim / Pemilik Rekening *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={LIMITS.invoice.proofPayerNameMax}
                        value={payerName}
                        onChange={(e) => setPayerName(e.target.value)}
                        placeholder="Contoh: Budi Santoso"
                        className="w-full px-3 min-h-[44px] sm:min-h-[40px] border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-none focus:border-sky-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Metode Pembayaran *
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
                      Catatan Tambahan (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      maxLength={LIMITS.invoice.proofNoteMax}
                      value={proofNote}
                      onChange={(e) => setProofNote(e.target.value)}
                      placeholder="Contoh: Transfer via BCA Mobile pukul 14:20"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-none focus:border-sky-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || compressing || !proofImageDataUrl}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 min-h-[48px] bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white font-semibold text-sm rounded-xl cursor-pointer transition-colors"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Mengirim Bukti Pembayaran...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Kirim Bukti Pembayaran
                      </>
                    )}
                  </button>
                </form>
              </section>
            ) : (
              paymentReq.proofImageDataUrl && (
                <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display font-bold text-base text-slate-900">
                      Bukti Pembayaran Terkirim
                    </h2>
                    <span className="text-xs font-medium text-slate-500">
                      {paymentReq.paymentMethod || 'Transfer'}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <img
                      src={paymentReq.proofImageDataUrl}
                      alt="Bukti pembayaran terkirim"
                      className="max-h-80 mx-auto rounded-lg object-contain bg-white"
                    />
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    {paymentReq.payerName && (
                      <div>
                        Pengirim: <strong className="text-slate-900">{paymentReq.payerName}</strong>
                      </div>
                    )}
                    {paymentReq.submittedAt && (
                      <div>
                        Waktu Unggah:{' '}
                        <strong className="text-slate-900">
                          {new Date(paymentReq.submittedAt).toLocaleString('id-ID')}
                        </strong>
                      </div>
                    )}
                    {paymentReq.proofNote && (
                      <div>
                        Catatan: <span className="text-slate-800">{paymentReq.proofNote}</span>
                      </div>
                    )}
                  </div>
                </section>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
};
