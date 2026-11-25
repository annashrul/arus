import { auth } from './firebase';

export interface EmailCapabilities {
  dnsCheckAvailable: boolean;
  otpDeliveryAvailable: boolean;
  provider: 'resend' | 'smtp' | null;
}

export interface EmailDomainVerificationResult {
  valid: boolean;
  mxValid: boolean;
  domain: string;
  providerAvailable?: boolean;
  suggestion?: string;
  reason?: string;
  unreachable?: boolean;
}

export interface SendEmailOtpResult {
  ok: boolean;
  code?: 'OTP_PROVIDER_NOT_CONFIGURED' | 'INVALID_EMAIL_DOMAIN' | 'OTP_COOLDOWN' | 'OTP_RATE_LIMITED' | 'OTP_DELIVERY_FAILED' | 'NETWORK_ERROR';
  mxValid?: boolean;
  provider?: 'resend' | 'smtp';
  expiresInSeconds?: number;
  cooldownSeconds?: number;
  waitSeconds?: number;
  suggestion?: string;
  message?: string;
}

export interface VerifyEmailOtpResult {
  ok: boolean;
  verified?: boolean;
  email?: string;
  verifiedAt?: string;
  message?: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchEmailCapabilities(): Promise<EmailCapabilities> {
  try {
    const headers = await getAuthHeaders();
    const resp = await fetch('/api/email/capabilities', { headers });
    if (!resp.ok) {
      return { dnsCheckAvailable: false, otpDeliveryAvailable: false, provider: null };
    }
    return (await resp.json()) as EmailCapabilities;
  } catch {
    return { dnsCheckAvailable: false, otpDeliveryAvailable: false, provider: null };
  }
}

export async function verifyEmailDomainServer(email: string): Promise<EmailDomainVerificationResult> {
  try {
    const headers = await getAuthHeaders();
    const resp = await fetch('/api/email/verify-domain', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    });
    if (!resp.ok) {
      return {
        valid: false,
        mxValid: false,
        domain: '',
        unreachable: true,
        reason: 'Layanan pengecekan domain sedang tidak terjangkau.',
      };
    }
    return (await resp.json()) as EmailDomainVerificationResult;
  } catch {
    return {
      valid: false,
      mxValid: false,
      domain: '',
      unreachable: true,
      reason: 'Tidak dapat menghubungi server validasi domain.',
    };
  }
}

export async function sendEmailOtpServer(params: {
  email: string;
  recipientName?: string;
  roleLabel?: string;
  clubName?: string;
}): Promise<SendEmailOtpResult> {
  try {
    const headers = await getAuthHeaders();
    const resp = await fetch('/api/email/send-otp', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    const data = (await resp.json().catch(() => ({}))) as SendEmailOtpResult;
    return {
      ...data,
      ok: resp.ok && Boolean(data.ok),
    };
  } catch {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Gagal menghubungi server untuk mengirim OTP email.',
    };
  }
}

export async function verifyEmailOtpServer(params: {
  email: string;
  code: string;
}): Promise<VerifyEmailOtpResult> {
  try {
    const headers = await getAuthHeaders();
    const resp = await fetch('/api/email/verify-otp', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    const data = (await resp.json().catch(() => ({}))) as VerifyEmailOtpResult;
    return {
      ...data,
      ok: resp.ok && Boolean(data.ok),
    };
  } catch {
    return {
      ok: false,
      message: 'Gagal menghubungi server untuk memverifikasi kode OTP.',
    };
  }
}
