---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
# 技术文档分卷 02：状态树、配置与输入系统

## 本卷用途

本卷主要回答下面这些问题：

- 全局状态树里有哪些关键分区
- 哪些模块会读写这些状态
- 为什么重置逻辑这么重要
- 配置参数应该去哪里调
- 输入是如何接入逻辑系统的

如果任务与状态字段、配置项、输入接入、长按交互有关，应优先阅读本卷。

---

## 一、全局状态树 `src/core/state.ts`

### 1.1 状态树是整个项目的中枢

`src/core/state.ts` 是本项目最关键的基础文件之一。

项目的主要特点是：

- 逻辑层直接读写全局状态
- 渲染层直接读取全局状态
- 输入层直接写入输入状态或触发状态变化
- 剧情层会修改剧情状态、文本状态、演出状态

也就是说，这不是一个强消息总线架构，而是一个**集中式共享状态架构**。

### 1.2 核心导出对象

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

### 1.3 建议优先理解的状态分区

接手时应优先梳理下面这些状态域。

#### 1.3.1 屏幕与菜单状态

常见字段作用：

- `state.screen`：当前外层运行模式
- `state.menuScreen`：菜单内部子页面
- `state.transition`：过场切换泡泡动画与回调
- `state.endingTimer`：结局页计时

这些字段控制“当前在看什么、当前哪一套逻辑应执行”。

#### 1.3.2 玩家状态

玩家状态通常包括：

- 位置：`x`、`y`
- 速度：`vx`、`vy`
- 朝向：`angle`、`targetAngle`
- 资源：`o2`
- 动画：`animTime`
- 环境影响：`silt`

主线与竞技场都会复用这套玩家状态，只是消耗规则不同。

#### 1.3.3 剧情状态

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

#### 1.3.4 NPC 状态

NPC 状态用于控制同伴或目标角色的位置与行为模式，关键字段通常包括：

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

#### 1.3.5 地图与空间状态

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

#### 1.3.6 绳索状态

绳索系统是一个独立子系统，但状态仍挂在全局树上。通常需要关注：

- 当前是否已有铺设中的绳索
- 长按是否激活
- UI 提示是否出现
- 已完成绳索集合

`Logic.ts` 会在主线更新中调用绳索更新，渲染层会读取这些状态来画绳子和按钮进度。

#### 1.3.6b 标记与轮盘状态

标记系统（P5）新增了两组状态：

- `state.markers`：标记列表（`Marker[]`），每个标记包含类型（danger/unknown/safe）、附着方式（wall/rope）、位置信息和动画状态
- `state.wheel`：轮盘交互状态，包含按钮可见性、轮盘开关、扇区列表、高亮索引、展开动画进度、触点 ID、附近可交互对象信息

标记数据在迷宫模式下跨下潜持久化（`startMazeDive()` 保留 `state.markers`），但轮盘状态每次下潜重置。

`resetState()` 会清空标记列表和轮盘状态。

#### 1.3.7 凶猛鱼与攻击状态

相关状态大致包括：

- `state.fishEnemies`
- `state.fishBite`
- `state.playerAttack`

这几组状态分别表示：

- 当前敌鱼实例列表
- 被咬或吞食死亡过场状态
- 玩家挥击攻击状态

竞技场模式和主线模式都会使用其中一部分。

#### 1.3.8 竞技场状态

竞技场专属状态通常挂在 `state.fishArena` 下，包含：

- 当前轮次
- 本轮总鱼数
- 存活鱼数
- 总击杀数
- 阶段：准备 / 战斗 / 清图 / 死亡结算
- 成就提示文本与计时
- 连杀计时
- 存活时间

### 1.4 状态重置的重要性

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

## 二、配置系统 `src/core/config.ts`

### 2.1 `CONFIG` 是统一调参入口

`src/core/config.ts` 导出单个 `CONFIG` 常量对象，承担全局参数中心的角色。

它的优点是：

- 所有数值调参集中在一处
- 逻辑与渲染都能读取同一参数来源
- 新会话接手时很容易找到全局平衡入口

### 2.2 当前配置大类

从当前实现看，`CONFIG` 至少包含下面几类配置：

- 画布尺寸与屏幕适配
- 调试开关（含 `infiniteO2` 无限氧气开关）
- 基础移动参数
- 地图参数
- 氧气参数
- 光照参数
- 泥沙参数
- 绳索系统参数
- 标记系统参数（`marker` 子对象，含按钮、轮盘、标记尺寸、颜色、动画等 30+ 参数）
- 第三关剧情关键点配置
- 竞技场参数
- 凶猛鱼参数
- 迷宫纯享版模式参数
- 手电筒光照参数（`flashlight` 子对象）
- 后处理参数（`postProcess` 子对象，含曝光与 Tone Mapping）
- 玩家攻击参数

### 2.3 配置读取特点

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

### 2.4 常见调参入口

如果用户提出的是纯数值改动，优先检查 `config.ts`：

- 玩家移动太慢或太快
- 氧气消耗节奏不对
- 手电范围不舒服
- 绳索长按太慢
- 放弃按钮出现太晚
- 凶猛鱼扑击太强
- 竞技场每轮生成数量不合适

如果这里只改一个配置值就能解决，不要优先去改逻辑代码。

### 2.5 GM 运行时调参面板

项目提供了一个 GM 工具面板（`src/gm/`），可以在运行时直接读写 `CONFIG` 对象中的参数。面板拆分为三个文件：`GMConfig.ts`（类型与参数配置）、`GMPanel.ts`（状态与交互）、`GMRender.ts`（绘制）。

面板入口是屏幕顶部中央的 GM 小圆圈按钮，点击打开后面板具备以下交互特性：

- **可拖动**：面板顶部有一个 22px 高的拖动条（带三条横线手柄），按住拖动条可移动整个面板位置，面板不会超出屏幕边界
- **Tab 可滑动**：每个 Tab 固定宽度 60px，Tab 数量较多时可左右滑动，底部有橙色滑动指示条

当前包含 11 个 Tab 页签：

- **手电筒**：`flashlight.flatRatio`、`flashlight.edgeFadeRatio`、`flashlight.maskPow`、`flashlight.maskMinAlpha`、`flashlight.volOuterIntensity`、`flashlight.volCenterIntensity`、`flashlight.vplBounceBase`、`flashlight.vplRadius`、`flashlight.vplMaskStrength`、`flashlight.vplVolStrength`、`flashlight.scatterIntensity`、`flashlight.scatterDistRatio`、`flashlight.scatterRadiusRatio`
- **光照**：`ambient`、`lightRange`、`fov`、`rayCount`、`ambientLightSurface`、`ambientLightDeep`、`darknessStartDepth`、`flashlightCenterFov`、`selfGlowRadius`、`selfGlowIntensity`、`lightEdgeFeather`、`ambientPerceptionRadius`、`ambientPerceptionIntensity`、`siltSampleSteps`、`siltAbsorptionCoeff`、`siltInfluenceRadius`
- **Debug**：`debug`、`debugSpeedMultiplier`、`bShowNpcFlashLight`、菜单解锁开关、`infiniteO2`
- **玩法**：`moveSpeed`、`turnSpeed`、`acceleration`、`waterDrag`、`o2ConsumptionBase`、`o2ConsumptionMove`、`siltFactor`、`siltLife`、`maze.moveSpeed`、`attack.range`、`attack.angle`、`attack.cooldown`
- **尘埃**：`dust.enabled`、`dust.density`、`dust.cellSize`、`dust.baseSize` 等 14 个尘埃参数
- **手动挡**：`manualDrive.enabled`、`manualDrive.debugDraw`、推进/转向/水阻/踢水等 22 个参数
- **角色**：`diver.armIdleFrequency`、`diver.legKickFrequency` 等 17 个角色动画参数
- **相机**：`camera.followStiffness`、`camera.swayAmplitude` 等 8 个相机参数
- **后处理**：`postProcess.enableManualExposure`、`postProcess.manualExposure`、`postProcess.enableAutoExposure`、`postProcess.autoExposureMin`、`postProcess.autoExposureMax`、`postProcess.autoExposureSpeed`、`postProcess.autoExposureTarget`、`postProcess.enableToneMapping`、`postProcess.toneMappingMode`、`postProcess.reinhardWhitePoint`
- **浅水区**：`maze.shallowWater.enabled`、阳光/天空/环境光遮罩等 17 个参数
- **标记**：`marker.btnRadius`、`marker.wheelOuterRadius` 等 12 个标记系统参数

每个条目支持两种类型：

- **number**：左边参数名，右边有减号、数值框、加号；点击加减按步长调整，点击数值框调起微信键盘直接输入
- **bool**：左边参数名，右边勾选框，点击切换

所有修改直接写入 `CONFIG` 对象，运行时立即生效，不做序列化。

GM 面板打开时会拦截所有游戏输入，避免误操作。

如果需要新增可调参数，只需在 `GMConfig.ts` 的 `TABS` 数组中添加条目即可。

---

## 三、输入系统 `src/core/input.ts`

### 3.1 输入层的职责边界

`input.ts` 负责把设备输入转换成项目内部可消费的状态或动作。

它的职责不是推进剧情，也不是推进主逻辑，而是：

- 采集触摸或可能的键盘输入
- 更新 `input` 状态
- 判断按钮区域点击
- 触发攻击、菜单交互、长按等行为入口

### 3.2 输入状态与逻辑层的关系

项目常见的处理模式是：

- 输入层写：`input.move`、`input.targetAngle`、`input.speedUp`
- 逻辑层读：这些字段并把它们转成玩家速度与朝向变化

因此输入层与逻辑层的边界比较清晰：

- 输入层：**用户想做什么**
- 逻辑层：**这个意图在当前状态下如何生效**

### 3.3 需要重点留意的输入路径

接手时应重点关注这些输入分支：

- 摇杆或移动方向输入
- 冲刺或加速输入
- 攻击按钮输入
- 菜单按钮输入
- 章节选择输入
- 轮盘交互按钮输入（替代旧绳索长按按钮）
- 放弃救援长按输入

### 3.4 轮盘交互与长按类交互的技术特点

标记系统引入了**轮盘交互**模式，替代旧的绳索长按按钮：

- 玩家靠近可交互对象（岩石/绳索）并静止后，屏幕右侧出现交互按钮
- 按住按钮弹出轮盘，滑动选择扇区，松手确认执行
- 轮盘内容根据上下文动态变化（空岩石/绳索端点/绳索中段/正在铺绳/已有标记）
- 输入层（`input.ts`）负责轮盘的打开、滑动高亮和松手确认
- 逻辑层（`Marker.ts`）负责上下文检测、扇区生成和操作执行

项目中仍保留长按类交互（如迷宫救援绑绳、撤离），这些不是统一交给浏览器或平台组件，而是自己管理进度与状态：

- 一部分长按会通过 `input.ts` 识别按下或抬起
- 一部分完成判定会在 `Logic.ts` 或绳索系统里按时间戳或计时器完成

后续新增交互时，建议根据操作复杂度选择模式：

- 单一操作用长按
- 多选项操作用轮盘

---

## 四、本卷最重要的结论

- **`src/core/state.ts` 是共享状态中枢，改行为时通常要先确认对应状态域。**
- **新增状态字段后，必须同时检查 `resetState()`、`resetGameLogic()`、`resetArenaLogic()`。**
- **`src/core/config.ts` 是首选调参入口，很多问题先改参数即可。**
- **`src/core/input.ts` 负责表达玩家意图，真正的生效方式由逻辑层决定。**