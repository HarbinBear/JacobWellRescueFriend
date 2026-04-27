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

---

## 手动挡转向渐进动画（2026-04-22）

**需求背景**：
手动挡之前转向过于灵敏——向反方向搓屏时，身体会立刻跟着输入方向产生推进，导致"一边掉头一边往反方向飞出去"的割裂感。ToDo 要求转向做成渐进动画：反向输入时先做掉头再移动，转向角度 > 90° 不移动、< 90° 转向与移动融合。

**设计原则**：
- **只影响手动挡**：自动挡/摇杆走的是另一条链路，不受本次改动影响
- **允许少量滑行**：大掉头阶段不施加新推力，但保留已有速度让各向异性水阻自然衰减，形成"一边拧身子一边惯性漂行"的观感
- **软过渡避免跳变**：阈值附近用 smoothstep 融合，而不是硬切

**核心机制**：

1. **计算身体-输入夹角 `bodyInputDiff`**：每帧对每个有效触点算 `atan2(inputY, inputX) - player.angle` 并归一化到 `[-π, π]`，取绝对值 `bodyInputAbs` 得到 0~π 的掉头程度。

2. **软阈值 `bigTurnT`（0~1）**：以 `bigTurnThreshold`（默认 π/2 = 90°）为中心、`bigTurnBlendWidth`（默认 0.35 弧度）为软过渡宽度，用 smoothstep 从 0 渐变到 1。
   - `bigTurnT = 0` → 正常同向推进
   - `bigTurnT = 1` → 完全掉头阶段，推力几乎为零

3. **推进融合系数 `thrustBlendFactor`**：
   - 同向时按 `cos(bodyInputAbs)` 衰减（角度越偏推进越弱）
   - 大掉头时降到 `bigTurnThrustFactor`（默认 0，可调至 0.1~0.2 允许轻微爬行）
   - 两者用 `bigTurnT` 线性混合

4. **朝向补偿 `bigTurnAssist`**：大掉头阶段额外施加纯角度修正（不触碰速度），保证即使侧向分量 `lateralDot` 很小、只靠现有 `turnPower` 路径无法及时掉头时，身体也能加速拧过来。补偿量 = `bigTurnAssist × bigTurnT × distanceRatio × min(1, bodyInputAbs / π × 2)`，朝输入方向推。

5. **转向路径原样保留**：原有的 `turnPower * turnAmount` 那一路逻辑不动，侧向分量该起作用还是起作用。`bigTurnAssist` 是叠加项，用来兜底大角度反向输入时的转身速率。

6. **动作表现同步**：
   - `kickVisual` 乘以 `(1 - bigTurnT)` → 前进踢水在掉头阶段几乎不显示
   - `kickStrengthNorm` 乘以 `(1 - bigTurnT × 0.85)` → 踢水力度压低
   - `turnStrengthNorm` 加上 `bigTurnT × 0.35` → 转向修正动作更明显

**"允许少量滑行"的实现**：
没有新增任何滑行专用代码。机制是：大掉头阶段新推力为 0 但旧速度保留，各向异性水阻（`dragForward=0.975`、`dragLateral=0.9`）继续逐帧衰减，身体拧过来后新方向的 `cosA/sinA` 改变导致原来的前向速度变成侧向速度，被更大的 `dragLateral` 更快吃掉。因此玩家看到的就是"拧身子的同时沿旧方向滑行一小段再停下"。

**新增配置（`CONFIG.manualDrive`）**：
- `bigTurnThreshold: 1.5708`（π/2，大掉头阈值）
- `bigTurnBlendWidth: 0.35`（软过渡宽度）
- `bigTurnAssist: 0.08`（每帧朝向补偿速率）
- `bigTurnThrustFactor: 0`（大掉头阶段推进残留系数）

**修改文件**：
- `src/core/config.ts`：`manualDrive` 新增 4 个转向渐进动画参数
- `src/logic/ManualDrive.ts`：`processManualDrive()` 内每个触点循环前新增 `bodyInputDiff / bigTurnT / thrustBlendFactor` 计算；推进施加处乘 `thrustBlendFactor`；大掉头阶段额外施加 `bigTurnAssist` 朝向补偿；动作表现对 `bigTurnT` 做对应压低/抬升
- `src/gm/GMConfig.ts`："手动挡" Tab 新增 4 个参数条目（掉头阈值 / 软过渡宽度 / 朝向补偿 / 推进残留）

**验证**：`npm run typecheck` 通过，无新增类型报错。自动挡路径无任何改动。

---

## NPC 救援反馈：呼救 + 绑绳渲染 + 距离约束（2026-04-22）

**需求**：
1. 被救者在被救前需要给出呼救反应（原本只是静止漂动 + 朝向玩家，没有任何呼救表现）
2. 绑绳完成后需要绘制玩家↔NPC 之间那根救援绳（原本无连接线）
3. 被救后 NPC 要跟玩家保持距离，不要被甩开太远（原本以固定速度跟随，玩家快搓容易甩开）

**方案选型（用户确认）**：
- 呼救反应：**C 方案**（远处黄色脉冲闪光圈做方向指示 + 近处气泡+挥手补充近距离表现）
- 呼救时机：**B 方案**（玩家进入 `npcRescueRange * 3` 感知半径才激活呼救，离开即停止生成新粒子，已有粒子自然消散）
- 绳索样式：**B 方案**（复用 RenderRope 的节点绳基调：主绳线 + 每隔几段一个小绳节 + 两端锚点）
- 距离约束：**D 方案**（近距离NPC轻微漂浮；距离越远NPC追得越快，速度按 smoothstep 从 `vMin` 平滑映射到 `vMax`；超过 `maxDist` 则玩家位置被朝NPC方向拉回，并衰减玩家远离分量的速度，模拟"绳索绷紧拖慢玩家"）
- 适用范围：**仅迷宫模式**（主线 `Logic.ts` 的 `updateNPC()` 未改动，保持原状态机行为）

**核心机制**：

1. **呼救激活判断（每帧）**：距离 `< npcRescueRange * npcDistressActivateRatio`（默认 3.0）才激活，激活后推进 `distressTimer`、`distressArmPhase`，并按概率生成气泡；闪光圈按 `npcDistressHaloInterval`（默认 1.6s）周期生成。
2. **呼救粒子/圈的消散独立于激活**：即使玩家离开感知范围，已有粒子继续跑完生命周期，避免"突然消失"的割裂感。
3. **救援绳渲染**：`RenderRescueRope.ts` 根据玩家↔NPC 实时位置构造 10 段折线，每段带 `sin(t*PI)` 松弛包络 + 水中摆动 + 轻微下垂，tension = dist/maxD 超过 0.85 时绳色略变暖（提示绷紧）。
4. **柔性跟随**：`dist > ideal*0.6` 时按平滑映射速度前进；否则 NPC 仅继续衰减旧速度轻微漂浮，避免贴脸抖动。
5. **超距拖慢玩家**：`dist > maxD` 时，玩家位置沿"NPC→玩家"反向被拉回 `over * pullFactor` 像素；并衰减玩家速度中"远离 NPC 方向"的分量，让玩家直观感到"被绳拉住"。

**新增配置（`CONFIG.maze`，11 个参数）**：
- `npcTetherIdealDist: 70` — 理想跟随距离
- `npcTetherMaxDist: 220` — 绳索最大拉伸距离
- `npcFollowSpeedMin: 1.2` — 理想距离处的最低追赶速度
- `npcFollowSpeedMax: 9.0` — 最大距离处的最高追赶速度
- `npcTetherPullFactor: 0.55` — 玩家超距时被拖慢系数
- `npcDistressActivateRatio: 3.0` — 呼救激活半径 = `npcRescueRange × 该系数`
- `npcDistressBubbleRate: 0.08` — 每帧生成呼救气泡的概率
- `npcDistressHaloInterval: 1.6` — 呼救闪光圈生成周期（秒）
- `npcDistressArmSwing: 0.55` — 挥手幅度（弧度）
- `rescueRopeColor / rescueRopeWidth / rescueRopeSegments / rescueRopeSlackAmp / rescueRopeWaveAmp` — 救援绳样式

**新增状态（`state.npc`）**：
- `distressActive` — 是否处于呼救激活范围内
- `distressTimer` — 呼救累积时间
- `distressArmPhase` — 挥手动作相位
- `distressBubbles: {x,y,vx,vy,life,size}[]` — 呼救气泡粒子列表
- `distressHalos: {t}[]` — 呼救闪光圈列表
- `distressHaloTimer` — 下一个闪光圈生成倒计时

**新建文件**：`src/render/RenderRescueRope.ts`（`drawRescueRopeWorld()` + `drawNPCDistressWorld()` 两个导出函数）

**修改文件**：
- `src/core/config.ts`：`CONFIG.maze` 新增 11 个参数，`npcFollowSpeed` 注释改为"跟随阶段兜底值"
- `src/core/state.ts`：`state.npc` 追加 6 个呼救运行态字段
- `src/logic/MazeLogic.ts`：两处 NPC 初始化（`resetMazeLogic()` 岸上、`startMazeDive()` 下潜开始）追加呼救状态清理；`updateMaze()` 中 NPC 更新段完全重写（救援中走柔性跟随+绳索约束；未救走静止漂动+呼救表现；气泡和闪光圈更新与消散独立于激活状态）
- `src/render/Render.ts`：新增 `import { drawRescueRopeWorld, drawNPCDistressWorld }`；`drawRopesWorld()` 之后绘制救援绳；玩家绘制之后绘制 NPC 呼救表现

**渲染顺序**（迷宫模式、绑绳后）：
```
...粒子/水草/鱼... → drawRopesWorld() → drawRescueRopeWorld() → 
标记/鱼敌 → NPC → 玩家 → drawNPCDistressWorld()（气泡+挥手+闪光圈在最上层）
```

**验证**：`npm run typecheck` 通过，无新增类型报错。主线 `updateNPC()` 未改动，主线行为不受影响。

---

## P9：音频系统基础框架 + BGM 云存储接入（2026-04-22 ~ 2026-04-23）

**阶段一：音频管理器基础框架**

- 新建 `src/audio/AudioManager.ts`，承担音频系统总入口
- `InnerAudioContext`（小游戏）/ `HTMLAudioElement`（浏览器兜底）双路径
- 静音 != 暂停：关闭开关只把音量淡到 0，音频本体持续播放保留时间轴，重新开启时从实时位置继续（"后台一直在放，只是没发声"）
- 离开主菜单时执行真正的淡出+暂停
- 淡入淡出通过逐帧线性逼近 `targetVolume` 实现
- 顶部 GM 按钮左侧新增全局音频开关，开启时显示循环音波旋转动画，关闭时显示斜线屏蔽图标，两种状态切换均走淡入淡出

**阶段二：BGM 接入微信云开发云存储（解决主包 4MB 超限）**

**问题背景**：主菜单 BGM MP3 体积 3.45MB，加上代码与贴图后整包 5068KB 超过 4MB 主包限制，微信开发者工具报 `source size exceed max limit 4MB`。

**方案**：接入微信云开发云存储，音频放云端，运行时换取临时 URL 播放。

**实现要点**：
- `CONFIG.audio.cloud` 新增配置：`enabled` / `envId` / `fileIDs` 映射
- `initAudio()` 启动即调 `wx.cloud.init({ env })`，失败降级
- **预加载策略（B 方案）**：初始化时立即并行发起 `getTempFileURL`，到达主菜单时 URL 通常已就绪
- `_resolveAndApplyCloudURL()` 把 `cloud://` FileID 换成临时 HTTPS URL 后再赋值给 `ctx.src`
- 每条 Entry 引入 `srcReady` / `pendingPlay` / `urlResolving` 三个状态位
- `playBGM()` 时 URL 尚未就绪会挂起 `pendingPlay`，URL 回来后自动启动播放
- `onError` 捕获 `errCode === 10002`（临时 URL 过期）自动重新请求，无缝续播
- 云开发不可用或请求失败时自动降级到本地 `path`

**踩坑记录**：
1. **权限报错 `STORAGE_EXCEED_AUTHORITY`**：云开发上传后的文件默认权限是"仅创建者可读写"，小游戏运行时调用 `getTempFileURL` 返回 `tempFileURL: ""` 且 `status: 1`。必须在云开发控制台把文件权限改为"所有用户可读，仅创建者可读写"，或 bucket 级设置自定义规则 `{ "read": true, "write": "auth != null" }`。
2. **InnerAudioContext.src 不吃 cloud:// 协议**：必须先通过 `getTempFileURL` 换成 `https://` 真实 URL 后再赋值。
3. **临时 URL 有效期 2 小时**：单次游戏会话内够用，但长时间挂起后需要 `onError` 10002 触发重拉。

**真机验证**：上传 BGM 到云存储 → 本地 `audio/` 目录清空 → 主包瘦身通过 4MB 限制 → 权限改为公开可读 → 真机播放正常，淡入淡出 / 静音切换 / 离开主菜单暂停 / 回到主菜单恢复播放位置 全部按预期工作。

**修改文件**：
- `src/audio/AudioManager.ts`（新建）
- `src/core/config.ts`：新增 `CONFIG.audio` 配置组（含 `cloud` 子对象）
- `src/core/state.ts`：新增 `state.audio`（muted / animPhase / iconProgress）
- `src/core/input.ts`：顶部音频开关点击检测
- `src/render/Render.ts`：音频开关按钮绘制（音符旋转 / 斜线屏蔽 / 淡入淡出）
- `game.ts`：启动时调用 `initAudio()`，主循环调用 `updateAudio()`
- `audio/`：本地 MP3 清空（已上传云存储）

**音频格式选型结论**：微信小游戏首选 **MP3**（体积小，~128kbps 约 1MB/分钟，`InnerAudioContext` 原生支持，云存储按流量计费更省）。不建议用 WAV（体积约 10 倍）。

---

## P9 阶段三：SFX 通道 + 入水气泡音效（2026-04-23）

**需求**：
BGM 框架完成后，在 AudioManager 上扩展一条独立的 SFX 通道，用于短促音效触发，首个落地的音效是下潜瞬间的"入水气泡声"，后续撞岩石声/划水声/呼吸声都应复用这一通道。

**核心设计**：

1. **SFX 与 BGM 物理隔离**：SFX 使用独立的 `InnerAudioContext` 数组，不复用 BGM 的上下文，避免相互抢轨
2. **支持快速重播**：SFX 触发时走 `stop() → seek(0) → play()` 三步，保证同一音效可以在短时间内连续触发而不会被互相截断
3. **云存储预拉取**：SFX 音频文件同样放在微信云存储，`initAudio()` 启动时就并行发起 `getTempFileURL` 预热，避免首次触发时因为 URL 未就绪而错过时机
4. **受全局静音开关控制**：顶部音频开关关闭时，SFX 与 BGM 一同静音（音量淡到 0 但保留时间轴含义，这里对 SFX 等效为"跳过播放"）
5. **独立音量参数**：`CONFIG.audio.sfxVolume` 与 BGM 音量解耦，可单独调整
6. **统一入口**：对外只暴露 `playSFX(key: string)` 一个函数，内部根据 key 从 `CONFIG.audio.sfx` 的映射表里查找对应的云 FileID 或本地 path

**首个音效：入水气泡 `diveSplash`**：
- 在 `MazeLogic.startMazeDive()` 被调用的瞬间触发一次 `playSFX('diveSplash')`
- 声音盖在 1.5 秒的入水动效之上，配合水花粒子共同营造下潜反馈
- 云存储 FileID 在 `CONFIG.audio.sfx.diveSplash.fileID` 中配置，支持不可用时降级到本地 `path`

**修改文件**：
- `src/audio/AudioManager.ts`：新增 SFX 通道（独立 `InnerAudioContext` 数组、`_resolveSFXURL()` 预拉取、`playSFX()` 对外接口）
- `src/core/config.ts`：`CONFIG.audio` 新增 `sfxVolume` 和 `sfx` 子映射表
- `src/logic/MazeLogic.ts`：`startMazeDive()` 入口添加 `playSFX('diveSplash')` 调用

**为什么把 SFX 单独拉一条通道，而不是复用 BGM**：
- BGM 是长循环播放，中途被打断会丢失时间轴和情绪连续性
- SFX 是短促多频，需要支持同一时刻多条同时发声、同一条连续快速重触发
- 两者生命周期完全不同，用一个 `InnerAudioContext` 互相切换会频繁打断 BGM
- 独立通道也方便后续单独调整 SFX 音量混音参数，不影响 BGM

**后续扩展方向**：T9.5 呼吸声、T9.6 撞岩石声、T9.7 划水声均可直接复用本通道，只需在 `CONFIG.audio.sfx` 里注册新 key 并在对应逻辑点调用 `playSFX()`。T9.0 AI 生成音效调研、T9.8 独立混音滑条、T9.9 GM 音频 Tab 视后续需要再排期。

---

## 迷宫食人鱼系统（2026-04-18 ~ 2026-04-19）

**需求背景**：
迷宫模式原本只有封闭通道、氧气压力和导航恐惧三类威胁，缺少**主动攻击的动态威胁**。食人鱼系统从主线复用，作为迷宫深处的聚集型危险点出现，让玩家在"是否继续深入"和"是否绕开"之间做选择。

**核心设计**：

1. **聚集点而非均匀分布**：食人鱼不是整张图随机撒点，而是在若干指定的洞袋里聚集 2~6 条，远离出口和出生点，避免玩家刚下潜就遭遇
2. **复用主线 `FishEnemy.ts` AI**：迷宫食人鱼的扑击/怕光/被打/死亡状态机直接复用主线敌鱼逻辑，不另起一套
3. **光锥威慑**：手电筒照射会让食人鱼短暂退避，鼓励玩家用光来探路和开路
4. **玩家攻击可击退/击杀**：复用主线刀攻击系统，配合轮盘交互，玩家可主动清场
5. **聚集点连咬风险**：聚集点同时存在 2~6 条鱼，扑击窗口重叠，玩家被第一口咬到后会立刻有第二条补刀，是迷宫模式最高危的区域类型
6. **迷宫模式独占**：主线和竞技场的敌鱼生成逻辑完全不受影响

**修改/新增文件**：
- `src/logic/MazeLogic.ts`：`resetMazeLogic()` 中根据迷宫结构分析选出若干聚集点，批量调用 `createFishEnemy()`；`updateMaze()` 中调用 `updateAllFishEnemies()` 推进 AI
- `src/core/config.ts`：`CONFIG.maze` 新增食人鱼聚集相关参数（聚集点数量上限、每点鱼数范围、最小距出生点距离等）
- `src/world/map.ts`：迷宫生成阶段返回候选聚集点坐标（深度足够、空间足够大的洞袋）

**关键教训**：
- 聚集点的连咬机制是真正的紧张感来源，但同时也成为"死亡过场卡死"问题的根因（见下一条归档）
- 聚集点位置选择要避开必经路径，否则新手玩家刚下潜就会被团灭

---

## 迷宫模式本地存档（2026-04-23）

**需求背景**：
迷宫模式以多次下潜为核心循环，玩家需要通过多次探索累积地图信息、铺设绳索、发现 NPC。如果每次退出小游戏（或回主菜单）就清空所有进度，这个循环就无法建立长期留存感。

**设计方案（路线 A：简化版 JSON 快照）**：

没有选择 devplan 中 P4"种子 + 增量快照"的复杂方案，原因是 P4 需要先把 `generateMazeMap()` 和 `mazeScene.ts` 全部接入确定性 PRNG，工作量大。路线 A 直接把 `state.mazeRescue` 整个序列化为 JSON 写入微信本地存储，体积约 100~500KB，单 key 写一个存档槽够用，一天内就能落地。

**核心机制**：

1. **只在岸上阶段保存**：水下游戏过程中不保存，避免高频写磁盘和存档半状态问题
2. **三个保存时机**：
   - `resetMazeLogic()` 生成新地图后立即保存一次初始存档（防止没开过下潜就退出导致下次又是新图）
   - `finishMazeDive()` 本次下潜成果写入 `diveHistory` 后保存一次（防止 debrief 页面退出丢失）
   - `returnToShore()` 从 debrief 回到 shore 时再保存一次（以防万一）
3. **读档时机**：`resetMazeLogic()` 开头先调用 `loadMazeProgress()`，读档成功则直接用存档恢复到岸上，跳过新图生成；读档失败（无存档/版本不兼容/数据损坏）才走原来的新图生成路径
4. **单存档**：key 为 `maze_save_v1`，版本号 `1`，版本不同直接丢弃
5. **不加"继续救援"入口**：主菜单点"迷宫纯享版"直接自动读档，玩家无感
6. **清档时机**：救援成功结算页的"下一局"按钮改为调用 `replayMazeLogic()`，它内部先 `clearMazeSave()` 再 `resetMazeLogic()`

**跨平台兼容**：
- 微信小游戏环境用 `wx.setStorageSync` / `getStorageSync` / `removeStorageSync`
- H5 / 非微信环境降级到 `window.localStorage`
- 由 `src/core/SaveStorage.ts` 做统一封装，上层不感知差异

**存档内容**：
- `state.mazeRescue`（整个迷宫运行时状态，含 mazeMap / mazeWalls / mazeExplored / 场景主题 / 下潜历史 / 食人鱼聚集点等）
- `state.rope.ropes`（已铺设的绳索）
- `state.markers`（所有岩石/绳索标记）
- `player.x/y/angle/o2`（岸上其实不重要，但一并保存避免 undefined）

**不保存的内容**：
- 音频静音状态（跨模式持久态，但每次进入迷宫都重新评估）
- GM 面板 CONFIG 修改（调试态，不持久）
- 相机弹簧臂 / 摇曳相位（每次进场重新初始化）
- 入水气泡转场粒子 / UI 折叠动画进度（瞬时动画态，读档后由 `loadMazeProgress()` 强制清零）
- 轮盘交互状态、长按计时（瞬时交互态）

**新增文件**：
- `src/core/SaveStorage.ts`：wx / localStorage 统一封装，暴露 `saveJSON / loadJSON / removeKey` 三个函数
- `src/logic/MazeSave.ts`：迷宫存档主模块，暴露 `saveMazeProgress / loadMazeProgress / clearMazeSave / hasMazeSave` 四个函数，以及 `MAZE_SAVE_KEY / MAZE_SAVE_VERSION` 两个常量

**修改文件**：
- `src/logic/MazeLogic.ts`：`resetMazeLogic()` 开头加读档分支；`finishMazeDive()` / `returnToShore()` 末尾加 `saveMazeProgress()`；`replayMazeLogic()` 改为先 `clearMazeSave()` 再 `resetMazeLogic()`
- `src/core/input.ts`：救援成功结算页"下一局"按钮从 `onMaze()` 改为 `onMazeReplay()`，确保走清档分支

**关键教训**：
- `saveMazeProgress()` 序列化整个 `state.mazeRescue` 时会带上一堆瞬时运行态字段（例如 `_hudEntryTimer`、`divingInBubbles`、`shoreMapOpen`）。这些字段直接随存档写入虽然多占了一点空间，但读档时 `loadMazeProgress()` 会把它们强制清零，不会影响行为
- 因为存档包含完整 `mazeMap` / `mazeWalls`（迷宫数据本身就是个大对象），一次存档约 100~500KB，仍在 wx 单 key 1MB 上限内。未来如果要缩小体积，再切换到 P4 种子方案
- `resetMazeLogic()` 成功读档后的状态必须手动兜底：相机、NPC 运行态、玩家 vx/vy 这些都不在存档里，必须补上初始化，否则会用前一次会话残留的值

---

## 迷宫模式本地存档 v2 压缩升级（2026-04-24）

**问题现象**：
Android 端真机调试，迷宫里退出到主界面再进，**地图还在但标记和下潜记录全部丢失**；控制台报错：

```
[SaveStorage] wx.setStorageSync 失败 key=maze_save_v1
i: APP-SERVICE-SDK:setStorageSync:fail:entry size limit reached
```

**根因**：
- 微信官方标注 `wx.setStorageSync` 单 key 上限 1MB，但 **Android 端实际 ~512KB 左右就会抛 `entry size limit reached`**
- v1 格式直接 `JSON.stringify(state.mazeRescue)`，有几个体积爆炸的热点：
  1. `mazeMap[r][c]`（100×100）存的是 wall 对象引用，JSON 化时每格都展开成完整副本，单这一项 ~300KB
  2. `mazeWalls` 里的基础 wall 还嵌套 `extras` 数组（同 row/col 的装饰圆），同一个额外圆被序列化两次
  3. `diveHistory` 每条记录包含两份 100×100 的 boolean `exploredSnapshot` / `exploredBeforeSnapshot`，JSON 化每份 ~40KB，下潜 3~5 次后累积 ~400KB
- 这三项相加 v1 存档在 2~3 次下潜后就会突破 Android 上限，触发静默写入失败，用户从老存档读回的就是"没标记没下潜记录"的早期版本

**v2 压缩方案**（不改运行时结构，只改存档格式）：

| 原体积大头 | 压缩手段 | 压缩比 |
|---|---|---|
| `mazeMap`（100×100 嵌套 wall 对象） | 不存，运行时从 `mazeWalls + solidMask` 重建 | ~300KB → 0 |
| `mazeWalls.extras` 嵌套 | 存档时展平成普通数组，读档时按 `(row,col)` 聚合，第一个作为基础墙后续挂到 extras | 重复序列化消除 |
| `mazeExplored` + 两份 diveHistory snapshot | 位图 + 手写 base64（10000 boolean → 1250 字节 → base64 ~1.7KB） | 每份 40KB → 1.7KB |
| `sceneThemeMap`（数字二维） | RLE（`v,count,v,count,...`） | 连续大区块压缩比极高 |
| `sceneStructureMap`（字符串枚举 'none'/'stalactite'） | 位图 base64（只有两个取值） | 字符串 → 1 bit/格 |
| `sceneBlendMap`（稀疏 `{theme2,blend}`） | 只存非空格点的扁平 `[r,c,theme2,blendQuant]`，blend 量化 0~255 | 只留过渡带 |
| `playerPath` / 绳索 path | `Math.round` 成 int 扁平数组 `[x,y,x,y,...]` | 去字段名去浮点 |

**实测效果**：单次下潜存档从 v1 的 ~500KB+ 降到 **~374KB**，5 次下潜约 1.8MB（但单 key 不会累积到这么大，因为 `MAX_DIVE_HISTORY=5` 会 FIFO 挤掉老记录，最终稳定在 ~400KB 级别）。

**新增设计要点**：
1. **版本号 + key 同步升级**：`MAZE_SAVE_KEY = 'maze_save_v2'`、`MAZE_SAVE_VERSION = 2`；`clearMazeSave()` 同时 `removeKey('maze_save_v1')` 清理老 key，避免占用存储空间
2. **手写 base64 编解码**：微信小游戏环境 `btoa` 对非 latin1 字符串不友好，统一用 `uint8ToBase64` / `base64ToUint8` 自己实现
3. **`mazeMap` 重建规则**：`mazeWalls` 扁平数组按顺序遍历，第一个出现在某 `(row,col)` 的 wall 作为基础墙（因为 `map.ts` 生成时就是先 push 基础墙再 push 装饰圆），后续同 `(row,col)` 的挂到 `extras`；`solidMask` 位图单独记录哪些格是内部实体墙（值 `2`）
4. **`rest` 兜底字段**：`saveMazeProgress()` 浅拷贝 `state.mazeRescue`，把所有大矩阵字段剔除后剩下的（`diveCount` / `phase` / `discoveredThemes` / `maxDepthReached` 等几十个小字段）统一塞进 `packed.rest`，读档时 spread 回 `maze` 对象。**这意味着 `state.mazeRescue` 新增小字段会自动随存档写入，不需要改 `MazeSave.ts`**
5. **800KB 预警**：`saveMazeProgress` 写入后若序列化长度超过 800KB，`console.warn` 提醒需要继续优化；不会静默丢数据
6. **老档弃档策略**：v1 老存档因版本号不匹配自动丢弃（用户已明确确认"不管旧存档"）

**修改文件**：
- `src/logic/MazeSave.ts`：完整重写，从 179 行扩展到 ~690 行。新增压缩工具函数（位图/RLE/稀疏/路径量化）、`PackedMaze` / `PackedDive` 内部结构、`saveMazeProgress` / `loadMazeProgress` 按新格式打包解包
- `.codebuddy/rules/devplan.md`：P5 里程碑备注更新
- `.codebuddy/rules/code/05-common-tasks-pitfalls.md`：1.9 节更新，补充 v2 压缩后的字段落点、体积指标和未来扩展路径

**调用方零改动**：`hasMazeSave` / `saveMazeProgress` / `loadMazeProgress` / `clearMazeSave` 四个对外函数签名不变，`MazeLogic.ts` 里 7 处调用点全部兼容。

**关键教训**：
- 微信小游戏 Android 端 `wx.setStorageSync` 单 key 上限远低于官方标注的 1MB（实测 ~512KB），且超限时是**抛异常不是返回失败码**，必须 try/catch 才能拿到错误；否则调用方完全感知不到，只会观察到"老存档读回来缺一部分数据"的诡异现象
- 大 boolean 矩阵 + 嵌套对象引用是 JSON 序列化体积炸弹的主要来源，遇到类似结构（迷宫 explored / 覆盖图 / 遮挡图）直接用位图 + base64，压缩比 20~40 倍
- `mazeMap` 这种"既是空间索引又是对象容器"的双重语义结构，存档时应该**只存一侧语义**（位图 / 索引），读档时从另一侧（对象列表）重建引用关系

```

## 更新的代码片段

在归档文件末尾追加一个新章节，记录 P3 呼吸系统本轮完整实现。
```markdown
// ... existing code ...

**关键教训**：
- 微信小游戏 Android 端 `wx.setStorageSync` 单 key 上限远低于官方标注的 1MB（实测 ~512KB），且超限时是**抛异常不是返回失败码**，必须 try/catch 才能拿到错误；否则调用方完全感知不到，只会观察到"老存档读回来缺一部分数据"的诡异现象
- 大 boolean 矩阵 + 嵌套对象引用是 JSON 序列化体积炸弹的主要来源，遇到类似结构（迷宫 explored / 覆盖图 / 遮挡图）直接用位图 + base64，压缩比 20~40 倍
- `mazeMap` 这种"既是空间索引又是对象容器"的双重语义结构，存档时应该**只存一侧语义**（位图 / 索引），读档时从另一侧（对象列表）重建引用关系

## P3 呼吸系统：间歇吐气气泡 + 循环呼吸音（2026-04-28）

**设计目标**：
为潜水员增加**呼吸气泡粒子 + 循环呼吸音**表现，气泡从嘴部真实向上漂浮；呼吸节奏、音量、气泡数量要和运动量关联：静止时低频少量、全速时高频密集；必须是**间歇吐气**（exhale → pause → exhale），不是持续吐气；仅在水下可操作阶段激活，岸上/菜单/过场全部静默。

**关键决策**：

- 呼吸采用**相位机**（`exhale / pause / idle`）而非连续振荡器；每个相位时长由当前运动量 intensity（0~1）决定，相位切换时重新采样。
- 气泡**独立粒子系统**，不混入 `particles` 数组（避免与 silt/bubble 类型判断冲突）；挂在 `BreathSystem` 模块内部运行态，通过 `getBreathBubbles()` 暴露给渲染层。
- 气泡起点精确对应 `RenderDiver` 头部前端（局部坐标 15.8 + 6.5 = 22px），沿身体朝向前向偏移得到世界坐标。
- 气泡物理：真实向上（-Y）浮力 + 侧向正弦摆动 + 半径缓慢变大 1.4~1.9x + 末 30% 生命淡出 + 超出玩家 260px 加速消散 + 180 粒上限保护。
- **气泡绘制必须在光照之前**（`drawDustDarkLayer` 之后、世界 transform `ctx.restore` 之前），这样气泡和岩石/绳索/鱼一样被光照遮罩统一压暗，黑暗区不会发亮。第一版错误地放到了 silt 层（光照之后），被用户指出并修复。
- 音频走**新增的 SFX-Loop 通道**（区别于一次性 SFX 和 BGM）：支持运行时 `setSFXLoopParams({ targetVolume, playbackRate })`，吐气阶段音量拉起（含 attack/release 包络）、停顿阶段降到 0；每帧 `updateSFXLoops()` 线性逼近目标音量。

**运动量映射表**（线性插值，静止 ↔ 全速）：

| 参数 | 静止 | 全速 |
|---|---|---|
| 吐气时长 | 1.0s | 0.7s ~ 1.5s（可调） |
| 停顿时长 | 3.0s | 0.2s ~ 0.8s（可调） |
| 气泡速率 | 5 粒/秒 | 14 粒/秒 |
| 音量峰值 | 0.35 | 0.8 |
| 播放速率 | 0.85 | 1.2 |
| 气泡大小 | 7px | 9px |

**修改文件**：

- `src/logic/BreathSystem.ts`（新建）：呼吸系统核心模块。`updateBreathSystem()` / `getBreathBubbles()` / `resetBreathSystem()` 三个对外接口；内部相位机 + 运动量计算 + 嘴部坐标推导 + 气泡生成与更新 + 音频参数驱动。
- `src/render/RenderBreath.ts`（新建）：世界空间气泡绘制。半透明蓝白主体 + 薄描边 + 左上高光点；视椎剔除；生命末尾淡出。
- `src/audio/AudioManager.ts`：新增 `SFXLoopKey` / `SFXLoopEntry` / `SFX_LOOP_ENTRIES`；新增 `_createSFXLoopContext` / `_resolveAndApplySFXLoopCloudURL` / `_actuallyPlaySFXLoop` / `_updateSFXLoops`；对外导出 `playSFXLoop / stopSFXLoop / setSFXLoopParams / updateSFXLoops` 四个接口。静音时所有 SFX-Loop 目标音量强制 0。
- `src/core/config.ts`：新增 `CONFIG.breath` 配置（27 项参数：运动量、静止/全速双端点、嘴部偏移、浮力、摆动、寿命、视觉、粒子上限等）；`CONFIG.audio.cloud.fileIDs` 新增 `breathLoop` 云存储路径。
- `src/logic/Logic.ts`：主线 `update()` 末尾调用 `updateBreathSystem()`；`resetGameLogic()` 调 `resetBreathSystem()`。
- `src/logic/MazeLogic.ts`：`updateMaze()` 在粒子更新后调用 `updateBreathSystem()`；`startMazeDive()` / `returnToShore()` 调 `resetBreathSystem()`。
- `src/render/Render.ts`：在 `drawDustDarkLayer()` 之后、世界 transform `ctx.restore()` 之前插入 `drawBreathBubblesWorld()` 调用，确保气泡被光照遮罩统一压暗。
- `game.ts`：主循环 `updateAudio()` 之后调用 `updateSFXLoops()`。
- `src/gm/GMConfig.ts`：新增"呼吸"Tab 共 27 项可调参数（enabled 开关 + 运动量 + 静止端点 + 全速端点 + 嘴部 + 物理 + 寿命 + 粒子上限）。
- `ToDo.md`：补充 breathLoop 接入记录。
- `.codebuddy/rules/devplan.md`：P3 总表从"⬜ 未开始"改为"🟡 部分完成"；T3.2/T3.3/T3.4/T3.5 全部打勾。
- `.codebuddy/rules/code/04-render-subsystems.md`：新增 1.6c 呼吸系统章节，"修改渲染时的优先落点"列表追加呼吸条目。
- `.codebuddy/rules/code/05-common-tasks-pitfalls.md`：新增 1.5d 改呼吸系统条目。

**关键教训**：

- **绘制层顺序决定一切**：第一版我把气泡放到了迷宫模式 silt 绘制之后（原 L893），导致黑暗区气泡还是亮的。用户一针见血："气泡也是像场景里的绳子啊岩石啊鱼啊一样是有照明的"。修复方法是把气泡挪到 `drawDustDarkLayer` 之后、世界 transform `ctx.restore` 之前，这是"光照前的最后一层世界物体"标准落点，岩石/绳索/鱼都在这一层。主线与迷宫共用同一个绘制位置，不要再在各自分支重复调用。
- **间歇 vs 连续**：最初版本做成了持续吐气，被用户直接批评"呼吸当然是间歇的吐气"。相位机（exhale→pause）比连续振荡器更符合真实观感，也让运动量映射更有表现力（静止时停顿长、全速时停顿短）。
- **SFX-Loop 与一次性 SFX 应分开设计**：一次性 SFX 触发即播、不做淡入淡出；SFX-Loop 需要常驻循环、运行时调整音量/速率、静音时淡到 0 而非立刻停。两者在 AudioManager 里走独立的 ENTRIES 和更新路径，共用 `CONFIG.audio.sfxVolume` 做上限裁剪。
- **playbackRate 手机端不一定生效**：微信 `InnerAudioContext.playbackRate` 在真机上是只读的；浏览器 HTMLAudioElement 支持。写代码时用 `'playbackRate' in ctx` 兜底，try/catch 忽略失败。用户真机听到的只是音量变化、没有音调变化是正常的。
- **模式切换必须重置**：虽然 `updateBreathSystem()` 内部会判断 `shouldBeActive()` 自动停音频，但气泡粒子还是会继续飘完。显式在 `resetGameLogic()` / `startMazeDive()` / `returnToShore()` 调 `resetBreathSystem()` 清空气泡 + 停音频，避免岸上/菜单看到残留气泡。
- **云存储新资源权限**：新上传的 `BreathBubble.mp3` 必须在云开发控制台把权限改为"所有用户可读"，否则运行时报 `STORAGE_EXCEED_AUTHORITY`（这是项目级通用教训，已在 devplan.md 注意事项里强调过）。

```

请输出合并后完整的代码。
