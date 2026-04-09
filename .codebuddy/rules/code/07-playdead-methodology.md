---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
# 技术文档分卷 07：Playdead 方法论技术落地稿（P6 / P7 / P8 / 曝光稳定性）

## 本卷用途

本卷用于把设计文档里的"Playdead 方法论在本项目中的表现落地稿"，进一步转成**后续 AI 可以直接照着实施**的技术说明。

它解决的不是"为什么这样设计"，而是：

- 现在代码里相关系统分别落在哪
- 后续改动应该先从哪几处下手
- 各阶段适合新增什么状态、参数和调试开关
- 哪些方案暂时不要做

如果后续任务涉及 `P6`、`P7`、`P8`、自动曝光、迷宫材质响应深化，建议先读本卷，再开始动代码。

---

## 一、现状速记：当前相关系统已经在哪里

### 1.1 `P6` 当前落点：VPL 仍然是离散点上传

当前 VPL 相关核心代码在：

- `src/render/WebGLLight.ts`
  - `MAX_VPL_POINTS`
  - `uploadVPLData(...)`
  - VPL 纹理上传与 uniform 绑定
- `src/core/config.ts`
  - `CONFIG.flashlight.vplBounceBase`
  - `CONFIG.flashlight.vplRadius`
  - `CONFIG.flashlight.vplMaskStrength`
  - `CONFIG.flashlight.vplVolStrength`
- `src/render/shaders/maskFrag.glsl`
- `src/render/shaders/volumetricFrag.glsl`

现状特点：

- CPU 端按射线命中点离散采样
- 每隔若干条射线上传一个点到 VPL 纹理
- shader 端按"点到像素距离"做衰减

因此当前读感更接近"亮点反射"，不是"连续反射面"。

### 1.2 曝光当前落点：`WebGLLight.ts` 的启发式自动曝光

当前后处理和曝光相关核心代码在：

- `src/render/WebGLLight.ts`
  - `_autoExposureValue`
  - `computeExposure(...)`
- `src/core/config.ts`
  - `CONFIG.postProcess.manualExposure`
  - `CONFIG.postProcess.autoExposureMin`
  - `CONFIG.postProcess.autoExposureMax`
  - `CONFIG.postProcess.autoExposureSpeed`
  - `CONFIG.postProcess.autoExposureTarget`
  - `CONFIG.postProcess.toneMappingMode`
- `src/gm/GMConfig.ts`
  - 后处理 Tab 对应参数入口
- `src/render/shaders/maskFrag.glsl`
- `src/render/shaders/volumetricFrag.glsl`

现状特点：

- 自动曝光已经存在
- 但当前平均亮度估算仍偏启发式
- 更像"按手电状态和少量环境因子修正"，还不是"按场景亮度采样驱动"

### 1.3 `P7` 当前落点：相机仍基本只有缩放

当前相机相关核心代码在：

- `src/core/state.ts`
  - `state.camera.zoom`
  - `state.camera.targetZoom`
- `src/logic/Logic.ts`
  - 初始化 `state.camera = { zoom: 1, targetZoom: 1 }`
  - `update()` 内按剧情阶段更新 `targetZoom`
  - 用插值更新 `zoom`
- `src/render/Render.ts`
  - 所有世界层绘制都以 `state.camera.zoom` 为缩放入口
- `src/render/WebGLLight.ts`
  - `u_zoom` uniform 参与世界坐标恢复

现状特点：

- 画面缩放已经是统一相机入口
- 但还没有真实相机位置、速度、弹簧跟随、漂浮偏移等运行态
- 目前玩家基本仍是"固定在屏幕中心附近"

### 1.4 `P8` 当前落点：还没有真正的水下阳光系统

当前和"太阳"最接近的可见实现只出现在：

- `src/render/RenderUI.ts`
  - 岸上界面的太阳绘制

这意味着：

- 浅水区阳光系统仍然基本未开工
- 当前还没有阳光射线、浅水焦散、洞口投光等真正运行态
- 因此 `P8` 不应被误读为"已有半套系统"

---

## 二、推荐总顺序：为什么先做 `P6` 和曝光，再做 `P7`，最后做 `P8`

从当前工程结构看，最合理的顺序是：

1. **先做 `P6`：VPL 连续反射面**
2. **同步把曝光改到更接近场景亮度驱动**
3. **再做 `P7`：相机弹簧臂 + 水中轻微摇曳**
4. **最后再做 `P8`：浅水区阳光系统**

理由：

- `P6` 和曝光都属于现有光照链的深化，风险最低、收益最直接
- `P7` 会影响全局读感，必须建立在画面亮度语言已经更稳定的基础上
- `P8` 是新增大层，太早做容易把画面主次搞乱

---

## 三、`P6` 实施稿：把 VPL 从点改成连续反射面

### 3.1 第一阶段目标

第一阶段不要追求复杂多边形发光面，只做最稳的升级：

- 仍然保留 CPU 端离散采样
- 但在上传前把相邻采样点聚合成**线段或胶囊段**
- shader 端按"线段到像素距离"而不是"点到像素距离"做衰减

这样能以最小架构改动，把读感从"点"拉向"连续边缘"。

### 3.2 推荐新增的数据形态

优先新增"反射段"而不是直接替换整个光照多边形语义。

建议在 CPU 端形成类似概念：

- `vplSegments`
  - `x1, y1`
  - `x2, y2`
  - `brightness`
  - `alpha`
  - `wallColorBrightness`
  - `wallGroupId` 或等价断裂依据

第一版不要求真的创建独立 TypeScript 类型文件，但语义上要先按"段"思考。

### 3.3 推荐改动落点

- `src/render/WebGLLight.ts`
  - 保留 `uploadVPLData(...)` 作为入口
  - 但内部拆成两步：
    1. 生成候选点
    2. 连接为段并上传
- `src/render/RenderLight.ts`
  - 如果需要补法线方向、命中连续性或墙体归属判断，可在这里补辅助信息
- `src/render/shaders/maskFrag.glsl`
- `src/render/shaders/volumetricFrag.glsl`
  - 新增"线段距离衰减"函数
  - 用段宽代替当前纯点半径

### 3.4 第一版的连接规则建议

为了避免不同岩石之间错误连线，第一版只允许在下列条件同时满足时连接：

- 射线索引相邻或很接近
- 两点距离不超过阈值
- 亮度差不超过阈值
- 墙体归属一致，或至少法线方向接近

如果拿不到稳定的墙体归属，就先用更保守的断裂规则，不要贪连续。

### 3.5 第一版的参数建议

建议新增一组独立参数，不要硬复用当前点 VPL 半径语义：

- `flashlight.vplSegmentGapMax`
- `flashlight.vplSegmentWidth`
- `flashlight.vplSegmentFade`
- `flashlight.vplSegmentMinDot`

并在 `GMConfig.ts` 中新增对应调参入口。

### 3.6 第一版验收标准

达到下面标准即可算第一阶段完成：

- 玩家扫过岩壁时，返光更像边缘回光而不是亮点簇
- 不同岩石之间不会明显错误连线
- 手机端帧时间没有明显恶化
- 关闭新连接逻辑后，能明确看出画面退回旧版"点反光"

---

## 四、曝光稳定性实施稿：从启发式修正走向场景亮度驱动

### 4.1 第一阶段目标

第一阶段不要上复杂直方图或完整曝光缓冲链，只做：

- 低分辨率亮度采样
- 慢速平滑追踪
- 限制更新频率

这样可以最大化收益 / 复杂度比。

### 4.2 推荐实现方式

建议保留 `computeExposure(...)` 这个入口，但把内部数据来源升级为：

1. 从当前光照合成结果或可替代的亮度代理中估算一个低分辨率平均亮度
2. 每隔 `N` 帧更新一次目标曝光
3. 用现有 `_autoExposureValue` 继续做缓动

其中 `N` 建议先取 4 或 6，不要每帧重新做所有采样。

### 4.3 推荐改动落点

- `src/render/WebGLLight.ts`
  - 扩展 `_lastFrameAvgLight` 的来源
  - 给 `computeExposure(...)` 增加更明确的采样链路
- `src/core/config.ts`
  - 新增采样网格大小、采样间隔、亮度权重等参数
- `src/gm/GMConfig.ts`
  - 后处理 Tab 增加新参数入口

如果第一版需要更保守，也可以先用 CPU 端已有多边形、环境光和 VPL 数量构造"更像场景亮度"的代理量，而不是一开始就真正读取 framebuffer。

### 4.4 推荐新增参数

建议新增：

- `postProcess.autoExposureSampleCols`
- `postProcess.autoExposureSampleRows`
- `postProcess.autoExposureUpdateInterval`
- `postProcess.autoExposureDarkBias`
- `postProcess.autoExposureBrightClamp`

这些参数的作用是让后续 AI 能把"亮度感知"与"适应速度"分开调。

### 4.5 第一版验收标准

- 从入口浅区进入深洞时，亮度变化更像逐步适应
- 灯坏、恐怖事件、灰物体事件时，曝光不会突然跳闪
- 手电开关对画面仍有响应，但不再像单纯开关补偿
- 快速移动时，画面不会出现明显亮度抽动

---

## 五、`P7` 实施稿：相机弹簧臂 + 水中轻微摇曳

### 5.1 推荐总原则

`P7` 的重点不是让相机更"有动作"，而是让相机更像"人在水里看出去的身体延伸"。

因此第一版必须遵守：

- 小幅度
- 低频
- 可关闭
- 不改变玩家对真实位置和碰撞的判断

### 5.2 推荐新增状态

优先在 `src/core/state.ts` 的 `camera` 下扩展，而不是另起一套平行状态：

- `x`
- `y`
- `targetX`
- `targetY`
- `vx`
- `vy`
- `swayX`
- `swayY`
- 保留 `zoom`
- 保留 `targetZoom`

这样后续所有世界层都仍然只认一个相机状态源。

### 5.3 推荐新增配置

在 `src/core/config.ts` 中新增独立 `camera` 配置组：

- `followStiffness`
- `followDamping`
- `lookAheadDistance`
- `lookAheadVelocityScale`
- `swayAmplitude`
- `swayFrequencyA`
- `swayFrequencyB`
- `resetSnapSpeed`

如果第一版只做最小闭环，也至少要有：

- 跟随刚度
- 阻尼
- 摇曳幅度
- 摇曳频率

### 5.4 推荐逻辑落点

- `src/logic/Logic.ts`
  - 在现有相机 zoom 更新附近，补相机目标位置与实际位置更新
  - 模式切换与重置路径里同步初始化相机新状态
- `resetGameLogic()`
- `resetArenaLogic()`
- `resetMazeLogic()`
  - 都要显式重置相机新增字段

### 5.5 推荐渲染改动落点

- `src/render/Render.ts`
  - 当前大量位置换算默认基于"玩家在中心"
  - `P7` 后需要逐步改成"世界坐标相对相机位置"
- `src/render/WebGLLight.ts`
  - `u_playerPos` 与世界坐标恢复链路要确认是否继续代表玩家，还是需要同时引入相机偏移
- `src/core/input.ts`
  - 若存在点击 NPC、按钮或世界投影计算，需确认仍以玩家为锚还是改为相机为锚

第一阶段建议先做最小侵入式版本：

- 逻辑上维护 `camera.x / y`
- 渲染上只把屏幕中心锚点从 `player.x / y` 改到 `camera.x / y`
- 玩家仍旧是主要跟随目标

### 5.6 第一版验收标准

- 玩家移动和掉头时，相机有轻微迟滞，但不会拖沓
- 停止输入后，相机能自然收敛，不继续漂移
- 轻微摇曳能被感觉到，但不影响路径判断
- 手动挡操作不会因为相机偏移而变难判断

---

## 六、`P8` 实施稿：浅水区阳光系统

### 6.1 当前判断

由于现状基本没有真正的浅水阳光链路，所以 `P8` 应视为新系统，而不是修旧系统。

因此必须控制第一版范围：

- 先有方向语义明确的洞口投光
- 再加浅层焦散感
- 最后再考虑与 VPL / 曝光 / 体积光深度混合

### 6.2 推荐第一阶段目标

第一阶段只做三件事：

1. 定义太阳 / 洞口光源在世界中的语义位置
2. 复用一部分现有射线遮挡能力，得到基础照亮区域
3. 在浅水区域加入很弱的动态焦散投影

不要一开始就把它做成第二套完整手电系统。

### 6.3 推荐改动落点

- `src/core/config.ts`
  - 新增 `sunlight` 或 `shallowLight` 配置组
- `src/render/RenderLight.ts`
  - 复用射线与遮挡查询能力
- `src/render/WebGLLight.ts`
  - 在已有 uniform 体系中增加阳光层参数
- `src/render/shaders/maskFrag.glsl`
- `src/render/shaders/volumetricFrag.glsl`
  - 新增浅水区阳光与焦散混合
- `src/gm/GMConfig.ts`
  - 新增调参项

### 6.4 推荐新增参数

建议第一版至少包含：

- `sunlight.worldX`
- `sunlight.worldY`
- `sunlight.range`
- `sunlight.intensity`
- `sunlight.causticStrength`
- `sunlight.causticScale`
- `sunlight.causticSpeed`
- `sunlight.depthFadeStart`
- `sunlight.depthFadeEnd`

### 6.5 第一版验收标准

- 玩家靠近入口浅水区时，能明显感知"这是有外界光源的区域"
- 焦散存在感应很弱，只负责增加空间层次，不抢手电主导权
- 进入深区后阳光自然消退，不残留到深洞主体验里
- 阳光和手电叠加时不会让画面整体发灰或过曝

---

## 七、材质响应主题深化稿：迷宫下一步该怎么继续做

当前迷宫已经有：

- 主岩性层
- 局部构造层
- 场景取色与过渡混合

下一步最推荐的不是先加更多新主题，而是把主题继续深化成**材质响应主题**。

### 7.1 推荐新增主题参数

建议优先收进 `src/world/mazeScene.ts` 或配置层的，不是单纯颜色，而是：

- `reflectStrength`（反光强度）
- `reflectWidth`（反光宽度）
- `edgeContrast`（边缘对比度）
- `scatterBoost`（散射增强）
- `siltAbsorb`（泥沙吸收系数）
- `ambientLift`（环境光抬升）

这样后续：

- `RenderMazeScene.ts` 可据此调墙体和内壁
- `RenderLight.ts` 可据此调局部光感
- `DustMotes.ts` 或粒子系统可据此调颗粒反应

---

## 八、统一调试与验收建议

### 8.1 GM 参数入口必须同步补全

只要本节涉及的新系统开始落地，就必须同步给 `GMConfig.ts` 补参数入口。

否则后续 AI 会陷入：

- 只能反复改默认值
- 不能快速对比不同强度
- 很难做真机收口

### 8.2 建议补一组表现调试信息

后续如果开始实施 `P6` / `P7` / `P8`，建议视情况补以下 debug 信息：

- 当前 VPL 点数 / 段数
- 当前曝光值 / 目标曝光值
- 当前相机位置 / 目标位置 / 摇曳偏移
- 当前浅水阳光强度或是否进入浅水层

这些信息可先放在调试绘制层，不必一开始就做复杂面板。

### 8.3 每阶段完成后都要跑类型检查

本节涉及的改动会触及：

- 状态结构
- 配置结构
- GM 参数路径
- 渲染参数传递

因此每一阶段完成后都应执行：

- `npm run typecheck`

### 8.4 当前明确不建议的技术路线

后续 AI 在实现本节内容时，默认不要选下面这些方案：

- 完整 TAA 或重型时间重投影
- 重型 PBR / 延迟渲染
- 新增大量实时光源并把手电、阳光、环境光完全拆成并行复杂系统
- 让相机大幅漂移或高频摇晃
- 用高强度焦散、大片 bloom 或强色散来抢画面主次

---

## 九、本节最重要的结论

- **`P6` 的实质是把 VPL 从"离散点"升级成"连续反射段"，第一版优先做线段 / 胶囊段方案。**
- **自动曝光应继续保留 `computeExposure(...)` 入口，但内部逐步升级为低分辨率场景亮度驱动。**
- **`P7` 应在 `state.camera` 内扩展真实位置和摇曳运行态，而不是另起一套平行相机系统。**
- **`P8` 当前基本还是新系统，第一版重点是洞口方向光和弱焦散，不要一上来做成第二套重型光照体系。**
- **后续实现顺序推荐：`P6` → 曝光稳定性 → `P7` → 材质响应深化 → `P8`。**