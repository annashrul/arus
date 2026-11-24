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
import { clampString, FieldErrors, isValidEmailFormat, LIMITS } from '../lib/validation';
import { normalizeEmail } from '../lib/roleAccess';
import {
  Athlete,
  CLUB_MEMBER_ROLES,
  CLUB_MEMBER_STATUSES,
  ClubMember,
  ClubMemberRole,
  ClubMemberStatus,
  ClubProfile,
  Coach,
} from '../types/club';
import { BottomSheetSelect } from './BottomSheetSelect';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit3,
  Eye,
  Filter,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

interface RoleAccessManagerProps {
  club: ClubProfile;
  userId: string;
  members: ClubMember[];
  coaches: Coach[];
  athletes: Athlete[];
  onSyncAccess: (overrideMembers?: ClubMember[]) => Promise<{
    coachCount: number;
    parentCount: number;
    updatedDocs: number;
  }>;
  onPreviewRole: (
    role: 'coach' | 'parent',
    opts?: { coachName?: string; athleteIds?: string[] }
  ) => void;
}

export const RoleAccessManager: React.FC<RoleAccessManagerProps> = ({
  club,
  userId,
  members,
  coaches,
  athletes,
  onSyncAccess,
  onPreviewRole,
}) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | ClubMemberRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ClubMemberStatus>('ALL');

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ClubMember | null>(null);
  const [mEmail, setMEmail] = useState('');
  const [mDisplayName, setMDisplayName] = useState('');
  const [mRole, setMRole] = useState<ClubMemberRole>('parent');
  const [mCoachName, setMCoachName] = useState('');
  const [mLinkedAthleteIds, setMLinkedAthleteIds] = useState<string[]>([]);
  const [athleteSearchInModal, setAthleteSearchInModal] = useState('');
  const [mStatus, setMStatus] = useState<ClubMemberStatus>('Aktif');
  const [mNotes, setMNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    FieldErrors<'memberEmail' | 'displayName' | 'linkedAthleteIds' | 'notes'>
  >({});

  const athleteMap = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes]);

  const sortedAthletes = useMemo(
    () => [...athletes].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [athletes]
  );

  const modalFilteredAthletes = useMemo(() => {
    const q = athleteSearchInModal.trim().toLowerCase();
    if (!q) return sortedAthletes;
    return sortedAthletes.filter(
      (a) =>
        a.fullName.toLowerCase().includes(q) ||
        a.ageGroup.toLowerCase().includes(q) ||
        (a.parentName || '').toLowerCase().includes(q)
    );
  }, [sortedAthletes, athleteSearchInModal]);

  const stats = useMemo(() => {
    const activeCoaches = members.filter((m) => m.role === 'coach' && m.status === 'Aktif').length;
    const activeParents = members.filter((m) => m.role === 'parent' && m.status === 'Aktif').length;
    const linkedAthleteCount = new Set(
      members
        .filter((m) => m.role === 'parent' && m.status === 'Aktif')
        .flatMap((m) => m.linkedAthleteIds || [])
    ).size;
    return {
      total: members.length,
      activeCoaches,
      activeParents,
      linkedAthleteCount,
    };
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...members]
      .filter((m) => {
        if (roleFilter !== 'ALL' && m.role !== roleFilter) return false;
        if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
        if (!q) return true;
        const linkedNames = (m.linkedAthleteIds || [])
          .map((id) => athleteMap.get(id)?.fullName || '')
          .join(' ');
        const hay = `${m.displayName} ${m.memberEmail} ${m.coachName || ''} ${linkedNames}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'Aktif' ? -1 : 1;
        if (a.role !== b.role) return a.role === 'coach' ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [members, roleFilter, statusFilter, search, athleteMap]);

  const openCreateModal = (presetRole: ClubMemberRole = 'parent') => {
    setEditingMember(null);
    setMEmail('');
    setMDisplayName('');
    setMRole(presetRole);
    setMCoachName(presetRole === 'coach' ? coaches[0]?.fullName || club.headCoach : '');
    setMLinkedAthleteIds([]);
    setAthleteSearchInModal('');
    setMStatus('Aktif');
    setMNotes('');
    setFormError(null);
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEditModal = (m: ClubMember) => {
    setEditingMember(m);
    setMEmail(m.memberEmail);
    setMDisplayName(m.displayName);
    setMRole(m.role);
    setMCoachName(m.coachName || '');
    setMLinkedAthleteIds(m.linkedAthleteIds || []);
    setAthleteSearchInModal('');
    setMStatus(m.status);
    setMNotes(m.notes || '');
    setFormError(null);
    setFieldErrors({});
    setModalOpen(true);
  };

  const toggleLinkedAthlete = (athleteId: string) => {
    setMLinkedAthleteIds((prev) =>
      prev.includes(athleteId) ? prev.filter((id) => id !== athleteId) : [...prev, athleteId].slice(0, 20)
    );
    setFieldErrors((p) => ({ ...p, linkedAthleteIds: undefined }));
  };

  const handleManualSync = async () => {
    setListError(null);
    setSyncMessage(null);
    setSyncing(true);
    try {
      const res = await onSyncAccess();
      setSyncMessage(
        `Akses tersinkron: ${res.coachCount} email pelatih & ${res.parentCount} email wali murid (${res.updatedDocs} dokumen diperbarui).`
      );
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Gagal menyinkronkan izin akses.');
    } finally {
      setSyncing(false);
    }
  };

  const clearParentEmailOnAthletes = async (athleteIds: string[], emailToClear: string) => {
    const cleanTarget = normalizeEmail(emailToClear);
    if (!cleanTarget || athleteIds.length === 0) return;
    const toClear = athleteIds.filter((id) => {
      const ath = athleteMap.get(id);
      return ath && normalizeEmail(ath.parentEmail) === cleanTarget;
    });
    if (toClear.length === 0) return;

    const batch = writeBatch(db);
    for (const id of toClear) {
      batch.update(doc(db, 'athletes', id), {
        parentEmail: '',
        updatedAt: serverTimestamp(),
      });
    }
    await batch
      .commit()
      .catch((err) => handleFirestoreError(err, OperationType.UPDATE, 'athletes/unlink_parent'));
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errors: typeof fieldErrors = {};

    const cleanEmail = normalizeEmail(clampString(mEmail, LIMITS.clubMember.memberEmailMax));
    const cleanName = clampString(mDisplayName, LIMITS.clubMember.displayNameMax);
    const cleanCoachName = clampString(mCoachName, LIMITS.clubMember.coachNameMax);
    const cleanNotes = clampString(mNotes, LIMITS.clubMember.notesMax);
    const cleanLinked = mRole === 'parent' ? mLinkedAthleteIds.slice(0, 20) : [];

    if (!cleanEmail || !isValidEmailFormat(cleanEmail)) {
      errors.memberEmail = 'Masukkan alamat email Google yang valid (contoh: pelatih@gmail.com).';
    }
    if (cleanName.length < LIMITS.clubMember.displayNameMin) {
      errors.displayName = `Nama pengguna minimal ${LIMITS.clubMember.displayNameMin} karakter.`;
    }
    if (mRole === 'parent' && cleanLinked.length === 0) {
      errors.linkedAthleteIds = 'Pilih minimal 1 atlet anak yang ditautkan ke wali murid ini.';
    }
    if (mNotes.trim().length > LIMITS.clubMember.notesMax) {
      errors.notes = `Catatan maksimal ${LIMITS.clubMember.notesMax} karakter.`;
    }

    if (!errors.memberEmail) {
      const dup = members.find(
        (m) =>
          m.id !== editingMember?.id &&
          normalizeEmail(m.memberEmail) === cleanEmail
      );
      if (dup) {
        errors.memberEmail = `Email ${cleanEmail} sudah terdaftar sebagai ${
          dup.role === 'coach' ? 'Pelatih' : 'Wali Murid'
        } (${dup.displayName}).`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(Object.values(errors)[0] || 'Periksa kembali kolom akses pengguna.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        memberEmail: cleanEmail,
        displayName: cleanName,
        role: mRole,
        coachName: mRole === 'coach' ? cleanCoachName : '',
        linkedAthleteIds: cleanLinked,
        status: mStatus,
        notes: cleanNotes,
        updatedAt: serverTimestamp(),
      };

      let nextMembers: ClubMember[];
      if (editingMember) {
        // Clear parentEmail on any previously-linked athlete that was removed or deactivated
        const removedIds =
          editingMember.role === 'parent'
            ? (editingMember.linkedAthleteIds || []).filter(
                (id) => mRole !== 'parent' || mStatus !== 'Aktif' || !cleanLinked.includes(id)
              )
            : [];
        if (removedIds.length > 0) {
          await clearParentEmailOnAthletes(removedIds, editingMember.memberEmail);
        }

        await updateDoc(doc(db, 'clubMembers', editingMember.id), payload).catch((err) =>
          handleFirestoreError(err, OperationType.UPDATE, `clubMembers/${editingMember.id}`)
        );
        nextMembers = members.map((m) =>
          m.id === editingMember.id
            ? {
                ...m,
                memberEmail: cleanEmail,
                displayName: cleanName,
                role: mRole,
                coachName: mRole === 'coach' ? cleanCoachName : '',
                linkedAthleteIds: cleanLinked,
                status: mStatus,
                notes: cleanNotes,
              }
            : m
        );
      } else {
        const ref = await addDoc(collection(db, 'clubMembers'), {
          ...payload,
          clubId: club.id,
          ownerId: userId,
          createdAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.CREATE, 'clubMembers'));
        nextMembers = [
          ...members,
          {
            id: ref.id,
            clubId: club.id,
            ownerId: userId,
            memberEmail: cleanEmail,
            displayName: cleanName,
            role: mRole,
            coachName: mRole === 'coach' ? cleanCoachName : '',
            linkedAthleteIds: cleanLinked,
            status: mStatus,
            notes: cleanNotes,
          },
        ];
      }

      await onSyncAccess(nextMembers);
      setModalOpen(false);
      setSyncMessage('Akses pengguna disimpan dan izin data klub telah disinkronkan.');
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan akses pengguna.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (m: ClubMember) => {
    setListError(null);
    const nextStatus: ClubMemberStatus = m.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    try {
      if (m.role === 'parent' && nextStatus === 'Nonaktif') {
        await clearParentEmailOnAthletes(m.linkedAthleteIds || [], m.memberEmail);
      }
      await updateDoc(doc(db, 'clubMembers', m.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `clubMembers/${m.id}`));

      const nextMembers = members.map((x) => (x.id === m.id ? { ...x, status: nextStatus } : x));
      await onSyncAccess(nextMembers);
      setSyncMessage(
        `Akses ${m.displayName} diubah menjadi ${nextStatus} & izin data diperbarui.`
      );
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Gagal mengubah status akses.');
    }
  };

  const handleDeleteMember = async (m: ClubMember) => {
    setListError(null);
    try {
      if (m.role === 'parent') {
        await clearParentEmailOnAthletes(m.linkedAthleteIds || [], m.memberEmail);
      }
      await deleteDoc(doc(db, 'clubMembers', m.id)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, `clubMembers/${m.id}`)
      );
      setConfirmDeleteId(null);
      const nextMembers = members.filter((x) => x.id !== m.id);
      await onSyncAccess(nextMembers);
      setSyncMessage(`Akses ${m.displayName} dihapus & izin data disinkronkan.`);
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Gagal menghapus akses pengguna.');
    }
  };

  return (
    <div className="space-y-5 no-print">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Pelatih Aktif Terdaftar</span>
          <div className="font-mono-tabular text-xl font-bold text-sky-800 mt-1">
            {stats.activeCoaches} <span className="text-xs font-normal text-slate-500">akun</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Wali Murid Aktif</span>
          <div className="font-mono-tabular text-xl font-bold text-emerald-700 mt-1">
            {stats.activeParents} <span className="text-xs font-normal text-slate-500">akun</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Atlet Terhubung ke Wali</span>
          <div className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
            {stats.linkedAthleteCount}
            <span className="text-xs font-normal text-slate-400"> / {athletes.length}</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-2">
          <span className="text-xs text-slate-500">Pratinjau Portal</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onPreviewRole('coach', { coachName: club.headCoach })}
              className="inline-flex items-center justify-center gap-1 px-2 min-h-[34px] text-[11px] font-medium text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-lg cursor-pointer"
            >
              <Eye className="w-3 h-3 shrink-0" />
              Pelatih
            </button>
            <button
              type="button"
              onClick={() =>
                onPreviewRole('parent', {
                  athleteIds: athletes[0] ? [athletes[0].id] : [],
                })
              }
              className="inline-flex items-center justify-center gap-1 px-2 min-h-[34px] text-[11px] font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg cursor-pointer"
            >
              <Eye className="w-3 h-3 shrink-0" />
              Wali
            </button>
          </div>
        </div>
      </div>

      {/* Role Matrix Explanation */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                Hak Akses Multi-Role (Pelatih & Wali Murid)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Daftarkan email Google pelatih dan orang tua agar dapat login ke workspace sesuai kewenangannya masing-masing.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={syncing}
              onClick={handleManualSync}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer disabled:opacity-60"
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-700" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-sky-700" />
              )}
              Sinkronkan Akses
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('coach')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Pelatih
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('parent')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Wali Murid
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 space-y-1">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-sky-700" />
              Akses Pelatih
            </div>
            <p className="text-slate-600 leading-relaxed">
              Kelola jadwal latihan, isi presensi & pantau peringatan absen 3x beruntun, catat waktu lomba & PB, edit catatan teknis atlet, cek kondisi alat, serta baca jadwal kolam/lomba & pengumuman.{' '}
              <span className="font-medium text-slate-800">Tidak dapat melihat kas keuangan, honorarium, maupun tagihan SPP.</span>
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 space-y-1">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-700" />
              Akses Wali Murid (Orang Tua)
            </div>
            <p className="text-slate-600 leading-relaxed">
              Hanya melihat data anak tertaut: progres & grafik waktu renang PB, jadwal latihan kelompok + unduh kalender, log kehadiran, pengumuman/agenda lomba, serta tagihan anak dengan QRIS & unggah bukti transfer langsung.
            </p>
          </div>
        </div>
      </div>

      {syncMessage && (
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {listError && (
        <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{listError}</span>
          </div>
          <button
            type="button"
            onClick={() => setListError(null)}
            className="font-semibold text-red-700 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email Google, atau atlet..."
            className="w-full pl-9 pr-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-xs border border-slate-200 rounded-lg"
          />
        </div>
        <BottomSheetSelect
          value={roleFilter}
          onChange={(v) => setRoleFilter(v as 'ALL' | ClubMemberRole)}
          title="Filter Peran Akses"
          triggerPrefix="Peran:"
          icon={<Filter className="w-3.5 h-3.5" />}
          resetValue="ALL"
          options={[
            { value: 'ALL', label: 'Semua Peran' },
            { value: 'coach', label: 'Pelatih' },
            { value: 'parent', label: 'Wali Murid' },
          ]}
        />
        <BottomSheetSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as 'ALL' | ClubMemberStatus)}
          title="Filter Status Akses"
          triggerPrefix="Status:"
          icon={<Filter className="w-3.5 h-3.5" />}
          resetValue="ALL"
          options={[
            { value: 'ALL', label: 'Semua Status' },
            ...CLUB_MEMBER_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
      </div>

      {/* Members List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredMembers.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Mail className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-900">
              {members.length === 0
                ? 'Belum ada akun Pelatih atau Wali Murid ditambahkan'
                : 'Tidak ada akun akses yang cocok dengan filter'}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Tambahkan email Gmail pelatih atau orang tua agar mereka dapat login langsung ke portal masing-masing. Anda juga tetap bisa mencoba tampilan mereka lewat tombol Pratinjau di atas.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredMembers.map((m) => {
                const linkedNames = (m.linkedAthleteIds || [])
                  .map((id) => athleteMap.get(id)?.fullName)
                  .filter(Boolean) as string[];
                return (
                  <div key={m.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {m.displayName}
                        </div>
                        <div className="font-mono-tabular text-xs text-slate-500 truncate">
                          {m.memberEmail}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(m)}
                        className={`text-xs font-semibold shrink-0 cursor-pointer ${
                          m.status === 'Aktif' ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {m.status}
                      </button>
                    </div>

                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {m.role === 'coach' ? 'Pelatih' : 'Wali Murid'}
                      </span>
                      {m.role === 'coach' && m.coachName && (
                        <span> · Profil: {m.coachName}</span>
                      )}
                      {m.role === 'parent' && (
                        <span>
                          {' · '}Atlet:{' '}
                          {linkedNames.length > 0 ? linkedNames.join(', ') : 'Belum ditautkan'}
                        </span>
                      )}
                    </div>

                    {m.notes && <p className="text-xs text-slate-500">{m.notes}</p>}

                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          onPreviewRole(m.role, {
                            coachName: m.coachName || m.displayName,
                            athleteIds: m.linkedAthleteIds,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 min-h-[36px] text-xs font-medium text-sky-700 bg-sky-50 rounded-lg cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Pratinjau
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(m)}
                        className="px-2.5 min-h-[36px] text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                      >
                        Edit
                      </button>
                      {confirmDeleteId === m.id ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteMember(m)}
                          className="px-2.5 min-h-[36px] text-xs font-semibold text-white bg-red-600 rounded-lg cursor-pointer"
                        >
                          Yakin Hapus?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(m.id)}
                          className="px-2.5 min-h-[36px] text-xs font-medium text-red-700 bg-red-50 rounded-lg cursor-pointer"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Nama & Email Google</th>
                    <th className="py-3 px-4">Peran</th>
                    <th className="py-3 px-4">Cakupan Data / Atlet Tertaut</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredMembers.map((m) => {
                    const linkedNames = (m.linkedAthleteIds || [])
                      .map((id) => athleteMap.get(id)?.fullName)
                      .filter(Boolean) as string[];
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{m.displayName}</div>
                          <div className="font-mono-tabular text-slate-500 mt-0.5">
                            {m.memberEmail}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {m.role === 'coach' ? 'Pelatih' : 'Wali Murid'}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs">
                          {m.role === 'coach' ? (
                            <span>{m.coachName ? `Profil: ${m.coachName}` : 'Seluruh data teknis latihan klub'}</span>
                          ) : linkedNames.length > 0 ? (
                            <span>{linkedNames.join(', ')}</span>
                          ) : (
                            <span className="text-amber-700">Belum ada atlet tertaut</span>
                          )}
                          {m.notes && <div className="text-slate-400 mt-0.5 truncate">{m.notes}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(m)}
                            title="Klik untuk aktif/nonaktifkan akses"
                            className={`font-semibold cursor-pointer ${
                              m.status === 'Aktif' ? 'text-emerald-700 hover:text-emerald-800' : 'text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            {m.status}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onPreviewRole(m.role, {
                                  coachName: m.coachName || m.displayName,
                                  athleteIds: m.linkedAthleteIds,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md cursor-pointer"
                              title="Lihat portal seperti akun ini"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Pratinjau
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(m)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
                              aria-label={`Edit ${m.displayName}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {confirmDeleteId === m.id ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteMember(m)}
                                className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded cursor-pointer"
                              >
                                Yakin?
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(m.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                                aria-label={`Hapus ${m.displayName}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
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

      {/* Add / Edit Access Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 pb-safe">
            <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                {editingMember ? 'Edit Akses Pengguna' : 'Undang Pelatih / Wali Murid'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal akses"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMember} noValidate className="mt-4 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Peran Pengguna <span className="text-red-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CLUB_MEMBER_ROLES.map((roleOpt) => {
                    const selected = mRole === roleOpt;
                    return (
                      <button
                        key={roleOpt}
                        type="button"
                        onClick={() => {
                          setMRole(roleOpt);
                          setFieldErrors((p) => ({ ...p, linkedAthleteIds: undefined }));
                        }}
                        className={`px-3 min-h-[44px] sm:min-h-[38px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          selected
                            ? 'border-sky-700 bg-sky-50 text-sky-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {roleOpt === 'coach' ? 'Pelatih' : 'Wali Murid'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Akun Google (Gmail) <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  maxLength={LIMITS.clubMember.memberEmailMax}
                  value={mEmail}
                  onChange={(e) => {
                    setMEmail(e.target.value);
                    setFieldErrors((p) => ({ ...p, memberEmail: undefined }));
                  }}
                  placeholder="nama@gmail.com"
                  className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm font-mono-tabular border rounded-lg ${
                    fieldErrors.memberEmail ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {fieldErrors.memberEmail && (
                  <p className="text-[11px] text-red-600 mt-1">{fieldErrors.memberEmail}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Lengkap <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.clubMember.displayNameMax}
                    value={mDisplayName}
                    onChange={(e) => {
                      setMDisplayName(e.target.value);
                      setFieldErrors((p) => ({ ...p, displayName: undefined }));
                    }}
                    placeholder={mRole === 'coach' ? 'Coach Hendra' : 'Ibu Sinta'}
                    className={`w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border rounded-lg ${
                      fieldErrors.displayName ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                  />
                  {fieldErrors.displayName && (
                    <p className="text-[11px] text-red-600 mt-1">{fieldErrors.displayName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status Akses</label>
                  <BottomSheetSelect
                    value={mStatus}
                    onChange={(v) => setMStatus(v as ClubMemberStatus)}
                    title="Status Akses Pengguna"
                    options={CLUB_MEMBER_STATUSES.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              </div>

              {mRole === 'coach' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Profil Pelatih Terkait (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.clubMember.coachNameMax}
                    value={mCoachName}
                    onChange={(e) => setMCoachName(e.target.value)}
                    placeholder="Contoh: Coach Hendra Wijaya"
                    className="w-full px-3 min-h-[44px] sm:min-h-[38px] text-base sm:text-sm border border-slate-200 rounded-lg"
                  />
                  {coaches.length > 0 && (
                    <div className="mt-1.5">
                      <BottomSheetSelect
                        value={coaches.some((c) => c.fullName === mCoachName) ? mCoachName : ''}
                        onChange={(val) => {
                          setMCoachName(val);
                          if (!mDisplayName.trim()) setMDisplayName(val);
                          const matched = coaches.find((c) => c.fullName === val);
                          if (!mEmail.trim() && matched?.email) {
                            setMEmail(matched.email);
                          }
                        }}
                        title="Pilih dari Daftar Pelatih"
                        placeholder="Pilih cepat dari profil pelatih..."
                        icon={<UserCheck className="w-3.5 h-3.5" />}
                        options={coaches.map((c) => ({
                          value: c.fullName,
                          label: c.fullName,
                          badge: c.role,
                        }))}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700">
                      Tautkan Atlet Anak <span className="text-red-600">*</span>
                    </label>
                    <span className="font-mono-tabular text-[11px] text-sky-700 font-semibold">
                      {mLinkedAthleteIds.length} terpilih
                    </span>
                  </div>

                  {athletes.length === 0 ? (
                    <p className="text-xs text-amber-700 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      Belum ada data atlet di klub. Tambahkan atlet terlebih dahulu di menu Atlet & Waktu.
                    </p>
                  ) : (
                    <>
                      {athletes.length > 5 && (
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={athleteSearchInModal}
                            onChange={(e) => setAthleteSearchInModal(e.target.value)}
                            placeholder="Cari nama atlet atau nama wali..."
                            className="w-full pl-8 pr-3 min-h-[38px] text-xs border border-slate-200 rounded-lg"
                          />
                        </div>
                      )}
                      <div
                        className={`max-h-48 overflow-y-auto divide-y divide-slate-100 border rounded-lg ${
                          fieldErrors.linkedAthleteIds ? 'border-red-400' : 'border-slate-200'
                        }`}
                      >
                        {modalFilteredAthletes.map((ath) => {
                          const checked = mLinkedAthleteIds.includes(ath.id);
                          const existingParentEmail = normalizeEmail(ath.parentEmail);
                          const otherEmailConflict =
                            existingParentEmail &&
                            existingParentEmail !== normalizeEmail(mEmail);
                          return (
                            <button
                              key={ath.id}
                              type="button"
                              onClick={() => {
                                toggleLinkedAthlete(ath.id);
                                if (!checked && !mDisplayName.trim() && ath.parentName) {
                                  setMDisplayName(ath.parentName);
                                }
                              }}
                              className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 text-xs cursor-pointer ${
                                checked ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 truncate">
                                  {ath.fullName}{' '}
                                  <span className="text-slate-400 font-normal">· {ath.ageGroup}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  Wali: {ath.parentName || '-'}
                                  {otherEmailConflict && (
                                    <span className="text-amber-700">
                                      {' '}· Saat ini: {existingParentEmail}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div
                                className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                                  checked
                                    ? 'bg-sky-700 border-sky-700 text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {checked && <Check className="w-3.5 h-3.5" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {fieldErrors.linkedAthleteIds && (
                    <p className="text-[11px] text-red-600">{fieldErrors.linkedAthleteIds}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan (Opsional)
                </label>
                <textarea
                  rows={2}
                  maxLength={LIMITS.clubMember.notesMax}
                  value={mNotes}
                  onChange={(e) => setMNotes(e.target.value)}
                  placeholder="Contoh: Wali dari 2 atlet KU IV & KU II"
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
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
                  {saving ? 'Menyimpan...' : editingMember ? 'Simpan & Sinkronkan' : 'Tambah & Sinkronkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
