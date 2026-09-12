'use client';
import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceDot,
} from 'recharts';
import {
  sampleSize, daysNeeded, mdeForDays, normalQuantile,
} from '@/lib/stats';

export default function Designer() {
  const [baselinePct, setBaselinePct] = useState(5);
  const [mdeValue, setMdeValue] = useState(20);
  const [mdeType, setMdeType] = useState('relative');
  const [alpha, setAlpha] = useState(0.05);
  const [power, setPower] = useState(0.8);
  const [dailyTraffic, setDailyTraffic] = useState(4000);
  const [ratio, setRatio] = useState(0.5);
  const [daysBudget, setDaysBudget] = useState(7);

  const baseline = baselinePct / 100;
  const mde = mdeValue / 100;

  const result = useMemo(() => {
    try {
      const s = sampleSize({ baseline, mde, mdeType, alpha, power, ratio });
      const days = daysNeeded({ ...s, dailyTraffic, ratio });
      const reverse = mdeForDays({ baseline, days: daysBudget, dailyTraffic, ratio, alpha, power });
      return { s, days, reverse, error: null };
    } catch (e) {
      return { error: e.message };
    }
  }, [baseline, mde, mdeType, alpha, power, dailyTraffic, ratio, daysBudget]);

  // MDE 曲线：1% 到 10%（相对）或对应的绝对提升
  const curve = useMemo(() => {
    const pts = [];
    for (let i = 1; i <= 20; i++) {
      const m = (i * 0.5) / 100;
      try {
        const s = sampleSize({ baseline, mde: m, mdeType: 'absolute', alpha, power, ratio });
        pts.push({ mde: +(m * 100).toFixed(2), n: s.nControl, days: daysNeeded({ ...s, dailyTraffic, ratio }) });
      } catch { /* 越界跳过 */ }
    }
    return pts;
  }, [baseline, alpha, power, ratio, dailyTraffic]);

  const currentPoint = result.s && Number.isFinite(result.s.nControl)
    ? { mde: +(result.s.delta * 100).toFixed(2), n: result.s.nControl, days: result.days }
    : null;

  return (
    <div className="grid">
      <section className="panel">
        <h2>输入</h2>
        <label className="field">
          <span>基线转化率（%）</span>
          <input type="number" step="0.1" min="0.1" max="90" value={baselinePct}
            onChange={(e) => setBaselinePct(+e.target.value)} />
        </label>
        <label className="field">
          <span>最小可检测提升 MDE</span>
          <div className="row">
            <input type="number" step="0.5" min="0.1" value={mdeValue}
              onChange={(e) => setMdeValue(+e.target.value)} />
            <select value={mdeType} onChange={(e) => setMdeType(e.target.value)}>
              <option value="relative">相对（%）</option>
              <option value="absolute">绝对（%）</option>
            </select>
          </div>
        </label>
        <div className="row">
          <label className="field">
            <span>α</span>
            <input type="number" step="0.01" min="0.001" max="0.2" value={alpha}
              onChange={(e) => setAlpha(+e.target.value)} />
          </label>
          <label className="field">
            <span>power</span>
            <input type="number" step="0.05" min="0.5" max="0.99" value={power}
              onChange={(e) => setPower(+e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>日流量（人/天，两组合计）</span>
          <input type="number" step="100" min="100" value={dailyTraffic}
            onChange={(e) => setDailyTraffic(+e.target.value)} />
        </label>
        <label className="field">
          <span>实验组流量占比（{(ratio * 100).toFixed(0)}%）</span>
          <input type="range" min="0.1" max="0.9" step="0.05" value={ratio}
            onChange={(e) => setRatio(+e.target.value)} />
        </label>
        <label className="field">
          <span>时间预算（天）</span>
          <input type="number" step="1" min="1" max="60" value={daysBudget}
            onChange={(e) => setDaysBudget(+e.target.value)} />
        </label>
      </section>

      <section className="panel">
        <h2>输出</h2>
        {result.error && <p className="err">{result.error}</p>}
        {result.s && !result.error && (
          <>
            <div className="stat">
              <div className="stat-v">{fmtNum(result.s.nControl)}</div>
              <div className="stat-l">对照组需要样本量</div>
            </div>
            <div className="stat">
              <div className="stat-v">{fmtNum(result.s.nTreatment)}</div>
              <div className="stat-l">实验组需要样本量（占比 {(ratio * 100).toFixed(0)}%）</div>
            </div>
            <div className="stat">
              <div className="stat-v">{result.days} 天</div>
              <div className="stat-l">按 {dailyTraffic.toLocaleString()} 人/天 预计需要</div>
            </div>
            <hr />
            <div className="stat">
              <div className="stat-v">{fmtPct(result.reverse)}</div>
              <div className="stat-l">
                只肯跑 {daysBudget} 天，能检出这么小的绝对提升
                <br />
                （等价于相对提升 {baseline > 0 ? fmtPct(result.reverse / baseline) : '—'}）
              </div>
            </div>
            <p className="note">
              目标提升是 {fmtPct(result.s.delta)} 绝对提升。
              如果把实验从 {result.days} 天压到 {daysBudget} 天，能确信检出的最小提升会变成 {fmtPct(result.reverse)}。
            </p>
          </>
        )}
      </section>

      <section className="panel wide">
        <h2>MDE 曲线 —— 想检出更小的提升，样本量涨得多凶</h2>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="#eee" />
              <XAxis dataKey="mde" tickFormatter={(v) => `${v}%`}
                label={{ value: '绝对提升 MDE', position: 'insideBottom', offset: -2, fontSize: 11 }} />
              <YAxis tickFormatter={fmtAxis} width={52} />
              <Tooltip formatter={(v, n) => (n === 'n' ? fmtNum(v) : `${v} 天`)} labelFormatter={(v) => `MDE ${v}%`} />
              <Line type="monotone" dataKey="n" stroke="var(--accent)" dot={false} strokeWidth={2} />
              {currentPoint && (
                <ReferenceDot x={currentPoint.mde} y={currentPoint.n} r={4}
                  fill="var(--accent)" stroke="#fff" />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="note">
          曲线是 1/MDE² 的形状 —— 想把可检出的提升砍一半，样本量大约翻两番。
          红点是你当前的设计。这就是为什么「想检出 0.5 个点的提升」经常意味着要跑小半年。
        </p>
      </section>
    </div>
  );
}

function fmtNum(v) {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString();
}
function fmtPct(v, d = 2) {
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(d)}%`;
}
function fmtAxis(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return String(v);
}
