// Power 校验：按公式算出的样本量，真去模拟 1000 次看 power 是否≈0.8。
// 跑：npm run sim:power，产物：results/power-check.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { mulberry32, binomial, zTest, sampleSize } from '../lib/stats.js';

const SEED = 20260914;
const N_TRIALS = 1000;
const BASELINE = 0.08;
const MDE = 0.02; // 绝对提升 2 个点
const ALPHA = 0.05;
const POWER = 0.8;

console.log(`Power 校验：baseline=${BASELINE}, MDE=${MDE}, α=${ALPHA}, power=${POWER}`);
console.log(`按公式算样本量，再模拟 ${N_TRIALS} 次看实际检出率是否≈${POWER}`);

// 按公式算每组样本量
const design = sampleSize({ baseline: BASELINE, mde: MDE, mdeType: 'absolute', alpha: ALPHA, power: POWER });
console.log(`公式给出：每组 ${design.nControl} 人，total=${design.total}`);

// 模拟：A 组真实转化率 = baseline，B 组 = baseline + MDE
const rng = mulberry32(SEED);
let detected = 0;
for (let i = 0; i < N_TRIALS; i++) {
  const xA = binomial(rng, design.nControl, BASELINE);
  const xB = binomial(rng, design.nTreatment, BASELINE + MDE);
  const t = zTest({ n1: design.nControl, x1: xA, n2: design.nTreatment, x2: xB });
  if (t.pValue < ALPHA && t.absDiff > 0) detected++;
  if ((i + 1) % 200 === 0) process.stdout.write(`  ${i + 1}/${N_TRIALS}\r`);
}
const actualPower = detected / N_TRIALS;
console.log(`\n实际检出率：${(actualPower * 100).toFixed(2)}%  (理论 ${(POWER * 100).toFixed(1)}%)`);

const diff = Math.abs(actualPower - POWER);
const pass = diff <= 0.03; // 容许 3 个点误差
console.log(pass ? `✓ 通过 (误差 ${(diff * 100).toFixed(2)}%)` : `✗ 失败 (误差 ${(diff * 100).toFixed(2)}%)`);

const summary = {
  generatedAt: new Date().toISOString(),
  config: {
    seed: SEED,
    nTrials: N_TRIALS,
    baseline: BASELINE,
    mde: MDE,
    alpha: ALPHA,
    expectedPower: POWER,
  },
  design: {
    nControl: design.nControl,
    nTreatment: design.nTreatment,
    total: design.total,
  },
  simulation: {
    detected,
    actualPower,
    error: diff,
    pass,
  },
};

mkdirSync('results', { recursive: true });
writeFileSync('results/power-check.json', JSON.stringify(summary, null, 2));
console.log(`写入 results/power-check.json`);
if (!pass) process.exit(1);
