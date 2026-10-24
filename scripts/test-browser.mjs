import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const url =
  process.env.TEST_URL || "http://127.0.0.1:8804/growth-experiment-lab/";
const out = process.env.EVIDENCE_DIR || "/tmp/growth-browser";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    channel: process.env.CHROME_CHANNEL || "chrome",
  }),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const tab = (name) =>
  page
    .getByRole("button", { name: new RegExp("^" + name) })
    .first()
    .click();
const field = (name) => page.getByRole("spinbutton", { name, exact: true });
async function download(button, file) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const d = await waiting;
  await d.saveAs(out + "/" + file + ".json");
  return JSON.parse(fs.readFileSync(out + "/" + file + ".json", "utf8"));
}
try {
  await page.goto(url + "#unknown");
  await page.waitForLoadState("networkidle");
  await field("基线转化率（%）").fill("6");
  const plan = await download("导出设计计划", "plan");
  assert.equal(plan.inputs.baselinePct, 6);
  assert.ok(plan.outputs.samples.nControl > 0);
  await field("日流量（人/天，两组合计）").fill("0");
  assert.ok(
    await page
      .getByRole("button", { name: "导出设计计划", exact: true })
      .isDisabled(),
  );
  assert.match(
    await page.locator("body").innerText(),
    /日流量须为有限正数|日流量须为正数/,
  );
  await page.getByRole("button", { name: "恢复示例设计", exact: true }).click();
  await tab("结果解读器");
  await page.getByRole("button", { name: "恢复示例数据", exact: true }).click();
  let d = await download("导出决策记录", "readout");
  assert.equal(d.readiness.state, "review");
  assert.ok(d.readiness.manualChecks);
  await page
    .getByRole("combobox", { name: "分流、埋点与预定停止规则", exact: true })
    .selectOption("verified");
  await page
    .getByRole("combobox", { name: "留存、退款、投诉与成本护栏", exact: true })
    .selectOption("pass");
  await field("预设最低业务提升（百分点）").fill("0");
  d = await download("导出决策记录", "eligible");
  assert.equal(d.readiness.state, "eligible");
  await page
    .getByRole("combobox", { name: "留存、退款、投诉与成本护栏", exact: true })
    .selectOption("fail");
  assert.match(
    await page.locator("body").innerText(),
    /先处理风险，不扩大流量/,
  );
  await field("实验组转化数").fill("400");
  assert.equal(
    await page
      .getByRole("combobox", { name: "分流、埋点与预定停止规则", exact: true })
      .inputValue(),
    "unknown",
  );
  assert.match(
    await page.locator("body").innerText(),
    /证据不足，不能判定无效/,
  );
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.equal(await field("实验组转化数").inputValue(), "400");
  await field("实验组转化数").fill("5001");
  assert.ok(
    await page
      .getByRole("button", { name: "导出决策记录", exact: true })
      .isDisabled(),
  );
  await page.getByRole("button", { name: "恢复示例数据", exact: true }).click();
  await tab("偷看惩罚模拟器");
  await page.getByRole("button", { name: "跑模拟", exact: true }).click();
  await page.getByRole("button", { name: "取消本轮模拟", exact: true }).click();
  assert.match(await page.locator("body").innerText(), /本轮已取消/);
  await field("模拟次数 N").fill("100");
  await field("实验天数 T").fill("3");
  await field("每天每组人数").fill("50");
  await page.getByRole("button", { name: "跑模拟", exact: true }).click();
  await page
    .getByRole("button", { name: "导出模拟记录", exact: true })
    .waitFor();
  const sim = await download("导出模拟记录", "peeking");
  assert.equal(sim.config.nTrials, 100);
  assert.equal(sim.config.days, 3);
  assert.equal(sim.results.final.nEarlyStopped, 0);
  await page
    .getByRole("button", { name: "只看一次（结束时）", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  assert.match(
    await page.getByRole("heading", { name: /在第几天停的/ }).innerText(),
    /只看一次/,
  );
  await field("实验天数 T").fill("5");
  assert.ok(
    await page
      .getByRole("button", { name: "导出模拟记录", exact: true })
      .isDisabled(),
  );
  assert.match(await page.locator("body").innerText(), /以下仍是上一组结果/);
  await field("模拟次数 N").fill("5000");
  await field("实验天数 T").fill("30");
  await field("每天每组人数").fill("5000");
  await page.getByRole("button", { name: "跑模拟", exact: true }).click();
  assert.match(await page.locator("body").innerText(), /采样预算过大/);
  for (const name of [
    "实验设计器",
    "偷看惩罚模拟器",
    "结果解读器",
    "实验记录",
  ]) {
    await tab(name);
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= innerWidth,
        {},
        { timeout: 2000 },
      );
    }
  }
  await page.getByRole("button", { name: /^停止扩流/ }).click();
  assert.ok((await page.locator("article").count()) > 0);
  await tab("结果解读器");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: out + "/mobile-reader.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: out + "/desktop-reader.png", fullPage: true });
  await page.evaluate(() =>
    localStorage.setItem("growth-lab:reader:v1", "{bad"),
  );
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.match(await page.locator("body").innerText(), /旧草稿无法恢复/);
  const c = await browser.newContext();
  await c.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("blocked");
      },
    }),
  );
  const p = await c.newPage();
  await p.goto(url + "#read");
  await p.waitForLoadState("networkidle");
  assert.match(
    await p.locator("body").innerText(),
    /本地存储不可用|草稿保存失败/,
  );
  await c.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: design export/invalid input, manual readiness gates/invalidation, non-significance boundary, draft recovery, worker cancellation/result/export/staleness/budget, keyboard strategy, log filter, 4 tabs × 4 widths, corrupt/blocked storage and reduced motion.",
  );
} finally {
  await browser.close();
}
