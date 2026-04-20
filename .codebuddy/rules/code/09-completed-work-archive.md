---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
# 技术文档分卷 09：已完成工作归档

## 本卷用途

本卷归档所有已完成的开发工作记录，包括设计思路、迭代历程、修改文件清单和关键教训。

从 `devplan.md` 迁移而来，目的是让开发计划文档保持精简，只聚焦待办事项。

后续 AI 如果需要了解某个已完成功能的实现细节、迭代历程或关键教训，应来本卷查阅。

---

## P1：手动挡模式（2026-04-05 ~ 2026-04-08）

**设计思路**：
手动挡模式将连续摇杆输入替换为搓屏实时驱动。经过 V1~V5 五次迭代，最终采用「推力沿输入方向 + 各向异性水阻 + 身体被动跟随速度方向」的物理模型。

**迭代历程**：
- V1（脉冲模型）：touchEnd 产生脉冲，逻辑层消费 → 松手才动，转向角度太小
- V2（实时驱动）：touchMove 实时更新，从起始点算方向 → 手指不动也一直前进
- V3（瞬时速度）：帧间位移驱动，手指停住无推力 → 统一水阻，无方向性
- V4（各向异性水阻）：前向/侧向不同水阻 → 但推力沿身体朝向，向后搓却往前冲
- V5（最终版）：推力沿输入方向施加，身体被动跟随速度方向 → 物理正确

**核心机制（V5 最终版）**：
1. **推力沿输入方向施加**：搓哪个方向，力就往哪个方向推。不经过身体朝向中转，不会出现"向后搓却往前冲"
2. **身体朝向被动跟随速度方向**：水中流线型身体自然对齐运动方向（`bodyAlignRate=0.12`），速度低于 `bodyAlignMinSpeed` 时不跟随（避免静止抖动）
3. **各向异性水阻**：前向阻力小（`dragForward=0.95`，流线型）、侧向阻力大（`dragLateral=0.82`）。这是身体对齐速度方向的物理原因
4. **掉头过程**：向后搓 → 推力反向 → 先减速 → 速度反转 → 身体跟着转过来。整个过程完全由物理驱动，没有任何"转向速率"硬限制
5. **搓速映射推力**：帧间位移越大（搓得越快），推力越大（`thrustBase + strokeStrength * thrustSwipeScale`），上限 `thrustMax`
6. **限速**：最大速度 `maxSpeed=5.0`
7. **双指支持**：最多同时跟踪2个触点，取帧间位移最大的触点作为本帧划水源
8. **prev/curr 分离**：input 层只更新 curr，逻辑层每帧消费后推进 prev，确保手指不动时 frameDist=0
9. **调试辅助线**：GM 面板可开启，显示身体朝向（绿色）、速度向量（黄色）、输入方向（红色虚线）、前向/侧向速度分量与偏差角度数值

**修改文件**：
- `src/core/config.ts`：新增 `manualDrive` 配置子对象（推力、各向异性水阻、身体跟随、调试辅助线等12个参数）
- `src/core/state.ts`：新增 `manualDrive` 运行态（活跃触点实时位置、划水计数、调试辅助线状态）
- `src/core/input.ts`：touchStart/touchMove/handleTouchEnd 手动挡分支 + 键盘虚拟触点
- `src/logic/Logic.ts`：新增 `processManualDrive()` 通用函数，三处移动逻辑均接入手动挡分支
- `src/render/Render.ts`：新增手动挡调试辅助线绘制
- `src/gm/GMConfig.ts`：新增「手动挡」Tab（12个可调参数，含调试辅助线开关）
- `src/render/RenderUI.ts`：手动挡模式下隐藏摇杆，显示搓屏提示

---

## P2：角色表现设计稿与实现（2026-04-08 ~ 2026-04-09）

**设计结论**：
- 手动挡输入的主可视化应是**潜水员划水动作 + 姿态修正 + 局部水流扰动**
- 潜水员俯视角轮廓采用**前圆、中厚、后分叉**结构
- 动画语义拆为四类：**漂浮待机、划水推进、滑行、掉头修正**
- 反向搓屏的视觉表现应是**刹车 + 拧身 + 掉头**
- 双指搓屏应尽量表现为**双侧交替发力**

**三轮细调要点**：
- 第一轮：去掉四肢辅线和高饱和面镜点，放慢默认节奏，新增 `diver` 配置组
- 第二轮：手臂只做待机摆动和转向修正，腿部改为上下踢水，输入重构为逐触点跟踪/单次消费，左右腿直接映射左右输入
- 第三轮：上调默认强度，整段有效行程持续驱动，输入速度影响力度，左右轮流交替分配，新增动作进度上限/回收速度/力度衰减参数，手臂随速度收拢，腿部改为传导式踢水

**修改文件**：
- `src/render/RenderDiver.ts`：完整重写角色绘制
- `src/logic/ManualDrive.ts`：逐触点输入消费与前进/转向分解
- `src/core/config.ts`：新增 `diver` 配置组 + `manualDrive` 参数更新
- `src/gm/GMConfig.ts`：新增"角色"Tab + "手动挡"Tab 更新

---

## P3：岩石生成一致性（2026-04-04 ~ 2026-04-05）

**问题根因**：碰撞检测硬编码 padding、光照不遍历迷宫额外装饰圆、三个模式 padding 不统一。

**一致性保证**：渲染 = `wall.r`，光照遮挡 = `wall.r`，碰撞 = `wall.r + playerRadius`，三者使用同一个 wall 对象数据源。

**迷宫额外圆碰撞修复**：额外圆挂到基础 wall 的 `extras` 数组上，`checkMazeCollision()` 同时遍历 extras。

---

## P4：悬浮尘埃系统（2026-04-05）

**技术方案**：空间哈希确定性采样，双层渲染（暗色层+亮色层），多频正弦漂移，手电光锥内散射。

**新建文件**：`src/render/DustMotes.ts`

---

## P5：标记系统（2026-04-12）

**核心机制**：上下文感知轮盘、三种标记语义（danger/unknown/safe）、两种附着方式（岩石插牌/绳索绑扎）、绳索操作整合、跨下潜持久化、放置/拆除动画。

**新建文件**：`src/logic/Marker.ts`、`src/render/RenderMarker.ts`、`src/render/RenderWheel.ts`

---

## P7：相机系统（2026-04-10）

**核心机制**：弹簧臂跟随 + 前瞻偏移 + 水中摇曳（多频正弦叠加）+ 光照分离（`u_cameraPos` / `u_playerPos`）。

**新建文件**：`src/logic/CameraLogic.ts`

**关键教训**：`.glsl` 修改后必须运行 `node scripts/buildShaders.js` 重新生成 `.glsl.ts`。

---

## P8：浅水区渲染（2026-04-11 ~ 2026-04-12）

**已完成功能**：天空连续化、阳光平行光柱、水面焦散、水面反光带、水体色调叠加、丁达尔光柱、环境光遮罩连续化（V2 单一幂函数曲线）。

**其他修复**：水面位置统一、去掉不规则岩石、去掉背景装饰、去掉岩石反光、背景颜色断层修复、岩石颜色随深度连续变暗。

---

## 表现层改进方案文档化（2026-04-10）

已落文档：`design/04-interaction-and-engineering.md`、`code/04-render-and-special-systems.md`、`design.md` / `code.md`。

---

## 废弃代码清理（2026-04-12）

系统性清理 11 项：`ropePathMaxIters`、`wallPatternCanvas`、多处无用导入、`target` 对象、`player.n2` 氮气系统、`state.debug.fastMove`、`safeAscentSpeed`、敌鱼冗余分支。4 份重复圆角矩形函数未处理（后续重构）。

---

## GM 面板增强与标记按钮自适应（2026-04-12）

**三项改动**：

1. **Tab 栏可滑动**：Tab 数量已达 11 个，每个 Tab 改为固定宽度 60px，Tab 栏支持左右滑动，底部有橙色滑动指示条。
2. **面板可拖动**：面板顶部新增 22px 高的拖动条（带三条横线手柄），按住拖动条可移动整个面板位置，面板不会超出屏幕边界。面板位置从固定常量改为运行时可变状态。
3. **标记按钮位置自适应**：新增 `getWheelBtnPos()` 函数（从 `RenderWheel.ts` 导出），在原始比例位置基础上用 `wheelOuterRadius + 12` 作为安全边距，将按钮位置 clamp 到安全区域内，确保轮盘展开后不超出屏幕边界。`input.ts` 中的轮盘按钮检测也改用此函数，保证渲染和交互位置一致。

**修改文件**：
- `src/gm/GMConfig.ts`：`PANEL_X`/`PANEL_Y` 改为 `PANEL_DEFAULT_X`/`PANEL_DEFAULT_Y`，新增 `DRAG_BAR_H`（拖动条高度）、`TAB_FIXED_W`（Tab 固定宽度）
- `src/gm/GMPanel.ts`：新增面板拖动状态（`_panelX`/`_panelY`/`_dragging`）、Tab 滑动状态（`_tabScrollX`/`_tabScrolling`）、`getGMState()` 扩展返回新状态、触摸处理逻辑适配拖动和 Tab 滑动
- `src/gm/GMRender.ts`：绘制拖动条（背景 + 手柄图标）、Tab 固定宽度 + 裁剪区域 + 滑动偏移 + 滑动指示条、所有坐标改用动态 `panelX`/`panelY`
- `src/render/RenderWheel.ts`：新增并导出 `getWheelBtnPos()` 自适应位置计算函数，`drawWheelButton()` 和 `drawWheel()` 改用此函数
- `src/core/input.ts`：轮盘按钮检测改用 `getWheelBtnPos()`，新增 `import { getWheelBtnPos } from '../render/RenderWheel'`

---

## 迷宫模式 UI 重设计（2026-04-13）

**六项改动**：

1. **删除潜水电脑 UI**：移除下潜类型标签 `[侦察]`/`[救援]`，不再在游戏中显示下潜类型。
2. **深度+氧气一体化面板**：左上角紧凑胶囊式面板（56×110px），上半部分显示深度数字（大号）+单位，下半部分显示氧气环形指示器（圆环进度+百分比数字），低氧时外圈闪烁警告。
3. **小地图改为调试模式专属**：小地图仅在 `CONFIG.debug=true` 时显示，位置下移到面板下方（yOffset=130）避免重叠，保留折叠功能不变。
4. **撤离按钮重设计**：从旧的圆形+文字改为简约磨砂玻璃风格，中心是上箭头图标（三角+短线），下方保留"撤离"文字，长按时显示圆弧进度环。
5. **结算页面重设计**：轨迹复盘地图占据页面主体（自适应最大化），统计数据改为底部紧凑横排（用时/深度/探索/绳索），按钮改为渐变胶囊风格，整体布局更简洁。
6. **标记按钮即时出现**：去掉 `stillTimer` 延迟等待机制，玩家在可交互区域且没有移动输入时立即显示交互按钮，手动挡模式下同时检查是否有活跃触点。

**修改文件**：
- `src/render/RenderMazeUI.ts`：游戏中 HUD 重写（深度+氧气面板、撤离按钮、小地图条件渲染）、结算页面完整重写
- `src/logic/Marker.ts`：`updateWheelButtonVisibility()` 去掉 `stillTimer` 延迟，改为无移动输入时立即显示
- `src/core/input.ts`：结算页按钮点击区域同步更新、小地图折叠按钮加调试模式判断

---

## P7 远近自适应缩放（2026-04-13）

**核心机制**：多方向射线空间检测 + 开阔度计算 + smoothstep 映射 + 平滑过渡。

**设计方案**：
- 从玩家位置向周围发射 12 条均匀分布 360° 的射线，检测每个方向到最近墙体的距离
- 去掉最大最小各 10% 的射线距离后取 trim 平均，减少极端值影响
- 平均距离通过线性映射转为 0~1 的开阔度指标（`azNarrowDist` ~ `azWideDist`）
- 开阔度通过 smoothstep 曲线映射到目标 zoom（`azZoomNarrow` ~ `azZoomWide`）
- 目标 zoom 通过低速线性插值平滑过渡，避免突然跳变
- 射线检测每 3 帧执行一次（可配置），降低性能开销
- 主线模式中自适应 zoom 与剧情 zoom 取 `Math.max`，确保剧情拉近不被覆盖
- 竞技场和迷宫模式直接使用自适应 zoom 驱动
- 支持主线/竞技场（`state.map`）和迷宫模式（`mazeRescue.mazeMap`）两套地图数据

**新增参数**（`CONFIG.camera`）：
- `adaptiveZoom`：总开关
- `azRayCount`：射线数量（默认 12）
- `azMaxRayDist`：最大检测距离（默认 600px）
- `azRayStep`：步进步长（默认 8px）
- `azNarrowDist`：狭窄阈值（默认 120px）
- `azWideDist`：空旷阈值（默认 350px）
- `azZoomNarrow`：狭窄 zoom（默认 1.35）
- `azZoomWide`：空旷 zoom（默认 0.85）
- `azSmoothSpeed`：过渡速度（默认 0.015）
- `azUpdateInterval`：检测间隔帧（默认 3）

**修改文件**：
- `src/core/config.ts`：`CONFIG.camera` 新增 10 个远近自适应缩放参数
- `src/logic/CameraLogic.ts`：新增 `castSpaceRays()`、`computeOpenness()`、`opennessToZoom()`、`updateAdaptiveZoom()`、`resetAdaptiveZoom()`、`getAdaptiveZoom()`、`getOpenness()`；`updateCameraSpringArm()` 末尾调用自适应缩放更新；`snapCameraToPlayer()` 同步重置自适应缩放状态
- `src/logic/Logic.ts`：主线 zoom 逻辑改为剧情 zoom 与自适应 zoom 取 `Math.max`；新增导出 `getAdaptiveZoom`、`resetAdaptiveZoom`、`getOpenness`
- `src/logic/MazeLogic.ts`：迷宫模式集成自适应缩放驱动 zoom
- `src/logic/ArenaLogic.ts`：竞技场模式集成自适应缩放驱动 zoom
- `src/gm/GMConfig.ts`：相机 Tab 从 8 个参数扩展到 18 个参数

---

## 迷宫 UI 二次迭代 + 主线潜水电脑面板删除（2026-04-13）

**三项改动**：

1. **删除主线"潜水电脑"面板**：`RenderUI.ts` 中 `drawUI()` 开头的深色背景面板（160×200px）、"潜水电脑"标题、深度文字、氧气条/氧气瓶损毁提示全部删除，同时清理无用的 `drawLungs` import。
2. **迷宫 HUD 氧气改为圆形进度环**：原来的水平进度条+百分比数字替换为圆形进度环设计。圆环从顶部顺时针绘制，中心显示深度数字和单位。氧气颜色三档变色（蓝/黄/红），低氧时环外发出柔和脉冲光晕。
3. **整体视觉重设计**：深度数字居中于圆环内部（18px bold），单位 `m` 在数字下方（9px），圆环半径 22px、线宽 3.5px，背景环用同色系低透明度轨道。保留入场滑入+淡入动效（easeOutCubic 40帧）。

**修改文件**：
- `src/render/RenderUI.ts`：删除 `drawUI()` 中的潜水电脑面板代码（约20行）和 `drawLungs` import
- `src/render/RenderMazeUI.ts`：游戏中 HUD 从水平氧气条重写为圆形进度环+居中深度数字

---

## UI 全面优化迭代（2026-04-13）

**十项改动**：

1. **HUD 按住展开详情**：左上角氧气环按住后从右侧展开详情面板（smoothstep 动效），显示 O₂ 百分比、深度数值、操控模式。松手自动收起。
2. **撤离按钮按住展开说明**：长按撤离按钮时，按钮上方展开"撤离上浮"说明面板（smoothstep 动效），让用户明确知道这是撤离功能。
3. **结算界面 padding 优化**：地图区域增加 padding（16→24），统计区域和按钮区域高度增加，地图可用宽度缩小（减去 4 倍 padding），整体布局更宽松不拥挤。
4. **岸上营地探索记录折叠/展开**：信息卡片改为可折叠设计，默认折叠只显示标题栏（44px），点击标题栏展开/收起详情。卡片底部对齐，不遮挡场景。
5. **岸上营地返回按钮居中**：使用 `textBaseline = 'middle'` 让文字垂直居中在按钮框内。
6. **主菜单按钮上移**：4 个按钮 Y 坐标从 0.50/0.62/0.74/0.86 调整为 0.46/0.57/0.68/0.79，远离屏幕下边缘。同步更新 input.ts 中的点击检测坐标。
7. **手动/自动挡正式开关**：氧气环下方新增手动挡开关小圆点（M/A 图标），点击切换手动/自动挡。按住展开详情说明面板。
8. **版本号配置化**：`CONFIG.version` 新增版本号字段，主菜单版本号改为读取配置。
9. **版本号更新**：从 v1.2.0 改为 v1.0.9。
10. **作者名更新**：从"熊子"改为"游呢王纸"。

**新增状态字段**（`state.mazeRescue`）：
- `_hudDetailOpen`：HUD 详情展开进度
- `_hudDetailHolding`：HUD 详情是否按住
- `_retreatDetailOpen`：撤离详情展开进度
- `_retreatDetailHolding`：撤离详情是否按住
- `_shoreRecordOpen`：岸上探索记录是否展开
- `_driveToggleOpen`：手动挡详情展开进度
- `_driveToggleHolding`：手动挡详情是否按住

**修改文件**：
- `src/core/config.ts`：新增 `version` 字段
- `src/core/state.ts`：`mazeRescue` 新增 7 个 UI 状态字段
- `src/logic/MazeLogic.ts`：初始化新 UI 状态字段
- `src/render/RenderMazeUI.ts`：HUD 展开详情、撤离展开说明、结算 padding、岸上折叠卡片、返回按钮居中
- `src/render/RenderMenu.ts`：版本号配置化 + 作者名更新 + 按钮位置上移
- `src/core/input.ts`：按钮检测坐标同步 + HUD 按住检测 + 手动挡开关点击 + 岸上折叠点击

---

## UI 细节修复迭代（2026-04-13）

**五项修复**：

1. **手动/自动挡开关按钮放大+换色**：半径从 8→14，手动挡橙红色（`rgba(240,120,50)`），自动挡绿色（`rgba(60,200,120)`），新增外圈细线，字体从 9px→12px，详情面板颜色同步更新。
2. **结算页面 padding 再优化**：`mapPadding` 24→28，标题到地图间距 28→36，统计区域 110→120，按钮区域 80→90，地图可用宽度减去 6 倍 padding。地图背景和边框内边距从 4→10（`mapInnerPad`），圆角 8→10。
3. **结算页面按钮文字居中**："回到岸上"和"下一局"按钮文字使用 `textBaseline = 'middle'`，Y 坐标改为 `btnY`（不再 +5 偏移）。
4. **探索记录折叠重设计**：卡片高度改为 smoothstep 动画过渡（`_shoreRecordAnim` 状态字段），标题栏高度 44→48，箭头和标题左对齐（箭头在最左，标题紧跟），地图图标独立定位到右侧（不再和箭头重合），卡片背景改为更柔和的磨砂感，展开内容带淡入动效（animEase > 0.3 时开始显示）。
5. **主菜单标题居中修复**：光晕中心从 `logicH * 0.28` 对齐到 `logicH * 0.27`（与标题文字一致），"救援行动"副标题从 `logicH * 0.37` 上移到 `logicH * 0.35`，整体标题区域更紧凑居中。

**新增状态字段**：`_shoreRecordAnim`（岸上探索记录展开动画进度）

**修改文件**：
- `src/render/RenderMazeUI.ts`：手动挡开关放大换色、结算 padding 再优化、按钮文字居中、探索记录折叠动效重设计
- `src/render/RenderMenu.ts`：标题光晕居中修复 + 副标题位置调整
- `src/core/state.ts`：新增 `_shoreRecordAnim` 字段
- `src/logic/MazeLogic.ts`：初始化 `_shoreRecordAnim`
- `src/core/input.ts`：岸上卡片位置计算同步更新 + 手动挡开关点击半径更新

---

## 食人鱼死亡过场卡死修复（2026-04-19）

**问题现象**：
迷宫模式下偶现玩家被食人鱼咬死后，屏幕红色全屏特效触发，但玩家仍可移动，死亡过场走不到结算页面，卡死在 bite/devour 阶段。

**根因分析**：
食人鱼聚集点（2~6 条）连续扑击时，`triggerPlayerBitten()` 被多条鱼重复调用并无条件重置 `fishBite.phase='bite'` 与 `timer=0`，把已进入 `dead` 阶段的死亡过场打断。叠加被咬期间玩家移动未冻结，玩家自己可能主动凑到下一条鱼面前触发连咬，导致 `deathFadeDuration`（120 帧）的倒计时永远无法走完，`maze.phase` 永远切不到 `surfacing`，结算页无法出现。

**修复方案（两处）**：

1. **死亡状态守卫**：`triggerPlayerBitten()` 入口增加 `phase==='dead'` 早退判断，死亡阶段忽略后续咬击，防止多条鱼聚集时反复重置死亡倒计时。

2. **被咬期间冻结玩家移动**：主线、竞技场、迷宫三个模式的移动入口前统一加 `state.fishBite.active` 冻结分支，被咬期间将 `input.move` / `player.vx` / `player.vy` 清零并清空手动挡脉冲队列。语义上正确（被咬住本就动不了），附带好处是降低玩家在聚集点反复触发连咬的概率。

**修改文件**：
- `src/logic/FishEnemy.ts`：`triggerPlayerBitten()` 入口增加 dead 阶段早退守卫
- `src/logic/Logic.ts`：主线 `update()` 绳索冻结段旁新增被咬冻结分支
- `src/logic/MazeLogic.ts`：迷宫 `updateMaze()` 的 `processManualDrive()` 前新增被咬冻结分支
- `src/logic/ArenaLogic.ts`：竞技场 `updateArenaPlayer()` 函数开头新增被咬冻结分支（含早退）

**验证**：`npm run typecheck` 通过。

---

## 岸上全屏手绘认知地图重做（2026-04-20）

**问题**：
旧版 `drawMazeMapFullscreen` 按 `step=2` 扫描已探索格子，每个区块涂一个方形色块，并且水域色块按区域主题 `mapColor` 上色（蓝、黄、红、灰等），导致整张地图读感像"一堆彩色格子拼的马赛克"，完全没有手绘地图的气质。

**重做目标**（用户确认方向）：
1. 主题彩色完全退出地图主体，只做单色铅笔素描。
2. 未探索区域彻底留白（纸色），不再贴迷雾和问号。
3. 只改岸上全屏认知地图，小地图和结算页轨迹图不动。

**新实现方案（算法级重做）**：

1. **mask 提取**：把"已探索(mazeExplored)+ 洞穴(mazeMap==0)"的格子合成一张 `(cols+2)×(rows+2)` 的布尔 mask（外围补一圈 false 方便提取边缘）。
2. **marching squares 轮廓提取**：遍历每个 mask 为 true 的格子的四条边，只要外侧是 false 就生成一条有向边（约定 cave 在左手边，逆时针围住 cave）。用 `nextOf` 映射把边串联成若干条闭合多边形。
3. **Chaikin 平滑**：对每条闭合多边形做 2 次 Chaikin 平滑（0.75/0.25 比例），让棱角圆润。
4. **内部斜线阴影**：用 `ctx.clip('evenodd')` 把所有轮廓当作裁剪区（外面加 outer rect 一起参与 evenodd 也无所谓，这里只用 smoothed 本身），在内部画 45° 斜线（alpha=0.07、lineWidth=0.5、间距 5px），营造"铅笔素描浅阴影"的洞穴感，不再用彩色。
5. **双层叠笔轮廓**：每条闭合多边形走两遍——
   - 底笔：`rgba(90,70,55,0.55)`、lineWidth=2、alpha=0.35、抖动幅度 1.4px（淡灰粗底）
   - 收口笔：`rgba(40,28,20,0.9)`、lineWidth=1、alpha=0.85、抖动幅度 0.7px、相位错开 2.1（墨色细笔收边）
   抖动沿每个采样点的法线方向施加，用双频正弦合成，模拟铅笔起伏。
6. **绳索**：改成棕红双勾铅笔线（不再是虚线），底笔粗暖棕 `rgba(165,95,45,0.55)` + 面笔深褐 `rgba(100,55,25,0.9)`，沿路径法线加微抖动。
7. **红笔标注**：出口用双圈红（`rgba(160,40,30)`）+ 向上小三角 + "出口"；被困者用双笔 X + 手绘圈 + "被困者"，保留脉冲呼吸。
8. **图例重设计**：彻底去掉按主题分色的彩色圆点图例（以前会有 5 种岩性色点），改为语义图例四项：出口（红圈）、被困者（红 X）、绳索（棕色抖动线）、已探区（双勾铅笔圆圈）。

**修改文件**：
- `src/render/RenderMazeUI.ts`：整体重写 `drawMazeMapFullscreen()`；移除对 `getMazeSceneThemeConfigByIndex` 和 `getMazeThemeLegendItems` 的 import（只保留 `getMazeMainThemeConfig`，结算页轨迹图仍在用）。
- `ToDo.md`:"⭐️⭐️⭐️"段的"手绘地图重做"项移除。

**视觉读感变化**：
- 旧：底色迷雾灰 + 蓝黄红灰彩色方块拼贴 + 格子状边缘碎线 + 均匀虚线绳索
- 新：米白羊皮纸 + 连续闭合的铅笔轮廓洞穴 + 内部浅斜线阴影 + 红笔圈注 + 棕色双勾绳索，未探区域完全留白。

**验证**：`npm run typecheck` 通过。

---

## 岸上手绘地图改造为"按次下潜回放 + 最近 5 次记录"（2026-04-21）

**背景**：
上一版岸上"手绘地图"（marching-squares 铅笔素描）读感不佳，且只展示跨下潜累积的最终状态，玩家无法回看每一次下潜各自的轨迹。本次彻底改掉。

**新方案**：
- 岸上信息卡片右侧图标从"地图图标"改为"下潜记录"小书本图标，右上角徽标显示当前记录条数（0~5）
- 点击后**先进"下潜记录列表"页**：每条卡片显示该次下潜的缩略图（本次累积已探索 + 轨迹预览）、第 N 次、返回原因、用时、深度、新探索格子数、绳索+N
- **点任意一条卡片 → 进入该次的"手绘地图回放"页**：
  - 外层**羊皮纸米白岸上色**（A2：外层用岸上颜色）
  - 地图内容借鉴结算页画法：深色格子 + 本次新探索用棕红高亮 / 旧探索用淡褐底 + 墙体墨褐 + 绳索棕红双勾 + 出口绿圈 + NPC 红/绿 X 圈注
  - **每次打开重放 90 帧轨迹展开动画**（C1），末端笔尖闪烁脉冲
  - 底部一行紧凑信息条（原因 · 用时 · 深度 · 新探索 · 绳索）
- **每次下潜单独存档**：`finishMazeDive()` 把该次结束时的 `playerPath`、`mazeExplored` 快照、`thisExploredBefore` 快照、绳索路径快照、NPC 是否发现标志全部深拷贝进 `diveHistory` 条目
- **只保留最近 5 次**：`diveHistory` 末尾每次 push 后执行 `while (length > 5) shift()`，超过自动挤掉最老的
- **只对当前地图有效**：`resetMazeLogic()` 开新一局时 `diveHistory = []`，因为换地图整个 `state.mazeRescue` 会整体重建，历史自然归零

**新增状态字段**（`state.mazeRescue`）：
- `shoreMapDiveIndex: number` — 岸上正在回放的下潜索引（-1=列表页，>=0=diveHistory下标）
- `shoreMapAnimTimer: number` — 岸上回放地图的轨迹动画计时（帧），每次打开重置为 0

**diveHistory 条目新增字段**：
- `playerPath?: {x, y}[]` — 本次轨迹深拷贝
- `exploredSnapshot?: boolean[][]` — 本次结束时累积已探索（深拷贝）
- `exploredBeforeSnapshot?: boolean[][]` — 本次开始前已探索快照（用于区分"本次新探索"高亮色）
- `ropesSnapshot?: {path: {x,y}[]}[]` — 本次结束时全部绳索路径（深拷贝，因后续下潜还会铺绳）
- `npcFoundAtEnd?: boolean` — 该次结束时是否已发现 NPC
- `finishAt?: number` — 结束时间戳

**存储成本**：
100×100 布尔矩阵 ≈ 10000 个 bool（纯内存 JS 对象，不序列化），单条下潜约 20~40KB，最多 5 条 ≈ 200KB，可接受。

**修改文件**：
- `src/core/state.ts`：`mazeRescue.shoreMapDiveIndex`/`shoreMapAnimTimer` 新增；`diveHistory[]` 类型新增 6 个可选快照字段
- `src/logic/MazeLogic.ts`：`resetMazeLogic()` 初始化新字段；`finishMazeDive()` 做 4 份深拷贝（轨迹/已探索/已探索前置/绳索）并把快照写进 `diveHistory`，末尾按 5 条上限做 FIFO
- `src/render/RenderMazeUI.ts`：
  - 岸上信息卡片右侧按钮图标改为"书本"+ 记录条数徽标
  - `drawMazeMapFullscreen()` 改为分发器：`shoreMapDiveIndex<0` → `drawShoreDiveList`；>=0 → `drawShoreDiveReplay`
  - 新增 `drawShoreDiveList()`：羊皮纸底 + 标题 + 最多 5 条逆序卡片（每条带缩略图 + 路径预览 + 文字信息）
  - 新增 `drawShoreDiveReplay()`：羊皮纸底 + 地图区 + 结算页风格内容 + 90 帧轨迹展开动画 + 笔尖脉冲
  - 原函数更名为 `drawMazeMapFullscreenLegacy()` 保留但不再被调用（以备回退）
- `src/core/input.ts`：岸上点击分发大幅改造
  - 打开时先进列表；点卡片→回放；回放页点左上"← 记录"或空白→回列表；列表页点"← 返回"或空白→关闭全屏回到岸上
  - 把岸上卡片右侧按钮点击从"打开认知地图"改为"打开下潜记录列表"（同时重置 `shoreMapDiveIndex=-1`、`shoreMapAnimTimer=0`）

**验证**：`npm run typecheck` 通过，无新增类型报错。