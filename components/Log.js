'use client';
import { useState, useMemo } from 'react';
import data from '@/data/experiments.json';
import { fmtPct } from '@/lib/stats';

const DECISION_CLASS = {
  '全量': 'd-ship',
  '不推': 'd-no',
  '继续跑': 'd-cont',
  '回滚': 'd-roll',
};

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: '全量', label: '全量' },
  { key: '不推', label: '不推' },
  { key: '继续跑', label: '继续跑' },
  { key: '回滚', label: '回滚' },
];

export default function Log() {
  const [filter, setFilter] = useState('all');

  const experiments = data.experiments;
  const rows = useMemo(
    () => (filter === 'all' ? experiments : experiments.filter((e) => e.decision === filter)),
    [filter, experiments],
  );

  const counts = useMemo(() => {
    const c = { 全量: 0, 不推: 0, 继续跑: 0, 回滚: 0 };
    for (const e of experiments) c[e.decision]++;
    return c;
  }, [experiments]);

  return (
    <>
      <section className="panel" style={{ marginBottom: 20 }}>
        <h2>台账概览</h2>
        <p className="note" style={{ marginTop: 0 }}>
          {experiments.length} 个合成实验，场景虚构，用来展示「一个增长 PM 的实验日志长什么样」。
          <br />
          值得留意的是里面有几条是<strong>「不推」</strong>和<strong>「显著但不值得」</strong> ——
          真实台账里这类结论占多数，只记成功案例的日志没有参考价值。
        </p>
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.key}
              className={`chip ${filter === f.key ? 'on' : ''}`}
              onClick={() => setFilter(f.key)}>
              {f.label}
              {f.key !== 'all' && <em> {counts[f.key]}</em>}
            </button>
          ))}
        </div>
      </section>

      {rows.map((e) => {
        const s = e.stats;
        const sig = s.pValue < 0.05;
        return (
          <article className="panel exp" key={e.id}>
            <header className="exp-h">
              <div>
                <span className="exp-id">{e.id}</span>
                <span className={`tag ${DECISION_CLASS[e.decision]}`}>{e.decision}</span>
                {!sig && <span className="tag t-ns">不显著</span>}
              </div>
              <span className="exp-days">{e.days} 天</span>
            </header>

            <p className="exp-hyp">{e.hypothesis}</p>

            <div className="exp-grid">
              <div>
                <span className="lbl">主指标</span>
                <span>{e.metric}</span>
              </div>
              <div>
                <span className="lbl">护栏指标</span>
                <span>{e.guardRail}</span>
              </div>
              <div>
                <span className="lbl">样本</span>
                <span>
                  对照组 {e.nControl.toLocaleString()}（{e.xControl}）/ 实验组 {e.nTreatment.toLocaleString()}（{e.xTreatment}）
                </span>
              </div>
              <div>
                <span className="lbl">结果</span>
                <span>
                  {fmtPct(s.pControl, 2)} → {fmtPct(s.pTreatment, 2)}
                  {'　'}
                  <b>{fmtPct(s.absDiff, 2)}</b>
                  {'　'}
                  p = {s.pValue < 0.0001 ? '<0.0001' : s.pValue.toFixed(4)}
                  {'　'}
                  CI [{fmtPct(s.ci95[0], 2)}, {fmtPct(s.ci95[1], 2)}]
                </span>
              </div>
            </div>

            <div className="exp-review">
              <span className="lbl">复盘</span>
              <p>{e.review}</p>
            </div>
          </article>
        );
      })}
      {rows.length === 0 && <p className="note">这个筛选下没有实验。</p>}
    </>
  );
}
