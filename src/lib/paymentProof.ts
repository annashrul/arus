export const PAYMENT_TOKEN_REGEX = /^[a-zA-Z0-9_-]{24,64}$/;

export function isValidPaymentTokenFormat(token: string | null | undefined): token is string {
  return typeof token === 'string' && PAYMENT_TOKEN_REGEX.test(token);
}

export function generatePaymentToken(length = 28): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const targetLen = Math.max(24, Math.min(64, length));
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(targetLen);
    window.crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < targetLen; i += 1) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }
  let fallback = '';
  for (let i = 0; i < targetLen; i += 1) {
    fallback += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return fallback;
}

export function buildPaymentPortalUrl(token: string): string {
  if (!isValidPaymentTokenFormat(token) || typeof window === 'undefined') return '';
  return `${window.location.origin}/?bayar=${encodeURIComponent(token)}`;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_RAW_FILE_BYTES = 12 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 185000;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('File gambar tidak dapat dibaca atau rusak.'));
    };
    img.src = url;
  });
}

function renderCompressedJpeg(img: HTMLImageElement, maxDim: number, quality: number): string {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) {
    throw new Error('Dimensi gambar bukti pembayaran tidak valid.');
  }

  const ratio = Math.min(1, maxDim / Math.max(srcW, srcH));
  const targetW = Math.max(1, Math.round(srcW * ratio));
  const targetH = Math.max(1, Math.round(srcH * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser tidak mendukung pemrosesan gambar kanvas.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Validates and compresses a parent/admin payment proof image client-side into a JPEG data URL
 * strictly bounded under 185KB so it safely fits Firestore document validation limits (200KB).
 */
export async function compressPaymentProofImage(file: File): Promise<string> {
  if (!file) {
    throw new Error('Pilih file gambar bukti pembayaran terlebih dahulu.');
  }
  const normalizedType = file.type.toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(normalizedType)) {
    throw new Error('Format gambar harus JPG, PNG, atau WebP.');
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('Ukuran file gambar terlalu besar (maksimal 12 MB sebelum kompresi).');
  }

  const img = await loadImageFromFile(file);
  const attempts: Array<{ maxDim: number; quality: number }> = [
    { maxDim: 960, quality: 0.76 },
    { maxDim: 960, quality: 0.62 },
    { maxDim: 800, quality: 0.54 },
    { maxDim: 680, quality: 0.45 },
    { maxDim: 560, quality: 0.38 },
  ];

  for (const attempt of attempts) {
    const dataUrl = renderCompressedJpeg(img, attempt.maxDim, attempt.quality);
    if (
      dataUrl.length <= MAX_DATA_URL_LENGTH &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)
    ) {
      return dataUrl;
    }
  }

  throw new Error('Resolusi atau detail foto terlalu besar. Coba unggah screenshot atau foto yang lebih ringan.');
}
