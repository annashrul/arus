import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { seedSampleRecordsForClub } from './lib/seedSampleClub';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClubOnboarding } from './components/ClubOnboarding';
import { NavSection, OverviewView } from './components/OverviewView';
import { FinanceView } from './components/FinanceView';
import { AthletesAndTimesView } from './components/AthletesAndTimesView';
import { SchedulesAndAttendanceView } from './components/SchedulesAndAttendanceView';
import { InvoicesAndAdminView } from './components/InvoicesAndAdminView';
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
  CalendarDays,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
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

  return (
    <div className="min-h-screen bg-slate-50 flex">
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
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col justify-between p-4 z-10 border-r border-slate-200">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <span className="font-display text-sm font-bold text-slate-900 truncate">
                  {activeClub.name}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-slate-500 rounded-lg"
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
                      className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg ${
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
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
              Keluar Akun
            </button>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="h-14 lg:h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-3 sm:gap-8 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 hidden sm:inline">{activeClub.city}</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-display font-semibold text-slate-900 truncate">
                {currentNavLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveNav(activeNav === 'invoices' ? 'finance' : 'invoices')}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeNav === 'invoices' ? 'Keuangan Kas' : 'Invoice SPP'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {/* Mobile & Tablet Horizontal Quick Navigation */}
          <div className="lg:hidden mb-5 -mx-4 px-4 overflow-x-auto no-print">
            <div className="flex items-center gap-1.5 pb-1 w-max">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] ${
                      active
                        ? 'bg-sky-700 text-white border-sky-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeNav === 'overview' && (
            <OverviewView
              club={activeClub}
              athletes={athletes}
              swimTimes={swimTimes}
              transactions={transactions}
              schedules={schedules}
              invoices={invoices}
              announcements={announcements}
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
            />
          )}

          {activeNav === 'athletes' && (
            <AthletesAndTimesView
              club={activeClub}
              userId={user.uid}
              athletes={athletes}
              swimTimes={swimTimes}
              invoices={invoices}
            />
          )}

          {activeNav === 'schedules' && (
            <SchedulesAndAttendanceView
              club={activeClub}
              userId={user.uid}
              schedules={schedules}
              athletes={athletes}
              attendance={attendance}
            />
          )}

          {activeNav === 'invoices' && (
            <InvoicesAndAdminView
              club={activeClub}
              userId={user.uid}
              invoices={invoices}
              athletes={athletes}
              announcements={announcements}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SwimmingClubWorkspace />
    </ErrorBoundary>
  );
}
