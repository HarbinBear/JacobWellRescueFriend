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
- 打开后展示分 Tab 的参数面板（手电筒 / 光照 / Debug / 玩法 / 后处理）
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
- `RenderUI.ts`：UI、菜单、HUD、按钮、提示文案
- `RenderLight.ts`：光照 CPU 端计算（射线碰撞、泥沙衰减、视线检测）
- `WebGLLight.ts`：光照 GPU 端渲染（WebGL shader，替代旧 Canvas 2D 光照绘制）
- `RenderRope.ts`：绳索绘制
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

GM 面板里 **"手动挡"** 和 **"角色"** 两个 Tab 都已同步更新到这套新语义。

因此后续如果要继续改：

- **轮廓结构和动作公式**：优先看 `RenderDiver.ts`
- **逐触点输入消费与前进/转向分解**：优先看 `Logic.ts` 中 `processManualDrive()`
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

- HUD 布局、菜单按钮、结算文本、操作提示
  - 先看 `RenderUI.ts`
- 手电光照效果、光锥形状、亮度曲线
  - 先看 `src/render/shaders/maskFrag.glsl` 和 `volumetricFrag.glsl`
  - 参数调整先看 `CONFIG.flashlight` 和 GM 面板
- 射线碰撞、泥沙遮挡算法
  - 先看 `RenderLight.ts`
- 绳子外观、绳结、钉子、收紧表现
  - 先看 `RenderRope.ts`
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