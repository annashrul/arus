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
import { clampString, isValidBlueprintDate, isValidBlueprintTime, LIMITS } from '../lib/validation';
import {
  AGE_GROUPS,
  Athlete,
  ATTENDANCE_STATUSES,
  AttendanceRecord,
  AttendanceStatus,
  ClubProfile,
  DAYS_OF_WEEK,
  DayOfWeek,
  formatDateID,
  ScheduleAgeGroup,
  ScheduleSessionType,
  SESSION_TYPES,
  todayISO,
  TrainingSchedule,
} from '../types/club';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  MapPin,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { TrainingTrendChart } from './TrendCharts';

interface SchedulesAndAttendanceViewProps {
  club: ClubProfile;
  userId: string;
  schedules: TrainingSchedule[];
  athletes: Athlete[];
  attendance: AttendanceRecord[];
}

export const SchedulesAndAttendanceView: React.FC<SchedulesAndAttendanceViewProps> = ({
  club,
  userId,
  schedules,
  athletes,
  attendance,
}) => {
  const [activeTab, setActiveTab] = useState<'schedules' | 'attendance'>('schedules');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [ageFilter, setAgeFilter] = useState<string>('all');

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

  // Attendance controls
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(schedules[0]?.id || '');
  const [attendanceDate, setAttendanceDate] = useState(todayISO());
  const [markingId, setMarkingId] = useState<string | null>(null);

  const dayOrder = useMemo(() => {
    const map = new Map<string, number>();
    DAYS_OF_WEEK.forEach((d, idx) => map.set(d, idx));
    return map;
  }, []);

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
    setModalOpen(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanTitle = clampString(title, LIMITS.schedule.titleMax);
    const cleanPool = clampString(poolLocation, LIMITS.schedule.poolLocationMax);
    const cleanCoach = clampString(coachName, LIMITS.schedule.coachNameMax);
    const parsedDist = Number(targetDistance);

    if (cleanTitle.length < 2) {
      setErrorMsg('Judul sesi latihan minimal 2 karakter.');
      return;
    }
    if (!isValidBlueprintTime(startTime) || !isValidBlueprintTime(endTime)) {
      setErrorMsg('Format jam mulai dan selesai harus HH:MM.');
      return;
    }
    if (sessionDate && !isValidBlueprintDate(sessionDate)) {
      setErrorMsg('Tanggal sesi opsional tidak valid.');
      return;
    }
    if (cleanPool.length < 2 || cleanCoach.length < 2) {
      setErrorMsg('Lokasi kolam dan nama pelatih wajib diisi.');
      return;
    }
    if (!Number.isFinite(parsedDist) || parsedDist < 0 || parsedDist > 30000) {
      setErrorMsg('Target jarak harus antara 0 hingga 30.000 meter.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: cleanTitle,
        sessionType,
        ageGroup,
        dayOfWeek,
        sessionDate: sessionDate || '',
        startTime,
        endTime,
        poolLocation: cleanPool,
        laneInfo: clampString(laneInfo, LIMITS.schedule.laneInfoMax),
        coachName: cleanCoach,
        targetDistanceMeters: Math.round(parsedDist),
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
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan jadwal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (sch: TrainingSchedule) => {
    try {
      await deleteDoc(doc(db, 'schedules', sch.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `schedules/${sch.id}`);
    }
  };

  const handleMarkAttendance = async (athlete: Athlete, status: AttendanceStatus) => {
    if (!activeSchedule) return;
    if (!isValidBlueprintDate(attendanceDate)) return;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Jadwal Latihan & Presensi Atlet
          </h1>
          <p className="text-sm text-slate-500">
            Atur sesi latihan mingguan per lintasan kolam, target jarak meter, dan catat kehadiran atlet.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Jadwal Latihan
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('schedules')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
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
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'attendance'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Presensi Sesi Latihan
        </button>
      </div>

      {/* Training Volume & Attendance Trends */}
      <TrainingTrendChart schedules={schedules} attendance={attendance} />

      {activeTab === 'schedules' ? (
        <>
          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDayFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  dayFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Hari
              </button>
              {DAYS_OF_WEEK.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDayFilter(d)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    dayFilter === d
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <select
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="all">Semua Kelompok</option>
              <option value="Semua Kelompok">Semua Kelompok (Gabungan)</option>
              {AGE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredSchedules.map((sch) => (
                <div
                  key={sch.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs font-medium text-sky-700">
                        {sch.dayOfWeek} · <span className="font-mono-tabular">{sch.startTime}–{sch.endTime}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(sch)}
                          className="p-1 text-slate-400 hover:text-slate-800 rounded cursor-pointer"
                          title="Edit jadwal"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSchedule(sch)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                          title="Hapus jadwal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedScheduleId(sch.id);
                      if (sch.sessionDate) setAttendanceDate(sch.sessionDate);
                      setActiveTab('attendance');
                    }}
                    className="w-full py-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Isi Presensi Sesi Ini
                  </button>
                </div>
              ))}
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
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="min-w-[240px] flex-1 max-w-md">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Pilih Sesi Latihan
                    </label>
                    <select
                      value={activeSchedule?.id || ''}
                      onChange={(e) => setSelectedScheduleId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                    >
                      {schedules.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.dayOfWeek} ({s.startTime}) — {s.title} [{s.ageGroup}]
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Tanggal Latihan
                    </label>
                    <input
                      type="date"
                      value={attendanceDate}
                      onChange={(e) => setAttendanceDate(e.target.value)}
                      className="px-3 py-2 text-xs font-mono-tabular border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-600 font-mono-tabular">
                  <span className="text-emerald-700 font-semibold">
                    Hadir: {attendanceSummary.hadir}
                  </span>
                  <span className="text-sky-700">Izin: {attendanceSummary.izin}</span>
                  <span className="text-amber-700">Sakit: {attendanceSummary.sakit}</span>
                  <span className="text-red-600">Alpa: {attendanceSummary.alpa}</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {matchingAthletesForSession.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    Tidak ada atlet aktif pada kelompok umur sesi ini ({activeSchedule?.ageGroup}).
                  </div>
                ) : (
                  <>
                    {/* Mobile Attendance Cards */}
                    <div className="md:hidden divide-y divide-slate-100">
                      {matchingAthletesForSession.map((ath) => {
                        const rec = attendanceMapForSession.get(ath.id);
                        return (
                          <div key={ath.id} className="p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="font-medium text-sm text-slate-900">
                                  {ath.fullName}
                                </div>
                                <div className="text-xs text-slate-500">{ath.ageGroup}</div>
                              </div>
                              <div className="text-xs font-medium">
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
                                  disabled={markingId === ath.id}
                                  onClick={() => handleMarkAttendance(ath, st)}
                                  className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
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
                          {matchingAthletesForSession.map((ath) => {
                            const rec = attendanceMapForSession.get(ath.id);
                            return (
                              <tr key={ath.id} className="hover:bg-slate-50/80">
                                <td className="py-3 px-4 font-medium text-slate-900">
                                  {ath.fullName}
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
                                        disabled={markingId === ath.id}
                                        onClick={() => handleMarkAttendance(ath, st)}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
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
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Add/Edit Schedule Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {editingSchedule ? 'Edit Jadwal Latihan' : 'Tambah Jadwal Latihan'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="mt-5 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Program / Sesi Latihan
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.schedule.titleMax}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Latihan Sprint & Start Block"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Fokus Latihan
                  </label>
                  <select
                    value={sessionType}
                    onChange={(e) => setSessionType(e.target.value as ScheduleSessionType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {SESSION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kelompok Umur
                  </label>
                  <select
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value as ScheduleAgeGroup)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Semua Kelompok">Semua Kelompok</option>
                    {AGE_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Hari</label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam Mulai
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam Selesai
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Lokasi Kolam / Fasilitas
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={LIMITS.schedule.poolLocationMax}
                    value={poolLocation}
                    onChange={(e) => setPoolLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nomor Lintasan
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.schedule.laneInfoMax}
                    value={laneInfo}
                    onChange={(e) => setLaneInfo(e.target.value)}
                    placeholder="Lintasan 1–4"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pelatih Sesi
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={LIMITS.schedule.coachNameMax}
                    value={coachName}
                    onChange={(e) => setCoachName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Target Jarak (Meter)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={30000}
                    value={targetDistance}
                    onChange={(e) => setTargetDistance(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Instruksi / Perlengkapan Latihan
                </label>
                <textarea
                  rows={2}
                  maxLength={LIMITS.schedule.notesMax}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Bawa fins pendek, pullbuoy, dan botol minum."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
