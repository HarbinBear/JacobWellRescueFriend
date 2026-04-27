---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
# 技术文档分卷 04：专项系统与渲染总入口

## 本卷用途

本卷主要回答下面这些问题：

- 粒子、绳索、敌鱼这些专项系统分别负责什么
- 渲染总入口是怎样分发的
- 常见需求应该优先改哪里
- 扩展代码时最容易踩哪些坑
- 新会话模型应该按什么顺序继续读源码

如果任务与 UI、光照、绳索、敌鱼、粒子、渲染表现或维护排障有关，应优先阅读本卷。

---

## 一、专项子系统：粒子、绳索、敌鱼

### 1.1 粒子系统 `src/logic/Particle.ts`

从 `Logic.ts` 的调用可见，粒子系统至少提供：

- `createSplash()`
- `updateSplashes()`
- `triggerSilt()`
- `updateParticles()`

它主要负责：

- 入水或出水水花
- 扬尘泥沙
- 血迹等局部粒子效果

主逻辑层会在合适时机调用它，而不是让粒子系统自己决定剧情时机。

### 1.2 绳索系统 `src/logic/Rope.ts`

绳索系统至少对外提供：

- `updateRopeSystem()`
- `findNearestWall()`

它的职责包括：

- 判断玩家是否靠近可锚定墙体
- 管理长按开始或结束状态
- 生成或更新绳索路径
- 维护绳索收紧过程
- 为渲染层提供可读绳索数据

`Logic.ts` 中会每帧调用 `updateRopeSystem()`，渲染层会读取绳索状态把它画出来。

在实现上还有一个重要约束：

- 绳索进入完成态时，必须保留玩家长按结束前看到的那条预览避障路径，不能在最后一刻重新退回成端点直线或另一条新路径

**注意**：绳索的铺设/结束/拆除操作入口已从旧的长按按钮改为轮盘交互系统（见 1.6 标记系统），旧的绳索按钮已被替代。

### 1.6 标记系统 `src/logic/Marker.ts`

标记系统是 P5 新增的专项子系统，用轮盘交互替代旧的长按绳索操作，同时提供三种语义标记。

对外提供：

- `updateMarkers()`：每帧更新标记动画（放置/拆除动画倒计时）
- `updateWheelButtonVisibility()`：每帧更新轮盘交互按钮的可见性
- `detectWheelContext()`：检测玩家附近的可交互对象，返回上下文信息
- `buildWheelSectors()`：根据上下文动态生成轮盘扇区列表
- `executeWheelAction()`：执行轮盘选中的操作
- `placeWallMarker()` / `placeRopeMarker()`：放置标记
- `startRemoveMarker()`：启动拆除标记动画
- `getMarkers()`：获取当前标记列表

标记系统的核心设计：

- **三种标记语义**：`danger`（红叉，死路/危险）、`unknown`（黄问号，未定）、`safe`（绿圈，安全/救援路线）
- **两种附着方式**：岩石标记（插牌式，沿法线方向）和绳索标记（绑扎式，跟随绳索摆动）
- **上下文感知轮盘**：根据玩家附近是空岩石/绳索端点/绳索中段/正在铺绳/已有标记，动态生成不同的扇区选项
- **轮盘交互**：按住按钮弹出 → 滑动选择扇区 → 松手确认执行
- **跨下潜持久化**：标记数据挂在 `state.markers` 上，迷宫模式下潜时保留

渲染由两个专项模块负责：

- `src/render/RenderMarker.ts`：世界空间标记绘制（岩石插牌 + 绳索绑扎 + 放置/拆除动画）
- `src/render/RenderWheel.ts`：轮盘 UI 绘制（交互按钮 + 扇区 + 图标 + 展开动画）

配置参数集中在 `CONFIG.marker` 子对象中，GM 面板有独立的

### 1.6b 氧气瓶系统 `src/logic/OxygenTank.ts`

氧气瓶系统是迷宫模式专属的补给子系统，与标记系统类似：**逻辑和渲染各自独立模块，由 `MazeLogic.ts` 和 `Marker.ts`（轮盘上下文）驱动**。

对外提供：

- `buildOxygenTanksForMaze(mainSeed, consumedIds)`：根据主 seed 派生子种子 `seed ^ 0xCAFEBABE`，确定性生成当前迷宫的氧气瓶列表（已消耗 id 会被标 consumed）
- `generateOxygenTanks()`：候选岩石扫描 + 聚落优先撒点 + 全图补充散落
- `updateOxygenTanks()`：每帧更新所有瓶子的呼吸相位、按住进度、飞行瓶、气泡爆发、屏幕辉光、氧气条上涨动画
- `findNearbyOxygenTank()`：供 `Marker.ts` 的 `detectWheelContext()` 最高优先级检测使用
- `startInstallTank(id)` / `cancelInstallTank(id)`：轮盘松手确认安装时触发
- `createOxygenFeedback()`：反馈运行态工厂，读档时由 `MazeLogic` 重建

核心设计：

- **位置来自派生种子**：每个氧气瓶都贴在岩石表面外缘（法线方向外推 `w.r * 0.9` + 小抖动），**永远不悬空、不嵌岩石**。
- **聚落优先、全图散落补位**：食人鱼聚落内 70% 概率刷新（2~4 个/聚落），聚落外散落 3~6 个，整张地图总计约 10~20 个。
- **按住安装 = 轮盘扇区**：接入现有 `Marker.ts` 轮盘系统；`WheelContext` 新增 `oxygenTank`，`WheelAction` 新增 `installTank`；靠近氧气瓶自动出现按钮，按住松手即触发安装，`completeInstall` 负责所有视觉反馈。
- **跨下潜持久，同 seed 不再刷**：已消耗的瓶子 id 存在 `state.mazeRescue.consumedTankIds` 数组里，走 `MazeSave.ts` 的 `rest` 字段自动持久化；`buildOxygenTanksForMaze` 在重建时把这些 id 标为 consumed，渲染和拾取都会跳过它们。
- **运行态反馈不进存档**：`oxygenTanks` / `oxygenFeedback` 都在 `MazeSave.ts` 的 rest 黑名单里，跨 session 重建即可。

渲染由专项模块负责：

- `src/render/RenderOxygenTank.ts`：
  - `drawOxygenTanksWorld()`：世界层静态瓶体（黄色圆柱 + 红色顶阀 + 呼吸发光）+ 按住进度环
  - `drawOxygenFeedbackWorld()`：飞行瓶尾迹 + 气泡爆发（拾取瞬间从玩家位置向外扩散）
  - `drawOxygenScreenGlow()`：全屏绿色边缘辉光（由 `RenderMazeUI` 在 HUD 开头调用）
- `RenderMazeUI.ts` 中氧气环新增两种拾取反馈：
  - 拾取脉冲：绿色放大光环（0.8s）
  - `+X%` 跳字：氧气环右侧向上飘（1.5s）
  - 氧气环数字从 `oxygenFeedback.o2DisplayAnim` 读取（追 `player.o2` 的平滑值）

配置参数集中在 `CONFIG.oxygenTank` 子对象中，GM 面板有独立的"氧气瓶"Tab。

### 1.3 敌鱼系统 `src/logic/FishEnemy.ts`

敌鱼系统至少提供：

- `createFishEnemy()`
- `updateAllFishEnemies()`
- `findSafeSpawnPosition()`

职责包括：

- 创建单个凶猛鱼实体
- 每帧更新敌鱼 AI
- 选择安全出生点
- 管理被打、怕光、扑击、吞食、死亡等状态

主线和竞技场都会调用 `updateAllFishEnemies()`，区别在于：

- 主线里敌鱼是局部危机和演出装置
- 竞技场里敌鱼是主循环核心

### 1.4 三个专项系统的协作特点

这三个系统都不是"完全自治模块"，而是：

- 由 `Logic.ts` 驱动更新时机
- 通过 `state` 与其他层交换数据
- 由渲染层读取状态完成表现

这就是当前项目的典型模式：

**专项逻辑模块负责算法和局部规则，总入口文件负责调度。**

### 1.5 GM 运行时调参面板 `src/gm/`

GM 面板是一个独立的运行时调参工具，不依赖逻辑层或状态树，直接读写 `CONFIG` 对象。

面板拆分为三个文件：

- `GMConfig.ts`：类型定义、TABS 参数条目配置、面板布局常量
- `GMPanel.ts`：面板状态管理、触摸处理、键盘输入、CONFIG 读写工具
- `GMRender.ts`：面板绘制（drawGMButton、drawGMPanel）

它的职责包括：

- 在屏幕顶部中央提供 GM 按钮入口
- 打开后展示分 Tab 的参数面板（当前 11 个 Tab：手电筒 / 光照 / Debug / 玩法 / 尘埃 / 手动挡 / 角色 / 相机 / 后处理 / 浅水区 / 标记）
- **可拖动**：面板顶部有 22px 拖动条（带三条横线手柄），按住可移动面板位置，不超出屏幕边界
- **Tab 可滑动**：每个 Tab 固定宽度 60px，Tab 多时可左右滑动，底部有橙色滑动指示条
- 支持 number 和 bool 两种条目类型
- number 条目支持加减按钮和微信键盘直接输入
- 面板打开时拦截所有游戏输入

接入方式：

- **渲染层**：`Render.ts` 的 `draw()` 末尾调用 `drawGMButton()` 和 `drawGMPanel()`，始终在最顶层绘制
- **输入层**：`input.ts` 的 `touchStart / touchMove / touchEnd` 中优先让 GM 面板消费事件

如果需要新增可调参数，只需在 `GMConfig.ts` 的 `TABS` 数组中添加条目即可，不需要改动其他文件。
---

## 二、渲染总入口 `src/render/Render.ts`

### 2.1 `draw()` 是统一渲染出口

无论当前在菜单、主线、竞技场还是结局页，都会走到 `Render.ts` 的总入口。

它的核心职责是：

- 清屏或准备画布
- 根据 `state.screen` 分发到不同渲染路径
- 组合多个专项渲染模块

### 2.2 渲染分发思路

当前渲染层不是"一文件画完整个游戏"，而是：

- 总入口根据模式分发
- 子模块按对象或功能绘制

这和逻辑层的结构类似：

- 总文件负责调度
- 专项模块负责具体表现

### 2.3 常见渲染模块职责

当前渲染子模块包括：

- `Canvas.ts`：画布与上下文基础能力
- `Render.ts`：总绘制入口
- `RenderUI.ts`：主线 HUD、控制器（摇杆/搓屏提示）、攻击按钮、手电筒按钮、刀光特效、调试按钮，以及 UI 总分发入口 `drawUI()`
- `RenderMenu.ts`：主菜单、章节选择、章节卡片配图绘制
- `RenderEnding.ts`：结局画面（第二三关衔接、熊子死亡结局、旧结局兜底）
- `RenderArenaUI.ts`：竞技场 HUD（轮次/击杀/存活、准备倒计时、清图庆祝、死亡结算）
- `RenderMazeUI.ts`：迷宫模式 HUD（氧气条、深度、小地图、岸上界面、入水动效、结算页、全屏认知地图）
- `RenderLight.ts`：光照 CPU 端计算（射线碰撞、泥沙衰减、视线检测）
- `WebGLLight.ts`：光照 GPU 端渲染（WebGL shader，替代旧 Canvas 2D 光照绘制）
- `RenderRope.ts`：绳索绘制
- `RenderMarker.ts`：标记世界渲染（岩石插牌式 + 绳索绑扎式 + 放置/拆除动画）
- `RenderWheel.ts`：轮盘 UI 渲染（交互按钮 + 扇区选择 + 展开动画），同时导出 `getWheelBtnPos()` 自适应按钮位置计算函数（确保轮盘不超出屏幕边界）
- `RenderFishEnemy.ts`：敌鱼绘制
- `RenderDiver.ts`：潜水员与角色绘制（俯视轮廓、漂浮/滑行/划水/掉头姿态、玩家与 NPC 共用）
- `RenderMazeScene.ts`：迷宫场景专属渲染（主题取色、背景装饰、墙体造型）
- `src/gm/`：GM 运行时调参面板（`GMConfig.ts` 配置 / `GMPanel.ts` 逻辑 / `GMRender.ts` 绘制），在 `draw()` 末尾最顶层绘制

### 2.3.1 `RenderDiver.ts` 当前实现要点

当前潜水员渲染已从"方块身体 + 简单脚蹼"升级为**俯视角潜水员轮廓**，并且本轮开始把动作语义真正和手动挡输入逐触点对齐：

- 头部与面镜：负责朝向识别，但不再额外绘制抢眼的小点高光
- 躯干与背部气瓶：负责身份识别
- 双臂：只做轻微待机摆动与转向修正，不再承担主划水推进
- 双腿与双蛙鞋：负责主要推进与节奏识别，动作为上下踢水而不是左右扫腿

`drawDiver()` 现在不再只吃一个 `animTime` 数字，而是额外接收一个动作参数对象。玩家侧当前关键字段包括：

- `animTime`
- `hasTank`
- `vx` / `vy`
- `leftKickProgress` / `rightKickProgress`
- `leftKickStrength` / `rightKickStrength`
- `leftTurnProgress` / `rightTurnProgress`
- `leftTurnStrength` / `rightTurnStrength`
- `forwardVisual`
- `turnVisual`

其中：

- `vx` / `vy` 仍用于推导漂浮、滑行和整体转向趋势
- `leftKick*` / `rightKick*` 表示左右腿各自的单次踢水进度与强度
- `leftTurn*` / `rightTurn*` 表示左右侧转向修正动作的进度与强度
- `forwardVisual` / `turnVisual` 用于把前进与拐弯做线性叠加，而不是二选一状态机
- NPC 也走同一套 `drawDiver()`，但通常不给这些手动挡逐触点数据，因此只表现轻微待机与滑行

`Logic.ts` 中 `processManualDrive()` 也不再采用"取本帧最大触点"的旧模型，而是改成：

- **逐触点跟踪**：每个触点都保留自己的 `localSide`、`consumedDistance`、`finished`
- **整段有效行程持续消费**：一次触点生命周期只驱动一次完整踢水，但这次踢水会贯穿整段 `effectiveDistance`，而不是只在前半段生效
- **输入速度影响力度**：同样的输入距离下，帧间位移越大，推进和转向越强
- **输入向量分解**：
  - 与身体朝向同向的前向分量 → 推进踢水
  - 侧向分量 → 转向修正
  - 后向分量暂不做倒退，统一折算到转向修正里
- **左右轮流分配**：每次新输入在开始时都会消费一次当前腿侧分配，并把下一次翻到另一侧；因此上一次输入若驱动左腿，这一次新输入就驱动右腿，不再依赖屏幕左右或角色局部左右

当前与角色表现细调直接相关的参数入口有两组：

- `CONFIG.manualDrive`
  - `effectiveDistance`
  - `thrustBase`
  - `thrustDistanceScale`
  - `thrustSpeedScale`
  - `thrustMax`
  - `turnBase`
  - `turnSpeedScale`
  - `turnMax`
  - `backwardTurnScale`
  - `dragForward`
  - `dragLateral`
  - `kickProgressRate`
  - `kickRecoverRate`
  - `kickStrengthRise`
  - `kickStrengthDecay`
- `CONFIG.diver`
  - `armIdleFrequency`
  - `armIdleAmplitude`
  - `armKickSwing`
  - `armTurnSwing`
  - `armCloseBySpeed`
  - `legKickFrequency`
  - `legKickAmplitude`
  - `kickRecoverLength`
  - `kickDriveLength`
  - `kickBodyWave`
  - `finDriveLength`
  - `finRecoverLength`
  - `turnLegOffset`
  - `idleDriftSpeed`
  - `finSpreadBase`
  - `finSpreadSwim`
  - `finSpreadStroke`
  - `finTurnSkew`

这一轮实现后，`processManualDrive()` 和 `drawDiver()` 的职责又进一步收口：

- `processManualDrive()` 现在不仅负责把逐触点输入转成推进和转向，还负责把角色表现数据做成"有限速、可衰减"的动作运行态
- `kickProgressRate` 用于限制踢水进度单帧推进速度，避免用户快搓时动作跟着抽快
- `kickRecoverRate`、`kickStrengthDecay` 负责输入结束后的慢后摇和力度衰减，让剩余惯性由动作尾巴承载，而不是立刻断掉
- 更高的 `dragForward` / `dragLateral` 让一次输入后的速度保留得更久，玩家不必一直高频搓屏才能维持巡航
- `drawDiver()` 里的腿部表现已从"抬腿放腿"改成身体扭动带动大腿、小腿和脚蹼前后传导的发力链；脚蹼会通过 `finDriveLength` / `finRecoverLength` 表现前收与后扫
- 手臂会按当前速度通过 `armCloseBySpeed` 自动向身体收拢，速度慢下来后再张开
- 头部额外灰点和头部高光锚点已完全移除，只保留头部轮廓本身

本阶段进一步引入"全身动画"层（躯干波动相位时钟）：

- `RenderDiver.ts` 内新增模块级 `bodyClocks: Map<id, {phase}>`，与腿部 `legClocks` 并列。每个角色独立持有一个躯干波相位。
- 躯干波相位每帧按三路频率叠加推进：`bodyWaveIdleFreq` + `speedNorm * bodyWaveForwardFreq` + `|turnVisual| * bodyWaveTurnFreq`；三种场景的幅度基数同理由 `bodyWaveIdleAmp / bodyWaveForwardAmp / bodyWaveTurnAmp` 合成 `bodySwayAmp`。
- 身体 yaw / roll / 呼吸压缩 / 手臂反相摆动 / 头部蛇形偏移全部读取同一个 `bodyWave`，保证全身节奏一致。
- roll 在渲染出口处除了用作旋转角，还叠加一层 Y 轴压缩（`rollSquashFactor`、`rollSquashMax`），用 2D 模拟 3D 侧倾；turn 时 roll 的 `turnVisual * rollTurnFactor` 是主贡献项，需要达到约 16° 可见侧倾。
- 头部相对身体保留固定相位领先（`bodyWaveHeadLead` / `headLeadFactor` / `headTurnLead`），最终在 `arc(15.8, headYawLead * headOffsetScale, ...)` 处生效，形成"头先转、身后跟"的蛇形传导。
- idle 状态下，腿部相位时钟不再归零：`legIdleAmpNorm * idleBlend` 给腿一个最低鞭腿幅度，对应 `legIdleFreqFactor` 控制 idle 呼吸节奏；整体位置还多叠一个 `bodyIdleDriftAmp`，让静止漂浮时身体也有可见的上下呼吸。
- 自动挡贴身（`autoBlend`）下手臂通过 `armBodyWaveAmp * (1 - autoBlend * 0.6)` 仍保留约 40% 的反相抖动，避免贴身观感变成"定死的两根棍"。

同时 `ManualDrive.ts::updateAutoDriveVisual()` 中自动挡的 `turnAbs` 归一化从 0.6 rad 改为 0.22 rad，正常巡游的小转向也能驱动出可见的全身转向动画。

`CONFIG.diver` 为此新增 24 个参数：`bodyWaveIdleFreq / bodyWaveForwardFreq / bodyWaveTurnFreq / bodyWaveIdleAmp / bodyWaveForwardAmp / bodyWaveTurnAmp / yawWaveFactor / yawTurnFactor / rollWaveFactor / rollTurnFactor / rollSquashFactor / rollSquashMax / compressWaveAmp / armBodyWaveAmp / armTurnLeanFactor / bodyWaveHeadLead / headLeadFactor / headTurnLead / headOffsetScale / legIdleAmpNorm / legIdleFreqFactor / bodyIdleDriftAmp`。

GM 面板里 **"手动挡"** 和 **"角色"** 两个 Tab 都已同步更新到这套新语义。

因此后续如果要继续改：

- **轮廓结构和动作公式**：优先看 `RenderDiver.ts`
- **逐触点输入消费与前进/转向分解**：优先看 `src/logic/ManualDrive.ts` 中 `processManualDrive()`
- **玩家 / NPC 的调用接线**：优先看 `Render.ts`

### 2.4 光照混合架构说明

光照系统采用 **Canvas 2D + WebGL 混合架构**：

- **CPU 端**（`RenderLight.ts`）：射线碰撞检测（`getLightPolygon`）、泥沙衰减计算（`computeSiltAttenuation`）、视线检测（`isLineOfSight`）
- **GPU 端**（`WebGLLight.ts`）：用独立 WebGL canvas 渲染光照遮罩和体积光，通过 fragment shader 在一个 draw call 中完成手电筒光锥、自身发光、环境感知、漫散射、VPL 反弹光；同时负责自动曝光的 CPU 端估算（`computeExposure()`）
- **Shader 文件**（`src/render/shaders/`）：`.glsl` 为原始 shader 源码，`.glsl.ts` 为 TypeScript 导出版本，两者需保持同步
- **合成**：WebGL canvas 通过 `drawImage` 合成到主 Canvas 2D 画布

这种架构将光照 draw call 从 600~2200 次/帧降低到 2 次/帧（遮罩 + 体积光各 1 次），解决了手机端性能问题。

#### 手电筒光照参数化

手电筒光照的所有关键参数都集中在 `CONFIG.flashlight` 子对象中，通过 uniform 传递给 shader，运行时可通过 GM 面板实时调整。参数分为四组：

- **遮罩层**：`flatRatio`（径向全亮区占比）、`edgeFadeRatio`（角度边缘淡出）、`maskPow`（遮罩 alpha 指数）、`maskMinAlpha`（最亮处最小遮罩）
- **体积光层**：`volOuterIntensity`（外层泛光强度）、`volCenterIntensity`（中心光束强度）、`volOuterColor`/`volCenterColor`（颜色 RGB）
- **VPL 反弹光**：`vplBounceBase`（反弹基数）、`vplRadius`（影响半径）、`vplMaskStrength`（遮罩层系数）、`vplVolStrength`（体积光层系数）
- **漫散射**：`scatterIntensity`、`scatterDistRatio`、`scatterRadiusRatio`

光照模型采用**均匀铺光模型**：前 `flatRatio` 比例的距离内亮度不衰减（全亮），之后用 `smoothFade`（Hermite 插值 `t²(3-2t)`）平滑衰减到 0。角度方向上，从 FOV 的 `(1 - edgeFadeRatio)` 处开始渐变到边缘。这种模型替代了早期的物理平方反比衰减，解决了"中间窄亮、边上暗、再边上又亮"的不均匀问题。

#### 后处理系统（曝光 + Tone Mapping）

后处理参数集中在 `CONFIG.postProcess` 中，三个功能可独立开关、也可叠加使用：

- **手动曝光**：`enableManualExposure` + `manualExposure`，直接乘以光照值
- **自动曝光**：`enableAutoExposure`，CPU 端 `computeExposure()` 根据手电筒状态、自发光、环境感知估算场景亮度，用平滑过渡计算目标曝光值，限制在 `[autoExposureMin, autoExposureMax]` 范围内
- **Tone Mapping**：`enableToneMapping`，支持 Reinhard 扩展（`toneMappingMode=0`，白点可调）和 ACES Filmic（`toneMappingMode=1`）两种算子

处理流程：`totalLight/color 计算完毕 → × exposure → tone mapping（如果启用）→ clamp → 输出`。两个 shader（遮罩层和体积光层）都应用相同的后处理链。

#### 手机端 WebGL 兼容性关键点

WebGL canvas 在微信小游戏手机端有两个必须遵守的兼容性约束：

1. **`preserveDrawingBuffer: true` 是必须的**。WebGL 规范默认 `preserveDrawingBuffer: false`，意味着每次合成操作后 drawing buffer 会被自动清空。在手机 GPU 上，`drawImage` 读取 WebGL canvas 时如果 buffer 已被清空就会读到空白。桌面端通常有隐式 buffer 保留所以不会暴露问题，但手机端严格遵循规范。因此 `getContext('webgl')` 必须传入 `{ preserveDrawingBuffer: true }`。

2. **每次 `drawArrays` 后必须调用 `gl.flush()`**。手机 GPU 的 `drawArrays` 只是把命令提交到命令队列，不保证立即执行完毕。如果紧接着用 `ctx.drawImage(glCanvas)` 读取，GPU 可能还没渲染完。`gl.flush()` 确保命令队列被提交执行。

此外还建议设置 `premultipliedAlpha: false` 避免预乘 alpha 导致颜色混合异常。

### 2.5 修改渲染时的优先落点

如果需求是：

- 主线 HUD、控制器、攻击/手电按钮、刀光特效
  - 先看 `RenderUI.ts`
- 主菜单、章节选择
  - 先看 `RenderMenu.ts`
- 结局画面
  - 先看 `RenderEnding.ts`
- 竞技场 HUD 和死亡结算
  - 先看 `RenderArenaUI.ts`
- 迷宫模式 HUD、岸上界面、认知地图
  - 先看 `RenderMazeUI.ts`
- 手电光照效果、光锥形状、亮度曲线
  - 先看 `src/render/shaders/maskFrag.glsl` 和 `volumetricFrag.glsl`
  - 参数调整先看 `CONFIG.flashlight` 和 GM 面板
- 射线碰撞、泥沙遮挡算法
  - 先看 `RenderLight.ts`
- 绳子外观、绳结、钉子、收紧表现
  - 先看 `RenderRope.ts`
- 标记系统（放置/拆除/轮盘交互）
  - 逻辑先看 `src/logic/Marker.ts`
  - 世界渲染先看 `src/render/RenderMarker.ts`
  - 轮盘 UI 先看 `src/render/RenderWheel.ts`
  - 输入交互先看 `src/core/input.ts` 中轮盘相关段落
  - 参数先看 `CONFIG.marker`
- 敌鱼造型、状态动画、死亡表现
  - 先看 `RenderFishEnemy.ts`
- 玩家或 NPC 潜水员绘制
  - 先看 `RenderDiver.ts`

如果不确定从哪改，先从 `Render.ts` 找到它调用了哪个子模块。

---

## 三、逻辑层与渲染层的数据流

### 3.1 单帧数据流总览

当前项目每一帧大致遵循下面这个顺序：

```text
输入层更新 input
  -> 逻辑层读取 input 并更新 state / player / npc / story / enemies
  -> 渲染层读取最新 state 并绘制
```

也可以进一步细化成：

```text
gameLoop
  -> update() / updateArena()
       -> 修改共享状态
  -> draw()
       -> 读取共享状态
  -> requestAnimationFrame
```

### 3.2 这是"状态驱动渲染"，不是"命令式渲染"

渲染层通常不主动决定剧情或玩法，它只根据当前状态判断：

- 该画哪个界面
- 玩家在哪里
- 当前手电亮不亮
- 是否有红屏
- 是否显示放弃按钮
- 当前是否在播放鱼眼闪现

这意味着：

- 如果画面没显示出来，先看渲染判断
- 如果渲染判断依赖的状态根本没被写入，问题其实在逻辑层