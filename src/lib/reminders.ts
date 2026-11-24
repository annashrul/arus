import {
  Athlete,
  AttendanceRecord,
  ClubAnnouncement,
  ClubCompetition,
  ClubInvoice,
  ClubProfile,
  DayOfWeek,
  EquipmentItem,
  formatDateID,
  formatRupiah,
  PaymentRequest,
  todayISO,
  TrainingSchedule,
} from '../types/club';
import { getDayOfWeekFromDate } from './validation';
import { NavSection } from '../components/OverviewView';
import { computeConsecutiveAbsences } from './attendanceAlerts';

export type ReminderCategory =
  | 'invoice'
  | 'schedule'
  | 'attendance'
  | 'announcement'
  | 'competition'
  | 'equipment';
export type ReminderSeverity = 'urgent' | 'warning' | 'info';

export interface ClubReminder {
  id: string;
  category: ReminderCategory;
  severity: ReminderSeverity;
  title: string;
  description: string;
  meta: string;
  targetNav: NavSection;
  whatsappText?: string;
  actionLabel: string;
}

function diffDaysFromToday(dateStr: string, todayStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{4}-\d{2}-\d{2}$/.test(todayStr)) return null;
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [y, m, d] = dateStr.split('-').map(Number);
  const tMs = Date.UTC(ty, tm - 1, td);
  const dMs = Date.UTC(y, m - 1, d);
  return Math.round((dMs - tMs) / 86400000);
}

function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function buildInvoiceWhatsAppReminder(club: ClubProfile, inv: ClubInvoice): string {
  return [
    `Yth. Bapak/Ibu ${inv.parentName || 'Wali Atlet'} (${inv.athleteName}),`,
    ``,
    `Pengingat tagihan resmi *${club.name}*:`,
    `No. Invoice: ${inv.invoiceNumber}`,
    `Keterangan: ${inv.description}`,
    `Nominal: ${formatRupiah(inv.amount)}`,
    `Jatuh Tempo: ${formatDateID(inv.dueDate)} (${inv.status})`,
    ``,
    club.bankName
      ? `Pembayaran via ${club.bankName} No. Rek ${club.bankAccountNumber || '-'} a.n. ${club.bankAccountHolder || club.name}.`
      : '',
    `Terima kasih atas perhatian Bapak/Ibu.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildDailyScheduleWhatsAppDigest(
  club: ClubProfile,
  reminders: ClubReminder[]
): string {
  const lines = [
    `*Pengingat Operasional ${club.name}* (${formatDateID(todayISO())})`,
    '',
    ...reminders.slice(0, 10).map((r, idx) => `${idx + 1}. [${r.severity === 'urgent' ? 'MENDESAK' : r.severity === 'warning' ? 'PERHATIAN' : 'INFO'}] ${r.title} — ${r.description}`),
  ];
  return lines.join('\n');
}

export function computeClubReminders(params: {
  club: ClubProfile;
  athletes?: Athlete[];
  invoices: ClubInvoice[];
  paymentRequests?: PaymentRequest[];
  schedules: TrainingSchedule[];
  attendance: AttendanceRecord[];
  announcements: ClubAnnouncement[];
  competitions?: ClubCompetition[];
  equipment?: EquipmentItem[];
  today?: string;
}): ClubReminder[] {
  const today = params.today || todayISO();
  const tomorrow = addDaysISO(today, 1);
  const todayDay: DayOfWeek | null = getDayOfWeekFromDate(today);
  const tomorrowDay: DayOfWeek | null = getDayOfWeekFromDate(tomorrow);

  const items: ClubReminder[] = [];

  // 0. Incoming payment proofs awaiting verification
  const pendingReqByInvoice = new Map<string, PaymentRequest>();
  for (const pr of params.paymentRequests || []) {
    if (pr.status === 'Menunggu Verifikasi') {
      pendingReqByInvoice.set(pr.invoiceId, pr);
    }
  }

  for (const inv of params.invoices) {
    if (inv.status === 'Lunas' || inv.status === 'Dibatalkan') continue;
    const reqMatch = pendingReqByInvoice.get(inv.id);
    if (inv.status === 'Menunggu Verifikasi' || reqMatch) {
      const payer = reqMatch?.payerName || inv.proofPayerName || inv.parentName || 'Wali Atlet';
      const method = reqMatch?.paymentMethod || inv.proofMethod || 'Transfer';
      items.push({
        id: `inv-proof-${inv.id}`,
        category: 'invoice',
        severity: 'urgent',
        title: `Bukti Bayar Masuk: ${inv.athleteName}`,
        description: `${inv.description} · ${formatRupiah(inv.amount)} (${method})`,
        meta: `${inv.invoiceNumber} · Pengirim: ${payer} · Siap Konfirmasi Cepat`,
        targetNav: 'invoices',
        actionLabel: 'Verifikasi Bayar',
      });
    }
  }

  // 1. Overdue & due-soon invoices
  for (const inv of params.invoices) {
    if (
      inv.status === 'Lunas' ||
      inv.status === 'Dibatalkan' ||
      inv.status === 'Menunggu Verifikasi' ||
      pendingReqByInvoice.has(inv.id)
    ) {
      continue;
    }
    const diff = diffDaysFromToday(inv.dueDate, today);
    const isOverdue = inv.status === 'Jatuh Tempo' || (diff !== null && diff < 0);
    const isDueSoon = diff !== null && diff >= 0 && diff <= 5;

    if (isOverdue) {
      const overdueDays = diff !== null && diff < 0 ? Math.abs(diff) : 0;
      items.push({
        id: `inv-overdue-${inv.id}`,
        category: 'invoice',
        severity: 'urgent',
        title: `Tagihan Terlambat: ${inv.athleteName}`,
        description: `${inv.description} sebesar ${formatRupiah(inv.amount)}`,
        meta:
          overdueDays > 0
            ? `${inv.invoiceNumber} · Terlambat ${overdueDays} hari (${formatDateID(inv.dueDate)})`
            : `${inv.invoiceNumber} · Jatuh tempo ${formatDateID(inv.dueDate)}`,
        targetNav: 'invoices',
        whatsappText: buildInvoiceWhatsAppReminder(params.club, inv),
        actionLabel: 'Buka Invoice',
      });
    } else if (isDueSoon && diff !== null) {
      items.push({
        id: `inv-soon-${inv.id}`,
        category: 'invoice',
        severity: 'warning',
        title:
          diff === 0
            ? `Jatuh Tempo Hari Ini: ${inv.athleteName}`
            : `Jatuh Tempo H-${diff}: ${inv.athleteName}`,
        description: `${inv.description} sebesar ${formatRupiah(inv.amount)}`,
        meta: `${inv.invoiceNumber} · Batas ${formatDateID(inv.dueDate)}`,
        targetNav: 'invoices',
        whatsappText: buildInvoiceWhatsAppReminder(params.club, inv),
        actionLabel: 'Buka Invoice',
      });
    }
  }

  // 2. Today's training schedules & missing attendance check
  const todaySchedules = params.schedules.filter((s) => {
    if (s.sessionDate && s.sessionDate.trim()) {
      return s.sessionDate === today;
    }
    return todayDay ? s.dayOfWeek === todayDay : false;
  });

  for (const sch of todaySchedules) {
    const hasAttendance = params.attendance.some(
      (rec) => rec.scheduleId === sch.id && rec.sessionDate === today
    );

    items.push({
      id: `sch-today-${sch.id}-${today}`,
      category: hasAttendance ? 'schedule' : 'attendance',
      severity: hasAttendance ? 'info' : 'warning',
      title: `Latihan Hari Ini: ${sch.title}`,
      description: `${sch.startTime}–${sch.endTime} · ${sch.poolLocation}${sch.laneInfo ? ` (${sch.laneInfo})` : ''}`,
      meta: hasAttendance
        ? `${sch.ageGroup} · Pelatih ${sch.coachName} · Presensi sudah tercatat`
        : `${sch.ageGroup} · Pelatih ${sch.coachName} · Presensi hari ini belum dicatat`,
      targetNav: 'schedules',
      actionLabel: hasAttendance ? 'Lihat Jadwal' : 'Isi Presensi',
    });
  }

  // 2b. Athletes absent >= 3 consecutive recorded training sessions
  const { alerts: absenceAlerts } = computeConsecutiveAbsences(
    params.athletes || [],
    params.attendance,
    params.club,
    3
  );
  for (const al of absenceAlerts) {
    items.push({
      id: `att-streak-${al.athlete.id}`,
      category: 'attendance',
      severity: al.severity,
      title: `Absen ${al.streak}x Beruntun: ${al.athlete.fullName}`,
      description: `Tidak hadir ${al.streak} sesi terakhir (${al.breakdownSummary}) · ${al.athlete.ageGroup}`,
      meta: `Terakhir: ${formatDateID(al.lastSessionDate)} (${al.lastSessionTitle}) · Wali: ${al.athlete.parentName || '-'}`,
      targetNav: 'schedules',
      whatsappText: al.whatsappMessage,
      actionLabel: 'Cek Presensi',
    });
  }

  // 3. Tomorrow's training schedules
  const tomorrowSchedules = params.schedules.filter((s) => {
    if (s.sessionDate && s.sessionDate.trim()) {
      return s.sessionDate === tomorrow;
    }
    return tomorrowDay ? s.dayOfWeek === tomorrowDay : false;
  });

  for (const sch of tomorrowSchedules) {
    items.push({
      id: `sch-tomorrow-${sch.id}-${tomorrow}`,
      category: 'schedule',
      severity: 'info',
      title: `Jadwal Besok (${sch.dayOfWeek}): ${sch.title}`,
      description: `${sch.startTime}–${sch.endTime} · Target ${sch.targetDistanceMeters.toLocaleString('id-ID')}m`,
      meta: `${sch.ageGroup} · ${sch.poolLocation} · ${sch.coachName}`,
      targetNav: 'schedules',
      actionLabel: 'Lihat Jadwal',
    });
  }

  // 4. Upcoming announcements / championship dates (within 0..7 days)
  for (const ann of params.announcements) {
    if (!ann.eventDate) continue;
    const diff = diffDaysFromToday(ann.eventDate, today);
    if (diff !== null && diff >= 0 && diff <= 7) {
      items.push({
        id: `ann-soon-${ann.id}`,
        category: 'announcement',
        severity: diff <= 1 ? 'warning' : 'info',
        title:
          diff === 0
            ? `Agenda Hari Ini: ${ann.title}`
            : `Agenda H-${diff}: ${ann.title}`,
        description: `${ann.docType} · Sasaran: ${ann.targetGroup || 'Semua Kelompok'}`,
        meta: `Tanggal ${formatDateID(ann.eventDate)} · Oleh ${ann.authorName}`,
        targetNav: 'invoices',
        actionLabel: 'Lihat Surat',
      });
    }
  }

  // 5. Upcoming target competitions (within 0..14 days)
  for (const comp of params.competitions || []) {
    if (comp.status === 'Selesai' || comp.status === 'Dibatalkan') continue;
    const diff = diffDaysFromToday(comp.startDate, today);
    if (diff !== null && diff >= 0 && diff <= 14) {
      items.push({
        id: `comp-soon-${comp.id}`,
        category: 'competition',
        severity: diff <= 3 ? 'warning' : 'info',
        title:
          diff === 0
            ? `Hari H Kejuaraan: ${comp.name}`
            : `Kejuaraan H-${diff}: ${comp.name}`,
        description: `${comp.level} · ${comp.location} (${comp.poolCourse})`,
        meta: `Mulai ${formatDateID(comp.startDate)} · Status: ${comp.status}`,
        targetNav: 'clubops',
        actionLabel: 'Lihat Kalender',
      });
    }
  }

  // 6. Equipment needing repair / replacement
  for (const eq of params.equipment || []) {
    if (eq.condition === 'Rusak' || eq.condition === 'Perlu Perbaikan') {
      items.push({
        id: `eq-cond-${eq.id}`,
        category: 'equipment',
        severity: eq.condition === 'Rusak' ? 'warning' : 'info',
        title: `Inventaris ${eq.condition}: ${eq.itemName}`,
        description: `${eq.quantity} unit · Kategori ${eq.category}`,
        meta: `Lokasi: ${eq.location || '-'} · Dicek ${formatDateID(eq.lastCheckedDate)}`,
        targetNav: 'clubops',
        actionLabel: 'Cek Inventaris',
      });
    }
  }

  const severityOrder: Record<ReminderSeverity, number> = {
    urgent: 0,
    warning: 1,
    info: 2,
  };

  return items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

function storageKey(clubId: string): string {
  return `tirta_dismissed_reminders_${clubId}_${todayISO()}`;
}

export function getDismissedReminderIds(clubId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(clubId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function dismissReminderForToday(clubId: string, reminderId: string): string[] {
  const cur = getDismissedReminderIds(clubId);
  if (!cur.includes(reminderId)) {
    const next = [...cur, reminderId];
    try {
      window.localStorage.setItem(storageKey(clubId), JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
    return next;
  }
  return cur;
}

export function clearDismissedRemindersForToday(clubId: string): string[] {
  try {
    window.localStorage.removeItem(storageKey(clubId));
  } catch {
    // Ignore storage errors
  }
  return [];
}
