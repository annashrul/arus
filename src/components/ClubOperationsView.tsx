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
  Athlete,
  AttendanceRecord,
  COACH_LICENSES,
  COACH_ROLES,
  COACH_STATUSES,
  Coach,
  CoachLicense,
  CoachRole,
  CoachStatus,
  COMPETITION_LEVELS,
  COMPETITION_STATUSES,
  ClubCompetition,
  ClubProfile,
  CompetitionLevel,
  CompetitionStatus,
  downloadCSV,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CONDITIONS,
  EquipmentCategory,
  EquipmentCondition,
  EquipmentItem,
  formatDateID,
  formatRupiah,
  POOL_COURSES,
  POOL_STATUSES,
  POOL_TYPES,
  PoolCourse,
  PoolFacility,
  PoolStatus,
  PoolType,
  SwimTime,
  todayISO,
  TrainingSchedule,
} from '../types/club';
import {
  clampString,
  FieldErrors,
  isValidBlueprintDate,
  isValidPhoneFormat,
  LIMITS,
} from '../lib/validation';
import {
  buildCoachesSheet,
  buildCompetitionsSheet,
  buildEquipmentSheet,
  buildPoolsSheet,
  downloadExcelWorkbook,
} from '../lib/exportUtils';
import { ExportActionMenu } from './ExportActionMenu';
import { BottomSheetSelect } from './BottomSheetSelect';
import { CoachAnalyticsCharts } from './CoachAnalyticsCharts';
import {
  AlertTriangle,
  Award,
  Calendar,
  Edit3,
  Filter,
  MapPin,
  Package,
  Plus,
  Printer,
  Search,
  Trash2,
  Trophy,
  UserCheck,
  Waves,
  X,
} from 'lucide-react';

interface ClubOperationsViewProps {
  club: ClubProfile;
  userId: string;
  coaches: Coach[];
  pools: PoolFacility[];
  equipment: EquipmentItem[];
  competitions: ClubCompetition[];
  athletes?: Athlete[];
  schedules?: TrainingSchedule[];
  attendance?: AttendanceRecord[];
  swimTimes?: SwimTime[];
  onOpenPrint?: () => void;
}

type ClubOpsTab = 'coaches' | 'pools' | 'equipment' | 'competitions';

export const ClubOperationsView: React.FC<ClubOperationsViewProps> = ({
  club,
  userId,
  coaches,
  pools,
  equipment,
  competitions,
  athletes = [],
  schedules = [],
  attendance = [],
  swimTimes = [],
  onOpenPrint,
}) => {
  const [activeTab, setActiveTab] = useState<ClubOpsTab>('coaches');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // =========================
  // 1. COACHES STATE & FILTER
  // =========================
  const [coachSearch, setCoachSearch] = useState('');
  const [coachRoleFilter, setCoachRoleFilter] = useState<string>('ALL');
  const [coachStatusFilter, setCoachStatusFilter] = useState<string>('ALL');

  const [coachModalOpen, setCoachModalOpen] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [cName, setCName] = useState('');
  const [cRole, setCRole] = useState<CoachRole>('Pelatih Prestasi');
  const [cLicense, setCLicense] = useState<CoachLicense>('Daerah (PRSI B)');
  const [cSpec, setCSpec] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cStatus, setCStatus] = useState<CoachStatus>('Aktif');
  const [cHonor, setCHonor] = useState('2500000');
  const [cJoinDate, setCJoinDate] = useState(todayISO());
  const [cNotes, setCNotes] = useState('');
  const [cSaving, setCSaving] = useState(false);
  const [cError, setCError] = useState<string | null>(null);
  const [cFieldErrors, setCFieldErrors] = useState<
    FieldErrors<'fullName' | 'phone' | 'monthlyHonorarium' | 'joinDate' | 'notes'>
  >({});

  // =========================
  // 2. POOLS STATE & FILTER
  // =========================
  const [poolSearch, setPoolSearch] = useState('');
  const [poolTypeFilter, setPoolTypeFilter] = useState<string>('ALL');
  const [poolStatusFilter, setPoolStatusFilter] = useState<string>('ALL');

  const [poolModalOpen, setPoolModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<PoolFacility | null>(null);
  const [pName, setPName] = useState('');
  const [pType, setPType] = useState<PoolType>('50m (Olympic/LCM)');
  const [pLanes, setPLanes] = useState('8');
  const [pAddress, setPAddress] = useState('');
  const [pRental, setPRental] = useState('350000');
  const [pStatus, setPStatus] = useState<PoolStatus>('Tersedia');
  const [pNotes, setPNotes] = useState('');
  const [pSaving, setPSaving] = useState(false);
  const [pError, setPError] = useState<string | null>(null);
  const [pFieldErrors, setPFieldErrors] = useState<
    FieldErrors<'name' | 'laneCount' | 'rentalCostPerSession' | 'notes'>
  >({});

  // =========================
  // 3. EQUIPMENT STATE & FILTER
  // =========================
  const [eqSearch, setEqSearch] = useState('');
  const [eqCatFilter, setEqCatFilter] = useState<string>('ALL');
  const [eqCondFilter, setEqCondFilter] = useState<string>('ALL');

  const [eqModalOpen, setEqModalOpen] = useState(false);
  const [editingEq, setEditingEq] = useState<EquipmentItem | null>(null);
  const [eName, setEName] = useState('');
  const [eCat, setECat] = useState<EquipmentCategory>('Alat Teknik Renang');
  const [eQty, setEQty] = useState('10');
  const [eCond, setECond] = useState<EquipmentCondition>('Baik');
  const [eLoc, setELoc] = useState('');
  const [eChecked, setEChecked] = useState(todayISO());
  const [eNotes, setENotes] = useState('');
  const [eSaving, setESaving] = useState(false);
  const [eError, setEError] = useState<string | null>(null);
  const [eFieldErrors, setEFieldErrors] = useState<
    FieldErrors<'itemName' | 'quantity' | 'lastCheckedDate' | 'notes'>
  >({});

  // =========================
  // 4. COMPETITIONS STATE & FILTER
  // =========================
  const [compSearch, setCompSearch] = useState('');
  const [compLevelFilter, setCompLevelFilter] = useState<string>('ALL');
  const [compStatusFilter, setCompStatusFilter] = useState<string>('ALL');

  const [compModalOpen, setCompModalOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<ClubCompetition | null>(null);
  const [kName, setKName] = useState('');
  const [kLevel, setKLevel] = useState<CompetitionLevel>('Provinsi (Kejurda)');
  const [kStart, setKStart] = useState(todayISO());
  const [kEnd, setKEnd] = useState(todayISO());
  const [kLocation, setKLocation] = useState('');
  const [kCourse, setKCourse] = useState<PoolCourse>('50m (LCM)');
  const [kFee, setKFee] = useState('75000');
  const [kStatus, setKStatus] = useState<CompetitionStatus>('Akan Datang');
  const [kNotes, setKNotes] = useState('');
  const [kSaving, setKSaving] = useState(false);
  const [kError, setKError] = useState<string | null>(null);
  const [kFieldErrors, setKFieldErrors] = useState<
    FieldErrors<'name' | 'location' | 'startDate' | 'endDate' | 'registrationFee' | 'notes'>
  >({});

  // =========================
  // COMPUTED SUMMARIES & FILTERS
  // =========================
  const filteredCoaches = useMemo(() => {
    const q = coachSearch.trim().toLowerCase();
    return coaches
      .filter((c) => {
        if (coachRoleFilter !== 'ALL' && c.role !== coachRoleFilter) return false;
        if (coachStatusFilter !== 'ALL' && c.status !== coachStatusFilter) return false;
        if (!q) return true;
        return (
          c.fullName.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q) ||
          (c.specialization || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [coaches, coachSearch, coachRoleFilter, coachStatusFilter]);

  const coachStats = useMemo(() => {
    const active = coaches.filter((c) => c.status === 'Aktif');
    const honorSum = active.reduce((acc, c) => acc + c.monthlyHonorarium, 0);
    return { activeCount: active.length, totalCount: coaches.length, honorSum };
  }, [coaches]);

  const filteredPools = useMemo(() => {
    const q = poolSearch.trim().toLowerCase();
    return pools
      .filter((p) => {
        if (poolTypeFilter !== 'ALL' && p.poolType !== poolTypeFilter) return false;
        if (poolStatusFilter !== 'ALL' && p.status !== poolStatusFilter) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pools, poolSearch, poolTypeFilter, poolStatusFilter]);

  const poolStats = useMemo(() => {
    const available = pools.filter((p) => p.status === 'Tersedia');
    const totalLanes = available.reduce((acc, p) => acc + p.laneCount, 0);
    return { availableCount: available.length, totalLanes, totalCount: pools.length };
  }, [pools]);

  const filteredEquipment = useMemo(() => {
    const q = eqSearch.trim().toLowerCase();
    return equipment
      .filter((e) => {
        if (eqCatFilter !== 'ALL' && e.category !== eqCatFilter) return false;
        if (eqCondFilter !== 'ALL' && e.condition !== eqCondFilter) return false;
        if (!q) return true;
        return (
          e.itemName.toLowerCase().includes(q) ||
          (e.location || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [equipment, eqSearch, eqCatFilter, eqCondFilter]);

  const eqStats = useMemo(() => {
    const totalUnits = equipment.reduce((acc, e) => acc + e.quantity, 0);
    const needAction = equipment.filter((e) => e.condition !== 'Baik').length;
    return { totalItems: equipment.length, totalUnits, needAction };
  }, [equipment]);

  const filteredCompetitions = useMemo(() => {
    const q = compSearch.trim().toLowerCase();
    return competitions
      .filter((k) => {
        if (compLevelFilter !== 'ALL' && k.level !== compLevelFilter) return false;
        if (compStatusFilter !== 'ALL' && k.status !== compStatusFilter) return false;
        if (!q) return true;
        return (
          k.name.toLowerCase().includes(q) ||
          k.location.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [competitions, compSearch, compLevelFilter, compStatusFilter]);

  const compStats = useMemo(() => {
    const upcoming = competitions.filter(
      (c) => c.status === 'Akan Datang' || c.status === 'Pendaftaran Dibuka' || c.status === 'Berlangsung'
    ).length;
    const openReg = competitions.filter((c) => c.status === 'Pendaftaran Dibuka').length;
    return { total: competitions.length, upcoming, openReg };
  }, [competitions]);

  // =========================
  // HANDLERS: COACH CRUD
  // =========================
  const openAddCoach = () => {
    setEditingCoach(null);
    setCName('');
    setCRole('Pelatih Prestasi');
    setCLicense('Daerah (PRSI B)');
    setCSpec('');
    setCPhone('');
    setCStatus('Aktif');
    setCHonor('2500000');
    setCJoinDate(todayISO());
    setCNotes('');
    setCError(null);
    setCFieldErrors({});
    setCoachModalOpen(true);
  };

  const openEditCoach = (c: Coach) => {
    setEditingCoach(c);
    setCName(c.fullName);
    setCRole(c.role);
    setCLicense(c.licenseLevel);
    setCSpec(c.specialization || '');
    setCPhone(c.phone || '');
    setCStatus(c.status);
    setCHonor(String(c.monthlyHonorarium));
    setCJoinDate(c.joinDate);
    setCNotes(c.notes || '');
    setCError(null);
    setCFieldErrors({});
    setCoachModalOpen(true);
  };

  const handleSaveCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    setCError(null);
    const errors: typeof cFieldErrors = {};

    const cleanName = clampString(cName, LIMITS.coach.fullNameMax);
    const parsedHonor = Number(cHonor);

    if (cleanName.length < LIMITS.coach.fullNameMin) {
      errors.fullName = `Nama pelatih minimal ${LIMITS.coach.fullNameMin} karakter.`;
    }
    if (!isValidPhoneFormat(cPhone)) {
      errors.phone = 'Format telepon tidak valid (8–16 digit angka).';
    }
    if (
      cHonor.trim() === '' ||
      !Number.isFinite(parsedHonor) ||
      parsedHonor < 0 ||
      parsedHonor > 100000000
    ) {
      errors.monthlyHonorarium = 'Honorarium harus bernilai antara Rp 0 hingga Rp 100.000.000.';
    }
    if (!isValidBlueprintDate(cJoinDate)) {
      errors.joinDate = 'Tanggal bergabung wajib valid (YYYY-MM-DD).';
    }
    if (cNotes.trim().length > LIMITS.coach.notesMax) {
      errors.notes = `Catatan maksimal ${LIMITS.coach.notesMax} karakter.`;
    }

    if (Object.keys(errors).length > 0) {
      setCFieldErrors(errors);
      setCError(Object.values(errors)[0] || 'Mohon periksa kembali data pelatih.');
      return;
    }

    setCSaving(true);
    const payload = {
      fullName: cleanName,
      role: cRole,
      licenseLevel: cLicense,
      specialization: clampString(cSpec, LIMITS.coach.specializationMax),
      phone: clampString(cPhone, LIMITS.coach.phoneMax),
      status: cStatus,
      monthlyHonorarium: Math.round(parsedHonor),
      joinDate: cJoinDate,
      notes: clampString(cNotes, LIMITS.coach.notesMax),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingCoach) {
        await updateDoc(doc(db, 'coaches', editingCoach.id), payload);
      } else {
        await addDoc(collection(db, 'coaches'), {
          ...payload,
          clubId: club.id,
          ownerId: userId,
          createdAt: serverTimestamp(),
        });
      }
      setCoachModalOpen(false);
    } catch (err) {
      setCError('Gagal menyimpan data pelatih. Periksa koneksi Anda.');
      handleFirestoreError(
        err,
        editingCoach ? OperationType.UPDATE : OperationType.CREATE,
        editingCoach ? `coaches/${editingCoach.id}` : 'coaches'
      );
    } finally {
      setCSaving(false);
    }
  };

  // =========================
  // HANDLERS: POOL CRUD
  // =========================
  const openAddPool = () => {
    setEditingPool(null);
    setPName('');
    setPType('50m (Olympic/LCM)');
    setPLanes('8');
    setPAddress('');
    setPRental('350000');
    setPStatus('Tersedia');
    setPNotes('');
    setPError(null);
    setPFieldErrors({});
    setPoolModalOpen(true);
  };

  const openEditPool = (p: PoolFacility) => {
    setEditingPool(p);
    setPName(p.name);
    setPType(p.poolType);
    setPLanes(String(p.laneCount));
    setPAddress(p.address || '');
    setPRental(String(p.rentalCostPerSession));
    setPStatus(p.status);
    setPNotes(p.notes || '');
    setPError(null);
    setPFieldErrors({});
    setPoolModalOpen(true);
  };

  const handleSavePool = async (e: React.FormEvent) => {
    e.preventDefault();
    setPError(null);
    const errors: typeof pFieldErrors = {};

    const cleanName = clampString(pName, LIMITS.pool.nameMax);
    const parsedLanes = Number(pLanes);
    const parsedRental = Number(pRental);

    if (cleanName.length < LIMITS.pool.nameMin) {
      errors.name = `Nama kolam/fasilitas minimal ${LIMITS.pool.nameMin} karakter.`;
    }
    if (
      !Number.isInteger(parsedLanes) ||
      parsedLanes < 1 ||
      parsedLanes > 20
    ) {
      errors.laneCount = 'Jumlah lintasan harus bilangan bulat 1 hingga 20.';
    }
    if (
      pRental.trim() === '' ||
      !Number.isFinite(parsedRental) ||
      parsedRental < 0 ||
      parsedRental > 50000000
    ) {
      errors.rentalCostPerSession = 'Biaya sewa harus antara Rp 0 hingga Rp 50.000.000.';
    }
    if (pNotes.trim().length > LIMITS.pool.notesMax) {
      errors.notes = `Catatan maksimal ${LIMITS.pool.notesMax} karakter.`;
    }

    if (Object.keys(errors).length > 0) {
      setPFieldErrors(errors);
      setPError(Object.values(errors)[0] || 'Mohon periksa data fasilitas kolam.');
      return;
    }

    setPSaving(true);
    const payload = {
      name: cleanName,
      poolType: pType,
      laneCount: parsedLanes,
      address: clampString(pAddress, LIMITS.pool.addressMax),
      rentalCostPerSession: Math.round(parsedRental),
      status: pStatus,
      notes: clampString(pNotes, LIMITS.pool.notesMax),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingPool) {
        await updateDoc(doc(db, 'pools', editingPool.id), payload);
      } else {
        await addDoc(collection(db, 'pools'), {
          ...payload,
          clubId: club.id,
          ownerId: userId,
          createdAt: serverTimestamp(),
        });
      }
      setPoolModalOpen(false);
    } catch (err) {
      setPError('Gagal menyimpan data kolam.');
      handleFirestoreError(
        err,
        editingPool ? OperationType.UPDATE : OperationType.CREATE,
        editingPool ? `pools/${editingPool.id}` : 'pools'
      );
    } finally {
      setPSaving(false);
    }
  };

  // =========================
  // HANDLERS: EQUIPMENT CRUD
  // =========================
  const openAddEquipment = () => {
    setEditingEq(null);
    setEName('');
    setECat('Alat Teknik Renang');
    setEQty('10');
    setECond('Baik');
    setELoc('');
    setEChecked(todayISO());
    setENotes('');
    setEError(null);
    setEFieldErrors({});
    setEqModalOpen(true);
  };

  const openEditEquipment = (eq: EquipmentItem) => {
    setEditingEq(eq);
    setEName(eq.itemName);
    setECat(eq.category);
    setEQty(String(eq.quantity));
    setECond(eq.condition);
    setELoc(eq.location || '');
    setEChecked(eq.lastCheckedDate);
    setENotes(eq.notes || '');
    setEError(null);
    setEFieldErrors({});
    setEqModalOpen(true);
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setEError(null);
    const errors: typeof eFieldErrors = {};

    const cleanName = clampString(eName, LIMITS.equipment.itemNameMax);
    const parsedQty = Number(eQty);

    if (cleanName.length < LIMITS.equipment.itemNameMin) {
      errors.itemName = `Nama perlengkapan minimal ${LIMITS.equipment.itemNameMin} karakter.`;
    }
    if (!Number.isInteger(parsedQty) || parsedQty < 0 || parsedQty > 10000) {
      errors.quantity = 'Jumlah unit harus bilangan bulat 0 hingga 10.000.';
    }
    if (!isValidBlueprintDate(eChecked)) {
      errors.lastCheckedDate = 'Tanggal pengecekan terakhir wajib valid (YYYY-MM-DD).';
    }
    if (eNotes.trim().length > LIMITS.equipment.notesMax) {
      errors.notes = `Catatan maksimal ${LIMITS.equipment.notesMax} karakter.`;
    }

    if (Object.keys(errors).length > 0) {
      setEFieldErrors(errors);
      setEError(Object.values(errors)[0] || 'Mohon periksa data perlengkapan.');
      return;
    }

    setESaving(true);
    const payload = {
      itemName: cleanName,
      category: eCat,
      quantity: parsedQty,
      condition: eCond,
      location: clampString(eLoc, LIMITS.equipment.locationMax),
      lastCheckedDate: eChecked,
      notes: clampString(eNotes, LIMITS.equipment.notesMax),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingEq) {
        await updateDoc(doc(db, 'equipment', editingEq.id), payload);
      } else {
        await addDoc(collection(db, 'equipment'), {
          ...payload,
          clubId: club.id,
          ownerId: userId,
          createdAt: serverTimestamp(),
        });
      }
      setEqModalOpen(false);
    } catch (err) {
      setEError('Gagal menyimpan data perlengkapan.');
      handleFirestoreError(
        err,
        editingEq ? OperationType.UPDATE : OperationType.CREATE,
        editingEq ? `equipment/${editingEq.id}` : 'equipment'
      );
    } finally {
      setESaving(false);
    }
  };

  // =========================
  // HANDLERS: COMPETITION CRUD
  // =========================
  const openAddComp = () => {
    setEditingComp(null);
    setKName('');
    setKLevel('Provinsi (Kejurda)');
    setKStart(todayISO());
    setKEnd(todayISO());
    setKLocation('');
    setKCourse('50m (LCM)');
    setKFee('75000');
    setKStatus('Akan Datang');
    setKNotes('');
    setKError(null);
    setKFieldErrors({});
    setCompModalOpen(true);
  };

  const openEditComp = (k: ClubCompetition) => {
    setEditingComp(k);
    setKName(k.name);
    setKLevel(k.level);
    setKStart(k.startDate);
    setKEnd(k.endDate);
    setKLocation(k.location);
    setKCourse(k.poolCourse);
    setKFee(String(k.registrationFee));
    setKStatus(k.status);
    setKNotes(k.notes || '');
    setKError(null);
    setKFieldErrors({});
    setCompModalOpen(true);
  };

  const handleSaveComp = async (e: React.FormEvent) => {
    e.preventDefault();
    setKError(null);
    const errors: typeof kFieldErrors = {};

    const cleanName = clampString(kName, LIMITS.competition.nameMax);
    const cleanLocation = clampString(kLocation, LIMITS.competition.locationMax);
    const parsedFee = Number(kFee);

    if (cleanName.length < LIMITS.competition.nameMin) {
      errors.name = `Nama kejuaraan minimal ${LIMITS.competition.nameMin} karakter.`;
    }
    if (cleanLocation.length < LIMITS.competition.locationMin) {
      errors.location = `Lokasi kejuaraan minimal ${LIMITS.competition.locationMin} karakter.`;
    }
    if (!isValidBlueprintDate(kStart)) {
      errors.startDate = 'Tanggal mulai kejuaraan wajib valid.';
    }
    if (!isValidBlueprintDate(kEnd)) {
      errors.endDate = 'Tanggal selesai kejuaraan wajib valid.';
    } else if (isValidBlueprintDate(kStart) && kEnd < kStart) {
      errors.endDate = 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.';
    }
    if (
      kFee.trim() === '' ||
      !Number.isFinite(parsedFee) ||
      parsedFee < 0 ||
      parsedFee > 100000000
    ) {
      errors.registrationFee = 'Biaya registrasi harus antara Rp 0 hingga Rp 100.000.000.';
    }
    if (kNotes.trim().length > LIMITS.competition.notesMax) {
      errors.notes = `Catatan maksimal ${LIMITS.competition.notesMax} karakter.`;
    }

    if (Object.keys(errors).length > 0) {
      setKFieldErrors(errors);
      setKError(Object.values(errors)[0] || 'Mohon periksa data kalender kejuaraan.');
      return;
    }

    setKSaving(true);
    const payload = {
      name: cleanName,
      level: kLevel,
      startDate: kStart,
      endDate: kEnd,
      location: cleanLocation,
      poolCourse: kCourse,
      registrationFee: Math.round(parsedFee),
      status: kStatus,
      notes: clampString(kNotes, LIMITS.competition.notesMax),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingComp) {
        await updateDoc(doc(db, 'competitions', editingComp.id), payload);
      } else {
        await addDoc(collection(db, 'competitions'), {
          ...payload,
          clubId: club.id,
          ownerId: userId,
          createdAt: serverTimestamp(),
        });
      }
      setCompModalOpen(false);
    } catch (err) {
      setKError('Gagal menyimpan data kejuaraan.');
      handleFirestoreError(
        err,
        editingComp ? OperationType.UPDATE : OperationType.CREATE,
        editingComp ? `competitions/${editingComp.id}` : 'competitions'
      );
    } finally {
      setKSaving(false);
    }
  };

  // Generic Delete Handler
  const handleDelete = async (colName: ClubOpsTab, id: string) => {
    try {
      await deleteDoc(doc(db, colName, id));
      setConfirmDeleteId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colName}/${id}`);
    }
  };

  // Exports per active tab
  const handleExportCSV = () => {
    if (activeTab === 'coaches') {
      const sheet = buildCoachesSheet(filteredCoaches);
      downloadCSV(
        `pelatih-${club.name.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.csv`,
        sheet.headers,
        filteredCoaches.map((c) => [
          c.fullName,
          c.role,
          c.licenseLevel,
          c.specialization || '-',
          c.phone || '-',
          c.status,
          c.monthlyHonorarium,
          c.joinDate,
          c.notes || '-',
        ])
      );
    } else if (activeTab === 'pools') {
      const sheet = buildPoolsSheet(filteredPools);
      downloadCSV(
        `kolam-${club.name.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.csv`,
        sheet.headers,
        filteredPools.map((p) => [
          p.name,
          p.poolType,
          p.laneCount,
          p.address || '-',
          p.rentalCostPerSession,
          p.status,
          p.notes || '-',
        ])
      );
    } else if (activeTab === 'equipment') {
      const sheet = buildEquipmentSheet(filteredEquipment);
      downloadCSV(
        `perlengkapan-${club.name.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.csv`,
        sheet.headers,
        filteredEquipment.map((e) => [
          e.itemName,
          e.category,
          e.quantity,
          e.condition,
          e.location || '-',
          e.lastCheckedDate,
          e.notes || '-',
        ])
      );
    } else {
      const sheet = buildCompetitionsSheet(filteredCompetitions);
      downloadCSV(
        `kejuaraan-${club.name.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.csv`,
        sheet.headers,
        filteredCompetitions.map((k) => [
          k.name,
          k.level,
          k.startDate,
          k.endDate,
          k.location,
          k.poolCourse,
          k.registrationFee,
          k.status,
          k.notes || '-',
        ])
      );
    }
  };

  const handleExportExcel = () => {
    if (activeTab === 'coaches') {
      downloadExcelWorkbook(
        `pelatih-${club.name.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.xls`,
        [buildCoachesSheet(filteredCoaches)]
      );
    } else if (activeTab === 'pools') {
      downloadExcelWorkbook(
        `kolam-${club.name.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.xls`,
        [buildPoolsSheet(filteredPools)]
      );
    } else if (activeTab === 'equipment') {
      downloadExcelWorkbook(
        `perlengkapan-${club.name.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.xls`,
        [buildEquipmentSheet(filteredEquipment)]
      );
    } else {
      downloadExcelWorkbook(
        `kejuaraan-${club.name.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.xls`,
        [buildCompetitionsSheet(filteredCompetitions)]
      );
    }
  };

  const primaryAction = () => {
    if (activeTab === 'coaches') openAddCoach();
    else if (activeTab === 'pools') openAddPool();
    else if (activeTab === 'equipment') openAddEquipment();
    else openAddComp();
  };

  const primaryButtonLabel =
    activeTab === 'coaches'
      ? 'Tambah Pelatih'
      : activeTab === 'pools'
      ? 'Tambah Kolam'
      : activeTab === 'equipment'
      ? 'Tambah Alat'
      : 'Tambah Lomba';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Pelatih, Fasilitas & Agenda Lomba
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Kelola tim pelatih, kolam latihan, inventaris perlengkapan, dan target kejuaraan klub.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportActionMenu
            label="Ekspor"
            options={[
              {
                id: `${activeTab}-excel`,
                label: 'Ekspor Excel (.xls)',
                description: 'Unduh data tab aktif dalam format spreadsheet',
                format: 'excel',
                onSelect: handleExportExcel,
              },
              {
                id: `${activeTab}-csv`,
                label: 'Ekspor CSV (.csv)',
                description: 'Format tabel standar untuk olah data cepat',
                format: 'csv',
                onSelect: handleExportCSV,
              },
            ]}
          />
          {onOpenPrint && (
            <button
              type="button"
              onClick={onOpenPrint}
              className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-sky-700" />
              Cetak Rekap
            </button>
          )}
          <button
            type="button"
            onClick={primaryAction}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {primaryButtonLabel}
          </button>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="grid grid-cols-2 sm:inline-flex gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
        {(
          [
            { id: 'coaches', label: 'Pelatih & Staf', count: coaches.length, icon: UserCheck },
            { id: 'pools', label: 'Kolam & Fasilitas', count: pools.length, icon: Waves },
            { id: 'equipment', label: 'Perlengkapan', count: equipment.length, icon: Package },
            { id: 'competitions', label: 'Kalender Lomba', count: competitions.length, icon: Trophy },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setConfirmDeleteId(null);
              }}
              className={`inline-flex items-center justify-center sm:justify-start gap-2 px-3 py-2 min-h-[40px] sm:min-h-[34px] text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                active
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
              <span className="font-mono-tabular text-[11px] text-slate-400">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* ======================================================= */}
      {/* TAB 1: COACHES                                          */}
      {/* ======================================================= */}
      {activeTab === 'coaches' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Pelatih Aktif</span>
              <div className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {coachStats.activeCount}
                <span className="text-xs font-normal text-slate-400"> / {coachStats.totalCount}</span>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Estimasi Honorarium/Bln</span>
              <div className="font-mono-tabular text-xl font-bold text-slate-900 mt-1 truncate">
                {formatRupiah(coachStats.honorSum)}
              </div>
            </div>
            <div className="col-span-2 lg:col-span-1 bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Pelatih Berlisensi PRSI</span>
              <div className="font-mono-tabular text-xl font-bold text-sky-700 mt-1">
                {coaches.filter((c) => c.licenseLevel.includes('PRSI')).length} orang
              </div>
            </div>
          </div>

          {/* Native Bottom-Sheet Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={coachSearch}
                onChange={(e) => setCoachSearch(e.target.value)}
                placeholder="Cari nama atau spesialisasi..."
                className="w-full pl-9 pr-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <BottomSheetSelect
              value={coachRoleFilter}
              onChange={setCoachRoleFilter}
              title="Filter Peran Pelatih"
              subtitle="Tampilkan berdasarkan jabatan kepelatihan di klub."
              triggerPrefix="Peran:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="ALL"
              options={[
                { value: 'ALL', label: 'Semua Peran' },
                ...COACH_ROLES.map((r) => ({ value: r, label: r })),
              ]}
            />
            <BottomSheetSelect
              value={coachStatusFilter}
              onChange={setCoachStatusFilter}
              title="Filter Status Pelatih"
              subtitle="Filter berdasarkan keaktifan bertugas saat ini."
              triggerPrefix="Status:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="ALL"
              options={[
                { value: 'ALL', label: 'Semua Status' },
                ...COACH_STATUSES.map((s) => ({ value: s, label: s })),
              ]}
            />
          </div>

          {filteredCoaches.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">Belum ada data pelatih</p>
              <p className="text-xs text-slate-500">
                Tambahkan profil pelatih agar dapat dipilih langsung saat menyusun jadwal latihan atau profil atlet.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {filteredCoaches.map((c) => (
                  <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{c.fullName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {c.role} · {c.licenseLevel}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          c.status === 'Aktif'
                            ? 'text-emerald-700'
                            : c.status === 'Cuti'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    {c.specialization && (
                      <p className="text-xs text-slate-600">{c.specialization}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span className="font-mono-tabular font-semibold text-slate-900">
                        {formatRupiah(c.monthlyHonorarium)}/bln
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditCoach(c)}
                          className="px-2.5 min-h-[36px] text-xs font-medium text-sky-700 hover:bg-sky-50 rounded-lg cursor-pointer"
                        >
                          Edit
                        </button>
                        {confirmDeleteId === c.id ? (
                          <button
                            type="button"
                            onClick={() => handleDelete('coaches', c.id)}
                            className="px-2.5 min-h-[36px] text-xs font-semibold text-white bg-red-600 rounded-lg cursor-pointer"
                          >
                            Yakin?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(c.id)}
                            className="px-2.5 min-h-[36px] text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Pelatih & Spesialisasi</th>
                      <th className="py-3 px-4">Peran & Lisensi</th>
                      <th className="py-3 px-4">Telepon</th>
                      <th className="py-3 px-4 text-right">Honorarium / Bln</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredCoaches.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{c.fullName}</div>
                          {c.specialization && (
                            <div className="text-slate-500 mt-0.5">{c.specialization}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">{c.role}</div>
                          <div className="text-slate-500 mt-0.5">{c.licenseLevel}</div>
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-600">
                          {c.phone || '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                          {formatRupiah(c.monthlyHonorarium)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              c.status === 'Aktif'
                                ? 'text-emerald-700'
                                : c.status === 'Cuti'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditCoach(c)}
                              className="p-1.5 text-slate-500 hover:text-sky-700 rounded-md cursor-pointer"
                              aria-label={`Edit ${c.fullName}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {confirmDeleteId === c.id ? (
                              <button
                                type="button"
                                onClick={() => handleDelete('coaches', c.id)}
                                className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded cursor-pointer"
                              >
                                Yakin?
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(c.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                                aria-label={`Hapus ${c.fullName}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="pt-2">
            <CoachAnalyticsCharts
              coaches={coaches}
              athletes={athletes}
              schedules={schedules}
              attendance={attendance}
              swimTimes={swimTimes}
            />
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 2: POOLS & FACILITIES                               */}
      {/* ======================================================= */}
      {activeTab === 'pools' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Fasilitas Tersedia</span>
              <div className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {poolStats.availableCount}
                <span className="text-xs font-normal text-slate-400"> / {poolStats.totalCount} lokasi</span>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Total Kapasitas Lintasan</span>
              <div className="font-mono-tabular text-xl font-bold text-sky-700 mt-1">
                {poolStats.totalLanes} lintasan
              </div>
            </div>
            <div className="col-span-2 lg:col-span-1 bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Standar Lomba (50m / 25m)</span>
              <div className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {pools.filter((p) => p.poolType === '50m (Olympic/LCM)' || p.poolType === '25m (Short Course)').length} kolam
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={poolSearch}
                onChange={(e) => setPoolSearch(e.target.value)}
                placeholder="Cari nama kolam atau alamat..."
                className="w-full pl-9 pr-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <BottomSheetSelect
              value={poolTypeFilter}
              onChange={setPoolTypeFilter}
              title="Filter Tipe Kolam"
              triggerPrefix="Tipe:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="ALL"
              options={[
                { value: 'ALL', label: 'Semua Tipe Fasilitas' },
                ...POOL_TYPES.map((t) => ({ value: t, label: t })),
              ]}
            />
            <BottomSheetSelect
              value={poolStatusFilter}
              onChange={setPoolStatusFilter}
              title="Filter Status Fasilitas"
              triggerPrefix="Status:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="ALL"
              options={[
                { value: 'ALL', label: 'Semua Status' },
                ...POOL_STATUSES.map((s) => ({ value: s, label: s })),
              ]}
            />
          </div>

          {filteredPools.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <Waves className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">Belum ada fasilitas kolam</p>
              <p className="text-xs text-slate-500">
                Catat kolam renang atau area dryland agar jadwal latihan selalu konsisten.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPools.map((p) => (
                <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{p.name}</h3>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          p.status === 'Tersedia'
                            ? 'text-emerald-700'
                            : p.status === 'Renovasi'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {p.poolType} · <span className="font-mono-tabular font-semibold">{p.laneCount} lintasan</span>
                    </div>
                    {p.address && (
                      <div className="flex items-start gap-1.5 text-xs text-slate-500">
                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                        <span>{p.address}</span>
                      </div>
                    )}
                    {p.notes && <p className="text-xs text-slate-500 pt-1">{p.notes}</p>}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      Sewa: {formatRupiah(p.rentalCostPerSession)}/sesi
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditPool(p)}
                        className="px-2.5 min-h-[36px] text-xs font-medium text-sky-700 hover:bg-sky-50 rounded-lg cursor-pointer"
                      >
                        Edit
                      </button>
                      {confirmDeleteId === p.id ? (
                        <button
                          type="button"
                          onClick={() => handleDelete('pools', p.id)}
                          className="px-2.5 min-h-[36px] text-xs font-semibold text-white bg-red-600 rounded-lg cursor-pointer"
                        >
                          Yakin?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(p.id)}
                          className="px-2.5 min-h-[36px] text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 3: EQUIPMENT & INVENTORY                            */}
      {/* ======================================================= */}
      {activeTab === 'equipment' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Jenis Inventaris</span>
              <div className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {eqStats.totalItems} item
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Total Unit Perlengkapan</span>
              <div className="font-mono-tabular text-xl font-bold text-sky-700 mt-1">
                {eqStats.totalUnits} unit
              </div>
            </div>
            <div className="col-span-2 lg:col-span-1 bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Perlu Perbaikan / Rusak</span>
              <div
                className={`font-mono-tabular text-xl font-bold mt-1 ${
                  eqStats.needAction > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {eqStats.needAction} item
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={eqSearch}
                onChange={(e) => setEqSearch(e.target.value)}
                placeholder="Cari barang atau lokasi..."
                className="w-full pl-9 pr-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <BottomSheetSelect
              value={eqCatFilter}
              onChange={setEqCatFilter}
              title="Filter Kategori Perlengkapan"
              triggerPrefix="Kategori:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="ALL"
              options={[
                { value: 'ALL', label: 'Semua Kategori' },
                ...EQUIPMENT_CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
            />
            <BottomSheetSelect
              value={eqCondFilter}
              onChange={setEqCondFilter}
              title="Filter Kondisi Barang"
              triggerPrefix="Kondisi:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="ALL"
              options={[
                { value: 'ALL', label: 'Semua Kondisi' },
                ...EQUIPMENT_CONDITIONS.map((c) => ({ value: c, label: c })),
              ]}
            />
          </div>

          {filteredEquipment.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <Package className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">Belum ada data inventaris</p>
              <p className="text-xs text-slate-500">
                Catat kickboard, stopwatch, P3K, atau perlengkapan dryland klub Anda.
              </p>
            </div>
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {filteredEquipment.map((item) => (
                  <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.itemName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {item.category} · <span className="font-mono-tabular font-semibold">{item.quantity} unit</span>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          item.condition === 'Baik'
                            ? 'text-emerald-700'
                            : item.condition === 'Perlu Perbaikan'
                            ? 'text-amber-700'
                            : 'text-red-600'
                        }`}
                      >
                        {item.condition}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Lokasi: {item.location || '-'} · Cek: <span className="font-mono-tabular">{formatDateID(item.lastCheckedDate)}</span>
                    </div>
                    <div className="flex items-center justify-end gap-1 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => openEditEquipment(item)}
                        className="px-2.5 min-h-[36px] text-xs font-medium text-sky-700 hover:bg-sky-50 rounded-lg cursor-pointer"
                      >
                        Edit
                      </button>
                      {confirmDeleteId === item.id ? (
                        <button
                          type="button"
                          onClick={() => handleDelete('equipment', item.id)}
                          className="px-2.5 min-h-[36px] text-xs font-semibold text-white bg-red-600 rounded-lg cursor-pointer"
                        >
                          Yakin?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="px-2.5 min-h-[36px] text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Barang & Kategori</th>
                      <th className="py-3 px-4 text-right">Jumlah</th>
                      <th className="py-3 px-4">Lokasi Simpan</th>
                      <th className="py-3 px-4">Cek Terakhir</th>
                      <th className="py-3 px-4">Kondisi</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredEquipment.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{item.itemName}</div>
                          <div className="text-slate-500 mt-0.5">{item.category}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                          {item.quantity} unit
                        </td>
                        <td className="py-3 px-4 text-slate-600">{item.location || '-'}</td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-600">
                          {formatDateID(item.lastCheckedDate)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              item.condition === 'Baik'
                                ? 'text-emerald-700'
                                : item.condition === 'Perlu Perbaikan'
                                ? 'text-amber-700'
                                : 'text-red-600'
                            }`}
                          >
                            {item.condition}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditEquipment(item)}
                              className="p-1.5 text-slate-500 hover:text-sky-700 rounded-md cursor-pointer"
                              aria-label={`Edit ${item.itemName}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {confirmDeleteId === item.id ? (
                              <button
                                type="button"
                                onClick={() => handleDelete('equipment', item.id)}
                                className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded cursor-pointer"
                              >
                                Yakin?
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(item.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                                aria-label={`Hapus ${item.itemName}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
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
      )}

      {/* ======================================================= */}
      {/* TAB 4: COMPETITIONS CALENDAR                            */}
      {/* ======================================================= */}
      {activeTab === 'competitions' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Agenda Mendatang</span>
              <div className="font-mono-tabular text-xl font-bold text-sky-700 mt-1">
                {compStats.upcoming} kejuaraan
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Pendaftaran Dibuka</span>
              <div className="font-mono-tabular text-xl font-bold text-amber-700 mt-1">
                {compStats.openReg} kejuaraan
              </div>
            </div>
            <div className="col-span-2 lg:col-span-1 bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Total Target Lomba</span>
              <div className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {compStats.total} agenda
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={compSearch}
                onChange={(e) => setCompSearch(e.target.value)}
                placeholder="Cari nama lomba atau kota..."
                className="w-full pl-9 pr-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <BottomSheetSelect
              value={compLevelFilter}
              onChange={setCompLevelFilter}
              title="Filter Tingkat Kejuaraan"
              triggerPrefix="Tingkat:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="ALL"
              options={[
                { value: 'ALL', label: 'Semua Tingkat' },
                ...COMPETITION_LEVELS.map((l) => ({ value: l, label: l })),
              ]}
            />
            <BottomSheetSelect
              value={compStatusFilter}
              onChange={setCompStatusFilter}
              title="Filter Status Kejuaraan"
              triggerPrefix="Status:"
              icon={<Filter className="w-3.5 h-3.5" />}
              resetValue="ALL"
              options={[
                { value: 'ALL', label: 'Semua Status' },
                ...COMPETITION_STATUSES.map((s) => ({ value: s, label: s })),
              ]}
            />
          </div>

          {filteredCompetitions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <Trophy className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">Belum ada agenda kejuaraan</p>
              <p className="text-xs text-slate-500">
                Susun kalender target lomba atau time trial agar pengingat otomatis muncul sebelum hari H.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCompetitions.map((k) => (
                <div
                  key={k.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{k.name}</span>
                      <span
                        className={`text-xs font-semibold ${
                          k.status === 'Pendaftaran Dibuka'
                            ? 'text-amber-700'
                            : k.status === 'Berlangsung'
                            ? 'text-sky-700'
                            : k.status === 'Selesai'
                            ? 'text-emerald-700'
                            : k.status === 'Dibatalkan'
                            ? 'text-red-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {k.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="inline-flex items-center gap-1 font-mono-tabular">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {k.startDate === k.endDate
                          ? formatDateID(k.startDate)
                          : `${formatDateID(k.startDate)} – ${formatDateID(k.endDate)}`}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>{k.level}</span>
                      <span className="text-slate-300">·</span>
                      <span>{k.poolCourse}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Lokasi: {k.location}
                      {k.registrationFee > 0 && (
                        <>
                          {' · '}Biaya/nomor:{' '}
                          <span className="font-mono-tabular font-medium text-slate-800">
                            {formatRupiah(k.registrationFee)}
                          </span>
                        </>
                      )}
                    </div>
                    {k.notes && <p className="text-xs text-slate-500 pt-1">{k.notes}</p>}
                  </div>

                  <div className="flex items-center justify-end gap-1 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <button
                      type="button"
                      onClick={() => openEditComp(k)}
                      className="px-3 min-h-[38px] text-xs font-medium text-sky-700 hover:bg-sky-50 rounded-lg cursor-pointer"
                    >
                      Edit
                    </button>
                    {confirmDeleteId === k.id ? (
                      <button
                        type="button"
                        onClick={() => handleDelete('competitions', k.id)}
                        className="px-3 min-h-[38px] text-xs font-semibold text-white bg-red-600 rounded-lg cursor-pointer"
                      >
                        Yakin?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(k.id)}
                        className="px-3 min-h-[38px] text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================= */}
      {/* MODAL 1: COACH ADD / EDIT                               */}
      {/* ======================================================= */}
      {coachModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                {editingCoach ? 'Edit Data Pelatih / Staf' : 'Tambah Pelatih / Staf'}
              </h2>
              <button
                type="button"
                onClick={() => setCoachModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal pelatih"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCoach} noValidate className="mt-4 space-y-3.5">
              {cError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{cError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lengkap <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.coach.fullNameMax}
                  value={cName}
                  onChange={(e) => {
                    setCName(e.target.value);
                    setCFieldErrors((p) => ({ ...p, fullName: undefined }));
                  }}
                  placeholder="Contoh: Coach Hendra Wijaya"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    cFieldErrors.fullName ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {cFieldErrors.fullName && (
                  <p className="text-[11px] text-red-600 mt-1">{cFieldErrors.fullName}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Peran</label>
                  <BottomSheetSelect
                    value={cRole}
                    onChange={(v) => setCRole(v as CoachRole)}
                    title="Pilih Peran Pelatih"
                    options={COACH_ROLES.map((r) => ({ value: r, label: r }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Lisensi</label>
                  <BottomSheetSelect
                    value={cLicense}
                    onChange={(v) => setCLicense(v as CoachLicense)}
                    title="Pilih Tingkat Lisensi"
                    icon={<Award className="w-3.5 h-3.5" />}
                    options={COACH_LICENSES.map((l) => ({ value: l, label: l }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Spesialisasi / Kelompok Asuh
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.coach.specializationMax}
                  value={cSpec}
                  onChange={(e) => setCSpec(e.target.value)}
                  placeholder="Misal: Gaya Bebas KU I–II"
                  className="w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">No. Telepon / WA</label>
                  <input
                    type="text"
                    maxLength={LIMITS.coach.phoneMax}
                    value={cPhone}
                    onChange={(e) => {
                      setCPhone(e.target.value);
                      setCFieldErrors((p) => ({ ...p, phone: undefined }));
                    }}
                    placeholder="0812-3456-7890"
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      cFieldErrors.phone ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {cFieldErrors.phone && (
                    <p className="text-[11px] text-red-600 mt-1">{cFieldErrors.phone}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <BottomSheetSelect
                    value={cStatus}
                    onChange={(v) => setCStatus(v as CoachStatus)}
                    title="Pilih Status Pelatih"
                    options={COACH_STATUSES.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Honorarium / Bulan (IDR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    step="50000"
                    value={cHonor}
                    onChange={(e) => {
                      setCHonor(e.target.value);
                      setCFieldErrors((p) => ({ ...p, monthlyHonorarium: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      cFieldErrors.monthlyHonorarium ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {cFieldErrors.monthlyHonorarium && (
                    <p className="text-[11px] text-red-600 mt-1">{cFieldErrors.monthlyHonorarium}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Bergabung
                  </label>
                  <input
                    type="date"
                    value={cJoinDate}
                    onChange={(e) => {
                      setCJoinDate(e.target.value);
                      setCFieldErrors((p) => ({ ...p, joinDate: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      cFieldErrors.joinDate ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {cFieldErrors.joinDate && (
                    <p className="text-[11px] text-red-600 mt-1">{cFieldErrors.joinDate}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
                <textarea
                  rows={2}
                  maxLength={LIMITS.coach.notesMax}
                  value={cNotes}
                  onChange={(e) => setCNotes(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCoachModalOpen(false)}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={cSaving}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {cSaving ? 'Menyimpan...' : editingCoach ? 'Simpan Perubahan' : 'Simpan Pelatih'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* MODAL 2: POOL ADD / EDIT                                */}
      {/* ======================================================= */}
      {poolModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                {editingPool ? 'Edit Kolam / Fasilitas' : 'Tambah Kolam / Fasilitas'}
              </h2>
              <button
                type="button"
                onClick={() => setPoolModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal kolam"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePool} noValidate className="mt-4 space-y-3.5">
              {pError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{pError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Kolam / Fasilitas <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.pool.nameMax}
                  value={pName}
                  onChange={(e) => {
                    setPName(e.target.value);
                    setPFieldErrors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="Contoh: Kolam Renang Pajajaran (50m)"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    pFieldErrors.name ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {pFieldErrors.name && (
                  <p className="text-[11px] text-red-600 mt-1">{pFieldErrors.name}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tipe Fasilitas</label>
                  <BottomSheetSelect
                    value={pType}
                    onChange={(v) => setPType(v as PoolType)}
                    title="Pilih Tipe Fasilitas"
                    options={POOL_TYPES.map((t) => ({ value: t, label: t }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jumlah Lintasan (1–20)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={pLanes}
                    onChange={(e) => {
                      setPLanes(e.target.value);
                      setPFieldErrors((p) => ({ ...p, laneCount: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      pFieldErrors.laneCount ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {pFieldErrors.laneCount && (
                    <p className="text-[11px] text-red-600 mt-1">{pFieldErrors.laneCount}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Biaya Sewa / Sesi (IDR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50000000"
                    step="10000"
                    value={pRental}
                    onChange={(e) => {
                      setPRental(e.target.value);
                      setPFieldErrors((p) => ({ ...p, rentalCostPerSession: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      pFieldErrors.rentalCostPerSession
                        ? 'border-red-400 bg-red-50/40'
                        : 'border-slate-200'
                    }`}
                  />
                  {pFieldErrors.rentalCostPerSession && (
                    <p className="text-[11px] text-red-600 mt-1">
                      {pFieldErrors.rentalCostPerSession}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <BottomSheetSelect
                    value={pStatus}
                    onChange={(v) => setPStatus(v as PoolStatus)}
                    title="Pilih Status Fasilitas"
                    options={POOL_STATUSES.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Alamat</label>
                <input
                  type="text"
                  maxLength={LIMITS.pool.addressMax}
                  value={pAddress}
                  onChange={(e) => setPAddress(e.target.value)}
                  placeholder="Jl. Pajajaran No. 37, Bandung"
                  className="w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
                <textarea
                  rows={2}
                  maxLength={LIMITS.pool.notesMax}
                  value={pNotes}
                  onChange={(e) => setPNotes(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setPoolModalOpen(false)}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pSaving}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {pSaving ? 'Menyimpan...' : editingPool ? 'Simpan Perubahan' : 'Simpan Fasilitas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* MODAL 3: EQUIPMENT ADD / EDIT                           */}
      {/* ======================================================= */}
      {eqModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                {editingEq ? 'Edit Inventaris Perlengkapan' : 'Tambah Perlengkapan Klub'}
              </h2>
              <button
                type="button"
                onClick={() => setEqModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal perlengkapan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEquipment} noValidate className="mt-4 space-y-3.5">
              {eError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{eError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Barang <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.equipment.itemNameMax}
                  value={eName}
                  onChange={(e) => {
                    setEName(e.target.value);
                    setEFieldErrors((p) => ({ ...p, itemName: undefined }));
                  }}
                  placeholder="Contoh: Kickboard & Pullbuoy Set"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    eFieldErrors.itemName ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {eFieldErrors.itemName && (
                  <p className="text-[11px] text-red-600 mt-1">{eFieldErrors.itemName}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
                  <BottomSheetSelect
                    value={eCat}
                    onChange={(v) => setECat(v as EquipmentCategory)}
                    title="Pilih Kategori Perlengkapan"
                    options={EQUIPMENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kondisi</label>
                  <BottomSheetSelect
                    value={eCond}
                    onChange={(v) => setECond(v as EquipmentCondition)}
                    title="Pilih Kondisi Barang"
                    options={EQUIPMENT_CONDITIONS.map((c) => ({ value: c, label: c }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jumlah Unit
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={eQty}
                    onChange={(e) => {
                      setEQty(e.target.value);
                      setEFieldErrors((p) => ({ ...p, quantity: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      eFieldErrors.quantity ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {eFieldErrors.quantity && (
                    <p className="text-[11px] text-red-600 mt-1">{eFieldErrors.quantity}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Cek Terakhir
                  </label>
                  <input
                    type="date"
                    value={eChecked}
                    onChange={(e) => {
                      setEChecked(e.target.value);
                      setEFieldErrors((p) => ({ ...p, lastCheckedDate: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      eFieldErrors.lastCheckedDate
                        ? 'border-red-400 bg-red-50/40'
                        : 'border-slate-200'
                    }`}
                  />
                  {eFieldErrors.lastCheckedDate && (
                    <p className="text-[11px] text-red-600 mt-1">{eFieldErrors.lastCheckedDate}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Lokasi Penyimpanan
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.equipment.locationMax}
                  value={eLoc}
                  onChange={(e) => setELoc(e.target.value)}
                  placeholder="Gudang Kolam Pajajaran (Loker A)"
                  className="w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
                <textarea
                  rows={2}
                  maxLength={LIMITS.equipment.notesMax}
                  value={eNotes}
                  onChange={(e) => setENotes(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEqModalOpen(false)}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={eSaving}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {eSaving ? 'Menyimpan...' : editingEq ? 'Simpan Perubahan' : 'Simpan Barang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* MODAL 4: COMPETITION ADD / EDIT                         */}
      {/* ======================================================= */}
      {compModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                {editingComp ? 'Edit Agenda Kejuaraan' : 'Tambah Target Kejuaraan'}
              </h2>
              <button
                type="button"
                onClick={() => setCompModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal kejuaraan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveComp} noValidate className="mt-4 space-y-3.5">
              {kError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{kError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Kejuaraan <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.competition.nameMax}
                  value={kName}
                  onChange={(e) => {
                    setKName(e.target.value);
                    setKFieldErrors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="Contoh: Bandung Open Aquatic 2026"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    kFieldErrors.name ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {kFieldErrors.name && (
                  <p className="text-[11px] text-red-600 mt-1">{kFieldErrors.name}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tingkat</label>
                  <BottomSheetSelect
                    value={kLevel}
                    onChange={(v) => setKLevel(v as CompetitionLevel)}
                    title="Pilih Tingkat Kejuaraan"
                    options={COMPETITION_LEVELS.map((l) => ({ value: l, label: l }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <BottomSheetSelect
                    value={kStatus}
                    onChange={(v) => setKStatus(v as CompetitionStatus)}
                    title="Pilih Status Kejuaraan"
                    options={COMPETITION_STATUSES.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Mulai <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={kStart}
                    onChange={(e) => {
                      setKStart(e.target.value);
                      if (kEnd < e.target.value) setKEnd(e.target.value);
                      setKFieldErrors((p) => ({ ...p, startDate: undefined, endDate: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      kFieldErrors.startDate ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {kFieldErrors.startDate && (
                    <p className="text-[11px] text-red-600 mt-1">{kFieldErrors.startDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Selesai <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={kEnd}
                    onChange={(e) => {
                      setKEnd(e.target.value);
                      setKFieldErrors((p) => ({ ...p, endDate: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      kFieldErrors.endDate ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {kFieldErrors.endDate && (
                    <p className="text-[11px] text-red-600 mt-1">{kFieldErrors.endDate}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Lokasi Kolam / Kota <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.competition.locationMax}
                  value={kLocation}
                  onChange={(e) => {
                    setKLocation(e.target.value);
                    setKFieldErrors((p) => ({ ...p, location: undefined }));
                  }}
                  placeholder="Contoh: Kolam Si Jalak Harupat, Bandung"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                    kFieldErrors.location ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {kFieldErrors.location && (
                  <p className="text-[11px] text-red-600 mt-1">{kFieldErrors.location}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Lintasan Kolam</label>
                  <BottomSheetSelect
                    value={kCourse}
                    onChange={(v) => setKCourse(v as PoolCourse)}
                    title="Pilih Lintasan Kolam"
                    options={POOL_COURSES.map((c) => ({ value: c, label: c }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Biaya Daftar / Nomor (IDR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    step="5000"
                    value={kFee}
                    onChange={(e) => {
                      setKFee(e.target.value);
                      setKFieldErrors((p) => ({ ...p, registrationFee: undefined }));
                    }}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                      kFieldErrors.registrationFee
                        ? 'border-red-400 bg-red-50/40'
                        : 'border-slate-200'
                    }`}
                  />
                  {kFieldErrors.registrationFee && (
                    <p className="text-[11px] text-red-600 mt-1">{kFieldErrors.registrationFee}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
                <textarea
                  rows={2}
                  maxLength={LIMITS.competition.notesMax}
                  value={kNotes}
                  onChange={(e) => setKNotes(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCompModalOpen(false)}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={kSaving}
                  className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-60 cursor-pointer"
                >
                  {kSaving ? 'Menyimpan...' : editingComp ? 'Simpan Perubahan' : 'Simpan Kejuaraan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
