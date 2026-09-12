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
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? 1 - tail : tail;
}

// 标准正态分位数（CDF 的反函数）。Acklam 算法 + 一步 Halley 修正，相对误差 ~1e-9。
export function normalQuantile(p) {
  if (p <= 0 || p >= 1) throw new RangeError(`normalQuantile: p 必须在 (0,1) 内，收到 ${p}`);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
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
export function zTest({ n1, x1, n2, x2 }) {
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
  return mdeType === 'relative' ? baseline * mde : mde;
}

// 每组所需样本量。
// n_control = (z_{1-α/2} + z_{1-β})² · [p₁(1-p₁) + p₂(1-p₂)/k] / (p₂-p₁)²，n_treatment = k · n_control
// k = treatment 与 control 的流量比；k = 1 时退化成教科书公式。
export function sampleSize({ baseline, mde, mdeType = 'absolute', alpha = 0.05, power = 0.8, ratio = 0.5 }) {
  const delta = mdeToAbsolute(baseline, mde, mdeType);
  const p1 = baseline;
  const p2 = baseline + delta;
  if (p2 <= 0 || p2 >= 1) throw new RangeError(`sampleSize: p₂ = ${p2} 越界`);
  if (delta === 0) return { nControl: Infinity, nTreatment: Infinity, total: Infinity, delta, p2 };
  const k = ratio / (1 - ratio);
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(power);
  const variance = p1 * (1 - p1) + (p2 * (1 - p2)) / k;
  const nControl = Math.ceil(((za + zb) ** 2 * variance) / (delta * delta));
  const nTreatment = Math.ceil(nControl * k);
  return { nControl, nTreatment, total: nControl + nTreatment, delta, p2 };
}

// 按日流量算要跑几天。ratio 是 treatment 分到的流量份额。
export function daysNeeded({ nControl, nTreatment, dailyTraffic, ratio = 0.5 }) {
  const dControl = nControl / (dailyTraffic * (1 - ratio));
  const dTreatment = nTreatment / (dailyTraffic * ratio);
  return Math.ceil(Math.max(dControl, dTreatment));
}

// 反推：只肯跑 days 天，能检出的最小绝对提升是多少。二分搜索。
export function mdeForDays({ baseline, days, dailyTraffic, ratio = 0.5, alpha = 0.05, power = 0.8 }) {
  const nControlBudget = Math.floor(dailyTraffic * (1 - ratio) * days);
  let lo = 1e-6;
  let hi = Math.min(1 - baseline, 0.999) - 1e-6;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const { nControl } = sampleSize({ baseline, mde: mid, mdeType: 'absolute', alpha, power, ratio });
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
// 早期门槛极高、后期回落到 c。真正的 OBF 常数 c 要解多元正态积分，这里用可传入的 c 近似。
export function obfBoundary(K, k, c) {
  return c * Math.sqrt(K / k);
}

// ---------- 结果解读 ----------

// 把一组结果翻译成三档结论。规则见 docs/DECISIONS.md。
export function interpret({ n1, x1, n2, x2, alpha = 0.05, power = 0.8 }) {
  const t = zTest({ n1, x1, n2, x2 });
  const ci = newcombeInterval({ n1, x1, n2, x2, alpha });
  const significant = t.pValue < alpha;

  if (significant && t.absDiff > 0) {
    return {
      verdict: 'ship',
      title: '可以全量',
      reasons: [
        `p = ${t.pValue.toFixed(4)} < ${alpha}，差异不是抽样波动能解释的`,
        `95% 置信区间 [${fmtPct(ci[0])}, ${fmtPct(ci[1])}] 不包含 0，下界为正`,
        '注意：显著 ≠ 值得。先看下面的业务换算，用区间下界算最保守的收益',
      ],
      test: t,
      ci,
    };
  }
  if (significant && t.absDiff < 0) {
    return {
      verdict: 'harm',
      title: '显著变差，别推',
      reasons: [
        `p = ${t.pValue.toFixed(4)} < ${alpha}，但方向是负的`,
        `95% 置信区间 [${fmtPct(ci[0])}, ${fmtPct(ci[1])}] 整体在 0 以下`,
        '回滚，然后回头看假设哪里错了',
      ],
      test: t,
      ci,
    };
  }

  // 不显著：区分「还没跑够」和「效应本来就小」
  const observed = Math.abs(t.absDiff);
  const nNow = Math.min(n1, n2);
  let needed = Infinity;
  if (observed > 0 && t.p1 + observed < 1) {
    needed = sampleSize({ baseline: t.p1, mde: observed, mdeType: 'absolute', alpha, power }).nControl;
  }
  if (needed <= 3 * nNow) {
    return {
      verdict: 'continue',
      title: '继续跑，还不够',
      reasons: [
        `p = ${t.pValue.toFixed(4)}，还没过 ${alpha} 的线`,
        `按现在观测到的 ${fmtPct(t.absDiff)} 提升算，每组要 ${needed.toLocaleString()} 人才有 ${Math.round(power * 100)}% 把握检出，现在每组 ${nNow.toLocaleString()}`,
        '继续跑到那个量再看，中途不要因为数字好看就停',
      ],
      test: t,
      ci,
      needed,
    };
  }
  return {
    verdict: 'no-diff',
    title: '差异不显著，别硬推',
    reasons: [
      `p = ${t.pValue.toFixed(4)}，95% 置信区间 [${fmtPct(ci[0])}, ${fmtPct(ci[1])}] 跨过 0`,
      observed === 0
        ? '两组转化率一模一样'
        : `要检出 ${fmtPct(t.absDiff)} 这么小的差异，每组得 ${needed === Infinity ? '∞' : needed.toLocaleString()} 人，是现在的 ${(needed / nNow).toFixed(0)} 倍以上，不值得等`,
      '这个改动大概率没有业务意义上的效果。关掉实验，把流量留给下一个假设',
    ],
    test: t,
    ci,
    needed,
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
  if (!Number.isFinite(x)) return '—';
  const s = (x * 100).toFixed(digits);
  return (x > 0 ? '+' : '') + s + '%';
}
