// 偷看惩罚的模拟核心。脚本（Node）和页面（浏览器）共用同一份代码，
// 保证 README 里引用的数字和页面上跑出来的数字同源。

import {
  mulberry32,
  binomial,
  zTest,
  obfBoundary,
  bonferroniBoundary,
} from "./stats.js";

// 可选的四种检查策略
export const STRATEGIES = [
  { key: "final", label: "只看一次（结束时）", note: "标准的固定样本量检验" },
  { key: "peeking", label: "每天偷看，一显著就停", note: "最常见的坏习惯" },
  {
    key: "obf",
    label: "OBF 型近似（固定 c=2）",
    note: "c·√(K/k)，未按 α 校准，不是正式序贯设计",
  },
  {
    key: "bonferroni",
    label: "Bonferroni 分摊",
    note: "每次检查用 α/K，最保守",
  },
];

export { obfBoundary, bonferroniBoundary };
export function validatePeekingConfig({
  seed,
  nTrials,
  days,
  nPerDay,
  trueP,
  alpha,
  strategies = STRATEGIES.map((s) => s.key),
}) {
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !Number.isInteger(nTrials) ||
    nTrials < 1 ||
    nTrials > 5000 ||
    !Number.isInteger(days) ||
    days < 2 ||
    days > 30 ||
    !Number.isInteger(nPerDay) ||
    nPerDay < 1 ||
    nPerDay > 5000 ||
    !Number.isFinite(trueP) ||
    trueP <= 0 ||
    trueP >= 1 ||
    !Number.isFinite(alpha) ||
    alpha <= 0 ||
    alpha >= 1
  )
    throw new RangeError(
      "请输入有效整数次数、天数、人数与种子；概率和 α 须在 0 与 1 之间。",
    );
  if (
    !Array.isArray(strategies) ||
    !strategies.length ||
    new Set(strategies).size !== strategies.length ||
    strategies.some((k) => !STRATEGIES.some((s) => s.key === k))
  )
    throw new RangeError("检查策略无效。");
  if (nTrials * days * nPerDay * 2 * strategies.length > 200000000)
    throw new RangeError(
      "本次采样预算过大，请降低次数、天数或每天人数后重试。",
    );
}

// 跑一次实验。返回是否假阳性、第几天停的。
function runTrial(rng, strategy, { days, nPerDay, trueP, alpha }) {
  let cumA = 0;
  let cumB = 0;
  for (let day = 1; day <= days; day++) {
    // 抽样顺序固定：先 A 组后 B 组，保证跨平台结果一致
    cumA += binomial(rng, nPerDay, trueP);
    cumB += binomial(rng, nPerDay, trueP);
    const n = day * nPerDay;

    if (strategy === "final") {
      if (day === days) {
        const t = zTest({ n1: n, x1: cumA, n2: n, x2: cumB });
        return { falsePos: t.pValue < alpha, stoppedDay: days };
      }
    } else if (strategy === "peeking") {
      const t = zTest({ n1: n, x1: cumA, n2: n, x2: cumB });
      if (t.pValue < alpha) return { falsePos: true, stoppedDay: day };
    } else if (strategy === "obf") {
      const t = zTest({ n1: n, x1: cumA, n2: n, x2: cumB });
      if (Math.abs(t.z) >= obfBoundary(days, day))
        return { falsePos: true, stoppedDay: day };
    } else if (strategy === "bonferroni") {
      const t = zTest({ n1: n, x1: cumA, n2: n, x2: cumB });
      if (Math.abs(t.z) >= bonferroniBoundary(days, alpha))
        return { falsePos: true, stoppedDay: day };
    }
  }
  return { falsePos: false, stoppedDay: null };
}

// 蒙特卡洛主循环。两组真实转化率相同 —— 任何「显著」都是假阳性。
export function simulatePeeking({
  seed = 20260913,
  nTrials = 2000,
  days = 14,
  nPerDay = 500,
  trueP = 0.1,
  alpha = 0.05,
  strategies = STRATEGIES.map((s) => s.key),
  onProgress,
} = {}) {
  validatePeekingConfig({
    seed,
    nTrials,
    days,
    nPerDay,
    trueP,
    alpha,
    strategies,
  });
  const rng = mulberry32(seed);
  const out = {};

  for (const strategy of strategies) {
    let fp = 0;
    let earlyStopped = 0;
    const stopDays = [];
    for (let i = 0; i < nTrials; i++) {
      const r = runTrial(rng, strategy, { days, nPerDay, trueP, alpha });
      if (r.falsePos) fp++;
      if (r.stoppedDay !== null) stopDays.push(r.stoppedDay);
      if (r.stoppedDay !== null && r.stoppedDay < days) earlyStopped++;
      if (onProgress && (i + 1) % 200 === 0)
        onProgress(strategy, i + 1, nTrials);
    }
    const dayDist = Array(days + 1).fill(0);
    for (const d of stopDays) dayDist[d]++;
    out[strategy] = {
      falsePositiveRate: fp / nTrials,
      nFalsePositives: fp,
      nStopped: stopDays.length,
      nEarlyStopped: earlyStopped,
      stopDayDistribution: dayDist
        .map((count, day) => ({ day, count, pct: (count / nTrials) * 100 }))
        .filter((x) => x.day > 0 && x.count > 0),
    };
  }

  return {
    config: { seed, nTrials, days, nPerDay, trueConversionRate: trueP, alpha },
    results: out,
  };
}
