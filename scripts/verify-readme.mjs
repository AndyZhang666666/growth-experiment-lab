// 校验 README 里引用的关键数字，必须能在 results/ 里找到。
// 红线第 1 条要求「README 里所有数字都来自 results/ 真跑出来的产物」，这个脚本就是它的自动化检查。
// 跑：npm run verify:readme
//
// 起因：写 README 的「什么失败了」那节时，我给 Bonferroni 的近似式随手写了句
// 「和精确值差 0.01%」，实际高估了 22%。数字写在散文里没人核对，所以让脚本核。

import { readFileSync } from 'node:fs';

const readme = readFileSync('README.md', 'utf8');
const peeking = JSON.parse(readFileSync('results/peeking-sim.json', 'utf8'));
const power = JSON.parse(readFileSync('results/power-check.json', 'utf8'));
const statsCheck = JSON.parse(readFileSync('results/stats-check.json', 'utf8'));

const r = peeking.results;
const pct = (x) => `${(x * 100).toFixed(2)}%`;

// 每一条：[README 里该出现的字符串, 它的来源, 说明]
const claims = [
  [pct(r.final.falsePositiveRate), 'peeking-sim: final', '只看一次的假阳性率'],
  [pct(r.peeking.falsePositiveRate), 'peeking-sim: peeking', '偷看的假阳性率'],
  [pct(r.obf.falsePositiveRate), 'peeking-sim: obf', 'OBF 的假阳性率'],
  [pct(r.bonferroni.falsePositiveRate), 'peeking-sim: bonferroni', 'Bonferroni 的假阳性率'],
  [`${(r.peeking.falsePositiveRate / peeking.config.alpha).toFixed(1)}×`, 'peeking-sim', '偷看相对 α 的倍数'],
  [`${r.peeking.nStopped} / ${peeking.config.nTrials}`, 'peeking-sim', '偷看提前停止次数'],
  [`${power.simulation.detected}`, 'power-check', 'power 模拟检出次数'],
  [`${(power.simulation.actualPower * 100).toFixed(1)}%`, 'power-check', '实际检出率'],
  [`${power.design.nControl}`, 'power-check', '公式给的每组样本量'],
  [`${statsCheck.passed}/${statsCheck.total}`, 'stats-check', '对照测试通过数'],
];

let failed = 0;
for (const [needle, source, desc] of claims) {
  const ok = readme.includes(needle);
  console.log(`${ok ? 'PASS' : 'FAIL'}  README 出现 "${needle}"  <- ${source}（${desc}）`);
  if (!ok) failed++;
}

// 反向检查：README 里不该出现跟 results/ 矛盾的数字
const contradictions = [
  ['4.5×', `${(r.peeking.falsePositiveRate / peeking.config.alpha).toFixed(1)}×`, '偷看相对 α 的倍数'],
];
for (const [needle, expected, desc] of contradictions) {
  if (readme.includes(needle) && needle !== expected) {
    console.log(`FAIL  README 写的 ${desc} "${needle}" 与产物算出 "${expected}" 不符`);
    failed++;
  }
}

// 停止日分布：README 表格里 D1/D2/D3 的次数必须与产物一致
const dist = Object.fromEntries(r.peeking.stopDayDistribution.map((d) => [d.day, d.count]));
const d1 = dist[1] ?? 0;
const d2 = dist[2] ?? 0;
const d3 = dist[3] ?? 0;
const firstThree = d1 + d2 + d3;
const pctFirstThree = Math.round((firstThree / r.peeking.nStopped) * 100);

if (!readme.includes(String(d1)) || !readme.includes(String(d2)) || !readme.includes(String(d3))) {
  console.log(`FAIL  README 停止日表格与产物不一致（产物 D1=${d1} D2=${d2} D3=${d3}）`);
  failed++;
} else {
  console.log(`PASS  README 停止日表格与产物一致（D1=${d1} D2=${d2} D3=${d3}）`);
}

if (!readme.includes(`${pctFirstThree}%`)) {
  console.log(`FAIL  README 缺少「前三天的占比」= ${pctFirstThree}%（产物算出 ${firstThree}/${r.peeking.nStopped}）`);
  failed++;
} else {
  console.log(`PASS  README 前三天的占比 = ${pctFirstThree}%（${firstThree}/${r.peeking.nStopped}）`);
}

console.log(failed === 0 ? '\nREADME 与 results/ 一致。' : `\n${failed} 处不一致，改 README 或重跑脚本。`);
process.exit(failed === 0 ? 0 : 1);
