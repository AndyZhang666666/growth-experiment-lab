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
    if (![nControl, nTreatment, xControl, xTreatment].every(Number.isSafeInteger) ||
        nControl <= 0 || nTreatment <= 0 || xControl < 0 || xTreatment < 0 ||
        xControl > nControl || xTreatment > nTreatment || !Number.isFinite(alpha) || alpha <= 0 || alpha >= 1 ||
        !Number.isFinite(value) || value < 0 || !Number.isFinite(monthlyTraffic) || monthlyTraffic < 0) return null;
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
          {!r && <p className="err" role="alert">请检查输入：样本量需为正整数，转化数需为 0 到样本量之间的整数，α 在 0 与 1 之间，业务参数不可为负。</p>}
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
                  <span>{Math.round((1 - alpha) * 100)}% CI（Newcombe）</span>
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
              误差棒是 {Math.round((1 - alpha) * 100)}% 置信区间，用来描述提升估计的不确定性，不是收益保证。
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
                  这里将提升区间乘以假设流量和单次价值，得到收入情景范围，不是未来保底收益，也不是净利润。
                  置信区间下界不能解释为至少能拿到的金额；尚未扣除实施成本，也未考虑流量和客群变化。
                  {r.money.low < 0 && ' 区间包含负向变化，扩大流量前需要特别谨慎。'}
                </p>
                <h3 style={{ marginTop: 18 }}>上线前还要核对</h3>
                <ul className="note">
                  <li>分流是否随机，样本比例、埋点和预定停止规则是否正常。</li>
                  <li>留存、退款、投诉及资源成本等护栏是否可接受。</li>
                  <li>扣除实施成本后，是否超过事先约定的最低业务收益。</li>
                </ul>
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
