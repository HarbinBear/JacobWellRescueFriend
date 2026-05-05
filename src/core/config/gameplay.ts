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

        // 静止（intensity=0）下的参数
        exhaleDurationStatic: 1.0,      // 吐气时长（秒）
        pauseDurationStatic: 3.0,       // 停顿时长（秒）
        bubbleRateStatic: 5,            // 吐气阶段气泡生成速率（粒/秒）
        volumeStatic: 0.35,             // 峰值音量（0~1，将被 sfxVolume 上限裁剪）
        playbackRateStatic: 0.85,       // 播放速率（0.5~2.0）
        bubbleSizeStatic: 7,          // 基础气泡半径（像素）

        // 全速（intensity=1）下的参数
        exhaleDurationPeak: 0.7,        // 吐气时长（秒）
        pauseDurationPeak: 0.8,         // 停顿时长（秒，几乎连续吐）
        bubbleRatePeak: 14,             // 吐气阶段气泡生成速率（粒/秒）
        volumePeak: 0.8,                // 峰值音量
        playbackRatePeak: 1.2,          // 播放速率
        bubbleSizePeak: 9,            // 基础气泡半径

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
};
