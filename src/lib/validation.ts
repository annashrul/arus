import blueprint from '../../firebase-blueprint.json';
import {
  AGE_GROUPS,
  DAYS_OF_WEEK,
  DayOfWeek,
  ScheduleAgeGroup,
  ScheduleSessionType,
  SESSION_TYPES,
  todayISO,
  TrainingSchedule,
} from '../types/club';

type BlueprintProperty = {
  type: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  enum?: readonly string[];
};

const entities = blueprint.entities as Record<
  string,
  {
    properties: Record<string, BlueprintProperty>;
    required?: string[];
  }
>;

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

/**
 * Validates YYYY-MM-DD format AND verifies it is a real calendar date (e.g. rejects 2026-02-30).
 */
export function isValidBlueprintDate(value: string): boolean {
  const pattern = new RegExp(entities.Athlete.properties.birthDate.pattern || '^\\d{4}-\\d{2}-\\d{2}$');
  if (!pattern.test(value)) return false;

  const [y, m, d] = value.split('-').map(Number);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;

  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Validates HH:MM 24-hour format (00:00 through 23:59).
 */
export function isValidBlueprintTime(value: string): boolean {
  const pattern = new RegExp(entities.TrainingSchedule.properties.startTime.pattern || '^\\d{2}:\\d{2}$');
  if (!pattern.test(value)) return false;
  const [hh, mm] = value.split(':').map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

export function timeToMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + mm;
}

export function getDayOfWeekFromDate(dateStr: string): DayOfWeek | null {
  if (!isValidBlueprintDate(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  // getDay(): 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  const map: DayOfWeek[] = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return map[dt.getDay()] ?? null;
}

export function isValidEmailFormat(value: string): boolean {
  const clean = value.trim();
  if (!clean) return true;
  if (clean.length > 254 || /\s/.test(clean)) return false;

  const parts = clean.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;

  if (
    !local ||
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..')
  ) {
    return false;
  }
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) {
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
  const domainLabels = domain.split('.');
  if (domainLabels.length < 2) return false;
  const tld = domainLabels[domainLabels.length - 1];
  if (!/^[a-zA-Z]{2,24}$/.test(tld)) return false;

  return domainLabels.every((label) =>
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)
  );
}

export function validateEmailField(
  value: string,
  options?: {
    label?: string;
    maxLength?: number;
    required?: boolean;
  }
): string | undefined {
  const clean = value.trim();
  const label = options?.label || 'email';
  const maxLength = options?.maxLength ?? 100;

  if (!clean) {
    return options?.required ? `${label.charAt(0).toUpperCase() + label.slice(1)} wajib diisi.` : undefined;
  }
  if (clean.length > maxLength) {
    return `${label.charAt(0).toUpperCase() + label.slice(1)} maksimal ${maxLength} karakter.`;
  }
  if (!isValidEmailFormat(clean)) {
    return `Format ${label} tidak valid. Gunakan format standar seperti nama@domain.com.`;
  }
  return undefined;
}

export function isValidPhoneFormat(value: string): boolean {
  const clean = value.trim();
  if (!clean) return true;
  if (!/^[0-9+\-\s()]+$/.test(clean)) return false;
  const digits = clean.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 16;
}

export function isValidBankAccountFormat(value: string): boolean {
  const clean = value.trim();
  if (!clean) return true;
  if (!/^[0-9\-\s]+$/.test(clean)) return false;
  const digits = clean.replace(/\D/g, '');
  return digits.length >= 5 && digits.length <= 30;
}

export function isValidReferenceNoFormat(value: string): boolean {
  const clean = value.trim();
  if (!clean) return true;
  return /^[a-zA-Z0-9\-_./\s]+$/.test(clean);
}

export function normalizeTextKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeEmail(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase();
}

export interface ScheduleValidationInput {
  title: string;
  sessionType: ScheduleSessionType;
  ageGroup: ScheduleAgeGroup;
  dayOfWeek: DayOfWeek;
  sessionDate: string;
  startTime: string;
  endTime: string;
  poolLocation: string;
  laneInfo: string;
  coachName: string;
  targetDistance: string;
  notes: string;
}

export interface ScheduleValidationResult {
  valid: boolean;
  fieldErrors: FieldErrors<
    | 'title'
    | 'sessionType'
    | 'ageGroup'
    | 'dayOfWeek'
    | 'sessionDate'
    | 'startTime'
    | 'endTime'
    | 'poolLocation'
    | 'laneInfo'
    | 'coachName'
    | 'targetDistance'
    | 'notes'
  >;
  summaryError: string | null;
  parsedDistance: number;
}

export function validateScheduleInput(
  input: ScheduleValidationInput,
  existingSchedules: TrainingSchedule[],
  editingId?: string
): ScheduleValidationResult {
  const fieldErrors: ScheduleValidationResult['fieldErrors'] = {};

  const cleanTitle = clampString(input.title, LIMITS.schedule.titleMax);
  const cleanPool = clampString(input.poolLocation, LIMITS.schedule.poolLocationMax);
  const cleanLane = clampString(input.laneInfo, LIMITS.schedule.laneInfoMax);
  const cleanCoach = clampString(input.coachName, LIMITS.schedule.coachNameMax);
  const cleanDate = input.sessionDate.trim();
  const parsedDist = Number(input.targetDistance);

  if (cleanTitle.length < (entities.TrainingSchedule.properties.title.minLength ?? 2)) {
    fieldErrors.title = 'Judul sesi latihan minimal 2 karakter.';
  }

  if (!SESSION_TYPES.includes(input.sessionType)) {
    fieldErrors.sessionType = 'Fokus latihan tidak valid.';
  }

  if (input.ageGroup !== 'Semua Kelompok' && !AGE_GROUPS.includes(input.ageGroup)) {
    fieldErrors.ageGroup = 'Kelompok umur tidak valid.';
  }

  if (!DAYS_OF_WEEK.includes(input.dayOfWeek)) {
    fieldErrors.dayOfWeek = 'Hari latihan tidak valid.';
  }

  if (cleanDate) {
    if (!isValidBlueprintDate(cleanDate)) {
      fieldErrors.sessionDate = 'Format tanggal sesi khusus harus YYYY-MM-DD yang valid.';
    } else {
      const dateDay = getDayOfWeekFromDate(cleanDate);
      if (dateDay && dateDay !== input.dayOfWeek) {
        fieldErrors.sessionDate = `Tanggal ${cleanDate} jatuh pada hari ${dateDay}, tidak sesuai dengan hari "${input.dayOfWeek}".`;
      }
    }
  }

  const startValid = isValidBlueprintTime(input.startTime);
  const endValid = isValidBlueprintTime(input.endTime);
  if (!startValid) {
    fieldErrors.startTime = 'Format jam mulai harus HH:MM (00:00–23:59).';
  }
  if (!endValid) {
    fieldErrors.endTime = 'Format jam selesai harus HH:MM (00:00–23:59).';
  }

  if (startValid && endValid) {
    const startMin = timeToMinutes(input.startTime);
    const endMin = timeToMinutes(input.endTime);
    if (endMin <= startMin) {
      fieldErrors.endTime = 'Jam selesai harus lebih akhir dari jam mulai.';
    } else if (endMin - startMin < 15) {
      fieldErrors.endTime = 'Durasi sesi latihan minimal 15 menit.';
    } else if (endMin - startMin > 480) {
      fieldErrors.endTime = 'Durasi satu sesi latihan maksimal 8 jam (480 menit).';
    }
  }

  if (cleanPool.length < (entities.TrainingSchedule.properties.poolLocation.minLength ?? 2)) {
    fieldErrors.poolLocation = 'Lokasi kolam / fasilitas minimal 2 karakter.';
  }

  if (cleanCoach.length < (entities.TrainingSchedule.properties.coachName.minLength ?? 2)) {
    fieldErrors.coachName = 'Nama pelatih sesi minimal 2 karakter.';
  }

  if (
    input.targetDistance.trim() === '' ||
    !Number.isFinite(parsedDist) ||
    !Number.isInteger(parsedDist) ||
    parsedDist < 0 ||
    parsedDist > 30000
  ) {
    fieldErrors.targetDistance = 'Target jarak harus berupa bilangan bulat antara 0 hingga 30.000 meter.';
  } else if (input.sessionType !== 'Latihan Fisik (Dryland)' && parsedDist < 50) {
    fieldErrors.targetDistance =
      'Sesi kolam renang minimal 50 meter (isi 0 hanya untuk Latihan Fisik / Dryland).';
  }

  if (input.notes.trim().length > LIMITS.schedule.notesMax) {
    fieldErrors.notes = `Catatan maksimal ${LIMITS.schedule.notesMax} karakter.`;
  }

  // Conflict checks only if core time/day fields are valid
  let conflictSummary: string | null = null;
  if (!fieldErrors.startTime && !fieldErrors.endTime && !fieldErrors.dayOfWeek && !fieldErrors.sessionDate) {
    const startMin = timeToMinutes(input.startTime);
    const endMin = timeToMinutes(input.endTime);
    const normCoach = normalizeTextKey(cleanCoach);
    const normPool = normalizeTextKey(cleanPool);
    const normLane = normalizeTextKey(cleanLane);

    for (const other of existingSchedules) {
      if (editingId && other.id === editingId) continue;
      if (other.dayOfWeek !== input.dayOfWeek) continue;

      // If both schedules specify distinct specific dates, they do not collide
      const otherDate = (other.sessionDate || '').trim();
      if (cleanDate && otherDate && cleanDate !== otherDate) continue;

      if (!isValidBlueprintTime(other.startTime) || !isValidBlueprintTime(other.endTime)) continue;
      const otherStart = timeToMinutes(other.startTime);
      const otherEnd = timeToMinutes(other.endTime);
      const overlaps = startMin < otherEnd && otherStart < endMin;
      if (!overlaps) continue;

      // 1. Coach time conflict
      if (normCoach && normalizeTextKey(other.coachName) === normCoach) {
        const msg = `Bentrok jadwal pelatih: ${cleanCoach} sudah terjadwal pada sesi "${other.title}" (${other.dayOfWeek} ${other.startTime}–${other.endTime}).`;
        fieldErrors.coachName = msg;
        conflictSummary = msg;
        break;
      }

      // 2. Age group conflict (exact match or either is 'Semua Kelompok')
      const ageConflicts =
        input.ageGroup === other.ageGroup ||
        input.ageGroup === 'Semua Kelompok' ||
        other.ageGroup === 'Semua Kelompok';
      if (ageConflicts) {
        const msg = `Bentrok kelompok umur: ${input.ageGroup} bertabrakan dengan sesi "${other.title}" [${other.ageGroup}] pada ${other.dayOfWeek} ${other.startTime}–${other.endTime}.`;
        fieldErrors.ageGroup = msg;
        conflictSummary = msg;
        break;
      }

      // 3. Pool + lane conflict
      if (normPool && normalizeTextKey(other.poolLocation) === normPool) {
        const otherLane = normalizeTextKey(other.laneInfo || '');
        if (!normLane || !otherLane || normLane === otherLane) {
          const msg = `Bentrok fasilitas kolam: ${cleanPool}${cleanLane ? ` (${cleanLane})` : ''} sudah dipakai sesi "${other.title}" (${other.startTime}–${other.endTime}). Gunakan lintasan atau jam berbeda.`;
          fieldErrors.laneInfo = msg;
          conflictSummary = msg;
          break;
        }
      }
    }
  }

  const firstFieldMsg = Object.values(fieldErrors)[0] || null;
  const summaryError = conflictSummary || firstFieldMsg;

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    summaryError,
    parsedDistance: Number.isFinite(parsedDist) ? Math.round(parsedDist) : 0,
  };
}

export function validateAttendanceDate(dateStr: string): string | null {
  if (!dateStr.trim()) {
    return 'Tanggal latihan wajib dipilih sebelum mencatat presensi.';
  }
  if (!isValidBlueprintDate(dateStr)) {
    return 'Format tanggal latihan tidak valid.';
  }
  if (dateStr > todayISO()) {
    return 'Tanggal presensi tidak boleh melebihi tanggal hari ini.';
  }
  return null;
}

export const LIMITS = {
  club: {
    nameMin: entities.Club.properties.name.minLength ?? 2,
    nameMax: entities.Club.properties.name.maxLength ?? 100,
    cityMin: entities.Club.properties.city.minLength ?? 2,
    cityMax: entities.Club.properties.city.maxLength ?? 60,
    addressMax: entities.Club.properties.address.maxLength ?? 200,
    headCoachMin: entities.Club.properties.headCoach.minLength ?? 2,
    headCoachMax: entities.Club.properties.headCoach.maxLength ?? 80,
    phoneMax: entities.Club.properties.phone.maxLength ?? 25,
    emailMax: entities.Club.properties.email.maxLength ?? 100,
    bankNameMax: entities.Club.properties.bankName.maxLength ?? 60,
    bankAccountNumberMax: entities.Club.properties.bankAccountNumber.maxLength ?? 40,
    bankAccountHolderMax: entities.Club.properties.bankAccountHolder.maxLength ?? 80,
    qrisPayloadMax: entities.Club.properties.qrisPayload.maxLength ?? 512,
    qrisMerchantNameMax: entities.Club.properties.qrisMerchantName.maxLength ?? 60,
  },
  athlete: {
    fullNameMin: entities.Athlete.properties.fullName.minLength ?? 2,
    fullNameMax: entities.Athlete.properties.fullName.maxLength ?? 100,
    parentNameMax: entities.Athlete.properties.parentName.maxLength ?? 100,
    parentPhoneMax: entities.Athlete.properties.parentPhone.maxLength ?? 25,
    parentEmailMax: entities.Athlete.properties.parentEmail.maxLength ?? 100,
    coachNameMax: entities.Athlete.properties.coachName.maxLength ?? 80,
    notesMax: entities.Athlete.properties.notes.maxLength ?? 400,
  },
  swimTime: {
    athleteNameMax: entities.SwimTime.properties.athleteName.maxLength ?? 100,
    eventNameMax: entities.SwimTime.properties.eventName.maxLength ?? 80,
    formattedTimeMax: entities.SwimTime.properties.formattedTime.maxLength ?? 15,
    championshipNameMin: entities.SwimTime.properties.championshipName.minLength ?? 2,
    championshipNameMax: entities.SwimTime.properties.championshipName.maxLength ?? 120,
    locationMax: entities.SwimTime.properties.location.maxLength ?? 100,
    notesMax: entities.SwimTime.properties.notes.maxLength ?? 300,
  },
  transaction: {
    descriptionMin: entities.Transaction.properties.description.minLength ?? 2,
    descriptionMax: entities.Transaction.properties.description.maxLength ?? 200,
    referenceNoMax: entities.Transaction.properties.referenceNo.maxLength ?? 60,
    athleteNameMax: entities.Transaction.properties.athleteName.maxLength ?? 100,
  },
  schedule: {
    titleMin: entities.TrainingSchedule.properties.title.minLength ?? 2,
    titleMax: entities.TrainingSchedule.properties.title.maxLength ?? 120,
    poolLocationMin: entities.TrainingSchedule.properties.poolLocation.minLength ?? 2,
    poolLocationMax: entities.TrainingSchedule.properties.poolLocation.maxLength ?? 100,
    laneInfoMax: entities.TrainingSchedule.properties.laneInfo.maxLength ?? 40,
    coachNameMin: entities.TrainingSchedule.properties.coachName.minLength ?? 2,
    coachNameMax: entities.TrainingSchedule.properties.coachName.maxLength ?? 80,
    notesMax: entities.TrainingSchedule.properties.notes.maxLength ?? 400,
  },
  invoice: {
    invoiceNumberMax: entities.Invoice.properties.invoiceNumber.maxLength ?? 40,
    periodMonthMin: entities.Invoice.properties.periodMonth.minLength ?? 3,
    periodMonthMax: entities.Invoice.properties.periodMonth.maxLength ?? 30,
    descriptionMin: entities.Invoice.properties.description.minLength ?? 2,
    descriptionMax: entities.Invoice.properties.description.maxLength ?? 200,
    paymentTokenMax: entities.Invoice.properties.paymentToken.maxLength ?? 64,
    proofImageMax: entities.Invoice.properties.proofImageDataUrl.maxLength ?? 200000,
    proofPayerNameMax: entities.Invoice.properties.proofPayerName.maxLength ?? 100,
    proofNoteMax: entities.Invoice.properties.proofNote.maxLength ?? 300,
    paymentRejectionReasonMax: entities.Invoice.properties.paymentRejectionReason.maxLength ?? 200,
    notesMax: entities.Invoice.properties.notes.maxLength ?? 300,
  },
  attendance: {
    notesMax: entities.Attendance.properties.notes.maxLength ?? 200,
  },
  announcement: {
    titleMin: entities.Announcement.properties.title.minLength ?? 2,
    titleMax: entities.Announcement.properties.title.maxLength ?? 140,
    contentMin: entities.Announcement.properties.content.minLength ?? 5,
    contentMax: entities.Announcement.properties.content.maxLength ?? 2000,
    targetGroupMax: entities.Announcement.properties.targetGroup.maxLength ?? 50,
    authorNameMin: entities.Announcement.properties.authorName.minLength ?? 2,
    authorNameMax: entities.Announcement.properties.authorName.maxLength ?? 80,
  },
  coach: {
    fullNameMin: entities.Coach.properties.fullName.minLength ?? 2,
    fullNameMax: entities.Coach.properties.fullName.maxLength ?? 80,
    specializationMax: entities.Coach.properties.specialization.maxLength ?? 100,
    phoneMax: entities.Coach.properties.phone.maxLength ?? 25,
    emailMax: entities.Coach.properties.email.maxLength ?? 100,
    notesMax: entities.Coach.properties.notes.maxLength ?? 300,
  },
  pool: {
    nameMin: entities.PoolFacility.properties.name.minLength ?? 2,
    nameMax: entities.PoolFacility.properties.name.maxLength ?? 100,
    addressMax: entities.PoolFacility.properties.address.maxLength ?? 160,
    notesMax: entities.PoolFacility.properties.notes.maxLength ?? 300,
  },
  equipment: {
    itemNameMin: entities.EquipmentItem.properties.itemName.minLength ?? 2,
    itemNameMax: entities.EquipmentItem.properties.itemName.maxLength ?? 100,
    locationMax: entities.EquipmentItem.properties.location.maxLength ?? 100,
    notesMax: entities.EquipmentItem.properties.notes.maxLength ?? 300,
  },
  competition: {
    nameMin: entities.Competition.properties.name.minLength ?? 2,
    nameMax: entities.Competition.properties.name.maxLength ?? 120,
    locationMin: entities.Competition.properties.location.minLength ?? 2,
    locationMax: entities.Competition.properties.location.maxLength ?? 100,
    notesMax: entities.Competition.properties.notes.maxLength ?? 300,
  },
  clubMember: {
    memberEmailMin: entities.ClubMember.properties.memberEmail.minLength ?? 3,
    memberEmailMax: entities.ClubMember.properties.memberEmail.maxLength ?? 100,
    displayNameMin: entities.ClubMember.properties.displayName.minLength ?? 2,
    displayNameMax: entities.ClubMember.properties.displayName.maxLength ?? 100,
    coachNameMax: entities.ClubMember.properties.coachName.maxLength ?? 80,
    notesMax: entities.ClubMember.properties.notes.maxLength ?? 300,
  },
  paymentProof: {
    payerNameMin: 2,
    payerNameMax: entities.Invoice.properties.proofPayerName.maxLength ?? 100,
    noteMax: entities.Invoice.properties.proofNote.maxLength ?? 300,
  },
};
