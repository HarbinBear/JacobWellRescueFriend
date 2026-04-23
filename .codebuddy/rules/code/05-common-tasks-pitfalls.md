---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
# 技术文档分卷 05：常见任务与维护指引

## 本卷用途

本卷主要回答下面这些问题：

- 改章节、数值、地图、UI时应该优先改哪里
- 扩展代码时最容易踩哪些坑
- 新会话模型应该按什么顺序读源码
- 如何有效排障和本地检查

如果任务涉及需求定位、维护排障或扩展开发，应优先阅读本卷。

---

## 一、常见需求应该改哪里

### 1.1 改章节推进

优先检查：

- `src/logic/Logic.ts`
- `src/story/StoryManager.ts`
- `src/core/state.ts`

常见动作：

- 新增 `stage`
- 新增 `flags`
- 在 `update()` 中插入触发条件
- 在 `resetGameLogic()` 中设置该关初始状态

### 1.2 改数值与手感

优先检查：

- `src/core/config.ts`
- `src/core/input.ts`
- `src/logic/Logic.ts`

### 1.3 改地图、出生点、地标

优先检查：

- `src/world/map.ts`
- `src/core/config.ts`
- `src/logic/Logic.ts`

### 1.4 改 UI、菜单、按钮位置

优先检查：

- `src/render/RenderUI.ts`
- `src/core/config.ts`
- `src/core/input.ts`

### 1.5 改绳索行为

优先检查：

- `src/logic/Rope.ts`
- `src/render/RenderRope.ts`
- `src/core/config.ts`

### 1.5b 改标记系统（放置/拆除/轮盘交互）

优先检查：

- `src/logic/Marker.ts`（上下文检测、标记放置/拆除、轮盘状态管理）
- `src/render/RenderMarker.ts`（世界空间标记绘制）
- `src/render/RenderWheel.ts`（轮盘 UI 绘制）
- `src/core/input.ts`（轮盘触摸交互）
- `src/core/config.ts` 中的 `marker` 配置
- `src/gm/GMConfig.ts` 中的

### 1.6 改凶猛鱼行为或攻击判定

优先检查：

- `src/logic/FishEnemy.ts`
- `src/render/RenderFishEnemy.ts`
- `src/core/config.ts`
- `src/logic/Logic.ts`

### 1.7 改竞技场流程

优先检查：

- `src/logic/Logic.ts` 中的 `resetArenaLogic()` 与 `updateArena()`
- `src/core/config.ts` 中的 `fishArena`
- `src/render/RenderUI.ts`

### 1.8 改 GM 调参面板

优先检查：

- `src/gm/GMConfig.ts`（参数条目与布局常量）
- `src/gm/GMPanel.ts`（状态与交互逻辑）
- `src/gm/GMRender.ts`（绘制）

常见动作：

- 新增可调参数：在 `GMConfig.ts` 的 `TABS` 数组对应 Tab 的 `items` 中添加条目
- 新增 Tab 页签：在 `GMConfig.ts` 的 `TABS` 数组中添加新对象
- 调整面板布局：修改 `GMConfig.ts` 中的布局常量
- 改面板样式：修改 `GMRender.ts`

### 1.9 改迷宫本地存档（保存/读档/清档）

优先检查：

- `src/core/SaveStorage.ts`（wx / localStorage 统一封装）
- `src/logic/MazeSave.ts`（迷宫存档主模块，v2 压缩格式：mazeMap 运行时重建 + boolean 位图 base64 + 场景图 RLE + 路径量化）
- `src/logic/MazeLogic.ts` 中的三个保存时机：`resetMazeLogic()` 开头读档与末尾兜底保存、`finishMazeDive()` 末尾保存、`returnToShore()` 末尾保存；以及 `replayMazeLogic()` 的清档分支

常见动作：

- **新增要持久化的字段**：
  - 如果字段挂在 `state.mazeRescue` 下且在存档不关心的大字段黑名单之外（`mazeMap` / `mazeWalls` / `mazeExplored` / `thisExploredBefore` / `sceneThemeKeys` / `sceneThemeMap` / `sceneBlendMap` / `sceneStructureMap` / `mazeCols` / `mazeRows` / `mazeTileSize` / `exitX` / `exitY` / `npcInitX` / `npcInitY` / `spawnX` / `spawnY` / `diveHistory` / `playerPath` / `divingInBubbles`），会自动进入 `packed.rest` 里跟随存档写入
  - 如果新字段是黑名单里类似的大矩阵（比如另一份 100×100 数据），需要在 `MazeSave.ts` 里手动添加打包/解包路径
  - `state.rope.ropes` / `state.markers` / `player` 字段都已经单独处理
- **改动存档格式（不兼容）**：递增 `MazeSave.ts` 中的 `MAZE_SAVE_VERSION`，版本不同的老存档会被自动丢弃；并同步调整 `MAZE_SAVE_KEY`（如 `maze_save_v3`），避免老 key 污染
- **调试存档**：调试代码里调用 `clearMazeSave()` 强制清档；或直接清除微信开发者工具的"清缓存 → Storage"
- **体积监控**：`saveMazeProgress()` 会打印存档大小到 console，v2 压缩后单次下潜约 300~400KB，5 次下潜约 1~2MB；接近 800KB 会自动打出 `console.warn`。若多次下潜后仍接近单 key 上限（Android ~512KB），需进一步做：
  1. 减少保留的下潜快照条数（`MAX_DIVE_HISTORY`）
  2. 把 `packed` 拆成多个 key（`maze_save_v3_main` / `maze_save_v3_history`）
  3. 最终切换到 P4 种子方案（地图不存，靠 seed 重建）

---

## 二、扩展代码时最容易踩的坑

### 2.1 只加状态，不做重置

这是最常见问题之一。

新增字段后要检查：

- `resetState()`
- `resetGameLogic()`
- `resetArenaLogic()`

是否都应该处理。

### 2.2 只改地图，不改剧情地标

很多剧情触发依赖硬坐标或关键地标。

如果地图改了，但：

- `chamber12Junction`
- `chamber23Junction`
- `tunnelEntry`
- `tunnelEnd`
- `grayThingX` / `grayThingY`

没有同步调整，剧情很容易失效。

### 2.3 只改渲染，不改逻辑状态

比如某按钮"想显示却没显示"，未必是 UI 文件出问题，也可能是逻辑层根本没有把显示状态设为真。

### 2.4 忽略 `state.screen` 导致逻辑串模式

新增逻辑时一定要确认它应该运行在：

- 主线
- 竞技场
- 菜单
- 结局页

不要让主线逻辑在竞技场里偷偷执行，或者竞技场逻辑污染主线状态。

### 2.5 在 `update()` 里插入逻辑但没考虑早退

很多功能虽然写在 `update()` 里，但如果放在错误位置，可能会被：

- 过场早退
- 黑屏早退
- 非 `play` 早退

直接跳过。

新增逻辑前要先想清楚：

- 它应该在过场时也执行吗
- 它应该在黑屏时继续执行吗
- 它应该在结局阶段停掉吗

### 2.6 排障时优先跑本地类型检查

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

## 三、给后续模型的阅读顺序建议

### 3.1 第一次接手代码的阅读顺序

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

### 3.2 专项功能深入阅读

如果需要改专项功能，再继续深入：

- 手动挡移动：`src/logic/ManualDrive.ts`
- 碰撞检测：`src/logic/Collision.ts`
- 竞技场逻辑：`src/logic/ArenaLogic.ts`
- 迷宫逻辑：`src/logic/MazeLogic.ts`
- 绳索：`src/logic/Rope.ts`、`src/render/RenderRope.ts`
- 标记系统：`src/logic/Marker.ts`、`src/render/RenderMarker.ts`、`src/render/RenderWheel.ts`
- 敌鱼：`src/logic/FishEnemy.ts`、`src/render/RenderFishEnemy.ts`
- 主线 HUD 与控制：`src/render/RenderUI.ts`
- 菜单与章节选择：`src/render/RenderMenu.ts`
- 结局画面：`src/render/RenderEnding.ts`
- 竞技场 UI：`src/render/RenderArenaUI.ts`
- 迷宫 UI：`src/render/RenderMazeUI.ts`
- 光照：`src/render/RenderLight.ts`
- 粒子：`src/logic/Particle.ts`
- GM 调参：`src/gm/GMConfig.ts`、`src/gm/GMPanel.ts`、`src/gm/GMRender.ts`

---

## 四、本地检查与排障工具链

### 4.1 本地检查约定

- 当前项目保留微信开发者工具的 TypeScript 自动处理流程，用于实际运行小游戏。
- 为了让后续接手模型能够在仓库内主动检查 TypeScript 报错，项目额外提供了 `npm run typecheck`。
- `npm run typecheck` 实际执行 `tsc --noEmit`，只做类型检查，不生成 `dist` 输出。
- 如果需要在本地确认是否存在 TypeScript 报错，优先执行 `npm run typecheck`，而不是依赖微信开发者工具内部的报错提示。
- `npm run build` 仍可用于生成 `dist`，但它不是后续模型排查报错的首选入口。
- 如果需要离线查看迷宫生成结果，应执行 `npm run maze:inspect -- 3` 这类命令；它会直接批量打印 ASCII 迷宫图和关键统计指标，便于先验图再改算法。

### 4.2 版本控制与忽略文件约定

- 项目根目录提供 `.gitignore`，用于过滤本地依赖、构建产物、系统缓存、编辑器缓存和微信开发者工具私有配置。
- 当前默认忽略的重点包括：`node_modules/`、`dist/`、`*.tsbuildinfo`、`.DS_Store`、`.vscode/`、`.idea/`、`project.private.config.json` 与各类包管理器调试日志。
- `project.config.json` 仍然保留在版本控制中，因为它属于项目级配置；只有 `project.private.config.json` 属于本地私有配置，应忽略。
- 音频、贴图、`src/` 源码、`typings/` 与 `.codebuddy/rules/` 文档都不应被忽略。