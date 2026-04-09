---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
# 技术文档分卷 08：代码层认知摘要与技术文档总索引

## 本卷用途

本卷是技术文档分卷的**总结与索引卷**，主要回答下面这些问题：

- 整个项目的代码层应该如何理解为一个完整的系统
- 第一次接手的模型应该按什么顺序阅读代码
- 修改不同功能时应该优先去哪里找
- 技术文档分卷之间的逻辑关系是什么

本卷不包含具体实现细节，而是提供**认知框架和导航工具**。

---

## 一、最重要的代码层认知摘要

可以把项目代码层浓缩成一句话：

**这是一个以 `game.ts` 为入口、以 `state.ts` 为共享状态中枢、以 `Logic.ts` 为运行时调度中心、以 `Render.ts` 为统一绘制出口，并通过 `config / input / map / story / rope / fish / ui` 等模块共同组成的状态驱动型微信小游戏代码结构。**

如果再拆成五点：

- **入口中心**：`game.ts`
- **状态中心**：`src/core/state.ts`
- **逻辑中心**：`src/logic/Logic.ts`
- **渲染中心**：`src/render/Render.ts`
- **调参中心**：`src/core/config.ts`

后续无论是补剧情、加关卡、调敌人、改 UI，基本都可以先从这五个中心反推到正确落点。

### 1.1 状态驱动架构的关键理解

项目采用**集中式共享状态架构**，而不是强消息总线架构：

- 逻辑层直接读写全局状态
- 渲染层直接读取全局状态
- 输入层直接写入输入状态或触发状态变化
- 剧情层会修改剧情状态、文本状态、演出状态

这意味着状态树是整个项目的中枢，很多行为靠 `state.story.stage`、`state.story.flags`、`state.screen`、`state.npc.state` 等字段协同驱动。

### 1.2 专项系统的协作模式

粒子、绳索、敌鱼等专项系统都不是"完全自治模块"，而是：

- 由 `Logic.ts` 驱动更新时机
- 通过 `state` 与其他层交换数据
- 由渲染层读取状态完成表现

当前项目的典型模式是：**专项逻辑模块负责算法和局部规则，总入口文件负责调度**。

### 1.3 主循环与渲染流程

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

这是"状态驱动渲染"，不是"命令式渲染"。渲染层通常不主动决定剧情或玩法，它只根据当前状态判断该画什么。

---

## 二、给后续模型的阅读顺序建议

如果是第一次接手代码，建议按这个顺序读：

### 2.1 第一步：建立最外层认知

1. **`game.ts`**
   - 先搞清启动与主循环
2. **`src/core/state.ts`**
   - 先搞清状态树长什么样
3. **`src/logic/Logic.ts`**
   - 再搞清主线和竞技场每帧怎么推进
4. **`src/render/Render.ts`**
   - 再搞清渲染如何按模式分发
5. **`src/core/config.ts`**
   - 再搞清主要参数从哪来
6. **`src/core/input.ts`**
   - 再搞清玩家输入如何进入系统
7. **`src/world/map.ts`**
   - 再搞清地图、区域、地标如何初始化
8. **`src/story/StoryManager.ts`**
   - 最后看剧情文本与演出管理

### 2.2 第二步：深入专项功能

如果需要改专项功能，再继续深入：

- **绳索系统**：`src/logic/Rope.ts`、`src/render/RenderRope.ts`
- **敌鱼系统**：`src/logic/FishEnemy.ts`、`src/render/RenderFishEnemy.ts`
- **UI 系统**：`src/render/RenderUI.ts`
- **光照系统**：`src/render/RenderLight.ts`、`src/render/WebGLLight.ts`
- **粒子系统**：`src/logic/Particle.ts`
- **GM 调参面板**：`src/gm/GMConfig.ts`、`src/gm/GMPanel.ts`、`src/gm/GMRender.ts`
- **迷宫场景渲染**：`src/render/RenderMazeScene.ts`
- **角色表现**：`src/render/RenderDiver.ts`

### 2.3 第三步：按任务需求选择技术文档分卷

技术文档分卷已经拆分为：

1. **`01-runtime-overview.md`**：入口、分层与运行时总览
2. **`02-state-and-config.md`**：状态树、配置与输入系统
3. **`03-logic-and-story.md`**：地图、剧情与主逻辑流程
4. **`04-render-subsystems.md`**：专项系统、渲染总入口与数据流
5. **`05-common-tasks-pitfalls.md`**：常见需求、扩展陷阱与阅读顺序
6. **`06-maze-scene-enhancement.md`**：迷宫模式场景辨识度扩展落点
7. **`07-playdead-methodology.md`**：Playdead 方法论技术落地稿
8. **`08-code-summary-guidance.md`**：本卷（代码层认知摘要与技术文档总索引）

**总入口文件**：`code.md` 包含所有分卷的阅读指引和导航。

---

## 三、技术文档分卷功能速查表

| 分卷 | 回答的核心问题 | 适合什么时候读 |
|------|----------------|----------------|
| **01-runtime-overview** | 项目从哪里启动？每一帧怎么流转？模式切换靠什么控制？ | 第一次接触项目时，建立最外层认知 |
| **02-state-and-config** | 全局状态树有哪些关键分区？配置参数去哪里调？输入如何接入？ | 改状态字段、调参数、加输入逻辑时 |
| **03-logic-and-story** | 地图如何初始化？主线每帧如何推进？NPC行为和碰撞在哪里处理？ | 改章节、地图、NPC、碰撞、竞技场流程时 |
| **04-render-subsystems** | 粒子、绳索、敌鱼分别负责什么？渲染总入口如何分发？ | 改UI、光照、绳索、敌鱼、粒子、渲染表现时 |
| **05-common-tasks-pitfalls** | 常见需求应该改哪里？扩展代码容易踩哪些坑？ | 接到具体需求时，快速找到实现路径 |
| **06-maze-scene-enhancement** | 迷宫场景辨识度如何实现？数据如何放置？各层如何配合？ | 改迷宫场景辨识度、材质响应深化时 |
| **07-playdead-methodology** | P6/P7/P8/曝光如何实现？系统现在在哪？应该从哪里下手？ | 实现表现层改进、光照优化、相机系统时 |
| **08-code-summary-guidance** | 整个项目如何理解为一个系统？应该按什么顺序阅读？ | 查找导航、建立整体认知框架时 |

### 3.1 设计文档与技术文档分工

需要区分两个文档体系：

- **`design.md` 与 `design/` 分卷**：回答**这个项目想做成什么样，为什么这样设计**。
- **`code.md` 与 `code/` 分卷**：回答**这个项目现在的代码是怎么跑起来的，应该去哪里改**。

还有一份关键文档：
- **`devplan.md`**：回答**接下来要做什么、做到哪了、还剩什么**。每次新会话开始时必须先读。

### 3.2 本地检查约定

项目保留微信开发者工具的 TypeScript 自动处理流程用于实际运行小游戏，但提供了 `npm run typecheck` 供仓库内主动检查 TypeScript 报错：

- 如果在本地确认是否存在 TypeScript 报错，优先执行 `npm run typecheck`
- 该命令实际执行 `tsc --noEmit`，只做类型检查，不生成 `dist` 输出
- `npm run build` 仍可用于生成 `dist`，但不是排查报错的首选入口

### 3.3 版本控制与忽略文件约定

- 项目根目录提供 `.gitignore`，用于过滤本地依赖、构建产物、系统缓存、编辑器缓存和微信开发者工具私有配置
- 当前默认忽略的重点包括：`node_modules/`、`dist/`、`*.tsbuildinfo`、`.DS_Store`、`.vscode/`、`.idea/`、`project.private.config.json` 与各类包管理器调试日志
- `project.config.json` 仍然保留在版本控制中，因为它属于项目级配置；只有 `project.private.config.json` 属于本地私有配置，应忽略
- 音频、贴图、`src/` 源码、`typings/` 与 `.codebuddy/rules/` 文档都不应被忽略

---

## 四、按任务类型查找实现路径

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

### 4.8 改 GM 调参面板

优先检查：
- `src/gm/GMConfig.ts`（参数条目与布局常量）
- `src/gm/GMPanel.ts`（状态与交互逻辑）
- `src/gm/GMRender.ts`（绘制）

常见动作：
- 新增可调参数：在 `GMConfig.ts` 的 `TABS` 数组对应 Tab 的 `items` 中添加条目
- 新增 Tab 页签：在 `GMConfig.ts` 的 `TABS` 数组中添加新对象
- 调整面板布局：修改 `GMConfig.ts` 中的布局常量
- 改面板样式：修改 `GMRender.ts`

### 4.9 改迷宫模式

优先检查：
- `src/world/map.ts` 中的 `generateMazeMap()`
- `src/world/mazeScene.ts`（场景辨识度相关）
- `src/logic/Logic.ts` 中的 `resetMazeLogic()` 与 `updateMaze()`
- `src/render/RenderMazeScene.ts`
- `src/render/RenderUI.ts` 中的迷宫相关 UI 函数

### 4.10 改光照与表现层

优先检查：
- `src/render/WebGLLight.ts`
- `src/render/RenderLight.ts`
- `src/render/shaders/` 目录下的 GLSL 文件
- `src/core/config.ts` 中的 `flashlight` 和 `postProcess` 配置
- `src/gm/GMConfig.ts` 中的手电筒、光照、后处理 Tab

---

## 五、扩展代码时的核心检查清单

### 5.1 状态字段扩展检查

新增字段后要检查：

- 是否需要在 `resetState()` 清理
- 是否需要在主线开局设置默认值（`resetGameLogic()`）
- 是否需要在竞技场开局设置默认值（`resetArenaLogic()`）
- 是否需要在迷宫开局设置默认值（`resetMazeLogic()`）

### 5.2 地图修改检查

改地图时要检查：

- `state.landmarks` 中关键坐标是否还合理
- `state.zones` 是否仍覆盖正确区域
- `Logic.ts` 中依赖地标的剧情触发距离是否还成立
- 绳索系统是否还能正常找到墙体
- 敌鱼生成点是否被墙卡住

### 5.3 渲染修改检查

改渲染时要确认：

- 新增的渲染逻辑是否受 `state.screen` 模式控制
- 状态依赖是否正确（画面没显示可能是逻辑层没写入状态）
- 性能影响是否可控（特别是手机端 WebGL 兼容性）

### 5.4 光照相关改动注意事项

光照相关改动需要注意手机端 WebGL 兼容性：

- WebGL canvas 必须设置 `preserveDrawingBuffer: true`
- 每次 `drawArrays` 后必须调用 `gl.flush()`
- 建议设置 `premultipliedAlpha: false` 避免预乘 alpha 导致颜色混合异常

### 5.5 最重要的一点

**每次迭代完成后必须运行 `npm run typecheck` 确认无 TypeScript 报错。**

---

## 六、技术文档使用工作流

### 6.1 新会话开始时的标准流程

1. **先读 `devplan.md`**：了解当前迭代进度、待办任务、已完成工作
2. **根据任务类型选择技术文档分卷**：使用本卷的速查表找到最相关的分卷
3. **阅读对应代码文件**：按照分卷指引找到具体实现位置
4. **修改代码**：遵循扩展代码检查清单
5. **更新文档**：完成后更新 `devplan.md` 中的进度状态

### 6.2 技术文档的维护原则

技术文档需要保持：

- **准确性**：代码改动后，相关文档要及时更新
- **简洁性**：每个分卷专注回答一类问题，避免过长
- **可索引性**：结构清晰，codebuddy 能够精准索引
- **实用性**：提供具体文件路径和实现方案，而不是抽象理论

### 6.3 本卷作为总索引的作用

本卷 `08-code-summary-guidance.md` 是技术文档体系的**总入口和导航工具**，当你：

- 不知道从哪里开始读代码时 → 看第二节"阅读顺序建议"
- 不确定哪个分卷相关时 → 看第三节"功能速查表"
- 要改具体功能但不知道去哪找时 → 看第四节"按任务类型查找"
- 要扩展代码但怕遗漏检查点时 → 看第五节"扩展代码检查清单"

**记住**：技术文档解决的是"这个项目现在的代码是怎么跑起来的，应该去哪里改"。设计意图和设计原则请查看对应的 `design.md` 和 `design/` 分卷。