// 所有统计计算都在这一个文件里，浏览器和 Node 脚本共用。
// 只依赖 Math，不引第三方库 —— 每个公式都能对着教科书核。

// ---------- 正态分布 ----------

// 标准正态 CDF。Abramowitz & Stegun 26.2.17，绝对误差 < 7.5e-8。
export function normalCdf(z) {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * poly;
  return z >= 0 ? 1 - tail : tail;
}

// 标准正态分位数（CDF 的反函数）。Acklam 算法 + 一步 Halley 修正，相对误差 ~1e-9。
export function normalQuantile(p) {
  if (!Number.isFinite(p) || p <= 0 || p >= 1)
    throw new RangeError(`normalQuantile: p 必须在 (0,1) 内，收到 ${p}`);
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Halley 修正一次
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  x = x - u / (1 + (x * u) / 2);
  return x;
}

// ---------- 可设种子的随机数 ----------

// mulberry32：32 位状态，够快，够均匀，种子一样序列就一样。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 二项抽样：n 次伯努利直接数。n 在几千量级时这样写最不容易错。
export function binomial(rng, n, p) {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < p) k++;
  return k;
}

// ---------- 两比例 z 检验 ----------

// 检验两组转化率是否相同。返回的 diff 一律是 treatment - control。
function validCounts(n, x) {
  if (
    !Number.isSafeInteger(n) ||
    n < 1 ||
    n > 1e9 ||
    !Number.isSafeInteger(x) ||
    x < 0 ||
    x > n
  )
    throw new RangeError(
      "样本量须为 1–10 亿的整数，转化数须为 0–样本量的整数。",
    );
}
function probability(p, name) {
  if (!Number.isFinite(p) || p <= 0 || p >= 1)
    throw new RangeError(name + " 须在 0 与 1 之间。");
}
export function zTest({ n1, x1, n2, x2 }) {
  validCounts(n1, x1);
  validCounts(n2, x2);
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  const z = se === 0 ? 0 : (p2 - p1) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    p1,
    p2,
    absDiff: p2 - p1,
    relDiff: p1 === 0 ? NaN : (p2 - p1) / p1,
    pooled,
    se,
    z,
    pValue,
  };
}

// ---------- 置信区间 ----------

// 单比例 Wilson 区间。x=0 或 x=n 时也不会给出 0 宽度的假区间。
export function wilsonInterval(x, n, alpha = 0.05) {
  validCounts(n, x);
  probability(alpha, "α");
  const z = normalQuantile(1 - alpha / 2);
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [center - half, center + half];
}

// 两比例之差的区间：Newcombe (1998) 方法 10，用两个 Wilson 区间拼出来。
// 小样本、极端转化率下比 Wald 稳得多；大样本下两者几乎一样。
export function newcombeInterval({ n1, x1, n2, x2, alpha = 0.05 }) {
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const [l1, u1] = wilsonInterval(x1, n1, alpha);
  const [l2, u2] = wilsonInterval(x2, n2, alpha);
  const diff = p2 - p1;
  const lo = diff - Math.sqrt((p2 - l2) ** 2 + (u1 - p1) ** 2);
  const hi = diff + Math.sqrt((u2 - p2) ** 2 + (p1 - l1) ** 2);
  return [lo, hi];
}

// Wald（正态近似）区间，留着做对照。
export function waldInterval({ n1, x1, n2, x2, alpha = 0.05 }) {
  const z = normalQuantile(1 - alpha / 2);
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const diff = p2 - p1;
  return [diff - z * se, diff + z * se];
}

// ---------- 样本量 ----------

// 把 MDE 统一成绝对提升。relative 表示相对基线的比例（0.1 = 提升 10%）。
export function mdeToAbsolute(baseline, mde, mdeType) {
  return mdeType === "relative" ? baseline * mde : mde;
}

// 每组所需样本量。
// n_control = (z_{1-α/2} + z_{1-β})² · [p₁(1-p₁) + p₂(1-p₂)/k] / (p₂-p₁)²，n_treatment = k · n_control
// k = treatment 与 control 的流量比；k = 1 时退化成教科书公式。
export function sampleSize({
  baseline,
  mde,
  mdeType = "absolute",
  alpha = 0.05,
  power = 0.8,
  ratio = 0.5,
}) {
  probability(baseline, "基线");
  probability(alpha, "α");
  probability(power, "power");
  probability(ratio, "流量占比");
  if (
    power <= 0.5 ||
    !Number.isFinite(mde) ||
    mde <= 0 ||
    !["relative", "absolute"].includes(mdeType)
  )
    throw new RangeError("MDE 须为正数，power 须高于 0.5，提升类型须有效。");
  const delta = mdeToAbsolute(baseline, mde, mdeType);
  const p1 = baseline;
  const p2 = baseline + delta;
  if (p2 <= 0 || p2 >= 1) throw new RangeError(`sampleSize: p₂ = ${p2} 越界`);
  if (delta === 0)
    return {
      nControl: Infinity,
      nTreatment: Infinity,
      total: Infinity,
      delta,
      p2,
    };
  const k = ratio / (1 - ratio);
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(power);
  const variance = p1 * (1 - p1) + (p2 * (1 - p2)) / k;
  const nControl = Math.ceil(((za + zb) ** 2 * variance) / (delta * delta));
  const nTreatment = Math.ceil(nControl * k);
  return { nControl, nTreatment, total: nControl + nTreatment, delta, p2 };
}

// 按日流量算要跑几天。ratio 是 treatment 分到的流量份额。
export function daysNeeded({
  nControl,
  nTreatment,
  dailyTraffic,
  ratio = 0.5,
}) {
  probability(ratio, "流量占比");
  if (
    ![nControl, nTreatment, dailyTraffic].every(
      (x) => Number.isFinite(x) && x > 0,
    )
  )
    throw new RangeError("样本量与日流量须为有限正数。");
  const dControl = nControl / (dailyTraffic * (1 - ratio));
  const dTreatment = nTreatment / (dailyTraffic * ratio);
  return Math.ceil(Math.max(dControl, dTreatment));
}

// 反推：只肯跑 days 天，能检出的最小绝对提升是多少。二分搜索。
export function mdeForDays({
  baseline,
  days,
  dailyTraffic,
  ratio = 0.5,
  alpha = 0.05,
  power = 0.8,
}) {
  probability(baseline, "基线");
  probability(ratio, "流量占比");
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 3650 ||
    !Number.isFinite(dailyTraffic) ||
    dailyTraffic <= 0
  )
    throw new RangeError("时间预算须为 1–3650 天整数，日流量须为正数。");
  const nControlBudget = Math.floor(dailyTraffic * (1 - ratio) * days);
  let lo = 1e-6;
  let hi = Math.min(1 - baseline, 0.999) - 1e-6;
  if (
    hi <= lo ||
    sampleSize({ baseline, mde: hi, mdeType: "absolute", alpha, power, ratio })
      .nControl > nControlBudget
  )
    return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const { nControl } = sampleSize({
      baseline,
      mde: mid,
      mdeType: "absolute",
      alpha,
      power,
      ratio,
    });
    if (nControl <= nControlBudget) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ---------- 序贯检验的边界 ----------

// Bonferroni：K 次检查，每次用 α/K。最保守，也最好解释。
export function bonferroniBoundary(K, alpha = 0.05) {
  return normalQuantile(1 - alpha / (2 * K));
}

// O'Brien-Fleming 型边界：第 k 次（共 K 次）检查用 c·√(K/k)。
// 早期门槛极高、后期回落到 c。真正的 OBF 常数 c 要解多元正态积分，这里用可传入的 c 近似（默认 2.0）。
export function obfBoundary(K, k, c = 2.0) {
  return c * Math.sqrt(K / k);
}

// ---------- 结果解读 ----------

// 把一组结果翻译成三档结论。规则见 docs/DECISIONS.md。
export function interpret({ n1, x1, n2, x2, alpha = 0.05, power = 0.8 }) {
  const t = zTest({ n1, x1, n2, x2 });
  const ci = newcombeInterval({ n1, x1, n2, x2, alpha });
  const significant = t.pValue < alpha;
  const confidence = `${Math.round((1 - alpha) * 100)}%`;

  if (significant && t.absDiff > 0) {
    return {
      verdict: "ship",
      title: "正向证据，待核对上线条件",
      reasons: [
        `p = ${t.pValue.toFixed(4)} < ${alpha}，在检验假设成立时，有反对两组无差异的统计证据`,
        `${confidence} 置信区间 [${fmtPct(ci[0])}, ${fmtPct(ci[1])}]；${ci[0] > 0 ? "下界为正，但接近零时业务收益仍可能很小" : "区间包含零，与检验结果边界不一致，暂缓决策"}`,
        "上线前另核对随机分流、预定停止规则、留存与成本等护栏；统计显著不等于值得全量",
      ],
      test: t,
      ci,
    };
  }
  if (significant && t.absDiff < 0) {
    return {
      verdict: "harm",
      title: "显著变差，别推",
      reasons: [
        `p = ${t.pValue.toFixed(4)} < ${alpha}，但方向是负的`,
        `${confidence} 置信区间 [${fmtPct(ci[0])}, ${fmtPct(ci[1])}]`,
        "建议暂缓扩大流量，先核对实验有效性和护栏；是否回滚结合实际风险判断",
      ],
      test: t,
      ci,
    };
  }

  // 不显著不是无效证明，也不按观测效应临时延长固定样本实验。
  return {
    verdict: "no-diff",
    title: "证据不足，不能判定无效",
    reasons: [
      `p = ${t.pValue.toFixed(4)}，未达到预设 α=${alpha}；${confidence} 区间 [${fmtPct(ci[0])}, ${fmtPct(ci[1])}]`,
      "未拒绝无差异，不等于证明两组相同；也不能仅凭当前效应反推补样本量后继续跑",
      "先核对预定样本量、停止规则和最低业务效应；达到计划终点后记录结论，需再验证时另立实验",
    ],
    test: t,
    ci,
    needed: null,
  };
}

// 业务换算：把绝对提升的区间乘上月流量和单转化价值。
export function businessValue({ ciAbs, monthlyTraffic, valuePerConversion }) {
  const [lo, hi] = ciAbs;
  return {
    low: lo * monthlyTraffic * valuePerConversion,
    high: hi * monthlyTraffic * valuePerConversion,
  };
}

export function fmtPct(x, digits = 2) {
  if (!Number.isFinite(x)) return "—";
  if (x !== 0 && Math.round(Math.abs(x) * 100 * 10 ** digits) === 0)
    return (x > 0 ? "+" : "") + (x * 100).toPrecision(2) + "%";
  const s = (x * 100).toFixed(digits);
  return (x > 0 ? "+" : "") + s + "%";
}
