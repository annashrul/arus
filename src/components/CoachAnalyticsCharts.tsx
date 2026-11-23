import { useUrlState } from '../lib/urlState';
import React, { useMemo, useState } from 'react';
import {
  AGE_GROUPS,
  Athlete,
  AttendanceRecord,
  Coach,
  POOL_COURSES,
  SWIM_STROKES,
  SwimStroke,
  SwimTime,
  TrainingSchedule,
} from '../types/club';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck2,
  CheckCircle2,
  Filter,
  Users,
} from 'lucide-react';
import { BottomSheetSelect } from './BottomSheetSelect';

interface CoachAnalyticsChartsProps {
  coaches: Coach[];
  athletes: Athlete[];
  schedules: TrainingSchedule[];
  attendance: AttendanceRecord[];
  swimTimes: SwimTime[];
}

const STROKE_COLORS: Record<SwimStroke, string> = {
  'Gaya Bebas': '#0369a1',
  'Gaya Punggung': '#059669',
  'Gaya Dada': '#d97706',
  'Gaya Kupu-Kupu': '#7c3aed',
  'Gaya Ganti': '#be123c',
};

const TARGET_ATTENDANCE_PCT = 80;

function getIsoWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diffToMonday);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatShortWeekLabel(mondayISO: string): string {
  const [, m, d] = mondayISO.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${String(d).padStart(2, '0')} ${months[(m - 1) % 12]}`;
}

function formatMonthYearShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[(m - 1) % 12]} ${String(y).slice(-2)}`;
}

function formatMonthYearFull(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  return `${months[(m - 1) % 12]} ${y}`;
}

export const CoachAnalyticsCharts: React.FC<CoachAnalyticsChartsProps> = ({
  coaches,
  athletes,
  schedules,
  attendance,
  swimTimes,
}) => {
  const [coachFilter, setCoachFilter] = useUrlState<string>('coachanalytics.coach', 'ALL');
  const [sectionView, setSectionView] = useUrlState<'all' | 'attendance' | 'strokes'>('coachanalytics.section', 'all', { values: ['all', 'attendance', 'strokes'] });
  const [weekMode, setWeekMode] = useUrlState<'4weeks' | 'latest'>('coachanalytics.weeks', '4weeks', { values: ['4weeks', 'latest'] });

  // Stroke trend filters
  const [strokeFocus, setStrokeFocus] = useUrlState<string>('coachanalytics.stroke', 'ALL');
  const [courseFilter, setCourseFilter] = useUrlState<string>('coachanalytics.course', 'ALL');
  const [ageGroupFilter, setAgeGroupFilter] = useUrlState<string>('coachanalytics.age', 'ALL');
  const [activePeriodIdx, setActivePeriodIdx] = useState<number | null>(null);

  const coachNames = useMemo(() => {
    const set = new Set<string>();
    coaches.forEach((c) => c.fullName && set.add(c.fullName));
    athletes.forEach((a) => a.coachName && set.add(a.coachName));
    schedules.forEach((s) => s.coachName && set.add(s.coachName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [coaches, athletes, schedules]);

  const athleteMap = useMemo(() => {
    const map = new Map<string, Athlete>();
    for (const a of athletes) map.set(a.id, a);
    return map;
  }, [athletes]);

  const scheduleMap = useMemo(() => {
    const map = new Map<string, TrainingSchedule>();
    for (const s of schedules) map.set(s.id, s);
    return map;
  }, [schedules]);

  // =========================================================================
  // 1. WEEKLY ATTENDANCE % PER SWIM CLASS GROUP
  // =========================================================================
  const weeklyAttendance = useMemo(() => {
    const filteredRecords = attendance.filter((rec) => {
      if (coachFilter === 'ALL') return true;
      const ath = athleteMap.get(rec.athleteId);
      const sch = scheduleMap.get(rec.scheduleId);
      const target = coachFilter.toLowerCase();
      return (
        (ath?.coachName && ath.coachName.toLowerCase() === target) ||
        (sch?.coachName && sch.coachName.toLowerCase() === target)
      );
    });

    const weekSet = new Set<string>();
    for (const rec of filteredRecords) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(rec.sessionDate)) {
        weekSet.add(getIsoWeekStart(rec.sessionDate));
      }
    }
    const sortedWeeks = Array.from(weekSet).sort((a, b) => a.localeCompare(b));
    const displayWeeks = sortedWeeks.slice(-4);

    const groups = AGE_GROUPS.map((group) => {
      const weekStats = displayWeeks.map((weekMonday) => {
        let hadir = 0;
        let total = 0;
        for (const rec of filteredRecords) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.sessionDate)) continue;
          if (getIsoWeekStart(rec.sessionDate) !== weekMonday) continue;
          const athGroup = athleteMap.get(rec.athleteId)?.ageGroup;
          const schGroup = scheduleMap.get(rec.scheduleId)?.ageGroup;
          const resolvedGroup =
            athGroup || (schGroup && schGroup !== 'Semua Kelompok' ? schGroup : null);
          if (resolvedGroup !== group) continue;
          total += 1;
          if (rec.status === 'Hadir') hadir += 1;
        }
        return {
          weekMonday,
          label: formatShortWeekLabel(weekMonday),
          hadir,
          total,
          rate: total > 0 ? Math.round((hadir / total) * 100) : null,
        };
      });

      const totalHadir = weekStats.reduce((s, w) => s + w.hadir, 0);
      const totalAll = weekStats.reduce((s, w) => s + w.total, 0);
      const avgRate = totalAll > 0 ? Math.round((totalHadir / totalAll) * 100) : null;

      const recordedWeeks = weekStats.filter((w) => w.rate !== null);
      const latestWeek = recordedWeeks[recordedWeeks.length - 1] || null;
      const prevWeek = recordedWeeks.length >= 2 ? recordedWeeks[recordedWeeks.length - 2] : null;
      const deltaPct =
        latestWeek && prevWeek && latestWeek.rate !== null && prevWeek.rate !== null
          ? latestWeek.rate - prevWeek.rate
          : null;

      const activeAthleteCount = athletes.filter(
        (a) =>
          a.status === 'Aktif' &&
          a.ageGroup === group &&
          (coachFilter === 'ALL' || a.coachName?.toLowerCase() === coachFilter.toLowerCase())
      ).length;

      return {
        group,
        activeAthleteCount,
        weekStats,
        totalHadir,
        totalAll,
        avgRate,
        latestRate: latestWeek?.rate ?? null,
        latestLabel: latestWeek?.label ?? null,
        deltaPct,
      };
    });

    const populatedGroups = groups.filter((g) => g.totalAll > 0);
    const overallHadir = populatedGroups.reduce((s, g) => s + g.totalHadir, 0);
    const overallTotal = populatedGroups.reduce((s, g) => s + g.totalAll, 0);
    const overallRate = overallTotal > 0 ? Math.round((overallHadir / overallTotal) * 100) : 0;

    const sortedByRate = [...populatedGroups].sort((a, b) => (b.avgRate ?? 0) - (a.avgRate ?? 0));
    const bestGroup = sortedByRate[0] || null;
    const lowestGroup =
      sortedByRate.length > 0 && (sortedByRate[sortedByRate.length - 1].avgRate ?? 100) < TARGET_ATTENDANCE_PCT
        ? sortedByRate[sortedByRate.length - 1]
        : null;

    return {
      displayWeeks,
      groups: populatedGroups.length > 0 ? groups : [],
      populatedCount: populatedGroups.length,
      overallRate,
      overallHadir,
      overallTotal,
      bestGroup,
      lowestGroup,
    };
  }, [attendance, athletes, athleteMap, scheduleMap, coachFilter]);

  // =========================================================================
  // 2. PERFORMANCE TREND PER SWIMMING STROKE TECHNIQUE
  // =========================================================================
  const strokeAnalytics = useMemo(() => {
    const filtered = swimTimes.filter((st) => {
      const ath = athleteMap.get(st.athleteId);
      if (coachFilter !== 'ALL') {
        if (!ath?.coachName || ath.coachName.toLowerCase() !== coachFilter.toLowerCase()) {
          return false;
        }
      }
      if (courseFilter !== 'ALL' && st.poolCourse !== courseFilter) return false;
      if (ageGroupFilter !== 'ALL' && ath?.ageGroup !== ageGroupFilter) return false;
      return st.timeMs > 0 && st.distanceMeters > 0;
    });

    const byStroke = SWIM_STROKES.map((stroke) => {
      const items = filtered
        .filter((s) => s.stroke === stroke)
        .sort((a, b) => a.meetDate.localeCompare(b.meetDate));

      const byPeriod = new Map<
        string,
        {
          period: string;
          speeds: number[];
          pbCount: number;
          fastestItem: SwimTime | null;
          fastestSpeed: number;
        }
      >();

      for (const item of items) {
        const period = item.meetDate.slice(0, 7);
        const speed = item.distanceMeters / (item.timeMs / 1000);
        const cur = byPeriod.get(period) || {
          period,
          speeds: [],
          pbCount: 0,
          fastestItem: null,
          fastestSpeed: 0,
        };
        cur.speeds.push(speed);
        if (item.isPersonalBest) cur.pbCount += 1;
        if (!cur.fastestItem || speed > cur.fastestSpeed) {
          cur.fastestItem = item;
          cur.fastestSpeed = speed;
        }
        byPeriod.set(period, cur);
      }

      const points = Array.from(byPeriod.values())
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((p) => ({
          period: p.period,
          avgSpeed: p.speeds.reduce((s, v) => s + v, 0) / p.speeds.length,
          count: p.speeds.length,
          pbCount: p.pbCount,
          fastestItem: p.fastestItem,
          fastestSpeed: p.fastestSpeed,
        }));

      const allSpeeds = items.map((i) => i.distanceMeters / (i.timeMs / 1000));
      const avgSpeed =
        allSpeeds.length > 0 ? allSpeeds.reduce((s, v) => s + v, 0) / allSpeeds.length : 0;
      const pbTotal = items.filter((i) => i.isPersonalBest).length;
      const uniqueAthletes = new Set(items.map((i) => i.athleteId)).size;

      let bestRecord: SwimTime | null = null;
      let bestSpeed = 0;
      for (const item of items) {
        const sp = item.distanceMeters / (item.timeMs / 1000);
        if (!bestRecord || sp > bestSpeed) {
          bestRecord = item;
          bestSpeed = sp;
        }
      }

      const firstSpeed = points[0]?.avgSpeed ?? 0;
      const lastSpeed = points[points.length - 1]?.avgSpeed ?? 0;
      const improvementPct =
        points.length >= 2 && firstSpeed > 0
          ? ((lastSpeed - firstSpeed) / firstSpeed) * 100
          : null;

      return {
        stroke,
        shortLabel: stroke.replace('Gaya ', ''),
        color: STROKE_COLORS[stroke],
        items,
        points,
        avgSpeed,
        pbTotal,
        uniqueAthletes,
        bestRecord,
        improvementPct,
      };
    });

    const periodSet = new Set<string>();
    byStroke.forEach((s) => s.points.forEach((p) => periodSet.add(p.period)));
    const allPeriods = Array.from(periodSet).sort((a, b) => a.localeCompare(b)).slice(-8);

    const activeStrokes =
      strokeFocus === 'ALL'
        ? byStroke.filter((s) => s.items.length > 0)
        : byStroke.filter((s) => s.stroke === strokeFocus);

    const allPointSpeeds = activeStrokes.flatMap((s) => s.points.map((p) => p.avgSpeed));
    const minSpeed = allPointSpeeds.length > 0 ? Math.min(...allPointSpeeds) : 0.9;
    const maxSpeed = allPointSpeeds.length > 0 ? Math.max(...allPointSpeeds) : 1.9;

    const totalPbs = byStroke.reduce((s, x) => s + x.pbTotal, 0);
    const mostImprovedStroke =
      [...byStroke]
        .filter((s) => s.improvementPct !== null)
        .sort((a, b) => (b.improvementPct ?? -999) - (a.improvementPct ?? -999))[0] || null;

    return {
      filteredCount: filtered.length,
      byStroke,
      activeStrokes,
      allPeriods,
      minSpeed,
      maxSpeed,
      totalPbs,
      mostImprovedStroke,
    };
  }, [swimTimes, athleteMap, coachFilter, courseFilter, ageGroupFilter, strokeFocus]);

  // SVG chart dimensions for Stroke Trend
  const W = 680;
  const H = 240;
  const pL = 56;
  const pR = 24;
  const pT = 24;
  const pB = 34;
  const cw = W - pL - pR;
  const ch = H - pT - pB;

  const speedSpan = Math.max(0.25, strokeAnalytics.maxSpeed - strokeAnalytics.minSpeed);
  const ySpeedMin = Math.max(0.2, strokeAnalytics.minSpeed - speedSpan * 0.2);
  const ySpeedMax = strokeAnalytics.maxSpeed + speedSpan * 0.2;

  const yForSpeed = (sp: number) => {
    const ratio = (sp - ySpeedMin) / Math.max(0.01, ySpeedMax - ySpeedMin);
    return pT + ch - ratio * ch;
  };

  const xForPeriod = (period: string) => {
    const periods = strokeAnalytics.allPeriods;
    const idx = periods.indexOf(period);
    if (periods.length <= 1) return pL + cw / 2;
    return pL + (idx / (periods.length - 1)) * cw;
  };

  const resolvedPeriodIdx =
    activePeriodIdx !== null && strokeAnalytics.allPeriods[activePeriodIdx]
      ? activePeriodIdx
      : Math.max(0, strokeAnalytics.allPeriods.length - 1);
  const selectedPeriod = strokeAnalytics.allPeriods[resolvedPeriodIdx];

  return (
    <div className="space-y-5">
      {/* Unified Header + Coach Filter + View Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div>
            <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
              Analitik Kehadiran & Performa Pelatih
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ringkasan kedisiplinan tiap kelas renang dan perkembangan catatan gaya renang atlet.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="w-full sm:w-56">
              <BottomSheetSelect
                value={coachFilter}
                onChange={(val) => {
                  setCoachFilter(val);
                  setActivePeriodIdx(null);
                }}
                title="Filter Berdasarkan Pelatih"
                subtitle="Tampilkan data kehadiran dan performa atlet binaan pelatih tertentu."
                triggerPrefix="Pelatih:"
                icon={<Users className="w-3.5 h-3.5" />}
                resetValue="ALL"
                resetLabel="Semua Pelatih"
                searchable={coachNames.length > 5}
                options={[
                  { value: 'ALL', label: 'Semua Pelatih' },
                  ...coachNames.map((name) => ({ value: name, label: name })),
                ]}
              />
            </div>

            <div className="grid grid-cols-3 sm:inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/80">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'attendance', label: 'Kehadiran' },
                  { id: 'strokes', label: 'Performa Gaya' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSectionView(tab.id)}
                  className={`px-3 min-h-[36px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    sectionView === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4-Column Executive Coach Summary Strip (Clean hairline grid, no nested cards) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-200 pt-4 gap-4">
          <div className="space-y-1">
            <span className="text-[11px] text-slate-500 block">Rata-Rata Kehadiran</span>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-slate-900">
              {weeklyAttendance.overallTotal > 0 ? `${weeklyAttendance.overallRate}%` : '-'}
            </div>
            <div className="text-[11px]">
              {weeklyAttendance.overallTotal === 0 ? (
                <span className="text-slate-400">Belum ada presensi</span>
              ) : weeklyAttendance.overallRate >= TARGET_ATTENDANCE_PCT ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  Sesuai target ≥ 80% ({weeklyAttendance.overallHadir}/{weeklyAttendance.overallTotal})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Di bawah target 80% ({weeklyAttendance.overallHadir}/{weeklyAttendance.overallTotal})
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1 lg:border-l lg:border-slate-200 lg:pl-4">
            <span className="text-[11px] text-slate-500 block">Kelas Paling Disiplin</span>
            <div className="text-sm sm:text-base font-semibold text-slate-900 truncate pt-0.5">
              {weeklyAttendance.bestGroup ? weeklyAttendance.bestGroup.group : '-'}
            </div>
            <div className="text-[11px] font-mono-tabular text-emerald-700 font-medium">
              {weeklyAttendance.bestGroup && weeklyAttendance.bestGroup.avgRate !== null
                ? `${weeklyAttendance.bestGroup.avgRate}% hadir (${weeklyAttendance.bestGroup.totalHadir}/${weeklyAttendance.bestGroup.totalAll} sesi)`
                : 'Menunggu catatan presensi'}
            </div>
          </div>

          <div className="space-y-1 lg:border-l lg:border-slate-200 lg:pl-4">
            <span className="text-[11px] text-slate-500 block">Perlu Pendampingan</span>
            <div className="text-sm sm:text-base font-semibold text-slate-900 truncate pt-0.5">
              {weeklyAttendance.overallTotal === 0
                ? '-'
                : weeklyAttendance.lowestGroup
                ? weeklyAttendance.lowestGroup.group
                : 'Semua Kelas Aman'}
            </div>
            <div className="text-[11px] font-mono-tabular">
              {weeklyAttendance.overallTotal === 0 ? (
                <span className="text-slate-400">Belum ada data</span>
              ) : weeklyAttendance.lowestGroup ? (
                <span className="text-amber-700 font-medium">
                  {weeklyAttendance.lowestGroup.avgRate}% hadir (target ≥ 80%)
                </span>
              ) : (
                <span className="text-emerald-700 font-medium">Seluruh grup ≥ 80%</span>
              )}
            </div>
          </div>

          <div className="space-y-1 lg:border-l lg:border-slate-200 lg:pl-4">
            <span className="text-[11px] text-slate-500 block">Progres Gaya & Personal Best</span>
            <div className="text-sm sm:text-base font-semibold text-slate-900 truncate pt-0.5">
              {strokeAnalytics.mostImprovedStroke
                ? strokeAnalytics.mostImprovedStroke.stroke
                : `${strokeAnalytics.filteredCount} Catatan Waktu`}
            </div>
            <div className="text-[11px] font-mono-tabular text-sky-700 font-medium">
              {strokeAnalytics.mostImprovedStroke &&
              strokeAnalytics.mostImprovedStroke.improvementPct !== null
                ? `${strokeAnalytics.mostImprovedStroke.improvementPct >= 0 ? '+' : ''}${strokeAnalytics.mostImprovedStroke.improvementPct.toFixed(1)}% laju · ${strokeAnalytics.totalPbs} PB tercatat`
                : `${strokeAnalytics.totalPbs} Personal Best tercatat`}
            </div>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SECTION 1: WEEKLY ATTENDANCE % PER SWIM CLASS GROUP                */}
      {/* =================================================================== */}
      {(sectionView === 'all' || sectionView === 'attendance') && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <CalendarCheck2 className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                  Kehadiran Mingguan Tiap Grup Kelas Renang
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Garis putus-putus menandai target minimal klub (<strong>80%</strong>). Hijau = memenuhi target, kuning = perlu perhatian pelatih.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setWeekMode('4weeks')}
                className={`px-3 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  weekMode === '4weeks' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Rata-Rata 4 Pekan
              </button>
              <button
                type="button"
                onClick={() => setWeekMode('latest')}
                className={`px-3 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  weekMode === 'latest' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Pekan Terakhir
              </button>
            </div>
          </div>

          {weeklyAttendance.groups.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
              Belum ada catatan presensi sesi latihan untuk menampilkan persentase kehadiran per grup kelas.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border-t border-slate-200">
              {weeklyAttendance.groups.map((g) => {
                const displayPct = weekMode === 'latest' ? g.latestRate : g.avgRate;
                const hasData = displayPct !== null;
                const meetsTarget = hasData && displayPct >= TARGET_ATTENDANCE_PCT;

                return (
                  <div
                    key={g.group}
                    className="py-3.5 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-center"
                  >
                    {/* Col 1: Group Name & Clear Status */}
                    <div className="lg:col-span-3 min-w-0">
                      <div className="flex items-center justify-between lg:block">
                        <div className="font-semibold text-sm text-slate-900 truncate">
                          {g.group}
                        </div>
                        <div className="text-xs font-mono-tabular text-slate-500 lg:mt-0.5">
                          {g.totalAll > 0 ? (
                            <>
                              {g.totalHadir}/{g.totalAll} hadir
                              {g.activeAthleteCount > 0 ? ` · ${g.activeAthleteCount} atlet aktif` : ''}
                            </>
                          ) : (
                            'Belum ada presensi'
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Col 2: Horizontal Bar with Explicit 80% Target Line */}
                    <div className="lg:col-span-5 flex items-center gap-3">
                      <div className="relative flex-1 h-4 bg-slate-100 rounded-md overflow-hidden">
                        {/* 80% Target Marker */}
                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-dashed border-slate-500/70 z-10"
                          style={{ left: `${TARGET_ATTENDANCE_PCT}%` }}
                          title="Target minimal 80%"
                        />
                        {hasData && (
                          <div
                            className={`h-full rounded-md transition-all duration-300 ${
                              meetsTarget ? 'bg-emerald-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.max(4, Math.min(100, displayPct))}%` }}
                          />
                        )}
                      </div>

                      <div className="w-24 text-right shrink-0">
                        {hasData ? (
                          <div>
                            <span
                              className={`font-mono-tabular text-sm font-bold ${
                                meetsTarget ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {displayPct}%
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              {meetsTarget ? 'Memenuhi target' : 'Di bawah 80%'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Kosong</span>
                        )}
                      </div>
                    </div>

                    {/* Col 3: Week-by-Week Mini Cells (Last 4 Weeks) */}
                    <div className="lg:col-span-4 flex items-center justify-between lg:justify-end gap-2">
                      <div className="grid grid-cols-4 gap-1.5 flex-1 lg:flex-none">
                        {g.weekStats.map((w) => (
                          <div
                            key={`${g.group}-${w.weekMonday}`}
                            className="px-2 py-1 rounded bg-slate-50 text-center"
                          >
                            <div className="text-[10px] text-slate-400 font-mono-tabular">
                              {w.label}
                            </div>
                            <div
                              className={`text-xs font-mono-tabular font-semibold ${
                                w.rate === null
                                  ? 'text-slate-300'
                                  : w.rate >= TARGET_ATTENDANCE_PCT
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {w.rate !== null ? `${w.rate}%` : '-'}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="w-14 text-right shrink-0 font-mono-tabular text-xs font-semibold">
                        {g.deltaPct === null ? (
                          <span className="text-slate-300">-</span>
                        ) : g.deltaPct >= 0 ? (
                          <span className="inline-flex items-center justify-end gap-0.5 text-emerald-700">
                            <ArrowUpRight className="w-3.5 h-3.5" />+{g.deltaPct}%
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-end gap-0.5 text-amber-700">
                            <ArrowDownRight className="w-3.5 h-3.5" />
                            {g.deltaPct}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* SECTION 2: PERFORMANCE TREND PER SWIMMING STROKE TECHNIQUE          */}
      {/* =================================================================== */}
      {(sectionView === 'all' || sectionView === 'strokes') && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Activity className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-sm sm:text-base font-semibold text-slate-900">
                  Tren Performa per Teknik Gaya Renang
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Garis grafik naik berarti perenang semakin cepat. Klik salah satu teknik gaya untuk memfokuskan grafiknya.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full lg:w-auto">
              <BottomSheetSelect
                value={ageGroupFilter}
                onChange={(val) => {
                  setAgeGroupFilter(val);
                  setActivePeriodIdx(null);
                }}
                title="Filter Kelompok Umur"
                triggerPrefix="Kelompok:"
                icon={<Filter className="w-3.5 h-3.5" />}
                resetValue="ALL"
                resetLabel="Semua"
                options={[
                  { value: 'ALL', label: 'Semua Kelompok' },
                  ...AGE_GROUPS.map((g) => ({ value: g, label: g })),
                ]}
              />
              <BottomSheetSelect
                value={courseFilter}
                onChange={(val) => {
                  setCourseFilter(val);
                  setActivePeriodIdx(null);
                }}
                title="Filter Lintasan Kolam"
                triggerPrefix="Kolam:"
                icon={<Filter className="w-3.5 h-3.5" />}
                resetValue="ALL"
                resetLabel="Semua"
                options={[
                  { value: 'ALL', label: '50m & 25m' },
                  ...POOL_COURSES.map((c) => ({ value: c, label: c })),
                ]}
              />
            </div>
          </div>

          {/* Interactive 5-Stroke Selector Cards (Glanceable Speed, Best Time, PB, Trend) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <button
              type="button"
              onClick={() => setStrokeFocus('ALL')}
              className={`p-3 rounded-lg border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                strokeFocus === 'ALL'
                  ? 'border-sky-600 bg-sky-50/60'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="text-xs font-semibold text-slate-900">Semua Gaya</div>
              <div className="mt-2">
                <div className="font-mono-tabular text-base font-bold text-slate-900">
                  {strokeAnalytics.filteredCount}
                </div>
                <div className="text-[11px] text-slate-500">
                  {strokeAnalytics.totalPbs} Personal Best
                </div>
              </div>
            </button>

            {strokeAnalytics.byStroke.map((s) => {
              const selected = strokeFocus === s.stroke;
              return (
                <button
                  key={s.stroke}
                  type="button"
                  onClick={() =>
                    setStrokeFocus((prev) => (prev === s.stroke ? 'ALL' : s.stroke))
                  }
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                    selected
                      ? 'border-sky-600 bg-sky-50/60'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.shortLabel}
                    </span>
                    {s.improvementPct !== null && (
                      <span
                        className={`font-mono-tabular text-[11px] font-semibold shrink-0 ${
                          s.improvementPct >= 0 ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {s.improvementPct >= 0 ? '+' : ''}
                        {s.improvementPct.toFixed(1)}%
                      </span>
                    )}
                  </div>

                  <div className="mt-2 space-y-0.5">
                    <div className="font-mono-tabular text-sm font-bold text-slate-900">
                      {s.bestRecord ? s.bestRecord.formattedTime : '-'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {s.bestRecord
                        ? `${s.bestRecord.distanceMeters}m · ${s.bestRecord.athleteName}`
                        : 'Belum ada catatan'}
                    </div>
                    <div className="text-[10px] font-mono-tabular text-slate-400">
                      {s.items.length > 0
                        ? `${s.avgSpeed.toFixed(2)} m/dtk · ${s.pbTotal} PB`
                        : '0 data'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {strokeAnalytics.filteredCount === 0 || strokeAnalytics.allPeriods.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
              Belum ada catatan waktu lomba pada filter yang dipilih untuk menampilkan grafik tren gaya renang.
            </div>
          ) : (
            <>
              {/* Active Month Inspection Panel */}
              {selectedPeriod && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800">
                      Detail Bulan: {formatMonthYearFull(selectedPeriod)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Ketuk titik bulan pada grafik di bawah untuk berpindah bulan
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {strokeAnalytics.activeStrokes.map((s) => {
                      const pt = s.points.find((p) => p.period === selectedPeriod);
                      if (!pt) return null;
                      return (
                        <div
                          key={s.stroke}
                          className="bg-white border border-slate-200/80 rounded-md px-3 py-2 text-xs flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                              <span
                                className="w-2 h-2 rounded-xs shrink-0"
                                style={{ backgroundColor: s.color }}
                              />
                              <span className="truncate">{s.stroke}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              Tercepat:{' '}
                              {pt.fastestItem
                                ? `${pt.fastestItem.athleteName} (${pt.fastestItem.distanceMeters}m · ${pt.fastestItem.formattedTime})`
                                : '-'}
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono-tabular">
                            <div className="font-bold text-slate-900">
                              {pt.avgSpeed.toFixed(2)} m/d
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {pt.count}x · {pt.pbCount} PB
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Line Chart */}
              <div className="w-full">
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full h-auto select-none"
                  role="img"
                  aria-label="Grafik tren kecepatan rata-rata per teknik gaya renang"
                >
                  {[0, 0.5, 1].map((r) => {
                    const sp = ySpeedMin + (ySpeedMax - ySpeedMin) * r;
                    const y = yForSpeed(sp);
                    return (
                      <g key={r}>
                        <line
                          x1={pL}
                          y1={y}
                          x2={W - pR}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeDasharray={r === 0 ? undefined : '3 3'}
                        />
                        <text
                          x={pL - 8}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-slate-400 text-[10px] font-mono-tabular"
                        >
                          {sp.toFixed(2)} m/d
                        </text>
                      </g>
                    );
                  })}

                  <text
                    x={pL + 4}
                    y={14}
                    className="fill-slate-400 text-[10px]"
                  >
                    Lebih cepat ↑
                  </text>

                  {/* Month columns */}
                  {strokeAnalytics.allPeriods.map((period, idx) => {
                    const cx = xForPeriod(period);
                    const isActive = idx === resolvedPeriodIdx;
                    return (
                      <g
                        key={period}
                        className="cursor-pointer"
                        onMouseEnter={() => setActivePeriodIdx(idx)}
                        onClick={() => setActivePeriodIdx(idx)}
                      >
                        <line
                          x1={cx}
                          y1={pT}
                          x2={cx}
                          y2={pT + ch}
                          stroke={isActive ? '#0284c7' : 'transparent'}
                          strokeDasharray={isActive ? '3 3' : undefined}
                          strokeWidth={isActive ? 1.5 : 14}
                        />
                        <text
                          x={cx}
                          y={H - 10}
                          textAnchor="middle"
                          className={`text-[10.5px] font-mono-tabular ${
                            isActive ? 'fill-slate-900 font-semibold' : 'fill-slate-500'
                          }`}
                        >
                          {formatMonthYearShort(period)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Lines & Points */}
                  {strokeAnalytics.activeStrokes.map((s) => {
                    if (s.points.length === 0) return null;
                    const ptsStr = s.points
                      .map((p) => `${xForPeriod(p.period)},${yForSpeed(p.avgSpeed)}`)
                      .join(' ');
                    return (
                      <g key={s.stroke}>
                        {s.points.length > 1 && (
                          <polyline
                            fill="none"
                            stroke={s.color}
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={ptsStr}
                          />
                        )}
                        {s.points.map((p) => {
                          const cx = xForPeriod(p.period);
                          const cy = yForSpeed(p.avgSpeed);
                          const pIdx = strokeAnalytics.allPeriods.indexOf(p.period);
                          const isActive = pIdx === resolvedPeriodIdx;
                          return (
                            <circle
                              key={`${s.stroke}-${p.period}`}
                              cx={cx}
                              cy={cy}
                              r={isActive ? 5.5 : 4}
                              fill="#ffffff"
                              stroke={s.color}
                              strokeWidth={2.5}
                              className="cursor-pointer"
                              onMouseEnter={() => setActivePeriodIdx(pIdx)}
                              onClick={() => setActivePeriodIdx(pIdx)}
                            />
                          );
                        })}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
