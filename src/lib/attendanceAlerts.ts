import {
  Athlete,
  AttendanceRecord,
  ClubProfile,
  formatDateID,
} from '../types/club';

export interface ConsecutiveAbsenceAlert {
  athlete: Athlete;
  streak: number;
  alpaCount: number;
  izinCount: number;
  sakitCount: number;
  lastSessionDate: string;
  lastSessionTitle: string;
  recentRecords: AttendanceRecord[];
  breakdownSummary: string;
  severity: 'urgent' | 'warning';
  whatsappMessage: string;
}

export function buildAbsenceFollowUpWhatsApp(
  club: ClubProfile | undefined,
  athlete: Athlete,
  streak: number,
  recentRecords: AttendanceRecord[]
): string {
  const clubName = club?.name || 'Klub Renang';
  const latestDate = recentRecords[0]?.sessionDate
    ? formatDateID(recentRecords[0].sessionDate)
    : '-';
  const detailLines = recentRecords
    .slice(0, 5)
    .map(
      (r) =>
        `• ${formatDateID(r.sessionDate)} (${r.scheduleTitle}): ${r.status}`
    );

  return [
    `Yth. Bapak/Ibu ${athlete.parentName?.trim() || 'Wali Atlet'} (${athlete.fullName}),`,
    ``,
    `Kami dari tim pelatih *${clubName}* ingin menanyakan kabar ananda *${athlete.fullName}* karena tercatat belum hadir dalam *${streak} sesi latihan berturut-turut* (terakhir ${latestDate}):`,
    ...detailLines,
    ``,
    `Semoga ananda dalam keadaan sehat. Mohon konfirmasi kendala atau rencana kehadiran pada sesi latihan berikutnya agar program latihan kelompok *${athlete.ageGroup}* dapat kami sesuaikan.`,
    `Terima kasih atas perhatian Bapak/Ibu.`,
  ].join('\n');
}

/**
 * Mendeteksi atlet aktif/cuti yang tidak hadir (Alpa/Izin/Sakit) selama >= minStreak
 * sesi latihan tercatat secara berturut-turut dari catatan terbaru.
 */
export function computeConsecutiveAbsences(
  athletes: Athlete[],
  attendance: AttendanceRecord[],
  club?: ClubProfile,
  minStreak = 3
): {
  alerts: ConsecutiveAbsenceAlert[];
  alertByAthleteId: Map<string, ConsecutiveAbsenceAlert>;
} {
  const recordsByAthlete = new Map<string, AttendanceRecord[]>();
  for (const rec of attendance) {
    if (!rec.athleteId) continue;
    const list = recordsByAthlete.get(rec.athleteId) || [];
    list.push(rec);
    recordsByAthlete.set(rec.athleteId, list);
  }

  const alerts: ConsecutiveAbsenceAlert[] = [];
  const alertByAthleteId = new Map<string, ConsecutiveAbsenceAlert>();

  for (const athlete of athletes) {
    if (athlete.status === 'Nonaktif') continue;
    const raw = recordsByAthlete.get(athlete.id);
    if (!raw || raw.length < minStreak) continue;

    // Urutkan terbaru ke terlama. Jika tanggal sama, prioritaskan 'Hadir' terlebih dahulu
    // agar atlet yang hadir di salah satu sesi pada hari yang sama tidak salah terhitung absen.
    const sorted = [...raw].sort((a, b) => {
      const dateDiff = b.sessionDate.localeCompare(a.sessionDate);
      if (dateDiff !== 0) return dateDiff;
      if (a.status === 'Hadir' && b.status !== 'Hadir') return -1;
      if (a.status !== 'Hadir' && b.status === 'Hadir') return 1;
      return b.id.localeCompare(a.id);
    });

    const consecutiveMissed: AttendanceRecord[] = [];
    for (const rec of sorted) {
      if (rec.status === 'Hadir') break;
      consecutiveMissed.push(rec);
    }

    if (consecutiveMissed.length < minStreak) continue;

    let alpaCount = 0;
    let izinCount = 0;
    let sakitCount = 0;
    for (const rec of consecutiveMissed) {
      if (rec.status === 'Alpa') alpaCount++;
      else if (rec.status === 'Izin') izinCount++;
      else if (rec.status === 'Sakit') sakitCount++;
    }

    const parts: string[] = [];
    if (alpaCount > 0) parts.push(`${alpaCount} Alpa`);
    if (sakitCount > 0) parts.push(`${sakitCount} Sakit`);
    if (izinCount > 0) parts.push(`${izinCount} Izin`);

    const alert: ConsecutiveAbsenceAlert = {
      athlete,
      streak: consecutiveMissed.length,
      alpaCount,
      izinCount,
      sakitCount,
      lastSessionDate: consecutiveMissed[0].sessionDate,
      lastSessionTitle: consecutiveMissed[0].scheduleTitle,
      recentRecords: consecutiveMissed,
      breakdownSummary: parts.join(' · '),
      severity: consecutiveMissed.length >= 4 || alpaCount >= 2 ? 'urgent' : 'warning',
      whatsappMessage: buildAbsenceFollowUpWhatsApp(
        club,
        athlete,
        consecutiveMissed.length,
        consecutiveMissed
      ),
    };

    alerts.push(alert);
    alertByAthleteId.set(athlete.id, alert);
  }

  alerts.sort((a, b) => {
    if (b.streak !== a.streak) return b.streak - a.streak;
    if (b.alpaCount !== a.alpaCount) return b.alpaCount - a.alpaCount;
    return a.athlete.fullName.localeCompare(b.athlete.fullName);
  });

  return { alerts, alertByAthleteId };
}
