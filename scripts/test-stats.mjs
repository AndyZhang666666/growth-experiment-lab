// 统计函数对照已知答案。
// 每组 case 都写明答案从哪来 —— 教科书、Evan Miller 计算器源码、Newcombe 1998 论文表格。
// 跑：npm test，产物：results/stats-check.json

import { writeFileSync, mkdirSync } from 'node:fs';
import {
  normalCdf,
  normalQuantile,
  zTest,
  wilsonInterval,
  newcombeInterval,
  sampleSize,
  mdeForDays,
  daysNeeded,
  bonferroniBoundary,
  mulberry32,
} from '../lib/stats.js';

const cases = [];

function check(name, source, got, expected, tol) {
  const arrGot = Array.isArray(got) ? got : [got];
  const arrExp = Array.isArray(expected) ? expected : [expected];
  let pass = true;
  let maxErr = 0;
  for (let i = 0; i < arrExp.length; i++) {
    const err = Math.abs(arrGot[i] - arrExp[i]);
    maxErr = Math.max(maxErr, err);
    if (!(err <= tol)) pass = false;
  }
  cases.push({ name, source, got, expected, tolerance: tol, maxError: maxErr, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`);
}

// 1. 正态分位数：标准表值
check('z_{0.975}', '标准正态表', normalQuantile(0.975), 1.959964, 1e-5);
check('z_{0.80}', '标准正态表', normalQuantile(0.8), 0.841621, 1e-5);
check('z_{0.995}', '标准正态表', normalQuantile(0.995), 2.575829, 1e-5);
check('z_{0.001}（左尾）', '标准正态表', normalQuantile(0.001), -3.090232, 5e-5);

// 2. 正态 CDF
check('Φ(1.96)', '标准正态表', normalCdf(1.96), 0.9750021, 1e-6);
check('Φ(-1)', '标准正态表', normalCdf(-1), 0.1586553, 1e-6);
check('Φ(0)', '定义', normalCdf(0), 0.5, 1e-9);

// 3. 样本量 —— 教科书公式（k=1）
// Evan Miller 的源码 (sample-size-fixed.js) 用的是
//   n = (z_α/2·√(2p(1-p)) + z_β·√(p(1-p)+p₂(1-p₂)))² / δ²
// 和本项目的 n = (z_α/2 + z_β)²·[p₁(1-p₁)+p₂(1-p₂)] / δ² 不是同一个公式。
// 他页面上的默认例子 20% 基线、5% 绝对提升给 1030，本项目公式给 1091，差 6%。
// 两个都对，只是对零假设下方差的估法不同。这里两个都对照，谁也不放过。
function evanMiller(alpha, power, p, delta) {
  if (p > 0.5) p = 1 - p;
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(power);
  const sd1 = Math.sqrt(2 * p * (1 - p));
  const sd2 = Math.sqrt(p * (1 - p) + (p + delta) * (1 - p - delta));
  return ((za * sd1 + zb * sd2) ** 2) / (delta * delta);
}
check(
  'Evan Miller 公式复现：20% 基线、+5% 绝对',
  'evanmiller.org/ab-testing/sample-size.html 页面默认示例 = 1030',
  Math.ceil(evanMiller(0.05, 0.8, 0.2, 0.05)),
  1030,
  1,
);
// 教科书公式手算：(1.959964+0.841621)² · [0.2·0.8 + 0.25·0.75] / 0.05² = 7.8489 · 0.3475 / 0.0025 = 1091.0
check(
  '本项目公式：20% 基线、+5% 绝对',
  '手算 (z_α/2+z_β)²·[p₁(1-p₁)+p₂(1-p₂)]/δ² = 1091',
  sampleSize({ baseline: 0.2, mde: 0.05, mdeType: 'absolute' }).nControl,
  1091,
  1,
);
// 相对 MDE：10% 基线、相对 +20% → p₂ = 12%
// (2.801585)² · [0.09 + 0.1056] / 0.02² = 7.8489 · 0.1956 / 0.0004 = 3838.1 → 3839
check(
  '本项目公式：10% 基线、相对 +20%',
  '手算 = 3839',
  sampleSize({ baseline: 0.1, mde: 0.2, mdeType: 'relative' }).nControl,
  3839,
  1,
);
// 非均分：treatment 占 25%（k = 1/3），control 的样本量应该 = (z)²·[p₁(1-p₁)+3·p₂(1-p₂)]/δ²
// = 7.8489 · [0.16 + 0.5625] / 0.0025 = 2268.3 → 2269，treatment = ceil(2269/3) = 757
check(
  '非均分 ratio=0.25 的 control 样本量',
  '手算 = 2269',
  sampleSize({ baseline: 0.2, mde: 0.05, ratio: 0.25 }).nControl,
  2269,
  1,
);

// 4. 反推 MDE 与样本量互为逆运算
{
  const base = { baseline: 0.05, dailyTraffic: 4000, ratio: 0.5 };
  const mde = mdeForDays({ ...base, days: 7 });
  const back = sampleSize({ baseline: 0.05, mde, mdeType: 'absolute', ratio: 0.5 });
  const days = daysNeeded({ ...back, dailyTraffic: 4000, ratio: 0.5 });
  check('反推 MDE 再算天数应回到 7 天', '自洽性', days, 7, 0);
}

// 5. 两比例 z 检验
// 经典例子：Agresti《Categorical Data Analysis》阿司匹林与心肌梗死：
// 安慰剂 11034 人 189 例，阿司匹林 11037 人 104 例。合并 z ≈ 5.00（书中给 5.0，p<0.0001）
{
  const t = zTest({ n1: 11034, x1: 189, n2: 11037, x2: 104 });
  check('Agresti 阿司匹林例：z 统计量', 'Agresti CDA 2nd ed. §2.1（书中 z≈5.0）', Math.abs(t.z), 5.001, 0.01);
  check('Agresti 阿司匹林例：相对风险差方向为负', '书中结论', Math.sign(t.absDiff), -1, 0);
}
// 相等的两组，z 必须是 0，p 必须是 1
check('两组完全相同时 p ≈ 1', '定义（浮点精度限制）', zTest({ n1: 500, x1: 50, n2: 500, x2: 50 }).pValue, 1, 1e-8);

// 6. Wilson 区间 —— Newcombe 1998 Table I
// x=81,n=263 → (0.2553, 0.3662)；x=15,n=148 → (0.0624, 0.1605)；x=0,n=20 → (0, 0.1611)
check('Wilson 81/263', 'Newcombe 1998, Stat Med 17:857, Table I', wilsonInterval(81, 263), [0.2553, 0.3662], 5e-4);
check('Wilson 15/148', 'Newcombe 1998, Table I', wilsonInterval(15, 148), [0.0624, 0.1605], 5e-4);
check('Wilson 0/20', 'Newcombe 1998, Table I', wilsonInterval(0, 20), [0, 0.1611], 5e-4);

// 7. Newcombe 两比例差区间 —— Newcombe 1998 (Stat Med 17:873) Table II 方法 10
// 例 (a): 56/70 vs 48/80 → 差 0.2000，区间 (0.0524, 0.3339)
// 例 (b): 9/10 vs 3/10 → 差 0.6000，区间 (0.1705, 0.8090)
// 例 (d): 5/56 vs 0/29 → 差 0.0893，区间 (-0.0381, 0.1926)
check('Newcombe 差 56/70 vs 48/80', 'Newcombe 1998 (差值), Table II 方法 10', newcombeInterval({ n1: 80, x1: 48, n2: 70, x2: 56 }), [0.0524, 0.3339], 5e-4);
check('Newcombe 差 9/10 vs 3/10', 'Newcombe 1998 (差值), Table II 方法 10', newcombeInterval({ n1: 10, x1: 3, n2: 10, x2: 9 }), [0.1705, 0.809], 5e-4);
check('Newcombe 差 5/56 vs 0/29', 'Newcombe 1998 (差值), Table II 方法 10', newcombeInterval({ n1: 29, x1: 0, n2: 56, x2: 5 }), [-0.0381, 0.1926], 5e-4);

// 8. Bonferroni 边界
check('Bonferroni K=14 边界', 'z_{1-0.05/28} = 2.914', bonferroniBoundary(14), 2.9137, 1e-3);

// 9. PRNG 可复现 + 均匀性粗检
{
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 5 }, a);
  const seqB = Array.from({ length: 5 }, b);
  check('mulberry32 同种子同序列', '定义', seqA, seqB, 0);
  const r = mulberry32(7);
  let sum = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) sum += r();
  check('mulberry32 均值 ≈ 0.5', '均匀分布期望；N=200000 时 3σ ≈ 0.002', sum / N, 0.5, 0.002);
}

const passed = cases.filter((c) => c.pass).length;
const summary = {
  generatedAt: new Date().toISOString(),
  total: cases.length,
  passed,
  failed: cases.length - passed,
  cases,
};
mkdirSync('results', { recursive: true });
writeFileSync('results/stats-check.json', JSON.stringify(summary, null, 2));
console.log(`\n${passed}/${cases.length} 通过 → results/stats-check.json`);
if (passed !== cases.length) process.exit(1);
