import { ClubProfile, formatDateID, formatRupiah } from '../types/club';

/**
 * Normalizes an Indonesian or international phone number into WhatsApp wa.me digits (e.g., 62812...).
 * Returns null if the number does not contain enough valid digits.
 */
export function normalizeWhatsAppNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 16) return null;

  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8') && digits.length >= 9 && digits.length <= 13) {
    return `62${digits}`;
  }
  return digits;
}

/**
 * Formats normalized digits back to readable international display (+62 ...).
 */
export function formatWhatsAppDisplay(phone?: string | null): string {
  const norm = normalizeWhatsAppNumber(phone);
  if (!norm) return 'Belum diisi';
  return `+${norm}`;
}

/**
 * Builds a wa.me deep link that works safely in standard <a target="_blank"> links without window.open.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string {
  const normalized = normalizeWhatsAppNumber(phone);
  const encoded = encodeURIComponent(message);
  return normalized ? `https://wa.me/${normalized}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export interface InvoiceMessageInput {
  invoiceNumber: string;
  athleteName: string;
  parentName?: string;
  description: string;
  periodMonth: string;
  amount: number;
  dueDate: string;
  status: string;
  paymentPortalUrl?: string;
}

export function buildInvoiceNotificationMessage(
  club: ClubProfile,
  inv: InvoiceMessageInput
): string {
  const hasBank = Boolean(club.bankName && club.bankAccountNumber);
  const hasQris = Boolean(club.qrisPayload && club.qrisPayload.trim().length > 20);

  const lines = [
    `Yth. Bapak/Ibu ${inv.parentName?.trim() || 'Wali Atlet'} (${inv.athleteName}),`,
    ``,
    `Berikut informasi tagihan resmi dari *${club.name}*:`,
    `• No. Invoice: ${inv.invoiceNumber}`,
    `• Periode: ${inv.periodMonth}`,
    `• Rincian: ${inv.description}`,
    `• Nominal: *${formatRupiah(inv.amount)}*`,
    `• Jatuh Tempo: ${formatDateID(inv.dueDate)}`,
    `• Status: ${inv.status}`,
  ];

  if (hasBank || hasQris) {
    lines.push(``);
    lines.push(`*Metode Pembayaran:*`);
    if (hasBank) {
      lines.push(
        `• Transfer ${club.bankName}: No. Rek ${club.bankAccountNumber} a.n. ${club.bankAccountHolder || club.name}`
      );
    }
    if (hasQris) {
      lines.push(
        `• QRIS ${club.qrisMerchantName || club.name} tersedia pada tautan pembayaran (nominal otomatis ${formatRupiah(inv.amount)}).`
      );
    }
  }

  if (inv.paymentPortalUrl) {
    lines.push(``);
    lines.push(`*Tautan QRIS & Unggah Bukti Bayar:*`);
    lines.push(inv.paymentPortalUrl);
    lines.push(`Silakan buka tautan di atas untuk membayar & mengunggah foto bukti transfer agar terdeteksi otomatis oleh admin.`);
  } else {
    lines.push(``);
    lines.push(`Mohon konfirmasi bukti pembayaran kepada admin klub setelah transaksi. Terima kasih.`);
  }

  return lines.join('\n');
}

export interface ScheduleMessageInput {
  title: string;
  sessionType: string;
  ageGroup: string;
  dayOfWeek: string;
  sessionDate?: string;
  startTime: string;
  endTime: string;
  poolLocation: string;
  laneInfo?: string;
  coachName: string;
  targetDistanceMeters: number;
  notes?: string;
}

export function buildScheduleNotificationMessage(
  club: ClubProfile,
  schedule: ScheduleMessageInput,
  options?: { isUpdated?: boolean; parentName?: string; athleteName?: string }
): string {
  const isUpdated = options?.isUpdated ?? true;
  const greeting = options?.athleteName
    ? `Yth. Bapak/Ibu ${options.parentName?.trim() || 'Wali Atlet'} (${options.athleteName}),`
    : `Yth. Bapak/Ibu Wali Atlet *${club.name}*,`;

  const dateInfo = schedule.sessionDate
    ? `${schedule.dayOfWeek}, ${formatDateID(schedule.sessionDate)}`
    : `Setiap hari ${schedule.dayOfWeek}`;

  const lines = [
    greeting,
    ``,
    isUpdated
      ? `Menginformasikan adanya *pembaruan jadwal latihan* untuk kelompok *${schedule.ageGroup}*:`
      : `Berikut informasi *jadwal latihan baru* untuk kelompok *${schedule.ageGroup}*:`,
    `• Program: *${schedule.title}* (${schedule.sessionType})`,
    `• Hari & Waktu: ${dateInfo}, pukul ${schedule.startTime}–${schedule.endTime} WIB`,
    `• Lokasi: ${schedule.poolLocation}${schedule.laneInfo ? ` (${schedule.laneInfo})` : ''}`,
    `• Pelatih: ${schedule.coachName}`,
  ];

  if (schedule.targetDistanceMeters > 0) {
    lines.push(`• Target Jarak: ${schedule.targetDistanceMeters.toLocaleString('id-ID')} meter`);
  }
  if (schedule.notes?.trim()) {
    lines.push(`• Catatan: ${schedule.notes.trim()}`);
  }

  lines.push(``);
  lines.push(`Mohon hadir 15 menit sebelum sesi dimulai. Terima kasih — *${club.name}*.`);

  return lines.join('\n');
}
