// 偷看惩罚模拟器。证明一个经典错误：每天都看实验结果、一显著就停，会让假阳性率飙到 20-40%。
// 跑：npm run sim:peeking，产物：results/peeking-sim.json
//
// 模拟核心在 lib/peeking.js，和页面上「偷看惩罚模拟器」用的是同一份代码 ——
// 页面上跑出的数字和这里写进 results/ 的必须完全一致。

import { writeFileSync, mkdirSync } from 'node:fs';
import { simulatePeeking, STRATEGIES } from '../lib/peeking.js';

const SEED = 20260913; // 固定种子，保证结果可复现
const N_TRIALS = 2000;
const T = 14;
const N_PER_DAY = 500;
const TRUE_P = 0.1; // A/B 两组真实转化率都是 10%，零效应
const ALPHA = 0.05;

console.log(`偷看惩罚模拟：N=${N_TRIALS}, T=${T} 天, 每天每组 ${N_PER_DAY} 人, 两组真实转化率均 ${TRUE_P}`);
console.log(`种子 ${SEED}（可复现）\n`);

let lastStrategy = '';
const sim = simulatePeeking({
  seed: SEED,
  nTrials: N_TRIALS,
  days: T,
  nPerDay: N_PER_DAY,
  trueP: TRUE_P,
  alpha: ALPHA,
  onProgress: (strategy, i, total) => {
    if (strategy !== lastStrategy) {
      lastStrategy = strategy;
      process.stdout.write(`\n策略 ${strategy} ...`);
    }
    if (i % 1000 === 0) process.stdout.write(` ${i}`);
  },
});

const label = Object.fromEntries(STRATEGIES.map((s) => [s.key, s.label]));
for (const [key, r] of Object.entries(sim.results)) {
  console.log(
    `\n${label[key]}: 假阳性率 ${(r.falsePositiveRate * 100).toFixed(2)}%` +
      ` (理论 ${(ALPHA * 100).toFixed(1)}%, ${(r.falsePositiveRate / ALPHA).toFixed(1)}x)` +
      `  提前停止 ${r.nStopped}/${N_TRIALS}`,
  );
}

const out = {
  generatedAt: new Date().toISOString(),
  config: sim.config,
  strategies: STRATEGIES,
  results: sim.results,
  summary: {
    finalOnlyFpr: sim.results.final.falsePositiveRate,
    peekingFpr: sim.results.peeking.falsePositiveRate,
    peekingInflation: sim.results.peeking.falsePositiveRate / ALPHA,
    obfFpr: sim.results.obf.falsePositiveRate,
    bonferroniFpr: sim.results.bonferroni.falsePositiveRate,
  },
};

mkdirSync('results', { recursive: true });
writeFileSync('results/peeking-sim.json', JSON.stringify(out, null, 2));
console.log('\n写入 results/peeking-sim.json');
