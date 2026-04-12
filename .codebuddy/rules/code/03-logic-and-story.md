---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
# 技术文档分卷 03：地图、剧情与主逻辑流程

## 本卷用途

本卷主要回答下面这些问题：

- 地图与地标是在哪里初始化的
- 剧情管理器和主逻辑是如何协作的
- 主线 `update()` 每帧是如何推进的
- 竞技场 `updateArena()` 是怎样运作的
- NPC 行为和区域检测在哪里处理
- 碰撞和空间查询的基础函数在哪里看

如果任务与章节推进、地图初始化、竞技场流程、NPC 行为、碰撞判断有关，应优先阅读本卷。

---

## 一、地图系统 `src/world/map.ts`

### 1.1 地图系统职责

`map.ts` 是所有空间基础数据的初始化入口。

它主要负责：

- 生成主线地图
- 生成竞技场地图
- 构建墙体数据
- 初始化区域信息
- 初始化关键地标
- 初始化探索图层

### 1.2 主线地图生成 `generateMap()`

主线初始化通常由 `Logic.ts` 的 `resetGameLogic()` 调用 `generateMap()` 完成。

这一步会准备：

- `state.map`
- `state.walls`
- `state.zones`
- `state.landmarks`
- `state.explored`
- 可能的生态鱼群与装饰对象
- 可能的透明阻挡墙 `state.invisibleWalls`

### 1.3 竞技场地图生成 `generateArenaMap()`

竞技场初始化由 `resetArenaLogic()` 调用。

这一步和主线不同，重点是：

- 生成封闭方形地图
- 构建外围厚墙
- 放置随机矩形障碍物
- 让玩家出生在中心
- 默认全图已探索

### 1.4 迷宫地图生成 `generateMazeMap()`

迷宫初始化由 `resetMazeLogic()` 调用。

这一步的特点是：

- 使用**高密度洞穴节点网络 + 多层横纵连接 + 跨层回环 + 深层诱骗死路 + 轻度粗糙化**的洞穴算法，而不是规则网格迷宫
- 地图形状为**接近正方形**（100×100 格），不再是纵向长条；主路蛇形随机游走，每步有约 45% 概率横向移动、55% 概率纵向移动，允许迷宫向任意方向拓展
- 地图 tileSize 为 120px（比主线大），让空间更宽敞不拥挤
- 地图主体由大量小中型洞袋和弯折通道组成，不使用大洞室，保持全程压抑窄路节奏
- 正确路线会被大量分叉、绕回和假捷径掩盖，很多看似深入很远的通道最终会落到死路
- 分支也可向任意方向发展（上下左右），不再只向下延伸
- 回环不是局部点缀，而是贯穿整张图；玩家会频繁遇到重新接回旧区域的洞道
- 生成器不是- 空间节奏要求“时而开阔、时而压抑”：既要有绕行窄路，也要有让玩家短暂舒展的大洞室，但不能重新退化成巨大空海
- 生成器不是"只负责挖洞"，而是必须执行**候选图生成 -> 指标分析 -> 不合格重试 -> 选出最佳结果**的自检流程
- 自检至少要排除这些坏图：全图开阔率过高、主路径过直、岔路不足、死路不足、出现局部大空腔、可达区域比例过低
- 返回独立的迷宫数据对象，**不写入全局 `state.map`**，避免污染主线地图
- 迷宫数据挂在 `state.mazeRescue` 下（`mazeMap`、`mazeWalls`、`mazeExplored`）
- 出口固定在顶部，NPC 位于离出发点大半个地图远的分支末端（用距离判断而非深度判断，不限方向）
- 迷宫模式有独立的移动速度参数 `CONFIG.maze.moveSpeed`，比主线更慢
- 迷宫模式的碰撞检测使用 `checkMazeCollision(x, y, maze)` 而非主线的 `checkCollision()`
- 光照遮挡、绳索找墙和绳索避障在迷宫模式下都会直接读取 `state.mazeRescue` 中的专属地图与墙体数据
### 1.4 地标与区域的技术意义

`map.ts` 里定义的区域与地标不是纯描述数据，它们会直接影响：

- 剧情触发
- 区域进入提示
- NPC 路线目标
- 相机缩放
- 手电损坏点与恐怖事件点

因此，如果改了地图数据但没同步更新地标，很多剧情判断会失效。

### 1.5 改地图时的技术检查清单

如果后续要改地图，至少需要检查：

- `state.landmarks` 中关键坐标是否还合理
- `state.zones` 是否仍覆盖正确区域
- `Logic.ts` 中依赖地标的剧情触发距离是否还成立
- 绳索系统是否还能正常找到墙体
- 敌鱼生成点是否被墙卡住

---

## 二、剧情系统 `src/story/StoryManager.ts`

### 2.1 剧情管理器的定位

`StoryManager.ts` 并不是整个剧情系统的唯一来源，但它是**剧情表现与阶段推进的集中控制器**。

可以把它理解成：

- 负责管理剧情文本显示
- 负责处理剧情阶段更新的一部分规则
- 负责维护演出类状态
- 为 `Logic.ts` 提供剧情层能力

### 2.2 当前协作方式

项目里的剧情不是完全封装在 `StoryManager` 内，而是采用下面这种分工：

- `Logic.ts`：检测“条件是否满足”
- `StoryManager.ts`：执行“剧情文本或演出反馈”

例如：

- 玩家是否进入某区域
- 玩家是否靠近某地标
- 玩家是否满足某阶段条件

这些通常在 `Logic.ts` 中判断；而：

- 显示文本
- 推进剧情小节
- 更新演出计时

则由 `StoryManager` 协助完成。

### 2.3 典型调用方式

主逻辑层会长期持有一个：

```ts
const storyManager = new StoryManager();
```

然后在运行中频繁调用：

- `storyManager.update()`
- `storyManager.showText(...)`

这说明当前项目的剧情系统是“单实例、跨整局复用”的结构。

### 2.4 接手时的判断原则

如果需求是：

- 增加一段剧情文本
- 修改文本持续时间
- 调整某个事件的演出反馈

先看 `StoryManager.ts`。

如果需求是：

- 某个剧情点为什么没触发
- 为什么到了某坐标不进入下一阶段
- 为什么某关上岸没有切到结局

先看 `Logic.ts` 中对应 `stage` 的条件判断。

---

## 三、主逻辑总入口 `src/logic/Logic.ts`

### 3.1 逻辑层已拆分为多个模块

`Logic.ts` 经过拆分后，不再是一个 2000+ 行的巨型文件，而是拆成了以下模块：

- **`Logic.ts`**（约 980 行）：主线逻辑总入口，负责主线重置、主线每帧更新、NPC 更新、区域检测、剧情触发。同时作为逻辑层的统一导出入口，从子模块重新导出所有公共接口。
- **`ManualDrive.ts`**（约 230 行）：手动挡移动处理 `processManualDrive()`，负责逐触点输入消费、各向异性水阻、身体朝向跟随、限速和动作运行态。
- **`Collision.ts`**（约 100 行）：碰撞检测 `checkCollision()`、`getNearestWallDist()`、`checkMazeCollision()`。
- **`ArenaLogic.ts`**（约 250 行）：竞技场初始化 `resetArenaLogic()`、每帧更新 `updateArena()`、玩家移动 `updateArenaPlayer()`、成就反馈。
- **`MazeLogic.ts`**（约 650 行）：迷宫多次下潜闭环的全部逻辑，包括 `resetMazeLogic()`、`startMazeDive()`、`finishMazeDive()`、`returnToShore()`、`replayMazeLogic()`、`updateMaze()`。
- **`Marker.ts`**（约 300 行）：标记系统核心逻辑，包括标记放置/拆除、上下文检测、轮盘扇区生成、轮盘按钮可见性更新、操作执行。

外部调用方（如 `game.ts`、`input.ts`）仍然只从 `Logic.ts` 导入，不需要知道内部拆分细节。

### 3.2 关键导出接口

接手时应优先认识这些导出函数（全部从 `Logic.ts` 统一导出）：

- `resetGameLogic(startStage, startPlay)` — 来自 `Logic.ts` 本体
- `update()` — 来自 `Logic.ts` 本体
- `resetArenaLogic()` — 来自 `ArenaLogic.ts`
- `updateArena()` — 来自 `ArenaLogic.ts`
- `resetMazeLogic()` — 来自 `MazeLogic.ts`
- `startMazeDive(diveType)` — 来自 `MazeLogic.ts`
- `returnToShore()` — 来自 `MazeLogic.ts`
- `replayMazeLogic()` — 来自 `MazeLogic.ts`
- `updateMaze()` — 来自 `MazeLogic.ts`
- `checkCollision(x, y, isPlayer)` — 来自 `Collision.ts`
- `getNearestWallDist(x, y)` — 来自 `Collision.ts`
- `checkMazeCollision(x, y, maze)` — 来自 `Collision.ts`
- `findNearestWall` — 从绳索模块转导出
- `updateMarkers()` — 来自 `Marker.ts`
- `updateWheelButtonVisibility()` — 来自 `Marker.ts`
- `executeWheelAction()` — 来自 `Marker.ts`

### 3.3 主要依赖

`Logic.ts` 本体依赖：`config.ts`、`state.ts`、`map.ts`、`StoryManager.ts`、`Particle.ts`、`Rope.ts`、`FishEnemy.ts`、`ManualDrive.ts`、`Collision.ts`、`Marker.ts`。

子模块各自管理自己的依赖，不再全部集中在一个文件里。
这意味着它不仅是“逻辑文件”，还是当前项目事实上的**玩法编排中心**。

---

## 四、主线重置流程 `resetGameLogic()`

### 4.1 主职责

`resetGameLogic(startStage, startPlay)` 负责把主线运行环境重新初始化到指定章节。

它大致会做这些事：

1. 调用 `resetState()` 清空基础状态
2. 调用 `generateMap()` 建立主线地图
3. 写入 `state.story.stage`
4. 初始化 `state.story.flags`
5. 初始化区域访问记录
6. 初始化 NPC
7. 根据关卡决定 NPC 是否存在
8. 根据关卡设置透明阻挡墙是否移除
9. 初始化相机、防卡墙状态
10. 如需直接开玩，则把 `state.screen` 切到 `play`
11. 显示当前章节开场文本

### 4.2 `startStage` 的作用

这个参数是整个“从指定章节开始”的基础。

它会直接影响：

- 当前 `stage`
- 哪些 `flags` 初始为真
- NPC 是否启用
- 玩家是否从特殊出生点开始
- 第四关是否默认灯已坏

因此章节选择、调试跳关、本地测试都依赖它。

### 4.3 为什么新增章节时优先改这里

如果以后要新增第五关或插入新章节，第一落点通常是 `resetGameLogic()`，因为这里决定：

- 初始状态长什么样
- 初始文案显示什么
- 该关是否带 NPC
- 是否要特殊出生点
- 哪些旧关状态需要提前继承

---

## 五、主线每帧更新 `update()`

### 5.1 最外层流程

`update()` 可以概括为下面这个顺序：

```text
update()
  -> 处理过场 transition
  -> 处理 ending / 非 play 早退
  -> 记录上一帧关键位置
  -> storyManager.update()
  -> checkZones()
  -> 黑屏时早退
  -> 绳索长按时冻结玩家移动
  -> updateNPC()
  -> updateSplashes()
  -> 更新相机
  -> 防卡墙处理
  -> 处理玩家转向与移动
  -> updateRopeSystem()
  -> 执行章节专属剧情判断
  -> 更新泥沙
  -> 更新氧气 / 氮气
  -> 更新探索地图
  -> 检测浮出 / 氧气耗尽 / 结局
  -> 更新玩家动画与漂浮
  -> 更新生态鱼
  -> updateParticles()
  -> updateAllFishEnemies()
```

### 5.2 早退结构非常重要

`update()` 里有很多早退条件，这一点必须注意：

- 过场动画期间，正常游戏逻辑暂停
- `state.screen !== 'play'` 时，主线更新直接返回
- `state.story.flags.blackScreen` 时，后续逻辑会中断
- 结局页阶段不再执行正常主线逻辑

因此排查“为什么某功能不工作”时，不能只看后半段代码，必须先确认有没有被前面的早退挡住。

### 5.3 玩家移动链路

主线里的玩家运动链路大致是：

```text
input.ts 写 input
  -> update() 读取 input.targetAngle / input.move / input.speedUp
  -> 计算 player.targetAngle 与 angleDiff
  -> 按 CONFIG.turnSpeed 转向
  -> 累加速度
  -> 乘以 waterDrag
  -> checkCollision() 做 X/Y 分轴碰撞
  -> 写回 player.x / y / vx / vy
```

这说明：

- 改手感主要看 `input.ts` + `config.ts` + `Logic.ts` 移动段
- 改碰撞主要看 `checkCollision()` + 地图生成结果

### 5.4 剧情触发与阶段逻辑

当前多个剧情条件都直接写在 `update()` 中，例如：

- 第二关小潘走错路并追上玩家
- 第三关手电损坏
- 第三关上岸放弃救援
- 第三关灰色物体触发固定灭灯
- 鱼眼闪现与放弃按钮出现
- 通过二三洞室连接处后恢复状态
- 满足条件进入第四关
- 第二关上浮进入过渡结局

因此 `update()` 目前实际上承担了：

- 玩家物理更新
- 生存资源更新
- 剧情条件控制器
- 部分演出时序控制器

### 5.5 泥沙与资源系统

在主线里，泥沙、氧气、氮气都和玩家运动耦合：

- 速度快会加重泥沙
- 靠墙过近会产生泥沙
- 移动会增加氧气消耗
- 深度会增加氮气积累
- 快速上浮会带来额外风险

这部分逻辑几乎都集中在 `update()` 中，是典型的“项目原型期集中实现”。

### 5.6 更新顺序不能随便乱改

因为很多逻辑之间有先后依赖关系，例如：

- 先移动，再更新绳索系统，绳索才能使用最新位置
- 先检查阶段条件，再切关或触发文本
- 先更新粒子，再让渲染拿到新状态

如果将来要重构 `update()`，第一原则是**保持原行为顺序**。

---

## 六、竞技场初始化与更新

### 6.1 `resetArenaLogic()`

这个函数负责把运行环境切到竞技场模式。

它大致会做：

- `resetState()`
- `generateArenaMap()`
- 禁用 NPC
- 把 `state.story.stage` 设为 0
- 把 `state.screen` 设为 `fishArena`
- 设置玩家出生点与朝向
- 让氧气恒为 100
- 初始化 `state.fishArena`

### 6.2 `updateArena()` 阶段结构

竞技场更新采用明显的阶段机：

- `prep`：准备阶段
- `fight`：战斗阶段
- `clear`：清图庆祝阶段
- `dead`：死亡结算阶段

这比主线的 `stage + flags` 结构更纯粹，也更局部。

### 6.3 竞技场运行流程

大致可以概括为：

```text
updateArena()
  -> 非 fishArena 直接返回
  -> dead 阶段只计时
  -> 更新存活时间、成就倒计时、连杀计时
  -> prep 阶段等待并生成敌鱼
  -> fight 阶段：
       - 玩家无限氧气
       - 手动衰减屏幕震动
       - 检测被咬死亡
       - 统计鱼存活数与累计击杀
       - updateArenaPlayer()
       - updateAllFishEnemies()
       - updateParticles()
       - updateSplashes()
  -> clear 阶段等待后进入下一轮
```

### 6.4 为什么竞技场独立维护 `updateArenaPlayer()`

竞技场玩家运动与主线玩家运动看起来相似，但它单独维护 `updateArenaPlayer()`，原因是：

- 竞技场不需要主线的氧气、氮气、剧情判断
- 竞技场死亡与胜负逻辑不同
- 攻击冷却和攻击动画在竞技场中必须稳定运行

因此它不是简单复用 `update()` 的局部片段，而是抽出一套更轻的运动逻辑。

---

## 七、NPC 逻辑与区域检测

### 7.1 `updateNPC()`

`updateNPC()` 是 `Logic.ts` 内部的重要子过程，直接根据 `state.npc.state` 分发行为。

不同状态会改变：

- 跟随目标
- 速度
- 路线点选择
- 是否忽略碰撞
- 朝向更新方式
- 是否随机漂动

### 7.2 当前 NPC 状态分流特点

当前实现是**单函数内 if/else 分支**，而不是独立状态类。

优点：

- 容易快速改
- 容易直接插入剧情条件

缺点：

- 状态一多会变重
- 不同阶段 NPC 行为容易相互耦合

如果后续 NPC 行为继续增加，这里会是优先重构候选点。

### 7.3 `checkZones()` 与 `handleZoneEnter()`

主线更新中会每帧做区域检测：

- 玩家是否进入某个 `zone`
- 若切换区域，则调用 `handleZoneEnter()`

这里当前主要承担：

- 记录访问过的区域
- 避免重复触发同一区域进入提示
- 在部分区域弹出文本

如果未来要做“进入区域触发对话、音效、新事件”，这里是优先落点之一。

---

## 八、碰撞与空间查询

### 8.1 `checkCollision()`

这是主线与竞技场都会使用的基础函数。

它会综合检查：

- 周围地图格是否是墙
- 墙体是否是圆形边缘对象
- 实体格是否是 `2`
- 玩家是否撞到透明阻挡墙

当前它支持 `isPlayer` 参数，是因为透明墙只对玩家生效，不一定对其他实体生效。

### 8.2 `checkMazeCollision()`

迷宫模式使用独立的碰撞检测函数，读取 `maze.mazeMap` 而非 `state.map`。

关键设计：迷宫每个边缘格子除了基础 wall 对象外，还会额外生成 1-2 个装饰圆（用于打破网格感）。这些额外圆：

- 存在于 `mazeWalls` 数组中（供渲染和光照遍历）
- 同时挂在基础 wall 对象的 `extras` 数组上（供碰撞检测遍历）
- **不**独立存在于 `mazeMap` 中

`checkMazeCollision()` 在检测到 wall 对象时，会同时遍历 `cell.extras` 中的额外圆，确保碰撞与渲染完全一致。

### 8.3 `getNearestWallDist()`

这个辅助函数主要用于：

- 判断玩家离墙有多近
- 给泥沙生成逻辑提供依据
- 为某些靠墙行为提供空间判断

### 8.4 技术注意点

碰撞系统与地图系统是耦合的：

- 地图单元数据结构一变，碰撞就要跟着改
- 透明墙是额外层，不在 `state.map` 主数据里
- 圆形边缘墙体与内部实体墙体的判定方式不同
- 迷宫额外装饰圆通过 `wall.extras` 参与碰撞，不能只遍历 `mazeMap` 格子

因此如果出现"渲染上看着是墙，但可以穿过去"或"明明没墙却撞住"，要同时检查地图生成和碰撞函数。
---

## 九、本卷最重要的结论

- **`src/world/map.ts` 负责初始化空间基础数据，地图一变要连带检查地标与剧情触发。**
- **`src/story/StoryManager.ts` 偏剧情表现与演出，`src/logic/Logic.ts` 偏条件检测与运行时调度。**
- **`update()` 是主线最重的总更新函数，很多行为依赖它的早退和执行顺序。**
- **`updateArena()` 是更局部、更纯玩法的阶段机逻辑。**