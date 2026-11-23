import React, { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString, isValidBlueprintDate, LIMITS } from '../lib/validation';
import {
  AGE_GROUPS,
  AgeGroup,
  Athlete,
  AthleteGender,
  AthleteStatus,
  ClubInvoice,
  ClubProfile,
  downloadCSV,
  formatDateID,
  formatRupiah,
  formatSwimTimeMs,
  MEDAL_TYPES,
  MedalType,
  parseSwimTimeToMs,
  POOL_COURSES,
  PoolCourse,
  SWIM_DISTANCES,
  SWIM_STROKES,
  SwimStroke,
  SwimTime,
  todayISO,
} from '../types/club';
import {
  Award,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  Plus,
  Search,
  Timer,
  Trash2,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react';
import { SwimTimeTrendChart } from './TrendCharts';

interface AthletesAndTimesViewProps {
  club: ClubProfile;
  userId: string;
  athletes: Athlete[];
  swimTimes: SwimTime[];
  invoices: ClubInvoice[];
}

export const AthletesAndTimesView: React.FC<AthletesAndTimesViewProps> = ({
  club,
  userId,
  athletes,
  swimTimes,
  invoices,
}) => {
  const [activeTab, setActiveTab] = useState<'athletes' | 'times'>('athletes');

  // Athlete filters
  const [athleteSearch, setAthleteSearch] = useState('');
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Swim times filters
  const [timeSearch, setTimeSearch] = useState('');
  const [strokeFilter, setStrokeFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [onlyPB, setOnlyPB] = useState(false);

  // Selected athlete detail drawer
  const [detailAthlete, setDetailAthlete] = useState<Athlete | null>(null);

  // Athlete modal state
  const [athleteModalOpen, setAthleteModalOpen] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState<Athlete | null>(null);
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<AthleteGender>('Putra');
  const [birthDate, setBirthDate] = useState('2013-01-01');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('KU III');
  const [status, setStatus] = useState<AthleteStatus>('Aktif');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [coachName, setCoachName] = useState(club.headCoach);
  const [monthlyFee, setMonthlyFee] = useState(String(club.defaultMonthlyFee));
  const [joinDate, setJoinDate] = useState(todayISO());
  const [athleteNotes, setAthleteNotes] = useState('');
  const [athleteError, setAthleteError] = useState<string | null>(null);
  const [savingAthlete, setSavingAthlete] = useState(false);

  // SwimTime modal state
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [editingTime, setEditingTime] = useState<SwimTime | null>(null);
  const [stAthleteId, setStAthleteId] = useState('');
  const [stStroke, setStStroke] = useState<SwimStroke>('Gaya Bebas');
  const [stDistance, setStDistance] = useState<number>(50);
  const [stPoolCourse, setStPoolCourse] = useState<PoolCourse>('50m (LCM)');
  const [stTimeInput, setStTimeInput] = useState('');
  const [stChampionship, setStChampionship] = useState('');
  const [stMeetDate, setStMeetDate] = useState(todayISO());
  const [stLocation, setStLocation] = useState('');
  const [stMedal, setStMedal] = useState<MedalType>('Peserta');
  const [stIsPB, setStIsPB] = useState(true);
  const [stNotes, setStNotes] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [savingTime, setSavingTime] = useState(false);

  const filteredAthletes = useMemo(() => {
    const q = athleteSearch.trim().toLowerCase();
    return [...athletes]
      .filter((a) => {
        if (ageGroupFilter !== 'all' && a.ageGroup !== ageGroupFilter) return false;
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (q) {
          const hay = `${a.fullName} ${a.parentName || ''} ${a.coachName || ''} ${a.ageGroup}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [athletes, athleteSearch, ageGroupFilter, statusFilter]);

  const filteredTimes = useMemo(() => {
    const q = timeSearch.trim().toLowerCase();
    return [...swimTimes]
      .filter((t) => {
        if (strokeFilter !== 'all' && t.stroke !== strokeFilter) return false;
        if (courseFilter !== 'all' && t.poolCourse !== courseFilter) return false;
        if (onlyPB && !t.isPersonalBest) return false;
        if (q) {
          const hay = `${t.athleteName} ${t.eventName} ${t.championshipName} ${t.location || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.meetDate.localeCompare(a.meetDate));
  }, [swimTimes, timeSearch, strokeFilter, courseFilter, onlyPB]);

  const athletePBMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const st of swimTimes) {
      if (st.isPersonalBest) {
        map.set(st.athleteId, (map.get(st.athleteId) || 0) + 1);
      }
    }
    return map;
  }, [swimTimes]);

  const openCreateAthlete = () => {
    setEditingAthlete(null);
    setFullName('');
    setGender('Putra');
    setBirthDate('2014-05-10');
    setAgeGroup('KU IV');
    setStatus('Aktif');
    setParentName('');
    setParentPhone('');
    setCoachName(club.headCoach);
    setMonthlyFee(String(club.defaultMonthlyFee));
    setJoinDate(todayISO());
    setAthleteNotes('');
    setAthleteError(null);
    setAthleteModalOpen(true);
  };

  const openEditAthlete = (ath: Athlete) => {
    setEditingAthlete(ath);
    setFullName(ath.fullName);
    setGender(ath.gender);
    setBirthDate(ath.birthDate);
    setAgeGroup(ath.ageGroup);
    setStatus(ath.status);
    setParentName(ath.parentName || '');
    setParentPhone(ath.parentPhone || '');
    setCoachName(ath.coachName || club.headCoach);
    setMonthlyFee(String(ath.monthlyFee));
    setJoinDate(ath.joinDate);
    setAthleteNotes(ath.notes || '');
    setAthleteError(null);
    setAthleteModalOpen(true);
  };

  const handleSaveAthlete = async (e: React.FormEvent) => {
    e.preventDefault();
    setAthleteError(null);

    const cleanName = clampString(fullName, LIMITS.athlete.fullNameMax);
    const parsedFee = Number(monthlyFee);

    if (cleanName.length < 2) {
      setAthleteError('Nama lengkap atlet minimal 2 karakter.');
      return;
    }
    if (!isValidBlueprintDate(birthDate) || !isValidBlueprintDate(joinDate)) {
      setAthleteError('Tanggal lahir dan tanggal bergabung harus valid.');
      return;
    }
    if (!Number.isFinite(parsedFee) || parsedFee < 0 || parsedFee > 50000000) {
      setAthleteError('Nominal iuran bulanan tidak valid.');
      return;
    }

    setSavingAthlete(true);
    try {
      const payload = {
        fullName: cleanName,
        gender,
        birthDate,
        ageGroup,
        status,
        parentName: clampString(parentName, LIMITS.athlete.parentNameMax),
        parentPhone: clampString(parentPhone, LIMITS.athlete.parentPhoneMax),
        coachName: clampString(coachName, LIMITS.athlete.coachNameMax),
        monthlyFee: Math.round(parsedFee),
        joinDate,
        notes: clampString(athleteNotes, LIMITS.athlete.notesMax),
      };

      if (editingAthlete) {
        await updateDoc(doc(db, 'athletes', editingAthlete.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `athletes/${editingAthlete.id}`));
      } else {
        await addDoc(collection(db, 'athletes'), {
          ...payload,
          clubId: club.id,
          ownerId: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.CREATE, 'athletes'));
      }
      setAthleteModalOpen(false);
    } catch (err) {
      setAthleteError(err instanceof Error ? err.message : 'Gagal menyimpan data atlet.');
    } finally {
      setSavingAthlete(false);
    }
  };

  const handleDeleteAthlete = async (ath: Athlete) => {
    try {
      await deleteDoc(doc(db, 'athletes', ath.id));
      if (detailAthlete?.id === ath.id) setDetailAthlete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `athletes/${ath.id}`);
    }
  };

  const openCreateTime = (preselectAthleteId?: string) => {
    setEditingTime(null);
    setStAthleteId(preselectAthleteId || athletes[0]?.id || '');
    setStStroke('Gaya Bebas');
    setStDistance(50);
    setStPoolCourse('50m (LCM)');
    setStTimeInput('');
    setStChampionship('');
    setStMeetDate(todayISO());
    setStLocation(club.city);
    setStMedal('Peserta');
    setStIsPB(true);
    setStNotes('');
    setTimeError(null);
    setTimeModalOpen(true);
  };

  const openEditTime = (st: SwimTime) => {
    setEditingTime(st);
    setStAthleteId(st.athleteId);
    setStStroke(st.stroke);
    setStDistance(st.distanceMeters);
    setStPoolCourse(st.poolCourse);
    setStTimeInput(st.formattedTime);
    setStChampionship(st.championshipName);
    setStMeetDate(st.meetDate);
    setStLocation(st.location || '');
    setStMedal(st.medal);
    setStIsPB(st.isPersonalBest);
    setStNotes(st.notes || '');
    setTimeError(null);
    setTimeModalOpen(true);
  };

  const handleSaveTime = async (e: React.FormEvent) => {
    e.preventDefault();
    setTimeError(null);

    const athleteObj = athletes.find((a) => a.id === stAthleteId);
    if (!athleteObj) {
      setTimeError('Pilih atlet terlebih dahulu.');
      return;
    }

    const timeMs = parseSwimTimeToMs(stTimeInput);
    if (!timeMs || timeMs <= 0 || timeMs > 7200000) {
      setTimeError('Format waktu tidak valid. Gunakan mm:ss.cc (misal 01:02.45) atau ss.cc (misal 28.45).');
      return;
    }

    const cleanChamp = clampString(stChampionship, LIMITS.swimTime.championshipNameMax);
    if (cleanChamp.length < 2) {
      setTimeError('Nama kejuaraan minimal 2 karakter.');
      return;
    }

    if (!isValidBlueprintDate(stMeetDate)) {
      setTimeError('Tanggal kejuaraan tidak valid.');
      return;
    }

    const eventName = `${stDistance}m ${stStroke}`;
    const formattedTime = formatSwimTimeMs(timeMs);

    // Check if new time beats previous PBs for same athlete + event + course
    const existingSameEvent = swimTimes.filter(
      (t) =>
        t.athleteId === athleteObj.id &&
        t.eventName === eventName &&
        t.poolCourse === stPoolCourse &&
        t.id !== editingTime?.id
    );
    const fastestPrevious = existingSameEvent.reduce(
      (min, item) => (item.timeMs < min ? item.timeMs : min),
      Infinity
    );
    const computedIsPB = stIsPB || timeMs <= fastestPrevious;

    setSavingTime(true);
    try {
      const payload = {
        athleteName: clampString(athleteObj.fullName, LIMITS.swimTime.athleteNameMax),
        eventName,
        stroke: stStroke,
        distanceMeters: stDistance,
        poolCourse: stPoolCourse,
        timeMs,
        formattedTime,
        championshipName: cleanChamp,
        meetDate: stMeetDate,
        location: clampString(stLocation, LIMITS.swimTime.locationMax),
        medal: stMedal,
        isPersonalBest: computedIsPB,
        notes: clampString(stNotes, LIMITS.swimTime.notesMax),
      };

      const batch = writeBatch(db);
      if (computedIsPB) {
        for (const prev of existingSameEvent) {
          if (prev.isPersonalBest && prev.timeMs > timeMs) {
            batch.update(doc(db, 'swimTimes', prev.id), {
              isPersonalBest: false,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      if (editingTime) {
        batch.update(doc(db, 'swimTimes', editingTime.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      } else {
        const newRef = doc(collection(db, 'swimTimes'));
        batch.set(newRef, {
          ...payload,
          clubId: club.id,
          ownerId: userId,
          athleteId: athleteObj.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit().catch((err) =>
        handleFirestoreError(err, OperationType.WRITE, 'swimTimes')
      );
      setTimeModalOpen(false);
    } catch (err) {
      setTimeError(err instanceof Error ? err.message : 'Gagal menyimpan catatan waktu.');
    } finally {
      setSavingTime(false);
    }
  };

  const handleDeleteTime = async (st: SwimTime) => {
    try {
      await deleteDoc(doc(db, 'swimTimes', st.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `swimTimes/${st.id}`);
    }
  };

  const handleExportAthletesCSV = () => {
    downloadCSV(
      `daftar-atlet-${club.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
      ['Nama Lengkap', 'Gender', 'Tanggal Lahir', 'Kelompok Umur', 'Status', 'Wali', 'Telepon Wali', 'Pelatih', 'SPP (IDR)', 'Bergabung'],
      filteredAthletes.map((a) => [
        a.fullName,
        a.gender,
        a.birthDate,
        a.ageGroup,
        a.status,
        a.parentName || '-',
        a.parentPhone || '-',
        a.coachName || '-',
        a.monthlyFee,
        a.joinDate,
      ])
    );
  };

  const handleExportTimesCSV = () => {
    downloadCSV(
      `catatan-waktu-${club.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
      ['Atlet', 'Nomor Lomba', 'Kolam', 'Waktu', 'Kejuaraan', 'Tanggal', 'Lokasi', 'Hasil/Medali', 'Personal Best'],
      filteredTimes.map((t) => [
        t.athleteName,
        t.eventName,
        t.poolCourse,
        t.formattedTime,
        t.championshipName,
        t.meetDate,
        t.location || '-',
        t.medal,
        t.isPersonalBest ? 'Ya' : 'Tidak',
      ])
    );
  };

  // Detail Drawer computations
  const detailTimes = useMemo(() => {
    if (!detailAthlete) return [];
    return swimTimes
      .filter((t) => t.athleteId === detailAthlete.id)
      .sort((a, b) => b.meetDate.localeCompare(a.meetDate));
  }, [detailAthlete, swimTimes]);

  const detailInvoices = useMemo(() => {
    if (!detailAthlete) return [];
    return invoices
      .filter((i) => i.athleteId === detailAthlete.id)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [detailAthlete, invoices]);

  return (
    <div className="space-y-6">
      {/* Header & Sub-tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Atlet & Catatan Waktu Kejuaraan
          </h1>
          <p className="text-sm text-slate-500">
            Database atlet per kelompok umur (KU), catatan waktu lomba resmi, dan rekor Personal Best.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={activeTab === 'athletes' ? handleExportAthletesCSV : handleExportTimesCSV}
            disabled={activeTab === 'athletes' ? filteredAthletes.length === 0 : filteredTimes.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh CSV
          </button>
          {activeTab === 'athletes' ? (
            <button
              type="button"
              onClick={openCreateAthlete}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Tambah Atlet
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openCreateTime()}
              disabled={athletes.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Catat Waktu Lomba
            </button>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('athletes')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'athletes'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Daftar Atlet ({athletes.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('times')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'times'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Catatan Waktu Kejuaraan ({swimTimes.length})
        </button>
      </div>

      {activeTab === 'athletes' ? (
        <>
          {/* Athlete Filters */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={athleteSearch}
                onChange={(e) => setAthleteSearch(e.target.value)}
                placeholder="Cari nama atlet, wali, atau pelatih..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={ageGroupFilter}
                onChange={(e) => setAgeGroupFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="all">Semua Kelompok Umur</option>
                {AGE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="all">Semua Status</option>
                <option value="Aktif">Aktif</option>
                <option value="Cuti">Cuti</option>
                <option value="Nonaktif">Nonaktif</option>
              </select>
            </div>
          </div>

          {/* Athletes Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredAthletes.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-sm font-medium text-slate-900">Belum ada data atlet</p>
                <p className="text-xs text-slate-500">
                  Tambahkan profil atlet untuk mencatat waktu kejuaraan, presensi latihan, dan tagihan SPP.
                </p>
                <button
                  type="button"
                  onClick={openCreateAthlete}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-700 text-white text-xs font-medium rounded-lg hover:bg-sky-800 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Tambah Atlet Pertama
                </button>
              </div>
            ) : (
              <>
                {/* Mobile Athlete Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredAthletes.map((ath) => (
                    <div key={ath.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <button
                            type="button"
                            onClick={() => setDetailAthlete(ath)}
                            className="font-semibold text-sm text-slate-900 hover:text-sky-700 text-left cursor-pointer"
                          >
                            {ath.fullName}
                          </button>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {ath.ageGroup} · {ath.gender} · {ath.coachName || club.headCoach}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-medium shrink-0 ${
                            ath.status === 'Aktif'
                              ? 'text-emerald-700'
                              : ath.status === 'Cuti'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {ath.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-mono-tabular text-sky-800 font-medium">
                          {athletePBMap.get(ath.id) || 0} nomor PB
                        </span>
                        <span className="font-mono-tabular font-semibold text-slate-900">
                          SPP {formatRupiah(ath.monthlyFee)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-slate-500 truncate">
                          Wali: {ath.parentName || '-'}
                        </span>
                        <div className="inline-flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setDetailAthlete(ath)}
                            className="px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 rounded-md cursor-pointer"
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditAthlete(ath)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAthlete(ath)}
                            className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Athlete Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                        <th className="py-3 px-4">Nama Atlet</th>
                        <th className="py-3 px-4">Kelompok & Pelatih</th>
                        <th className="py-3 px-4">Wali & Kontak</th>
                        <th className="py-3 px-4">Rekor PB</th>
                        <th className="py-3 px-4 text-right">SPP / Bulan</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredAthletes.map((ath) => (
                        <tr key={ath.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => setDetailAthlete(ath)}
                              className="font-semibold text-slate-900 hover:text-sky-700 text-left cursor-pointer"
                            >
                              {ath.fullName}
                            </button>
                            <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
                              {ath.gender} · Lahir {formatDateID(ath.birthDate)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="font-medium text-slate-900">{ath.ageGroup}</div>
                            <div className="text-slate-500">{ath.coachName || club.headCoach}</div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="text-slate-800">{ath.parentName || '-'}</div>
                            <div className="font-mono-tabular text-slate-500">
                              {ath.parentPhone || '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs font-medium text-sky-800">
                            {athletePBMap.get(ath.id) || 0} nomor PB
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular text-xs font-semibold text-slate-900 whitespace-nowrap">
                            {formatRupiah(ath.monthlyFee)}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                            <span
                              className={
                                ath.status === 'Aktif'
                                  ? 'text-emerald-700'
                                  : ath.status === 'Cuti'
                                  ? 'text-amber-700'
                                  : 'text-slate-500'
                              }
                            >
                              {ath.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setDetailAthlete(ath)}
                                className="p-1.5 text-slate-500 hover:text-sky-700 rounded hover:bg-sky-50 cursor-pointer"
                                title="Lihat rekor & detail atlet"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditAthlete(ath)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                                title="Edit atlet"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAthlete(ath)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                                title="Hapus atlet"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Swim Time Trend Chart */}
          <SwimTimeTrendChart swimTimes={swimTimes} />

          {/* Swim Times Filters */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={timeSearch}
                onChange={(e) => setTimeSearch(e.target.value)}
                placeholder="Cari atlet, kejuaraan, atau nomor..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={strokeFilter}
                onChange={(e) => setStrokeFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="all">Semua Gaya</option>
                {SWIM_STROKES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="all">Semua Kolam</option>
                {POOL_COURSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg cursor-pointer bg-white">
                <input
                  type="checkbox"
                  checked={onlyPB}
                  onChange={(e) => setOnlyPB(e.target.checked)}
                  className="rounded border-slate-300 text-sky-700"
                />
                Hanya Personal Best
              </label>
            </div>
          </div>

          {/* Swim Times Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredTimes.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-sm font-medium text-slate-900">
                  Belum ada catatan waktu kejuaraan
                </p>
                <p className="text-xs text-slate-500">
                  Simpan catatan waktu resmi dari kejuaraan atau time trial untuk memantau progres Personal Best atlet.
                </p>
                {athletes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openCreateTime()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-700 text-white text-xs font-medium rounded-lg hover:bg-sky-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Catat Waktu Pertama
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Swim Times Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredTimes.map((st) => (
                    <div key={st.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900">
                            {st.athleteName}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {st.eventName} · {st.poolCourse}
                          </div>
                        </div>
                        <div className="font-mono-tabular text-base font-bold text-sky-800 shrink-0">
                          {st.formattedTime}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {st.championshipName} · {formatDateID(st.meetDate)}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
                          <span>{st.medal}</span>
                          {st.isPersonalBest && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="text-sky-700 font-semibold">Rekor PB</span>
                            </>
                          )}
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditTime(st)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTime(st)}
                            className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Swim Times Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                        <th className="py-3 px-4">Tanggal</th>
                        <th className="py-3 px-4">Atlet & Nomor Lomba</th>
                        <th className="py-3 px-4">Kejuaraan & Lokasi</th>
                        <th className="py-3 px-4">Pencapaian</th>
                        <th className="py-3 px-4 text-right">Catatan Waktu</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredTimes.map((st) => (
                        <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                            {formatDateID(st.meetDate)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{st.athleteName}</div>
                            <div className="text-xs text-slate-500">
                              {st.eventName} · {st.poolCourse}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="font-medium text-slate-800">{st.championshipName}</div>
                            <div className="text-slate-500">{st.location || '-'}</div>
                          </td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-medium text-slate-800">
                              {st.medal === 'Emas' && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                              {st.medal === 'Perak' && <Award className="w-3.5 h-3.5 text-slate-400" />}
                              {st.medal === 'Perunggu' && <Award className="w-3.5 h-3.5 text-amber-700" />}
                              <span>{st.medal}</span>
                              {st.isPersonalBest && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300">·</span>
                                  <span className="text-sky-700 font-semibold">Rekor PB</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular font-bold text-slate-900 whitespace-nowrap">
                            {st.formattedTime}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditTime(st)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                                title="Edit catatan waktu"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTime(st)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                                title="Hapus catatan waktu"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Athlete Detail Side Drawer */}
      {detailAthlete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end">
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto border-l border-slate-200 p-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <div className="text-xs text-slate-500">
                    {detailAthlete.ageGroup} · {detailAthlete.gender} · {detailAthlete.status}
                  </div>
                  <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                    {detailAthlete.fullName}
                  </h2>
                  <div className="text-xs text-slate-500 mt-1">
                    Pelatih: {detailAthlete.coachName || club.headCoach} · Bergabung {formatDateID(detailAthlete.joinDate)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailAthlete(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Wali & SPP Info */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">Nama Wali / Orang Tua</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block">
                    {detailAthlete.parentName || '-'}
                  </span>
                  <span className="font-mono-tabular text-slate-600">
                    {detailAthlete.parentPhone || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Iuran SPP Bulanan</span>
                  <span className="font-mono-tabular text-sm font-bold text-slate-900 mt-0.5 block">
                    {formatRupiah(detailAthlete.monthlyFee)}
                  </span>
                  <span className="font-mono-tabular text-slate-500">
                    Lahir {formatDateID(detailAthlete.birthDate)}
                  </span>
                </div>
              </div>

              {detailAthlete.notes && (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Catatan pelatih: {detailAthlete.notes}
                </p>
              )}

              {detailTimes.length > 0 && (
                <SwimTimeTrendChart swimTimes={detailTimes} compact />
              )}

              {/* Swim Times History */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    Riwayat Catatan Waktu ({detailTimes.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => openCreateTime(detailAthlete.id)}
                    className="text-xs font-medium text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Waktu
                  </button>
                </div>

                {detailTimes.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    Belum ada catatan kejuaraan untuk atlet ini.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {detailTimes.map((t) => (
                      <div key={t.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {t.eventName}{' '}
                            {t.isPersonalBest && (
                              <span className="text-sky-700 font-semibold">· PB</span>
                            )}
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            {t.championshipName} · {formatDateID(t.meetDate)} · {t.medal}
                          </div>
                        </div>
                        <div className="font-mono-tabular text-sm font-bold text-slate-900">
                          {t.formattedTime}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Linked Invoices */}
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                  Riwayat Tagihan & Invoice ({detailInvoices.length})
                </h3>
                {detailInvoices.length === 0 ? (
                  <p className="text-xs text-slate-500">Belum ada invoice tercatat.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {detailInvoices.map((inv) => (
                      <div key={inv.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-medium text-slate-900">{inv.description}</div>
                          <div className="font-mono-tabular text-slate-500">
                            {inv.invoiceNumber} · Jatuh tempo {formatDateID(inv.dueDate)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono-tabular font-semibold text-slate-900">
                            {formatRupiah(inv.amount)}
                          </div>
                          <div
                            className={`font-medium ${
                              inv.status === 'Lunas'
                                ? 'text-emerald-700'
                                : inv.status === 'Jatuh Tempo'
                                ? 'text-red-600'
                                : 'text-amber-700'
                            }`}
                          >
                            {inv.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Athlete Modal */}
      {athleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {editingAthlete ? 'Edit Data Atlet' : 'Tambah Atlet Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setAthleteModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAthlete} className="mt-5 space-y-4">
              {athleteError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                  {athleteError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lengkap Atlet
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.athlete.fullNameMax}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as AthleteGender)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Putra">Putra</option>
                    <option value="Putri">Putri</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kelompok Umur
                  </label>
                  <select
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {AGE_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AthleteStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Cuti">Cuti</option>
                    <option value="Nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Lahir
                  </label>
                  <input
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Bergabung
                  </label>
                  <input
                    type="date"
                    required
                    value={joinDate}
                    onChange={(e) => setJoinDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Orang Tua / Wali
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.athlete.parentNameMax}
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    No. WhatsApp Wali
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.athlete.parentPhoneMax}
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="0812..."
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pelatih Penanggung Jawab
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.athlete.coachNameMax}
                    value={coachName}
                    onChange={(e) => setCoachName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Iuran SPP Bulanan (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={50000000}
                    value={monthlyFee}
                    onChange={(e) => setMonthlyFee(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Spesialisasi / Medis
                </label>
                <textarea
                  rows={2}
                  maxLength={LIMITS.athlete.notesMax}
                  value={athleteNotes}
                  onChange={(e) => setAthleteNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAthleteModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingAthlete}
                  className="px-4 py-2 text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingAthlete ? 'Menyimpan...' : 'Simpan Atlet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SwimTime Modal */}
      {timeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-sky-700" />
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  {editingTime ? 'Edit Catatan Waktu' : 'Catat Waktu Kejuaraan Renang'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setTimeModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTime} className="mt-5 space-y-4">
              {timeError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                  {timeError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Atlet</label>
                <select
                  value={stAthleteId}
                  onChange={(e) => setStAthleteId(e.target.value)}
                  disabled={!!editingTime}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50"
                >
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName} ({a.ageGroup})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jarak</label>
                  <select
                    value={stDistance}
                    onChange={(e) => setStDistance(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg bg-white"
                  >
                    {SWIM_DISTANCES.map((d) => (
                      <option key={d} value={d}>
                        {d}m
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Gaya</label>
                  <select
                    value={stStroke}
                    onChange={(e) => setStStroke(e.target.value as SwimStroke)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {SWIM_STROKES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Lintasan</label>
                  <select
                    value={stPoolCourse}
                    onChange={(e) => setStPoolCourse(e.target.value as PoolCourse)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {POOL_COURSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Catatan Waktu (mm:ss.cc atau ss.cc)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={15}
                    value={stTimeInput}
                    onChange={(e) => setStTimeInput(e.target.value)}
                    placeholder="00:28.45"
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Peringkat / Medali
                  </label>
                  <select
                    value={stMedal}
                    onChange={(e) => setStMedal(e.target.value as MedalType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {MEDAL_TYPES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Kejuaraan / Event
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.swimTime.championshipNameMax}
                  value={stChampionship}
                  onChange={(e) => setStChampionship(e.target.value)}
                  placeholder="Contoh: Jabar Open Aquatic Championship 2026"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Lomba
                  </label>
                  <input
                    type="date"
                    required
                    value={stMeetDate}
                    onChange={(e) => setStMeetDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kota / Lokasi Kolam
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.swimTime.locationMax}
                    value={stLocation}
                    onChange={(e) => setStLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stIsPB}
                  onChange={(e) => setStIsPB(e.target.checked)}
                  className="rounded border-slate-300 text-sky-700"
                />
                <CheckCircle2 className="w-4 h-4 text-sky-700 shrink-0" />
                <span>Tandai sebagai Personal Best (otomatis mendeteksi jika memecahkan rekor sebelumnya)</span>
              </label>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Evaluasi Pelatih
                </label>
                <textarea
                  rows={2}
                  maxLength={LIMITS.swimTime.notesMax}
                  value={stNotes}
                  onChange={(e) => setStNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setTimeModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingTime}
                  className="px-4 py-2 text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingTime ? 'Menyimpan...' : 'Simpan Catatan Waktu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
