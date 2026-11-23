import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { seedSampleRecordsForClub } from './lib/seedSampleClub';
import {
  clearDismissedRemindersForToday,
  computeClubReminders,
  dismissReminderForToday,
  getDismissedReminderIds,
} from './lib/reminders';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClubOnboarding } from './components/ClubOnboarding';
import { NavSection, OverviewView } from './components/OverviewView';
import { FinanceView } from './components/FinanceView';
import { AthletesAndTimesView } from './components/AthletesAndTimesView';
import { SchedulesAndAttendanceView } from './components/SchedulesAndAttendanceView';
import { InvoicesAndAdminView } from './components/InvoicesAndAdminView';
import { RemindersDrawer } from './components/RemindersDrawer';
import { PrintReportKind, PrintReportModal } from './components/PrintReportModal';
import {
  Athlete,
  AttendanceRecord,
  ClubAnnouncement,
  ClubInvoice,
  ClubProfile,
  FinanceTransaction,
  SwimTime,
  TrainingSchedule,
} from './types/club';
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Printer,
  Receipt,
  Users,
  Wallet,
  X,
} from 'lucide-react';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'finance', label: 'Keuangan Kas', icon: Wallet },
  { id: 'athletes', label: 'Atlet & Waktu', icon: Users },
  { id: 'schedules', label: 'Jadwal & Presensi', icon: CalendarDays },
  { id: 'invoices', label: 'Invoice & Adm', icon: Receipt },
];

function SwimmingClubWorkspace() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubs, setClubs] = useState<ClubProfile[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [swimTimes, setSwimTimes] = useState<SwimTime[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [schedules, setSchedules] = useState<TrainingSchedule[]>([]);
  const [invoices, setInvoices] = useState<ClubInvoice[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [announcements, setAnnouncements] = useState<ClubAnnouncement[]>([]);

  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [dismissedReminderIds, setDismissedReminderIds] = useState<string[]>([]);
  const [printReportKind, setPrintReportKind] = useState<PrintReportKind | null>(null);

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) {
        setClubs([]);
        setClubsLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // 2. Clubs Listener (requires authenticated user)
  useEffect(() => {
    if (!authReady || !user) return;
    setClubsLoading(true);
    const q = query(collection(db, 'clubs'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubProfile, 'id'>) }));
        setClubs(list);
        if (list.length > 0 && (!selectedClubId || !list.some((c) => c.id === selectedClubId))) {
          setSelectedClubId(list[0].id);
        }
        setClubsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clubs');
      }
    );
    return () => unsub();
  }, [authReady, user, selectedClubId]);

  const activeClub = clubs.find((c) => c.id === selectedClubId) || clubs[0] || null;

  // 3. Domain Listeners (only attach when user & activeClub are ready)
  useEffect(() => {
    if (!authReady || !user || !activeClub) {
      setAthletes([]);
      setSwimTimes([]);
      setTransactions([]);
      setSchedules([]);
      setInvoices([]);
      setAttendance([]);
      setAnnouncements([]);
      return;
    }

    const uid = user.uid;
    const cid = activeClub.id;

    const unsubAthletes = onSnapshot(
      query(collection(db, 'athletes'), where('ownerId', '==', uid), where('clubId', '==', cid)),
      (snap) => {
        setAthletes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Athlete, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'athletes')
    );

    const unsubSwimTimes = onSnapshot(
      query(collection(db, 'swimTimes'), where('ownerId', '==', uid), where('clubId', '==', cid)),
      (snap) => {
        setSwimTimes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SwimTime, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'swimTimes')
    );

    const unsubTransactions = onSnapshot(
      query(collection(db, 'transactions'), where('ownerId', '==', uid), where('clubId', '==', cid)),
      (snap) => {
        setTransactions(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FinanceTransaction, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    const unsubSchedules = onSnapshot(
      query(collection(db, 'schedules'), where('ownerId', '==', uid), where('clubId', '==', cid)),
      (snap) => {
        setSchedules(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrainingSchedule, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'schedules')
    );

    const unsubInvoices = onSnapshot(
      query(collection(db, 'invoices'), where('ownerId', '==', uid), where('clubId', '==', cid)),
      (snap) => {
        setInvoices(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubInvoice, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'invoices')
    );

    const unsubAttendance = onSnapshot(
      query(collection(db, 'attendance'), where('ownerId', '==', uid), where('clubId', '==', cid)),
      (snap) => {
        setAttendance(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
    );

    const unsubAnnouncements = onSnapshot(
      query(collection(db, 'announcements'), where('ownerId', '==', uid), where('clubId', '==', cid)),
      (snap) => {
        setAnnouncements(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubAnnouncement, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
    );

    return () => {
      unsubAthletes();
      unsubSwimTimes();
      unsubTransactions();
      unsubSchedules();
      unsubInvoices();
      unsubAttendance();
      unsubAnnouncements();
    };
  }, [authReady, user, activeClub]);

  useEffect(() => {
    if (!activeClub) {
      setDismissedReminderIds([]);
      return;
    }
    setDismissedReminderIds(getDismissedReminderIds(activeClub.id));
  }, [activeClub]);

  const allReminders = useMemo(() => {
    if (!activeClub) return [];
    return computeClubReminders({
      club: activeClub,
      invoices,
      schedules,
      attendance,
      announcements,
    });
  }, [activeClub, invoices, schedules, attendance, announcements]);

  const activeReminders = useMemo(
    () => allReminders.filter((r) => !dismissedReminderIds.includes(r.id)),
    [allReminders, dismissedReminderIds]
  );

  const urgentReminderCount = useMemo(
    () => activeReminders.filter((r) => r.severity === 'urgent').length,
    [activeReminders]
  );

  const handleLoadSampleData = async () => {
    if (!user || !activeClub) return;
    setSeedingSample(true);
    try {
      await seedSampleRecordsForClub(activeClub.id, user.uid);
    } finally {
      setSeedingSample(false);
    }
  };

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
    return <ClubOnboarding user={user} onClubCreated={() => {}} />;
  }

  const currentNavLabel = NAV_ITEMS.find((n) => n.id === activeNav)?.label || 'Ringkasan';

  const MOBILE_NAV_LABELS: Record<NavSection, string> = {
    overview: 'Ringkasan',
    finance: 'Kas',
    athletes: 'Atlet',
    schedules: 'Jadwal',
    invoices: 'Invoice',
  };

  const defaultReportForNav: Record<NavSection, PrintReportKind> = {
    overview: 'executive',
    finance: 'finance',
    athletes: 'athletes',
    schedules: 'schedules',
    invoices: 'invoices',
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
          <span className="font-display text-sm font-bold text-slate-900 truncate">
            {activeClub.name}
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
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
          <div className="text-xs">
            <div className="font-semibold text-slate-900 truncate">
              {user.displayName || activeClub.headCoach}
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
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col justify-between p-4 pb-safe z-10 border-r border-slate-200">
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
                    <div className="text-xs text-slate-500 truncate">{activeClub.city}</div>
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
              <nav className="mt-4 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeNav === item.id;
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
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="text-xs px-1">
                <div className="font-semibold text-slate-900 truncate">
                  {user.displayName || activeClub.headCoach}
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
        {/* Top Bar Contract (non-sticky on mobile so fixed bottom tab bar stays well under 15% sticky cap) */}
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
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">{activeClub.city}</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-display font-semibold text-slate-900 truncate">
                {currentNavLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRemindersOpen(true)}
              aria-label="Buka notifikasi pengingat"
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] lg:min-h-[36px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              onClick={() => setPrintReportKind(defaultReportForNav[activeNav])}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] lg:min-h-[36px] text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>Cetak Laporan</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pt-4 pb-24 sm:px-6 sm:pt-6 sm:pb-24 lg:p-8 max-w-[1400px] w-full mx-auto">
          {activeNav === 'overview' && (
            <OverviewView
              club={activeClub}
              athletes={athletes}
              swimTimes={swimTimes}
              transactions={transactions}
              schedules={schedules}
              attendance={attendance}
              invoices={invoices}
              announcements={announcements}
              reminders={activeReminders}
              onOpenReminders={() => setRemindersOpen(true)}
              onOpenPrintReport={(kind) => setPrintReportKind(kind)}
              onNavigate={setActiveNav}
              onLoadSampleData={handleLoadSampleData}
              seedingSample={seedingSample}
            />
          )}

          {activeNav === 'finance' && (
            <FinanceView
              club={activeClub}
              userId={user.uid}
              transactions={transactions}
              athletes={athletes}
              onOpenPrintReport={() => setPrintReportKind('finance')}
            />
          )}

          {activeNav === 'athletes' && (
            <AthletesAndTimesView
              club={activeClub}
              userId={user.uid}
              athletes={athletes}
              swimTimes={swimTimes}
              invoices={invoices}
              onOpenPrintReport={() => setPrintReportKind('athletes')}
            />
          )}

          {activeNav === 'schedules' && (
            <SchedulesAndAttendanceView
              club={activeClub}
              userId={user.uid}
              schedules={schedules}
              athletes={athletes}
              attendance={attendance}
              onOpenPrintReport={() => setPrintReportKind('schedules')}
            />
          )}

          {activeNav === 'invoices' && (
            <InvoicesAndAdminView
              club={activeClub}
              userId={user.uid}
              invoices={invoices}
              athletes={athletes}
              announcements={announcements}
              onOpenPrintReport={() => setPrintReportKind('invoices')}
            />
          )}
        </main>
      </div>

      {/* Fixed Mobile Bottom Tab Bar (Thumb Zone Anchor) */}
      <nav
        aria-label="Navigasi utama mobile"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe no-print"
      >
        <div className="grid grid-cols-5 h-16 max-w-xl mx-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
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
      </nav>
    </div>

    <RemindersDrawer
      open={remindersOpen}
      onClose={() => setRemindersOpen(false)}
      club={activeClub}
      reminders={allReminders}
      dismissedIds={dismissedReminderIds}
      onDismiss={(id) => setDismissedReminderIds(dismissReminderForToday(activeClub.id, id))}
      onResetDismissed={() => setDismissedReminderIds(clearDismissedRemindersForToday(activeClub.id))}
      onNavigate={setActiveNav}
    />

    <PrintReportModal
      open={printReportKind !== null}
      initialReport={printReportKind || 'executive'}
      onClose={() => setPrintReportKind(null)}
      club={activeClub}
      athletes={athletes}
      swimTimes={swimTimes}
      transactions={transactions}
      schedules={schedules}
      attendance={attendance}
      invoices={invoices}
    />
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
