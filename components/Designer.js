"use client";
import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceDot,
} from "recharts";
import { sampleSize, daysNeeded, mdeForDays } from "@/lib/stats";
import { useDraft } from "@/lib/use-draft";
import { DEFAULT_DESIGN, downloadJSON } from "@/lib/workflow";

export default function Designer() {
  const { values, set, reset, status } = useDraft("design", DEFAULT_DESIGN);
  const {
    baselinePct,
    mdeValue,
    mdeType,
    alpha,
    power,
    dailyTraffic,
    ratio,
    daysBudget,
  } = values;
  const setBaselinePct = (v) => set("baselinePct", v),
    setMdeValue = (v) => set("mdeValue", v),
    setMdeType = (v) => set("mdeType", v),
    setAlpha = (v) => set("alpha", v),
    setPower = (v) => set("power", v),
    setDailyTraffic = (v) => set("dailyTraffic", v),
    setRatio = (v) => set("ratio", v),
    setDaysBudget = (v) => set("daysBudget", v);

  const baseline = baselinePct / 100;
  const mde = mdeValue / 100;

  const result = useMemo(() => {
    try {
      const s = sampleSize({ baseline, mde, mdeType, alpha, power, ratio });
      const days = daysNeeded({ ...s, dailyTraffic, ratio });
      const reverse = mdeForDays({
        baseline,
        days: daysBudget,
        dailyTraffic,
        ratio,
        alpha,
        power,
      });
      return { s, days, reverse, error: null };
    } catch (e) {
      return { error: e.message };
    }
  }, [baseline, mde, mdeType, alpha, power, dailyTraffic, ratio, daysBudget]);

  // MDE 曲线：0.5% 一路拉到 10%，或者拉到当前 MDE 的 1.2 倍（保证红点一定在视野里）
  const curve = useMemo(() => {
    const absDelta = mdeType === "relative" ? baseline * mde : mde;
    const top = Math.max(0.05, Math.min(absDelta * 1.2, 0.5));
    const pts = [];
    for (let i = 1; i <= 20; i++) {
      const m = (top * i) / 20;
      try {
        const s = sampleSize({
          baseline,
          mde: m,
          mdeType: "absolute",
          alpha,
          power,
          ratio,
        });
        pts.push({ mde: +(m * 100).toFixed(3), n: s.nControl });
      } catch {
        /* p₂ 越界，跳过 */
      }
    }
    return pts;
  }, [baseline, mde, mdeType, alpha, power, ratio]);

  const currentPoint =
    result.s && Number.isFinite(result.s.nControl)
      ? {
          mde: +(result.s.delta * 100).toFixed(2),
          n: result.s.nControl,
          days: result.days,
        }
      : null;

  return (
    <div className="grid">
      <section className="panel">
        <h2>输入</h2>
        <p className="note" role="status">
          {status}
        </p>
        <div className="actions">
          <button type="button" onClick={reset}>
            恢复示例设计
          </button>
          <button
            type="button"
            disabled={!!result.error}
            onClick={() =>
              downloadJSON("experiment-plan.json", {
                schemaVersion: 1,
                kind: "design-plan",
                inputs: values,
                outputs: {
                  samples: result.s,
                  estimatedDays: result.days,
                  budgetMde: result.reverse,
                },
                limits: [
                  "规划假设，不是实际实验结果。",
                  "固定样本设计；应预先约定随机分流、停止规则、业务门槛与护栏。",
                  "时间只是按流量计算的近似，还需覆盖业务周期；不是检出承诺。",
                ],
              })
            }
          >
            导出设计计划
          </button>
        </div>
        <label className="field">
          <span>基线转化率（%）</span>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="90"
            value={baselinePct}
            onChange={(e) => setBaselinePct(+e.target.value)}
          />
        </label>
        <label className="field">
          <span>最小可检测提升 MDE</span>
          <div className="row">
            <input
              aria-label="最小可检测提升 MDE"
              type="number"
              step="0.5"
              min="0.1"
              value={mdeValue}
              onChange={(e) => setMdeValue(+e.target.value)}
            />
            <select
              aria-label="MDE 类型"
              value={mdeType}
              onChange={(e) => setMdeType(e.target.value)}
            >
              <option value="relative">相对（%）</option>
              <option value="absolute">绝对（百分点）</option>
            </select>
          </div>
        </label>
        <div className="row">
          <label className="field">
            <span>α</span>
            <input
              type="number"
              step="0.01"
              min="0.001"
              max="0.2"
              value={alpha}
              onChange={(e) => setAlpha(+e.target.value)}
            />
          </label>
          <label className="field">
            <span>power</span>
            <input
              type="number"
              step="0.05"
              min="0.5"
              max="0.99"
              value={power}
              onChange={(e) => setPower(+e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span>日流量（人/天，两组合计）</span>
          <input
            type="number"
            step="100"
            min="100"
            value={dailyTraffic}
            onChange={(e) => setDailyTraffic(+e.target.value)}
          />
        </label>
        <label className="field">
          <span>实验组流量占比（{(ratio * 100).toFixed(0)}%）</span>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={ratio}
            onChange={(e) => setRatio(+e.target.value)}
          />
        </label>
        <label className="field">
          <span>时间预算（天）</span>
          <input
            type="number"
            step="1"
            min="1"
            max="60"
            value={daysBudget}
            onChange={(e) => setDaysBudget(+e.target.value)}
          />
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
              <div className="stat-l">
                实验组需要样本量（占比 {(ratio * 100).toFixed(0)}%）
              </div>
            </div>
            <div className="stat">
              <div className="stat-v">{result.days} 天</div>
              <div className="stat-l">
                按 {dailyTraffic.toLocaleString()} 人/天 预计需要
              </div>
            </div>
            <hr />
            <div className="stat">
              <div className="stat-v">{fmtPct(result.reverse)}</div>
              <div className="stat-l">
                {daysBudget} 天预算下的近似最小绝对提升
                <br />
                （等价于相对提升{" "}
                {baseline > 0 && Number.isFinite(result.reverse)
                  ? fmtPct(result.reverse / baseline)
                  : "—"}
                ）
              </div>
            </div>
            <p className="note">
              目标提升是 {fmtPct(result.s.delta)} 绝对提升。
              {result.reverse === null
                ? "本次时间预算太少，未找到有效范围内可检出的提升。"
                : `时间预算 ${daysBudget} 天时，近似门槛为 ${fmtPct(result.reverse)}；这不是检出承诺。`}
            </p>
          </>
        )}
      </section>

      <section className="panel wide">
        <h2>MDE 曲线 —— 想检出更小的提升，样本量涨得多凶</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart
              data={curve}
              margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            >
              <CartesianGrid stroke="#eee" />
              <XAxis
                dataKey="mde"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => `${v}%`}
                label={{
                  value: "绝对提升 MDE",
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 11,
                }}
              />
              <YAxis tickFormatter={fmtAxis} width={52} />
              <Tooltip
                formatter={(v) => [fmtNum(v), "对照组样本量"]}
                labelFormatter={(v) => `MDE ${v}%`}
              />
              <Line
                type="linear"
                dataKey="n"
                stroke="var(--accent)"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              {currentPoint && (
                <ReferenceDot
                  x={currentPoint.mde}
                  y={currentPoint.n}
                  r={4}
                  fill="var(--accent)"
                  stroke="#fff"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="note">
          在其余条件近似不变时，样本量大致按 1/MDE²
          增长：想检出一半的提升，样本量约需 4 倍。
          红点是当前设计的对照组样本量。实际规划还需覆盖业务周期、用户独立性与指标延迟。
        </p>
      </section>
    </div>
  );
}

function fmtNum(v) {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString();
}
function fmtPct(v, d = 2) {
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(d)}%`;
}
function fmtAxis(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return String(v);
}
