import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sampleSize,
  daysNeeded,
  mdeForDays,
  zTest,
  interpret,
  fmtPct,
} from "../lib/stats.js";
import { simulatePeeking, validatePeekingConfig } from "../lib/peeking.js";
import {
  DEFAULT_READER,
  decodeDraft,
  releaseReadiness,
  readerSnapshot,
} from "../lib/workflow.js";
test("不显著不自动判无效、不按观测效应建议补样本", () => {
  for (const alpha of [0.05, 0.1]) {
    const r = interpret({ n1: 5000, x1: 400, n2: 5000, x2: 400, alpha });
    assert.equal(r.needed, null);
    assert.match(r.title, /不能判定无效/);
    assert.match(
      r.reasons.join(" "),
      new RegExp(Math.round((1 - alpha) * 100) + "%"),
    );
    assert.doesNotMatch(r.reasons.join(" "), /大概率没有|继续跑到那个量/);
  }
});
test("显著也不自动全量；护栏不通过优先阻止", () => {
  const verdict = interpret({ n1: 5000, x1: 400, n2: 5000, x2: 455 }),
    s = { test: verdict.test, ci: verdict.ci, verdict };
  assert.equal(releaseReadiness(s).state, "review");
  assert.equal(
    releaseReadiness(s, {
      validity: "verified",
      guardrails: "pass",
      minAbsEffect: 0,
    }).state,
    "eligible",
  );
  assert.equal(
    releaseReadiness(s, {
      validity: "verified",
      guardrails: "fail",
      minAbsEffect: 0,
    }).state,
    "blocked",
  );
  assert.equal(
    releaseReadiness(s, {
      validity: "issue",
      guardrails: "pass",
      minAbsEffect: 0,
    }).state,
    "blocked",
  );
  assert.equal(
    releaseReadiness(s, {
      validity: "verified",
      guardrails: "pass",
      minAbsEffect: 0.5,
    }).state,
    "review",
  );
  assert.throws(() => releaseReadiness(s, { minAbsEffect: NaN }));
});
test("规划非法参数不产生无穷天数或伪门槛", () => {
  for (const p of [
    { baseline: 0, mde: 0.01 },
    { baseline: 0.1, mde: 0 },
    { baseline: 0.1, mde: NaN },
    { baseline: 0.1, mde: 0.01, ratio: 0 },
    { baseline: 0.1, mde: 0.01, power: 0.5 },
  ])
    assert.throws(() => sampleSize(p));
  assert.throws(() =>
    daysNeeded({ nControl: 10, nTreatment: 10, dailyTraffic: 0 }),
  );
  assert.throws(() => mdeForDays({ baseline: 0.1, dailyTraffic: 10, days: 0 }));
  assert.equal(
    mdeForDays({ baseline: 0.05, dailyTraffic: 0.01, days: 1 }),
    null,
  );
});
test("计数非法或不成整数不进入检验", () => {
  for (const a of [
    { n1: 0, x1: 0, n2: 10, x2: 1 },
    { n1: 10, x1: 11, n2: 10, x2: 1 },
    { n1: 10.1, x1: 1, n2: 10, x2: 1 },
  ])
    assert.throws(() => zTest(a));
});
test("很小的非零区间不显示成零", () => {
  assert.notEqual(fmtPct(0.000034), " +0.00%");
  assert.equal(fmtPct(0.000034), "+0.0034%");
});
test("固定种子与正确的提前停止分母", () => {
  const c = {
    seed: 9,
    nTrials: 30,
    days: 3,
    nPerDay: 50,
    trueP: 0.1,
    alpha: 0.05,
  };
  const a = simulatePeeking(c),
    b = simulatePeeking(c);
  assert.deepEqual(a, b);
  assert.equal(a.results.final.nEarlyStopped, 0);
  assert.equal(a.results.final.nStopped, 30);
  for (const r of Object.values(a.results))
    assert.ok(r.nEarlyStopped <= r.nStopped && r.nStopped <= 30);
});
test("大任务预算、未知策略、非法次数在执行前拒绝", () => {
  const c = {
    seed: 1,
    nTrials: 2000,
    days: 14,
    nPerDay: 500,
    trueP: 0.1,
    alpha: 0.05,
  };
  validatePeekingConfig(c);
  for (const extra of [
    { nTrials: 0 },
    { days: 1.5 },
    { seed: -1 },
    { alpha: 0 },
    { trueP: NaN },
    { strategies: ["missing"] },
    { nTrials: 5000, days: 30, nPerDay: 5000 },
  ])
    assert.throws(() => validatePeekingConfig({ ...c, ...extra }));
});
test("本机草稿只恢复已知字段，不保存人工确认", () => {
  const v = decodeDraft(
    JSON.stringify({
      version: 1,
      values: { ...DEFAULT_READER, validity: "verified" },
    }),
    DEFAULT_READER,
  );
  assert.deepEqual(v, DEFAULT_READER);
  assert.equal(decodeDraft("{", DEFAULT_READER), null);
  assert.equal(
    decodeDraft(
      JSON.stringify({ version: 2, values: DEFAULT_READER }),
      DEFAULT_READER,
    ),
    null,
  );
});
test("导出保留原始输入、条件情景与人工核对边界", () => {
  const v = interpret({ n1: 5000, x1: 400, n2: 5000, x2: 455 });
  const d = readerSnapshot(
    DEFAULT_READER,
    { test: v.test, ci: v.ci, verdict: v, money: { low: 1, high: 2 } },
    { minAbsEffect: 0.005 },
  );
  assert.equal(d.inputs.nControl, 5000);
  assert.equal(d.readiness.state, "review");
  assert.ok(d.readiness.manualChecks);
  assert.match(d.limits.join(" "), /不是系统验证/);
});
test("合成台账单次抽样，继续来自计划，指标方向和护栏未知明确", () => {
  const data = JSON.parse(
    readFileSync(new URL("../data/experiments.json", import.meta.url), "utf8"),
  );
  assert.equal(data.experiments.length, 10);
  for (const e of data.experiments) {
    assert.equal(e.resampleAttempts, 1);
    assert.notEqual(e.decision, "全量");
    if (e.decision === "按计划继续") assert.equal(e.plan.reached, false);
    assert.match(e.review, /护栏未提供观测数据/);
    assert.ok(["higher", "lower"].includes(e.direction));
    assert.equal(e.stats.neededSampleForObserved, undefined);
  }
  assert.equal(
    data.experiments.find((e) => e.id === "exp-007").direction,
    "lower",
  );
});
