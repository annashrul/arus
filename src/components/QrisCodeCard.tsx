import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, QrCode, Settings2 } from 'lucide-react';
import { ClubProfile, formatRupiah } from '../types/club';
import { buildInvoiceQrisData } from '../lib/qris';

interface QrisCodeCardProps {
  club: ClubProfile;
  invoiceNumber: string;
  amount: number;
  athleteName: string;
  periodMonth: string;
  compact?: boolean;
  onOpenQrisSettings?: () => void;
}

export const QrisCodeCard: React.FC<QrisCodeCardProps> = ({
  club,
  invoiceNumber,
  amount,
  athleteName,
  periodMonth,
  compact = false,
  onOpenQrisSettings,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedPayload, setCopiedPayload] = useState(false);

  const qrisInfo = useMemo(
    () =>
      buildInvoiceQrisData(club, {
        invoiceNumber,
        amount,
        athleteName,
        periodMonth,
      }),
    [club, invoiceNumber, amount, athleteName, periodMonth]
  );

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrisInfo.qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: compact ? 180 : 240,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [qrisInfo.qrString, compact]);

  const handleDownloadQrPng = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `QRIS-${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(qrisInfo.qrString);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const isDynamicQris = qrisInfo.mode === 'dynamic_qris';

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 flex flex-col sm:flex-row items-center gap-4">
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 shrink-0 flex flex-col items-center">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR Pembayaran ${invoiceNumber}`}
            referrerPolicy="no-referrer"
            className={`${compact ? 'w-32 h-32' : 'w-40 h-40'} object-contain block`}
          />
        ) : (
          <div className="w-36 h-36 flex items-center justify-center text-slate-400">
            <QrCode className="w-8 h-8" />
          </div>
        )}
        <div className="mt-1.5 text-[10px] font-mono-tabular font-semibold tracking-wider text-slate-700">
          {isDynamicQris ? 'QRIS DINAMIS (EMVCo)' : 'QR INFO TAGIHAN'}
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
        <div>
          <div className="text-xs font-semibold text-slate-900">
            {isDynamicQris
              ? `Scan QRIS — ${qrisInfo.merchantName}`
              : 'QR Ringkasan Tagihan Klub'}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {isDynamicQris
              ? `Nominal ${formatRupiah(amount)} sudah tertanam otomatis di QRIS. Scan melalui aplikasi m-Banking atau e-Wallet apa saja.`
              : `Kode QR berisi rincian tagihan & nomor rekening ${club.name}. Untuk QRIS otomatis m-Banking/e-Wallet, unggah gambar QRIS klub di menu Profil & Rekening.`}
          </p>
        </div>

        <div className="text-xs font-mono-tabular text-slate-700">
          Nominal: <span className="font-bold text-slate-900">{formatRupiah(amount)}</span>
          <span className="text-slate-400 mx-1.5">·</span>
          <span>{qrisInfo.merchantCity}</span>
        </div>

        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 no-print">
          <button
            type="button"
            onClick={handleDownloadQrPng}
            disabled={!qrDataUrl}
            className="inline-flex items-center gap-1.5 px-3 min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh QR PNG
          </button>
          <button
            type="button"
            onClick={handleCopyPayload}
            className="inline-flex items-center gap-1.5 px-3 min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            {copiedPayload ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Salin Kode QR
              </>
            )}
          </button>
          {!isDynamicQris && onOpenQrisSettings && (
            <button
              type="button"
              onClick={onOpenQrisSettings}
              className="inline-flex items-center gap-1.5 px-3 min-h-[36px] text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Atur QRIS Klub
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
