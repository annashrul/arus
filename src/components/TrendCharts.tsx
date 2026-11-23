import React, { useMemo, useState } from 'react';
import {
  Athlete,
  AttendanceRecord,
  DAYS_OF_WEEK,
  FinanceTransaction,
  formatDateID,
  formatRupiah,
  formatSwimTimeMs,
  SwimTime,
  TrainingSchedule,
} from '../types/club';
import { TrendingDown, TrendingUp } from 'lucide-react';

interface CashflowTrendChartProps {
  transactions: FinanceTransaction[];
  title?: string;
  subtitle?: string;
}

export const CashflowTrendChart: React.FC<CashflowTrendChartProps> = ({
  transactions,
  title = 'Grafik Tren Arus Kas & Saldo Bersih (6 Bulan)',
  subtitle = 'Ketuk atau arahkan kursor pada bulan untuk melihat rincian pemasukan, pengeluaran, dan tren saldo',
}) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const series = useMemo(() => {
    const map = new Map<
      string,
      { label: string; fullLabel: string; income: number; expense: number }
    >();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const label = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(dt);
      const fullLabel = new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
      }).format(dt);
      map.set(key, { label, fullLabel, income: 0, expense: 0 });
    }

    for (const tx of transactions) {
      const key = tx.transactionDate.slice(0, 7);
      const entry = map.get(key);
      if (entry) {
        if (tx.type === 'pemasukan') entry.income += tx.amount;
        else entry.expense += tx.amount;
      }
    }

    let runningNet = 0;
    return Array.from(map.entries()).map(([key, val]) => {
      const net = val.income - val.expense;
      runningNet += net;
      return {
        key,
        ...val,
        net,
        cumulativeNet: runningNet,
      };
    });
  }, [transactions]);

  const maxVal = useMemo(() => {
    let m = 1000000;
    for (const s of series) {
      if (s.income > m) m = s.income;
      if (s.expense > m) m = s.expense;
      if (Math.abs(s.cumulativeNet) > m) m = Math.abs(s.cumulativeNet);
    }
    return m;
  }, [series]);

  const selected = activeIdx !== null ? series[activeIdx] : series[series.length - 1];

  // SVG coordinates
  const W = 640;
  const H = 220;
  const padL = 56;
  const padR = 24;
  const padT = 20;
  const padB = 34;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const stepX = chartW / series.length;

  const yForValue = (v: number) => {
    const clamped = Math.max(0, v);
    return padT + chartH - (clamped / maxVal) * chartH;
  };

  const trendPoints = series
    .map((s, idx) => {
      const cx = padL + idx * stepX + stepX / 2;
      const cy = yForValue(Math.max(0, s.cumulativeNet));
      return `${cx},${cy}`;
    })
    .join(' ');

  const formatCompactRp = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}jt`;
    if (v >= 1000) return `${Math.round(v / 1000)}rb`;
    return String(v);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-700 inline-block" />
            Pemasukan
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" />
            Pengeluaran
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-600 inline-block" />
            Tren Saldo Kumulatif
          </span>
        </div>
      </div>

      {/* Interactive Selected Month Summary Strip */}
      {selected && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
          <div>
            <span className="text-slate-500 block">Periode Terpilih</span>
            <span className="font-semibold text-slate-900">{selected.fullLabel}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Pemasukan</span>
            <span className="font-mono-tabular font-semibold text-emerald-700">
              +{formatRupiah(selected.income)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Pengeluaran</span>
            <span className="font-mono-tabular font-semibold text-red-700">
              -{formatRupiah(selected.expense)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Saldo Kumulatif</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {formatRupiah(selected.cumulativeNet)}
            </span>
          </div>
        </div>
      )}

      {/* Responsive SVG Chart */}
      <div className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label="Grafik tren arus kas 6 bulan terakhir"
        >
          {/* Horizontal gridlines */}
          {[0, 0.5, 1].map((ratio) => {
            const val = maxVal * ratio;
            const y = padT + chartH - ratio * chartH;
            return (
              <g key={ratio}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={ratio === 0 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono-tabular"
                >
                  {formatCompactRp(val)}
                </text>
              </g>
            );
          })}

          {/* Grouped Bars */}
          {series.map((s, idx) => {
            const groupX = padL + idx * stepX;
            const centerX = groupX + stepX / 2;
            const barW = Math.min(20, stepX * 0.28);
            const incY = yForValue(s.income);
            const incH = Math.max(2, padT + chartH - incY);
            const expY = yForValue(s.expense);
            const expH = Math.max(2, padT + chartH - expY);
            const isSelected = activeIdx === idx;

            return (
              <g
                key={s.key}
                className="cursor-pointer"
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => setActiveIdx(idx)}
              >
                <rect
                  x={groupX + 2}
                  y={padT}
                  width={stepX - 4}
                  height={chartH}
                  rx={6}
                  fill={isSelected ? 'rgba(2, 132, 199, 0.06)' : 'transparent'}
                />
                <rect
                  x={centerX - barW - 2}
                  y={incY}
                  width={barW}
                  height={incH}
                  rx={3}
                  fill="#0369a1"
                />
                <rect
                  x={centerX + 2}
                  y={expY}
                  width={barW}
                  height={expH}
                  rx={3}
                  fill="#cbd5e1"
                />
                <text
                  x={centerX}
                  y={H - 10}
                  textAnchor="middle"
                  className={`text-[11px] ${
                    isSelected ? 'fill-slate-900 font-semibold' : 'fill-slate-500'
                  }`}
                >
                  {s.label}
                </text>
              </g>
            );
          })}

          {/* Cumulative Net Trend Line */}
          <polyline
            fill="none"
            stroke="#059669"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={trendPoints}
          />

          {/* Trend Nodes */}
          {series.map((s, idx) => {
            const cx = padL + idx * stepX + stepX / 2;
            const cy = yForValue(Math.max(0, s.cumulativeNet));
            const isSelected = activeIdx === idx;
            return (
              <circle
                key={`${s.key}-pt`}
                cx={cx}
                cy={cy}
                r={isSelected ? 5 : 3.5}
                fill="#ffffff"
                stroke="#059669"
                strokeWidth="2.5"
                className="cursor-pointer"
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => setActiveIdx(idx)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};

interface SwimTimeTrendChartProps {
  swimTimes: SwimTime[];
  compact?: boolean;
}

export const SwimTimeTrendChart: React.FC<SwimTimeTrendChartProps> = ({
  swimTimes,
  compact = false,
}) => {
  // Build unique athlete + event + course combinations sorted by count
  const combos = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; athleteId: string; eventName: string; course: string; items: SwimTime[] }
    >();
    for (const st of swimTimes) {
      const key = `${st.athleteId}__${st.eventName}__${st.poolCourse}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(st);
      } else {
        map.set(key, {
          key,
          label: `${st.athleteName} — ${st.eventName} (${st.poolCourse})`,
          athleteId: st.athleteId,
          eventName: st.eventName,
          course: st.poolCourse,
          items: [st],
        });
      }
    }
    return Array.from(map.values())
      .map((c) => ({
        ...c,
        items: [...c.items].sort((a, b) => a.meetDate.localeCompare(b.meetDate)),
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [swimTimes]);

  const [selectedKey, setSelectedKey] = useState<string>('');
  const [activePointIdx, setActivePointIdx] = useState<number | null>(null);

  const activeCombo = useMemo(() => {
    if (combos.length === 0) return null;
    return combos.find((c) => c.key === selectedKey) || combos[0];
  }, [combos, selectedKey]);

  const points = activeCombo?.items || [];

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const first = points[0];
    const latest = points[points.length - 1];
    const best = points.reduce((min, p) => (p.timeMs < min.timeMs ? p : min), points[0]);
    const deltaMs = latest.timeMs - first.timeMs; // negative means faster!
    return { first, latest, best, deltaMs };
  }, [points]);

  if (combos.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 text-center text-xs text-slate-500">
        Belum ada data catatan waktu kejuaraan untuk menampilkan grafik tren kecepatan atlet.
      </div>
    );
  }

  const W = 620;
  const H = compact ? 180 : 210;
  const padL = 62;
  const padR = 36;
  const padT = 24;
  const padB = 34;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const minMs = Math.min(...points.map((p) => p.timeMs));
  const maxMs = Math.max(...points.map((p) => p.timeMs));
  const spread = Math.max(500, maxMs - minMs);
  const yMin = Math.max(0, minMs - spread * 0.2);
  const yMax = maxMs + spread * 0.2;

  const xForIdx = (idx: number) => {
    if (points.length === 1) return padL + chartW / 2;
    return padL + (idx / (points.length - 1)) * chartW;
  };

  // Higher Y on screen = slower time; lower Y = faster time (smaller timeMs)
  const yForMs = (ms: number) => {
    const ratio = (ms - yMin) / Math.max(1, yMax - yMin);
    return padT + chartH - ratio * chartH;
  };

  const polylinePts = points.map((p, i) => `${xForIdx(i)},${yForMs(p.timeMs)}`).join(' ');
  const activePoint =
    activePointIdx !== null && points[activePointIdx]
      ? points[activePointIdx]
      : points[points.length - 1];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm sm:text-base font-semibold text-slate-900">
            Grafik Tren Catatan Waktu Kejuaraan
          </h3>
          <p className="text-xs text-slate-500">
            Garis menurun menandakan catatan waktu semakin cepat (progres membaik)
          </p>
        </div>

        <select
          value={activeCombo?.key || ''}
          onChange={(e) => {
            setSelectedKey(e.target.value);
            setActivePointIdx(null);
          }}
          className="w-full sm:w-auto px-3 min-h-[44px] sm:min-h-[36px] text-sm sm:text-xs border border-slate-200 rounded-lg bg-white text-slate-800 sm:max-w-xs"
        >
          {combos.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} ({c.items.length}x)
            </option>
          ))}
        </select>
      </div>

      {stats && activePoint && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
          <div>
            <span className="text-slate-500 block">Lomba Terpilih</span>
            <span className="font-semibold text-slate-900 line-clamp-1">
              {activePoint.championshipName}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Waktu ({formatDateID(activePoint.meetDate)})</span>
            <span className="font-mono-tabular font-bold text-sky-800">
              {activePoint.formattedTime}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Personal Best (PB)</span>
            <span className="font-mono-tabular font-bold text-slate-900">
              {stats.best.formattedTime}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Tren Kemajuan</span>
            {points.length < 2 ? (
              <span className="text-slate-600">Butuh ≥ 2 lomba</span>
            ) : (
              <span
                className={`font-mono-tabular font-semibold inline-flex items-center gap-1 ${
                  stats.deltaMs <= 0 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {stats.deltaMs <= 0 ? (
                  <TrendingDown className="w-3.5 h-3.5" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5" />
                )}
                {stats.deltaMs <= 0 ? '' : '+'}
                {(stats.deltaMs / 1000).toFixed(2)} dtk
              </span>
            )}
          </div>
        </div>
      )}

      <div className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label="Grafik tren perkembangan waktu renang atlet"
        >
          {[0, 0.5, 1].map((r) => {
            const ms = yMin + (yMax - yMin) * r;
            const y = yForMs(ms);
            return (
              <g key={r}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono-tabular"
                >
                  {formatSwimTimeMs(ms)}
                </text>
              </g>
            );
          })}

          {points.length > 1 && (
            <polyline
              fill="none"
              stroke="#0369a1"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polylinePts}
            />
          )}

          {points.map((p, idx) => {
            const cx = xForIdx(idx);
            const cy = yForMs(p.timeMs);
            const isActive =
              activePointIdx === idx || (activePointIdx === null && idx === points.length - 1);
            return (
              <g
                key={p.id}
                className="cursor-pointer"
                onMouseEnter={() => setActivePointIdx(idx)}
                onClick={() => setActivePointIdx(idx)}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 6 : 4.5}
                  fill={p.isPersonalBest ? '#0284c7' : '#ffffff'}
                  stroke="#0369a1"
                  strokeWidth="2.5"
                />
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="middle"
                  className="fill-slate-700 text-[10px] font-mono-tabular font-semibold"
                >
                  {p.formattedTime}
                </text>
                <text
                  x={cx}
                  y={H - 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] font-mono-tabular"
                >
                  {p.meetDate.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

interface TrainingTrendChartProps {
  schedules: TrainingSchedule[];
  attendance: AttendanceRecord[];
}

export const TrainingTrendChart: React.FC<TrainingTrendChartProps> = ({
  schedules,
  attendance,
}) => {
  const volumeByDay = useMemo(() => {
    return DAYS_OF_WEEK.map((day) => {
      const daySchedules = schedules.filter((s) => s.dayOfWeek === day);
      const totalMeters = daySchedules.reduce((acc, s) => acc + s.targetDistanceMeters, 0);
      return { day: day.slice(0, 3), fullDay: day, totalMeters, sessions: daySchedules.length };
    });
  }, [schedules]);

  const maxMeters = Math.max(2000, ...volumeByDay.map((d) => d.totalMeters));

  const attendanceTrend = useMemo(() => {
    const byDate = new Map<string, { hadir: number; total: number }>();
    for (const rec of attendance) {
      const cur = byDate.get(rec.sessionDate) || { hadir: 0, total: 0 };
      cur.total += 1;
      if (rec.status === 'Hadir') cur.hadir += 1;
      byDate.set(rec.sessionDate, cur);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([date, v]) => ({
        date,
        label: date.slice(5),
        rate: v.total > 0 ? Math.round((v.hadir / v.total) * 100) : 0,
        hadir: v.hadir,
        total: v.total,
      }));
  }, [attendance]);

  const W = 560;
  const H = 175;
  const padL = 48;
  const padR = 28;
  const padT = 20;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const stepX = chartW / volumeByDay.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Weekly Target Meter Volume Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Tren Beban Volume Latihan Mingguan (Meter)
          </h3>
          <p className="text-xs text-slate-500">
            Akumulasi target jarak renang harian Senin–Minggu
          </p>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none">
          {[0, 0.5, 1].map((r) => {
            const y = padT + chartH - r * chartH;
            const val = Math.round(maxMeters * r);
            return (
              <g key={r}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={r === 0 ? undefined : '3 3'}
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono-tabular"
                >
                  {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                </text>
              </g>
            );
          })}

          {volumeByDay.map((d, idx) => {
            const cx = padL + idx * stepX + stepX / 2;
            const barW = Math.min(28, stepX * 0.52);
            const h = Math.max(2, (d.totalMeters / maxMeters) * chartH);
            const y = padT + chartH - h;
            return (
              <g key={d.fullDay}>
                <rect
                  x={cx - barW / 2}
                  y={y}
                  width={barW}
                  height={h}
                  rx={4}
                  fill={d.totalMeters > 0 ? '#0369a1' : '#e2e8f0'}
                />
                {d.totalMeters > 0 && (
                  <text
                    x={cx}
                    y={y - 5}
                    textAnchor="middle"
                    className="fill-slate-600 text-[10px] font-mono-tabular"
                  >
                    {d.totalMeters}m
                  </text>
                )}
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-slate-600 text-[11px]"
                >
                  {d.day}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Attendance Rate Trend */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Tren Tingkat Kehadiran Latihan (%)
          </h3>
          <p className="text-xs text-slate-500">
            Persentase atlet hadir pada tanggal sesi yang telah dipresensi
          </p>
        </div>

        {attendanceTrend.length === 0 ? (
          <div className="h-36 flex items-center justify-center text-xs text-slate-500">
            Belum ada data presensi tercatat untuk menampilkan tren kehadiran.
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none">
            {[0, 50, 100].map((pct) => {
              const y = padT + chartH - (pct / 100) * chartH;
              return (
                <g key={pct}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={W - padR}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray={pct === 0 ? undefined : '3 3'}
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono-tabular"
                  >
                    {pct}%
                  </text>
                </g>
              );
            })}

            {attendanceTrend.length > 1 && (
              <polyline
                fill="none"
                stroke="#059669"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={attendanceTrend
                  .map((a, i) => {
                    const x =
                      padL +
                      (i / Math.max(1, attendanceTrend.length - 1)) * chartW;
                    const y = padT + chartH - (a.rate / 100) * chartH;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
            )}

            {attendanceTrend.map((a, i) => {
              const x =
                attendanceTrend.length === 1
                  ? padL + chartW / 2
                  : padL + (i / (attendanceTrend.length - 1)) * chartW;
              const y = padT + chartH - (a.rate / 100) * chartH;
              return (
                <g key={a.date}>
                  <circle
                    cx={x}
                    cy={y}
                    r={4.5}
                    fill="#ffffff"
                    stroke="#059669"
                    strokeWidth="2.5"
                  />
                  <text
                    x={x}
                    y={y - 10}
                    textAnchor="middle"
                    className="fill-emerald-800 text-[10px] font-mono-tabular font-semibold"
                  >
                    {a.rate}%
                  </text>
                  <text
                    x={x}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-mono-tabular"
                  >
                    {a.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
};

interface AthleteCompetitionChartProps {
  athletes: Athlete[];
  swimTimes: SwimTime[];
  lockedAthleteId?: string;
  compact?: boolean;
  onQuickAddTime?: (athleteId?: string) => void;
}

const COMPARE_PALETTE = ['#0369a1', '#059669', '#d97706', '#7c3aed'] as const;

function shortenChampionshipLabel(name: string, maxLen = 16): string {
  const clean = name.trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

export const AthleteCompetitionChart: React.FC<AthleteCompetitionChartProps> = ({
  athletes,
  swimTimes,
  lockedAthleteId,
  compact = false,
  onQuickAddTime,
}) => {
  const [chartMode, setChartMode] = useState<'per_athlete' | 'compare_athletes'>('per_athlete');
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>('');
  const [selectedEventKey, setSelectedEventKey] = useState<string>('');
  const [activeMeetIdx, setActiveMeetIdx] = useState<number | null>(null);

  // Compare-athletes mode states
  const [compareEventKey, setCompareEventKey] = useState<string>('');
  const [compareAthleteIds, setCompareAthleteIds] = useState<string[]>([]);
  const [activeCompareIdx, setActiveCompareIdx] = useState<number | null>(null);

  // Athletes ordered by number of swim records (those with multi-meet history first)
  const athleteOptions = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const st of swimTimes) {
      countMap.set(st.athleteId, (countMap.get(st.athleteId) || 0) + 1);
    }
    const knownIds = new Set(athletes.map((a) => a.id));
    const list: { id: string; name: string; ageGroup: string; count: number }[] = athletes.map((a) => ({
      id: a.id,
      name: a.fullName,
      ageGroup: a.ageGroup,
      count: countMap.get(a.id) || 0,
    }));
    // Include orphan swim time athlete IDs if any
    for (const st of swimTimes) {
      if (!knownIds.has(st.athleteId)) {
        knownIds.add(st.athleteId);
        list.push({
          id: st.athleteId,
          name: st.athleteName,
          ageGroup: '-',
          count: countMap.get(st.athleteId) || 0,
        });
      }
    }
    return list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [athletes, swimTimes]);

  const effectiveAthleteId = useMemo(() => {
    if (lockedAthleteId) return lockedAthleteId;
    if (selectedAthleteId && athleteOptions.some((a) => a.id === selectedAthleteId)) {
      return selectedAthleteId;
    }
    return athleteOptions[0]?.id || '';
  }, [lockedAthleteId, selectedAthleteId, athleteOptions]);

  const athleteRecords = useMemo(() => {
    if (!effectiveAthleteId) return [];
    return swimTimes
      .filter((st) => st.athleteId === effectiveAthleteId)
      .sort((a, b) => a.meetDate.localeCompare(b.meetDate));
  }, [swimTimes, effectiveAthleteId]);

  const athleteEvents = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; eventName: string; poolCourse: string; items: SwimTime[] }
    >();
    for (const st of athleteRecords) {
      const key = `${st.eventName}__${st.poolCourse}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(st);
      } else {
        map.set(key, {
          key,
          label: `${st.eventName} · ${st.poolCourse}`,
          eventName: st.eventName,
          poolCourse: st.poolCourse,
          items: [st],
        });
      }
    }
    return Array.from(map.values())
      .map((ev) => ({
        ...ev,
        items: [...ev.items].sort((a, b) => a.meetDate.localeCompare(b.meetDate)),
      }))
      .sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
  }, [athleteRecords]);

  // '__ALL__' displays cross-event competition summary for the selected athlete
  const effectiveEventKey = useMemo(() => {
    if (athleteEvents.length === 0) return '';
    if (selectedEventKey === '__ALL__') return '__ALL__';
    if (selectedEventKey && athleteEvents.some((e) => e.key === selectedEventKey)) {
      return selectedEventKey;
    }
    return athleteEvents[0].key;
  }, [athleteEvents, selectedEventKey]);

  const activeEventSeries = useMemo(() => {
    if (!effectiveEventKey || effectiveEventKey === '__ALL__') return null;
    return athleteEvents.find((e) => e.key === effectiveEventKey) || null;
  }, [athleteEvents, effectiveEventKey]);

  // Compare-athletes computations
  const clubEventGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        eventName: string;
        poolCourse: string;
        athleteIds: string[];
        items: SwimTime[];
      }
    >();
    for (const st of swimTimes) {
      const key = `${st.eventName}__${st.poolCourse}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(st);
        if (!existing.athleteIds.includes(st.athleteId)) {
          existing.athleteIds.push(st.athleteId);
        }
      } else {
        map.set(key, {
          key,
          label: `${st.eventName} · ${st.poolCourse}`,
          eventName: st.eventName,
          poolCourse: st.poolCourse,
          athleteIds: [st.athleteId],
          items: [st],
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        b.athleteIds.length - a.athleteIds.length ||
        b.items.length - a.items.length ||
        a.label.localeCompare(b.label)
    );
  }, [swimTimes]);

  const effectiveCompareEvent = useMemo(() => {
    if (clubEventGroups.length === 0) return null;
    return clubEventGroups.find((g) => g.key === compareEventKey) || clubEventGroups[0];
  }, [clubEventGroups, compareEventKey]);

  const activeCompareAthletes = useMemo(() => {
    if (!effectiveCompareEvent) return [];
    const valid = compareAthleteIds.filter((id) => effectiveCompareEvent.athleteIds.includes(id));
    if (valid.length > 0) return valid.slice(0, 4);
    return effectiveCompareEvent.athleteIds.slice(0, 4);
  }, [effectiveCompareEvent, compareAthleteIds]);

  const toggleCompareAthlete = (athleteId: string) => {
    const current = activeCompareAthletes;
    if (current.includes(athleteId)) {
      if (current.length <= 1) return; // keep at least 1
      setCompareAthleteIds(current.filter((id) => id !== athleteId));
    } else {
      const next = [...current, athleteId].slice(-4);
      setCompareAthleteIds(next);
    }
    setActiveCompareIdx(null);
  };

  if (swimTimes.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900">
            Visualisasi Perkembangan Catatan Waktu Antar Kompetisi
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Belum ada catatan waktu kejuaraan tersimpan. Catat hasil lomba atlet untuk membandingkan progres kecepatan antar kejuaraan.
          </p>
        </div>
        {onQuickAddTime && athletes.length > 0 && (
          <button
            type="button"
            onClick={() => onQuickAddTime()}
            className="px-4 min-h-[40px] text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            Catat Waktu Lomba
          </button>
        )}
      </div>
    );
  }

  const effectiveMode = lockedAthleteId ? 'per_athlete' : chartMode;

  // Render Per-Athlete Multi-Competition Visualization
  const renderPerAthleteView = () => {
    const points = activeEventSeries?.items || [];
    const activeIdx =
      activeMeetIdx !== null && points[activeMeetIdx] ? activeMeetIdx : Math.max(0, points.length - 1);
    const activePoint = points[activeIdx];

    const first = points[0];
    const latest = points[points.length - 1];
    const best =
      points.length > 0
        ? points.reduce((min, p) => (p.timeMs < min.timeMs ? p : min), points[0])
        : null;
    const overallDeltaMs = first && latest ? latest.timeMs - first.timeMs : 0;

    if (athleteRecords.length === 0) {
      return (
        <div className="py-8 text-center space-y-2">
          <p className="text-xs text-slate-500">
            Atlet terpilih belum memiliki catatan waktu kejuaraan.
          </p>
          {onQuickAddTime && (
            <button
              type="button"
              onClick={() => onQuickAddTime(effectiveAthleteId)}
              className="px-3.5 py-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg cursor-pointer"
            >
              Catat Waktu untuk Atlet Ini
            </button>
          )}
        </div>
      );
    }

    if (effectiveEventKey === '__ALL__' || !activeEventSeries) {
      return (
        <div className="space-y-4">
          <div className="text-xs text-slate-500">
            Menampilkan perbandingan antar kejuaraan pada seluruh nomor lomba yang diikuti atlet. Pilih salah satu nomor untuk melihat grafik garis detail.
          </div>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {athleteEvents.map((ev) => {
              const evBest = ev.items.reduce((m, p) => (p.timeMs < m.timeMs ? p : m), ev.items[0]);
              const evFirst = ev.items[0];
              const evLatest = ev.items[ev.items.length - 1];
              const evDeltaMs = evLatest.timeMs - evFirst.timeMs;
              const maxEvMs = Math.max(...ev.items.map((p) => p.timeMs));
              const minEvMs = Math.min(...ev.items.map((p) => p.timeMs));

              return (
                <div key={ev.key} className="p-3.5 sm:p-4 space-y-3 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-slate-900">
                        {ev.eventName}{' '}
                        <span className="font-normal text-slate-500">· {ev.poolCourse}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-mono-tabular">
                        {ev.items.length} kejuaraan · PB Terbaik {evBest.formattedTime} ({evBest.championshipName})
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {ev.items.length >= 2 && (
                        <span
                          className={`font-mono-tabular text-xs font-semibold inline-flex items-center gap-1 ${
                            evDeltaMs <= 0 ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {evDeltaMs <= 0 ? (
                            <TrendingDown className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingUp className="w-3.5 h-3.5" />
                          )}
                          {evDeltaMs <= 0 ? '' : '+'}
                          {(evDeltaMs / 1000).toFixed(2)} dtk
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEventKey(ev.key);
                          setActiveMeetIdx(null);
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md whitespace-nowrap cursor-pointer"
                      >
                        Grafik Garis
                      </button>
                    </div>
                  </div>

                  {/* Horizontal competition bars */}
                  <div className="space-y-1.5">
                    {ev.items.map((item, idx) => {
                      const prev = idx > 0 ? ev.items[idx - 1] : null;
                      const stepDelta = prev ? item.timeMs - prev.timeMs : 0;
                      // Scale bar width visually between 42% and 100% so differences are perceptible
                      const span = Math.max(200, maxEvMs - minEvMs);
                      const widthPct =
                        ev.items.length === 1
                          ? 78
                          : 58 + ((item.timeMs - minEvMs) / span) * 42;
                      return (
                        <div key={item.id} className="grid grid-cols-12 items-center gap-2 text-[11px]">
                          <div className="col-span-5 sm:col-span-4 truncate text-slate-600" title={item.championshipName}>
                            <span className="font-mono-tabular text-slate-400 mr-1.5">
                              {item.meetDate.slice(2, 7)}
                            </span>
                            {item.championshipName}
                          </div>
                          <div className="col-span-4 sm:col-span-5 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                item.timeMs === evBest.timeMs ? 'bg-sky-700' : 'bg-slate-400'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(25, widthPct))}%` }}
                            />
                          </div>
                          <div className="col-span-3 text-right font-mono-tabular whitespace-nowrap">
                            <span className="font-semibold text-slate-900">{item.formattedTime}</span>
                            {prev && (
                              <span
                                className={`ml-1.5 text-[10px] ${
                                  stepDelta <= 0 ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                ({stepDelta <= 0 ? '' : '+'}
                                {(stepDelta / 1000).toFixed(2)})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Specific Event Line Chart across competitions
    const W = 680;
    const H = compact ? 185 : 225;
    const padL = 62;
    const padR = 40;
    const padT = 28;
    const padB = 46;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const minMs = Math.min(...points.map((p) => p.timeMs));
    const maxMs = Math.max(...points.map((p) => p.timeMs));
    const spread = Math.max(400, maxMs - minMs);
    const yMin = Math.max(0, minMs - spread * 0.22);
    const yMax = maxMs + spread * 0.22;

    const xForIdx = (idx: number) => {
      if (points.length === 1) return padL + chartW / 2;
      return padL + (idx / (points.length - 1)) * chartW;
    };

    const yForMs = (ms: number) => {
      const ratio = (ms - yMin) / Math.max(1, yMax - yMin);
      return padT + chartH - ratio * chartH;
    };

    const polylinePts = points.map((p, i) => `${xForIdx(i)},${yForMs(p.timeMs)}`).join(' ');
    const areaPts =
      points.length > 1
        ? `${xForIdx(0)},${padT + chartH} ${polylinePts} ${xForIdx(points.length - 1)},${padT + chartH}`
        : '';

    return (
      <div className="space-y-4">
        {activePoint && best && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
            <div className="min-w-0">
              <span className="text-slate-500 block">Kompetisi Dipilih</span>
              <span className="font-semibold text-slate-900 truncate block" title={activePoint.championshipName}>
                {activePoint.championshipName}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Waktu ({formatDateID(activePoint.meetDate)})</span>
              <span className="font-mono-tabular font-bold text-sky-800">
                {activePoint.formattedTime} · {activePoint.medal}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Personal Best (PB)</span>
              <span className="font-mono-tabular font-bold text-slate-900">
                {best.formattedTime}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Progres Lomba ({points.length}x)</span>
              {points.length < 2 ? (
                <span className="text-slate-600">Butuh ≥ 2 kompetisi</span>
              ) : (
                <span
                  className={`font-mono-tabular font-semibold inline-flex items-center gap-1 ${
                    overallDeltaMs <= 0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {overallDeltaMs <= 0 ? (
                    <TrendingDown className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5" />
                  )}
                  {overallDeltaMs <= 0 ? '' : '+'}
                  {(overallDeltaMs / 1000).toFixed(2)} dtk
                </span>
              )}
            </div>
          </div>
        )}

        <div className="w-full">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto select-none"
            role="img"
            aria-label="Grafik perkembangan catatan waktu renang antar kompetisi"
          >
            {[0, 0.5, 1].map((r) => {
              const ms = yMin + (yMax - yMin) * r;
              const y = yForMs(ms);
              return (
                <g key={r}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={W - padR}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono-tabular"
                  >
                    {formatSwimTimeMs(ms)}
                  </text>
                </g>
              );
            })}

            {areaPts && (
              <polygon points={areaPts} fill="rgba(3, 105, 161, 0.07)" />
            )}

            {points.length > 1 && (
              <polyline
                fill="none"
                stroke="#0369a1"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylinePts}
              />
            )}

            {/* Segment inter-competition delta labels */}
            {points.length > 1 &&
              points.map((p, idx) => {
                if (idx === 0) return null;
                const prev = points[idx - 1];
                const midX = (xForIdx(idx - 1) + xForIdx(idx)) / 2;
                const midY = (yForMs(prev.timeMs) + yForMs(p.timeMs)) / 2;
                const delta = p.timeMs - prev.timeMs;
                const deltaText = `${delta <= 0 ? '' : '+'}${(delta / 1000).toFixed(2)}s`;
                return (
                  <g key={`seg-${p.id}`}>
                    <rect
                      x={midX - 22}
                      y={midY - 9}
                      width={44}
                      height={16}
                      rx={4}
                      fill="#ffffff"
                      stroke={delta <= 0 ? '#a7f3d0' : '#fde68a'}
                      strokeWidth="1"
                    />
                    <text
                      x={midX}
                      y={midY + 2}
                      textAnchor="middle"
                      className={`text-[9px] font-mono-tabular font-semibold ${
                        delta <= 0 ? 'fill-emerald-700' : 'fill-amber-700'
                      }`}
                    >
                      {deltaText}
                    </text>
                  </g>
                );
              })}

            {points.map((p, idx) => {
              const cx = xForIdx(idx);
              const cy = yForMs(p.timeMs);
              const isSelected = idx === activeIdx;
              const isBest = best && p.id === best.id;
              return (
                <g
                  key={p.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveMeetIdx(idx)}
                  onClick={() => setActiveMeetIdx(idx)}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 6.5 : 5}
                    fill={isBest ? '#0284c7' : '#ffffff'}
                    stroke="#0369a1"
                    strokeWidth="2.5"
                  />
                  <text
                    x={cx}
                    y={cy - 11}
                    textAnchor="middle"
                    className="fill-slate-800 text-[10px] font-mono-tabular font-bold"
                  >
                    {p.formattedTime}
                    {isBest ? ' PB' : ''}
                  </text>
                  <text
                    x={cx}
                    y={H - 22}
                    textAnchor="middle"
                    className="fill-slate-700 text-[9.5px] font-medium"
                  >
                    {shortenChampionshipLabel(p.championshipName, 14)}
                  </text>
                  <text
                    x={cx}
                    y={H - 9}
                    textAnchor="middle"
                    className="fill-slate-400 text-[9px] font-mono-tabular"
                  >
                    {p.meetDate}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {points.length === 1 && (
          <p className="text-[11px] text-slate-500">
            Baru tercatat 1 kompetisi pada nomor {activeEventSeries.label}. Tambahkan hasil kejuaraan berikutnya untuk melihat garis tren & selisih waktu antar lomba.
          </p>
        )}
      </div>
    );
  };

  // Render Multi-Athlete Head-to-Head Comparison across competitions
  const renderCompareAthletesView = () => {
    if (!effectiveCompareEvent) return null;

    const eventRecords = effectiveCompareEvent.items.filter((i) =>
      activeCompareAthletes.includes(i.athleteId)
    );
    const uniqueDates = Array.from(new Set(eventRecords.map((r) => r.meetDate))).sort((a, b) =>
      a.localeCompare(b)
    );

    const athleteMap = new Map<string, { name: string; color: string; items: SwimTime[] }>();
    activeCompareAthletes.forEach((aid, idx) => {
      const items = eventRecords
        .filter((r) => r.athleteId === aid)
        .sort((a, b) => a.meetDate.localeCompare(b.meetDate));
      const fallbackName =
        athletes.find((a) => a.id === aid)?.fullName || items[0]?.athleteName || 'Atlet';
      athleteMap.set(aid, {
        name: fallbackName,
        color: COMPARE_PALETTE[idx % COMPARE_PALETTE.length],
        items,
      });
    });

    const W = 680;
    const H = 225;
    const padL = 62;
    const padR = 36;
    const padT = 26;
    const padB = 38;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const allMs = eventRecords.map((r) => r.timeMs);
    const minMs = allMs.length > 0 ? Math.min(...allMs) : 25000;
    const maxMs = allMs.length > 0 ? Math.max(...allMs) : 35000;
    const spread = Math.max(400, maxMs - minMs);
    const yMin = Math.max(0, minMs - spread * 0.2);
    const yMax = maxMs + spread * 0.2;

    const xForDate = (date: string) => {
      const idx = uniqueDates.indexOf(date);
      if (uniqueDates.length <= 1) return padL + chartW / 2;
      return padL + (Math.max(0, idx) / (uniqueDates.length - 1)) * chartW;
    };

    const yForMs = (ms: number) => {
      const ratio = (ms - yMin) / Math.max(1, yMax - yMin);
      return padT + chartH - ratio * chartH;
    };

    const inspectedDateIdx =
      activeCompareIdx !== null && uniqueDates[activeCompareIdx]
        ? activeCompareIdx
        : Math.max(0, uniqueDates.length - 1);
    const inspectedDate = uniqueDates[inspectedDateIdx];

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {effectiveCompareEvent.athleteIds.map((aid) => {
              const isActive = activeCompareAthletes.includes(aid);
              const activeOrder = activeCompareAthletes.indexOf(aid);
              const color =
                activeOrder >= 0
                  ? COMPARE_PALETTE[activeOrder % COMPARE_PALETTE.length]
                  : '#94a3b8';
              const name =
                athletes.find((a) => a.id === aid)?.fullName ||
                effectiveCompareEvent.items.find((i) => i.athleteId === aid)?.athleteName ||
                'Atlet';
              return (
                <button
                  key={aid}
                  type="button"
                  onClick={() => toggleCompareAthlete(aid)}
                  className={`inline-flex items-center gap-1.5 px-2.5 min-h-[34px] text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate max-w-[140px]">{name}</span>
                </button>
              );
            })}
          </div>
          <span className="text-[11px] text-slate-500 shrink-0">
            Pilih hingga 4 atlet pada nomor {effectiveCompareEvent.label}
          </span>
        </div>

        <div className="w-full">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto select-none"
            role="img"
            aria-label="Perbandingan catatan waktu antar atlet lintas kompetisi"
          >
            {[0, 0.5, 1].map((r) => {
              const ms = yMin + (yMax - yMin) * r;
              const y = yForMs(ms);
              return (
                <g key={r}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={W - padR}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono-tabular"
                  >
                    {formatSwimTimeMs(ms)}
                  </text>
                </g>
              );
            })}

            {uniqueDates.map((d, idx) => {
              const x = xForDate(d);
              const isSelected = idx === inspectedDateIdx;
              return (
                <g
                  key={d}
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveCompareIdx(idx)}
                  onClick={() => setActiveCompareIdx(idx)}
                >
                  <line
                    x1={x}
                    y1={padT}
                    x2={x}
                    y2={padT + chartH}
                    stroke={isSelected ? '#bae6fd' : '#f1f5f9'}
                    strokeWidth={isSelected ? '2' : '1'}
                  />
                  <text
                    x={x}
                    y={H - 12}
                    textAnchor="middle"
                    className={`text-[10px] font-mono-tabular ${
                      isSelected ? 'fill-slate-900 font-semibold' : 'fill-slate-500'
                    }`}
                  >
                    {d}
                  </text>
                </g>
              );
            })}

            {Array.from(athleteMap.entries()).map(([aid, entry]) => {
              const pts = entry.items.map((p) => `${xForDate(p.meetDate)},${yForMs(p.timeMs)}`).join(' ');
              return (
                <g key={aid}>
                  {entry.items.length > 1 && (
                    <polyline
                      fill="none"
                      stroke={entry.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={pts}
                    />
                  )}
                  {entry.items.map((p) => {
                    const cx = xForDate(p.meetDate);
                    const cy = yForMs(p.timeMs);
                    const isFocused = p.meetDate === inspectedDate;
                    return (
                      <g
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => setActiveCompareIdx(uniqueDates.indexOf(p.meetDate))}
                      >
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isFocused ? 5.5 : 4}
                          fill={p.isPersonalBest ? entry.color : '#ffffff'}
                          stroke={entry.color}
                          strokeWidth="2.5"
                        />
                        {isFocused && (
                          <text
                            x={cx}
                            y={cy - 9}
                            textAnchor="middle"
                            className="fill-slate-800 text-[9.5px] font-mono-tabular font-semibold"
                          >
                            {p.formattedTime}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Summary comparison table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-medium">
                <th className="py-2 px-3">Atlet</th>
                <th className="py-2 px-3 text-right">Jml Lomba</th>
                <th className="py-2 px-3 text-right">Rekor PB</th>
                <th className="py-2 px-3 text-right">Waktu Terakhir</th>
                <th className="py-2 px-3 text-right">Progres</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from(athleteMap.entries()).map(([aid, entry]) => {
                const items = entry.items;
                const first = items[0];
                const last = items[items.length - 1];
                const pb = items.reduce((m, p) => (p.timeMs < m.timeMs ? p : m), items[0]);
                const delta = first && last ? last.timeMs - first.timeMs : 0;
                return (
                  <tr key={aid}>
                    <td className="py-2 px-3 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: entry.color }}
                        />
                        {entry.name}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono-tabular text-slate-600">
                      {items.length}x
                    </td>
                    <td className="py-2 px-3 text-right font-mono-tabular font-bold text-sky-800">
                      {pb ? pb.formattedTime : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono-tabular text-slate-800">
                      {last ? last.formattedTime : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono-tabular font-semibold">
                      {items.length < 2 ? (
                        <span className="text-slate-400 font-normal">-</span>
                      ) : (
                        <span className={delta <= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                          {delta <= 0 ? '' : '+'}
                          {(delta / 1000).toFixed(2)} dtk
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900">
            Perkembangan Catatan Waktu Antar Kompetisi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {effectiveMode === 'per_athlete'
              ? 'Pantau progres catatan waktu setiap atlet lintas kejuaraan (garis menurun berarti waktu semakin cepat).'
              : 'Bandingkan tren waktu hingga 4 atlet secara bersamaan pada nomor lomba yang sama.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!lockedAthleteId && (
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setChartMode('per_athlete')}
                className={`px-3 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  chartMode === 'per_athlete'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Atlet
              </button>
              <button
                type="button"
                onClick={() => setChartMode('compare_athletes')}
                className={`px-3 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  chartMode === 'compare_athletes'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bandingkan Atlet
              </button>
            </div>
          )}

          {effectiveMode === 'per_athlete' ? (
            <>
              {!lockedAthleteId && (
                <select
                  value={effectiveAthleteId}
                  onChange={(e) => {
                    setSelectedAthleteId(e.target.value);
                    setSelectedEventKey('');
                    setActiveMeetIdx(null);
                  }}
                  aria-label="Pilih atlet untuk grafik"
                  className="px-3 min-h-[40px] sm:min-h-[36px] text-xs border border-slate-200 rounded-lg bg-white text-slate-800 max-w-[220px]"
                >
                  {athleteOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.count} lomba)
                    </option>
                  ))}
                </select>
              )}

              {athleteEvents.length > 0 && (
                <select
                  value={effectiveEventKey}
                  onChange={(e) => {
                    setSelectedEventKey(e.target.value);
                    setActiveMeetIdx(null);
                  }}
                  aria-label="Pilih nomor lomba atlet"
                  className="px-3 min-h-[40px] sm:min-h-[36px] text-xs border border-slate-200 rounded-lg bg-white text-slate-800 max-w-[240px]"
                >
                  <option value="__ALL__">Semua Nomor ({athleteEvents.length})</option>
                  {athleteEvents.map((ev) => (
                    <option key={ev.key} value={ev.key}>
                      {ev.label} ({ev.items.length}x)
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <select
              value={effectiveCompareEvent?.key || ''}
              onChange={(e) => {
                setCompareEventKey(e.target.value);
                setCompareAthleteIds([]);
                setActiveCompareIdx(null);
              }}
              aria-label="Pilih nomor lomba perbandingan"
              className="px-3 min-h-[40px] sm:min-h-[36px] text-xs border border-slate-200 rounded-lg bg-white text-slate-800 max-w-[260px]"
            >
              {clubEventGroups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label} ({g.athleteIds.length} atlet)
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {effectiveMode === 'per_athlete' ? renderPerAthleteView() : renderCompareAthletesView()}
    </div>
  );
};

