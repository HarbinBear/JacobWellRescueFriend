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

### 1.5c 改氧气瓶系统（迷宫模式补给）

优先检查：

- `src/logic/OxygenTank.ts`（数据结构、派生 seed 生成、按住进度、飞瓶与视觉反馈状态机）
- `src/render/RenderOxygenTank.ts`（瓶体/飞行瓶/气泡爆发/全屏辉光）
- `src/logic/Marker.ts`（`oxygenTank` 上下文、`installTank` 扇区与动作执行）
- `src/logic/MazeLogic.ts`（`resetMazeLogic` 新建 + 读档两个分支都需重建氧气瓶；`updateMaze` 中调用 `updateOxygenTanks()`）
- `src/render/RenderMazeUI.ts`（氧气环脉冲 + "+X%" 跳字 + 全屏辉光挂载点）
- `src/logic/MazeSave.ts`（rest 黑名单已排除 `oxygenTanks` / `oxygenFeedback`；`consumedTankIds` 走 rest 自动持久化）
- `src/core/config.ts` 中的 `oxygenTank` 配置
- `src/gm/GMConfig.ts` 中的"氧气瓶"Tab

常见陷阱：

- 新加"已消耗 id"相关字段时，务必检查 `MazeSave.ts` 的 rest 黑名单，避免误过滤
- 氧气瓶生成必须包裹在派生 seed 的 `setActiveSeededRandom()` / `clearActiveSeededRandom()` 中，否则同 seed 下布局会漂移
- `consumedTankIds` 在换新地图（`replayMazeLogic`）时要清空，否则新地图会继承老瓶子的"已消耗"状态

### 1.5d 改呼吸系统（间歇吐气气泡 + 循环呼吸音）

优先检查：

- `src/logic/BreathSystem.ts`（相位机、运动量映射、气泡生成、音频参数联动）
- `src/render/RenderBreath.ts`（气泡世界空间绘制）
- `src/audio/AudioManager.ts` 中 SFX-Loop 通道（`playSFXLoop / stopSFXLoop / setSFXLoopParams / updateSFXLoops`）
- `src/core/config.ts` 中的 `breath` 配置
- `src/gm/GMConfig.ts` 中的"呼吸"Tab

常见陷阱：

- **气泡绘制层顺序**：必须插在 `drawDustDarkLayer()` 之后、世界 transform 的 `ctx.restore()` 之前（光照之前），才能被光照遮罩统一压暗。放到泥沙 silt 同层（光照之后）会导致黑暗区气泡一样亮。
- **呼吸是间歇的**：不要写成持续吐气。相位机必须是 `exhale → pause → exhale → ...`，不能把 pause 去掉。
- **SFX-Loop 生命周期**：`playSFXLoop()` 启动后，要在 `resetGameLogic()` / `startMazeDive()` / `returnToShore()` 等模式切换入口调用 `resetBreathSystem()` 清理，避免气泡残留到岸上或菜单。
- **playbackRate 兼容性**：微信 `InnerAudioContext.playbackRate` 在手机端不一定生效；浏览器兜底路径（HTMLAudioElement）支持。调参时观察手机端可能只有音量变化、没有音调变化，属正常。
- **云存储新资源权限**：上传新音频后必须去云开发控制台把文件权限改为"所有用户可读"，否则 `getTempFileURL` 会报 `STORAGE_EXCEED_AUTHORITY`。

### 1.5e 改撞击反馈系统（撞岩石音效 + 气泡爆发 + 耗氧 + 氧气条红条）

优先检查：

- `src/logic/CollisionImpact.ts`（触发入口、线性强度映射、冷却去重、双音效并发、扣氧与红条触发）
- `src/logic/BreathSystem.ts` 中 `spawnImpactBurst(cx, cy, strength)`（撞击气泡爆发，与呼吸气泡共用渲染）
- `src/logic/OxygenTank.ts` 中 `triggerO2LossFlash(fromO2, toO2)`（氧气环红色损失弧动画）
- `src/render/RenderMazeUI.ts` 中氧气环红条绘制段落
- `src/audio/AudioManager.ts` 中 `SFXKey`：`collisionRock` 和 `collisionBreath`
- `src/logic/Logic.ts` / `src/logic/MazeLogic.ts` 中的碰撞分支（必须在 `player.vx *= -0.5` 反弹前采样 preVx / preVy）
- `src/core/config.ts` 中 `collisionImpact` 配置
- `src/gm/GMConfig.ts` 中的"撞击"Tab

常见陷阱：

- **preVx/preVy 采样时机**：碰撞分支里把反弹（`player.vx *= -0.5`）之前的速度传进 `triggerCollisionImpact`，否则强度就是反弹后的一半，手感全乱。
- **气泡不要走 `triggerSilt`**：那是泥沙颗粒不是气泡；撞击气泡必须走 `spawnImpactBurst`，与呼吸气泡共用 `bubbles` 列表由 `RenderBreath` 统一绘制。
- **冷却不重置会跨场景误挡**：模式切换（`resetGameLogic / startMazeDive`）时必须调 `resetCollisionImpact()`，否则切图后第一下撞击可能被老冷却挡住。
- **两个音效是独立 SFX 实例**：`collisionRock` 和 `collisionBreath` 在 `CONFIG.audio.cloud.fileIDs` 里各自有 FileID（即便 collisionBreath 复用 BreathBubble.mp3 也必须单独注册 key），这样才能并发播放而不会互相打断呼吸 SFX-Loop。
- **`triggerO2LossFlash` 只在迷宫 play 阶段触发**：主线模式不走 `oxygenFeedback`，函数内部已判断；新增调用点时不要假设主线也有红条反馈。
- **`infiniteO2` 模式下仍走红条**：为了方便调试，无限氧气时 `CollisionImpact` 仍然触发红条动画（只是不真扣氧）；改动扣氧逻辑时要保留这个调试路径。

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