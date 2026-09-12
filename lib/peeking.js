// 偷看惩罚的模拟核心。脚本（Node）和页面（浏览器）共用同一份代码，
// 保证 README 里引用的数字和页面上跑出来的数字同源。

import { mulberry32, binomial, zTest, obfBoundary, bonferroniBoundary } from './stats.js';

// 可选的四种检查策略
export const STRATEGIES = [
  { key: 'final', label: '只看一次（结束时）', note: '标准的固定样本量检验' },
  { key: 'peeking', label: '每天偷看，一显著就停', note: '最常见的坏习惯' },
  { key: 'obf', label: "O'Brien-Fleming 序贯边界", note: 'c·√(K/k)，早期门槛高、后期回落' },
  { key: 'bonferroni', label: 'Bonferroni 分摊', note: '每次检查用 α/K，最保守' },
];

export { obfBoundary, bonferroniBoundary };

// 跑一次实验。返回是否假阳性、第几天停的。
function runTrial(rng, strategy, { days, nPerDay, trueP, alpha }) {
  let cumA = 0;
  let cumB = 0;
  for (let day = 1; day <= days; day++) {
    // 抽样顺序固定：先 A 组后 B 组，保证跨平台结果一致
    cumA += binomial(rng, nPerDay, trueP);
    cumB += binomial(rng, nPerDay, trueP);
    const n = day * nPerDay;

    if (strategy === 'final') {
      if (day === days) {
        const t = zTest({ n1: n, x1: cumA, n2: n, x2: cumB });
        return { falsePos: t.pValue < alpha, stoppedDay: days };
      }
    } else if (strategy === 'peeking') {
      const t = zTest({ n1: n, x1: cumA, n2: n, x2: cumB });
      if (t.pValue < alpha) return { falsePos: true, stoppedDay: day };
    } else if (strategy === 'obf') {
      const t = zTest({ n1: n, x1: cumA, n2: n, x2: cumB });
      if (Math.abs(t.z) >= obfBoundary(days, day)) return { falsePos: true, stoppedDay: day };
    } else if (strategy === 'bonferroni') {
      const t = zTest({ n1: n, x1: cumA, n2: n, x2: cumB });
      if (Math.abs(t.z) >= bonferroniBoundary(days, alpha)) return { falsePos: true, stoppedDay: day };
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
  const rng = mulberry32(seed);
  const out = {};

  for (const strategy of strategies) {
    let fp = 0;
    const stopDays = [];
    for (let i = 0; i < nTrials; i++) {
      const r = runTrial(rng, strategy, { days, nPerDay, trueP, alpha });
      if (r.falsePos) fp++;
      if (r.stoppedDay !== null) stopDays.push(r.stoppedDay);
      if (onProgress && (i + 1) % 200 === 0) onProgress(strategy, i + 1, nTrials);
    }
    const dayDist = Array(days + 1).fill(0);
    for (const d of stopDays) dayDist[d]++;
    out[strategy] = {
      falsePositiveRate: fp / nTrials,
      nFalsePositives: fp,
      nStopped: stopDays.length,
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
