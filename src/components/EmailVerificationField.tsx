import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Send, ShieldCheck, AlertTriangle } from 'lucide-react';
import { isValidEmailFormat, normalizeEmail, validateEmailField } from '../lib/validation';
import {
  sendEmailOtpServer,
  verifyEmailDomainServer,
  verifyEmailOtpServer,
} from '../lib/emailVerification';

interface EmailVerificationFieldProps {
  label: string;
  email: string;
  onEmailChange: (next: string) => void;
  error?: string;
  onErrorChange: (err: string | undefined) => void;
  maxLength: number;
  placeholder?: string;
  helperText: string;
  fieldLabelForError: string;
  recipientName?: string;
  roleLabel: string;
  clubName: string;
  verifiedEmails: string[];
  onMarkVerified: (email: string) => void;
  onDomainStateChange?: (state: {
    email: string;
    status: 'idle' | 'checking' | 'valid' | 'invalid' | 'unreachable';
    reason?: string;
  }) => void;
}

export const EmailVerificationField: React.FC<EmailVerificationFieldProps> = ({
  label,
  email,
  onEmailChange,
  error,
  onErrorChange,
  maxLength,
  placeholder = 'nama@gmail.com',
  helperText,
  fieldLabelForError,
  recipientName,
  roleLabel,
  clubName,
  verifiedEmails,
  onMarkVerified,
  onDomainStateChange,
}) => {
  const normalized = normalizeEmail(email);
  const isAlreadyVerified = Boolean(normalized && verifiedEmails.includes(normalized));

  const [domainStatus, setDomainStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'unreachable'>('idle');
  const [domainMessage, setDomainMessage] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpPanelOpen, setOtpPanelOpen] = useState(false);
  const [otpTargetEmail, setOtpTargetEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpFeedback, setOtpFeedback] = useState<{
    tone: 'info' | 'warning' | 'success' | 'error';
    text: string;
  } | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => {
      setCooldownSec((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  useEffect(() => {
    // Reset transient domain/OTP UI when user switches to a different email
    if (!normalized) {
      setDomainStatus('idle');
      setDomainMessage(null);
      setSuggestion(null);
      setOtpPanelOpen(false);
      setOtpFeedback(null);
      setOtpCode('');
      onDomainStateChange?.({ email: '', status: 'idle' });
    } else if (otpTargetEmail && otpTargetEmail !== normalized) {
      setOtpPanelOpen(false);
      setOtpCode('');
      setOtpFeedback(null);
    }
  }, [normalized, otpTargetEmail, onDomainStateChange]);

  const runDomainCheck = async (targetRaw: string): Promise<boolean> => {
    const trimmed = targetRaw.trim();
    const syntaxErr = validateEmailField(trimmed, {
      label: fieldLabelForError,
      maxLength,
      required: false,
    });
    if (syntaxErr) {
      onErrorChange(syntaxErr);
      setDomainStatus('invalid');
      setDomainMessage(null);
      setSuggestion(null);
      onDomainStateChange?.({ email: normalizeEmail(trimmed), status: 'invalid', reason: syntaxErr });
      return false;
    }
    if (!trimmed) {
      setDomainStatus('idle');
      setDomainMessage(null);
      setSuggestion(null);
      onDomainStateChange?.({ email: '', status: 'idle' });
      return true;
    }

    setDomainStatus('checking');
    setDomainMessage(null);
    setSuggestion(null);
    onDomainStateChange?.({ email: normalizeEmail(trimmed), status: 'checking' });

    const res = await verifyEmailDomainServer(trimmed);
    if (res.unreachable) {
      setDomainStatus('unreachable');
      setDomainMessage(null);
      onDomainStateChange?.({ email: normalizeEmail(trimmed), status: 'unreachable' });
      return true;
    }
    if (!res.valid) {
      const msg = res.reason || 'Domain email tidak ditemukan atau tidak menerima email.';
      setDomainStatus('invalid');
      setDomainMessage(msg);
      setSuggestion(res.suggestion || null);
      onErrorChange(msg);
      onDomainStateChange?.({ email: normalizeEmail(trimmed), status: 'invalid', reason: msg });
      return false;
    }

    setDomainStatus('valid');
    setDomainMessage(`Domain ${res.domain} aktif (server email terdeteksi).`);
    setSuggestion(null);
    onErrorChange(undefined);
    onDomainStateChange?.({ email: normalizeEmail(trimmed), status: 'valid' });
    return true;
  };

  const handleSendOtp = async () => {
    const trimmed = email.trim();
    const syntaxErr = validateEmailField(trimmed, {
      label: fieldLabelForError,
      maxLength,
      required: true,
    });
    if (syntaxErr) {
      onErrorChange(syntaxErr);
      return;
    }

    setSendingOtp(true);
    setOtpFeedback(null);
    try {
      const res = await sendEmailOtpServer({
        email: trimmed,
        recipientName,
        roleLabel,
        clubName,
      });

      if (res.ok) {
        setDomainStatus('valid');
        setDomainMessage(null);
        setSuggestion(null);
        onErrorChange(undefined);
        setOtpTargetEmail(normalizeEmail(trimmed));
        setOtpPanelOpen(true);
        setOtpCode('');
        setCooldownSec(res.cooldownSeconds || 60);
        setOtpFeedback({
          tone: 'info',
          text: `Kode OTP 6 digit telah dikirim ke ${normalizeEmail(trimmed)}. Berlaku 10 menit.`,
        });
        onDomainStateChange?.({ email: normalizeEmail(trimmed), status: 'valid' });
        return;
      }

      if (res.code === 'INVALID_EMAIL_DOMAIN') {
        const msg = res.message || 'Domain email tidak valid.';
        setDomainStatus('invalid');
        setDomainMessage(msg);
        setSuggestion(res.suggestion || null);
        onErrorChange(msg);
        onDomainStateChange?.({ email: normalizeEmail(trimmed), status: 'invalid', reason: msg });
        return;
      }

      if (res.code === 'OTP_PROVIDER_NOT_CONFIGURED') {
        setDomainStatus('valid');
        setSuggestion(null);
        onErrorChange(undefined);
        onDomainStateChange?.({ email: normalizeEmail(trimmed), status: 'valid' });
        setOtpFeedback({
          tone: 'warning',
          text:
            res.message ||
            'Domain email aktif (MX valid), namun pengiriman OTP email belum aktif karena kredensial SMTP / Resend belum diatur di Secrets server.',
        });
        return;
      }

      if (res.code === 'OTP_COOLDOWN' && res.waitSeconds) {
        setCooldownSec(res.waitSeconds);
        setOtpTargetEmail(normalizeEmail(trimmed));
        setOtpPanelOpen(true);
      }

      setOtpFeedback({
        tone: 'error',
        text: res.message || 'Gagal mengirim OTP email.',
      });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const trimmedEmail = email.trim();
    const cleanCode = otpCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setOtpFeedback({
        tone: 'error',
        text: 'Masukkan 6 digit angka kode OTP dari kotak masuk email.',
      });
      return;
    }

    setVerifyingOtp(true);
    try {
      const res = await verifyEmailOtpServer({
        email: trimmedEmail,
        code: cleanCode,
      });
      if (res.ok && res.verified) {
        onMarkVerified(normalizeEmail(trimmedEmail));
        setOtpPanelOpen(false);
        setOtpCode('');
        onErrorChange(undefined);
        setOtpFeedback({
          tone: 'success',
          text: `Email ${normalizeEmail(trimmedEmail)} berhasil diverifikasi via OTP.`,
        });
      } else {
        setOtpFeedback({
          tone: 'error',
          text: res.message || 'Kode OTP tidak valid.',
        });
      }
    } finally {
      setVerifyingOtp(false);
    }
  };

  const formatLooksValid = Boolean(email.trim()) && isValidEmailFormat(email.trim()) && email.trim().length <= maxLength;

  return (
    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-slate-800">{label}</label>
        {isAlreadyVerified && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            Terverifikasi OTP
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="email"
            maxLength={maxLength}
            value={email}
            aria-invalid={Boolean(error)}
            onChange={(e) => {
              const next = e.target.value;
              onEmailChange(next);
              setDomainStatus('idle');
              setDomainMessage(null);
              setSuggestion(null);
              if (error) {
                const err = validateEmailField(next, {
                  label: fieldLabelForError,
                  maxLength,
                  required: false,
                });
                onErrorChange(err);
              } else {
                onErrorChange(undefined);
              }
            }}
            onBlur={() => {
              const trimmed = email.trim();
              if (trimmed !== email) onEmailChange(trimmed);
              void runDomainCheck(trimmed);
            }}
            placeholder={placeholder}
            className={`w-full pl-9 pr-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm bg-white border rounded-lg ${
              error ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
            }`}
          />
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void runDomainCheck(email)}
            disabled={!email.trim() || domainStatus === 'checking'}
            className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] sm:min-h-[38px] text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {domainStatus === 'checking' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>Cek Email</span>
          </button>

          <button
            type="button"
            onClick={handleSendOtp}
            disabled={!formatLooksValid || sendingOtp || cooldownSec > 0 || isAlreadyVerified}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[38px] text-xs font-semibold rounded-lg border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {sendingOtp ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isAlreadyVerified ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>
              {isAlreadyVerified
                ? 'Terverifikasi'
                : cooldownSec > 0
                ? `Ulang (${cooldownSec}d)`
                : 'Kirim OTP'}
            </span>
          </button>
        </div>
      </div>

      {suggestion && (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
          <span>
            Gunakan <strong className="font-mono-tabular">{suggestion}</strong>?
          </span>
          <button
            type="button"
            onClick={() => {
              onEmailChange(suggestion);
              setSuggestion(null);
              void runDomainCheck(suggestion);
            }}
            className="px-2.5 py-1 text-[11px] font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-md cursor-pointer shrink-0"
          >
            Perbaiki Otomatis
          </button>
        </div>
      )}

      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : domainStatus === 'checking' ? (
        <p className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Memeriksa keaktifan domain & server email (MX)...
        </p>
      ) : domainStatus === 'valid' && domainMessage ? (
        <p className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{domainMessage}</span>
        </p>
      ) : formatLooksValid ? (
        <p className="text-[11px] text-emerald-700">
          Format email valid — klik "Kirim OTP" untuk verifikasi kepemilikan kotak masuk atau simpan langsung.
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">{helperText}</p>
      )}

      {otpFeedback && (
        <div
          className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
            otpFeedback.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : otpFeedback.tone === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : otpFeedback.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          {otpFeedback.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
          ) : otpFeedback.tone === 'warning' || otpFeedback.tone === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <Mail className="w-4 h-4 shrink-0 mt-0.5 text-sky-700" />
          )}
          <span>{otpFeedback.text}</span>
        </div>
      )}

      {otpPanelOpen && !isAlreadyVerified && (
        <div className="p-3 rounded-lg border border-sky-200 bg-sky-50/60 space-y-2">
          <label className="block text-[11px] font-semibold text-slate-700">
            Masukkan Kode OTP 6 Digit ({otpTargetEmail})
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="flex-1 px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular tracking-widest border border-slate-300 bg-white rounded-lg"
            />
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={otpCode.length !== 6 || verifyingOtp}
              className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] sm:min-h-[38px] text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer shrink-0"
            >
              {verifyingOtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verifikasi'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
