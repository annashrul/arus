import React, { useMemo, useState } from 'react';
import {
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
