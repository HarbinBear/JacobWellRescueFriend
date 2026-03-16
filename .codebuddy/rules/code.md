---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---

# 雅各布井救援 —— 详细技术文档

## 一、文档目的

这份文档面向**后续接手项目代码的模型与开发者**。

它不再重复 `design.md` 中的设计目标、剧情主题和玩法意图，而是重点回答下面这些问题：

- 项目代码是**怎么分层组织**的。
- 游戏是从哪里启动的，**每一帧怎么流转**。
- 全局状态树中有哪些关键字段，**哪些模块会读写它们**。
- 主线模式、竞技场模式、菜单模式分别由哪些文件驱动。
- 当要修改剧情、地图、UI、输入、敌人、绳索、渲染时，**应该优先去哪个文件改**。
- 哪些模块是“总入口”，哪些模块是“专项子系统”，哪些逻辑是通过共享状态耦合起来的。

如果 `design.md` 解决的是“这个项目想做成什么样”，那么这份 `code.md` 解决的是：

**这个项目现在是怎么跑起来的。**

---

## 二、先给接手模型的最短结论

如果只允许先记住少量事实，应先记住下面几点：

1. **入口文件是 `game.ts`**，它负责初始化纹理、输入、逻辑，然后用 `requestAnimationFrame` 挂起主循环。
2. **全局共享状态在 `src/core/state.ts`**，项目大多数系统都通过读写这里的状态协作。
3. **主线更新入口在 `src/logic/Logic.ts` 的 `update()`**，竞技场更新入口也在同文件的 `updateArena()`。
4. **渲染总入口在 `src/render/Render.ts` 的 `draw()`**，它根据 `state.screen` 决定当前画哪一套界面。
5. **剧情推进主控在 `src/story/StoryManager.ts`**，但很多剧情触发条件写在 `Logic.ts` 中，属于“逻辑层检测 + 剧情层表现”的协作结构。
6. **地图初始化在 `src/world/map.ts`**，配置常量在 `src/core/config.ts`，输入接入在 `src/core/input.ts`。
7. **这是一个强状态驱动项目**：很多行为不是靠复杂事件总线，而是靠 `state.story.stage`、`state.story.flags`、`state.screen`、`state.npc.state` 等字段共同驱动。

---

## 三、源码目录结构与职责分层

当前源码核心目录是 `src/`，大致分成五层：

```text
src/
  core/     核心状态、配置、输入
  logic/    主更新循环与专项玩法逻辑
  render/   总渲染入口与各专项绘制模块
  story/    剧情管理与文本演出
  world/    地图生成、地标、区域、竞技场地图
```

顶层还有一个真正的运行入口：

```text
game.ts
```

可以把职责简单理解成：

- `game.ts`：把整个游戏“拉起来”
- `core/`：提供全局运行时基础设施
- `logic/`：真正改变状态，推进一帧游戏
- `render/`：把当前状态画出来
- `story/`：负责剧情文本和阶段性演出控制
- `world/`：负责地图与空间数据初始化

---

## 四、启动流程

## 4.1 入口文件 `game.ts`

`game.ts` 是整个项目最外层的启动脚本，职责非常集中：

- 初始化纹理资源
- 注册输入系统
- 初始化游戏逻辑
- 建立主循环

从职责上看，它不负责写玩法细节，而只做“系统装配”。

### 4.2 启动顺序

当前启动顺序可以概括为：

```text
game.ts
  -> initTextures()
  -> initInput()
  -> resetGameLogic(1, false)
  -> gameLoop()
       -> update()
       -> updateArena()
       -> draw()
       -> requestAnimationFrame(gameLoop)
```

这里有几个关键点：

- `resetGameLogic(1, false)` 说明项目启动时会先初始化主线状态，但**不一定立刻进入可玩态**。
- 主循环里**主线更新与竞技场更新会同时被调用**，但各自内部会根据 `state.screen` 判断自己是否实际生效。
- `draw()` 是统一渲染出口，不会分成两个完全独立的渲染循环。

### 4.3 运行时外层状态机

最外层流程由 `state.screen` 控制，常见值包括：

- `menu`
- `play`
- `fishArena`
- `ending`
- `lose`

因此入口层并不切换“不同应用”，而是运行同一个循环，再由状态决定当前逻辑和渲染路径。

---

## 五、全局状态树 `src/core/state.ts`

## 5.1 状态树是整个项目的中枢

`src/core/state.ts` 是本项目最关键的基础文件之一。

项目的主要特点是：

- 逻辑层直接读写全局状态
- 渲染层直接读取全局状态
- 输入层直接写入输入状态或触发状态变化
- 剧情层会修改剧情状态、文本状态、演出状态

也就是说，这不是一个强消息总线架构，而是一个**集中式共享状态架构**。

### 5.2 核心导出对象

从职责上看，这个文件至少提供以下几类核心导出：

- `state`：全局游戏状态
- `player`：玩家状态快捷引用
- `input`：输入状态快捷引用
- `particles`：粒子列表或粒子状态引用
- `resetState()`：重置全局运行状态

实际协作方式通常是：

- 逻辑层改 `state` / `player`
- 渲染层读 `state` / `player`
- 输入层写 `input`

### 5.3 建议优先理解的状态分区

接手时应优先梳理下面这些状态域。

#### 5.3.1 屏幕与菜单状态

常见字段作用：

- `state.screen`：当前外层运行模式
- `state.menuScreen`：菜单内部子页面
- `state.transition`：过场切换泡泡动画与回调
- `state.endingTimer`：结局页计时

这些字段控制“当前在看什么、当前哪一套逻辑应执行”。

#### 5.3.2 玩家状态

玩家状态通常包括：

- 位置：`x`、`y`
- 速度：`vx`、`vy`
- 朝向：`angle`、`targetAngle`
- 资源：`o2`、`n2`
- 动画：`animTime`
- 环境影响：`silt`

主线与竞技场都会复用这套玩家状态，只是消耗规则不同。

#### 5.3.3 剧情状态

这是项目里第二重要的状态域，至少应重点关注：

- `state.story.stage`
- `state.story.timer`
- `state.story.flags`
- `state.story.shake`
- `state.story.redOverlay`
- `state.story.visitedZones`

其中最重要的是：

- `stage`：主线章节主轴
- `flags`：细粒度事件记录

很多剧情逻辑判断都写成：

- 当前 `stage` 是否等于某关
- 某个 `flag` 是否已经触发
- 玩家是否到达某个地标附近

#### 5.3.4 NPC 状态

NPC 状态用于控制同伴/目标角色的位置与行为模式，关键字段通常包括：

- `state.npc.active`
- `state.npc.x` / `y`
- `state.npc.vx` / `vy`
- `state.npc.angle`
- `state.npc.state`

当前 `npc.state` 至少承担以下行为分流：

- `follow`
- `wait`
- `enter_tunnel`
- `rescue`
- `to_dead_end`
- `catch_up`

这类字段直接被 `Logic.ts` 的 `updateNPC()` 消费。

#### 5.3.5 地图与空间状态

这部分状态通常包括：

- `state.map`
- `state.walls`
- `state.explored`
- `state.zones`
- `state.landmarks`
- `state.currentZone`
- `state.invisibleWalls`

它们被下面几层共同使用：

- 地图初始化层写入
- 碰撞层读取
- 渲染层读取
- 剧情触发层读取
- 绳索系统读取

#### 5.3.6 绳索状态

绳索系统是一个独立子系统，但状态仍挂在全局树上。通常需要关注：

- 当前是否已有铺设中的绳索
- 长按是否激活
- UI 提示是否出现
- 已完成绳索集合

`Logic.ts` 会在主线更新中调用绳索更新，渲染层会读取这些状态来画绳子和按钮进度。

#### 5.3.7 凶猛鱼与攻击状态

相关状态大致包括：

- `state.fishEnemies`
- `state.fishBite`
- `state.playerAttack`

这几组状态分别表示：

- 当前敌鱼实例列表
- 被咬/吞食死亡过场状态
- 玩家挥击攻击状态

竞技场模式和主线模式都会使用其中一部分。

#### 5.3.8 竞技场状态

竞技场专属状态通常挂在 `state.fishArena` 下，包含：

- 当前轮次
- 本轮总鱼数
- 存活鱼数
- 总击杀数
- 阶段：准备 / 战斗 / 清图 / 死亡结算
- 成就提示文本与计时
- 连杀计时
- 存活时间

### 5.4 状态重置的重要性

因为项目高度依赖共享状态，所以**重置逻辑是否完整**非常关键。

如果新增了字段，但没有在 `resetState()`、`resetGameLogic()` 或 `resetArenaLogic()` 中初始化，就很容易出现：

- 从主线切回菜单后残留旧状态
- 从竞技场回主线后沿用错误参数
- 新关卡开始时带着上一关的剧情标记

后续每次新增重要状态字段，都应该先检查：

- 是否需要在 `resetState()` 清理
- 是否需要在主线开局设置默认值
- 是否需要在竞技场开局设置默认值

---

## 六、配置系统 `src/core/config.ts`

## 6.1 `CONFIG` 是统一调参入口

`src/core/config.ts` 导出单个 `CONFIG` 常量对象，承担全局参数中心的角色。

它的优点是：

- 所有数值调参集中在一处
- 逻辑与渲染都能读取同一参数来源
- 新会话接手时很容易找到全局平衡入口

### 6.2 当前配置大类

从当前实现看，`CONFIG` 至少包含下面几类配置：

- 画布尺寸与屏幕适配
- 调试开关
- 模式开关（例如 `fishArenaMode`）
- 基础移动参数
- 地图参数
- 氧气与氮气参数
- 光照参数
- 泥沙参数
- 绳索系统参数
- 第三关剧情关键点配置
- 竞技场参数
- 凶猛鱼参数
- 玩家攻击参数

### 6.3 配置读取特点

这个文件不只是逻辑层读取，渲染层也会读取大量参数，例如：

- 屏幕尺寸
- 光照半径
- 颜色配置
- 按钮位置比例
- 绳索绘制宽度

因此修改 `CONFIG` 时要知道，它可能同时影响：

- 手感
- 视觉效果
- UI 布局
- 剧情事件触发距离

### 6.4 常见调参入口

如果用户提出的是纯数值改动，优先检查 `config.ts`：

- 玩家移动太慢 / 太快
- 氧气消耗节奏不对
- 手电范围不舒服
- 绳索长按太慢
- 放弃按钮出现太晚
- 凶猛鱼扑击太强
- 竞技场每轮生成数量不合适

如果这里只改一个配置值就能解决，不要优先去改逻辑代码。

---

## 七、输入系统 `src/core/input.ts`

## 7.1 输入层的职责边界

`input.ts` 负责把设备输入转换成项目内部可消费的状态或动作。

它的职责不是推进剧情，也不是推进主逻辑，而是：

- 采集触摸 / 可能的键盘输入
- 更新 `input` 状态
- 判断按钮区域点击
- 触发攻击、菜单交互、长按等行为入口

### 7.2 输入状态与逻辑层的关系

项目常见的处理模式是：

- 输入层写：`input.move`、`input.targetAngle`、`input.speedUp`
- 逻辑层读：这些字段并把它们转成玩家速度与朝向变化

因此输入层与逻辑层的边界比较清晰：

- 输入层：**用户想做什么**
- 逻辑层：**这个意图在当前状态下如何生效**

### 7.3 需要重点留意的输入路径

接手时应重点关注这些输入分支：

- 摇杆/移动方向输入
- 冲刺或加速输入
- 攻击按钮输入
- 菜单按钮输入
- 章节选择输入
- 绳索长按按钮输入
- 放弃救援长按输入

### 7.4 长按类交互的技术特点

项目中长按不是统一交给浏览器/平台组件，而是自己管理进度与状态，这意味着：

- 一部分长按会通过 `input.ts` 识别按下/抬起
- 一部分完成判定会在 `Logic.ts` 或绳索系统里按时间戳或计时器完成

后续新增长按交互时，建议复用现有模式：

- 输入层识别手指状态
- 状态层记录开始时间
- 逻辑层在更新循环中判定是否完成
- UI 层根据同一状态画进度

---

## 八、地图系统 `src/world/map.ts`

## 8.1 地图系统职责

`map.ts` 是所有空间基础数据的初始化入口。

它主要负责：

- 生成主线地图
- 生成竞技场地图
- 构建墙体数据
- 初始化区域信息
- 初始化关键地标
- 初始化探索图层

### 8.2 主线地图生成 `generateMap()`

主线初始化通常由 `Logic.ts` 的 `resetGameLogic()` 调用 `generateMap()` 完成。

这一步会准备：

- `state.map`
- `state.walls`
- `state.zones`
- `state.landmarks`
- `state.explored`
- 可能的生态鱼群与装饰对象
- 可能的透明阻挡墙 `state.invisibleWalls`

### 8.3 竞技场地图生成 `generateArenaMap()`

竞技场初始化由 `resetArenaLogic()` 调用。

这一步和主线不同，重点是：

- 生成封闭方形地图
- 构建外围厚墙
- 放置随机矩形障碍物
- 让玩家出生在中心
- 默认全图已探索

### 8.4 地标与区域的技术意义

`map.ts` 里定义的区域与地标不是纯描述数据，它们会直接影响：

- 剧情触发
- 区域进入提示
- NPC 路线目标
- 相机缩放
- 手电损坏点与恐怖事件点

因此，如果改了地图数据但没同步更新地标，很多剧情判断会失效。

### 8.5 改地图时的技术检查清单

如果后续要改地图，至少需要检查：

- `state.landmarks` 中关键坐标是否还合理
- `state.zones` 是否仍覆盖正确区域
- `Logic.ts` 中依赖地标的剧情触发距离是否还成立
- 绳索系统是否还能正常找到墙体
- 敌鱼生成点是否被墙卡住

---

## 九、剧情系统 `src/story/StoryManager.ts`

## 9.1 剧情管理器的定位

`StoryManager.ts` 并不是整个剧情系统的唯一来源，但它是**剧情表现与阶段推进的集中控制器**。

可以把它理解成：

- 负责管理剧情文本显示
- 负责处理剧情阶段更新的一部分规则
- 负责维护演出类状态
- 为 `Logic.ts` 提供剧情层能力

### 9.2 当前协作方式

项目里的剧情不是完全封装在 `StoryManager` 内，而是采用下面这种分工：

- `Logic.ts`：检测“条件是否满足”
- `StoryManager`：执行“剧情文本或演出反馈”

例如：

- 玩家是否进入某区域
- 玩家是否靠近某地标
- 玩家是否满足某阶段条件

这些通常在 `Logic.ts` 中判断；而：

- 显示文本
- 推进剧情小节
- 更新演出计时

则由 `StoryManager` 协助完成。

### 9.3 典型调用方式

主逻辑层会长期持有一个：

```ts
const storyManager = new StoryManager();
```

然后在运行中频繁调用：

- `storyManager.update()`
- `storyManager.showText(...)`

这说明当前项目的剧情系统是“单实例、跨整局复用”的结构。

### 9.4 接手时的判断原则

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

## 十、主逻辑总入口 `src/logic/Logic.ts`

## 10.1 这是项目最重要的运行时文件

`Logic.ts` 是主线与竞技场更新逻辑的核心总入口，也是当前项目里**最重、最关键、最容易产生耦合**的文件。

它负责：

- 游戏开始与重置
- 主线每帧更新
- 竞技场每帧更新
- NPC 更新
- 碰撞检测
- 氧气/氮气系统
- 区域进入检测
- 相机缩放
- 过场切换
- 各章节关键剧情触发
- 与粒子、绳索、敌鱼、地图等系统协作

### 10.2 关键导出接口

接手时应优先认识这些导出函数：

- `resetGameLogic(startStage, startPlay)`
- `update()`
- `resetArenaLogic()`
- `updateArena()`
- `checkCollision(x, y, isPlayer)`
- `getNearestWallDist(x, y)`
- `findNearestWall`（从绳索模块转导出）

这几个函数构成了逻辑层的主公共接口。

### 10.3 主要依赖

`Logic.ts` 顶部集中依赖了多个专项模块：

- `config.ts`
- `state.ts`
- `map.ts`
- `StoryManager.ts`
- `Particle.ts`
- `Rope.ts`
- `FishEnemy.ts`

这意味着它不仅是“逻辑文件”，还是当前项目事实上的**玩法编排中心**。

---

## 十一、主线重置流程 `resetGameLogic()`

## 11.1 主职责

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

### 11.2 `startStage` 的作用

这个参数是整个“从指定章节开始”的基础。

它会直接影响：

- 当前 `stage`
- 哪些 `flags` 初始为真
- NPC 是否启用
- 玩家是否从特殊出生点开始
- 第四关是否默认灯已坏

因此章节选择、调试跳关、本地测试都依赖它。

### 11.3 为什么新增章节时优先改这里

如果以后要新增第五关或插入新章节，第一落点通常是 `resetGameLogic()`，因为这里决定：

- 初始状态长什么样
- 初始文案显示什么
- 该关是否带 NPC
- 是否要特殊出生点
- 哪些旧关状态需要提前继承

---

## 十二、主线每帧更新 `update()`

## 12.1 最外层流程

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

### 12.2 早退结构非常重要

`update()` 里有很多早退条件，这一点必须注意：

- 过场动画期间，正常游戏逻辑暂停
- `state.screen !== 'play'` 时，主线更新直接返回
- `state.story.flags.blackScreen` 时，后续逻辑会中断
- 结局页阶段不再执行正常主线逻辑

因此排查“为什么某功能不工作”时，不能只看后半段代码，必须先确认有没有被前面的早退挡住。

### 12.3 玩家移动链路

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

### 12.4 剧情触发与阶段逻辑

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

### 12.5 泥沙与资源系统

在主线里，泥沙、氧气、氮气都和玩家运动耦合：

- 速度快会加重泥沙
- 靠墙过近会产生泥沙
- 移动会增加氧气消耗
- 深度会增加氮气积累
- 快速上浮会带来额外风险

这部分逻辑几乎都集中在 `update()` 中，是典型的“项目原型期集中实现”。

### 12.6 更新顺序不能随便乱改

因为很多逻辑之间有先后依赖关系，例如：

- 先移动，再更新绳索系统，绳索才能使用最新位置
- 先检查阶段条件，再切关或触发文本
- 先更新粒子，再让渲染拿到新状态

如果将来要重构 `update()`，第一原则是**保持原行为顺序**。

---

## 十三、竞技场初始化与更新

## 13.1 `resetArenaLogic()`

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

### 13.2 `updateArena()` 阶段结构

竞技场更新采用明显的阶段机：

- `prep`：准备阶段
- `fight`：战斗阶段
- `clear`：清图庆祝阶段
- `dead`：死亡结算阶段

这比主线的 `stage + flags` 结构更纯粹，也更局部。

### 13.3 竞技场运行流程

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

### 13.4 为什么竞技场独立维护 `updateArenaPlayer()`

竞技场玩家运动与主线玩家运动看起来相似，但它单独维护 `updateArenaPlayer()`，原因是：

- 竞技场不需要主线的氧气/氮气/剧情判断
- 竞技场死亡与胜负逻辑不同
- 攻击冷却和攻击动画在竞技场中必须稳定运行

因此它不是简单复用 `update()` 的局部片段，而是抽出一套更轻的运动逻辑。

---

## 十四、NPC 逻辑与区域检测

## 14.1 `updateNPC()`

`updateNPC()` 是 `Logic.ts` 内部的重要子过程，直接根据 `state.npc.state` 分发行为。

不同状态会改变：

- 跟随目标
- 速度
- 路线点选择
- 是否忽略碰撞
- 朝向更新方式
- 是否随机漂动

### 14.2 当前 NPC 状态分流特点

当前实现是**单函数内 if/else 分支**，而不是独立状态类。

优点：

- 容易快速改
- 容易直接插入剧情条件

缺点：

- 状态一多会变重
- 不同阶段 NPC 行为容易相互耦合

如果后续 NPC 行为继续增加，这里会是优先重构候选点。

### 14.3 `checkZones()` 与 `handleZoneEnter()`

主线更新中会每帧做区域检测：

- 玩家是否进入某个 `zone`
- 若切换区域，则调用 `handleZoneEnter()`

这里当前主要承担：

- 记录访问过的区域
- 避免重复触发同一区域进入提示
- 在部分区域弹出文本

如果未来要做“进入区域触发对话 / 音效 / 新事件”，这里是优先落点之一。

---

## 十五、碰撞与空间查询

## 15.1 `checkCollision()`

这是主线与竞技场都会使用的基础函数。

它会综合检查：

- 周围地图格是否是墙
- 墙体是否是圆形边缘对象
- 实体格是否是 `2`
- 玩家是否撞到透明阻挡墙

当前它支持 `isPlayer` 参数，是因为透明墙只对玩家生效，不一定对其他实体生效。

### 15.2 `getNearestWallDist()`

这个辅助函数主要用于：

- 判断玩家离墙有多近
- 给泥沙生成逻辑提供依据
- 为某些靠墙行为提供空间判断

### 15.3 技术注意点

碰撞系统与地图系统是耦合的：

- 地图单元数据结构一变，碰撞就要跟着改
- 透明墙是额外层，不在 `state.map` 主数据里
- 圆形边缘墙体与内部实体墙体的判定方式不同

因此如果出现“渲染上看着是墙，但可以穿过去”或“明明没墙却撞住”，要同时检查地图生成和碰撞函数。

---

## 十六、专项子系统：粒子、绳索、敌鱼

## 16.1 粒子系统 `src/logic/Particle.ts`

从 `Logic.ts` 的调用可见，粒子系统至少提供：

- `createSplash()`
- `updateSplashes()`
- `triggerSilt()`
- `updateParticles()`

它主要负责：

- 入水/出水水花
- 扬尘泥沙
- 血迹等局部粒子效果

主逻辑层会在合适时机调用它，而不是让粒子系统自己决定剧情时机。

### 16.2 绳索系统 `src/logic/Rope.ts`

绳索系统至少对外提供：

- `updateRopeSystem()`
- `findNearestWall()`

它的职责包括：

- 判断玩家是否靠近可锚定墙体
- 管理长按开始/结束状态
- 生成或更新绳索路径
- 维护绳索收紧过程
- 为渲染层提供可读绳索数据

`Logic.ts` 中会每帧调用 `updateRopeSystem()`，渲染层会读取绳索状态把它画出来。

### 16.3 敌鱼系统 `src/logic/FishEnemy.ts`

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

### 16.4 三个专项系统的协作特点

这三个系统都不是“完全自治模块”，而是：

- 由 `Logic.ts` 驱动更新时机
- 通过 `state` 与其他层交换数据
- 由渲染层读取状态完成表现

这就是当前项目的典型模式：

**专项逻辑模块负责算法和局部规则，总入口文件负责调度。**

---

## 十七、渲染总入口 `src/render/Render.ts`

## 17.1 `draw()` 是统一渲染出口

无论当前在菜单、主线、竞技场还是结局页，都会走到 `Render.ts` 的总入口。

它的核心职责是：

- 清屏或准备画布
- 根据 `state.screen` 分发到不同渲染路径
- 组合多个专项渲染模块

### 17.2 渲染分发思路

当前渲染层不是“一文件画完整个游戏”，而是：

- 总入口根据模式分发
- 子模块按对象/功能绘制

这和逻辑层的结构类似：

- 总文件负责调度
- 专项模块负责具体表现

### 17.3 常见渲染模块职责

从目录命名可以推断当前渲染子模块大致包括：

- `Canvas.ts`：画布与上下文基础能力
- `Render.ts`：总绘制入口
- `RenderUI.ts`：UI、菜单、HUD、按钮、提示文案
- `RenderLight.ts`：光照与遮罩
- `RenderRope.ts`：绳索绘制
- `RenderFishEnemy.ts`：敌鱼绘制
- `RenderDiver.ts`：潜水员与角色绘制

### 17.4 修改渲染时的优先落点

如果需求是：

- HUD 布局、菜单按钮、结算文本、操作提示
  - 先看 `RenderUI.ts`
- 手电光照、黑暗遮罩、光束样式
  - 先看 `RenderLight.ts`
- 绳子外观、绳结、钉子、收紧表现
  - 先看 `RenderRope.ts`
- 敌鱼造型、状态动画、死亡表现
  - 先看 `RenderFishEnemy.ts`
- 玩家/NPC 潜水员绘制
  - 先看 `RenderDiver.ts`

如果不确定从哪改，先从 `Render.ts` 找到它调用了哪个子模块。

---

## 十八、逻辑层与渲染层的数据流

## 18.1 单帧数据流总览

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

### 18.2 这是“状态驱动渲染”，不是“命令式渲染”

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

## 十九、常见需求应该改哪里

## 19.1 改章节推进

优先检查：

- `src/logic/Logic.ts`
- `src/story/StoryManager.ts`
- `src/core/state.ts`

常见动作：

- 新增 `stage`
- 新增 `flags`
- 在 `update()` 中插入触发条件
- 在 `resetGameLogic()` 中设置该关初始状态

### 19.2 改数值与手感

优先检查：

- `src/core/config.ts`
- `src/core/input.ts`
- `src/logic/Logic.ts`

### 19.3 改地图、出生点、地标

优先检查：

- `src/world/map.ts`
- `src/core/config.ts`
- `src/logic/Logic.ts`

### 19.4 改 UI、菜单、按钮位置

优先检查：

- `src/render/RenderUI.ts`
- `src/core/config.ts`
- `src/core/input.ts`

### 19.5 改绳索行为

优先检查：

- `src/logic/Rope.ts`
- `src/render/RenderRope.ts`
- `src/core/config.ts`

### 19.6 改凶猛鱼行为或攻击判定

优先检查：

- `src/logic/FishEnemy.ts`
- `src/render/RenderFishEnemy.ts`
- `src/core/config.ts`
- `src/logic/Logic.ts`

### 19.7 改竞技场流程

优先检查：

- `src/logic/Logic.ts` 中的 `resetArenaLogic()` / `updateArena()`
- `src/core/config.ts` 中的 `fishArena`
- `src/render/RenderUI.ts`

---

## 二十、扩展代码时最容易踩的坑

## 20.1 只加状态，不做重置

这是最常见问题之一。

新增字段后要检查：

- `resetState()`
- `resetGameLogic()`
- `resetArenaLogic()`

是否都应该处理。

### 20.2 只改地图，不改剧情地标

很多剧情触发依赖硬坐标或关键地标。

如果地图改了，但：

- `chamber12Junction`
- `chamber23Junction`
- `tunnelEntry`
- `tunnelEnd`
- `grayThingX` / `grayThingY`

没有同步调整，剧情很容易失效。

### 20.3 只改渲染，不改逻辑状态

比如某按钮“想显示却没显示”，未必是 UI 文件出问题，也可能是逻辑层根本没有把显示状态设为真。

### 20.4 忽略 `state.screen` 导致逻辑串模式

新增逻辑时一定要确认它应该运行在：

- 主线
- 竞技场
- 菜单
- 结局页

不要让主线逻辑在竞技场里偷偷执行，或者竞技场逻辑污染主线状态。

### 20.5 在 `update()` 里插入逻辑但没考虑早退

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

## 二十一、给后续模型的阅读顺序建议

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

## 二十二、最重要的代码层认知摘要

可以把项目代码层浓缩成一句话：

**这是一个以 `game.ts` 为入口、以 `state.ts` 为共享状态中枢、以 `Logic.ts` 为运行时调度中心、以 `Render.ts` 为统一绘制出口，并通过 `config / input / map / story / rope / fish / ui` 等模块共同组成的状态驱动型微信小游戏代码结构。**

如果再拆成五点：

- **入口中心**：`game.ts`
- **状态中心**：`src/core/state.ts`
- **逻辑中心**：`src/logic/Logic.ts`
- **渲染中心**：`src/render/Render.ts`
- **调参中心**：`src/core/config.ts`

后续无论是补剧情、加关卡、调敌人、改 UI，基本都可以先从这五个中心反推到正确落点。
