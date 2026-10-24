// 固定种子的合成教学台账。每个案例只抽一次，不为目标结论重抽。
import { writeFileSync, mkdirSync } from "node:fs";
import { mulberry32, binomial, interpret } from "../lib/stats.js";
const seed = 20260915,
  rng = mulberry32(seed);
// 名称、假设、护栏和计划为作者预置的虚构输入，不是实际实验资料。
const specs = [
  [
    "exp-001",
    "降低新人优惠券使用门槛，提升首单转化",
    "7 日首单转化率",
    "次单留存与补贴成本",
    0.08,
    0.105,
    5200,
    14,
  ],
  [
    "exp-002",
    "结算按钮换色，提升支付转化",
    "加购到支付转化率",
    "加购率与误触率",
    0.42,
    0.424,
    3800,
    10,
  ],
  [
    "exp-003",
    "推送改到中午，提升打开率",
    "推送 1 小时打开率",
    "次日留存、退订与运营成本",
    0.15,
    0.16,
    40000,
    7,
  ],
  [
    "exp-004",
    "首页从两列改三列，提升内容点击",
    "首页内容点击率",
    "停留时长与误触率",
    0.28,
    0.24,
    6500,
    5,
  ],
  [
    "exp-005",
    "详情页添加限时标签，提升加购",
    "详情页到加购转化率",
    "实付金额与投诉",
    0.18,
    0.192,
    6000,
    10,
    12000,
    14,
  ],
  [
    "exp-006",
    "重写搜索提示语，提升搜索使用",
    "7 日搜索渗透率",
    "搜索结果点击与满意度",
    0.35,
    0.39,
    4500,
    10,
  ],
  [
    "exp-007",
    "确认页增加送达时间，降低取消",
    "下单后取消率",
    "客服咨询与履约准确性",
    0.05,
    0.0485,
    8200,
    12,
  ],
  [
    "exp-008",
    "新人引导从五步减到三步",
    "引导完成率",
    "次日留存与资料质量",
    0.62,
    0.71,
    3200,
    8,
  ],
  [
    "exp-009",
    "增加评价晒图上限",
    "评价带图比例",
    "评价提交率与加载性能",
    0.23,
    0.234,
    5100,
    11,
  ],
  [
    "exp-010",
    "续费页展示累计已省金额",
    "到期前续费率",
    "满意度、退款与长期留存",
    0.48,
    0.54,
    2800,
    14,
  ],
];
const experiments = specs.map(
  ([
    id,
    hypothesis,
    metric,
    guardRail,
    p1,
    p2,
    n,
    days,
    plannedN = n,
    plannedDays = days,
  ]) => {
    const xControl = binomial(rng, n, p1),
      xTreatment = binomial(rng, n, p2);
    const judgment = interpret({ n1: n, x1: xControl, n2: n, x2: xTreatment });
    // 取消率为越低越好；其余指标越高越好。方向必须来自指标定义，不来自结果好坏。
    const direction = id === "exp-007" ? "lower" : "higher";
    const harm =
      judgment.test.pValue < 0.05 &&
      (direction === "higher"
        ? judgment.test.absDiff < 0
        : judgment.test.absDiff > 0);
    const reached = n >= plannedN && days >= plannedDays;
    const decision = harm ? "停止扩流" : !reached ? "按计划继续" : "待核对";
    const t = judgment.test,
      ci = judgment.ci;
    const label = t.pValue < 0.05 ? "有差异证据" : "未达到显著门槛";
    return {
      id,
      resampleAttempts: 1,
      hypothesis,
      metric,
      direction,
      guardRail,
      nControl: n,
      xControl,
      nTreatment: n,
      xTreatment,
      days,
      decision,
      plan: {
        nPerGroup: plannedN,
        days: plannedDays,
        reached,
        source: "作者预置的合成计划；未按观测效应追加样本",
      },
      stats: {
        pControl: t.p1,
        pTreatment: t.p2,
        absDiff: t.absDiff,
        relDiff: t.relDiff,
        pValue: t.pValue,
        ci95: ci,
        significant: t.pValue < 0.05,
        label,
      },
      review: `p=${t.pValue.toFixed(4)}；95% 差值区间 [${(ci[0] * 100).toFixed(2)}, ${(ci[1] * 100).toFixed(2)}] 个百分点。指标方向：${direction === "lower" ? "越低越好" : "越高越好"}。${harm ? "先停止扩大流量并排查风险。" : !reached ? "尚未达到预置计划终点，不按当前 p 值改变计划。" : "已达预置终点，记录统计证据后另核对业务门槛与护栏。"}护栏未提供观测数据，不能声称已通过，也不自动全量。`,
    };
  },
);
mkdirSync("data", { recursive: true });
writeFileSync(
  "data/experiments.json",
  JSON.stringify(
    {
      modelVersion: "bounded-ledger-v2",
      seed,
      note: "全部为合成案例；每案例单次抽样。计划为作者预置，护栏无观测数据，统计证据不直接批准全量。",
      experiments,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Generated " +
    experiments.length +
    " synthetic records, one sample each, no outcome resampling.",
);
