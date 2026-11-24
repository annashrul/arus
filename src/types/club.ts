export type AgeGroup = 'Pemula' | 'KU V' | 'KU IV' | 'KU III' | 'KU II' | 'KU I' | 'Senior';
export type AthleteGender = 'Putra' | 'Putri';
export type AthleteStatus = 'Aktif' | 'Cuti' | 'Nonaktif';

export type SwimStroke =
  | 'Gaya Bebas'
  | 'Gaya Punggung'
  | 'Gaya Dada'
  | 'Gaya Kupu-Kupu'
  | 'Gaya Ganti';

export type PoolCourse = '50m (LCM)' | '25m (SCM)';
export type MedalType = 'Emas' | 'Perak' | 'Perunggu' | 'Finalis' | 'Peserta';

export type TransactionType = 'pemasukan' | 'pengeluaran';
export type TransactionCategory =
  | 'Iuran Bulanan (SPP)'
  | 'Pendaftaran Kejuaraan'
  | 'Perlengkapan & Atribut'
  | 'Sewa Kolam'
  | 'Gaji Pelatih'
  | 'Operasional Lomba'
  | 'Sponsor & Donasi'
  | 'Lainnya';

export type PaymentMethod = 'Transfer Bank' | 'Tunai' | 'QRIS';

export type ScheduleSessionType =
  | 'Teknik & Stroke'
  | 'Ketahanan (Endurance)'
  | 'Kecepatan (Sprint)'
  | 'Start & Turn'
  | 'Simulasi Lomba'
  | 'Latihan Fisik (Dryland)';

export type ScheduleAgeGroup = 'Semua Kelompok' | AgeGroup;
export type DayOfWeek = 'Senin' | 'Selasa' | 'Rabu' | 'Kamis' | 'Jumat' | 'Sabtu' | 'Minggu';

export type InvoiceCategory =
  | 'Iuran Bulanan (SPP)'
  | 'Biaya Kejuaraan'
  | 'Seragam & Perlengkapan'
  | 'Pendaftaran Anggota Baru'
  | 'Lainnya';

export type InvoiceStatus =
  | 'Belum Lunas'
  | 'Menunggu Verifikasi'
  | 'Lunas'
  | 'Jatuh Tempo'
  | 'Dibatalkan';
export type ProofPaymentMethod = 'Transfer Bank' | 'QRIS' | 'Tunai' | 'Lainnya';
export type PaymentRequestStatus =
  | 'Menunggu Pembayaran'
  | 'Menunggu Verifikasi'
  | 'Terverifikasi'
  | 'Ditolak';
export type AttendanceStatus = 'Hadir' | 'Izin' | 'Sakit' | 'Alpa';
export type AnnouncementDocType =
  | 'Pengumuman Klub'
  | 'Surat Tugas Lomba'
  | 'Undangan Rapat'
  | 'Peraturan Kolam';

export type CoachRole =
  | 'Kepala Pelatih'
  | 'Pelatih Prestasi'
  | 'Pelatih Pemula'
  | 'Pelatih Fisik (Dryland)'
  | 'Admin & Medis';

export type CoachLicense =
  | 'Nasional (PRSI A)'
  | 'Daerah (PRSI B)'
  | 'Dasar (PRSI C)'
  | 'Pelatih Fisik'
  | 'Non-Lisensi';

export type CoachStatus = 'Aktif' | 'Cuti' | 'Nonaktif';

export type PoolType =
  | '50m (Olympic/LCM)'
  | '25m (Short Course)'
  | 'Kolam Pemanasan'
  | 'Area Dryland';

export type PoolStatus = 'Tersedia' | 'Renovasi' | 'Tidak Aktif';

export type EquipmentCategory =
  | 'Alat Teknik Renang'
  | 'Timing & Lomba'
  | 'Dryland & Kebugaran'
  | 'Keselamatan & P3K'
  | 'Atribut & Seragam';

export type EquipmentCondition = 'Baik' | 'Perlu Perbaikan' | 'Rusak';

export type CompetitionLevel =
  | 'Klub / Time Trial'
  | 'Kota / Kabupaten'
  | 'Provinsi (Kejurda)'
  | 'Nasional (Kejurnas)'
  | 'Internasional';

export type CompetitionStatus =
  | 'Akan Datang'
  | 'Pendaftaran Dibuka'
  | 'Berlangsung'
  | 'Selesai'
  | 'Dibatalkan';

export interface ClubProfile {
  id: string;
  name: string;
  city: string;
  address?: string;
  headCoach: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  qrisPayload?: string;
  qrisMerchantName?: string;
  defaultMonthlyFee: number;
  ownerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Athlete {
  id: string;
  clubId: string;
  ownerId: string;
  fullName: string;
  gender: AthleteGender;
  birthDate: string;
  ageGroup: AgeGroup;
  status: AthleteStatus;
  parentName?: string;
  parentPhone?: string;
  coachName?: string;
  monthlyFee: number;
  joinDate: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SwimTime {
  id: string;
  clubId: string;
  ownerId: string;
  athleteId: string;
  athleteName: string;
  eventName: string;
  stroke: SwimStroke;
  distanceMeters: number;
  poolCourse: PoolCourse;
  timeMs: number;
  formattedTime: string;
  championshipName: string;
  meetDate: string;
  location?: string;
  medal: MedalType;
  isPersonalBest: boolean;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FinanceTransaction {
  id: string;
  clubId: string;
  ownerId: string;
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  amount: number;
  transactionDate: string;
  paymentMethod: PaymentMethod;
  referenceNo?: string;
  athleteId?: string;
  athleteName?: string;
  invoiceId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TrainingSchedule {
  id: string;
  clubId: string;
  ownerId: string;
  title: string;
  sessionType: ScheduleSessionType;
  ageGroup: ScheduleAgeGroup;
  dayOfWeek: DayOfWeek;
  sessionDate?: string;
  startTime: string;
  endTime: string;
  poolLocation: string;
  laneInfo?: string;
  coachName: string;
  targetDistanceMeters: number;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClubInvoice {
  id: string;
  clubId: string;
  ownerId: string;
  invoiceNumber: string;
  athleteId: string;
  athleteName: string;
  parentName?: string;
  parentPhone?: string;
  periodMonth: string;
  category: InvoiceCategory;
  description: string;
  amount: number;
  dueDate: string;
  status: InvoiceStatus;
  paidDate?: string;
  paymentMethod?: string;
  paymentToken?: string;
  proofImageDataUrl?: string;
  proofPayerName?: string;
  proofMethod?: string;
  proofNote?: string;
  proofSubmittedAt?: string;
  paymentRejectionReason?: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentRequest {
  id: string;
  clubId: string;
  ownerId: string;
  clubName: string;
  clubCity: string;
  invoiceId: string;
  invoiceNumber: string;
  athleteName: string;
  periodMonth: string;
  description: string;
  amount: number;
  dueDate: string;
  status: PaymentRequestStatus;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  qrisPayload?: string;
  qrisMerchantName?: string;
  proofImageDataUrl?: string;
  payerName?: string;
  paymentMethod?: string;
  proofNote?: string;
  submittedAt?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceRecord {
  id: string;
  clubId: string;
  ownerId: string;
  scheduleId: string;
  scheduleTitle: string;
  sessionDate: string;
  athleteId: string;
  athleteName: string;
  status: AttendanceStatus;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClubAnnouncement {
  id: string;
  clubId: string;
  ownerId: string;
  title: string;
  docType: AnnouncementDocType;
  eventDate?: string;
  content: string;
  targetGroup?: string;
  authorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Coach {
  id: string;
  clubId: string;
  ownerId: string;
  fullName: string;
  role: CoachRole;
  licenseLevel: CoachLicense;
  specialization?: string;
  phone?: string;
  status: CoachStatus;
  monthlyHonorarium: number;
  joinDate: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PoolFacility {
  id: string;
  clubId: string;
  ownerId: string;
  name: string;
  poolType: PoolType;
  laneCount: number;
  address?: string;
  rentalCostPerSession: number;
  status: PoolStatus;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EquipmentItem {
  id: string;
  clubId: string;
  ownerId: string;
  itemName: string;
  category: EquipmentCategory;
  quantity: number;
  condition: EquipmentCondition;
  location?: string;
  lastCheckedDate: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClubCompetition {
  id: string;
  clubId: string;
  ownerId: string;
  name: string;
  level: CompetitionLevel;
  startDate: string;
  endDate: string;
  location: string;
  poolCourse: PoolCourse;
  registrationFee: number;
  status: CompetitionStatus;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const AGE_GROUPS: AgeGroup[] = ['Pemula', 'KU V', 'KU IV', 'KU III', 'KU II', 'KU I', 'Senior'];
export const SWIM_STROKES: SwimStroke[] = [
  'Gaya Bebas',
  'Gaya Punggung',
  'Gaya Dada',
  'Gaya Kupu-Kupu',
  'Gaya Ganti',
];
export const SWIM_DISTANCES = [50, 100, 200, 400, 800, 1500] as const;
export const POOL_COURSES: PoolCourse[] = ['50m (LCM)', '25m (SCM)'];
export const MEDAL_TYPES: MedalType[] = ['Emas', 'Perak', 'Perunggu', 'Finalis', 'Peserta'];
export const TRANSACTION_CATEGORIES: TransactionCategory[] = [
  'Iuran Bulanan (SPP)',
  'Pendaftaran Kejuaraan',
  'Perlengkapan & Atribut',
  'Sewa Kolam',
  'Gaji Pelatih',
  'Operasional Lomba',
  'Sponsor & Donasi',
  'Lainnya',
];
export const PAYMENT_METHODS: PaymentMethod[] = ['Transfer Bank', 'Tunai', 'QRIS'];
export const SESSION_TYPES: ScheduleSessionType[] = [
  'Teknik & Stroke',
  'Ketahanan (Endurance)',
  'Kecepatan (Sprint)',
  'Start & Turn',
  'Simulasi Lomba',
  'Latihan Fisik (Dryland)',
];
export const DAYS_OF_WEEK: DayOfWeek[] = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
export const INVOICE_CATEGORIES: InvoiceCategory[] = [
  'Iuran Bulanan (SPP)',
  'Biaya Kejuaraan',
  'Seragam & Perlengkapan',
  'Pendaftaran Anggota Baru',
  'Lainnya',
];
export const INVOICE_STATUSES: InvoiceStatus[] = [
  'Belum Lunas',
  'Menunggu Verifikasi',
  'Lunas',
  'Jatuh Tempo',
  'Dibatalkan',
];
export const PROOF_PAYMENT_METHODS: ProofPaymentMethod[] = [
  'Transfer Bank',
  'QRIS',
  'Tunai',
  'Lainnya',
];
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['Hadir', 'Izin', 'Sakit', 'Alpa'];
export const ANNOUNCEMENT_TYPES: AnnouncementDocType[] = [
  'Pengumuman Klub',
  'Surat Tugas Lomba',
  'Undangan Rapat',
  'Peraturan Kolam',
];
export const COACH_ROLES: CoachRole[] = [
  'Kepala Pelatih',
  'Pelatih Prestasi',
  'Pelatih Pemula',
  'Pelatih Fisik (Dryland)',
  'Admin & Medis',
];
export const COACH_LICENSES: CoachLicense[] = [
  'Nasional (PRSI A)',
  'Daerah (PRSI B)',
  'Dasar (PRSI C)',
  'Pelatih Fisik',
  'Non-Lisensi',
];
export const COACH_STATUSES: CoachStatus[] = ['Aktif', 'Cuti', 'Nonaktif'];
export const POOL_TYPES: PoolType[] = [
  '50m (Olympic/LCM)',
  '25m (Short Course)',
  'Kolam Pemanasan',
  'Area Dryland',
];
export const POOL_STATUSES: PoolStatus[] = ['Tersedia', 'Renovasi', 'Tidak Aktif'];
export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  'Alat Teknik Renang',
  'Timing & Lomba',
  'Dryland & Kebugaran',
  'Keselamatan & P3K',
  'Atribut & Seragam',
];
export const EQUIPMENT_CONDITIONS: EquipmentCondition[] = ['Baik', 'Perlu Perbaikan', 'Rusak'];
export const COMPETITION_LEVELS: CompetitionLevel[] = [
  'Klub / Time Trial',
  'Kota / Kabupaten',
  'Provinsi (Kejurda)',
  'Nasional (Kejurnas)',
  'Internasional',
];
export const COMPETITION_STATUSES: CompetitionStatus[] = [
  'Akan Datang',
  'Pendaftaran Dibuka',
  'Berlangsung',
  'Selesai',
  'Dibatalkan',
];

export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatDateID(dateStr?: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '-';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dt);
}

/**
 * Parse swim time string such as "00:28.45", "1:04.32", or "28.45" into milliseconds.
 * Returns null if invalid.
 */
export function parseSwimTimeToMs(input: string): number | null {
  const clean = input.trim();
  if (!clean) return null;

  // Format mm:ss.cc or m:ss.cc
  const colonMatch = clean.match(/^(\d{1,2}):(\d{2})\.(\d{2})$/);
  if (colonMatch) {
    const mins = parseInt(colonMatch[1], 10);
    const secs = parseInt(colonMatch[2], 10);
    const cs = parseInt(colonMatch[3], 10);
    if (secs >= 60) return null;
    return mins * 60000 + secs * 1000 + cs * 10;
  }

  // Format ss.cc
  const secMatch = clean.match(/^(\d{1,2})\.(\d{2})$/);
  if (secMatch) {
    const secs = parseInt(secMatch[1], 10);
    const cs = parseInt(secMatch[2], 10);
    if (secs >= 60) return null;
    return secs * 1000 + cs * 10;
  }

  return null;
}

export function formatSwimTimeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00.00';
  const totalCs = Math.round(ms / 10);
  const cs = totalCs % 100;
  const totalSecs = Math.floor(totalCs / 100);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(mins)}:${pad(secs)}.${pad(cs)}`;
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentMonthLabel(): string {
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (cell: string | number) => {
    const str = String(cell ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const safeName =
    filename
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-') || 'ekspor.csv';
  const navWithMsSave = navigator as Navigator & {
    msSaveOrOpenBlob?: (b: Blob, defaultName?: string) => boolean;
  };
  if (typeof navWithMsSave.msSaveOrOpenBlob === 'function') {
    navWithMsSave.msSaveOrOpenBlob(blob, safeName);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }, 10000);
}
