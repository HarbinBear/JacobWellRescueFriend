# 技术文档分卷 04：专项系统、渲染与维护落点

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

这三个系统都不是“完全自治模块”，而是：

- 由 `Logic.ts` 驱动更新时机
- 通过 `state` 与其他层交换数据
- 由渲染层读取状态完成表现

这就是当前项目的典型模式：

**专项逻辑模块负责算法和局部规则，总入口文件负责调度。**

---

## 二、渲染总入口 `src/render/Render.ts`

### 2.1 `draw()` 是统一渲染出口

无论当前在菜单、主线、竞技场还是结局页，都会走到 `Render.ts` 的总入口。

它的核心职责是：

- 清屏或准备画布
- 根据 `state.screen` 分发到不同渲染路径
- 组合多个专项渲染模块

### 2.2 渲染分发思路

当前渲染层不是“一文件画完整个游戏”，而是：

- 总入口根据模式分发
- 子模块按对象或功能绘制

这和逻辑层的结构类似：

- 总文件负责调度
- 专项模块负责具体表现

### 2.3 常见渲染模块职责

从目录命名可以推断当前渲染子模块大致包括：

- `Canvas.ts`：画布与上下文基础能力
- `Render.ts`：总绘制入口
- `RenderUI.ts`：UI、菜单、HUD、按钮、提示文案
- `RenderLight.ts`：光照与遮罩
- `RenderRope.ts`：绳索绘制
- `RenderFishEnemy.ts`：敌鱼绘制
- `RenderDiver.ts`：潜水员与角色绘制

### 2.4 修改渲染时的优先落点

如果需求是：

- HUD 布局、菜单按钮、结算文本、操作提示
  - 先看 `RenderUI.ts`
- 手电光照、黑暗遮罩、光束样式
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

### 3.2 这是“状态驱动渲染”，不是“命令式渲染”

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

---

## 四、常见需求应该改哪里

### 4.1 改章节推进

优先检查：

- `src/logic/Logic.ts`
- `src/story/StoryManager.ts`
- `src/core/state.ts`

常见动作：

- 新增 `stage`
- 新增 `flags`
- 在 `update()` 中插入触发条件
- 在 `resetGameLogic()` 中设置该关初始状态

### 4.2 改数值与手感

优先检查：

- `src/core/config.ts`
- `src/core/input.ts`
- `src/logic/Logic.ts`

### 4.3 改地图、出生点、地标

优先检查：

- `src/world/map.ts`
- `src/core/config.ts`
- `src/logic/Logic.ts`

### 4.4 改 UI、菜单、按钮位置

优先检查：

- `src/render/RenderUI.ts`
- `src/core/config.ts`
- `src/core/input.ts`

### 4.5 改绳索行为

优先检查：

- `src/logic/Rope.ts`
- `src/render/RenderRope.ts`
- `src/core/config.ts`

### 4.6 改凶猛鱼行为或攻击判定

优先检查：

- `src/logic/FishEnemy.ts`
- `src/render/RenderFishEnemy.ts`
- `src/core/config.ts`
- `src/logic/Logic.ts`

### 4.7 改竞技场流程

优先检查：

- `src/logic/Logic.ts` 中的 `resetArenaLogic()` 与 `updateArena()`
- `src/core/config.ts` 中的 `fishArena`
- `src/render/RenderUI.ts`

---

## 五、扩展代码时最容易踩的坑

### 5.1 只加状态，不做重置

这是最常见问题之一。

新增字段后要检查：

- `resetState()`
- `resetGameLogic()`
- `resetArenaLogic()`

是否都应该处理。

### 5.2 只改地图，不改剧情地标

很多剧情触发依赖硬坐标或关键地标。

如果地图改了，但：

- `chamber12Junction`
- `chamber23Junction`
- `tunnelEntry`
- `tunnelEnd`
- `grayThingX` / `grayThingY`

没有同步调整，剧情很容易失效。

### 5.3 只改渲染，不改逻辑状态

比如某按钮“想显示却没显示”，未必是 UI 文件出问题，也可能是逻辑层根本没有把显示状态设为真。

### 5.4 忽略 `state.screen` 导致逻辑串模式

新增逻辑时一定要确认它应该运行在：

- 主线
- 竞技场
- 菜单
- 结局页

不要让主线逻辑在竞技场里偷偷执行，或者竞技场逻辑污染主线状态。

### 5.5 在 `update()` 里插入逻辑但没考虑早退

很多功能虽然写在 `update()` 里，但如果放在错误位置，可能会被：

- 过场早退
- 黑屏早退
- 非 `play` 早退

直接跳过。

新增逻辑前要先想清楚：

- 它应该在过场时也执行吗
- 它应该在黑屏时继续执行吗
- 它应该在结局阶段停掉吗

---

## 六、给后续模型的阅读顺序建议

如果是第一次接手代码，建议按这个顺序读：

1. `game.ts`
   - 先搞清启动与主循环
2. `src/core/state.ts`
   - 先搞清状态树长什么样
3. `src/logic/Logic.ts`
   - 再搞清主线和竞技场每帧怎么推进
4. `src/render/Render.ts`
   - 再搞清渲染如何按模式分发
5. `src/core/config.ts`
   - 再搞清主要参数从哪来
6. `src/core/input.ts`
   - 再搞清玩家输入如何进入系统
7. `src/world/map.ts`
   - 再搞清地图、区域、地标如何初始化
8. `src/story/StoryManager.ts`
   - 最后看剧情文本与演出管理

如果需要改专项功能，再继续深入：

- 绳索：`src/logic/Rope.ts`、`src/render/RenderRope.ts`
- 敌鱼：`src/logic/FishEnemy.ts`、`src/render/RenderFishEnemy.ts`
- UI：`src/render/RenderUI.ts`
- 光照：`src/render/RenderLight.ts`
- 粒子：`src/logic/Particle.ts`

---

## 七、最重要的代码层认知摘要

可以把项目代码层浓缩成一句话：

**这是一个以 `game.ts` 为入口、以 `state.ts` 为共享状态中枢、以 `Logic.ts` 为运行时调度中心、以 `Render.ts` 为统一绘制出口，并通过 `config / input / map / story / rope / fish / ui` 等模块共同组成的状态驱动型微信小游戏代码结构。**

如果再拆成五点：

- **入口中心**：`game.ts`
- **状态中心**：`src/core/state.ts`
- **逻辑中心**：`src/logic/Logic.ts`
- **渲染中心**：`src/render/Render.ts`
- **调参中心**：`src/core/config.ts`

后续无论是补剧情、加关卡、调敌人、改 UI，基本都可以先从这五个中心反推到正确落点。
