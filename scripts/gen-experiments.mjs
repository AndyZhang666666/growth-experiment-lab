// 生成合成实验台账。用生活化场景，避开实习公司的真实业务。
// 跑：npm run gen:experiments，产物：data/experiments.json
//
// 关键设计：「复盘」那一句里的所有数字都由统计量拼出来，不手写。
// 第一版是手写的，结果 exp-001 抽样出来 +3.08 个点、文案写着「提升 2.5 个点」；
// exp-003 抽出来 p = 0.15（不显著）、文案却写着「显著（p = 0.02）」。
// 数据是合成的，但「文案和数字对不上」是实打实的错误。现在数字全部来自 stats，
// 文案只负责那些不含数字的业务判断。

import { writeFileSync, mkdirSync } from 'node:fs';
import { mulberry32, binomial, zTest, newcombeInterval, sampleSize } from '../lib/stats.js';

const SEED = 20260915;
const ALPHA = 0.05;
const POWER = 0.8;
const rng = mulberry32(SEED);

const f = (x, d = 2) => `${(x * 100).toFixed(d)}%`;
const fp = (x, d = 2) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;

// 每条实验：参数 + 不含数字的业务判断（insight）
const specs = [
  {
    id: 'exp-001',
    hypothesis: '新人优惠券从「满 30 减 5」改成「满 20 减 5」，能提升首单转化',
    metric: '7 日内首单转化率',
    guardRail: '次单留存不能低于对照组 -3%',
    baseline: 0.08, treatment: 0.105, n: 5200, days: 14,
    decision: '全量',
    insight: '门槛从 30 降到 20，新人在首单就能用掉券，决策链短了一截。护栏指标没动，可以放心全量',
  },
  {
    id: 'exp-002',
    hypothesis: '结算页「去支付」按钮从绿色改成橙色，提升支付转化',
    metric: '加购到支付转化率',
    guardRail: '加购率不降',
    baseline: 0.42, treatment: 0.424, n: 3800, days: 10,
    decision: '不推',
    insight: '颜色本身不传递信息，用户在这个页面的注意力在金额和地址上。两个方向的差异都在抽样噪声范围内',
  },
  {
    id: 'exp-003',
    hypothesis: '推送从晚 8 点改到中午 12 点，提升打开率',
    metric: '推送 1 小时打开率',
    guardRail: '次日留存不降',
    baseline: 0.15, treatment: 0.16, n: 40000, days: 7,
    decision: '不推',
    insight:
      '统计上确实显著，但绝对提升只有一个点量级 —— 折算成日活增量只有百人量级，' +
      '抵不上调整全量推送时段带来的运营成本和晚间流量损失。显著不等于值得',
  },
  {
    id: 'exp-004',
    hypothesis: '首页瀑布流从 2 列改成 3 列，提升内容曝光和点击',
    metric: '首页内容点击率',
    guardRail: '停留时长不降',
    baseline: 0.28, treatment: 0.24, n: 6500, days: 5,
    decision: '回滚',
    insight: '3 列把单卡尺寸压小了，封面图看不清，点起来也更容易点错。方向明确为负，不用再跑，直接回滚',
  },
  {
    id: 'exp-005',
    hypothesis: '商品详情页加「限时特价」标签，提升加购率',
    metric: '详情页到加购转化率',
    guardRail: '实付金额不降',
    // 参数是为了让它真落在「继续跑」档才这么定的：
    // 按观测到的效应量算，需要约 2.6 倍样本才有 80% power —— 越过 3 倍就该判「不推」了
    baseline: 0.18, treatment: 0.192, n: 6000, days: 10,
    decision: '继续跑',
    insight:
      '现在这个样本量还下不了结论，但观测到的效应量如果真实存在，再加一倍多的样本就够检出。' +
      '继续跑到设计的天数，中途不要因为某天数字好看就停',
  },
  {
    id: 'exp-006',
    hypothesis: '搜索框 placeholder 从「搜索商品」改成「搜你想要的」，提升搜索使用率',
    metric: '7 日内搜索渗透率',
    guardRail: '搜索质量（点击率）不降',
    baseline: 0.35, treatment: 0.39, n: 4500, days: 10,
    decision: '全量',
    insight: '「搜索商品」像在描述功能，「搜你想要的」像在描述收益，后者更能促使人去试。搜索点击率持平，说明进来的不是无效搜索',
  },
  {
    id: 'exp-007',
    hypothesis: '订单确认页加「预计送达时间」，降低取消率',
    metric: '下单后 30 分钟取消率',
    guardRail: '客服咨询量不涨',
    baseline: 0.05, treatment: 0.0485, n: 8200, days: 12,
    decision: '不推',
    insight: '取消主要发生在价格和库存变动上，送达时间不是用户的决策变量。样本量已经不小了，再跑也是这个结论',
  },
  {
    id: 'exp-008',
    hypothesis: '新人引导从 5 步简化成 3 步，提升完成率',
    metric: '引导流程完成率',
    guardRail: '次日留存不降',
    baseline: 0.62, treatment: 0.71, n: 3200, days: 8,
    decision: '全量',
    insight: '砍掉的两步都是「信息填写」类，用户在这个阶段还没有给出信息的意愿。完成率涨得很干脆，全量',
  },
  {
    id: 'exp-009',
    hypothesis: '评价晒图从默认 3 张改成 6 张，提升晒图率',
    metric: '评价带图比例',
    guardRail: '评价提交率不降',
    baseline: 0.23, treatment: 0.234, n: 5100, days: 11,
    decision: '不推',
    insight: '愿意晒图的人本来就挑好了图，不愿意的人也没有因为上限放宽而改变意愿。上限不是瓶颈',
  },
  {
    id: 'exp-010',
    hypothesis: '会员续费页加「已省金额」累计展示，提升续费率',
    metric: '到期前 7 日续费率',
    guardRail: '用户满意度不降',
    baseline: 0.48, treatment: 0.54, n: 2800, days: 14,
    decision: '全量',
    insight: '把抽象的「权益」换成具体的「已经帮你省了多少」，价值感才有载体。续费页本来就该让人算这笔账',
  },
];

const experiments = specs.map((s) => {
  // 「继续跑」这一档要求观测到的 z 落在一个很窄的窗口里（约 1.62~1.96），
  // 任何一次抽样命中该窗口的概率只有一成多 —— 所以这里允许按固定顺序重抽，
  // 直到落进窗口为止，并把抽了几次记进数据里。种子固定，重抽序列也就固定，结果仍可复现。
  let xControl;
  let xTreatment;
  let attempts = 0;
  const maxAttempts = 500;
  for (;;) {
    attempts++;
    xControl = binomial(rng, s.n, s.baseline);
    xTreatment = binomial(rng, s.n, s.treatment);
    if (s.decision !== '继续跑') break;
    const z = zTest({ n1: s.n, x1: xControl, n2: s.n, x2: xTreatment }).z;
    const az = Math.abs(z);
    if (az >= 1.62 && az <= 1.95) break;
    if (attempts >= maxAttempts) {
      throw new Error(`${s.id}: 抽了 ${maxAttempts} 次都没落进「继续跑」窗口，参数要调`);
    }
  }

  const t = zTest({ n1: s.n, x1: xControl, n2: s.n, x2: xTreatment });
  const ci = newcombeInterval({ n1: s.n, x1: xControl, n2: s.n, x2: xTreatment, alpha: ALPHA });
  const significant = t.pValue < ALPHA;
  const positive = t.absDiff > 0;

  // 决策必须和统计结论对得上 —— 对不上说明参数没调好，直接抛错不要悄悄放过去
  const consistent =
    (s.decision === '全量' && significant && positive) ||
    (s.decision === '回滚' && significant && !positive) ||
    (s.decision === '不推') ||
    (s.decision === '继续跑' && !significant);
  if (!consistent) {
    throw new Error(
      `${s.id}: 决策「${s.decision}」与实际统计结论不符（p=${t.pValue.toFixed(4)}, diff=${fp(t.absDiff)}）`,
    );
  }

  // 「不推」有两种：不显著，或显著但效应太小不值得
  const notWorthIt = significant && Math.abs(t.absDiff) < 0.012;
  const label = notWorthIt ? '显著但不值得' : significant ? '显著' : '不显著';

  // 「继续跑」还是「不推」必须用 interpret() 里的同一条规则判断：
  // 按观测到的效应量算，达到 80% power 需要的样本量不超过现在的 3 倍 → 继续跑；否则不推。
  // 第一版 exp-005 就是在这条上写错了 —— 标着「继续跑」，实际要 36 倍样本。
  const neededForObserved =
    significant || t.absDiff === 0
      ? null
      : sampleSize({
          baseline: t.p1, mde: Math.abs(t.absDiff), mdeType: 'absolute',
          alpha: ALPHA, power: POWER,
        }).nControl;
  const CONTINUE_THRESHOLD = 3;
  const wouldContinue = neededForObserved !== null && neededForObserved <= CONTINUE_THRESHOLD * s.n;
  if (s.decision === '继续跑' && !wouldContinue) {
    throw new Error(
      `${s.id}: 标了「继续跑」，但按观测效应需要 ${neededForObserved?.toLocaleString()} 人/组，` +
        `是当前 ${s.n.toLocaleString()} 的 ${(neededForObserved / s.n).toFixed(1)} 倍，超过 ${CONTINUE_THRESHOLD} 倍阈值，应该是「不推」`,
    );
  }
  if (s.decision === '不推' && !significant && wouldContinue) {
    throw new Error(
      `${s.id}: 标了「不推」，但按观测效应只需 ${neededForObserved.toLocaleString()} 人/组（${(neededForObserved / s.n).toFixed(1)} 倍），应该是「继续跑」`,
    );
  }

  // 复盘：先由统计量拼出定量的那句，再接不含数字的业务判断
  const quant =
    `${f(t.p1)} → ${f(t.p2)}，绝对提升 ${fp(t.absDiff)}，相对 ${fp(t.relDiff, 1)}，` +
    `p ${t.pValue < 0.0001 ? '< 0.0001' : `= ${t.pValue.toFixed(4)}`}，` +
    `95% CI [${fp(ci[0])}, ${fp(ci[1])}]（${label}）`;
  const extra =
    !significant && neededForObserved
      ? `。按观测到的效应量，每组要约 ${neededForObserved.toLocaleString()} 人才有 ${Math.round(POWER * 100)}% 把握检出`
      : '';

  return {
    id: s.id,
    resampleAttempts: attempts,
    hypothesis: s.hypothesis,
    metric: s.metric,
    guardRail: s.guardRail,
    nControl: s.n,
    xControl,
    nTreatment: s.n,
    xTreatment,
    days: s.days,
    decision: s.decision,
    stats: {
      pControl: t.p1,
      pTreatment: t.p2,
      absDiff: t.absDiff,
      relDiff: t.relDiff,
      pValue: t.pValue,
      ci95: ci,
      significant,
      label,
      wouldContinue,
      neededSampleForObserved: neededForObserved,
    },
    review: `${quant}${extra}。${s.insight}`,
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  seed: SEED,
  note:
    '所有实验数据均为合成，场景虚构。数字来自 binomial 抽样（种子 20260915），' +
    '统计量与复盘里的定量部分由 zTest / newcombeInterval 计算，不存在手写数字。',
  experiments,
};

mkdirSync('data', { recursive: true });
writeFileSync('data/experiments.json', JSON.stringify(output, null, 2));

console.log(`生成 ${experiments.length} 个合成实验 → data/experiments.json\n`);
for (const e of experiments) {
  console.log(
    `${e.id} ${e.decision.padEnd(4)} ${e.stats.label.padEnd(7)} ` +
      `${f(e.stats.pControl)}→${f(e.stats.pTreatment)} ${fp(e.stats.absDiff)} p=${e.stats.pValue.toFixed(4)}`,
  );
}
console.log('\n决策分布：');
console.log(`  全量：${experiments.filter((e) => e.decision === '全量').length}`);
console.log(`  不推（其中「显著但不值得」${experiments.filter((e) => e.stats.label === '显著但不值得').length} 个）：${experiments.filter((e) => e.decision === '不推').length}`);
console.log(`  继续跑：${experiments.filter((e) => e.decision === '继续跑').length}`);
console.log(`  回滚：${experiments.filter((e) => e.decision === '回滚').length}`);
