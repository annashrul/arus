import { ClubProfile } from '../types/club';

export interface EmvTag {
  tag: string;
  value: string;
}

/**
 * Computes EMVCo / QRIS CRC-16/CCITT-FALSE checksum (polynomial 0x1021, initial 0xFFFF).
 */
export function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= (input.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Parses an EMVCo QRIS TLV string into ordered tag/value pairs.
 */
export function parseEmvTags(payload: string): EmvTag[] | null {
  const clean = payload.trim();
  if (clean.length < 12) return null;

  const tags: EmvTag[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    if (cursor + 4 > clean.length) return null;
    const tag = clean.slice(cursor, cursor + 2);
    const lenStr = clean.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(lenStr)) return null;
    const len = Number(lenStr);
    if (cursor + 4 + len > clean.length) return null;
    const value = clean.slice(cursor + 4, cursor + 4 + len);
    tags.push({ tag, value });
    cursor += 4 + len;
  }
  return tags;
}

export function serializeEmvTags(tags: EmvTag[]): string {
  return tags
    .map((t) => `${t.tag}${String(t.value.length).padStart(2, '0')}${t.value}`)
    .join('');
}

export function isValidQrisString(payload?: string | null): boolean {
  if (!payload) return false;
  const clean = payload.trim();
  if (clean.length < 24 || clean.length > 512) return false;
  if (!clean.startsWith('000201')) return false;
  const tags = parseEmvTags(clean);
  if (!tags) return false;
  const hasCountryOrCurrency =
    tags.some((t) => t.tag === '53' && t.value === '360') ||
    tags.some((t) => t.tag === '58' && t.value.toUpperCase() === 'ID');
  const hasMerchant = tags.some((t) => {
    const num = Number(t.tag);
    return num >= 26 && num <= 51;
  });
  return hasCountryOrCurrency && hasMerchant;
}

export function extractQrisMerchantInfo(payload?: string | null): {
  merchantName?: string;
  merchantCity?: string;
  isDynamic: boolean;
} {
  if (!payload) return { isDynamic: false };
  const tags = parseEmvTags(payload);
  if (!tags) return { isDynamic: false };
  const pInit = tags.find((t) => t.tag === '01')?.value;
  const merchantName = tags.find((t) => t.tag === '59')?.value;
  const merchantCity = tags.find((t) => t.tag === '60')?.value;
  return {
    merchantName,
    merchantCity,
    isDynamic: pInit === '12',
  };
}

/**
 * Generates an EMVCo-compliant sample static QRIS string for club testing/preview.
 */
export function buildSampleQrisPayload(clubName: string, city: string): string {
  const safeName = (clubName.replace(/[^a-zA-Z0-9 .\-]/g, '').trim() || 'KLUB RENANG').slice(0, 25);
  const safeCity = (city.replace(/[^a-zA-Z0-9 .\-]/g, '').trim() || 'INDONESIA').slice(0, 15);
  const mai26 = serializeEmvTags([
    { tag: '00', value: 'ID.CO.QRIS.WWW' },
    { tag: '01', value: '936009140000123456' },
    { tag: '02', value: 'ID1020304050601' },
    { tag: '03', value: 'UMI' },
  ]);
  const base = serializeEmvTags([
    { tag: '00', value: '01' },
    { tag: '01', value: '11' },
    { tag: '26', value: mai26 },
    { tag: '52', value: '7997' },
    { tag: '53', value: '360' },
    { tag: '58', value: 'ID' },
    { tag: '59', value: safeName },
    { tag: '60', value: safeCity },
  ]);
  const withCrcTag = `${base}6304`;
  return `${withCrcTag}${crc16CcittFalse(withCrcTag)}`;
}

export interface InvoiceQrisResult {
  qrString: string;
  mode: 'dynamic_qris' | 'payment_info';
  merchantName: string;
  merchantCity: string;
}

/**
 * Injects invoice amount (Tag 54) and sets Tag 01=12 (Dynamic QRIS) with fresh CRC-16 checksum
 * when a valid static QRIS string is saved on the club profile.
 * Falls back to a structured payment QR when the club has not configured a merchant QRIS string yet.
 */
export function buildInvoiceQrisData(
  club: ClubProfile,
  invoice: {
    invoiceNumber: string;
    amount: number;
    athleteName: string;
    periodMonth: string;
  }
): InvoiceQrisResult {
  const safeAmount = Math.max(1, Math.round(invoice.amount));
  const raw = club.qrisPayload?.trim() || '';

  if (isValidQrisString(raw)) {
    const parsed = parseEmvTags(raw);
    if (parsed) {
      const info = extractQrisMerchantInfo(raw);
      const filtered = parsed.filter((t) => t.tag !== '63' && t.tag !== '54' && t.tag !== '01');
      const resultTags: EmvTag[] = [];

      // Keep 00 first, then 01=12 (dynamic)
      const tag00 = filtered.find((t) => t.tag === '00') || { tag: '00', value: '01' };
      resultTags.push(tag00);
      resultTags.push({ tag: '01', value: '12' });

      let insertedAmount = false;
      for (const t of filtered) {
        if (t.tag === '00') continue;
        // Insert Tag 54 right after Tag 53 (Currency) or before Tag 58
        if (!insertedAmount && Number(t.tag) > 54) {
          resultTags.push({ tag: '54', value: String(safeAmount) });
          insertedAmount = true;
        }
        resultTags.push(t);
        if (t.tag === '53' && !insertedAmount) {
          resultTags.push({ tag: '54', value: String(safeAmount) });
          insertedAmount = true;
        }
      }
      if (!insertedAmount) {
        resultTags.push({ tag: '54', value: String(safeAmount) });
      }

      const body = `${serializeEmvTags(resultTags)}6304`;
      const dynamicPayload = `${body}${crc16CcittFalse(body)}`;
      return {
        qrString: dynamicPayload,
        mode: 'dynamic_qris',
        merchantName: club.qrisMerchantName?.trim() || info.merchantName || club.name,
        merchantCity: info.merchantCity || club.city,
      };
    }
  }

  // Fallback structured payment QR when merchant QRIS is not configured yet
  const summaryLines = [
    `TAGIHAN RESMI ${club.name.toUpperCase()}`,
    `NO: ${invoice.invoiceNumber}`,
    `ATLET: ${invoice.athleteName}`,
    `PERIODE: ${invoice.periodMonth}`,
    `NOMINAL: IDR ${safeAmount}`,
    club.bankName && club.bankAccountNumber
      ? `TRANSFER: ${club.bankName} ${club.bankAccountNumber} a.n. ${club.bankAccountHolder || club.name}`
      : `KONFIRMASI ADMIN: ${club.phone || club.name}`,
  ];

  return {
    qrString: summaryLines.join('\n'),
    mode: 'payment_info',
    merchantName: club.qrisMerchantName?.trim() || club.name,
    merchantCity: club.city,
  };
}

export interface DecodedQrisImageResult {
  qrString: string;
  merchantName?: string;
  merchantCity?: string;
}

function tryJsQrPass(
  jsQR: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null,
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  targetMaxDim: number,
  highContrast: boolean
): string | null {
  const scale = Math.min(1, targetMaxDim / Math.max(sw, sh));
  const w = Math.max(64, Math.round(sw * scale));
  const h = Math.max(64, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  if (highContrast) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const val = lum < 145 ? 0 : 255;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
      d[i + 3] = 255;
    }
  }

  const decoded = jsQR(imageData.data, w, h);
  return decoded?.data?.trim() || null;
}

/**
 * Reads an uploaded QRIS image (PNG/JPG/WEBP), scans multiple scales/crops via jsQR,
 * and validates that the decoded payload is a valid Indonesian EMVCo QRIS string.
 */
export async function decodeQrisFromImageFile(file: File): Promise<DecodedQrisImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File harus berupa gambar (PNG, JPG, atau WEBP).');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran gambar maksimal 10 MB.');
  }

  const { default: jsQR } = await import('jsqr');
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gambar gagal dimuat. Pastikan file gambar tidak rusak.'));
      el.src = objectUrl;
    });

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) {
      throw new Error('Dimensi gambar tidak valid.');
    }

    // Multiple smart crop/scale passes to handle raw QR crops, mobile screenshots, and full QRIS posters
    const passes: Array<{
      sx: number;
      sy: number;
      sw: number;
      sh: number;
      maxDim: number;
      contrast: boolean;
    }> = [
      { sx: 0, sy: 0, sw: nw, sh: nh, maxDim: 1100, contrast: false },
      { sx: 0, sy: 0, sw: nw, sh: nh, maxDim: 650, contrast: false },
      // Center QR region for standard vertical QRIS posters (header at top, NMID at bottom)
      {
        sx: nw * 0.1,
        sy: nh * 0.15,
        sw: nw * 0.8,
        sh: nh * 0.72,
        maxDim: 800,
        contrast: false,
      },
      {
        sx: nw * 0.12,
        sy: nh * 0.22,
        sw: nw * 0.76,
        sh: nh * 0.62,
        maxDim: 700,
        contrast: true,
      },
      { sx: 0, sy: 0, sw: nw, sh: nh, maxDim: 800, contrast: true },
    ];

    let foundRaw: string | null = null;
    for (const p of passes) {
      const candidate = tryJsQrPass(jsQR, img, p.sx, p.sy, p.sw, p.sh, p.maxDim, p.contrast);
      if (candidate) {
        foundRaw = candidate;
        if (isValidQrisString(candidate)) {
          const info = extractQrisMerchantInfo(candidate);
          return {
            qrString: candidate,
            merchantName: info.merchantName,
            merchantCity: info.merchantCity,
          };
        }
      }
    }

    if (foundRaw) {
      throw new Error(
        'QR Code terbaca, tetapi bukan format QRIS pembayaran Indonesia. Pastikan gambar berasal dari QRIS resmi bank atau e-wallet.'
      );
    }

    throw new Error(
      'QR Code tidak terbaca pada gambar tersebut. Gunakan gambar/screenshot QRIS yang jelas, cukup terang, dan tidak terpotong.'
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
