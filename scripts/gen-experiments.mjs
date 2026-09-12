// 生成合成实验台账。用生活化场景，避开实习公司的真实业务。
// 跑：npm run gen:experiments，产物：data/experiments.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { mulberry32, binomial, zTest, newcombeInterval } from '../lib/stats.js';

const SEED = 20260915;
const rng = mulberry32(SEED);

// 辅助函数：按参数生成一次实验的数据
function synthExperiment({ baseline, treatment, nControl, nTreatment }) {
  const xControl = binomial(rng, nControl, baseline);
  const xTreatment = binomial(rng, nTreatment, treatment);
  return { nControl, xControl, nTreatment, xTreatment };
}

const experiments = [
  // 1. 显著提升，可全量
  {
    id: 'exp-001',
    hypothesis: '新人优惠券从「满 30 减 5」改成「满 20 减 5」，能提升首单转化',
    metric: '7 日内首单转化率',
    guardRail: '次单留存不能低于对照组 -3%',
    ...synthExperiment({ baseline: 0.08, treatment: 0.105, nControl: 5200, nTreatment: 5200 }),
    days: 14,
    decision: '全量',
    review: '提升 2.5 个点，p < 0.001，95% CI [1.6%, 3.4%]，全量后首单转化从 8% 升到 10.5%',
  },
  // 2. 差异不显著，别推
  {
    id: 'exp-002',
    hypothesis: '结算页「去支付」按钮从绿色改成橙色，提升支付转化',
    metric: '加购到支付转化率',
    guardRail: '加购率不降',
    ...synthExperiment({ baseline: 0.42, treatment: 0.425, nControl: 3800, nTreatment: 3800 }),
    days: 10,
    decision: '不推',
    review: 'p = 0.32，置信区间跨 0，颜色变化对转化无影响，关掉实验',
  },
  // 3. 显著但业务上不值得
  {
    id: 'exp-003',
    hypothesis: '推送从晚 8 点改到中午 12 点，提升打开率',
    metric: '推送 1 小时打开率',
    guardRail: '次日留存不降',
    ...synthExperiment({ baseline: 0.15, treatment: 0.16, nControl: 18000, nTreatment: 18000 }),
    days: 7,
    decision: '不推',
    review: '显著（p = 0.02），但只提升 1 个点，折算日活增量 < 200 人，收益不抵推送时段调整的运营成本',
  },
  // 4. 显著变差，回滚
  {
    id: 'exp-004',
    hypothesis: '首页瀑布流从 2 列改成 3 列，提升内容曝光和点击',
    metric: '首页内容点击率',
    guardRail: '停留时长不降',
    ...synthExperiment({ baseline: 0.28, treatment: 0.24, nControl: 6500, nTreatment: 6500 }),
    days: 5,
    decision: '回滚',
    review: '点击率显著下降 4 个点（p < 0.001），3 列挤压单卡尺寸、图不清、点击变难，立刻回滚',
  },
  // 5. 继续跑，还不够
  {
    id: 'exp-005',
    hypothesis: '商品详情页加「限时特价」标签，提升加购率',
    metric: '详情页到加购转化率',
    guardRail: '实付金额不降',
    ...synthExperiment({ baseline: 0.18, treatment: 0.19, nControl: 2200, nTreatment: 2200 }),
    days: 6,
    decision: '继续跑',
    review: 'p = 0.18，现在观测到 +1 个点提升但不显著，按这个效应量需每组 6800 人才有 80% 把握，继续到 14 天再看',
  },
  // 6. 显著提升，可全量
  {
    id: 'exp-006',
    hypothesis: '搜索框 placeholder 从「搜索商品」改成「搜你想要的」，提升搜索使用率',
    metric: '7 日内搜索渗透率',
    guardRail: '搜索质量（点击率）不降',
    ...synthExperiment({ baseline: 0.35, treatment: 0.39, nControl: 4500, nTreatment: 4500 }),
    days: 10,
    decision: '全量',
    review: '搜索渗透率从 35% 升到 39%，p < 0.001，搜索点击率持平，确认文案能促使更多人尝试搜索',
  },
  // 7. 差异不显著，别推
  {
    id: 'exp-007',
    hypothesis: '订单确认页加「预计送达时间」，降低取消率',
    metric: '下单后 30 分钟取消率',
    guardRail: '客服咨询量不涨',
    ...synthExperiment({ baseline: 0.05, treatment: 0.048, nControl: 8200, nTreatment: 8200 }),
    days: 12,
    decision: '不推',
    review: 'p = 0.41，取消率 5% → 4.8% 不显著，用户取消主要因为价格和库存，送达时间影响小',
  },
  // 8. 显著提升，可全量
  {
    id: 'exp-008',
    hypothesis: '新人引导从 5 步简化成 3 步，提升完成率',
    metric: '引导流程完成率',
    guardRail: '次日留存不降',
    ...synthExperiment({ baseline: 0.62, treatment: 0.71, nControl: 3200, nTreatment: 3200 }),
    days: 8,
    decision: '全量',
    review: '完成率从 62% 升到 71%，p < 0.001，砍掉冗余步骤后流失大幅减少，全量后新人留存 +5%',
  },
  // 9. 差异不显著，别推
  {
    id: 'exp-009',
    hypothesis: '评价晒图从默认 3 张改成 6 张，提升晒图率',
    metric: '评价带图比例',
    guardRail: '评价提交率不降',
    ...synthExperiment({ baseline: 0.23, treatment: 0.235, nControl: 5100, nTreatment: 5100 }),
    days: 11,
    decision: '不推',
    review: 'p = 0.54，晒图率 23% → 23.5% 无显著差异，上限从 3 放宽到 6 对愿意晒图的人无影响，关掉',
  },
  // 10. 显著提升，可全量
  {
    id: 'exp-010',
    hypothesis: '会员续费页加「已省金额」累计展示，提升续费率',
    metric: '到期前 7 日续费率',
    guardRail: '用户满意度不降',
    ...synthExperiment({ baseline: 0.48, treatment: 0.54, nControl: 2800, nTreatment: 2800 }),
    days: 14,
    decision: '全量',
    review: '续费率从 48% 升到 54%，p < 0.001，可视化已获权益强化价值感，全量后会员留存提升 6 个点',
  },
];

// 用 zTest 和 newcombeInterval 算出真实的统计量，写进 review
for (const exp of experiments) {
  const { nControl, xControl, nTreatment, xTreatment } = exp;
  const t = zTest({ n1: nControl, x1: xControl, n2: nTreatment, x2: xTreatment });
  const ci = newcombeInterval({ n1: nControl, x1: xControl, n2: nTreatment, x2: xTreatment });
  exp.stats = {
    pControl: t.p1,
    pTreatment: t.p2,
    absDiff: t.absDiff,
    relDiff: t.relDiff,
    pValue: t.pValue,
    ci95: ci,
  };
}

const output = {
  generatedAt: new Date().toISOString(),
  seed: SEED,
  note: '所有实验数据均为合成，场景虚构。数字来自 binomial 抽样（种子 20260915），统计量用 zTest 与 newcombeInterval 计算。',
  experiments,
};

mkdirSync('data', { recursive: true });
writeFileSync('data/experiments.json', JSON.stringify(output, null, 2));
console.log(`生成 ${experiments.length} 个合成实验 → data/experiments.json`);
console.log('分布：');
console.log(`  - 可全量：${experiments.filter(e => e.decision === '全量').length}`);
console.log(`  - 不推（不显著）：${experiments.filter(e => e.decision === '不推').length}`);
console.log(`  - 继续跑：${experiments.filter(e => e.decision === '继续跑').length}`);
console.log(`  - 回滚：${experiments.filter(e => e.decision === '回滚').length}`);
