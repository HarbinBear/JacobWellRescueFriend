---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
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

### 5.6 排障时优先跑本地类型检查

当前项目的实际运行仍高度依赖微信开发者工具，但后续模型如果要先判断仓库里是否存在 TypeScript 级别的报错，应优先执行：

- `npm run typecheck`

这条命令使用 `tsc --noEmit`，优点是：

- 不依赖微信开发者工具界面
- 不需要生成 `dist`
- 更适合在命令行里快速确认当前修改是否引入新的类型或编译错误

因此在维护流程里，推荐顺序是：

1. 先跑 `npm run typecheck`。
2. 如果有报错，先修 TypeScript 层问题。
3. 如果类型检查通过，再继续定位运行时逻辑或渲染问题。

---

## 六、迷宫模式场景辨识度扩展落点（规划，当前未实现）

这一节不是描述当前已存在的代码，而是为“场景辨识度”这项下一阶段工作，提前给出**最适合落地到现有工程的实现方案**。

目标不是重做渲染管线，而是在不破坏当前迷宫闭环的前提下，补出：

- 区域材质主题
- 洞室母题标签
- 叙事物件点位
- 认知地图与返岸摘要中的辨识信息

### 6.1 为什么这项扩展适合现在做

从当前代码结构看，迷宫模式已经具备：

- 独立的 `mazeMap / mazeWalls / mazeExplored`
- 独立的 `resetMazeLogic()` 初始化入口
- 独立的迷宫相位 `shore / diving_in / play / debrief / rescued`
- 独立的岸上认知地图与返岸摘要 UI
- 独立的迷宫渲染分流

这意味着场景辨识度可以作为**迷宫元数据层**插入，而不需要推翻：

- 主循环结构
- 碰撞系统
- 绳索系统
- 手电与光照的总体机制

### 6.2 推荐的数据放置方案

第一原则：把场景辨识度当作**迷宫生成后的附加数据**，而不是把它硬塞进 `mazeMap` 原始格子语义里。

推荐新增的数据类型包括：

- `mazeSceneThemeMap`
  - 与迷宫网格对齐的主题索引图
  - 用于表达某格主要属于哪一类材质区
- `mazeSceneRooms`
  - 洞室级别的空间单元列表
  - 每项至少包含：范围、中心点、主题、母题标签、是否已发现
- `mazeSceneProps`
  - 叙事物件点位列表
  - 每项至少包含：位置、类型、所属主题、是否已发现
- `mazeSceneDiscoveries`
  - 玩家已经带回岸上的辨识信息
  - 用于岸上卡片、认知地图、结算摘要

如果后续需要真正落到状态树，优先挂在 `state.mazeRescue` 下，而不是散落在主线共享状态里。

### 6.3 初始化的最佳落点

当前最佳初始化路径是两段：

#### 6.3.1 `src/world/map.ts` + `src/world/mazeScene.ts`

如果场景辨识度需要依赖迷宫结构分析，那么最合适的地方仍然是迷宫生成阶段，但当前实现已经把职责拆成两层：

- `src/world/map.ts` 负责迷宫主体结构生成，以及把场景元数据和迷宫基础数据一起返回
- `src/world/mazeScene.ts` 负责主岩性定义、局部构造定义、主题选择、主题扩散、过渡混合和局部构造图生成

这样做的优点是：

- 地图结构生成与场景语义生成仍然同属世界层，不会跑到渲染层去决定“这片区域是什么”
- 数据生成一次即可复用
- 不需要运行时重复扫描整张图
- 后续补空间母题或叙事物件时，也有明确的世界层落点

#### 6.3.2 `src/logic/Logic.ts`

如果有一部分数据更适合在运行态初始化，则应放进 `resetMazeLogic()`：

- 把 `generateMazeMap()` 返回的场景元数据挂到 `state.mazeRescue`
- 初始化“本局已发现辨识信息”的运行态字段
- 初始化返岸摘要所需的临时统计字段

总原则是：

- **结构分析放在地图生成时**
- **状态挂接与清零放在迷宫重置时**

### 6.4 渲染层的主要改动落点

#### 6.4.1 `src/render/Render.ts` + `src/render/RenderMazeScene.ts`

当前迷宫场景渲染已经拆成两层：

- `src/render/Render.ts` 只保留总绘制入口、模式分发和迷宫场景绘制调度
- `src/render/RenderMazeScene.ts` 负责迷宫场景专属的主题取色、背景装饰、墙体造型和泥沙着色

因此后续如果是改：

- 不同主岩性区域的底色、壁面色温、局部雾感基调
- 局部构造对墙体轮廓和背景装饰的影响
- 迷宫模式专属的颗粒着色和图例辅助逻辑

优先去 `RenderMazeScene.ts`，而不是继续往 `Render.ts` 塞大段分支。

#### 6.4.2 `src/render/RenderUI.ts`

这是场景辨识度最重要的显示出口之一，适合承接：

- 岸上卡片中的“新发现区域线索”
- 全屏认知地图中的区域底纹、标签和图例扩展
- 返岸结算中的“本次发现了什么地方”

当前这里已经有：

- `drawMazeShore()`
- `drawMazeMapFullscreen()`
- `drawMazeDebrief()`

所以不需要新建一整套 UI 文件，直接在这些函数上加图层即可。

#### 6.4.3 `src/render/RenderLight.ts`

如果后续要让不同区域具备：

- 更冷或更暖的反光
- 更强或更弱的环境感知
- 纯白腔体的高反差边缘

那么优先从这里接入区域主题对光照参数的影响，而不是在业务逻辑里硬编码。

#### 6.4.4 `src/logic/Particle.ts`

场景辨识度里的“动态环境层”最适合从粒子系统接入，例如：

- 不同区域的颗粒密度
- 不同区域的泥沙颜色
- 特定母题房间的悬浮碎屑观感

这里要特别注意，第一版应优先调整已有粒子的参数和着色，不要直接引入大量新粒子类型。

### 6.5 逻辑层的主要改动落点

#### 6.5.1 `src/logic/Logic.ts`

运行时逻辑应主要负责：

- 判断玩家是否首次进入某个主题区域或某个母题洞室
- 记录本次新发现的场景标签
- 在返岸时把这些信息并入 `diveHistory` 或专属摘要结构

它不应该承担复杂的区域分析工作，那部分应尽量在地图生成阶段完成。

#### 6.5.2 `src/core/state.ts`

如果新增了场景辨识度状态，建议优先新增这几类字段：

- 迷宫级静态元数据
- 本次下潜运行态发现记录
- 跨下潜持久化的已知场景标签

并且要同步检查：

- `resetMazeLogic()` 的初始化
- 返岸结算时的归档
- 重新开一局迷宫时的完整清理

### 6.6 配置层的推荐做法

`src/core/config.ts` 适合新增的不是一堆零散魔法数，而是一组结构化的场景主题配置，例如：

- 主题颜色
- 颗粒密度倍率
- 局部反光强度
- 物件生成概率
- 母题房间出现比例

这样后续调风格时，可以优先调配置而不是到处改渲染细节。

### 6.7 第一版最可行的开发顺序

#### 6.7.1 第一步：主题层

先完成：

- 区域主题分配
- 主题驱动的壁面 / 底色 / 颗粒差异
- 认知地图图例补充

这是最容易被玩家立即感知、同时实现成本最低的一步。

#### 6.7.2 第二步：母题层

再补：

- 洞室识别
- 洞室标签
- 首次发现记录
- 返岸摘要中的文字化表达

这一步开始让“辨识度”真正变成岸上可复述的信息。

#### 6.7.3 第三步：物件层

最后再补：

- 脚蹼、破瓶、断绳、手电等物件簇
- 地图与结算中的对应线索
- 更强的空间记忆锚点

这样推进可以避免一开始就把程序、美术和 UI 同时拉进高复杂度协作。

### 6.8 工程约束与性能边界

这项扩展必须遵守几个工程约束：

1. **迷宫结构分析应以“生成一次、运行复用”为主**，不要每帧重新扫图。
2. **渲染层只处理视口内信息**，不要为全图细节支付持续成本。
3. **认知地图允许抽象采样**，不需要 1:1 复刻场景细节。
4. **不要让场景辨识度改变碰撞与绳索语义**，第一版只增强感知与认知。
5. **新增状态必须跟随迷宫重置逻辑清理**，避免跨局污染。

### 6.9 验收标准建议

如果后续真正开始实现，建议按下面标准验收：

- 玩家在水下能明显感知至少三类不同区域气质
- 返岸后能看到"发现了哪类空间或线索"，而不只是数字统计
- 认知地图能表达至少一层区域差异，而不是只有统一笔触
- 不引入明显掉帧
- `npm run typecheck` 通过

### 6.10 第一阶段实现记录（主岩性层，已完成）

第一阶段“主岩性层”已落地，改动涉及以下文件：

- **`src/core/config.ts`**：迷宫配置收口为参数入口，只保留 `themesPerGame`、`sceneTransitionWidth`、`stalactiteClusterChance` 这类生成参数，不再承担完整主题仓库与运行时容器职责
- **`src/world/mazeScene.ts`**：集中定义主岩性配置（黄泥区、白石灰岩区、红褐沉积区、页岩夹层区、硬岩块裂区）、主题选择、颜色混合与场景图生成
- **`src/world/map.ts`**：`generateMazeMap()` 返回值新增 `mazeSceneThemeKeys`、`mazeSceneThemeMap`、`mazeSceneBlendMap`、`mazeSceneStructureMap`
- **`src/core/state.ts`**：`mazeRescue` 新增 `sceneThemeKeys`、`sceneThemeMap`、`sceneBlendMap`、`sceneStructureMap`
- **`src/logic/Logic.ts`**：`resetMazeLogic()` 挂载每局迷宫自己的场景数据；`updateMaze()` 按每局主题列表记录首次发现；`finishMazeDive()` 把本次新发现主岩性归档到 `diveHistory`
- **`src/render/RenderMazeScene.ts`**：集中处理迷宫主题取色、泥沙着色和图例辅助能力
- **`src/render/Render.ts`**：只负责在正确时机调度迷宫场景取色、背景装饰和墙体造型绘制
- **`src/render/RenderUI.ts`**：认知地图水域着色、图例和结算页都改为读取每局迷宫状态，而不再依赖全局配置运行时字段

### 6.11 第二阶段实现记录（局部构造层与模块化重构，已完成首版）

第二阶段在第一阶段基础上完成了三项关键增强：

#### A. 场景语义重构（三层语义替代旧单层主题）

- **设计语义**：迷宫场景现在分为“主岩性层 / 局部构造层 / 空间母题层”
- **当前代码已落地部分**：主岩性层和局部构造层
- **关键调整**：
  - `页岩` 保留为主岩性，用层理与片状轮廓表达
  - 原本想表达的“花岗岩感”改名为 **`硬岩块裂区`**，避免地质命名和玩家感知脱节
  - `钟乳石` 不再作为主岩性主题，而是降级为局部构造，覆盖在白石灰岩区或硬岩块裂区之上

#### B. 区域衔接自然过渡（硬切 → 渐变混合）

- **`src/world/mazeScene.ts`**：主题分配改为带距离记录的扩散；输出 `sceneBlendMap` 供过渡带使用
- **`src/render/RenderMazeScene.ts`**：统一通过 `blendHexColors()` 和主题索引辅助函数处理墙体与内壁混色
- **`src/render/Render.ts`**：不再内联主题混色逻辑，只保留调用

#### C. 局部构造图 + 专用渲染模块

- **`src/world/mazeScene.ts`**：新增 `sceneStructureMap`，首版用于生成钟乳石簇覆盖层
- **`src/render/RenderMazeScene.ts`**：把背景装饰、墙体造型、局部构造覆写和颗粒着色都集中到迷宫场景专用模块
- **`src/render/Render.ts`**：从“既决定是什么又决定怎么画”的大文件，收缩成主要负责流程调度的入口文件
- **`src/render/RenderUI.ts`**：图例辅助函数改由迷宫场景渲染模块提供，保持 UI 不重复实现迷宫场景解释逻辑
---

## 七、给后续模型的阅读顺序建议

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

## 八、最重要的代码层认知摘要

可以把项目代码层浓缩成一句话：

**这是一个以 `game.ts` 为入口、以 `state.ts` 为共享状态中枢、以 `Logic.ts` 为运行时调度中心、以 `Render.ts` 为统一绘制出口，并通过 `config / input / map / story / rope / fish / ui` 等模块共同组成的状态驱动型微信小游戏代码结构。**

如果再拆成五点：

- **入口中心**：`game.ts`
- **状态中心**：`src/core/state.ts`
- **逻辑中心**：`src/logic/Logic.ts`
- **渲染中心**：`src/render/Render.ts`
- **调参中心**：`src/core/config.ts`

后续无论是补剧情、加关卡、调敌人、改 UI，基本都可以先从这五个中心反推到正确落点。