// 偷看惩罚模拟器。证明一个经典错误：每天都看实验结果、一显著就停，会让假阳性率飙到 20-40%。
// 跑：npm run sim:peeking，产物：results/peeking-sim.json（含假阳性率、停止日分布）

import { writeFileSync, mkdirSync } from 'node:fs';
import { mulberry32, binomial, zTest } from '../lib/stats.js';

// 模拟配置
const SEED = 20260913; // 固定种子，保证结果可复现
const N_TRIALS = 2000; // 蒙特卡洛次数
const T = 14; // 每个实验跑 14 天
const N_PER_DAY = 500; // 每天每组各 500 人
const TRUE_P = 0.10; // A/B 两组真实转化率都是 10%，即零效应
const ALPHA = 0.05;

// O'Brien-Fleming 边界的近似：第 k 次（共 K 次）检查用 c·√(K/k)，c ≈ 2
// 真正的 OBF 常数要解多元正态积分，这里用 2.0 近似
const OBF_C = 2.0;

function obfBoundary(K, k) {
  return OBF_C * Math.sqrt(K / k);
}

// Bonferroni：K 次检查，每次用 z_{1-α/(2K)}
function bonferroniBoundary(K, alpha = ALPHA) {
  // 简化：直接用 Bonferroni 的 z 值
  // z_{1-0.05/28} = z_{0.99821} ≈ 2.914
  const p = 1 - alpha / (2 * K);
  // 用 normalQuantile 会引入循环依赖，这里直接手算或用 2.914（K=14）
  // 为简化直接用近似：对 α/2K 很小时，z ≈ √(2·ln(2K/α))
  return Math.sqrt(2 * Math.log(2 * K / alpha));
}

function runTrial(rng, strategy) {
  // 模拟一次实验，返回 { falsePos: boolean, stoppedDay: number | null }
  // strategy: 'final' | 'peeking' | 'obf' | 'bonferroni'
  const K = T;
  let cumA = 0;
  let cumB = 0;
  let nA = 0;
  let nB = 0;

  for (let day = 1; day <= T; day++) {
    // 每天抽样
    cumA += binomial(rng, N_PER_DAY, TRUE_P);
    cumB += binomial(rng, N_PER_DAY, TRUE_P);
    nA += N_PER_DAY;
    nB += N_PER_DAY;

    if (strategy === 'final') {
      // 只在最后一天检查
      if (day === T) {
        const t = zTest({ n1: nA, x1: cumA, n2: nB, x2: cumB });
        return { falsePos: t.pValue < ALPHA, stoppedDay: T };
      }
    } else if (strategy === 'peeking') {
      // 每天都看，一显著就停
      const t = zTest({ n1: nA, x1: cumA, n2: nB, x2: cumB });
      if (t.pValue < ALPHA) {
        return { falsePos: true, stoppedDay: day };
      }
    } else if (strategy === 'obf') {
      // O'Brien-Fleming 边界
      const t = zTest({ n1: nA, x1: cumA, n2: nB, x2: cumB });
      const boundary = obfBoundary(K, day);
      if (Math.abs(t.z) >= boundary) {
        return { falsePos: true, stoppedDay: day };
      }
    } else if (strategy === 'bonferroni') {
      // Bonferroni 边界
      const t = zTest({ n1: nA, x1: cumA, n2: nB, x2: cumB });
      const boundary = bonferroniBoundary(K);
      if (Math.abs(t.z) >= boundary) {
        return { falsePos: true, stoppedDay: day };
      }
    }
  }
  // 跑完 T 天仍不显著
  return { falsePos: false, stoppedDay: null };
}

console.log(`运行偷看惩罚模拟：N=${N_TRIALS}, T=${T} 天, 每天每组 ${N_PER_DAY} 人, 真实转化率均为 ${TRUE_P}`);
console.log('模拟三种策略：① 只在结束时看、② 每天偷看一显著就停、③ O\'Brien-Fleming 序贯检验');
console.log('种子：', SEED);

const rng = mulberry32(SEED);
const strategies = ['final', 'peeking', 'obf', 'bonferroni'];
const results = {};

for (const strat of strategies) {
  console.log(`\n策略: ${strat}`);
  let fp = 0;
  const stopDays = [];
  for (let i = 0; i < N_TRIALS; i++) {
    const res = runTrial(rng, strat);
    if (res.falsePos) fp++;
    if (res.stoppedDay !== null) stopDays.push(res.stoppedDay);
    if ((i + 1) % 500 === 0) {
      process.stdout.write(`  ${i + 1}/${N_TRIALS}\r`);
    }
  }
  const fpr = fp / N_TRIALS;
  console.log(`  假阳性率: ${(fpr * 100).toFixed(2)}%  (理论 ${(ALPHA * 100).toFixed(1)}%)  提前停止 ${stopDays.length}/${N_TRIALS}`);
  
  // 统计停止日分布
  const dayDist = Array(T + 1).fill(0);
  for (const d of stopDays) dayDist[d]++;

  results[strat] = {
    falsePositiveRate: fpr,
    expectedFPR: ALPHA,
    nTrials: N_TRIALS,
    nFalsePositives: fp,
    nStopped: stopDays.length,
    stopDayDistribution: dayDist.map((count, day) => ({ day, count, pct: (count / N_TRIALS) * 100 })).filter(x => x.count > 0),
  };
}

const summary = {
  generatedAt: new Date().toISOString(),
  config: {
    seed: SEED,
    nTrials: N_TRIALS,
    days: T,
    nPerDay: N_PER_DAY,
    trueConversionRate: TRUE_P,
    alpha: ALPHA,
  },
  results,
  conclusion: {
    finalOnly: `${(results.final.falsePositiveRate * 100).toFixed(2)}% 假阳性率，符合 α=${ALPHA} 的理论值`,
    peeking: `${(results.peeking.falsePositiveRate * 100).toFixed(2)}% 假阳性率，是理论值的 ${(results.peeking.falsePositiveRate / ALPHA).toFixed(1)} 倍`,
    obf: `${(results.obf.falsePositiveRate * 100).toFixed(2)}% 假阳性率，O'Brien-Fleming 边界能压回接近 ${ALPHA}`,
    bonferroni: `${(results.bonferroni.falsePositiveRate * 100).toFixed(2)}% 假阳性率，Bonferroni 最保守`,
  },
};

mkdirSync('results', { recursive: true });
writeFileSync('results/peeking-sim.json', JSON.stringify(summary, null, 2));
console.log(`\n写入 results/peeking-sim.json`);
console.log(`\n关键结论：`);
console.log(`  final-only:    ${(results.final.falsePositiveRate * 100).toFixed(2)}%`);
console.log(`  peeking:       ${(results.peeking.falsePositiveRate * 100).toFixed(2)}%  ← ${(results.peeking.falsePositiveRate / ALPHA).toFixed(1)}x 理论值`);
console.log(`  OBF:           ${(results.obf.falsePositiveRate * 100).toFixed(2)}%`);
console.log(`  Bonferroni:    ${(results.bonferroni.falsePositiveRate * 100).toFixed(2)}%`);
