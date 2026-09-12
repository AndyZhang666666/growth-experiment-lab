'use client';
import { useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine,
} from 'recharts';
import { simulatePeeking, STRATEGIES } from '@/lib/peeking';

// 默认参数与 scripts/peeking-sim.mjs 完全一致，跑出来的假阳性率也应该一致
const DEFAULTS = { seed: 20260913, nTrials: 2000, days: 14, nPerDay: 500, trueP: 0.1, alpha: 0.05 };

export default function Peeking() {
  const [nTrials, setNTrials] = useState(DEFAULTS.nTrials);
  const [days, setDays] = useState(DEFAULTS.days);
  const [nPerDay, setNPerDay] = useState(DEFAULTS.nPerDay);
  const [truePct, setTruePct] = useState(DEFAULTS.trueP * 100);
  const [alpha, setAlpha] = useState(DEFAULTS.alpha);
  const [seed, setSeed] = useState(DEFAULTS.seed);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [active, setActive] = useState('peeking');

  const run = useCallback(() => {
    setRunning(true);
    setProgress('计算中…');
    // 让 UI 先渲染出「计算中」，再跑同步模拟
    setTimeout(() => {
      const t0 = performance.now();
      const sim = simulatePeeking({
        seed, nTrials, days, nPerDay,
        trueP: truePct / 100, alpha,
      });
      const ms = Math.round(performance.now() - t0);
      setResult(sim);
      setProgress(`完成，用时 ${ms} ms`);
      setRunning(false);
    }, 30);
  }, [seed, nTrials, days, nPerDay, truePct, alpha]);

  const bars = result
    ? STRATEGIES.map((s) => ({
        key: s.key,
        label: s.label,
        fpr: +(result.results[s.key].falsePositiveRate * 100).toFixed(2),
      }))
    : [];

  const stopDist = result && active
    ? Array.from({ length: days }, (_, i) => {
        const d = i + 1;
        const hit = result.results[active].stopDayDistribution.find((x) => x.day === d);
        return { day: `D${d}`, count: hit ? hit.count : 0 };
      })
    : [];

  const activeResult = result ? result.results[active] : null;

  return (
    <div className="grid">
      <section className="panel">
        <h2>模拟设置</h2>
        <p className="note" style={{ marginTop: 0 }}>
          两组的<strong>真实转化率设成完全一样</strong>（零效应）。任何「显著」都是假阳性 ——
          理想情况下四次模拟的假阳性率都该是 α。
        </p>
        <div className="row">
          <label className="field">
            <span>模拟次数 N</span>
            <input type="number" min="100" max="5000" step="100" value={nTrials}
              onChange={(e) => setNTrials(+e.target.value)} />
          </label>
          <label className="field">
            <span>实验天数 T</span>
            <input type="number" min="2" max="30" step="1" value={days}
              onChange={(e) => setDays(+e.target.value)} />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>每天每组人数</span>
            <input type="number" min="50" max="5000" step="50" value={nPerDay}
              onChange={(e) => setNPerDay(+e.target.value)} />
          </label>
          <label className="field">
            <span>真实转化率（%）</span>
            <input type="number" min="0.5" max="50" step="0.5" value={truePct}
              onChange={(e) => setTruePct(+e.target.value)} />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>α</span>
            <input type="number" step="0.01" min="0.01" max="0.2" value={alpha}
              onChange={(e) => setAlpha(+e.target.value)} />
          </label>
          <label className="field">
            <span>随机种子</span>
            <input type="number" step="1" value={seed}
              onChange={(e) => setSeed(+e.target.value)} />
          </label>
        </div>
        <button className="btn" onClick={run} disabled={running}>
          {running ? '跑模拟中…' : '跑模拟'}
        </button>
        {progress && <p className="note">{progress}</p>}
        {nTrials * days * 4 > 400000 && (
          <p className="note warn-text">
            参数偏大：{nTrials} × {days} 天 × 2 组 × 4 策略，浏览器里可能要等几秒。
          </p>
        )}
      </section>

      <section className="panel">
        <h2>假阳性率对比</h2>
        {!result && <p className="note">点左边的「跑模拟」。默认参数与脚本一致，会得到 4.95% / 22.45% / 6.60% / 2.30%。</p>}
        {result && (
          <>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke="#eee" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${v}%`} domain={[0, 'dataMax']} />
                  <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <ReferenceLine x={alpha * 100} stroke="var(--muted)" strokeDasharray="4 4"
                    label={{ value: `α=${(alpha * 100).toFixed(0)}%`, position: 'top', fontSize: 10 }} />
                  <Bar dataKey="fpr" onClick={(d) => setActive(d.key)} cursor="pointer">
                    {bars.map((b) => (
                      <Cell key={b.key} fill={b.key === active ? 'var(--accent)' : '#d8d4cd'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="note">点柱子看该策略的停止日分布。虚线是理论 α。</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>策略</th><th>假阳性率</th><th>是 α 的几倍</th><th>提前停止</th></tr>
                </thead>
                <tbody>
                  {STRATEGIES.map((s) => {
                    const r = result.results[s.key];
                    const x = r.falsePositiveRate / alpha;
                    return (
                      <tr key={s.key} className={s.key === active ? 'hl' : ''}
                        onClick={() => setActive(s.key)} style={{ cursor: 'pointer' }}>
                        <td>{s.label}</td>
                        <td className="num">{(r.falsePositiveRate * 100).toFixed(2)}%</td>
                        <td className="num" style={{ color: x > 1.5 ? 'var(--accent)' : 'inherit' }}>
                          {x.toFixed(1)}×
                        </td>
                        <td className="num">{r.nStopped}/{nTrials}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {result && activeResult && (
        <section className="panel wide">
          <h2>「{STRATEGIES.find((s) => s.key === active)?.label}」在第几天停的</h2>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={stopDist} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="#eee" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis width={44} />
                <Tooltip formatter={(v) => `${v} 次`} />
                <Bar dataKey="count" fill="var(--accent-2, #4a6fa5)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="note">
            {active === 'peeking' ? (
              <>
                这是偷看最阴的地方 —— 大部分假阳性都是<strong>早停</strong>出来的：
                实验前几天数据少、噪声大，特别容易偶然撞出 p &lt; {alpha}。
                停得越早，越可能什么都说明不了，但你会以为「效果很明显」。
                跑满 {days} 天却一次都没显著的比例大约 {(100 - activeResult.falsePositiveRate * 100).toFixed(1)}%。
              </>
            ) : (
              <>这个策略下提前停止的次数少得多，因为门槛被抬高了。</>
            )}
          </p>
        </section>
      )}
    </div>
  );
}
