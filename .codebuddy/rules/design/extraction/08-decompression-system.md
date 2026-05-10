# 08 — 减压停留系统（Decompression System）

> **本卷优先级：🟡 中**
> 本案的硬核物理拟真支柱：让"上浮"这件事从"秒返水面"变成"必须慢慢停回来"的节奏决策。
> 顶层设计原则 → [../09-extraction-loop-design.md](../09-extraction-loop-design.md)

---

## 一、设计目标

### 1.1 解决什么问题

现状（本功能上线前）：
- 玩家在任何深度救完 NPC 或按撤离就能秒升水面，"深水"的唯一代价只有氧气消耗
- "潜水衣极限深度"只在**超过**时给惩罚（氧气 ×3），没形成深度上的节奏感
- 玩家的上浮永远是"一条直线冲出水面"，缺少潜水纪录片里最具辨识度的画面之一：**在几米深度静止悬停等减压**

目标：
- 把"深潜 + 上浮"这两件事做成**有节奏、有决策、有痛感**的完整闭环
- 让"上浮"变成一个**2~4 次小停留的组合动作**，天然阻止玩家在深层乱冲
- 失败有硬核后果（与 o2 耗尽 / 食人鱼咬死同级），让玩家一次就长记性

### 1.2 设计原则

1. **隐式算法、显式反馈**：内部做简化氮气负荷计算（单值），玩家只看到 HUD 上一个"减压灯"
2. **锁定不可逃**：一旦触发减压任务就锁死，只有**按顺序完成所有档位**才能解锁。浅水漂泊不能自然排氮绕过任务
3. **失败 = 撤离失败**：强行出水 = `surfacingReason='deco'` 失败，战利品全损 + 下次 O2Max 打折 + 紫标 debuff，与 o2 / fishkill 同级
4. **可跳过但有代价**：不是"卡死玩家"，而是"让玩家主动选择承担后果"。长按撤离完成即走 deco 失败
5. **新手护盘**：吸氮阈值 20m 比现实的 10m 宽，早期 30m 以内的浅关几乎见不到这个系统

---

## 二、真实潜水减压知识（游戏化前的参考）

### 2.1 为什么要减压

- 水下每 10m 环境压力 +1 atm，身体组织吸收的氮气溶解量随压力线性增加
- 上升速度过快时，组织里的氮气来不及平衡，会像开可乐一样析出气泡堵在血管/关节里 → **减压病（DCS）**
- 现代休闲潜水表用 **Bühlmann ZH-L16** 算法，把身体建模成 16 种"组织隔室"分别算氮分压

### 2.2 减压停留档位（现实潜水电脑表的典型值）

| 深度 | 用途 |
|---|---|
| **3 m** | 安全停留 / 最后一档减压停留（几乎所有潜水都做，3 min） |
| **6 m** | 中等减压深度 |
| **9 m** | 深层减压第一档 |
| **12 m** | 技术潜水 deco 第一档 |

### 2.3 NDL（免减压极限）参考

| 深度 | NDL（PADI）|
|---|---|
| 18 m | 56 min |
| 20 m | 45 min |
| 30 m | 20 min |
| 40 m | 9 min（休闲极限）|

游戏里不追求医学精度，**单值 nitrogenLoad 模型**足够制造"深度 + 时间 → 必须做减压"的体感。

---

## 三、运行时模型

### 3.1 氮气负荷（核心变量）

- 单值 `nitrogenLoad ∈ [0, 2]`
- 每秒吸排速率按深度分段：

```
depth > ingestDepth（默认 20m）：
  rate = ingestRatePerSec × (depth - ingestDepth)
  if depth > maxDepthAllowed（装备极限）：rate *= overDepthRateMul（2x）
  nitrogenLoad += rate × dt

10m ≤ depth ≤ 20m：
  平衡区，不变化（模拟组织平衡）

depth < releaseDepth（默认 10m）：
  nitrogenLoad -= releaseRatePerSec × dt（约 16s 清空 1.0 负荷）
```

### 3.2 阈值与减压灯颜色

| level | 阈值 | HUD 灯 | 含义 |
|---|---|---|---|
| 0 | < 0.6 | 绿（暗点 + "N₂"） | 免减压，安全出水 |
| 1 | 0.6 ~ 1.0 | 黄（DECO 字 + 百分比） | 已进入减压潜水 |
| 2 | 1.0 ~ 1.3 | 红（脉冲红框 + 警告三角） | 中度负荷 |
| 3 | > 1.3 | 深红（快闪） | 严重负荷 |

### 3.3 任务锁定模型（核心规则）

```
           ┌─ 下水 ─┐
           │       ▼
     [正常潜水] ──首次 N₂ >= 0.6──▶ [任务锁定中 lockActive=true]
           ▲                                │
           │                                ├─ 完成所有档位 ──▶ [解锁] ──▶ [可撤离]
           │                                │
           └────── 新一潜 ◀─── deco 失败 ◀──┴─ 强行撤离 / 出口滞留 5s
```

**锁定期间的不变量**：
- 自然排氮**不会**解除任务（玩家不能靠"飘到浅水"绕过减压）
- 主动撤离长按完成 → 直接判 `deco` 失败
- 救援到出口：第一次弹警告，滞留 5 秒仍锁定 → 判 `deco` 失败
- 氧气耗尽 / 食人鱼咬死 + 锁定中 → 在失败之上**叠加** DCS 惩罚

### 3.4 减压任务生成规则

任务以"从最深档开始，按顺序 12 → 9 → 6 → 3 m 完成"的方式组织。起始档位由 **首次进入黄线时的等级**决定：

| 进入时等级 | 起始档索引 | 需要做的档 |
|---|---|---|
| 黄灯（≥ 0.6） | 3 | 3m（单档 = 现实中的"安全停留"） |
| 红灯（≥ 1.0） | 2 | 6m → 3m |
| 深红（≥ 1.3） | 1 | 9m → 6m → 3m |
| critical（≥ 1.5） | 0 | 12m → 9m → 6m → 3m |

一旦玩家在深档期间继续累积氮负荷升到更高等级，**任务档位不会回补**，但 nitrogenLoad 会继续涨，最终影响 `triggerDecoPenaltyOnSurface()` 写入惩罚的 severity。

### 3.5 单档停留判定

每一档独立：`stopDepths[i]`、`stopHoldSec[i]`、`stopReduce[i]`。

**"在档内"的判定**：同时满足
- `|player.depth - stopDepths[i]| ≤ depthTolerance`（默认 ±1.5m）
- `|player.vy| < holdSpeedMax`（默认 0.8 像素/帧）

在档内时 `stopProgress[i] += dt × speedMul`（speedMul 默认 1、长按加速时 = speedUpMul）。
进度满 `stopHoldSec[i]` → 完成本档：
- `nitrogenLoad -= stopReduce[i]`（12/9/6/3m 分别减 0.3 / 0.35 / 0.40 / 0.45）
- `currentStopIdx` += 1
- 若 currentStopIdx 越过最后一档 → `lockActive = false`、`nitrogenLoad = 0`、任务完成

### 3.6 数值表（默认配置）

| 档 | 深度 | 停留时长 | 减负荷 |
|---|---|---|---|
| 0 | 12 m | 3 s | 0.30 |
| 1 | 9 m  | 5 s | 0.35 |
| 2 | 6 m  | 8 s | 0.40 |
| 3 | 3 m  | 12 s | 0.45 |

全部做完合计 **28 秒**（对应现实约 28 分钟的重度 deco），能把 critical 档位的 1.5 氮负荷完全清零。

---

## 四、长按加速

### 4.1 规则

- 玩家长按 HUD 减压灯（走 HUD `supportsLongPress` 长按回调）时：
  - `setDecoBoost(true)` → `runtime.boostActive = true`
- 判定"有效"需同时满足：`boostActive && inHoldWindow && currentStopIdx >= 0`
- 有效时：
  - `stopProgress` 推进速度 × `speedUpMul`（默认 5×）
  - 氧气消耗 × `speedUpO2Mul`（默认 3×）

### 4.2 数学推演

加速一段 15 秒的减压：
- 正常：15s 实时、耗氧 15 秒 × 1×
- 长按加速：15 / 5 = 3s 实时、耗氧 3 秒 × 3× = 9 秒氧（**省 6 秒氧 + 省 12 秒真实时间**）

**是一个强诱惑按钮**，给玩家"用氧换时间"的明确权衡。

### 4.3 视觉反馈

HUD 减压灯在长按加速时：
- 进度环颜色从蓝绿变亮黄
- 中央"×5"小字叠加（替代剩余秒数）
- 外晕脉冲变亮黄

---

## 五、DCS 惩罚（跳过减压出水的后果）

### 5.1 触发条件

`triggerDecoPenaltyOnSurface()` 在 `finishMazeDive()` 里、`onExtractionDiveEnd()` 之**前**调用。

**仅在 `lockActive=true` 时触发**（未进过黄线 / 已完成减压 = 安全，不惩罚）。

### 5.2 severity 分级

| severity | 触发条件 | 含义 |
|---|---|---|
| 1 | lockActive=true && N₂ < thresholdCritical | 轻度 DCS |
| 2 | lockActive=true && N₂ >= thresholdCritical | 重度 DCS |

### 5.3 惩罚内容（写入 `state.extraction.decoPenalty`）

| 字段 | lv1 | lv2 |
|---|---|---|
| `o2MaxMul` | 0.70（-30%） | 0.70（-30%） |
| `remainingDives` | 1 | 2 |
| `currentLootMul` | 0.5 | 0.0 |
| 紫标 debuff | ❌ | ✅ |

- **O2Max 打折**：`Loadout.applyLoadoutForDive()` 里读取 `getPenaltyO2MaxMul()`，把本次下潜的 `player.o2Max` 按倍率缩减。玩家登水时氧气瓶总容量就变小了。
- **战利品打折**：`Economy.settleDiveExtraction()` 里读 `getPenaltyLootMul()`，按倍率随机丢弃保留物品（lv1 = 50% 物品进 lost，lv2 = 全部进 lost）。效果上相当于"减压病发作让玩家吐出/摔碎一部分战利品"。
- **remainingDives**：每次 `finishMazeDive` 调 `consumeDecoPenaltyDive()` -=1，减到 0 时清除整个 decoPenalty。lv2 的 2 次意味着"下潜 → 结算 → 再下潜"两轮都带着 debuff。
- **紫标 debuff（lv2）**：`isPurpleDebuffActive()` 返回 true，岸上 UI 可据此显示紫色徽章（当前阶段未接入岸上 UI）。

### 5.4 惩罚叠加规则

- 撤离失败（o2 / fishkill）+ 锁定中：照常走失败失败流程（战利品全损、装备销毁），**同时**写入 DCS 惩罚。玩家"溺水 + 减压病"双重打击，下一潜 O2 上限 -30%，再一次错就很难回本。
- 已有未消耗的 lv2 惩罚 + 本次又触发 lv1：保留 lv2，但 `currentLootMul` 取更严的值（`min(existing, new)`）。

---

## 六、UI 体系

### 6.1 HUD 减压灯（`src/render/HUDTopLeft.ts`）

左上角 HUD 栏第 3 位（氧气环 → 深度仪表 → **减压灯** → 手动挡 → 音频 → 探知仪 → GM）。

可见条件：`lockActive || nitrogenLoad > 0 || isDecompressionRequired()`。首次下过 20m 后就常显，避免突然出现造成困惑。

**四种视觉状态**：

| 状态 | 图标表现 |
|---|---|
| 绿灯 | 暗蓝底 + 中央 2px 绿点 + 底部 "N₂" 小字 |
| 黄灯 | 暗黄底 + 中央 "DECO" 字 + 底部百分比 |
| 红/深红 | 红底脉冲 + "DECO" + 底部警告三角（深红时快闪） |
| 正在做减压（stop 存在） | 蓝绿 progress 环 + 中央档位深度数字（12/9/6/3）+ "m" + 底部剩余秒数 |
| 长按加速（boost + inHoldWindow） | 亮黄 progress 环 + "×5" 小字 + 外晕亮黄脉冲 |

**tip 文案**（短按弹 2s 浮窗）：
- 绿灯：`氮气：XX%（安全）\n深度：Nm\n（深于 20m 开始累积）`
- 有任务：`氮气：XX%\n下一档：Xm（剩 X.Xs）\n✓ 已在档内 / ↑上浮 / ↓下沉\n长按 5× 加速（耗氧 3×）`
- 锁定中追加："🔒 强行出水 = 重度减压病"

### 6.2 教学文案（首次触达黄线）

`consumeDecoWarningRequest()` 在 MazeLogic.updateMaze 里轮询：

> ⚠ 氮气累积，必须做减压停留！
> 出水前需在 12/9/6/3m 逐段停留
> 不完成减压直接出水 = 重度减压病

只在一次下潜里弹一次（`runtime.hasShownWarning` 标志）。

### 6.3 `surfacingReason='deco'` 失败画面

`RenderMazeUI.ts::drawMazeHUD` 的 `failed` 分支新增 deco 色调：

- 紫色色罩（`rgba(60, 10, 55, 0.35*k)`）+ 边缘紫色径向压缩（关节疼痛视觉联想）
- 主文字 "撤离失败"（紫色）
- 副文字 "未完成减压 · 重度减压病 · 本次物品全部遗失"（暗紫）
- 失败分支中玩家物理：`vy` 被持续推到正值（下沉 + 抽搐感 animTime × 2）

### 6.4 结算页标签（`DebriefExtension.ts`）

`reasonLabel` 新增映射：`deco → '撤离失败 · 减压病'`。

---

## 七、配置（CONFIG.deco）

全部参数在 `src/core/config/gameplay.ts` 的 `deco` 子对象下，共 24 项，GM 面板"减压"Tab 全量暴露。

核心分组：

| 分组 | 参数 | 含义 |
|---|---|---|
| 总开关 | `enabled` / `hudVisible` | 系统开关、HUD 减压灯可见 |
| 吸排速率 | `ingestDepth` / `ingestRatePerSec` / `releaseDepth` / `releaseRatePerSec` / `overDepthRateMul` | 氮气吸排模型 |
| 阈值 | `thresholdGreen/Yellow/Red/Critical` | 四档灯颜色阈值 |
| 档位表 | `stopDepths[]` / `stopHoldSec[]` / `stopReduce[]` / `startIdxByLevel[]` | 4 档减压停留 |
| 停留判定 | `depthTolerance` / `holdSpeedMax` | 档内判定容差 |
| 长按加速 | `speedUpMul` / `speedUpO2Mul` | 5× 速度 / 3× 耗氧 |
| 惩罚 | `penalty.o2MaxMulLv1/Lv2` / `durationDivesLv1/Lv2` / `lootMulLv1/Lv2` | DCS 两档惩罚参数 |

---

## 八、与其他系统的关系

### 8.1 与"潜水衣极限深度"

现有系统：`state.mazeRescue.maxDepthAllowed`（由潜水衣 `EquipmentEffects.maxDepthMeters` 写入），深于此值时氧气 ×3、画面边缘红雾。

减压系统叠加：**深于 `maxDepthAllowed` 的区域，吸氮速率再 × `overDepthRateMul`（默认 2）**。等于鼓励玩家买更好的潜水衣既能下更深，又能推迟 DCS 的到来。

### 8.2 与"氧气瓶系统"

长按加速时 `getDecoO2Mul()` 返回 3，被调用方（理论上由 BreathSystem 的阶梯耗氧读取）乘到每口吐气的消耗上。

**当前实现状态**：`getDecoO2Mul()` 已导出，但 BreathSystem 的 `consumeBreathO2()` 还没接入这个倍率。下次迭代需要在 `BreathSystem.consumeBreathO2()` 返回值处乘 `getDecoO2Mul()`，才能真正实现"长按加速 = 3× 耗氧"的设计意图。

### 8.3 与"撤离"按钮

原流程：`retreatHolding` 完成 → `phase='surfacing'` → 弹射出水 → `finishMazeDive('retreat')`（完整撤离）。

新流程：
```
retreatHolding 完成：
  if (isDecoLockActive()):
    phase = 'failed'
    surfacingReason = 'deco'
    → 玩家看到紫色失败画面 + 战利品全损
  else:
    phase = 'surfacing' → 正常弹射出水
```

### 8.4 与"救援成功"

原流程：带 NPC 到出口 → `phase='rescued'` → 结算成功。

新流程：
```
带 NPC 到出口：
  if (isDecoLockActive()):
    if 首次触发:
      storyManager 弹警告"未完成减压！"
      记录 _decoBlockedRescuedSince = Date.now()
    else if (Date.now() - since) > 5000:
      phase = 'failed'
      surfacingReason = 'deco'
      → 即便带着 NPC 也判失败（叙事层面 = "救援者自己死了，伤员也没救成"）
  else:
    → 正常 rescued 成功
```

### 8.5 与未来装备体系

CCR（闭式循环潜水衣）在现实里用特殊气体几乎不产生 DCS。若未来想让 `suitCCR` 免疫 DCS，可以：
- `EquipmentEffects` 加 `decoImmune?: boolean`
- `updateDecompressionSystem()` 开头检查装备的 `decoImmune`，为 true 时 return，不累积氮气
- 价格上把 CCR 调高作为"免减压"的代价

当前版本未实现，留作接口挂钩。

---

## 九、文件与落点一览

### 新建
- `src/logic/DecompressionSystem.ts`（~370 行）——核心运行时 + 对外 API
- `.codebuddy/rules/design/extraction/08-decompression-system.md`（本文档）

### 修改
| 文件 | 改动 |
|---|---|
| `src/core/config/gameplay.ts` | 新增 `deco` 子对象（24 参数） |
| `src/logic/MazeLogic.ts` | import + `startMazeDive` 重置 + `updateMaze` 每帧 tick + `finishMazeDive` 写入惩罚 + 撤离/胜利检测处锁定判定 + failed 分支 deco 物理 |
| `src/extraction/core/ExtractionState.ts` | 新增 optional `decoPenalty` 字段 |
| `src/extraction/logic/Loadout.ts` | 应用 `getPenaltyO2MaxMul()` 对 O2Max 打折 |
| `src/extraction/logic/Economy.ts` | `ExtractReason` 加 `'deco'`；settle 里按 `getPenaltyLootMul()` 随机丢弃保留物品 |
| `src/extraction/logic/ExtractionDive.ts` | `onDiveEnd` switch 加 `'deco'` 分支 |
| `src/extraction/render/DebriefExtension.ts` | reasonLabel 加 `deco → '撤离失败 · 减压病'` |
| `src/render/HUDTopLeft.ts` | 新增 `deco` HUD 项（支持长按）+ `drawDecoIcon` 绘制函数 |
| `src/render/RenderMazeUI.ts` | failed 分支 deco 紫色画面 + 副文字 |
| `src/gm/GMConfig.ts` | 新增"减压" Tab（24 参数 + 8 测试按钮） |
| `src/gm/GMPanel.ts` | 7 个减压相关 action 处理（setYellow/Red/Critical/Clear/TriggerLv1/Lv2/ClearPenalty/Dump）|

---

## 十、典型陷阱

1. **`lockActive` 不能被"数值清零"绕过**：早期实现曾因 "N₂ < thresholdGreen × 0.5 时任务自动取消" 让玩家靠浅水漂泊绕过减压。必须在浅水排氮的同时保留 `lockActive=true`，只有完成全部档位才清除。
2. **GM `decoSetYellow/Red/Critical` 会"触发下一帧自动生成任务"**：因为系统 update 里检测 `lockActive=false && level>=1` 就会生成。GM 调试时如果想纯测试数值不想锁，先 `decoClear`。
3. **`consumeDecoPenaltyDive()` 调用顺序**：必须在 `triggerDecoPenaltyOnSurface()` 之后、但不能在其前；否则刚写入的 `remainingDives` 就会被立刻减 1 到 0 并清除。当前实现里两者都在 `finishMazeDive()` 内按"写入 → settle → consume"的顺序。
4. **`currentLootMul` 只用一次**：`consumeDecoPenaltyDive()` 每次消费时把 `currentLootMul` 置 undefined，避免下一次下潜再打折（只有第一次撤离"真的吐掉战利品"，后续 remainingDives 只影响 O2Max）。
5. **救援出口滞留 5s 判死**：用 `_decoBlockedRescuedSince` 时间戳，玩家如果退出再进来游戏，这个值是 0 会立刻失效。当前实现里把它放在 `mazeRescue` 下；若之后改存盘要小心别带着老时间戳导致读档瞬间判失败。
6. **老存档兼容**：`decoPenalty` 是 optional 字段，老存档 undefined = 无惩罚，不需要 patch。但**老存档如果存在减压任务进行中的运行时**（其实不会，运行时不进存档）则自动 reset。
