---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
# 雅各布井开发计划

> **本文档由 AI 自行维护**，记录所有待开发需求、优先级、任务拆分与完成状态。
> 每次迭代开始时，AI 应先阅读本文档，自行决定本次要做什么，做完后更新进度。
> 已完成工作的详细记录归档在 [09-completed-work-archive.md](./code/09-completed-work-archive.md)。

---

## 一、需求总览与优先级

| 编号 | 需求名称 | 优先级 | 状态 | 备注 |
|------|----------|--------|------|------|
| P1 | 角色表现（重绘潜水员） | 🔴 高 | 🟡 进行中 | **本轮完成全身动画增强**：引入躯干波动相位时钟统一驱动 idle/forward/turn 三种状态的 yaw/roll/compress/手臂摆动/头部蛇形传导；转向时身体明显侧倾（约 16°满量）+ Y 轴压扁模拟 3D；idle 下腿部保留呼吸微幅；手电发光位置待修 |
| P2 | 手电筒光照改进（VPL连续化） | 🟡 中 | ⬜ 未开始 | 离散虚拟光源 → 连续反射面 |
| P3 | 生命系统增强 | 🟢 低 | 🟡 部分完成 | **呼吸气泡 + 呼吸音已接入**；**撞岩石惩罚已接入**；**本轮新增：呼吸压强系统 + 阶梯式氧耗 + 肺图标 + 呼吸浮力**（见 T3.7/T3.8/T3.9/T3.10） |
| **P4** | **地形序列化系统** | 🔴 高 | 🟡 部分完成 | 第一阶段完成：种子 + PRNG + 地图重建 + v3 存档；好友分享编码待做 |
| P5 | 迷宫模式本地存档 | 🔴 高 | ✅ 已完成 | v3 种子版存档：地图结构靠 seed 重建，单次下潜 ~10~30KB，远低于 Android 上限 |
| **P6** | **氧气瓶拾取系统** | 🔴 高 | ✅ 已完成 | 聚落大概率刷新，贴岩石表面，轮盘按住安装，完整视觉反馈；同 seed 已消耗不再刷；增强：每瓶外观随机（瓶体色/锈蚀/阀门/标签/裂口/倾倒）+ "前人遗物"伴生物件（潜水镜/潜水衣/布条碎片，40/25/20/15 组合），全部确定性派生 |
| **P9** | **生命探知仪** | 🔴 高 | ✅ 第三版已完成 | 迷宫模式 play 阶段，NPC 绑绳前持续以 #D/F 双音节奏提示距离；越近越快；发现 NPC 后继续响，只有绑绳成功才停；**图标改为"同心圆脉冲波纹"仪表盘**：每次"嘀"响从中心向外扩散一圈波纹，波纹队列化管理（最多同时 6 个），信号越强波纹越密；**两音间隔也随距离渐进**（远 150ms → 近 80ms），近处不再黏成一个音；玩家身上 LED 保留作世界同步反馈；Web Audio 合成音；GM 面板"探知仪"Tab 全参数可调（`beepIntervalMaxMs` / `beepIntervalMinMs` 替代原 `beepIntervalMs`） |
| **P10** | **左上角 HUD 管理器** | 🟡 中 | ✅ 已完成 | 新建 `HUDTopLeft.ts` 统一管理迷宫模式左上角四项（氧气环/手动挡/音频/探知仪）；竖向等距布局 + 入场滑入动效；统一交互：**全部只短按=主操作+弹 tip**（2s 自动消失，淡入淡出），不再支持长按；**氧气图标中心改为 O₂ 脚标文字**；所有硬坐标 hit-test 从 `input.ts` 收口到 HUDTopLeft，`drawAudioToggle` 独立绘制已废弃；**本轮增强**：GM 按钮也并入 HUD 栏作为第 5 项（齿轮图标，打开时橙色旋转 + "ON" 标签）；旧的屏幕顶部中央独立 GM 按钮下线，`GMConfig.BTN_X/BTN_Y` 改为 -999 占位、`drawGMButton` 改为 no-op，`handleGMTouchStart` 不再做按钮 hit-test；切换入口统一为 `toggleGMOpen()`；**GM 面板边界放开**：`handleGMTouchMove` 中的 `Math.max(0, Math.min(logicW - PANEL_W, ...))` 夹紧全部删除，面板可被拖到屏幕外（方案 A：GM 按钮只在迷宫 HUD 栏出现，菜单/主线/竞技场不再提供入口） |
| **P12** | **画质分档 + FPS 自适应** | 🔴 高 | ✅ 已完成 | **第二版重构（PC 游戏式预设系统）**：删除泥沙光照遮挡（`computeSiltAttenuation` + shader silt 采样 + silt 纹理全部清理，`siltSampleSteps/siltAbsorptionCoeff/siltInfluenceRadius` 三个 CONFIG 参数删除）；画质系统从 `levels[0~3]` 索引驱动改为 `preset` 预设驱动（low/medium/high/ultra/custom），预设切换同步写入 5 个小项（scale/rayCount/vplMax/enableScatter/enableNpcVol），手动改小项自动置 custom，auto 模式实时改小项；射线数量 `rayCount` 从全局 CONFIG 移入 `quality.rayCount`（low=10/medium=60/high=180/ultra=360），VPL 上限同步调整（low=3/medium=32/high=96/ultra=128）；GM 面板新增 `select` 控件类型（左右箭头 `[<] 值 [>]`），性能 Tab 重做为预设下拉 + 5 个小项 + 自适应参数共 17 项；**本轮增强**：(1) low 档新增 `skipOcclusion` 开关——`getLightPolygon()` 开头直接早退生成无遮挡扇形，跳过"每条射线对所有障碍物的求交循环"这段 `light.cpu` 最贵的计算，代价是光锥"穿墙"；预设映射 low=true / medium/high/ultra=false；GM 面板"跳过遮挡(穿墙)"布尔条目可单独切换。(2) `autoMaxLevel` 2→3，auto 模式现在可以自动升到 ultra。(3) **`quality.auto` 默认 `true → false`**（用户反馈 auto 策略不够准，先默认关掉，等策略稳定再开）。(4) **修复 GM 面板"性能HUD / mark-measure / HUD字号"三项点不开 bug**：`CONFIG.perfHUD` 对象之前没定义，`setConfigValue('perfHUD.enabled', ...)` 在 `obj = CONFIG['perfHUD']` 拿到 undefined 时会被 `if (obj != null)` 早退静默失败；在 config.ts 的 quality 块后补上 `perfHUD: { enabled: false, enableMarks: false, fontSize: 11 }` 默认对象即可修复。 |
| **P13** | **迷宫模式救援概念包装** | 🟡 中 | ✅ 已完成 | 把迷宫模式从"自己潜水玩"包装为"当地洞穴救援者接警出勤"的叙事体验，3 个全屏叙事页 + 岸上放弃按钮 + 结案后留本关状态：(1) **警情通报页 `briefing`**：首次进入新地图时以 overlay 形式覆盖岸上，暗墨绿调度屏幕风 + 红色闪烁 ALERT + 案件编号（从 seed 派生 `JWR-xxxxxx`）+ 伪 GPS 坐标 + 接警时间 + 任务指令 + 底部"接受任务"按钮；点击后 `briefingShown` 置 true 并存档，之后不再弹。(2) **救援成功叙事页 `resolved`**：在原 `rescued` 数据页的"下一局"按钮改为"继续 ▶"，点击进入该页；晨光暖色 + 绿色盖章"案件结案 · 成功营救" + 行动报告（出勤次数/最大深度/铺绳/已移交医疗组）+ 3 行克制叙事 + 双按钮：`[留在此处]`（切 phase 到 `resolved_idle`）/ `[接受新的任务 ▶]`（清档 + 生成新地图）。(3) **搜寻终止叙事页 `abandoned`**：岸上长按"放弃救援"按钮（2 秒完成）触发；冷灰蓝调 + 红色盖章"案件结案 · 搜寻终止" + 行动记录（含探索覆盖率）+ 3 行叙事 + 单按钮"接受新的任务 ▶"。(4) **`resolved_idle` 留本关状态**：岸上画面保留，但水面入口盖黑"本案已结案"遮罩并屏蔽下潜；右上角新增绿色"接受新的任务 ▶"按钮随时可离开；下潜记录仍可查看；`phase === 'resolved_idle'` 随存档持久化。(5) **概念语言**统一用"救援调度中心 / 紧急通报 / 案件编号 / 被困者 / 出勤 / 结案"这套叙事术语。**第二版增强**（本轮）：(A) **安全区适配** —— 三个全屏页都按 `SAFE_TOP=58 / PAD_X=28` 的安全常量重排，顶部 ALERT 条的 EMERGENCY 文字居中改在 `[PAD_X, cw-108]` 区间（避让微信小游戏右上角胶囊），盖章和四栏数据都在 `[PAD_X, cw-PAD_X]` 内等分，伪 GPS 坐标过长时自动在标签下一行全宽显示（而不是被右边胶囊挤切）。(B) **入场动效** —— `state.mazeRescue` 新增 `briefingEnterTime / resolvedEnterTime / abandonedEnterTime` 三个时间戳；渲染层用 `t = (Date.now() - enterTime) / 1000` 做相对时钟驱动入场：警情通报页的顶部 ALERT 条从上方滑入（easeOutCubic 0.5s）+ 打字机每字符 0.03s 逐字揭示 + 光标闪烁 + 雷达扫描线周期扫过 + 按钮扫光；成功/终止页顶部盖章 punch（scale 1.7→1.0 easeOutCubic 0.5s + 0.2s 微过冲）+ 行动报告数字 count-up（easeOutQuad 0.8s）+ 叙事 3 行逐行淡入（每行间隔 0.5s）+ 按钮等 3.8~4s 后才出现（保证玩家看完叙事）+ 按钮扫光 + 暖色尘埃粒子 / 冷色噪点 / 缓慢上浮气泡。(C) **放弃救援按钮重做** —— 替换原"大块红色填充"的丑陋版本：新版 124×36 深石板灰底 + **虚线描边（公文/表单感）** + **左侧矢量对讲机图标**（主体 + 屏幕 + 按钮点 + 天线 + 天线尖顶呼吸红点）+ 右侧细体文字"结束搜寻 ⇥"（未按）/"持续按住 …"（长按中）；长按时描边颜色切换为暗红 + 按钮**外缘画一圈红色环形进度**（用 `setLineDash([totalLen * progress, totalLen])` 按进度截取圆角矩形周长）而非大面积填红，更克制；位置从屏幕底部上移到 `y = clamp(112, ch*0.22, ch-480)`，不再与底部"探索记录"卡片打架。文件改动：`src/core/state.ts`（`mazeRescue` 新增 `caseNumber / briefingShown / briefingEnterTime / resolvedEnterTime / abandonedEnterTime / abandonHolding / abandonHoldStart / abandonTouchId / caseResultTimer` 9 个字段）；`src/logic/MazeLogic.ts`（`buildCaseNumberFromSeed` + 新增 `abandonCase / acceptNewCase / stayInResolvedCase / markBriefingShown` 四个对外函数 + `updateMaze` 新增 `resolved_idle / resolved / abandoned` 三个 phase 分支，后两者推进 `caseResultTimer`；`abandonCase` 写入 `abandonedEnterTime`）；`src/logic/MazeSave.ts`（`loadMazeProgress` 恢复 phase 时保留 `resolved_idle`，其它一律强制为 `shore`；读档分支兜底三个 enterTime 字段）；`src/logic/Logic.ts`（转导出四个新函数）；`src/render/RenderMazeUI.ts`（新增 `drawCaseBriefing / drawCaseResolved / drawCaseAbandoned / drawAbandonBtn / drawResolvedIdleNewCaseBtn` 5 个绘制函数 + `stampPunchAnim / animCountUp / buildRoundedRectPerimeter` 3 个辅助函数 + `getBriefingAcceptBtnRect / getAbandonBtnRect / getResolvedIdleNewCaseBtnRect / getResolvedBtnRects / getAbandonedAcceptBtnRect` 5 个矩形导出；`drawMazeHUD` 分发补 3 个新 phase；rescued 页按钮文案"下一局"→"继续 ▶"）；`src/core/input.ts`（`initInput` 新增 5 个回调：`onAbandonCase / onAcceptNewCase / onStayInResolvedCase / onMarkBriefingShown / onEnterResolved`；shore `touchStart` 检测放弃按钮按下；`touchMove` 持续判定长按 2s 完成 + 手指离开按钮自动取消；`touchEnd` 松手取消长按、briefing 页拦截、resolved_idle/resolved/abandoned 三个新 phase 按钮 hit-test；rescued 页"继续"→`onEnterResolved` 写入 `resolvedEnterTime`；shore 点击下潜前判 resolved_idle 屏蔽）；`game.ts`（接线 5 个新回调）。**典型陷阱**：(a) 不能用 `String.padStart`，当前 TS 目标 ES2016；用手写 `padLeft / padL2`。(b) `rescued` 阶段 finishMazeDive 会把 phase 覆写成 `debrief`，需 `maze.phase = 'rescued'` 再覆盖一次（原有代码已做）；不要改动这个顺序。(c) 老存档 `briefingShown` 缺失时兜底为 false，会重新触发警情通报——这对老玩家算沉浸回归；接受。(d) 动效时钟用 `Date.now() - enterTime`，不是 `CONFIG.screenTime` 或 `state.time`——因为全屏页可能在不同 phase 切换时被清零，需要独立时钟。 |

---

## 二、待办任务详情

### P1：角色表现——待修复问题与剩余任务

**当前已知问题**：

1. **缺少 roll 方向身体滚动表现**（高优先）
   - 当前移动时身体完全没有左右微微滚动的表现
   - 真实潜水员在踢水和转向时，身体会沿前进方向轴产生轻微的左右 roll 倾斜
   - 这个 roll 滚动对于用 2D 动画塑造 3D 立体感非常关键
   - 实现思路：根据当前踢水侧（左腿/右腿）和转向方向，给身体整体施加一个小角度的 roll 偏移，通过缩放或错位模拟倾斜效果
   - 踢左腿时身体微微向右倾，踢右腿时微微向左倾；转向时向转弯内侧倾斜

2. **腿部和脚蹼造型与动画错误**（高优先）
   - 当前腿部和脚蹼的形状不正确，需要重新审视造型
   - 踢水动画的运动轨迹和节奏需要修正
   - 脚蹼应该有更明显的柔性弯曲表现

3. **手电筒发光位置错误**（中优先）
   - 当前手电筒光源发射点的位置不正确
   - 需要调整到潜水员手持手电的正确位置（通常在身体前方偏右/偏左手位置）
   - 光源位置应跟随角色朝向和 roll 倾斜同步更新

**剩余开发任务**：

- [ ] T1.1 确保不同朝向下的绘制正确性
- [ ] T1.2 真机表现细调（踢水节奏、拐弯协同、局部轮廓）
- [x] T1.3 实现移动时的 roll 方向身体滚动表现（2D 模拟 3D 倾斜）——**本轮已完成第一版**：引入"躯干波动相位时钟" `bodyClock`，三种频率分量（idle/forward/turn）叠加推进，驱动全身动画统一。改动涉及：**身体 roll** 从 0.12→ 转向时 `turnVisual * 0.28`（约 16° 满量），并用 Y 轴缩放模拟 3D 压扁（`rollSquashFactor` + `rollSquashMax`）；**身体 yaw** 改为躯干波 + turnVisual 双驱动；**躯干呼吸压缩** 用二次谐波驱动轻微起伏；**头部蛇形传导**：头部 Y 方向偏移（`headYawLead`），表现"头先转、身后跟"；**手臂常驻漂摆** `armBodyWaveAmp`：idle + forward 时双臂随躯干波反相摆动，即使贴身也保留 40%；**转向时手臂倾斜** `armTurnLeanFactor`：两臂同向偏移表现"掌舵"；**idle 腿部呼吸** `legIdleAmpNorm` + `legIdleFreqFactor`：静止漂浮时双腿保留微幅呼吸动作（非完全归零）；**idle 身体呼吸漂移** `bodyIdleDriftAmp`：整体位置跟随躯干波轻微漂动。同时修复自动挡 `updateAutoDriveVisual()` 中 turnAbs 归一化从 0.6→0.22 rad，让正常巡游的小转向也能触发明显视觉。`CONFIG.diver` 新增 24 个参数并接入 GM 面板"角色"Tab。
- [x] T1.4 修正腿部和脚蹼的造型与踢水动画（腿改为锥形大腿+小腿+膝盖关节；蛙鞋改为贝塞尔开趾蛙鞋剪影;踢水改为髋→膝→踝相位滞后的鞭状传导+柔性尾端反弹；CONFIG.diver 新增 19 个参数并接入 GM 面板"角色"Tab）
- [ ] T1.5 修正手电筒发光位置（跟随手持位置）
- [x] T1.6 手/腿动作输入模型调整：手动挡改为**双手双腿同步发力**（不再左右交替）；自动挡移动时双手**完全贴身收起**（autoSwim 姿态，由 Render.ts 根据 `manualDrive.enabled` 判定）；自动挡与手动挡转向时都补上身体侧倾 + 手臂转向修正动作（新增 `updateAutoDriveVisual()` 写入 `turnVisual / left&rightTurnStrength / forwardVisual / kickDrive`，在 Logic/ArenaLogic/MazeLogic 三处自动挡分支接入）；自动挡基础速度上调 `moveSpeed 14→20`、`maze.moveSpeed 17→24`。**本轮微调**：脚蹼相位时钟整体放慢一倍（`legAutoFreqBase 0.012→0.006` / `legAutoFreqBoost 0.08→0.04`，只影响腿部动画速度不影响实际物理速度）；自动挡贴身姿态的手臂基准角度从几乎贴身体中轴（`π±0.02`）改为肩宽自然张开（`π±0.28`），避免贴身时两臂和身体中轴重合、看起来像一条直线。

### P2：手电筒光照改进——VPL 连续化

- [ ] T2.1 分析当前 VPL 采样点数据结构
- [ ] T2.2 设计连续反射面的插值/连接算法
- [ ] T2.3 在 shader 中实现连续反射面渲染
- [ ] T2.4 处理岩石边缘的反射面断裂（不同岩石之间不应连续）
- [ ] T2.5 性能测试与优化
- [ ] T2.6 GM 面板参数调整

### P3：生命系统增强

- [x] T3.1 重构氧气消耗公式（阶梯式 + 呼吸压强驱动）——**本轮完成**：见 T3.7。
- [x] T3.2 实现呼出气泡粒子效果（新建 `BreathSystem.ts` + `RenderBreath.ts`；从嘴部坐标涌出、真实向上漂浮 + 侧向正弦摆动 + 半径缓慢变大 + 末尾淡出）
- [x] T3.3 气泡频率与运动量关联（运动量 0→1 映射到气泡速率/音量/播放速率/气泡大小/吐气时长/停顿时长；呼吸采用间歇吐气 exhale→pause→exhale 相位机）
- [x] T3.4 与音频系统联动（AudioManager 新增 SFX-Loop 通道 `playSFXLoop / stopSFXLoop / setSFXLoopParams / updateSFXLoops`；接入 breathLoop 云存储音效；吐气阶段拉起音量/停顿阶段降到 0；仅在迷宫 play / 主线 play 激活）
- [x] T3.5 GM 面板参数调整（新增「呼吸」Tab 共 27 项可调）
- [x] T3.6 撞岩石惩罚（音效 + 气泡 + 耗氧 + 氧气条红条视觉反馈）——见下方老记录。
- [x] **T3.7 呼吸压强系统 + 阶梯式氧气消耗**（本轮完成）：在 `BreathSystem.ts` 中引入 **pressure 三分量**（`movementPressure` / `impactPressure` / `pressureBaseline`），总压强 `pressure = baseline + movement*moveCoef + impact*impactCoef`。其中 movement 走**指数平滑**（pressureRise=0.15 上升快、pressureFall=0.02 下降慢，约 3s 才降一半），实现"静止后呼吸需要时间平复"；impact 由 `CollisionImpact.triggerCollisionImpact()` 在撞岩石时通过新的 `registerImpact(strength, target=0.35+0.65*strength)` 注入，每秒线性衰减 `impactRecoverPerSec=0.25`，约 4~6 秒平复，实现"撞墙后呼吸急促"。同时新增对外 API `getBreathPressure / getBreathPhaseAngle / getBreathPhase / getExhalePulseCounter / getLastExhalePressure / computeBuoyancyOffset / consumeBreathO2 / resetBreathO2Consumer`。**氧气消耗改为阶梯式**：相位机在 `exhale → pause` 切换瞬间递增 `exhalePulseCounter`，`consumeBreathO2()` 只在计数器增加的那一帧返回 `lerp(o2PerBreathStatic=0.6, o2PerBreathPeak=2.5, lastExhalePressure)` 做一口大扣氧（即 0.6%~2.5% 每口气）；两口气之间完全不扣。迷宫 `MazeLogic.ts` 扣氧后立刻调 `triggerO2LossFlash(fromO2, toO2)` 让氧气环红条闪一下，阶梯感视觉非常明显。呼吸未激活时（岸上/过场）走 `o2IdleDrain=0.005` 兜底恒量。主线 `Logic.ts` 保留 `tankDamaged` 倍率和 NPC 补氧逻辑，但基础扣氧改走 `consumeBreathO2()`。三处 `resetBreathSystem()` 调用同步补 `resetBreathO2Consumer()` 重置订阅游标，避免切图后老计数吞第一口。
- [x] **T3.8 氧气图标放大 + 肺图标**（本轮完成）：`CONFIG.breath.oxygenRingSizeMul=1.4` 让氧气环相对其他 HUD 图标放大 40%；`HUDTopLeft.ts::getVisibleSlots()` 改为按 id 动态决定 size，并根据上下项半径之差重新计算竖向间距，保证其他图标仍是 28px 不变。中央 "O₂" 脚标文字替换为**矢量肺图标**（`drawLungs`）：两瓣豆形肺叶（贝塞尔曲线）+ 中央气管 + 左右主支气管分叉 + 肺纹（淡色内部曲线）。肺颜色按氧气量分四档（健康粉/粉紫/灰紫/濒死青），`CONFIG.breath.lungColorHealthy/Mid/Low/Critical` 可调。肺缩放读 `getBreathPhaseAngle()`：吐气阶段 [0, π] sin>0 → 收缩到 `lungScaleExhale=0.85`，吸气阶段 [π, 2π] sin<0 → 膨胀到 `lungScaleInhale=1.15`，压强越高幅度再加 30%。吐气瞬间还会从气管顶部冒一个小白气泡（`phase==='exhale' && sin>0.15`），强调"正在吐气"。
- [x] **T3.9 呼吸浮力向量**（本轮完成）：在 `BreathSystem` 中新增 `computeBuoyancyOffset()`，返回 `sin(phaseAngle) × buoyancyAmp × (1 + pressure × buoyancyPressureCoef)` 作为 Y 方向偏移，吐气时正（下沉）、吸气时负（上浮）。主线 `Logic.ts` 和迷宫 `MazeLogic.ts` 在玩家移动分支末尾（水阻之后、`let nextX = player.x + player.vx` 之前）叠加 `player.vy += computeBuoyancyOffset()`。默认 `buoyancyAmp=0.18`、`buoyancyPressureCoef=0.6`，幅度克制但静止时肉眼可见"人物在原地上下呼吸起伏"。主线濒死阶段（stage 4/5 强制 vx/vy=0）额外判一层，不叠加浮力避免干扰随机抖动。浮力与肺动画完全同相位（都读同一个 `phaseAngle`）——玩家看到肺膨胀的瞬间身体也在上浮，逻辑自解释。可视化调试箭头 `buoyancyIndicatorEnabled` 默认关闭，未来可开。
- [x] **T3.10 GM 面板扩展**（本轮完成）：「呼吸」Tab 追加 16 项：压强基线/运动系数/撞击系数/上升率/下降率/撞击衰减速率；阶梯耗氧静止/全速/口 + 兜底基础耗氧；启用呼吸浮力 + 浮力幅度 + 浮力压强加成 + 浮力指示箭头；肺缩放 idle/吸气/吐气峰值；氧气环尺寸倍数。

### P4：地形序列化系统 🔴 高优先
**问题描述**：
当前迷宫地图完全依赖 `Math.random()` 生成，无法重现同一张地图。需要设计一套编解码系统，将地图结构和玩家进度序列化为一串字符串，支持精确还原。

**目标场景**：
1. **存档恢复**（本需求是基建，缓存需求另提单）：退出小游戏或程序崩溃后，下次回来能继续同一张图
2. **好友分享**（本需求是基建，社交需求另提单）：分享链接或二维码，好友可以游玩一模一样的地图

**设计方案：种子 + 增量快照**

#### 核心思路

将序列化数据分为两层：

- **种子层（Seed Layer）**：一个整数种子，通过确定性 PRNG 重建完全一致的地图结构
- **进度层（Progress Layer）**：玩家在这张地图上的所有运行时进度数据

两层组合后编码为一个紧凑字符串。

#### 种子层设计

引入确定性伪随机数生成器（PRNG），替换迷宫生成中所有 `Math.random()` 调用：

- 选用 **xoshiro128** 或 **mulberry32** 算法（轻量、周期长、分布均匀）
- 种子为 32 位无符号整数（约 42 亿种地图）
- 同一种子 + 同一版本的生成算法 = 完全一致的地图结构（包括墙体位置、额外装饰圆、场景主题、NPC 位置等）
- `generateMazeMap()` 新增可选 `seed` 参数；不传时自动生成随机种子
- 场景主题生成（`mazeScene.ts`）同样接入 PRNG

**种子层保证的一致性**：
- `mazeMap`（网格结构）
- `mazeWalls`（所有墙体圆心、半径、额外装饰圆）
- `exitX/Y`、`npcInitX/Y`、`spawnX/Y`
- `sceneThemeKeys`、`sceneThemeMap`、`sceneBlendMap`、`sceneStructureMap`

#### 进度层设计

进度层记录玩家在这张地图上的所有可变状态：

| 数据项 | 编码方式 | 说明 |
|--------|----------|------|
| `mazeExplored` | RLE 位图压缩 | 100×100 = 10000 bit，RLE 后通常 < 500 字节 |
| `rope.ropes[]` | 每条绳索：起点墙索引 + 终点墙索引 + 路径关键点 | 绳索路径可用墙体索引 + 简化路径表示 |
| `markers[]` | 每个标记：类型(2bit) + 附着类型(1bit) + 位置数据 | 岩石标记用墙索引+角度，绳索标记用绳索索引+t值 |
| `diveCount` | varint | 已完成下潜次数 |
| `npcFound` | 1 bit | 是否已发现 NPC |
| `maxDepthReached` | uint16 | 历史最深 |
| `totalRopePlaced` | uint16 | 累计铺绳数 |
| `discoveredThemes[]` | 位掩码 | 已发现主题（最多 8 个主题，1 字节） |
| `diveHistory[]` | 紧凑结构体数组 | 每条记录约 8~12 字节 |
| `player.x/y` | uint16 × 2 | 玩家当前位置 |
| `player.angle` | uint8（角度/256映射） | 玩家朝向 |
| `player.o2` | uint8 | 氧气百分比 |
| `npc.state` 相关 | 几个标志位 | NPC 救援状态 |

#### 编码格式设计

```
[版本号 1B][种子 4B][进度数据长度 2B][进度数据 NB][校验和 2B]
```

- **版本号**（1 字节）：编解码格式版本，支持未来扩展和向后兼容
- **种子**（4 字节）：32 位无符号整数
- **进度数据**：二进制紧凑编码，内部按 TLV（Type-Length-Value）组织，支持未来新增字段
- **校验和**（2 字节）：CRC16，防止传输损坏

最终输出为 **Base64url** 编码的字符串（URL 安全，可直接放在链接参数或二维码中）。

#### TLV 进度数据内部格式

```
[Tag 1B][Length 1~2B][Value NB] [Tag][Length][Value] ...
```

预留 Tag 值：
- `0x01` = explored 位图
- `0x02` = 绳索数据
- `0x03` = 标记数据
- `0x04` = 下潜统计（diveCount, npcFound, maxDepth, totalRope）
- `0x05` = 下潜历史
- `0x06` = 已发现主题
- `0x07` = 玩家位置与状态
- `0x08` = NPC 状态
- `0x09~0xFF` = 未来扩展保留

解码时遇到未知 Tag 直接跳过（Length 告诉跳多远），实现向前兼容。

#### 两种使用场景的编码差异

| 场景 | 包含种子层 | 包含进度层 | 典型长度 |
|------|-----------|-----------|----------|
| 好友分享（空白地图） | ✅ | ❌ | ~10 字节 → Base64 约 16 字符 |
| 存档恢复（带进度） | ✅ | ✅ | ~200~2000 字节 → Base64 约 300~3000 字符 |

好友分享只需要种子，对方拿到种子后本地重建地图即可。
存档恢复需要种子 + 完整进度。

#### 扩展性设计

- **版本号**：格式变更时递增版本号，解码器根据版本号选择对应解析逻辑
- **TLV 结构**：新增数据类型只需分配新 Tag，旧版解码器自动跳过未知 Tag
- **种子兼容性**：如果生成算法变更导致同种子产生不同地图，需要在版本号中体现；同版本号下种子必须产生一致结果
- **压缩**：进度数据较大时可选用 LZ4 或简单 RLE 压缩，压缩标志位放在版本号的高位

**任务拆分**：

- [x] T4.1 实现确定性 PRNG 模块（`src/core/SeededRandom.ts`）
  - mulberry32 算法
  - 提供 `srand()`、`srandInt(min, max)`、`srandRange(min, max)`、`srandPick(arr)` 接口
  - 模块级活跃实例机制：`setActiveSeededRandom(seed)` / `clearActiveSeededRandom()`，无活跃实例时 `srand()` 退化为 `Math.random()`
  - 单元测试：同种子多次调用产生完全一致的序列
- [x] T4.2 改造 `generateMazeMap()` 接入 PRNG
  - 新增可选 `seed` 参数；不传时用 `generateRandomSeed()` 自动生成
  - 替换 `map.ts` 中全部 81 处 `Math.random()` 为 `srand()`
  - 外层函数用 try/finally 保证激活和清理，内层 `buildMazeInternal` 保留原逻辑
  - 返回值新增 `seed` 字段
- [x] T4.3 改造 `createMazeSceneData()` 接入 PRNG
  - `mazeScene.ts` 中 2 处 `Math.random()` 替换为 `srand()`
  - 由 `generateMazeMap` 外层同一个 PRNG 驱动（同 seed 下场景主题也完全一致）
- [ ] T4.4 实现序列化编码器（`src/core/MapCodec.ts`）
  - `encodeSeedOnly(seed): string` — 纯种子编码（好友分享用）
  - `encodeFullState(seed, state): string` — 种子 + 进度编码（二维码/链接场景用）
  - 二进制打包 + CRC16 校验 + Base64url 输出
  - **暂不急**：当前 v3 存档走 wx.storage JSON 已足够；MapCodec 主要用于 URL / 二维码场景
- [ ] T4.5 实现序列化解码器（MapCodec 配套）
- [ ] T4.6 实现 TLV 进度数据编解码（MapCodec 配套）
- [x] T4.7 接入迷宫逻辑层
  - `resetMazeLogic()` 新建地图分支记录 `mazeData.seed` 到 `state.mazeRescue.seed`
  - `loadMazeProgress()` 读档时调 `generateMazeMap(seed)` 重建完整结构，再把 explored / markers / ropes / player 覆盖上去
  - `saveMazeProgress()` 只存 seed + 进度数据，不再存地图结构
- [x] T4.8 `state.mazeRescue` 新增 `seed` 字段（uint32）
- [ ] T4.9 验证与边界测试（建议后续实机验证）
  - 同种子多次生成一致性
  - 编码→解码→重建→再编码 往返一致性
  - 大量绳索/标记下的存档长度测试
- [ ] T4.10 离线验证脚本（可选）
  - 扩展 `scripts/inspectMaze.js` 支持 `--seed <N>` 参数

**第一阶段已交付**（T4.1 / T4.2 / T4.3 / T4.7 / T4.8）：
- 新建 `src/core/SeededRandom.ts`
- `src/world/map.ts` / `src/world/mazeScene.ts` 全部 `Math.random` 迷宫路径已种子化
- `src/logic/MazeSave.ts` 升级为 v3 种子版，key 改为 `maze_save_v3`
- `src/logic/MazeLogic.ts` / `src/core/state.ts` 接入 seed 字段
- 老 v1 / v2 存档 key 在 `clearMazeSave()` 里会被一起删掉（用户已确认不保留老档）
- 单次下潜存档从 v2 的 ~374KB 降到预期 ~10~30KB，地图结构从存档里完全移除
- `npm run typecheck` 通过

**序列化完整性修复**（第一阶段上线后的三处 bug 修复，确保"同 seed 下场景一模一样"）：

1. **绳子端点丢失（用户实测目击）**：原 v3 存档只扁平化了 `ropes[*].path`，丢失了 `start / end / startWall / endWall / slackFactor / mode` 6 个字段，导致 `RenderRope.ts` 的 `drawNail` / `drawKnot` 在读档后全部失效（端点钉子和绳结不绘制）。
   - 修复：新增 `PackedLiveRope` 结构完整打包 `start / end / startWall(x,y,r) / endWall(x,y,r) / path / slackFactor / mode`；wall 不存对象引用、只存坐标特征；读档时用 `findWallByRef()` 在新 `mazeWalls` 里做最近匹配（容差 2px），找不到就挂 null（宁缺毋挂错）。
   - 对应 `diveHistory[*].ropesSnapshot` 也补了 `start / end` 端点，供岸上回放地图绘制端点钉子。

2. **食人鱼聚集点与骷髅未进种子**：`FishEnemy.ts::generateFishDens()` 里还有 11 处原生 `Math.random()`（聚集点数量 / 位置 / 骷髅数量 / 骷髅岩石选择 / 骷髅角度抖动 / 骷髅尺寸 / 骷髅渲染 seed），导致同 seed 下每次读档骷髅布局都不一样，好友分享时对方看到的骷髅布局也与原作者不同。
   - 修复：11 处 `Math.random()` 全部改 `srand()`；`MazeLogic.ts` 在 `resetMazeLogic()` 新建地图分支和读档分支两处，都用**派生种子**（`seed ^ 0xDEADBEEF`）激活 PRNG 包住 `generateFishDens()` 调用。
   - `fishDens` 从存档里剔除（不再靠 JSON 原样恢复），读档时由派生 seed 确定性重建，真正做到"同 seed 下骷髅形状位置完全一致"。

3. **`ropesSnapshot` 历史快照绳子也丢端点**：`diveHistory[*].ropesSnap` 老实现也只存 path，岸上按次回放地图画到端点钉子时同样缺数据。
   - 修复：新增 `PackedHistoryRope` 结构（start / end / path 三项），与活绳子打包分开；历史快照不需要 wall 引用，因此只补两个坐标端点。

**修复后序列化清单**（全部带复原能力的字段）：

| 类别 | 来源 | 一致性来源 |
|---|---|---|
| `mazeMap` / `mazeWalls` / `sceneThemeKeys/Map/BlendMap/StructureMap` / `exit/spawn/npc 坐标` / `mazeTileSize/Cols/Rows` | `generateMazeMap(seed)` | ✅ 种子 |
| `fishDens`（聚集点 + 骷髅数量/位置/角度/尺寸） | `generateFishDens()` 包在派生 seed 里 | ✅ 派生种子 `seed ^ 0xDEADBEEF` |
| `mazeExplored` | 存档位图 base64 | ✅ 位图 |
| `diveHistory[*]`（含 exploredSnapshot / exploredBeforeSnapshot / playerPath / ropesSnapshot 带端点） | 存档 | ✅ 完整 |
| `state.rope.ropes[*]`（含 start / end / startWall / endWall / slackFactor / mode） | 存档 + wall 最近匹配回挂 | ✅ 完整 |
| `state.markers`（`wallX/wallY` 是坐标对位） | 存档原样 | ✅ 重建无影响 |
| `player.x/y/angle/o2` | 存档 `playerPos` | ✅ |
| `diveCount / npcFound / maxDepthReached / totalRopePlaced / discoveredThemes / currentThemeKey / ...` | 存档 `rest` | ✅ |
| `fishEnemies` 鱼个体 | 下潜时重建 | ✅ 运行时 |
| 粒子、鱼群 AI、入水气泡、相机抖动、闪电特效等运行时随机 | 保留 `Math.random` | ✅ 不影响地图结构 |

**修复涉及文件**：
- `src/logic/FishEnemy.ts`：`generateFishDens()` 内 11 处 `Math.random` → `srand`，补 SeededRandom import
- `src/logic/MazeLogic.ts`：新建地图分支与读档分支两处，都用派生 seed 包 `generateFishDens()`；读档分支末尾补 fishDens 重建
- `src/logic/MazeSave.ts`：新增 `PackedLiveRope` / `PackedHistoryRope` / `packWallRef` / `findWallByRef` / `packLiveRope` / `unpackLiveRope` / `packHistoryRope` / `unpackHistoryRope`；rest 黑名单加上 `fishDens`
- `npm run typecheck` 通过

---

## 三、依赖关系

```
P1（角色表现）──→ 相机系统（已完成，roll 倾斜将影响手电光源位置）
P3（生命系统）──→ 音频系统（已完成基础框架，呼吸声可复用 AudioManager SFX 通道）
P4（地形序列化）──→ 存档缓存需求（另提单）
P4（地形序列化）──→ 好友分享需求（另提单）
```

---

## 四、当前迭代状态

**当前迭代**：P1 角色表现修复 + P4 地形序列化

**已完成里程碑**（详见 [09-completed-work-archive.md](./code/09-completed-work-archive.md)）：
- 手动挡模式（V1~V5 迭代完成）
- 角色表现第一版（潜水员重绘 + 三轮细调）
- 岩石生成一致性修复
- 悬浮尘埃系统
- 标记系统（轮盘交互 + 三种语义标记）
- **相机系统完整完成**（弹簧臂 + 摇曳 + 前瞻偏移 + 远近自适应缩放）
- 浅水区渲染完整完成（天空 / 阳光 / 焦散 / 丁达尔 / 环境光遮罩连续化）
- 废弃代码清理、GM 面板可拖动可滑动、迷宫 UI 全面重设计
- 迷宫食人鱼系统 + 食人鱼死亡过场卡死修复
- 手动挡转向渐进动画（反向输入先掉头再移动，大掉头阶段允许惯性滑行）
- NPC 救援反馈（呼救气泡+挥手+闪光圈、救援绳节点绳渲染、柔性跟随+超距拖慢玩家）
- **音频系统基础框架完成**（AudioManager + BGM 云存储接入 + SFX 通道 + 入水气泡音效）
- 岸上全屏手绘认知地图重做 + 按次下潜回放
- **迷宫模式本地存档完成**（v1 简化版 → v2 压缩版 → **v3 种子版**：地图结构不再进存档，由 `generateMazeMap(seed)` 从 uint32 种子确定性重建；`src/core/SeededRandom.ts` 提供 mulberry32 PRNG + 模块级活跃实例机制；`src/world/map.ts` 81 处 + `src/world/mazeScene.ts` 2 处 `Math.random` 全量种子化；`maze_save_v3` key 下单次下潜存档从 v2 的 ~374KB 降到预期 ~10~30KB，彻底解决 Android 端单 key 超限问题；同种子可完全重建同一张地图，为后续好友分享地图打下基础）
- **氧气瓶拾取系统完成**（迷宫模式：氧气瓶贴在岩石表面，食人鱼聚落高概率、全图低概率散落；轮盘按住确认安装；触发后飞瓶 → 气泡爆发 → 全屏绿色辉光 → 氧气条上涨动画 → "+X%" 跳字；新增 `src/logic/OxygenTank.ts` + `src/render/RenderOxygenTank.ts`；生成走派生种子 `seed ^ 0xCAFEBABE`，已消耗瓶子用 `consumedTankIds` 列表随存档持久化，同 seed 内不会重新出现）
- **大文件拆分重构完成**（减少 AI 编辑巨型文件的风险，外部导入路径零变更）：
  - `src/core/config.ts`（854 行）→ 拆成 `src/core/config/` 目录下 5 个功能子模块（`base.ts` 基础/地图/绳索/第三关；`gameplay.ts` 标记/氧气瓶/呼吸/撞击/攻击/探知仪；`modes.ts` fishArena/fishEnemy/maze含浅水区；`rendering.ts` 尘埃/手电/画质/后处理；`character.ts` 手动挡/潜水员/相机/音频）+ `index.ts` 组装；根 `config.ts` 变成一行 `export { CONFIG } from './config/index'`。全仓库 43 处 `import { CONFIG } from '../core/config'` 零修改。
  - `src/render/RenderMazeUI.ts`（3105 行）→ 拆成 `src/render/mazeUI/` 目录下 3 个子模块（`shore.ts` 岸上界面+全屏认知地图+下潜记录列表/回放 806 行；`debrief.ts` 入水动效+结算数据页 327 行；`cases.ts` 警情通报/救援成功/搜寻终止 3 个全屏叙事页+放弃按钮+resolved_idle 按钮+所有按钮矩形 getter 880 行）。主文件 `RenderMazeUI.ts` 从 3105 行降到 492 行，只保留 `drawMazeHUD`（phase 分发器）+ `drawMazeMinimap`（debug 小地图）+ `ensureMazeHUDInitialized` + `rrect`；通过 `export { ... } from './mazeUI/cases'` re-export 5 个按钮矩形 getter，`input.ts` 的导入路径零修改。**已舍弃**：原 `drawMazeMapFullscreenLegacy`（~470 行）是未被调用的旧铅笔素描方案，按"死代码不搬"原则未迁移，如需恢复可到历史 commit 中取回。`npm run typecheck` 通过。
- **结束潜水弹射上浮动画（0.5s 喜剧式破水转场）**：把原 1 秒平淡向上漂的 `surfacing` 阶段改造成有力量感的三段式弹射动画：
  - `CONFIG.maze.surfacingDuration` 从 60 改到 30（0.5s）；`MazeLogic.updateMaze` 的 surfacing 分支重写为"蓄力（帧 0~8，原地压缩+微下沉+轻预震）→ 爆发（帧 9~22，瞬间 vy=-60 easeOut + shake=18 线性回落）→ 破水（帧 22~30，速度归零 + 帧 23 shake=10 二次震屏）"三段节奏
  - `RenderMazeUI.ts::drawMazeHUD` 中 `surfacing` 分支改为破水爆裂全屏特效：蓄力阶段画暗角收缩；爆发阶段画向下甩的 60 根速度线 + 顶部速度拖影白雾；破水阶段画中心白闪 + 两圈环形激波（`maxR = hypot(cw,ch) * 0.6`）+ 48 根放射状水滴线条（`lineCap='round'`）+ 淡青白底色铺底，平滑过渡到 debrief 页
  - 三个触发入口（`retreat` 主动撤离 / `o2` 氧气耗尽 / `fishkill` 被鱼咬死）在把 `phase` 置成 `'surfacing'` 的那一帧同时 `playSFX('quickReturn')` 播弹射出水音效 + `state.story.shake = max(shake, 4)` 初始预震
  - 音频资源：`AudioManager.SFXKey` 扩展 `'quickReturn'`，云存储地址写在 `CONFIG.audio.cloud.fileIDs.quickReturn`（`audio/QuickReturn.mp3`）
  - 涉及文件：`src/logic/MazeLogic.ts` + `src/logic/FishEnemy.ts` + `src/render/RenderMazeUI.ts` + `src/audio/AudioManager.ts` + `src/core/config/modes.ts` + `src/core/config/character.ts`。`npm run typecheck` 通过。
- **iOS 体积光合成修复（真机实测：iPhone16 / iPadAir3 上 volPass 耗时正常但完全看不到体积光；安卓 / macOS / Windows 全部正常）**：根因是 iOS WebKit 对「非预乘 alpha 的 WebGL canvas 作为 drawImage 源 + `ctx.globalCompositeOperation='screen'` 合成到 2D canvas」这条路径有长期渲染 bug，而遮罩层走默认 `source-over` 不受影响，所以只有体积光消失。经过两轮迭代：
  - **第一版（已回滚）**：尝试方案 A（预乘 alpha 对齐：`premultipliedAlpha: false → true` + 两个 shader 输出改 `vec4(color * a, a)` + `blendFunc` 改为预乘方程）。真机实测仍然看不到——怀疑预乘 alpha 改动反而把遮罩层这条原本工作的路径也搞坏了，画面整体看起来仍是"没有光照"。
  - **第二版（当前方案，已落地）**：回滚所有预乘 alpha 改动，只保留两条最小侵入的兜底：
    - (1) `CONFIG.postProcess.volCompositeMode` 默认 `'lighter'`（additive 加法合成，iOS 对 additive 支持稳定，不走 screen 这条踩坑路径）；`Render.ts` 中体积光合成行读此配置；GM 面板「后处理」Tab 的 `select` 控件可真机现场切换对比
    - (2) `volumetricFrag.glsl` 末尾把 `if (a < 0.001) discard;` 改成 `if (a < 0.001) { gl_FragColor = vec4(0.0); return; }`——某些 iOS PowerVR GPU 对 fragment shader 的 `discard` 在"后续走 drawImage + 合成"这条路径上有渲染 bug，会把整个 WebGL canvas 判定为不可作为合成源，直接用透明黑输出走正常 blend 更兼容
    - WebGL context 保持 `premultipliedAlpha: false`，两个 shader 保持非预乘输出 `vec4(color, a)`，两处 `blendFunc` 保持 `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`（遮罩）与 `SRC_ALPHA, ONE`（体积光 additive）。maskFrag 里本就没有 `discard`，不需要改
  - 涉及文件：`src/render/WebGLLight.ts` + `src/render/shaders/maskFrag.glsl` + `src/render/shaders/volumetricFrag.glsl` + `src/core/config/rendering.ts` + `src/render/Render.ts` + `src/gm/GMConfig.ts`。改完后必须跑 `node scripts/buildShaders.js` 重新生成两个 `.glsl.ts`；`npm run typecheck` 通过。
  - **若真机仍然看不到**，进一步可选的排查方向（不急着做，先等实测结果）：(a) 彻底旁路合成，把 WebGL canvas 画到离屏 2D canvas 再用 `source-over` 画回来（打破 drawImage 源为 WebGL 的特殊路径）；(b) 把体积光 shader 内所有 `if (...) return vec3(0.0);` 早退改成 `if` 外继续走，让所有像素都走完整个 shader（早退也是 PowerVR 某些版本的敏感点）；(c) 把体积光整层合并进遮罩层，放弃独立体积光 pass；(d) WebGL context 初始化失败或 getContext 返回 null 时有没有降级黑屏——可以让用户在迷宫模式 GM 面板里切 `volCompositeMode: screen` 对比，如果切 screen 后能显示但颜色奇怪，说明问题不是 lighter 而是其他。

**下一步优先**：
1. P1 角色表现修复（T1.3 roll 滚动、T1.4 腿部脚蹼、T1.5 手电位置）
2. P4 地形序列化系统剩余任务（T4.4/T4.5/T4.6 MapCodec 编解码器——仅在需要做好友分享链接/二维码时再做；当前 wx.storage JSON 存档已够用）

---

## 五、注意事项

1. 每次迭代完成后必须运行 `npm run typecheck` 确认无 TypeScript 报错
2. 涉及 GM 面板的改动，新增参数统一在 `GMConfig.ts` 的 `TABS` 中添加
3. 涉及状态新增的改动，必须同步检查 `resetState()` / `resetGameLogic()` / `resetArenaLogic()` / `resetMazeLogic()`
4. 光照相关改动需要注意手机端 WebGL 兼容性（`preserveDrawingBuffer: true`、`gl.flush()`）
5. **修改 `.glsl` 源文件后，必须运行 `node scripts/buildShaders.js` 重新生成 `.glsl.ts`**，否则运行时 shader 仍是旧版本
6. **P4 种子兼容性**：一旦种子系统上线，`generateMazeMap()` 的算法变更必须同步递增编码版本号，否则旧种子会产生不同地图
7. **云存储新上传文件默认权限限制**：向云开发云存储新上传的文件默认是"仅创建者可读写"，小游戏运行时读取会报 `STORAGE_EXCEED_AUTHORITY`。每次上传新音频/图片资源后，必须在云开发控制台把该文件权限改为"所有用户可读"或设置 bucket 级的读公开规则，否则无法通过 getTempFileURL 访问
