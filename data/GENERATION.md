# data/GENERATION.md

## 合成数据生成规则

所有实验数据均为合成，场景虚构。生成方式：

### 参数设定

- **种子**：20260915（mulberry32 PRNG）
- **方法**：binomial 抽样 —— 给定 (baseline, treatment, nControl, nTreatment)，用二项分布抽出 xControl 和 xTreatment
- **统计量**：用 zTest 和 newcombeInterval 计算 p 值、置信区间等，写入 stats 字段

### 场景设计原则

1. **生活化**：新人优惠券、结算按钮、推送时机、瀑布流、搜索框、商品详情、订单确认、新人引导、评价晒图、会员续费 —— 都是消费类 App 常见场景，不涉及任何实习公司内部业务
2. **数字合理性**：
   - 转化率范围 5%-70%，符合真实 App 指标分布
   - 样本量 2200-18000，对应 5-14 天实验周期
   - MDE（最小可检测提升）从 0.5% 到 9%，跨越「显著」与「不显著」边界
3. **决策分布**（符合任务要求）：
   - 可全量：4 个（显著提升，业务上值得）
   - 不推（不显著）：4 个（其中 3 个是差异不显著，1 个是「显著但业务上不值得」）
   - 继续跑：1 个（现在不显著，但观测到的效应值如果真实存在，值得继续验证）
   - 回滚：1 个（显著变差）

### 具体参数

每个实验的 baseline / treatment / nControl / nTreatment 见 `scripts/gen-experiments.mjs` 源码。

例如：
- exp-001：baseline=0.08, treatment=0.105, n=5200 → 抽出后 p < 0.001，可全量
- exp-002：baseline=0.42, treatment=0.425, n=3800 → 抽出后 p=0.32，不显著不推
- exp-003：baseline=0.15, treatment=0.16, n=18000 → 显著但只提升 1 个点，业务上不值得

### 复现方法

```bash
npm run gen:experiments
```

种子不变，输出数据完全一致。
