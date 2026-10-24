export const DEFAULT_DESIGN = {
  baselinePct: 5,
  mdeValue: 20,
  mdeType: "relative",
  alpha: 0.05,
  power: 0.8,
  dailyTraffic: 4000,
  ratio: 0.5,
  daysBudget: 7,
};
export const DEFAULT_READER = {
  nControl: 5000,
  xControl: 400,
  nTreatment: 5000,
  xTreatment: 455,
  alpha: 0.05,
  value: 30,
  monthlyTraffic: 150000,
};
export function decodeDraft(raw, defaults) {
  try {
    if (!raw || raw.length > 8000) return null;
    const d = JSON.parse(raw);
    if (d.version !== 1 || !d.values || typeof d.values !== "object")
      return null;
    const v = {};
    for (const k of Object.keys(defaults)) {
      const x = d.values[k];
      if (typeof defaults[k] === "number") {
        if (!Number.isFinite(x) || Math.abs(x) > 1e9) return null;
      } else if (k === "mdeType" && !["absolute", "relative"].includes(x))
        return null;
      v[k] = x;
    }
    return v;
  } catch {
    return null;
  }
}
export function releaseReadiness(
  stats,
  { validity = "unknown", guardrails = "unknown", minAbsEffect = 0.005 } = {},
) {
  if (
    !stats?.test ||
    !Array.isArray(stats.ci) ||
    !Number.isFinite(minAbsEffect) ||
    minAbsEffect < 0 ||
    minAbsEffect > 1 ||
    !["unknown", "verified", "issue"].includes(validity) ||
    !["unknown", "pass", "fail"].includes(guardrails)
  )
    throw Error("上线核对参数无效。");
  const checks = [
    {
      label: "实验有效性",
      state:
        validity === "verified"
          ? "pass"
          : validity === "issue"
            ? "fail"
            : "unknown",
    },
    { label: "留存、退款、投诉与成本护栏", state: guardrails },
    {
      label: "提升区间下界超过预设业务门槛",
      state: stats.ci[0] > minAbsEffect ? "pass" : "unknown",
    },
  ];
  const blocked =
    validity === "issue" ||
    guardrails === "fail" ||
    stats.verdict?.verdict === "harm";
  const eligible =
    !blocked &&
    validity === "verified" &&
    guardrails === "pass" &&
    stats.verdict?.verdict === "ship" &&
    stats.ci[0] > minAbsEffect;
  return {
    state: blocked ? "blocked" : eligible ? "eligible" : "review",
    title: blocked
      ? "先处理风险，不扩大流量"
      : eligible
        ? "可讨论分阶段上线，不是自动全量"
        : "暂不全量，仍有条件待核对",
    checks,
    manualChecks: true,
    minAbsEffect,
  };
}
export function readerSnapshot(inputs, stats, gates) {
  return {
    schemaVersion: 1,
    kind: "experiment-readout",
    modelVersion: "bounded-decision-v2",
    inputs,
    statistics: {
      test: stats.test,
      ci: stats.ci,
      interpretation: stats.verdict,
      moneyScenario: stats.money,
    },
    readiness: releaseReadiness(stats, gates),
    limits: [
      "默认输入为合成示例，不是已发生业务结果。",
      "上线核对为用户手动填写，不是系统验证。",
      "收入范围是条件情景，不是保底收入或净利润。",
      "不显著不是无效证明；不按观测效果临时延长固定样本实验。",
    ],
  };
}
export function downloadJSON(name, data) {
  const a = document.createElement("a"),
    u = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
