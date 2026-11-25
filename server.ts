import 'dotenv/config';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Load Firebase projectId from firebase-applet-config.json
interface FirebaseAppletConfig {
  projectId?: string;
}

const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID || '';
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8')) as FirebaseAppletConfig;
    if (parsed.projectId) {
      firebaseProjectId = parsed.projectId;
    }
  } catch (err) {
    console.error('Failed to read firebase-applet-config.json:', err);
  }
}

// Ephemeral HMAC key fallback when OTP_SECRET is not provided in env
const OTP_HMAC_SECRET = process.env.OTP_SECRET || crypto.randomBytes(32).toString('hex');

// Google Firebase Auth public X.509 certificate cache
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && now < certCache.expiresAt) {
    return certCache.certs;
  }
  const resp = await fetch(FIREBASE_CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Firebase public certificates (${resp.status})`);
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  certCache = {
    certs,
    expiresAt: now + Math.max(60, maxAgeSec) * 1000,
  };
  return certs;
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

interface AuthenticatedRequest extends Request {
  authUser?: VerifiedFirebaseUser;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const raw = Buffer.from(normalized + pad, 'base64').toString('utf8');
  return JSON.parse(raw) as T;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  if (!firebaseProjectId) {
    throw new Error('Firebase projectId is not configured on server.');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format.');
  }
  const [headerSeg, payloadSeg, sigSeg] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerSeg);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token header.');
  }

  const certs = await getFirebasePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Matching Firebase signing certificate not found.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerSeg}.${payloadSeg}`);
  verifier.end();
  const sigNormalized = sigSeg.replace(/-/g, '+').replace(/_/g, '/');
  const sigPad = sigNormalized.length % 4 === 0 ? '' : '='.repeat(4 - (sigNormalized.length % 4));
  const signatureBuf = Buffer.from(sigNormalized + sigPad, 'base64');

  if (!verifier.verify(certPem, signatureBuf)) {
    throw new Error('Token signature verification failed.');
  }

  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
  }>(payloadSeg);

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== firebaseProjectId) {
    throw new Error('Token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`) {
    throw new Error('Token issuer mismatch.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Invalid token subject.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Token expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Token issued-at invalid.');
  }
  if (!payload.email_verified) {
    throw new Error('User email is not verified.');
  }

  return {
    uid: payload.sub,
    email: String(payload.email || '').toLowerCase(),
    emailVerified: true,
  };
}

async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, message: 'Autentikasi diperlukan.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ ok: false, message: 'Token autentikasi kosong.' });
    return;
  }
  try {
    req.authUser = await verifyFirebaseIdToken(token);
    next();
  } catch {
    res.status(401).json({ ok: false, message: 'Sesi login tidak valid atau kedaluwarsa.' });
  }
}

// =========================================================
// EMAIL VALIDATION, DNS MX LOOKUP & TYPO DETECTION
// =========================================================

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  '10minutemail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
]);

const DOMAIN_TYPO_MAP: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'iclod.com': 'icloud.com',
  'icoud.com': 'icloud.com',
};

function isStrictEmailSyntaxValid(email: string): boolean {
  if (!email || email.length > 100 || /\s/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (
    !local ||
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
  ) {
    return false;
  }
  if (
    !domain ||
    domain.length > 253 ||
    domain.startsWith('.') ||
    domain.endsWith('.') ||
    domain.includes('..')
  ) {
    return false;
  }
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (!/^[a-zA-Z]{2,24}$/.test(tld)) return false;
  return labels.every((lbl) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(lbl));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface DomainValidationResult {
  valid: boolean;
  mxValid: boolean;
  domain: string;
  suggestion?: string;
  reason?: string;
}

async function validateEmailDomain(rawEmail: string): Promise<DomainValidationResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!isStrictEmailSyntaxValid(email)) {
    return {
      valid: false,
      mxValid: false,
      domain: '',
      reason: 'Format email tidak sesuai standar (contoh: nama@domain.com).',
    };
  }

  const [local, domain] = email.split('@');
  const typoTarget = DOMAIN_TYPO_MAP[domain];
  if (typoTarget) {
    return {
      valid: false,
      mxValid: false,
      domain,
      suggestion: `${local}@${typoTarget}`,
      reason: `Domain "${domain}" kemungkinan salah ketik. Apakah maksud Anda ${local}@${typoTarget}?`,
    };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: false,
      mxValid: false,
      domain,
      reason: `Domain email sementara (${domain}) tidak diperbolehkan. Gunakan email aktif permanen.`,
    };
  }

  try {
    const mxRecords = await withTimeout(dns.resolveMx(domain), 4000, 'DNS MX');
    const usableMx = mxRecords.filter((rec) => rec.exchange && rec.exchange.trim() !== '.');
    if (usableMx.length > 0) {
      return { valid: true, mxValid: true, domain };
    }
    return {
      valid: false,
      mxValid: false,
      domain,
      reason: `Domain "${domain}" tidak menerima email (null MX record).`,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENODATA') {
      // RFC 5321 allows fallback to A/AAAA if no MX record exists
      try {
        const aRecords = await withTimeout(dns.resolve4(domain), 3000, 'DNS A');
        if (aRecords.length > 0) {
          return { valid: true, mxValid: true, domain };
        }
      } catch {
        // Fall through to failure
      }
    }
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'EREFUSED') {
      return {
        valid: false,
        mxValid: false,
        domain,
        reason: `Domain "${domain}" tidak ditemukan atau tidak memiliki server penerima email (MX).`,
      };
    }
    return {
      valid: false,
      mxValid: false,
      domain,
      reason: `Gagal memverifikasi server email untuk domain "${domain}". Periksa penulisan domain.`,
    };
  }
}

// =========================================================
// REAL OTP EMAIL DELIVERY (RESEND API OR SMTP)
// =========================================================

type MailProvider = 'resend' | 'smtp' | null;

function getMailProvider(): MailProvider {
  if (process.env.RESEND_API_KEY?.trim()) {
    return 'resend';
  }
  if (
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASS?.trim()
  ) {
    return 'smtp';
  }
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendOtpEmail(params: {
  to: string;
  otp: string;
  recipientName: string;
  roleLabel: string;
  clubName: string;
}): Promise<MailProvider> {
  const provider = getMailProvider();
  if (!provider) {
    throw new Error('OTP_PROVIDER_NOT_CONFIGURED');
  }

  const safeName = escapeHtml(params.recipientName || 'Bapak/Ibu');
  const safeRole = escapeHtml(params.roleLabel || 'Anggota Klub');
  const safeClub = escapeHtml(params.clubName || 'Tirta Aquatics');
  const safeOtp = escapeHtml(params.otp);
  const subject = `[${params.clubName || 'Tirta Aquatics'}] Kode OTP Verifikasi Email (${params.otp})`;

  const textBody = [
    `Halo ${params.recipientName || 'Bapak/Ibu'},`,
    '',
    `Kode OTP verifikasi email Anda untuk akses ${params.roleLabel || 'Anggota Klub'} di ${params.clubName || 'Tirta Aquatics'} adalah:`,
    '',
    `    ${params.otp}`,
    '',
    'Kode ini berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun di luar pengurus klub resmi.',
  ].join('\n');

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 12px;">
      <p style="font-size: 14px; margin: 0 0 12px;">Halo <strong>${safeName}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px; color: #334155;">
        Berikut adalah kode OTP untuk memverifikasi alamat email <strong>${safeRole}</strong> pada klub renang <strong>${safeClub}</strong>:
      </p>
      <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0369a1;">${safeOtp}</span>
      </div>
      <p style="font-size: 12px; color: #64748b; margin: 0;">
        Kode berlaku selama <strong>10 menit</strong>. Abaikan email ini jika Anda tidak merasa mendaftarkan alamat email ini.
      </p>
    </div>
  `;

  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY!.trim();
    const from = process.env.OTP_FROM_EMAIL?.trim() || 'Tirta Aquatics <onboarding@resend.dev>';
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Resend API error (${resp.status}): ${errText.slice(0, 200)}`);
    }
    return 'resend';
  }

  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
  });

  const from = process.env.OTP_FROM_EMAIL?.trim() || process.env.SMTP_USER!.trim();
  await transporter.sendMail({
    from,
    to: params.to,
    subject,
    text: textBody,
    html: htmlBody,
  });

  return 'smtp';
}

// =========================================================
// IN-MEMORY OTP CHALLENGES & RATE LIMITING
// =========================================================

interface OtpChallenge {
  hash: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpChallenge>();
const sendRateStore = new Map<string, number[]>();

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const SEND_MAX_PER_WINDOW = 8;

function hashOtp(uid: string, email: string, otp: string): string {
  return crypto
    .createHmac('sha256', OTP_HMAC_SECRET)
    .update(`${uid}:${email}:${otp}`)
    .digest('hex');
}

function pruneExpiredOtpData(): void {
  const now = Date.now();
  for (const [k, v] of otpStore.entries()) {
    if (now > v.expiresAt) otpStore.delete(k);
  }
  for (const [uid, timestamps] of sendRateStore.entries()) {
    const recent = timestamps.filter((t) => now - t < SEND_WINDOW_MS);
    if (recent.length === 0) sendRateStore.delete(uid);
    else sendRateStore.set(uid, recent);
  }
}

// =========================================================
// EXPRESS APP & ROUTES
// =========================================================

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/email/capabilities', requireFirebaseAuth, (_req: Request, res: Response) => {
    const provider = getMailProvider();
    res.json({
      dnsCheckAvailable: true,
      otpDeliveryAvailable: provider !== null,
      provider,
    });
  });

  app.post('/api/email/verify-domain', requireFirebaseAuth, async (req: Request, res: Response) => {
    const emailRaw = req.body?.email;
    if (typeof emailRaw !== 'string') {
      res.status(400).json({ ok: false, message: 'Parameter email harus berupa teks.' });
      return;
    }
    const result = await validateEmailDomain(emailRaw);
    res.json({
      ...result,
      providerAvailable: getMailProvider() !== null,
    });
  });

  app.post('/api/email/send-otp', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
    pruneExpiredOtpData();
    const uid = req.authUser?.uid;
    if (!uid) {
      res.status(401).json({ ok: false, message: 'Autentikasi tidak valid.' });
      return;
    }

    const emailRaw = req.body?.email;
    const recipientNameRaw = typeof req.body?.recipientName === 'string' ? req.body.recipientName : '';
    const roleLabelRaw = typeof req.body?.roleLabel === 'string' ? req.body.roleLabel : '';
    const clubNameRaw = typeof req.body?.clubName === 'string' ? req.body.clubName : '';

    if (typeof emailRaw !== 'string') {
      res.status(400).json({ ok: false, message: 'Parameter email wajib berupa teks.' });
      return;
    }

    const email = emailRaw.trim().toLowerCase();
    const domainResult = await validateEmailDomain(email);
    if (!domainResult.valid) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_EMAIL_DOMAIN',
        mxValid: false,
        suggestion: domainResult.suggestion,
        message: domainResult.reason || 'Email atau domain tidak valid.',
      });
      return;
    }

    const provider = getMailProvider();
    if (!provider) {
      res.status(503).json({
        ok: false,
        code: 'OTP_PROVIDER_NOT_CONFIGURED',
        mxValid: true,
        message:
          'Domain email aktif (MX valid), namun pengiriman OTP email belum aktif karena kredensial SMTP / Resend belum diatur di Secrets server.',
      });
      return;
    }

    const now = Date.now();
    const key = `${uid}:${email}`;
    const existing = otpStore.get(key);
    if (existing && now - existing.lastSentAt < OTP_COOLDOWN_MS) {
      const waitSec = Math.ceil((OTP_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
      res.status(429).json({
        ok: false,
        code: 'OTP_COOLDOWN',
        waitSeconds: waitSec,
        message: `Tunggu ${waitSec} detik sebelum mengirim ulang OTP ke email ini.`,
      });
      return;
    }

    const userHistory = (sendRateStore.get(uid) || []).filter((t) => now - t < SEND_WINDOW_MS);
    if (userHistory.length >= SEND_MAX_PER_WINDOW) {
      res.status(429).json({
        ok: false,
        code: 'OTP_RATE_LIMITED',
        message: 'Batas pengiriman OTP tercapai. Coba lagi beberapa menit lagi.',
      });
      return;
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    try {
      await sendOtpEmail({
        to: email,
        otp,
        recipientName: recipientNameRaw.trim().slice(0, 80),
        roleLabel: roleLabelRaw.trim().slice(0, 40),
        clubName: clubNameRaw.trim().slice(0, 80),
      });
    } catch (err) {
      console.error('Failed to send OTP email:', err instanceof Error ? err.message : err);
      res.status(502).json({
        ok: false,
        code: 'OTP_DELIVERY_FAILED',
        mxValid: true,
        message: 'Gagal mengirim email OTP melalui provider email. Periksa konfigurasi SMTP / Resend.',
      });
      return;
    }

    otpStore.set(key, {
      hash: hashOtp(uid, email, otp),
      expiresAt: now + OTP_TTL_MS,
      lastSentAt: now,
      attempts: 0,
    });
    sendRateStore.set(uid, [...userHistory, now]);

    res.json({
      ok: true,
      mxValid: true,
      provider,
      expiresInSeconds: OTP_TTL_MS / 1000,
      cooldownSeconds: OTP_COOLDOWN_MS / 1000,
    });
  });

  app.post('/api/email/verify-otp', requireFirebaseAuth, (req: AuthenticatedRequest, res: Response) => {
    pruneExpiredOtpData();
    const uid = req.authUser?.uid;
    if (!uid) {
      res.status(401).json({ ok: false, message: 'Autentikasi tidak valid.' });
      return;
    }

    const emailRaw = req.body?.email;
    const codeRaw = req.body?.code;
    if (typeof emailRaw !== 'string' || typeof codeRaw !== 'string') {
      res.status(400).json({ ok: false, message: 'Email dan kode OTP wajib diisi.' });
      return;
    }

    const email = emailRaw.trim().toLowerCase();
    const code = codeRaw.trim();
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ ok: false, message: 'Kode OTP harus terdiri dari 6 digit angka.' });
      return;
    }

    const key = `${uid}:${email}`;
    const challenge = otpStore.get(key);
    if (!challenge) {
      res.status(400).json({
        ok: false,
        message: 'Kode OTP tidak ditemukan atau sudah kedaluwarsa. Silakan kirim ulang OTP.',
      });
      return;
    }

    if (Date.now() > challenge.expiresAt) {
      otpStore.delete(key);
      res.status(400).json({
        ok: false,
        message: 'Kode OTP sudah kedaluwarsa (melebihi 10 menit). Silakan kirim ulang OTP.',
      });
      return;
    }

    if (challenge.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      otpStore.delete(key);
      res.status(429).json({
        ok: false,
        message: 'Terlalu banyak percobaan OTP salah. Silakan kirim ulang kode baru.',
      });
      return;
    }

    const expectedBuf = Buffer.from(challenge.hash, 'hex');
    const actualBuf = Buffer.from(hashOtp(uid, email, code), 'hex');
    const isMatch =
      expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!isMatch) {
      challenge.attempts += 1;
      const remaining = OTP_MAX_VERIFY_ATTEMPTS - challenge.attempts;
      if (remaining <= 0) {
        otpStore.delete(key);
        res.status(400).json({
          ok: false,
          message: 'Kode OTP salah terlalu banyak kali. Silakan kirim ulang kode OTP baru.',
        });
        return;
      }
      res.status(400).json({
        ok: false,
        message: `Kode OTP tidak sesuai. Sisa percobaan: ${remaining} kali.`,
      });
      return;
    }

    otpStore.delete(key);
    res.json({
      ok: true,
      verified: true,
      email,
      verifiedAt: new Date().toISOString(),
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (prod=${IS_PROD})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
