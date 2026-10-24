"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from "recharts";
import { validatePeekingConfig, STRATEGIES } from "@/lib/peeking";
import { downloadJSON } from "@/lib/workflow";

// 默认参数与 scripts/peeking-sim.mjs 完全一致，跑出来的假阳性率也应该一致
const DEFAULTS = {
  seed: 20260913,
  nTrials: 2000,
  days: 14,
  nPerDay: 500,
  trueP: 0.1,
  alpha: 0.05,
};

export default function Peeking() {
  const [nTrials, setNTrials] = useState(DEFAULTS.nTrials);
  const [days, setDays] = useState(DEFAULTS.days);
  const [nPerDay, setNPerDay] = useState(DEFAULTS.nPerDay);
  const [truePct, setTruePct] = useState(DEFAULTS.trueP * 100);
  const [alpha, setAlpha] = useState(DEFAULTS.alpha);
  const [seed, setSeed] = useState(DEFAULTS.seed);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [active, setActive] = useState("peeking");
  const worker = useRef(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const inputConfig = {
    seed,
    nTrials,
    days,
    nPerDay,
    trueP: truePct / 100,
    alpha,
  };
  const stale =
    (!!result &&
      ["seed", "nTrials", "days", "nPerDay", "alpha"].some(
        (k) => result.config[k] !== inputConfig[k],
      )) ||
    (!!result && result.config.trueConversionRate !== truePct / 100);
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
    setProgress("本轮已取消，没有生成新结果。");
  };

  const run = useCallback(() => {
    try {
      validatePeekingConfig({
        seed,
        nTrials,
        days,
        nPerDay,
        trueP: truePct / 100,
        alpha,
      });
    } catch (e) {
      setProgress(e.message);
      return;
    }
    worker.current?.terminate();
    setRunning(true);
    setProgress("工作线程正在计算；可取消或切换工作区。");
    try {
      const w = new Worker(
        new URL("../lib/peeking.worker.js", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      w.onmessage = (e) => {
        if (worker.current !== w) return;
        const m = e.data;
        if (m.type === "progress")
          setProgress(
            `${STRATEGIES.find((s) => s.key === m.strategy)?.label}：${m.done}/${m.total}`,
          );
        else {
          if (m.type === "result") {
            setResult(m.result);
            setProgress("本组模拟完成，结果按下方参数解释。");
          } else setProgress(m.message);
          setRunning(false);
          w.terminate();
          worker.current = null;
        }
      };
      w.onerror = () => {
        if (worker.current !== w) return;
        setProgress(
          "计算线程无法运行，请刷新后重试；不会在主线程强行运行大任务。",
        );
        setRunning(false);
        w.terminate();
        worker.current = null;
      };
      w.postMessage({
        seed,
        nTrials,
        days,
        nPerDay,
        trueP: truePct / 100,
        alpha,
      });
    } catch {
      setProgress("当前环境无法创建计算线程，请换用支持 Worker 的浏览器。");
      setRunning(false);
    }
  }, [seed, nTrials, days, nPerDay, truePct, alpha]);

  const bars = result
    ? STRATEGIES.map((s) => ({
        key: s.key,
        label: s.label,
        fpr: +(result.results[s.key].falsePositiveRate * 100).toFixed(2),
      }))
    : [];

  const stopDist =
    result && active
      ? Array.from({ length: result.config.days }, (_, i) => {
          const d = i + 1;
          const hit = result.results[active].stopDayDistribution.find(
            (x) => x.day === d,
          );
          return { day: `D${d}`, count: hit ? hit.count : 0 };
        })
      : [];

  const activeResult = result ? result.results[active] : null;

  return (
    <div className="grid">
      <section className="panel">
        <h2>模拟设置</h2>
        <p className="note" style={{ marginTop: 0 }}>
          两组的<strong>真实转化率设成完全一样</strong>
          （零效应）。任何「显著」都是假阳性 —— 固定计划检验以 α
          为参考，反复按原门槛查看可能抬高误报；保守校正不要求恰好等于 α。OBF
          型示例固定 c=2，未随 α 校准，不是正式序贯检验。
        </p>
        <div className="row">
          <label className="field">
            <span>模拟次数 N</span>
            <input
              type="number"
              min="100"
              max="5000"
              step="100"
              value={nTrials}
              onChange={(e) => setNTrials(+e.target.value)}
            />
          </label>
          <label className="field">
            <span>实验天数 T</span>
            <input
              type="number"
              min="2"
              max="30"
              step="1"
              value={days}
              onChange={(e) => setDays(+e.target.value)}
            />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>每天每组人数</span>
            <input
              type="number"
              min="50"
              max="5000"
              step="50"
              value={nPerDay}
              onChange={(e) => setNPerDay(+e.target.value)}
            />
          </label>
          <label className="field">
            <span>真实转化率（%）</span>
            <input
              type="number"
              min="0.5"
              max="50"
              step="0.5"
              value={truePct}
              onChange={(e) => setTruePct(+e.target.value)}
            />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>α</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="0.2"
              value={alpha}
              onChange={(e) => setAlpha(+e.target.value)}
            />
          </label>
          <label className="field">
            <span>随机种子</span>
            <input
              type="number"
              step="1"
              value={seed}
              onChange={(e) => setSeed(+e.target.value)}
            />
          </label>
        </div>
        <button className="btn" onClick={run} disabled={running}>
          {running ? "跑模拟中…" : "跑模拟"}
        </button>
        {running && (
          <button className="secondary" onClick={cancel}>
            取消本轮模拟
          </button>
        )}
        {result && (
          <button
            className="secondary"
            disabled={running || stale}
            onClick={() =>
              downloadJSON("peeking-simulation.json", {
                schemaVersion: 1,
                ...result,
                limits: [
                  "合成零效应模拟，不是实际用户结果。",
                  "OBF 型边界固定 c=2，未按输入 α 校准。",
                  "仅描述这些策略与参数，不构成通用误报率承诺。",
                ],
              })
            }
          >
            导出模拟记录
          </button>
        )}
        {progress && (
          <p className="note" role="status">
            {progress}
          </p>
        )}
        {nTrials * days * 4 > 400000 && (
          <p className="note warn-text">
            参数偏大：{nTrials} × {days} 天 × 2 组 × 4
            策略，浏览器里可能要等几秒。
          </p>
        )}
      </section>

      <section className="panel">
        <h2>假阳性率对比</h2>
        {!result && (
          <p className="note">
            运行一次零效应模拟，比较检查策略。页面尚未生成本组结果，不预先把示例数字当作当前输出。
          </p>
        )}
        {result && (
          <>
            <p className="note" role="status">
              {stale
                ? "输入已改变；以下仍是上一组结果，需重新运行。"
                : "本组参数："}
              种子 {result.config.seed} · {result.config.nTrials} 次 ·{" "}
              {result.config.days} 天 · 每组每日 {result.config.nPerDay} 人 ·
              真值 {result.config.trueConversionRate * 100}% · α=
              {result.config.alpha}
            </p>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart
                  data={bars}
                  layout="vertical"
                  margin={{ top: 4, right: 32, bottom: 4, left: 8 }}
                >
                  <CartesianGrid stroke="#eee" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, "dataMax"]}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={150}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <ReferenceLine
                    x={result.config.alpha * 100}
                    stroke="var(--muted)"
                    strokeDasharray="4 4"
                    label={{
                      value: `α=${(result.config.alpha * 100).toFixed(0)}%`,
                      position: "top",
                      fontSize: 10,
                    }}
                  />
                  <Bar
                    dataKey="fpr"
                    isAnimationActive={false}
                    onClick={(d) => setActive(d.key)}
                    cursor="pointer"
                  >
                    {bars.map((b) => (
                      <Cell
                        key={b.key}
                        fill={b.key === active ? "var(--accent)" : "#d8d4cd"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="note">点柱子看该策略的停止日分布。虚线是理论 α。</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>策略</th>
                    <th>假阳性率</th>
                    <th>是 α 的几倍</th>
                    <th>提前停止</th>
                  </tr>
                </thead>
                <tbody>
                  {STRATEGIES.map((s) => {
                    const r = result.results[s.key];
                    const x = r.falsePositiveRate / result.config.alpha;
                    return (
                      <tr key={s.key} className={s.key === active ? "hl" : ""}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setActive(s.key)}
                            aria-pressed={s.key === active}
                          >
                            {s.label}
                          </button>
                        </td>
                        <td className="num">
                          {(r.falsePositiveRate * 100).toFixed(2)}%
                        </td>
                        <td
                          className="num"
                          style={{
                            color: x > 1.5 ? "var(--accent)" : "inherit",
                          }}
                        >
                          {x.toFixed(1)}×
                        </td>
                        <td className="num">
                          {r.nEarlyStopped}/{result.config.nTrials}
                        </td>
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
          <h2>
            「{STRATEGIES.find((s) => s.key === active)?.label}」在第几天停的
          </h2>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart
                data={stopDist}
                margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
              >
                <CartesianGrid stroke="#eee" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis width={44} />
                <Tooltip formatter={(v) => `${v} 次`} />
                <Bar
                  dataKey="count"
                  isAnimationActive={false}
                  fill="var(--accent)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="note">
            {active === "peeking" ? (
              <>
                这是偷看最阴的地方 —— 大部分假阳性都是<strong>早停</strong>
                出来的： 在这组零效应模拟里，反复检查可能偶然撞出 p &lt;{" "}
                {result.config.alpha}。
                停得越早，越可能什么都说明不了，但你会以为「效果很明显」。 跑满{" "}
                {result.config.days} 天却一次都没显著的比例为{" "}
                {(100 - activeResult.falsePositiveRate * 100).toFixed(1)}%。
              </>
            ) : (
              <>
                只在结束时检查的策略在最后一天记录停止；其他策略的次数由本组模拟产生，不能据此承诺实际实验的误报率。
              </>
            )}
          </p>
        </section>
      )}
    </div>
  );
}
