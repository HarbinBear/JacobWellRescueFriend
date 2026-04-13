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
