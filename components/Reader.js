'use client';
import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ErrorBar, Cell,
} from 'recharts';
import { zTest, newcombeInterval, waldInterval, interpret, businessValue, fmtPct } from '@/lib/stats';

export default function Reader() {
  const [nControl, setNControl] = useState(5000);
  const [xControl, setXControl] = useState(400);
  const [nTreatment, setNTreatment] = useState(5000);
  const [xTreatment, setXTreatment] = useState(455);
  const [alpha, setAlpha] = useState(0.05);
  const [value, setValue] = useState(30);
  const [monthlyTraffic, setMonthlyTraffic] = useState(150000);

  const r = useMemo(() => {
    if (nControl <= 0 || nTreatment <= 0 || xControl > nControl || xTreatment > nTreatment) return null;
    try {
      const test = zTest({ n1: nControl, x1: xControl, n2: nTreatment, x2: xTreatment });
      const ci = newcombeInterval({ n1: nControl, x1: xControl, n2: nTreatment, x2: xTreatment, alpha });
      const wald = waldInterval({ n1: nControl, x1: xControl, n2: nTreatment, x2: xTreatment, alpha });
      const verdict = interpret({ n1: nControl, x1: xControl, n2: nTreatment, x2: xTreatment, alpha });
      const money = businessValue({ ciAbs: ci, monthlyTraffic, valuePerConversion: value });
      return { test, ci, wald, verdict, money };
    } catch (e) {
      return { error: e.message };
    }
  }, [nControl, xControl, nTreatment, xTreatment, alpha, value, monthlyTraffic]);

  const ciChart = r?.ci
    ? [
        { name: '对照组', rate: r.test.p1 * 100, lo: 0, hi: 0, isControl: true },
        { name: '实验组', rate: r.test.p2 * 100, lo: 0, hi: 0, isControl: false },
      ]
    : [];

  const diffChart = r?.ci
    ? [{
        name: '提升（绝对）',
        diff: r.test.absDiff * 100,
        err: [
          (r.test.absDiff - r.ci[0]) * 100,
          (r.ci[1] - r.test.absDiff) * 100,
        ],
      }]
    : [];

  const fmtMoney = (v) => {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)} 亿`;
    if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)} 万`;
    return `${sign}${abs.toFixed(0)}`;
  };

  return (
    <>
      <div className="grid">
        <section className="panel">
          <h2>实验数据</h2>
          <div className="row">
            <label className="field">
              <span>对照组样本量</span>
              <input type="number" min="1" value={nControl} onChange={(e) => setNControl(+e.target.value)} />
            </label>
            <label className="field">
              <span>对照组转化数</span>
              <input type="number" min="0" value={xControl} onChange={(e) => setXControl(+e.target.value)} />
            </label>
          </div>
          <div className="row">
            <label className="field">
              <span>实验组样本量</span>
              <input type="number" min="1" value={nTreatment} onChange={(e) => setNTreatment(+e.target.value)} />
            </label>
            <label className="field">
              <span>实验组转化数</span>
              <input type="number" min="0" value={xTreatment} onChange={(e) => setXTreatment(+e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>α</span>
            <input type="number" step="0.01" min="0.001" max="0.2" value={alpha} onChange={(e) => setAlpha(+e.target.value)} />
          </label>
          <hr />
          <h2 style={{ marginTop: 14 }}>业务换算</h2>
          <div className="row">
            <label className="field">
              <span>单次转化价值（元）</span>
              <input type="number" min="0" step="1" value={value} onChange={(e) => setValue(+e.target.value)} />
            </label>
            <label className="field">
              <span>月流量（人）</span>
              <input type="number" min="0" step="1000" value={monthlyTraffic} onChange={(e) => setMonthlyTraffic(+e.target.value)} />
            </label>
          </div>
          <p className="note">换算只用于演示口径，实际请按你的业务填。</p>
        </section>

        <section className="panel">
          <h2>结论</h2>
          {!r && <p className="err">输入不合法：转化数不能大于样本量。</p>}
          {r?.error && <p className="err">{r.error}</p>}
          {r && !r.error && (
            <>
              <div className={`verdict v-${r.verdict.verdict}`}>
                <div className="verdict-t">{r.verdict.title}</div>
                <ul>
                  {r.verdict.reasons.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
              <div className="kv">
                <div><span>对照组</span><b>{(r.test.p1 * 100).toFixed(3)}%</b></div>
                <div><span>实验组</span><b>{(r.test.p2 * 100).toFixed(3)}%</b></div>
                <div><span>绝对提升</span><b>{fmtPct(r.test.absDiff)}</b></div>
                <div><span>相对提升</span><b>{fmtPct(r.test.relDiff, 1)}</b></div>
                <div><span>p 值</span><b>{r.test.pValue < 0.0001 ? '<0.0001' : r.test.pValue.toFixed(4)}</b></div>
                <div>
                  <span>95% CI（Newcombe）</span>
                  <b>[{fmtPct(r.ci[0])}, {fmtPct(r.ci[1])}]</b>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {r && !r.error && (
        <div className="grid" style={{ marginTop: 20 }}>
          <section className="panel">
            <h2>提升的置信区间</h2>
            <div style={{ width: '100%', height: 160 }}>
              <ResponsiveContainer>
                <BarChart data={diffChart} layout="vertical" margin={{ top: 8, right: 40, bottom: 8, left: 8 }}>
                  <CartesianGrid stroke="#eee" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <ReferenceLine x={0} stroke="var(--muted)" />
                  <Bar dataKey="diff" fill="var(--accent)" barSize={26}>
                    <ErrorBar dataKey="err" width={6} strokeWidth={1.6} stroke="var(--text)" direction="x" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="note">
              误差棒是 95% 置信区间。区间不跨 0 才叫显著。
              这里用 Newcombe 方法（基于 Wilson），小样本和极端转化率下比正态近似稳 ——
              正态近似给出的区间是 [{fmtPct(r.wald[0])}, {fmtPct(r.wald[1])}]，你可以对比着看差多少。
            </p>
          </section>

          <section className="panel">
            <h2>折算成月增量收入</h2>
            {r.money && (
              <>
                <div className="stat">
                  <div className="stat-v">¥{fmtMoney(r.money.low)} ～ ¥{fmtMoney(r.money.high)}</div>
                  <div className="stat-l">
                    {monthlyTraffic.toLocaleString()} 人/月 × 单次价值 ¥{value}
                  </div>
                </div>
                <p className="note">
                  用置信区间的<strong>下界和上界</strong>，不是点估计。下界 ¥{fmtMoney(r.money.low)}
                  是你「最保守情况下也至少要拿到」的增量 ——
                  决定要不要全量，看下界，不看那个好看的点估计。
                  {r.money.low < 0 && ' 注意下界是负的：最坏情况下这个改动可能是亏的。'}
                </p>
              </>
            )}
          </section>
        </div>
      )}

      {r && !r.error && (
        <section className="panel wide" style={{ marginTop: 20 }}>
          <h2>两组转化率对照</h2>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={ciChart} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} width={52} />
                <Tooltip formatter={(v) => `${v.toFixed(3)}%`} />
                <Bar dataKey="rate" barSize={70}>
                  {ciChart.map((d) => (
                    <Cell key={d.name} fill={d.isControl ? '#b9b4ac' : 'var(--accent)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </>
  );
}
