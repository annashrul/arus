import React, { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  clampString,
  FieldErrors,
  getDayOfWeekFromDate,
  isValidBlueprintDate,
  isValidBlueprintTime,
  LIMITS,
  timeToMinutes,
  validateAttendanceDate,
  validateScheduleInput,
} from '../lib/validation';
import {
  AGE_GROUPS,
  Athlete,
  ATTENDANCE_STATUSES,
  AttendanceRecord,
  AttendanceStatus,
  ClubProfile,
  Coach,
  DAYS_OF_WEEK,
  DayOfWeek,
  downloadCSV,
  formatDateID,
  PoolFacility,
  ScheduleAgeGroup,
  ScheduleSessionType,
  SESSION_TYPES,
  todayISO,
  TrainingSchedule,
} from '../types/club';
import {
  buildAttendanceSheet,
  buildSchedulesSheet,
  downloadExcelWorkbook,
  downloadSchedulesICS,
} from '../lib/exportUtils';
import { downloadClubSummaryPdf } from '../lib/pdfExport';
import {
  computeConsecutiveAbsences,
  ConsecutiveAbsenceAlert,
} from '../lib/attendanceAlerts';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  Filter,
  MapPin,
  MessageCircle,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { TrainingTrendChart } from './TrendCharts';
import { ExportActionMenu } from './ExportActionMenu';
import { BottomSheetSelect } from './BottomSheetSelect';
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { WhatsAppNotifyModal, WhatsAppRecipientItem } from './WhatsAppNotifyModal';
import { buildScheduleNotificationMessage, ScheduleMessageInput } from '../lib/whatsapp';
import { batchSetQueryParams, useQueryParam } from '../lib/useQueryParams';

interface SchedulesAndAttendanceViewProps {
  club: ClubProfile;
  userId: string;
  schedules: TrainingSchedule[];
  athletes: Athlete[];
  attendance: AttendanceRecord[];
  coaches?: Coach[];
  pools?: PoolFacility[];
  onOpenPrintReport: () => void;
}

export const SchedulesAndAttendanceView: React.FC<SchedulesAndAttendanceViewProps> = ({
  club,
  userId,
  schedules,
  athletes,
  attendance,
  coaches = [],
  pools = [],
  onOpenPrintReport,
}) => {
  const [activeTab, setActiveTab] = useQueryParam<'schedules' | 'attendance'>(
    'jd_tab',
    'schedules',
    { allowed: ['schedules', 'attendance'], history: 'push' }
  );
  const [dayFilter, setDayFilter] = useQueryParam('jd_hari', 'all');
  const [ageFilter, setAgeFilter] = useQueryParam('jd_ku', 'all');

  // Schedule Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<TrainingSchedule | null>(null);
  const [title, setTitle] = useState('');
  const [sessionType, setSessionType] = useState<ScheduleSessionType>('Teknik & Stroke');
  const [ageGroup, setAgeGroup] = useState<ScheduleAgeGroup>('Semua Kelompok');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>('Senin');
  const [sessionDate, setSessionDate] = useState('');
  const [startTime, setStartTime] = useState('15:30');
  const [endTime, setEndTime] = useState('17:30');
  const [poolLocation, setPoolLocation] = useState('Kolam Utama (50m)');
  const [laneInfo, setLaneInfo] = useState('Lintasan 1–4');
  const [coachName, setCoachName] = useState(club.headCoach);
  const [targetDistance, setTargetDistance] = useState('3000');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [notifyWaOnSave, setNotifyWaOnSave] = useState(false);
  const [waScheduleModal, setWaScheduleModal] = useState<{
    title: string;
    description: string;
    groupBroadcastMessage: string;
    recipients: WhatsAppRecipientItem[];
  } | null>(null);

  // Attendance controls (synced to URL query params)
  const [selectedScheduleId, setSelectedScheduleId] = useQueryParam('pr_sesi', '');
  const [attendanceDate, setAttendanceDate] = useQueryParam('pr_tgl', todayISO());
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  const dayOrder = useMemo(() => {
    const map = new Map<string, number>();
    DAYS_OF_WEEK.forEach((d, idx) => map.set(d, idx));
    return map;
  }, []);

  const poolQuickPickOptions = useMemo(
    () =>
      pools.map((p) => ({
        value: p.id,
        label: p.name,
        badge: `${p.laneCount} lintasan`,
        description: `${p.poolType} · ${p.status}${p.address ? ` · ${p.address}` : ''}`,
      })),
    [pools]
  );

  const coachQuickPickOptions = useMemo(() => {
    const active = coaches.filter((c) => c.status !== 'Nonaktif');
    const source = active.length > 0 ? active : coaches;
    return source.map((c) => ({
      value: c.fullName,
      label: c.fullName,
      badge: c.role,
      description: `${c.licenseLevel}${c.specialization ? ` · ${c.specialization}` : ''}`,
    }));
  }, [coaches]);

  const filteredSchedules = useMemo(() => {
    return [...schedules]
      .filter((s) => {
        if (dayFilter !== 'all' && s.dayOfWeek !== dayFilter) return false;
        if (ageFilter !== 'all' && s.ageGroup !== ageFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const dDiff = (dayOrder.get(a.dayOfWeek) ?? 0) - (dayOrder.get(b.dayOfWeek) ?? 0);
        if (dDiff !== 0) return dDiff;
        return a.startTime.localeCompare(b.startTime);
      });
  }, [schedules, dayFilter, ageFilter, dayOrder]);

  const activeSchedule = useMemo(
    () => schedules.find((s) => s.id === selectedScheduleId) || schedules[0] || null,
    [schedules, selectedScheduleId]
  );

  const matchingAthletesForSession = useMemo(() => {
    if (!activeSchedule) return [];
    return athletes
      .filter((a) => {
        if (a.status === 'Nonaktif') return false;
        if (activeSchedule.ageGroup !== 'Semua Kelompok' && a.ageGroup !== activeSchedule.ageGroup) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [athletes, activeSchedule]);

  const { alerts: consecutiveAbsenceAlerts, alertByAthleteId: absenceAlertByAthleteId } = useMemo(
    () => computeConsecutiveAbsences(athletes, attendance, club, 3),
    [athletes, attendance, club]
  );

  const {
    visibleItems: visibleSchedules,
    visibleCount: visibleScheduleCount,
    totalCount: totalScheduleCount,
    hasMore: hasMoreSchedules,
    loadMore: loadMoreSchedules,
    sentinelRef: schedulesSentinelRef,
  } = useInfiniteScroll(filteredSchedules, {
    initialCount: 12,
    step: 12,
    resetKey: `${activeTab}|${dayFilter}|${ageFilter}`,
  });

  const {
    visibleItems: visibleAttendanceAthletes,
    visibleCount: visibleAttendanceCount,
    totalCount: totalAttendanceCount,
    hasMore: hasMoreAttendance,
    loadMore: loadMoreAttendance,
    sentinelRef: attendanceSentinelRef,
  } = useInfiniteScroll(matchingAthletesForSession, {
    initialCount: 20,
    step: 20,
    resetKey: `${activeTab}|${activeSchedule?.id || ''}|${attendanceDate}`,
  });

  const attendanceMapForSession = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    if (!activeSchedule) return map;
    for (const rec of attendance) {
      if (rec.scheduleId === activeSchedule.id && rec.sessionDate === attendanceDate) {
        map.set(rec.athleteId, rec);
      }
    }
    return map;
  }, [attendance, activeSchedule, attendanceDate]);

  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const openCreateModal = () => {
    setEditingSchedule(null);
    setTitle('');
    setSessionType('Teknik & Stroke');
    setAgeGroup('Semua Kelompok');
    setDayOfWeek('Senin');
    setSessionDate('');
    setStartTime('15:30');
    setEndTime('17:30');
    setPoolLocation('Kolam Renang Pajajaran (50m)');
    setLaneInfo('Lintasan 1–4');
    setCoachName(club.headCoach);
    setTargetDistance('3000');
    setNotes('');
    setErrorMsg(null);
    setFieldErrors({});
    setNotifyWaOnSave(false);
    setModalOpen(true);
  };

  const openEditModal = (sch: TrainingSchedule) => {
    setEditingSchedule(sch);
    setTitle(sch.title);
    setSessionType(sch.sessionType);
    setAgeGroup(sch.ageGroup);
    setDayOfWeek(sch.dayOfWeek);
    setSessionDate(sch.sessionDate || '');
    setStartTime(sch.startTime);
    setEndTime(sch.endTime);
    setPoolLocation(sch.poolLocation);
    setLaneInfo(sch.laneInfo || '');
    setCoachName(sch.coachName);
    setTargetDistance(String(sch.targetDistanceMeters));
    setNotes(sch.notes || '');
    setErrorMsg(null);
    setFieldErrors({});
    setNotifyWaOnSave(true);
    setModalOpen(true);
  };

  const openScheduleWhatsApp = (sch: ScheduleMessageInput, isUpdated: boolean) => {
    const matchingAthletes = athletes
      .filter(
        (a) =>
          a.status !== 'Nonaktif' &&
          (sch.ageGroup === 'Semua Kelompok' || a.ageGroup === sch.ageGroup)
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const groupBroadcastMessage = buildScheduleNotificationMessage(club, sch, { isUpdated });
    const recipients: WhatsAppRecipientItem[] = matchingAthletes.map((ath) => ({
      id: ath.id,
      athleteName: ath.fullName,
      parentName: ath.parentName || '',
      parentPhone: ath.parentPhone || '',
      subtitle: ath.ageGroup,
      message: buildScheduleNotificationMessage(club, sch, {
        isUpdated,
        parentName: ath.parentName,
        athleteName: ath.fullName,
      }),
    }));

    setWaScheduleModal({
      title: isUpdated
        ? `Kabari Perubahan Jadwal: ${sch.title}`
        : `Bagikan Jadwal Latihan: ${sch.title}`,
      description: `${matchingAthletes.length} atlet aktif di kelompok ${sch.ageGroup} (${sch.dayOfWeek}, ${sch.startTime}–${sch.endTime}). Kirim ke grup atau per orang tua.`,
      groupBroadcastMessage,
      recipients,
    });
  };

  const openAbsenceFollowUpWhatsApp = (targetAlerts: ConsecutiveAbsenceAlert[]) => {
    if (targetAlerts.length === 0) return;
    const isSingle = targetAlerts.length === 1;
    const first = targetAlerts[0];
    const recipients: WhatsAppRecipientItem[] = targetAlerts.map((al) => ({
      id: al.athlete.id,
      athleteName: al.athlete.fullName,
      parentName: al.athlete.parentName || '',
      parentPhone: al.athlete.parentPhone || '',
      subtitle: `Absen ${al.streak}x beruntun (${al.breakdownSummary})`,
      message: al.whatsappMessage,
    }));

    setWaScheduleModal({
      title: isSingle
        ? `Tindak Lanjut Presensi: ${first.athlete.fullName}`
        : `Hubungi Orang Tua Atlet Absen >=3x (${targetAlerts.length} atlet)`,
      description: isSingle
        ? `Atlet tercatat tidak hadir ${first.streak} sesi berturut-turut (${first.breakdownSummary}). Kirim pesan perhatian ke orang tua/wali.`
        : `Daftar atlet yang tidak hadir 3 sesi berturut-turut atau lebih. Kirim konfirmasi kehadiran satu per satu ke orang tua.`,
      groupBroadcastMessage: first.whatsappMessage,
      recipients,
    });
  };

  const liveSessionDurationMinutes = useMemo(() => {
    if (!isValidBlueprintTime(startTime) || !isValidBlueprintTime(endTime)) return null;
    return timeToMinutes(endTime) - timeToMinutes(startTime);
  }, [startTime, endTime]);

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const validation = validateScheduleInput(
      {
        title,
        sessionType,
        ageGroup,
        dayOfWeek,
        sessionDate,
        startTime,
        endTime,
        poolLocation,
        laneInfo,
        coachName,
        targetDistance,
        notes,
      },
      schedules,
      editingSchedule?.id
    );

    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      setErrorMsg(validation.summaryError || 'Periksa kembali kolom jadwal yang ditandai merah.');
      return;
    }
    setFieldErrors({});

    const isEditing = Boolean(editingSchedule);
    setSaving(true);
    try {
      const payload = {
        title: clampString(title, LIMITS.schedule.titleMax),
        sessionType,
        ageGroup,
        dayOfWeek,
        sessionDate: sessionDate.trim(),
        startTime,
        endTime,
        poolLocation: clampString(poolLocation, LIMITS.schedule.poolLocationMax),
        laneInfo: clampString(laneInfo, LIMITS.schedule.laneInfoMax),
        coachName: clampString(coachName, LIMITS.schedule.coachNameMax),
        targetDistanceMeters: validation.parsedDistance,
        notes: clampString(notes, LIMITS.schedule.notesMax),
      };

      if (editingSchedule) {
        await updateDoc(doc(db, 'schedules', editingSchedule.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        }).catch((err) =>
          handleFirestoreError(err, OperationType.UPDATE, `schedules/${editingSchedule.id}`)
        );
      } else {
        await addDoc(collection(db, 'schedules'), {
          ...payload,
          clubId: club.id,
          ownerId: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.CREATE, 'schedules'));
      }
      setModalOpen(false);
      if (notifyWaOnSave) {
        openScheduleWhatsApp(payload, isEditing);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan jadwal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (sch: TrainingSchedule) => {
    setListError(null);
    try {
      await deleteDoc(doc(db, 'schedules', sch.id));
      setConfirmDeleteId(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Gagal menghapus jadwal.');
      handleFirestoreError(err, OperationType.DELETE, `schedules/${sch.id}`);
    }
  };

  const attendanceDateError = useMemo(() => validateAttendanceDate(attendanceDate), [attendanceDate]);

  const attendanceDayMismatchWarning = useMemo(() => {
    if (!activeSchedule || attendanceDateError || !isValidBlueprintDate(attendanceDate)) return null;
    const pickedDay = getDayOfWeekFromDate(attendanceDate);
    if (pickedDay && pickedDay !== activeSchedule.dayOfWeek) {
      return `Tanggal ${formatDateID(attendanceDate)} adalah hari ${pickedDay}, sedangkan jadwal "${activeSchedule.title}" rutin hari ${activeSchedule.dayOfWeek}.`;
    }
    return null;
  }, [activeSchedule, attendanceDate, attendanceDateError]);

  const handleMarkAttendance = async (athlete: Athlete, status: AttendanceStatus) => {
    setAttendanceError(null);
    if (!activeSchedule) {
      setAttendanceError('Pilih sesi latihan terlebih dahulu.');
      return;
    }
    const dateErr = validateAttendanceDate(attendanceDate);
    if (dateErr) {
      setAttendanceError(dateErr);
      return;
    }
    if (!ATTENDANCE_STATUSES.includes(status)) {
      setAttendanceError('Status presensi tidak valid.');
      return;
    }

    setMarkingId(athlete.id);
    const existingRec = attendanceMapForSession.get(athlete.id);
    try {
      if (existingRec) {
        await updateDoc(doc(db, 'attendance', existingRec.id), {
          status,
          updatedAt: serverTimestamp(),
        }).catch((err) =>
          handleFirestoreError(err, OperationType.UPDATE, `attendance/${existingRec.id}`)
        );
      } else {
        await addDoc(collection(db, 'attendance'), {
          clubId: club.id,
          ownerId: userId,
          scheduleId: activeSchedule.id,
          scheduleTitle: clampString(activeSchedule.title, LIMITS.schedule.titleMax),
          sessionDate: attendanceDate,
          athleteId: athlete.id,
          athleteName: clampString(athlete.fullName, LIMITS.athlete.fullNameMax),
          status,
          notes: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.CREATE, 'attendance'));
      }
    } catch (err) {
      setAttendanceError(err instanceof Error ? err.message : 'Gagal menyimpan presensi.');
    } finally {
      setMarkingId(null);
    }
  };

  const attendanceSummary = useMemo(() => {
    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;
    attendanceMapForSession.forEach((rec) => {
      if (rec.status === 'Hadir') hadir++;
      else if (rec.status === 'Izin') izin++;
      else if (rec.status === 'Sakit') sakit++;
      else if (rec.status === 'Alpa') alpa++;
    });
    return { hadir, izin, sakit, alpa, totalMarked: attendanceMapForSession.size };
  }, [attendanceMapForSession]);

  const handleExportSchedulesCSV = () => {
    downloadCSV(
      `jadwal-latihan-${club.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
      ['Hari', 'Tanggal Khusus', 'Mulai', 'Selesai', 'Judul Sesi', 'Fokus', 'Kelompok', 'Kolam', 'Lintasan', 'Pelatih', 'Target (m)', 'Catatan'],
      filteredSchedules.map((s) => [
        s.dayOfWeek,
        s.sessionDate || 'Rutin',
        s.startTime,
        s.endTime,
        s.title,
        s.sessionType,
        s.ageGroup,
        s.poolLocation,
        s.laneInfo || '-',
        s.coachName,
        s.targetDistanceMeters,
        s.notes || '-',
      ])
    );
  };

  const handleExportAttendanceCSV = () => {
    const sorted = [...attendance].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
    downloadCSV(
      `presensi-latihan-${club.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
      ['Tanggal', 'Sesi Latihan', 'Nama Atlet', 'Status', 'Catatan'],
      sorted.map((rec) => [
        rec.sessionDate,
        rec.scheduleTitle,
        rec.athleteName,
        rec.status,
        rec.notes || '-',
      ])
    );
  };

  const handleExportSchedulesExcel = () => {
    downloadExcelWorkbook(
      `jadwal-dan-presensi-${club.name.toLowerCase().replace(/\s+/g, '-')}.xlsx`,
      [buildSchedulesSheet(filteredSchedules), buildAttendanceSheet(attendance)]
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
        <div>
          <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900">
            Jadwal Latihan & Presensi Atlet
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Atur sesi latihan mingguan per lintasan kolam, target jarak meter, dan catat kehadiran atlet.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
          <ExportActionMenu
            label="Ekspor & Cetak"
            options={[
              {
                id: 'sch-pdf',
                label: 'Download PDF (.pdf)',
                description: 'Rekap jadwal latihan, presensi & flag absen 3x',
                format: 'pdf',
                disabled: schedules.length === 0 && attendance.length === 0,
                onSelect: () =>
                  downloadClubSummaryPdf({
                    kind: 'schedules',
                    club,
                    athletes,
                    schedules: filteredSchedules,
                    attendance,
                    periodLabel: 'Jadwal & Presensi Aktif',
                  }),
              },
              {
                id: 'sch-excel',
                label: 'Ekspor Excel (.xlsx)',
                description: '2 sheet: Matriks Jadwal & Log Presensi',
                format: 'excel',
                disabled: schedules.length === 0 && attendance.length === 0,
                onSelect: handleExportSchedulesExcel,
              },
              {
                id: 'sch-ics',
                label: 'Kalender (.ics)',
                description: 'Impor jadwal ke Google Calendar / Apple Calendar',
                format: 'ics',
                disabled: filteredSchedules.length === 0,
                onSelect: () => downloadSchedulesICS(club, filteredSchedules),
              },
              {
                id: 'sch-csv',
                label: 'CSV Jadwal Latihan',
                description: `${filteredSchedules.length} sesi terjadwal`,
                format: 'csv',
                disabled: filteredSchedules.length === 0,
                onSelect: handleExportSchedulesCSV,
              },
              {
                id: 'att-csv',
                label: 'CSV Rekap Presensi',
                description: `${attendance.length} catatan kehadiran`,
                format: 'csv',
                disabled: attendance.length === 0,
                onSelect: handleExportAttendanceCSV,
              },
              {
                id: 'sch-print',
                label: 'Mode Cetak Laporan A4',
                description: 'Pratinjau dokumen cetak jadwal & presensi',
                format: 'print',
                dividerBefore: true,
                onSelect: onOpenPrintReport,
              },
            ]}
          />
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Jadwal Latihan
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('schedules')}
          className={`px-3 sm:px-4 min-h-[44px] sm:min-h-[36px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
            activeTab === 'schedules'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Jadwal Latihan ({schedules.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={`px-3 sm:px-4 min-h-[44px] sm:min-h-[36px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
            activeTab === 'attendance'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Presensi Sesi
          {consecutiveAbsenceAlerts.length > 0 && (
            <span className="ml-1.5 text-red-600 font-mono-tabular">
              · {consecutiveAbsenceAlerts.length} absen 3x+
            </span>
          )}
        </button>
      </div>

      {/* Training Volume & Attendance Trends */}
      <TrainingTrendChart schedules={schedules} attendance={attendance} />

      {activeTab === 'schedules' ? (
        <>
          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 sm:max-w-lg">
              <BottomSheetSelect
                value={dayFilter}
                onChange={setDayFilter}
                title="Filter Hari Latihan"
                subtitle="Tampilkan jadwal latihan berdasarkan hari rutin."
                triggerPrefix="Hari:"
                icon={<Calendar className="w-3.5 h-3.5" />}
                resetValue="all"
                resetLabel="Semua Hari"
                options={[
                  { value: 'all', label: 'Semua Hari', badge: `${schedules.length} sesi` },
                  ...DAYS_OF_WEEK.map((d) => ({
                    value: d,
                    label: d,
                    badge: `${schedules.filter((s) => s.dayOfWeek === d).length} sesi`,
                  })),
                ]}
              />

              <BottomSheetSelect
                value={ageFilter}
                onChange={setAgeFilter}
                title="Filter Kelompok Umur"
                subtitle="Pilih kelompok umur atau gabungan semua kelompok."
                triggerPrefix="Kelompok:"
                icon={<Filter className="w-3.5 h-3.5" />}
                resetValue="all"
                resetLabel="Semua"
                options={[
                  { value: 'all', label: 'Semua Kelompok' },
                  { value: 'Semua Kelompok', label: 'Semua Kelompok (Gabungan)' },
                  ...AGE_GROUPS.map((g) => ({ value: g, label: g })),
                ]}
              />
            </div>

            <span className="text-xs font-mono-tabular text-slate-500">
              {filteredSchedules.length} jadwal ditampilkan
            </span>
          </div>

          {listError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
              {listError}
            </div>
          )}

          {/* Schedule Grid */}
          {filteredSchedules.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-medium text-slate-900">Belum ada jadwal latihan</p>
              <p className="text-xs text-slate-500">
                Tambahkan jadwal latihan kolam dan dryland untuk setiap kelompok umur.
              </p>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-700 text-white text-xs font-medium rounded-lg hover:bg-sky-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Buat Jadwal Pertama
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleSchedules.map((sch) => (
                  <div
                    key={sch.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs font-medium text-sky-700">
                          {sch.dayOfWeek}
                          {sch.sessionDate ? ` (${formatDateID(sch.sessionDate)})` : ''} ·{' '}
                          <span className="font-mono-tabular">{sch.startTime}–{sch.endTime}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {confirmDeleteId === sch.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteSchedule(sch)}
                                className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded hover:bg-red-700 cursor-pointer"
                              >
                                Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(sch)}
                                className="p-1.5 text-slate-400 hover:text-slate-800 rounded cursor-pointer"
                                title="Edit jadwal"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(sch.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                title="Hapus jadwal"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="font-display text-base font-semibold text-slate-900">
                          {sch.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {sch.sessionType} · {sch.ageGroup}
                        </p>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {sch.poolLocation}
                            {sch.laneInfo ? ` (${sch.laneInfo})` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{sch.coachName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono-tabular">
                            Target volume: {sch.targetDistanceMeters.toLocaleString('id-ID')} meter
                          </span>
                        </div>
                      </div>

                      {sch.notes && (
                        <p className="text-xs text-slate-500 leading-relaxed">{sch.notes}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAttendanceError(null);
                          batchSetQueryParams(
                            {
                              pr_sesi: sch.id,
                              ...(sch.sessionDate && sch.sessionDate <= todayISO()
                                ? { pr_tgl: sch.sessionDate }
                                : {}),
                              jd_tab: 'attendance',
                            },
                            'push'
                          );
                        }}
                        className="w-full min-h-[44px] sm:min-h-[36px] text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Isi Presensi
                      </button>
                      <button
                        type="button"
                        onClick={() => openScheduleWhatsApp(sch, true)}
                        className="w-full min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Kabari WA
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <InfiniteScrollSentinel
                  sentinelRef={schedulesSentinelRef}
                  visibleCount={visibleScheduleCount}
                  totalCount={totalScheduleCount}
                  hasMore={hasMoreSchedules}
                  onLoadMore={loadMoreSchedules}
                  itemLabel="jadwal latihan"
                />
              </div>
            </div>
          )}
        </>
      ) : (
        /* Attendance View */
        <div className="space-y-5">
          {schedules.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Buat jadwal latihan terlebih dahulu sebelum mencatat presensi atlet.
            </div>
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-3 flex-1">
                  <div className="sm:min-w-[260px] flex-1 sm:max-w-md">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Pilih Sesi Latihan
                    </label>
                    <BottomSheetSelect
                      value={activeSchedule?.id || ''}
                      onChange={(val) => setSelectedScheduleId(val)}
                      title="Pilih Sesi Latihan"
                      subtitle="Pilih jadwal latihan untuk mencatat presensi atlet."
                      searchable={schedules.length > 5}
                      options={schedules.map((s) => ({
                        value: s.id,
                        label: `${s.dayOfWeek} · ${s.title}`,
                        description: `${s.poolLocation} · ${s.coachName} · ${s.ageGroup}`,
                        badge: `${s.startTime}–${s.endTime}`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Tanggal Latihan
                    </label>
                    <input
                      type="date"
                      max={todayISO()}
                      value={attendanceDate}
                      onChange={(e) => {
                        setAttendanceDate(e.target.value);
                        setAttendanceError(null);
                      }}
                      className={`w-full sm:w-auto px-3 min-h-[44px] sm:min-h-[36px] text-sm sm:text-xs font-mono-tabular border rounded-lg ${
                        attendanceDateError ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 sm:flex items-center gap-2 sm:gap-4 text-xs text-slate-600 font-mono-tabular pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 text-center sm:text-left">
                  <span className="text-emerald-700 font-semibold">
                    Hadir: {attendanceSummary.hadir}
                  </span>
                  <span className="text-sky-700">Izin: {attendanceSummary.izin}</span>
                  <span className="text-amber-700">Sakit: {attendanceSummary.sakit}</span>
                  <span className="text-red-600">Alpa: {attendanceSummary.alpa}</span>
                </div>
              </div>

              {(attendanceDateError || attendanceError) && (
                <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{attendanceError || attendanceDateError}</span>
                </div>
              )}

              {attendanceDayMismatchWarning && !attendanceDateError && (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{attendanceDayMismatchWarning} Anda tetap dapat mencatat jika ini sesi pengganti.</span>
                </div>
              )}

              {consecutiveAbsenceAlerts.length > 0 && (
                <div className="bg-red-50/70 border border-red-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <h3 className="font-display text-sm font-bold text-red-950">
                          Peringatan Absen 3+ Sesi Berturut-turut ({consecutiveAbsenceAlerts.length} Atlet)
                        </h3>
                        <p className="text-xs text-red-800 mt-0.5">
                          Atlet di bawah ini tercatat tidak hadir minimal 3 sesi beruntun pada catatan terakhir. Disarankan menghubungi orang tua/wali.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAbsenceFollowUpWhatsApp(consecutiveAbsenceAlerts)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[34px] text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Kabari Wali ({consecutiveAbsenceAlerts.length})
                    </button>
                  </div>

                  <div className="divide-y divide-red-200/60 bg-white border border-red-200/80 rounded-lg overflow-hidden">
                    {consecutiveAbsenceAlerts.map((al) => (
                      <div
                        key={al.athlete.id}
                        className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-slate-900">
                              {al.athlete.fullName}
                            </span>
                            <span className="text-[11px] font-medium text-red-700 font-mono-tabular">
                              {al.streak}x absen beruntun ({al.breakdownSummary})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {al.athlete.ageGroup} · Terakhir {formatDateID(al.lastSessionDate)} ({al.lastSessionTitle}) · Wali: {al.athlete.parentName || '-'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openAbsenceFollowUpWhatsApp([al])}
                          className="inline-flex items-center justify-center gap-1 px-3 min-h-[36px] text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Follow Up WA
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {matchingAthletesForSession.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    Tidak ada atlet aktif pada kelompok umur sesi ini ({activeSchedule?.ageGroup}).
                  </div>
                ) : (
                  <>
                    {/* Mobile Attendance Cards */}
                    <div className="md:hidden divide-y divide-slate-100">
                      {visibleAttendanceAthletes.map((ath) => {
                        const rec = attendanceMapForSession.get(ath.id);
                        const streakAlert = absenceAlertByAthleteId.get(ath.id);
                        return (
                          <div
                            key={ath.id}
                            className={`p-4 space-y-3 ${
                              streakAlert ? 'bg-red-50/30' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium text-sm text-slate-900">
                                  {ath.fullName}
                                </div>
                                <div className="text-xs text-slate-500">{ath.ageGroup}</div>
                                {streakAlert && (
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                      Absen {streakAlert.streak}x beruntun ({streakAlert.breakdownSummary})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => openAbsenceFollowUpWhatsApp([streakAlert])}
                                      className="text-[11px] font-semibold text-emerald-700 underline cursor-pointer"
                                    >
                                      Kabari WA
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="text-xs font-medium shrink-0">
                                {rec ? (
                                  <span
                                    className={
                                      rec.status === 'Hadir'
                                        ? 'text-emerald-700'
                                        : rec.status === 'Izin'
                                        ? 'text-sky-700'
                                        : rec.status === 'Sakit'
                                        ? 'text-amber-700'
                                        : 'text-red-600'
                                    }
                                  >
                                    {rec.status}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Belum dicatat</span>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-lg">
                              {ATTENDANCE_STATUSES.map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  disabled={markingId === ath.id || !!attendanceDateError}
                                  onClick={() => handleMarkAttendance(ath, st)}
                                  className={`min-h-[44px] text-xs font-medium rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
                                    rec?.status === st
                                      ? 'bg-white text-slate-900 shadow-sm'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {st}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Attendance Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                            <th className="py-3 px-4">Atlet</th>
                            <th className="py-3 px-4">Kelompok Umur</th>
                            <th className="py-3 px-4">Status ({formatDateID(attendanceDate)})</th>
                            <th className="py-3 px-4 text-right">Ubah Kehadiran</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {visibleAttendanceAthletes.map((ath) => {
                            const rec = attendanceMapForSession.get(ath.id);
                            const streakAlert = absenceAlertByAthleteId.get(ath.id);
                            return (
                              <tr
                                key={ath.id}
                                className={
                                  streakAlert
                                    ? 'bg-red-50/35 hover:bg-red-50/60'
                                    : 'hover:bg-slate-50/80'
                                }
                              >
                                <td className="py-3 px-4">
                                  <div className="font-medium text-slate-900">{ath.fullName}</div>
                                  {streakAlert && (
                                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                                      <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                        Absen {streakAlert.streak}x beruntun ({streakAlert.breakdownSummary})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => openAbsenceFollowUpWhatsApp([streakAlert])}
                                        className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                                      >
                                        Follow Up WA
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-600">{ath.ageGroup}</td>
                                <td className="py-3 px-4 text-xs font-medium">
                                  {rec ? (
                                    <span
                                      className={`inline-flex items-center gap-1 ${
                                        rec.status === 'Hadir'
                                          ? 'text-emerald-700'
                                          : rec.status === 'Izin'
                                          ? 'text-sky-700'
                                          : rec.status === 'Sakit'
                                          ? 'text-amber-700'
                                          : 'text-red-600'
                                      }`}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      {rec.status}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">Belum dicatat</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                                    {ATTENDANCE_STATUSES.map((st) => (
                                      <button
                                        key={st}
                                        type="button"
                                        disabled={markingId === ath.id || !!attendanceDateError}
                                        onClick={() => handleMarkAttendance(ath, st)}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
                                          rec?.status === st
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                      >
                                        {st}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <InfiniteScrollSentinel
                      sentinelRef={attendanceSentinelRef}
                      visibleCount={visibleAttendanceCount}
                      totalCount={totalAttendanceCount}
                      hasMore={hasMoreAttendance}
                      onLoadMore={loadMoreAttendance}
                      itemLabel="atlet"
                    />
                  </>
                )}
              </div>
            </>
          )}
          </div>
        )}

      {/* Add/Edit Schedule Modal (Bottom sheet on mobile) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                {editingSchedule ? 'Edit Jadwal Latihan' : 'Tambah Jadwal Latihan'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal jadwal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} noValidate className="mt-5 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Program / Sesi Latihan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.schedule.titleMax}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearFieldError('title');
                  }}
                  placeholder="Contoh: Latihan Sprint & Start Block"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    fieldErrors.title ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                  }`}
                />
                {fieldErrors.title && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Fokus Latihan
                  </label>
                  <BottomSheetSelect
                    value={sessionType}
                    onChange={(val) => {
                      const nextType = val as ScheduleSessionType;
                      setSessionType(nextType);
                      if (nextType === 'Latihan Fisik (Dryland)' && targetDistance === '3000') {
                        setTargetDistance('0');
                      }
                      clearFieldError('sessionType');
                      clearFieldError('targetDistance');
                    }}
                    title="Pilih Fokus Latihan"
                    hasError={Boolean(fieldErrors.sessionType)}
                    options={SESSION_TYPES.map((t) => ({ value: t, label: t }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kelompok Umur
                  </label>
                  <BottomSheetSelect
                    value={ageGroup}
                    onChange={(val) => {
                      setAgeGroup(val as ScheduleAgeGroup);
                      clearFieldError('ageGroup');
                    }}
                    title="Pilih Kelompok Umur"
                    hasError={Boolean(fieldErrors.ageGroup)}
                    options={[
                      { value: 'Semua Kelompok', label: 'Semua Kelompok' },
                      ...AGE_GROUPS.map((g) => ({ value: g, label: g })),
                    ]}
                  />
                  {fieldErrors.ageGroup && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.ageGroup}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Hari Rutin <span className="text-red-500">*</span>
                  </label>
                  <BottomSheetSelect
                    value={dayOfWeek}
                    onChange={(val) => {
                      setDayOfWeek(val as DayOfWeek);
                      clearFieldError('dayOfWeek');
                      clearFieldError('sessionDate');
                    }}
                    title="Pilih Hari Rutin"
                    hasError={Boolean(fieldErrors.dayOfWeek)}
                    options={DAYS_OF_WEEK.map((d) => ({ value: d, label: d }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Khusus (Opsional)
                  </label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSessionDate(val);
                      const derivedDay = getDayOfWeekFromDate(val);
                      if (derivedDay) {
                        setDayOfWeek(derivedDay);
                      }
                      clearFieldError('sessionDate');
                      clearFieldError('dayOfWeek');
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      fieldErrors.sessionDate ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                  />
                  {fieldErrors.sessionDate && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.sessionDate}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam Mulai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      clearFieldError('startTime');
                      clearFieldError('endTime');
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      fieldErrors.startTime ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                  />
                  {fieldErrors.startTime && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.startTime}</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Jam Selesai <span className="text-red-500">*</span>
                    </label>
                    {liveSessionDurationMinutes !== null && liveSessionDurationMinutes > 0 && (
                      <span className="font-mono-tabular text-[11px] text-slate-500">
                        {liveSessionDurationMinutes} mnt
                      </span>
                    )}
                  </div>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      clearFieldError('endTime');
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      fieldErrors.endTime ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                  />
                  {fieldErrors.endTime && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.endTime}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Lokasi Kolam / Fasilitas <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.schedule.poolLocationMax}
                    value={poolLocation}
                    onChange={(e) => {
                      setPoolLocation(e.target.value);
                      clearFieldError('poolLocation');
                      clearFieldError('laneInfo');
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                      fieldErrors.poolLocation ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                  />
                  {poolQuickPickOptions.length > 0 && (
                    <div className="mt-1.5">
                      <BottomSheetSelect
                        value={pools.find((p) => p.name === poolLocation)?.id || ''}
                        onChange={(poolId) => {
                          const picked = pools.find((p) => p.id === poolId);
                          if (!picked) return;
                          setPoolLocation(picked.name);
                          if (!laneInfo.trim() || !editingSchedule) {
                            setLaneInfo(`Lintasan 1–${Math.min(4, Math.max(1, picked.laneCount))}`);
                          }
                          clearFieldError('poolLocation');
                          clearFieldError('laneInfo');
                        }}
                        title="Pilih Kolam Terdaftar"
                        subtitle="Isi otomatis lokasi kolam dan informasi lintasan."
                        placeholder="Pilih dari daftar kolam klub..."
                        options={poolQuickPickOptions}
                      />
                    </div>
                  )}
                  {fieldErrors.poolLocation && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.poolLocation}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nomor Lintasan
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.schedule.laneInfoMax}
                    value={laneInfo}
                    onChange={(e) => {
                      setLaneInfo(e.target.value);
                      clearFieldError('laneInfo');
                    }}
                    placeholder="Lintasan 1–4"
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                      fieldErrors.laneInfo ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                  />
                  {fieldErrors.laneInfo && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.laneInfo}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pelatih Sesi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.schedule.coachNameMax}
                    value={coachName}
                    onChange={(e) => {
                      setCoachName(e.target.value);
                      clearFieldError('coachName');
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                      fieldErrors.coachName ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                  />
                  {coachQuickPickOptions.length > 0 && (
                    <div className="mt-1.5">
                      <BottomSheetSelect
                        value={
                          coachQuickPickOptions.some((c) => c.value === coachName) ? coachName : ''
                        }
                        onChange={(val) => {
                          setCoachName(val);
                          clearFieldError('coachName');
                        }}
                        title="Pilih Pelatih Sesi"
                        subtitle="Pilih dari daftar pelatih klub yang aktif."
                        placeholder="Pilih dari daftar pelatih..."
                        options={coachQuickPickOptions}
                      />
                    </div>
                  )}
                  {fieldErrors.coachName && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.coachName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Target Jarak (Meter) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30000}
                    step={50}
                    value={targetDistance}
                    onChange={(e) => {
                      setTargetDistance(e.target.value);
                      clearFieldError('targetDistance');
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      fieldErrors.targetDistance ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                  />
                  {fieldErrors.targetDistance && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.targetDistance}</p>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Instruksi / Perlengkapan Latihan
                  </label>
                  <span className="font-mono-tabular text-[11px] text-slate-400">
                    {notes.length}/{LIMITS.schedule.notesMax}
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={LIMITS.schedule.notesMax}
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    clearFieldError('notes');
                  }}
                  placeholder="Contoh: Bawa fins pendek, pullbuoy, dan botol minum."
                  className={`w-full px-3 py-2 text-base sm:text-sm border rounded-lg ${
                    fieldErrors.notes ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                  }`}
                />
                {fieldErrors.notes && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.notes}</p>
                )}
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/60 border border-emerald-200/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyWaOnSave}
                  onChange={(e) => setNotifyWaOnSave(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  Siapkan notifikasi <strong>WhatsApp orang tua</strong> otomatis setelah jadwal ini disimpan.
                </span>
              </label>

              <div className="pt-4 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <WhatsAppNotifyModal
        open={waScheduleModal !== null}
        onClose={() => setWaScheduleModal(null)}
        title={waScheduleModal?.title || 'Notifikasi Jadwal Latihan'}
        description={waScheduleModal?.description || ''}
        groupBroadcastMessage={waScheduleModal?.groupBroadcastMessage}
        groupBroadcastLabel="Pesan Siaran Grup WA Orang Tua"
        recipients={waScheduleModal?.recipients || []}
      />
    </div>
  );
};
