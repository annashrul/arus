import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { seedSampleRecordsForClub } from './lib/seedSampleClub';
import {
  clearDismissedRemindersForToday,
  computeClubReminders,
  dismissReminderForToday,
  getDismissedReminderIds,
} from './lib/reminders';
import {
  batchSetQueryParams,
  copyCurrentPageUrl,
  useQueryParam,
} from './lib/useQueryParams';
import { normalizeEmail, ROLE_SHORT_LABELS, syncClubRoleAccess } from './lib/roleAccess';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClubOnboarding } from './components/ClubOnboarding';
import { NavSection, OverviewView } from './components/OverviewView';
import { FinanceView } from './components/FinanceView';
import { AthletesAndTimesView } from './components/AthletesAndTimesView';
import { SchedulesAndAttendanceView } from './components/SchedulesAndAttendanceView';
import { InvoicesAndAdminView } from './components/InvoicesAndAdminView';
import { ClubOperationsView } from './components/ClubOperationsView';
import { ParentPaymentPortal } from './components/ParentPaymentPortal';
import { ParentNavSection, ParentWorkspaceView } from './components/ParentWorkspaceView';
import { RemindersDrawer } from './components/RemindersDrawer';
import { PrintReportKind, PrintReportModal } from './components/PrintReportModal';
import { BottomSheetSelect } from './components/BottomSheetSelect';
import {
  Athlete,
  AttendanceRecord,
  ClubAnnouncement,
  ClubCompetition,
  ClubInvoice,
  ClubMember,
  ClubProfile,
  Coach,
  EquipmentItem,
  FinanceTransaction,
  PaymentRequest,
  PoolFacility,
  SwimTime,
  TrainingSchedule,
  UserRole,
} from './types/club';
import {
  Award,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  Eye,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Menu,
  Printer,
  Receipt,
  Timer,
  Users,
  Wallet,
  X,
} from 'lucide-react';

const ADMIN_NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'finance', label: 'Keuangan Kas', icon: Wallet },
  { id: 'athletes', label: 'Atlet & Waktu', icon: Users },
  { id: 'schedules', label: 'Jadwal & Presensi', icon: CalendarDays },
  { id: 'invoices', label: 'Invoice & Adm', icon: Receipt },
  { id: 'clubops', label: 'Pelatih & Klub', icon: Briefcase },
];

const COACH_NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Beranda Pelatih', icon: LayoutDashboard },
  { id: 'athletes', label: 'Atlet & Waktu', icon: Users },
  { id: 'schedules', label: 'Jadwal & Presensi', icon: CalendarDays },
  { id: 'clubops', label: 'Kolam & Info Klub', icon: Briefcase },
];

const PARENT_NAV_ITEMS: {
  id: ParentNavSection;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'overview', label: 'Beranda Anak', mobileLabel: 'Beranda', icon: LayoutDashboard },
  { id: 'progress', label: 'Progres & Waktu', mobileLabel: 'Progres', icon: Timer },
  { id: 'schedules', label: 'Jadwal & Presensi', mobileLabel: 'Jadwal', icon: CalendarDays },
  { id: 'billing', label: 'Tagihan SPP', mobileLabel: 'Tagihan', icon: Receipt },
  { id: 'info', label: 'Info & Lomba', mobileLabel: 'Info', icon: Award },
];

const ALLOWED_NAVS: readonly NavSection[] = [
  'overview',
  'finance',
  'athletes',
  'schedules',
  'invoices',
  'clubops',
];

const ALLOWED_PARENT_NAVS: readonly ParentNavSection[] = [
  'overview',
  'progress',
  'schedules',
  'billing',
  'info',
];

const ALLOWED_REPORTS: readonly ('' | PrintReportKind)[] = [
  '',
  'executive',
  'finance',
  'athletes',
  'schedules',
  'invoices',
  'clubops',
];

function SwimmingClubWorkspace() {
  const [bayarToken, setBayarToken] = useQueryParam('bayar', '');
  const isParentPaymentRoute = bayarToken.trim() !== '';

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [clubsLoading, setClubsLoading] = useState(true);
  const [ownedClubs, setOwnedClubs] = useState<ClubProfile[]>([]);
  const [coachClubs, setCoachClubs] = useState<ClubProfile[]>([]);
  const [parentClubs, setParentClubs] = useState<ClubProfile[]>([]);
  const [memberEntries, setMemberEntries] = useState<ClubMember[]>([]);
  const [accessRefreshTick, setAccessRefreshTick] = useState(0);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [swimTimes, setSwimTimes] = useState<SwimTime[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [schedules, setSchedules] = useState<TrainingSchedule[]>([]);
  const [invoices, setInvoices] = useState<ClubInvoice[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [announcements, setAnnouncements] = useState<ClubAnnouncement[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [pools, setPools] = useState<PoolFacility[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [competitions, setCompetitions] = useState<ClubCompetition[]>([]);
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);

  const [activeNav, setActiveNav] = useQueryParam<NavSection>('nav', 'overview', {
    allowed: ALLOWED_NAVS,
    history: 'push',
  });
  const [parentNav, setParentNav] = useQueryParam<ParentNavSection>('wm_nav', 'overview', {
    allowed: ALLOWED_PARENT_NAVS,
    history: 'push',
  });
  const [previewRoleParam] = useQueryParam<'' | 'coach' | 'parent'>('pratinjau', '', {
    allowed: ['', 'coach', 'parent'],
    history: 'push',
  });
  const [previewCoachParam] = useQueryParam('pr_pelatih', '');
  const [previewAthletesParam] = useQueryParam('pr_anak', '');

  const [remindersParam, setRemindersParam] = useQueryParam<'' | '1'>('pengingat', '', {
    allowed: ['', '1'],
  });
  const [laporanParam, setLaporanParam] = useQueryParam<'' | PrintReportKind>('laporan', '', {
    allowed: ALLOWED_REPORTS,
  });

  const remindersOpen = remindersParam === '1';
  const setRemindersOpen = (open: boolean) => setRemindersParam(open ? '1' : '');

  const printReportKind: PrintReportKind | null =
    laporanParam === '' ? null : (laporanParam as PrintReportKind);
  const setPrintReportKind = (kind: PrintReportKind | null) =>
    setLaporanParam(kind ?? '');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);
  const [dismissedReminderIds, setDismissedReminderIds] = useState<string[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const syncedProofKeysRef = useRef<Set<string>>(new Set());

  // 1. Auth Listener (skip in public payment portal view)
  useEffect(() => {
    if (isParentPaymentRoute) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) {
        setOwnedClubs([]);
        setCoachClubs([]);
        setParentClubs([]);
        setMemberEntries([]);
        setClubsLoading(false);
      }
    });
    return () => unsub();
  }, [isParentPaymentRoute]);

  // 2. Multi-role Clubs & Membership Discovery Listener
  useEffect(() => {
    if (isParentPaymentRoute || !authReady || !user) return;
    setClubsLoading(true);

    const emailLower = user.emailVerified ? normalizeEmail(user.email) : '';
    let ownedReady = false;
    let memberReady = !emailLower;
    let coachReady = !emailLower;
    let parentReady = !emailLower;

    const markReady = () => {
      if (ownedReady && memberReady && coachReady && parentReady) {
        setClubsLoading(false);
      }
    };

    const unsubOwned = onSnapshot(
      query(collection(db, 'clubs'), where('ownerId', '==', user.uid)),
      (snap) => {
        setOwnedClubs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubProfile, 'id'>) })));
        ownedReady = true;
        markReady();
      },
      (error) => {
        ownedReady = true;
        markReady();
        handleFirestoreError(error, OperationType.LIST, 'clubs');
      }
    );

    if (!emailLower) {
      setMemberEntries([]);
      setCoachClubs([]);
      setParentClubs([]);
      return () => unsubOwned();
    }

    const unsubMemberEntries = onSnapshot(
      query(collection(db, 'clubMembers'), where('memberEmail', '==', emailLower)),
      (snap) => {
        setMemberEntries(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubMember, 'id'>) }))
        );
        memberReady = true;
        markReady();
      },
      () => {
        setMemberEntries([]);
        memberReady = true;
        markReady();
      }
    );

    const unsubCoachClubs = onSnapshot(
      query(collection(db, 'clubs'), where('coachEmails', 'array-contains', emailLower)),
      (snap) => {
        setCoachClubs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubProfile, 'id'>) })));
        coachReady = true;
        markReady();
      },
      () => {
        setCoachClubs([]);
        coachReady = true;
        markReady();
      }
    );

    const unsubParentClubs = onSnapshot(
      query(collection(db, 'clubs'), where('parentEmails', 'array-contains', emailLower)),
      (snap) => {
        setParentClubs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubProfile, 'id'>) })));
        parentReady = true;
        markReady();
      },
      () => {
        setParentClubs([]);
        parentReady = true;
        markReady();
      }
    );

    return () => {
      unsubOwned();
      unsubMemberEntries();
      unsubCoachClubs();
      unsubParentClubs();
    };
  }, [isParentPaymentRoute, authReady, user, accessRefreshTick]);

  // Merge discovered clubs (owned first, then coach, then parent)
  const clubs = useMemo(() => {
    const map = new Map<string, ClubProfile>();
    for (const c of ownedClubs) map.set(c.id, c);
    for (const c of coachClubs) {
      if (!map.has(c.id)) map.set(c.id, c);
    }
    for (const c of parentClubs) {
      if (!map.has(c.id)) map.set(c.id, c);
    }
    return Array.from(map.values());
  }, [ownedClubs, coachClubs, parentClubs]);

  useEffect(() => {
    if (clubs.length > 0 && (!selectedClubId || !clubs.some((c) => c.id === selectedClubId))) {
      setSelectedClubId(clubs[0].id);
    }
  }, [clubs, selectedClubId]);

  const activeClub = clubs.find((c) => c.id === selectedClubId) || clubs[0] || null;
  const userEmailLower = user?.emailVerified ? normalizeEmail(user.email) : '';

  const activeMemberEntry = useMemo(() => {
    if (!activeClub || !userEmailLower) return null;
    return (
      memberEntries.find(
        (m) =>
          m.clubId === activeClub.id &&
          m.status === 'Aktif' &&
          normalizeEmail(m.memberEmail) === userEmailLower
      ) || null
    );
  }, [activeClub, memberEntries, userEmailLower]);

  // Determine actual Firebase-backed role for the active club
  const actualRole: UserRole = useMemo(() => {
    if (!user || !activeClub) return 'admin';
    if (activeClub.ownerId === user.uid) return 'admin';
    if (activeMemberEntry) return activeMemberEntry.role;
    if (userEmailLower && (activeClub.coachEmails || []).includes(userEmailLower)) return 'coach';
    if (userEmailLower && (activeClub.parentEmails || []).includes(userEmailLower)) return 'parent';
    return 'parent';
  }, [user, activeClub, activeMemberEntry, userEmailLower]);

  const isPreviewing = actualRole === 'admin' && previewRoleParam !== '';
  const effectiveRole: UserRole = isPreviewing ? (previewRoleParam as UserRole) : actualRole;

  const coachDisplayName = useMemo(() => {
    if (!activeClub) return '';
    if (isPreviewing && effectiveRole === 'coach') {
      return previewCoachParam || activeClub.headCoach;
    }
    if (actualRole === 'coach') {
      return (
        activeMemberEntry?.coachName ||
        activeMemberEntry?.displayName ||
        user?.displayName ||
        activeClub.headCoach
      );
    }
    return user?.displayName || activeClub.headCoach;
  }, [activeClub, isPreviewing, effectiveRole, previewCoachParam, actualRole, activeMemberEntry, user]);

  // 3. Domain Listeners (strictly scoped by `actualRole` so Coach/Parent never query restricted collections)
  useEffect(() => {
    if (isParentPaymentRoute || !authReady || !user || !activeClub) {
      setAthletes([]);
      setSwimTimes([]);
      setTransactions([]);
      setSchedules([]);
      setInvoices([]);
      setPaymentRequests([]);
      setAttendance([]);
      setAnnouncements([]);
      setCoaches([]);
      setPools([]);
      setEquipment([]);
      setCompetitions([]);
      setClubMembers([]);
      return;
    }

    const uid = user.uid;
    const cid = activeClub.id;
    const emailLower = user.emailVerified ? normalizeEmail(user.email) : '';
    const unsubs: (() => void)[] = [];

    if (actualRole === 'admin') {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'athletes'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) => setAthletes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Athlete, 'id'>) }))),
          (err) => handleFirestoreError(err, OperationType.LIST, 'athletes')
        ),
        onSnapshot(
          query(collection(db, 'swimTimes'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) => setSwimTimes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SwimTime, 'id'>) }))),
          (err) => handleFirestoreError(err, OperationType.LIST, 'swimTimes')
        ),
        onSnapshot(
          query(collection(db, 'transactions'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) =>
            setTransactions(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FinanceTransaction, 'id'>) }))
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
        ),
        onSnapshot(
          query(collection(db, 'schedules'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) =>
            setSchedules(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrainingSchedule, 'id'>) }))
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'schedules')
        ),
        onSnapshot(
          query(collection(db, 'invoices'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) => setInvoices(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubInvoice, 'id'>) }))),
          (err) => handleFirestoreError(err, OperationType.LIST, 'invoices')
        ),
        onSnapshot(
          query(collection(db, 'attendance'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) =>
            setAttendance(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }))
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
        ),
        onSnapshot(
          query(collection(db, 'announcements'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) =>
            setAnnouncements(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubAnnouncement, 'id'>) }))
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
        ),
        onSnapshot(
          query(collection(db, 'coaches'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) => setCoaches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Coach, 'id'>) }))),
          (err) => handleFirestoreError(err, OperationType.LIST, 'coaches')
        ),
        onSnapshot(
          query(collection(db, 'pools'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) => setPools(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PoolFacility, 'id'>) }))),
          (err) => handleFirestoreError(err, OperationType.LIST, 'pools')
        ),
        onSnapshot(
          query(collection(db, 'equipment'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) =>
            setEquipment(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EquipmentItem, 'id'>) }))
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'equipment')
        ),
        onSnapshot(
          query(collection(db, 'competitions'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) =>
            setCompetitions(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubCompetition, 'id'>) }))
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'competitions')
        ),
        onSnapshot(
          query(collection(db, 'paymentRequests'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) =>
            setPaymentRequests(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRequest, 'id'>) }))
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'paymentRequests')
        ),
        onSnapshot(
          query(collection(db, 'clubMembers'), where('ownerId', '==', uid), where('clubId', '==', cid)),
          (snap) =>
            setClubMembers(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubMember, 'id'>) }))
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'clubMembers')
        )
      );
    } else if (actualRole === 'coach' && emailLower) {
      setTransactions([]);
      setCoaches([]);
      setInvoices([]);
      setPaymentRequests([]);
      setClubMembers([]);

      unsubs.push(
        onSnapshot(
          query(collection(db, 'athletes'), where('coachEmails', 'array-contains', emailLower)),
          (snap) =>
            setAthletes(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<Athlete, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'athletes')
        ),
        onSnapshot(
          query(collection(db, 'swimTimes'), where('coachEmails', 'array-contains', emailLower)),
          (snap) =>
            setSwimTimes(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<SwimTime, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'swimTimes')
        ),
        onSnapshot(
          query(collection(db, 'schedules'), where('coachEmails', 'array-contains', emailLower)),
          (snap) =>
            setSchedules(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<TrainingSchedule, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'schedules')
        ),
        onSnapshot(
          query(collection(db, 'attendance'), where('coachEmails', 'array-contains', emailLower)),
          (snap) =>
            setAttendance(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
        ),
        onSnapshot(
          query(collection(db, 'announcements'), where('coachEmails', 'array-contains', emailLower)),
          (snap) =>
            setAnnouncements(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<ClubAnnouncement, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
        ),
        onSnapshot(
          query(collection(db, 'pools'), where('coachEmails', 'array-contains', emailLower)),
          (snap) =>
            setPools(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<PoolFacility, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'pools')
        ),
        onSnapshot(
          query(collection(db, 'equipment'), where('coachEmails', 'array-contains', emailLower)),
          (snap) =>
            setEquipment(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<EquipmentItem, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'equipment')
        ),
        onSnapshot(
          query(collection(db, 'competitions'), where('coachEmails', 'array-contains', emailLower)),
          (snap) =>
            setCompetitions(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<ClubCompetition, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'competitions')
        )
      );
    } else if (actualRole === 'parent' && emailLower) {
      setTransactions([]);
      setCoaches([]);
      setPools([]);
      setEquipment([]);
      setClubMembers([]);

      unsubs.push(
        onSnapshot(
          query(collection(db, 'athletes'), where('parentEmail', '==', emailLower)),
          (snap) =>
            setAthletes(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<Athlete, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'athletes')
        ),
        onSnapshot(
          query(collection(db, 'swimTimes'), where('parentEmail', '==', emailLower)),
          (snap) =>
            setSwimTimes(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<SwimTime, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'swimTimes')
        ),
        onSnapshot(
          query(collection(db, 'attendance'), where('parentEmail', '==', emailLower)),
          (snap) =>
            setAttendance(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
        ),
        onSnapshot(
          query(collection(db, 'invoices'), where('parentEmail', '==', emailLower)),
          (snap) =>
            setInvoices(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<ClubInvoice, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'invoices')
        ),
        onSnapshot(
          query(collection(db, 'paymentRequests'), where('parentEmail', '==', emailLower)),
          (snap) =>
            setPaymentRequests(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRequest, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'paymentRequests')
        ),
        onSnapshot(
          query(collection(db, 'schedules'), where('parentEmails', 'array-contains', emailLower)),
          (snap) =>
            setSchedules(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<TrainingSchedule, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'schedules')
        ),
        onSnapshot(
          query(collection(db, 'announcements'), where('parentEmails', 'array-contains', emailLower)),
          (snap) =>
            setAnnouncements(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<ClubAnnouncement, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
        ),
        onSnapshot(
          query(collection(db, 'competitions'), where('parentEmails', 'array-contains', emailLower)),
          (snap) =>
            setCompetitions(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<ClubCompetition, 'id'>) }))
                .filter((x) => x.clubId === cid)
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'competitions')
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isParentPaymentRoute, authReady, user, activeClub, actualRole]);

  // Auto-sync parent-uploaded payment proofs from /paymentRequests/{token} into /invoices/{id} (Admin only)
  useEffect(() => {
    if (
      isParentPaymentRoute ||
      actualRole !== 'admin' ||
      !user ||
      !activeClub ||
      paymentRequests.length === 0 ||
      invoices.length === 0
    ) {
      return;
    }
    const invoiceById = new Map<string, ClubInvoice>(invoices.map((inv) => [inv.id, inv]));
    for (const pr of paymentRequests) {
      if (pr.status !== 'Menunggu Verifikasi') continue;
      const inv = invoiceById.get(pr.invoiceId);
      if (!inv) continue;
      if (inv.status !== 'Belum Lunas' && inv.status !== 'Jatuh Tempo') continue;

      const syncKey = `${pr.id}:${pr.submittedAt || ''}:${inv.status}`;
      if (syncedProofKeysRef.current.has(syncKey)) continue;
      syncedProofKeysRef.current.add(syncKey);

      void updateDoc(doc(db, 'invoices', inv.id), {
        status: 'Menunggu Verifikasi',
        paymentToken: pr.id,
        proofImageDataUrl: pr.proofImageDataUrl || '',
        proofPayerName: pr.payerName || '',
        proofMethod: pr.paymentMethod || 'Transfer Bank',
        proofNote: pr.proofNote || '',
        proofSubmittedAt: pr.submittedAt || '',
        paymentRejectionReason: '',
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        syncedProofKeysRef.current.delete(syncKey);
        handleFirestoreError(err, OperationType.UPDATE, `invoices/${inv.id}`);
      });
    }
  }, [isParentPaymentRoute, actualRole, user, activeClub, paymentRequests, invoices]);

  useEffect(() => {
    if (!activeClub) {
      setDismissedReminderIds([]);
      return;
    }
    setDismissedReminderIds(getDismissedReminderIds(activeClub.id));
  }, [activeClub]);

  // Scope Parent Workspace data cleanly (in Preview Mode, filter by previewAthletesParam or sample child)
  const parentScopedData = useMemo(() => {
    if (actualRole === 'parent') {
      return {
        athletes,
        swimTimes,
        attendance,
        invoices,
        paymentRequests,
      };
    }

    // Admin previewing Wali Murid
    const requestedIds = previewAthletesParam
      .split(',')
      .map((s) => s.trim())
      .filter((id) => athletes.some((a) => a.id === id));

    const firstParentLinked =
      clubMembers.find((m) => m.role === 'parent' && m.status === 'Aktif' && m.linkedAthleteIds.length > 0)
        ?.linkedAthleteIds || [];
    const fallbackIds =
      requestedIds.length > 0
        ? requestedIds
        : firstParentLinked.length > 0
        ? firstParentLinked
        : athletes[0]
        ? [athletes[0].id]
        : [];
    const idSet = new Set(fallbackIds);
    const scopedAthletes = athletes.filter((a) => idSet.has(a.id));
    const scopedInvoices = invoices.filter((i) => idSet.has(i.athleteId));
    const invIdSet = new Set(scopedInvoices.map((i) => i.id));

    return {
      athletes: scopedAthletes,
      swimTimes: swimTimes.filter((t) => idSet.has(t.athleteId)),
      attendance: attendance.filter((r) => idSet.has(r.athleteId)),
      invoices: scopedInvoices,
      paymentRequests: paymentRequests.filter((pr) => invIdSet.has(pr.invoiceId)),
    };
  }, [
    actualRole,
    athletes,
    swimTimes,
    attendance,
    invoices,
    paymentRequests,
    previewAthletesParam,
    clubMembers,
  ]);

  const allReminders = useMemo(() => {
    if (!activeClub) return [];
    if (effectiveRole === 'parent') return [];
    return computeClubReminders({
      club: activeClub,
      athletes,
      invoices: effectiveRole === 'admin' ? invoices : [],
      paymentRequests: effectiveRole === 'admin' ? paymentRequests : [],
      schedules,
      attendance,
      announcements,
      competitions,
      equipment,
    });
  }, [
    activeClub,
    effectiveRole,
    athletes,
    invoices,
    paymentRequests,
    schedules,
    attendance,
    announcements,
    competitions,
    equipment,
  ]);

  const activeReminders = useMemo(
    () => allReminders.filter((r) => !dismissedReminderIds.includes(r.id)),
    [allReminders, dismissedReminderIds]
  );

  const urgentReminderCount = useMemo(
    () => activeReminders.filter((r) => r.severity === 'urgent').length,
    [activeReminders]
  );

  const handleLoadSampleData = async () => {
    if (!user || !activeClub || actualRole !== 'admin') return;
    setSeedingSample(true);
    try {
      await seedSampleRecordsForClub(activeClub.id, user.uid);
    } finally {
      setSeedingSample(false);
    }
  };

  const handleSyncAccess = async (overrideMembers?: ClubMember[]) => {
    if (!activeClub || !user || actualRole !== 'admin') {
      return { coachCount: 0, parentCount: 0, updatedDocs: 0 };
    }
    return syncClubRoleAccess({
      club: activeClub,
      ownerId: activeClub.ownerId,
      members: overrideMembers ?? clubMembers,
    });
  };

  const handlePreviewRole = (
    role: 'coach' | 'parent',
    opts?: { coachName?: string; athleteIds?: string[] }
  ) => {
    if (actualRole !== 'admin') return;
    batchSetQueryParams(
      {
        pratinjau: role,
        pr_pelatih: opts?.coachName || '',
        pr_anak: (opts?.athleteIds || []).join(','),
        ...(role === 'parent' ? { wm_nav: 'overview', nav: 'overview' } : { nav: 'overview' }),
      },
      'push'
    );
    setMobileMenuOpen(false);
  };

  const handleExitPreview = () => {
    batchSetQueryParams(
      {
        pratinjau: '',
        pr_pelatih: '',
        pr_anak: '',
      },
      'push'
    );
    setMobileMenuOpen(false);
  };

  const handleCopyCurrentUrl = async () => {
    const ok = await copyCurrentPageUrl();
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (isParentPaymentRoute) {
    return (
      <ParentPaymentPortal
        token={bayarToken}
        onExitToAdmin={() => setBayarToken('', 'push')}
      />
    );
  }

  if (!authReady || (user && clubsLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-sky-700" />
          <span>Memuat workspace klub renang...</span>
        </div>
      </div>
    );
  }

  if (!user || !activeClub) {
    return (
      <ClubOnboarding
        user={user}
        onClubCreated={() => {}}
        checkingAccess={clubsLoading}
        onRefreshAccess={() => setAccessRefreshTick((t) => t + 1)}
      />
    );
  }

  // Resolve active nav safely per role
  const resolvedAdminCoachNav: NavSection =
    effectiveRole === 'coach' && (activeNav === 'finance' || activeNav === 'invoices')
      ? 'overview'
      : activeNav;

  const visibleNavItems = effectiveRole === 'coach' ? COACH_NAV_ITEMS : ADMIN_NAV_ITEMS;

  const currentNavLabel =
    effectiveRole === 'parent'
      ? PARENT_NAV_ITEMS.find((n) => n.id === parentNav)?.label || 'Beranda Anak'
      : visibleNavItems.find((n) => n.id === resolvedAdminCoachNav)?.label || 'Ringkasan';

  const MOBILE_NAV_LABELS: Record<NavSection, string> = {
    overview: 'Ringkas',
    finance: 'Kas',
    athletes: 'Atlet',
    schedules: 'Jadwal',
    invoices: 'Tagihan',
    clubops: 'Klub',
  };

  const defaultReportForNav: Record<NavSection, PrintReportKind> = {
    overview: effectiveRole === 'coach' ? 'athletes' : 'executive',
    finance: 'finance',
    athletes: 'athletes',
    schedules: 'schedules',
    invoices: 'invoices',
    clubops: 'clubops',
  };

  const renderAdminPreviewSwitcher = (compact = false) => {
    if (actualRole !== 'admin') return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
          <span>Pratinjau Peran</span>
          {isPreviewing && (
            <button
              type="button"
              onClick={handleExitPreview}
              className="text-sky-700 hover:text-sky-900 font-semibold cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={handleExitPreview}
            className={`px-1.5 ${compact ? 'min-h-[34px]' : 'py-1.5'} text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
              !isPreviewing ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => handlePreviewRole('coach', { coachName: activeClub.headCoach })}
            className={`px-1.5 ${compact ? 'min-h-[34px]' : 'py-1.5'} text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
              previewRoleParam === 'coach'
                ? 'bg-white text-sky-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pelatih
          </button>
          <button
            type="button"
            onClick={() =>
              handlePreviewRole('parent', {
                athleteIds: athletes[0] ? [athletes[0].id] : [],
              })
            }
            className={`px-1.5 ${compact ? 'min-h-[34px]' : 'py-1.5'} text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
              previewRoleParam === 'parent'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Wali
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={`min-h-screen bg-slate-50 flex ${printReportKind ? 'no-print' : ''}`}>
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 no-print">
          <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200">
            <img
              src="/src/assets/images/swim_club_emblem_1795440060748.jpg"
              alt="Logo Klub"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-md object-cover border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-slate-900 truncate">
                {activeClub.name}
              </div>
              <div className="text-[11px] font-medium text-sky-700 truncate">
                {ROLE_SHORT_LABELS[effectiveRole]}
                {isPreviewing ? ' (Pratinjau)' : ''}
              </div>
            </div>
          </div>

          {clubs.length > 1 && (
            <div className="px-3 pt-3">
              <BottomSheetSelect
                value={activeClub.id}
                onChange={(cid) => setSelectedClubId(cid)}
                title="Pilih Klub Renang"
                icon={<Building2 className="w-3.5 h-3.5" />}
                options={clubs.map((c) => ({
                  value: c.id,
                  label: c.name,
                  badge: c.city,
                }))}
              />
            </div>
          )}

          <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
            {effectiveRole === 'parent'
              ? PARENT_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = parentNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setParentNav(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-sky-50 text-sky-800'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-sky-700' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })
              : visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = resolvedAdminCoachNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveNav(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-sky-50 text-sky-800'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-sky-700' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
          </nav>

          <div className="p-4 border-t border-slate-200 space-y-3">
            {renderAdminPreviewSwitcher(false)}
            <div className="text-xs">
              <div className="font-semibold text-slate-900 truncate">
                {actualRole === 'coach'
                  ? coachDisplayName
                  : actualRole === 'parent'
                  ? activeMemberEntry?.displayName || user.displayName || 'Wali Murid'
                  : user.displayName || activeClub.headCoach}
              </div>
              <div className="text-slate-500 truncate">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar Akun
            </button>
          </div>
        </aside>

        {/* Mobile Sidebar Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex no-print">
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col justify-between p-4 pb-safe z-10 border-r border-slate-200 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src="/src/assets/images/swim_club_emblem_1795440060748.jpg"
                      alt="Logo Klub"
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-md object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-display text-sm font-bold text-slate-900 truncate">
                        {activeClub.name}
                      </div>
                      <div className="text-xs text-sky-700 font-medium truncate">
                        {ROLE_SHORT_LABELS[effectiveRole]}
                        {isPreviewing ? ' (Pratinjau)' : ` · ${activeClub.city}`}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-slate-500 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                    aria-label="Tutup menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {clubs.length > 1 && (
                  <div className="mt-3">
                    <BottomSheetSelect
                      value={activeClub.id}
                      onChange={(cid) => {
                        setSelectedClubId(cid);
                        setMobileMenuOpen(false);
                      }}
                      title="Pilih Klub Renang"
                      icon={<Building2 className="w-3.5 h-3.5" />}
                      options={clubs.map((c) => ({
                        value: c.id,
                        label: c.name,
                        badge: c.city,
                      }))}
                    />
                  </div>
                )}

                <nav className="mt-4 space-y-1">
                  {effectiveRole === 'parent'
                    ? PARENT_NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = parentNav === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setParentNav(item.id);
                              setMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3.5 min-h-[48px] text-sm font-medium rounded-xl cursor-pointer ${
                              active ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })
                    : visibleNavItems.map((item) => {
                        const Icon = item.icon;
                        const active = resolvedAdminCoachNav === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveNav(item.id);
                              setMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3.5 min-h-[48px] text-sm font-medium rounded-xl cursor-pointer ${
                              active ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                </nav>
              </div>
              <div className="pt-4 border-t border-slate-200 space-y-3 mt-4">
                {renderAdminPreviewSwitcher(true)}
                <div className="text-xs px-1">
                  <div className="font-semibold text-slate-900 truncate">
                    {actualRole === 'coach'
                      ? coachDisplayName
                      : actualRole === 'parent'
                      ? activeMemberEntry?.displayName || user.displayName || 'Wali Murid'
                      : user.displayName || activeClub.headCoach}
                  </div>
                  <div className="text-slate-500 truncate">{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => signOut(auth)}
                  className="w-full flex items-center justify-center gap-2 px-3 min-h-[44px] text-xs font-medium text-slate-700 border border-slate-200 rounded-xl cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Keluar Akun
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="h-14 lg:h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-8 relative lg:sticky lg:top-0 z-30 no-print">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-2 text-slate-700 hover:text-slate-900 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Buka menu navigasi"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                  {ROLE_SHORT_LABELS[effectiveRole]}
                </span>
                <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                  /
                </span>
                <span className="font-display font-semibold text-slate-900 truncate">
                  {currentNavLabel}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyCurrentUrl}
                aria-label="Salin link halaman beserta filter aktif"
                title="Salin link halaman ini beserta tab & filter aktif"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 min-h-[40px] lg:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedLink ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Link2 className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                )}
                <span className="hidden sm:inline">{copiedLink ? 'Tersalin' : 'Salin Link'}</span>
              </button>

              {effectiveRole !== 'parent' && (
                <>
                  <button
                    type="button"
                    onClick={() => setRemindersOpen(true)}
                    aria-label="Buka notifikasi pengingat"
                    className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 min-h-[40px] lg:min-h-[36px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Bell
                      className={`w-3.5 h-3.5 shrink-0 ${
                        urgentReminderCount > 0 ? 'text-red-600' : 'text-slate-600'
                      }`}
                    />
                    <span className="hidden sm:inline">Pengingat</span>
                    {activeReminders.length > 0 && (
                      <span
                        className={`font-mono-tabular font-bold ${
                          urgentReminderCount > 0 ? 'text-red-600' : 'text-sky-700'
                        }`}
                      >
                        ({activeReminders.length})
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintReportKind(defaultReportForNav[resolvedAdminCoachNav])}
                    className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 min-h-[40px] lg:min-h-[36px] text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 shrink-0" />
                    <span>Cetak Laporan</span>
                  </button>
                </>
              )}
            </div>
          </header>

          {/* Admin Role Preview Banner */}
          {isPreviewing && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-2 no-print">
              <div className="flex items-center gap-2 text-xs text-amber-950">
                <Eye className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  <span className="font-semibold">Mode Pratinjau Admin:</span> Menampilkan workspace sebagai{' '}
                  <span className="font-semibold">{ROLE_SHORT_LABELS[effectiveRole]}</span>
                  {effectiveRole === 'coach' && coachDisplayName ? ` (${coachDisplayName})` : ''}.
                </span>
              </div>
              <button
                type="button"
                onClick={handleExitPreview}
                className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg whitespace-nowrap cursor-pointer"
              >
                Kembali ke Mode Admin
              </button>
            </div>
          )}

          <main className="flex-1 px-4 pt-4 pb-24 sm:px-6 sm:pt-6 sm:pb-24 lg:p-8 max-w-[1400px] w-full mx-auto">
            {effectiveRole === 'parent' ? (
              <ParentWorkspaceView
                club={activeClub}
                activeSection={parentNav}
                onNavigate={setParentNav}
                athletes={parentScopedData.athletes}
                swimTimes={parentScopedData.swimTimes}
                schedules={schedules}
                attendance={parentScopedData.attendance}
                invoices={parentScopedData.invoices}
                paymentRequests={parentScopedData.paymentRequests}
                announcements={announcements}
                competitions={competitions}
                isPreview={isPreviewing}
              />
            ) : (
              <>
                {resolvedAdminCoachNav === 'overview' && (
                  <OverviewView
                    club={activeClub}
                    athletes={athletes}
                    swimTimes={swimTimes}
                    transactions={effectiveRole === 'admin' ? transactions : []}
                    schedules={schedules}
                    attendance={attendance}
                    invoices={effectiveRole === 'admin' ? invoices : []}
                    paymentRequests={effectiveRole === 'admin' ? paymentRequests : []}
                    announcements={announcements}
                    coaches={effectiveRole === 'admin' ? coaches : []}
                    pools={pools}
                    equipment={equipment}
                    competitions={competitions}
                    reminders={activeReminders}
                    onOpenReminders={() => setRemindersOpen(true)}
                    onOpenPrintReport={(kind) => setPrintReportKind(kind)}
                    onNavigate={setActiveNav}
                    onOpenVerificationQueue={() =>
                      batchSetQueryParams(
                        { nav: 'invoices', inv_tab: 'invoices', inv_status: 'Menunggu Verifikasi' },
                        'push'
                      )
                    }
                    onLoadSampleData={handleLoadSampleData}
                    seedingSample={seedingSample}
                    userRole={effectiveRole}
                    coachDisplayName={coachDisplayName}
                  />
                )}

                {resolvedAdminCoachNav === 'finance' && effectiveRole === 'admin' && (
                  <FinanceView
                    club={activeClub}
                    userId={user.uid}
                    transactions={transactions}
                    athletes={athletes}
                    onOpenPrintReport={() => setPrintReportKind('finance')}
                  />
                )}

                {resolvedAdminCoachNav === 'athletes' && (
                  <AthletesAndTimesView
                    club={activeClub}
                    userId={user.uid}
                    ownerId={activeClub.ownerId}
                    userRole={effectiveRole}
                    athletes={athletes}
                    swimTimes={swimTimes}
                    invoices={effectiveRole === 'admin' ? invoices : []}
                    coaches={effectiveRole === 'admin' ? coaches : []}
                    onOpenPrintReport={() => setPrintReportKind('athletes')}
                  />
                )}

                {resolvedAdminCoachNav === 'schedules' && (
                  <SchedulesAndAttendanceView
                    club={activeClub}
                    userId={user.uid}
                    ownerId={activeClub.ownerId}
                    userRole={effectiveRole}
                    schedules={schedules}
                    athletes={athletes}
                    attendance={attendance}
                    coaches={effectiveRole === 'admin' ? coaches : []}
                    pools={pools}
                    onOpenPrintReport={() => setPrintReportKind('schedules')}
                  />
                )}

                {resolvedAdminCoachNav === 'invoices' && effectiveRole === 'admin' && (
                  <InvoicesAndAdminView
                    club={activeClub}
                    userId={user.uid}
                    invoices={invoices}
                    paymentRequests={paymentRequests}
                    athletes={athletes}
                    announcements={announcements}
                    clubMembers={clubMembers}
                    coaches={coaches}
                    onSyncAccess={handleSyncAccess}
                    onPreviewRole={handlePreviewRole}
                    onOpenPrintReport={() => setPrintReportKind('invoices')}
                  />
                )}

                {resolvedAdminCoachNav === 'clubops' && (
                  <ClubOperationsView
                    club={activeClub}
                    userId={user.uid}
                    userRole={effectiveRole}
                    coaches={effectiveRole === 'admin' ? coaches : []}
                    pools={pools}
                    equipment={equipment}
                    competitions={competitions}
                    announcements={announcements}
                    athletes={athletes}
                    schedules={schedules}
                    attendance={attendance}
                    swimTimes={swimTimes}
                    onOpenPrint={() => setPrintReportKind('clubops')}
                  />
                )}
              </>
            )}
          </main>
        </div>

        {/* Fixed Mobile Bottom Tab Bar */}
        <nav
          aria-label="Navigasi utama mobile"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe no-print"
        >
          {effectiveRole === 'parent' ? (
            <div className="grid grid-cols-5 h-16 max-w-xl mx-auto">
              {PARENT_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = parentNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setParentNav(item.id)}
                    className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors cursor-pointer ${
                      active ? 'text-sky-700' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? 'stroke-[2.25]' : 'stroke-[1.75]'}`} />
                    <span className={`text-[10px] tracking-tight ${active ? 'font-semibold' : 'font-medium'}`}>
                      {item.mobileLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className={`grid ${
                visibleNavItems.length === 4 ? 'grid-cols-4' : 'grid-cols-6'
              } h-16 max-w-xl mx-auto`}
            >
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = resolvedAdminCoachNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors cursor-pointer ${
                      active ? 'text-sky-700' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? 'stroke-[2.25]' : 'stroke-[1.75]'}`} />
                    <span className={`text-[10px] tracking-tight ${active ? 'font-semibold' : 'font-medium'}`}>
                      {MOBILE_NAV_LABELS[item.id]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      </div>

      {effectiveRole !== 'parent' && (
        <>
          <RemindersDrawer
            open={remindersOpen}
            onClose={() => setRemindersOpen(false)}
            club={activeClub}
            reminders={allReminders}
            dismissedIds={dismissedReminderIds}
            onDismiss={(id) => setDismissedReminderIds(dismissReminderForToday(activeClub.id, id))}
            onResetDismissed={() =>
              setDismissedReminderIds(clearDismissedRemindersForToday(activeClub.id))
            }
            onNavigate={(nav) => {
              if (effectiveRole === 'coach' && (nav === 'finance' || nav === 'invoices')) {
                setActiveNav('overview');
              } else {
                setActiveNav(nav);
              }
            }}
          />

          <PrintReportModal
            open={printReportKind !== null}
            initialReport={printReportKind || (effectiveRole === 'coach' ? 'athletes' : 'executive')}
            onClose={() => setPrintReportKind(null)}
            club={activeClub}
            athletes={athletes}
            swimTimes={swimTimes}
            transactions={effectiveRole === 'admin' ? transactions : []}
            schedules={schedules}
            attendance={attendance}
            invoices={effectiveRole === 'admin' ? invoices : []}
            coaches={effectiveRole === 'admin' ? coaches : []}
            pools={pools}
            equipment={equipment}
            competitions={competitions}
            userRole={effectiveRole}
          />
        </>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SwimmingClubWorkspace />
    </ErrorBoundary>
  );
}
