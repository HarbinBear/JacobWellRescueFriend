// 玩法相关子系统：标记 / 氧气瓶 / 呼吸 / 撞击反馈 / 玩家攻击 / 生命探知仪

export const gameplayConfig = {
    // ===== 标记系统配置 =====
    marker: {
        // 交互按钮（轮盘触发器）
        btnRadius: 36,              // 交互按钮半径
        btnXRatio: 0.92,            // 按钮X位置比例（右下角，getWheelBtnPos会自动clamp保证轮盘完整显示）
        btnYRatio: 0.88,            // 按钮Y位置比例（右下角）
        // 轮盘
        wheelOuterRadius: 100,      // 轮盘外径
        wheelInnerRadius: 24,       // 轮盘内径（死区，松手取消）
        wheelExpandDuration: 150,   // 轮盘展开动画时长（ms）
        wheelCollapseDuration: 100, // 轮盘收起动画时长（ms）
        // 标记尺寸
        wallSignWidth: 18,          // 岩石标记牌面宽度
        wallSignHeight: 14,         // 岩石标记牌面高度
        wallStakeLength: 10,        // 岩石标记短杆长度
        ropeTagWidth: 14,           // 绳索标记标签宽度
        ropeTagHeight: 11,          // 绳索标记标签高度
        ropeTagStrapLength: 5,      // 绳索标记绑带长度
        // 标记动画
        placeAnimDuration: 20,      // 放置动画帧数
        removeAnimDuration: 15,     // 拆除动画帧数
        // 标记颜色
        dangerColor: 'rgba(180, 40, 40, 0.9)',      // 红叉牌面底色
        dangerBorder: 'rgba(255, 80, 80, 0.6)',      // 红叉边框
        dangerStake: 'rgba(150, 50, 50, 0.8)',       // 红叉短杆
        unknownColor: 'rgba(180, 150, 40, 0.9)',     // 黄问号牌面底色
        unknownBorder: 'rgba(255, 220, 80, 0.6)',    // 黄问号边框
        unknownStake: 'rgba(150, 130, 50, 0.8)',     // 黄问号短杆
        safeColor: 'rgba(40, 150, 80, 0.9)',         // 绿圈牌面底色
        safeBorder: 'rgba(80, 255, 150, 0.6)',       // 绿圈边框
        safeStake: 'rgba(50, 130, 80, 0.8)',         // 绿圈短杆
        // 标记摆动
        ropeTagSwaySpeed: 1.5,      // 绳索标记摆动速度
        ropeTagSwayAmplitude: 0.15, // 绳索标记摆动幅度（弧度）
    },

    // ===== 氧气瓶配置（迷宫模式，跨下潜持久，同 seed 已消耗不再刷新） =====
    oxygenTank: {
        // 生成：聚集点附近（主要来源）
        denCountMin: 2,                 // 每个食人鱼聚落内最少刷几个
        denCountMax: 4,                 // 每个食人鱼聚落内最多刷几个
        denSearchRadiusRatio: 0.85,     // 聚落半径内搜索岩石的比例

        // 生成：全图散落（次要来源，给非战斗路线补给）
        scatterCountMin: 3,             // 聚落外全图最少散落几个
        scatterCountMax: 6,             // 聚落外全图最多散落几个

        // 距离约束
        minDistBetween: 300,            // 任意两个氧气瓶之间的最小距离（像素）
        minDistToSpawn: 600,            // 离玩家出生点的最小距离（像素）

        // 单瓶补给量
        amountMin: 25,                  // 最低补充氧气百分点
        amountMax: 35,                  // 最高补充氧气百分点

        // 交互
        pickRange: 90,                  // 进入多近可开始安装（像素）
        installDuration: 1.2,           // 按住多少秒完成安装

        // 视觉
        bodyScale: 1,                   // 瓶体缩放
        breathSpeed: 0.05,              // 呼吸发光推进速度（弧度/帧）
    },

    // ===== 呼吸系统（潜水员吐气气泡 + 呼吸音）=====
    // 运行规则：
    // - 呼吸是间歇的：吐气（exhale）→ 停顿（pause）→ 吐气 → 停顿 ...（不是一直吐）
    // - 运动量越大：吐气越频繁 / 停顿越短 / 气泡数量越多 / 音量越大 / 播放速率略快
    // - 气泡从潜水员嘴部位置喷出，随时间真实向上浮（-Y），带侧向摆动 + 变大 + 淡出
    // - 仅在水下可操作阶段激活（迷宫 play / 主线 play），其他阶段静默
    breath: {
        enabled: true,                  // 总开关
        // 运动量参考：当前速度除以此值得到 intensity（0~1）
        refSpeed: 4.0,                  // 约对应手动挡满速
        intensitySmooth: 0.08,          // 运动量平滑系数（每帧向目标逼近）

        // 静止（intensity=0）下的四相时长（秒）
        //   放松态：呼吸慢而深，肺偏满（holdFull 最长 —— 常态下肺偏放松满态）
        exhaleDurationStatic: 2.2,      // 吐气时长
        holdEmptyDurationStatic: 0.9,   // 吐完保持（肺空）
        inhaleDurationStatic: 1.9,      // 吸气时长
        holdFullDurationStatic: 0.6,    // 吸完保持（肺满）—— 默认态最长
        bubbleRateStatic: 5,            // 吐气阶段气泡生成速率（粒/秒）
        volumeStatic: 0.35,             // 峰值音量（0~1,将被 sfxVolume 上限裁剪）
        playbackRateStatic: 0.85,       // 播放速率（0.5~2.0）
        bubbleSizeStatic: 7,            // 基础气泡半径（像素）

        // 全速（intensity=1）下的四相时长（秒）
        //   急促态：几乎连续呼吸，holdEmpty / holdFull 几乎为 0
        exhaleDurationPeak: 0.5,
        holdEmptyDurationPeak: 0.05,
        inhaleDurationPeak: 0.4,
        holdFullDurationPeak: 0.1,
        bubbleRatePeak: 14,
        volumePeak: 0.8,
        playbackRatePeak: 1.2,
        bubbleSizePeak: 9,

        // ---- 兼容字段（老代码可能还读 pauseDuration*,保留以防回退）----
        //   pauseDuration 语义等价于 holdEmptyDuration（旧两相位机"吐气→停顿"中的停顿）
        pauseDurationStatic: 3.0,
        pauseDurationPeak: 0.8,
        // 嘴部位置：沿身体朝向前方偏移（像素，RenderDiver 头部直径约 13，取 22 是嘴部前端）
        mouthOffsetForward: 22,
        spawnJitter: 2,                 // 生成位置随机抖动半径（像素）

        // 气泡物理
        buoyancyMin: 0.9,               // 向上速度下限（像素/帧）
        buoyancyMax: 1.6,               // 向上速度上限
        sideInitSpeed: 0.4,             // 侧向初速度幅度
        wobbleFreqMin: 0.06,            // 侧向摆动频率（弧度/帧）
        wobbleFreqMax: 0.12,
        wobbleAmpMin: 0.15,             // 侧向摆动幅度（像素/帧）
        wobbleAmpMax: 0.35,

        // 寿命与消散
        lifeMinSec: 2.5,                // 单个气泡最短寿命（秒）
        lifeMaxSec: 5,                // 单个气泡最长寿命（秒）
        despawnUpDist: 260,             // 上升超过玩家这么远就加速淡出（避免远处残留）

        // 粒子上限（避免极端情况下无限堆积）
        maxBubbles: 180,

        // 视觉
        colorCore: 'rgba(220, 245, 255, 0.95)',   // 气泡高光色
        colorBody: 'rgba(180, 220, 240, 0.55)',   // 气泡主体色
        outlineAlpha: 0.45,              // 边缘描边透明度

        // ========== 呼吸急促度（breathRate 三分量）==========
        // 总急促度 = baseline + movement*moveCoef + impact*impactCoef，clamp 到 [0,1]
        // breathRate 同时决定：四相时长整体缩短（吐气变急）、每口吐气耗氧量增加、浮力波幅增强
        rateBaseline: 0.0,               // 静止基线
        rateMoveCoef: 1.0,               // 运动分量系数（= 归一化速度 × 此值）
        rateImpactCoef: 1.0,             // 撞击分量系数
        rateRise: 0.15,                  // movement 上升速率（每帧向目标逼近）
        rateFall: 0.02,                  // movement 下降速率（静止后慢慢平复，约 3s 降一半）
        impactRecoverPerSec: 0.25,       // 撞击急促度每秒线性衰减（0.8 → 约 3.2s 平复）

        // ========== 阶梯式氧气消耗（每次 exhale → holdEmpty 切换瞬间扣一口）==========
        o2PerBreathStatic: 0.4,          // 静止时每口吐气扣氧（%）
        o2PerBreathPeak: 2.0,            // 全速时每口吐气扣氧（%）
        o2IdleDrain: 0.005,              // 呼吸系统未激活时的兜底恒量扣减（每帧 %）

        // ========== 呼吸浮力（加速度模型，叠加到 player.vy）==========
        // 肺空（lungVolume=0）→ 向下加速度（+Y）
        // 肺满（lungVolume=1）→ 向上加速度（-Y）
        // 每帧加速度 = buoyancyStrength × (1 + breathRate × buoyancyRateCoef) × (1 - 2*lungVolume)
        // 配合 waterDrag 衰减后实际位移峰值约 ±2~3 像素，身体起伏晚半拍跟上呼吸
        buoyancyEnabled: true,           // 浮力总开关
        buoyancyStrength: 0.02,          // 每帧加速度峰值（像素/帧²）
        buoyancyRateCoef: 0.6,           // 急促度加成系数（breathRate=1 时额外 +60%）
        buoyancyIndicatorEnabled: false, // 潜水员脚下浮力方向箭头（debug,默认关）

        // ---- 兼容字段（老代码若读 pressure* / buoyancyAmp，回退到这里）----
        pressureBaseline: 0.0,
        pressureMoveCoef: 1.0,
        pressureImpactCoef: 1.0,
        pressureRise: 0.15,
        pressureFall: 0.02,
        buoyancyAmp: 0.08,               // 等价于 buoyancyStrength
        buoyancyPressureCoef: 0.6,       // 等价于 buoyancyRateCoef

        // ========== 肺图标动画 ==========
        lungScaleIdle: 1.0,              // 待机时肺的基础缩放
        lungScaleInhale: 1.15,           // 吸气阶段（= BreathSystem 的 pause）峰值缩放
        lungScaleExhale: 0.85,           // 吐气阶段（= BreathSystem 的 exhale）峰值缩放
        lungColorHealthy: 'rgba(240,140,150,1)',   // 氧气充足（> 50%）
        lungColorMid: 'rgba(210,120,150,1)',       // 氧气中等（25~50%）
        lungColorLow: 'rgba(150,100,130,1)',       // 氧气低（10~25%）
        lungColorCritical: 'rgba(120,140,160,1)',  // 氧气濒死（< 10%）

        // ========== 氧气环放大 ==========
        oxygenRingSizeMul: 1.5,          // 氧气环相对其他 HUD 图标的尺寸倍数
    },

    // ===== 撞击岩石反馈系统 =====
    // 运行规则（全线性映射，不分档）：
    // - 碰撞瞬间读取撞击前的速度 |v|；若 |v| >= speedThreshold 判定为"撞"（低速擦蹭不算）
    // - 强度 strength = clamp((|v| - speedThreshold) / speedRange, 0, 1)
    // - 所有表现参数按 strength 线性插值到 Peak（音量、播放速率、气泡数、氧气损失）
    // - 同一次撞击 cooldownMs 内不重复触发
    collisionImpact: {
        enabled: true,
        speedThreshold: 2.0,            // 触发阈值：撞击瞬间 |v| 小于此值视为擦蹭，不触发
        speedRange: 5.0,                // 强度映射范围：(|v| - threshold) / range 作为 0~1 强度
        cooldownMs: 400,                // 同一次撞击冷却（毫秒）

        // 音效（复用 breathLoop 作一次性 SFX）
        // 比呼吸音更闷更重：playbackRate 降到 0.55~0.75 区间（呼吸是 0.85~1.2）
        volumeMin: 0.5,                 // 最小强度对应音量
        volumeMax: 1.0,                 // 最大强度对应音量
        playbackRateMin: 0.75,          // 轻撞播放速率（比呼吸稍快，仍显钝重）
        playbackRateMax: 0.55,          // 重撞播放速率（更低沉更重）

        // 气泡（接入 BreathSystem.spawnImpactBurst；和呼吸气泡同渲染管线但数量/大小/寿命不同）
        impactBubbleCountMin: 5,       // 轻撞气泡数（比呼吸一次吐气 5~14 粒多很多）
        impactBubbleCountMax: 20,      // 重撞气泡数（明显爆发感）
        impactBubbleSizeMul: 1.6,       // 气泡半径相对呼吸气泡的倍数（更大）
        impactBubbleSpreadSpeed: 2.4,   // 撞击点向外散射的初速度（像素/帧）
        impactBubbleLifeMul: 0.55,      // 寿命相对呼吸气泡的倍数（更短，爆发式消散）

        // 氧气损失
        o2LossMin: 0.8,                 // 轻撞氧气损失（%）
        o2LossMax: 4.5,                 // 重撞氧气损失（%）
    },

    // ===== 生命探知仪（迷宫模式未发现 NPC 时，以盖革式"嘀嘀"提示距离）=====
    // 玩家身上携带一个声纳仪器，检测到 NPC 在探知范围内就开始播放两音节拍（#D + F）
    // 越靠近 NPC，两音组之间的间隔越短，同时 HUD 脉冲点与角色 LED 闪烁越快
    // npcFound 或 npcRescued 后自动关闭
    lifeDetector: {
        enabled: true,              // 总开关
        // 探知范围（以 npcRescueRange 为基准的倍数；外圈=静默，内圈=最快节奏）
        rangeMultiplier: 50,         // 最大探知半径 = npcRescueRange × 此值（默认 80 × 4 = 320 像素 ——见下：实际是 320 再乘）
        // 注意：上面 rangeMultiplier 实际解释为"以 npcRescueRange 为最内圈强度=1，乘 rangeMultiplier 得到最外圈强度=0"
        // 节奏
        gapMaxMs: 3000,             // 最远处两组"嘀嘀"之间的间隔（ms）
        gapMinMs: 80,               // 最近处两组"嘀嘀"之间的间隔（ms，几乎连成一片）
        // 一组内 #D 与 F 之间的间隔也需要渐进：远时两音间隔大（更像独立的双音），近时间隔小（更紧凑）
        beepIntervalMaxMs: 150,     // 远处两音间隔（ms）
        beepIntervalMinMs: 80,      // 近处两音间隔（ms）
        curvePower: 0.6,            // 节奏强度曲线指数（<1=远处变化慢、近处变化快；=1=线性）
        // 音频参数
        freqLow: 622.25,            // #D5 频率 (Hz)
        freqHigh: 698.46,           // F5 频率 (Hz)
        beepDuration: 0.12,         // 单音时长（秒）
        volume: 0.28,               // 峰值音量 (0~1)
        // HUD 视觉（右上角脉冲雷达点）
        hudVisible: true,
        hudXFromRight: 36,          // HUD 雷达点距右边距（像素）
        hudY: 48,                   // HUD 雷达点 Y 坐标
        hudBaseRadius: 6,           // 静态基础半径
        hudPulseRadius: 14,         // 脉冲峰值半径
        hudColorIdle: 'rgba(120,200,220,0.55)',    // 静态基础色（探知激活但未脉冲时）
        hudColorPulse: 'rgba(180,255,230,1.0)',    // 脉冲峰值色
        hudRingColor: 'rgba(60,120,140,0.8)',      // 外框圈色
        // 角色身上 LED 闪光
        ledOnDiver: true,
        ledRadiusBase: 2,           // LED 基础大小
        ledRadiusPulse: 5,          // 脉冲峰值大小
        ledColorIdle: 'rgba(120,200,220,0.5)',
        ledColorPulse: 'rgba(200,255,240,1.0)',
    },

    // ===== 玩家攻击（挥氧气瓶）配置 =====
    attack: {
        // 攻击范围
        range: 90,                  // 攻击距离（像素），可调
        angle: 120,                 // 攻击扇形角度（度），可调

        // 攻击 CD
        cooldown: 180,              // 攻击冷却帧数（3s @ 60fps）

        // 刀光动画
        slashDuration: 28,          // 刀光总持续帧数（含停留）
        slashSwingDuration: 12,     // 刀光挥动阶段帧数（加速减速）
        slashLingerDuration: 16,    // 刀光停留消散阶段帧数
        slashArcCount: 6,           // 弧形刀光层数
        slashImpactShake: 12,       // 击中时屏幕震动强度

        // 按钮位置（屏幕右下角，与布线按钮错开）
        btnRadius: 38,              // 攻击按钮半径
        btnXRatio: 0.82,            // 按钮X位置比例
        btnYRatio: 0.88,            // 按钮Y位置比例（比布线按钮更靠下，避免重叠）
    },

    // ===== 场景图鉴物件（迷宫模式，跨下潜持久，同 seed 确定性生成） =====
    // 规则：
    // - 全部静态视觉，绝对不可交互（不显示轮盘按钮、不发光、不呼吸）
    // - 玩家用手电光锥照到并靠近即算"发现"，不需要任何操作
    // - 已发现数跨下潜累计，结算页显示"本次发现"，岸上显示图鉴进度
    relic: {
        // 生成
        totalCount: 15,               // 每张迷宫生成物件总数
        onWallRatio: 0.5,             // 贴墙占比（0~1），其余散落在岩石附近通路上
        minDistBetween: 220,          // 两两之间最小距离（像素）
        minDistToSpawn: 400,          // 离出生点最小距离（像素）

        // 发现判定
        discoverRadius: 110,          // 发现半径（像素）
        discoverFovDeg: 60,           // 发现角度（度，玩家手电光锥内）
    },

    // ===== 撤离玩法（迷宫模式经济循环：水下捡战利品 → 撤离 → 卖货 → 升级装备） =====
    // 详见 .codebuddy/rules/design/extraction/
    extraction: {
        enabled: true,                  // 主开关：关闭后所有撤离 UI 隐藏，迷宫模式回退现状
        pickupRange: 180,               // 玩家拾取战利品的距离（像素）
        debugPickupOverlay: false,      // 调试可视化：拾取范围圆圈 + Relic 距离标签（GM 面板可开关）
    },

    // ===== 减压停留系统（Decompression System） =====
    //
    // 设计灵感：Bühlmann ZH-L16 简化版（单隔室近似）。
    //   - 玩家在深水区（>ingestDepth）吸氮 → nitrogenLoad 随时间累积
    //   - 上浮到浅水区（<releaseDepth）后排氮 → 数值下降
    //   - nitrogenLoad 超过阈值：出水前必须在 12/9/6/3m 四档停留窗口逐段停足时间
    //   - 停留窗口：处于目标深度 ±tolerance 且 |vy| < speedMax，累计 holdSec 秒完成该档
    //   - 未完成减压就触达水面：记 DCS 惩罚（O2 上限 -30% + 战利品折扣 + 可能附加 debuff）
    //
    // 为什么只做单值 nitrogenLoad 而不是 16 隔室：
    //   - 游戏需要的是"有感且可教学"的节奏，不是医学级精度
    //   - 单值配合 4 档停留已经足够制造"从底部一路慢慢停回水面"的感受
    //
    // 玩家入口：HUD 左上角"减压灯"图标（绿=免减压 / 黄=接近 / 红=必须减压 / 蓝绿环=正在停留）
    //   短按：弹 tip 显示氮负荷 %、下一个停留档深度、剩余时间
    //   长按：在正确深度停留时，时间流速 ×speedUpMul，但氧气消耗 ×speedUpO2Mul
    deco: {
        enabled: true,                   // 系统总开关

        // ---- 氮气吸排速率 ----
        // 每秒吸氮量 = ingestRatePerSec × max(0, depth - ingestDepth)
        // depth 单位：米；nitrogenLoad 目标范围 [0, 1.5+]
        // 数值选择：20m→1.0 需要约 (1.0 / (0.0028 × 10)) = 36 秒。即在 30m 泡 36s 就进红区
        ingestDepth: 20,                 // 米：深于此值开始累积氮（真实潜水是 10m，但游戏用 20m 放过早期浅关）
        ingestRatePerSec: 0.0028,        // 每秒吸氮 = 系数 × (深度 - 阈值)，在 30m 约 +0.028/s
        // 浅水排氮：depth < releaseDepth 时 nitrogenLoad -= releaseRatePerSec × dt
        releaseDepth: 10,                // 浅于此深度开始排氮
        releaseRatePerSec: 0.06,         // 静止排氮约 16 秒清空 1.0 的负荷
        // 超深惩罚：深度 > maxDepthAllowed（装备极限）时，吸氮系数再乘以此倍率
        overDepthRateMul: 2.0,

        // ---- 阈值（决定减压灯颜色） ----
        thresholdGreen: 0.6,             // < 0.6：免减压（绿灯）
        thresholdYellow: 1.0,            // 0.6~1.0：黄灯，建议减压
        thresholdRed: 1.3,               // 1.0~1.3：红灯，强制减压
        thresholdCritical: 1.5,          // > 1.3：深红闪烁，DCS 严重级

        // ---- 减压停留四档（从深到浅顺序执行）----
        // 每档：目标深度 ± tolerance 米、玩家垂直速度 |vy| < speedMax、持续 holdSec 秒 = 完成
        // 完成一档后 nitrogenLoad -= reduce[i]，减压灯进入下一档
        // 数值：12/9/6/3m 分别停 3/5/8/12 秒，合计 28s 可做完最深档减压（对应现实约 28min 的重度 deco）
        stopDepths: [12, 9, 6, 3],       // 四档目标深度（米）
        stopHoldSec: [3, 5, 8, 12],      // 每档需要停留的秒数
        stopReduce: [0.3, 0.35, 0.4, 0.45], // 每档完成减少的氮负荷（累计 1.5，能把深红清零）
        depthTolerance: 1.5,             // 允许偏离目标深度的米数（上下 1.5m 都算"在档内"）
        holdSpeedMax: 0.8,               // 判定"静止"的 |vy| 上限（像素/帧；moveSpeed=17 所以 0.8 很严格）

        // ---- 起步减压档位：nitrogenLoad 多高以上，要从第几档开始？----
        // 索引表达"nitrogenLoad < 阈值时从第 N 档开始"，深红从 12m 起；
        // 黄灯（>=0.6 && <1.0）实质上只需要做 3m 一档（= "安全停留"），
        // 红灯（>=1.0 && <1.3）做 6m+3m；
        // 深红（>=1.3）做 9m+6m+3m；
        // critical（>=1.5）做 12/9/6/3m 全四档
        // 取值：[thresholdGreen, thresholdYellow, thresholdRed, thresholdCritical]
        // 对应的起始档索引（从 stopDepths[idx] 开始做到末尾）：
        startIdxByLevel: [3, 2, 1, 0],   // 绿/黄/红/深红 起始档的 stopDepths 索引（-1=不需要任何档）

        // ---- 长按加速 ----
        speedUpMul: 5.0,                 // 长按时减压时间流速倍率
        speedUpO2Mul: 3.0,               // 长按时氧气消耗倍率（乘在 breath.o2PerBreath 上）

        // ---- DCS 惩罚（跳过减压出水）----
        // 触发条件：surfacing（finishMazeDive）时 nitrogenLoad > thresholdYellow（即已进黄灯且未做完减压）
        // severity：
        //   1 = nitrogenLoad < thresholdCritical（黄~红~深红之间）
        //   2 = nitrogenLoad >= thresholdCritical
        penalty: {
            // O2Max 打折倍率：0.7 = -30%
            o2MaxMulLv1: 0.70,
            o2MaxMulLv2: 0.70,
            // 持续多少次下潜（lv1=1 次 lv2=2 次）；每次 finishMazeDive 结束自动 -1，减到 0 清除
            durationDivesLv1: 1,
            durationDivesLv2: 2,
            // 本次撤离战利品价值倍率（撤离失败本来就全损，所以仅在 retreat/rescued 成功撤离时生效）
            lootMulLv1: 0.5,
            lootMulLv2: 0.0,
            // 屏幕视觉 debuff：岸上显示紫色指示带 + 文字（lv2 才启用）
            showPurpleBadgeLv2: true,
        },

        // ---- UI ----
        hudVisible: true,                // 减压灯在 HUD 左上角显示
    },
};
