// 角色表现与交互：手动挡输入 / 潜水员动画 / 相机 / 音频

export const characterConfig = {
    // ===== 手动挡（搓屏移动）配置 =====
    // 物理模型：推力沿输入方向施加，身体朝向被动跟随速度方向
    manualDrive: {
        enabled: true,             // 是否启用手动挡模式（false=自动挡/摇杆）

        // --- 输入行程参数 ---
        effectiveDistance: 184,      // 一次输入可持续生效的有效行程（像素）
        minSwipeDist: 2,             // 输入起效的最小位移（像素）
        reverseDir: true,            // 是否反转方向（true=推水方向与移动方向相反）
        maxTouchPoints: 2,           // 最大同时识别的触点数（支持双指交替搓）

        // --- 推进参数 ---
        thrustBase: 1.35,            // 整段有效行程内的基础推进强度
        thrustDistanceScale: 1.05,   // 有效行程推进到后段时的额外推进增量
        thrustSpeedScale: 0.06,      // 输入速度（帧间位移像素）到额外推进的映射系数
        thrustMax: 5.2,              // 单帧推进强度上限

        // --- 转向参数 ---
        turnBase: 1.2,               // 整段有效行程内的基础转向强度
        turnSpeedScale: 0.05,        // 输入速度到额外转向强度的映射系数
        turnMax: 3.5,                // 单帧转向强度上限（弧度系数）
        backwardTurnScale: 1.15,     // 后向输入折算为转向输入的权重

        // --- 速度与阻力参数 ---
        maxSpeed: 11,                // 最大速度
        dragForward: 0.975,          // 前向水阻（沿身体朝向，流线型阻力小）
        dragLateral: 0.9,            // 侧向水阻（垂直于身体朝向，阻力大）

        // --- 动作表现平滑参数 ---
        kickProgressRate: 0.065,     // 踢水进度单帧推进上限（限制动作过快）
        kickRecoverRate: 0.028,      // 输入结束后的踢水回收速度（形成慢后摇）
        kickStrengthRise: 0.16,      // 踢水力度抬升速度
        kickStrengthDecay: 0.05,     // 踢水力度衰减速度

        // --- 鞘腿自动驱动参数（由输入加速度驱动，脑腿自动交替鞘）---
        // kickDrive 是一个 0~1 的累积量：每帧输入推力向上累积，无输入时衰减
        // 腔腿相位时钟按（legAutoFreqBase + kickDrive * legAutoFreqBoost）推进
        kickDriveRise: 0.04,         // 输入时 kickDrive 上升速度（0~1，越大越快达到最大）
        kickDriveDecay: 0.012,       // 无输入时 kickDrive 衰减速度（很慢，让鞘腿慢慢停下来）

        // --- 身体朝向跟随参数 ---
        bodyAlignRate: 0.06,         // 身体朝向跟随速度方向的速率（0~1，越大越快对齐）
        bodyAlignMinSpeed: 0.5,      // 速度低于此值时身体不跟随（避免静止时抖动）

        // --- 转向渐进动画参数 ---
        // 目的：避免转向过于灵敏，玩家反向输入时先做掉头再移动
        bigTurnThreshold: 1.5708,    // 大掉头阈值（弧度，默认 π/2 = 90°），输入与身体夹角超过此值进入掉头阶段
        bigTurnBlendWidth: 0.35,     // 大掉头附近的软过渡宽度（弧度），避免硬切造成推进突然跳变
        bigTurnAssist: 0.08,         // 大掉头阶段每帧额外施加的朝向补偿速率（纯角度修正，不受搓速影响）
        bigTurnThrustFactor: 0,      // 大掉头阶段保留的推进系数（0=完全不推进只滑行，可调至 0.1~0.2 允许轻微爬行）

        // --- 调试辅助线 ---
        debugDraw: false,           // 是否绘制辅助线（速度向量、身体朝向、输入方向、推力方向）
    },

    // ===== 角色表现（潜水员）配置 =====
    diver: {
        armIdleFrequency: 0.42,     // 手臂待机摆动频率
        armIdleAmplitude: 0.018,    // 手臂待机摆动幅度（弧度）
        armKickSwing: 0.2,          // 手臂随单侧踢水的轻微摆动幅度
        armTurnSwing: 1.0,          // 手臂参与转向修正的摆幅
        armCloseBySpeed: 0.42,      // 速度升高时手臂向身体收拢的幅度
        legKickFrequency: 0.58,     // 无输入时的轻微滑行踢水频率
        legKickAmplitude: 0.05,     // 无输入时的轻微滑行踢水幅度
        kickRecoverLength: 4.6,     // 回收阶段的大腿后带量
        kickDriveLength: 6.4,       // 发力阶段的大腿前送量
        kickBodyWave: 1.8,          // 踢水时从身体传到腿部的扭动力度
        finDriveLength: 8.6,        // 脚蹼在发力阶段的额外后扫距离
        finRecoverLength: 3.2,      // 脚蹼在回收阶段的前收距离
        turnLegOffset: 2.2,         // 拐弯时腿部外摆偏移量
        idleDriftSpeed: 0.32,       // 漂浮待机摆动速度
        finSpreadBase: 1.0,         // 蛙鞋基础开合
        finSpreadSwim: 0.55,        // 轻微滑行时的额外开合
        finSpreadStroke: 1.0,       // 输入踢水期间的额外开合
        finTurnSkew: 0.28,          // 拐弯时蛙鞋的偏转量
        // ---- 新版腿部造型与鞭状踢水参数 ----
        thighLength: 6,            // 大腿长度（髋到膝）
        calfLength: 6,             // 小腿长度（膝到踝）
        thighWidthHip: 4.4,         // 大腿根部宽度
        thighWidthKnee: 4.2,        // 大腿膝端宽度
        calfWidthKnee: 3.8,         // 小腿膝端宽度
        calfWidthAnkle: 3.4,        // 小腿踝端宽度（接脚蹼处）
        kneeCapRadius: 0.5,         // 膝盖关节小圆半径
        // 鞭状踢水（相位从髋→膝→踝依次滞后）
        kickPhaseLagKnee: 0.18,     // 膝相对髋的相位滞后（0~1）
        kickPhaseLagAnkle: 0.36,    // 踝相对髋的相位滞后（0~1）
        kickAmpHip: 1.4,            // 髋关节侧向鞭摆幅度
        kickAmpKnee: 3.2,           // 膝关节侧向鞭摆幅度
        kickAmpAnkle: 5.4,          // 踝关节侧向鞭摆幅度
        kickBaseSpread: 0,        // 腿部基础张开（髋点外侧的自然站位）
        finWhipAmp: 0.55,           // 蛙鞋柔性反弹角度（踝→蛙鞋尾端的相位差驱动）
        // 脚蹼剪影（现代开趾蛙鞋）
        finShapeLength: 13.5,         // 蛙鞋总长
        finShapeRootWidth: 5,     // 鞋套根部宽度
        finShapeNeckWidth: 5.8,     // 颈部收束宽度（鞋套与叶片交界）
        finShapeBellyWidth: 8.8,   // 叶片最宽处宽度
        finShapeTipWidth: 7.6,      // 叶片尖端宽度
        finShapeRootRatio: 0.1,    // 鞋套段占比
        finShapeBellyRatio: 0.65,   // 叶片最宽处位置占比
        // ---- 自动鞘腿时钟（两腿同相位钟差π交替）----
        legAutoFreqBase: 0.006,       // 脚腿相位时钟在静止状态下的基础推进速度（弱惯性尾动；整体放慢一倍）
        legAutoFreqBoost: 0.04,       // kickDrive=1 时额外推进速度（实际频率 = base + drive*boost，整体放慢一倍）
        legKickStopThreshold: 0.03,   // kickDrive 低于此值时相位时钟缓慢停摆
        // ---- 俯视 2D 模拟上下打水：腿前后伸缩 + 脚踼长度脉动 + 脚踼挥拍 ----
        kickStretchAmp: 1,            // 腿沿身体前后轴的伸缩幅度（踢到底时腿伸直，抓水时腿收）
        finLengthPulse: 0.3,          // 脚踼长度脉动比例（1.0 ± pulse 之间，踢到底时最长）
        finSweepAmp: 3.1,             // 脚踼沿身体前后轴的挥拍位移（踢到底时脚踼整体往后甸一段）
        // ---- 全身动画：躯干波动相位时钟 ----
        // 三种频率分量：idle（漂浮呼吸）/ forward（前进扭动）/ turn（转向紧张）
        bodyWaveIdleFreq: 0.006,      // idle 时相位时钟基础推进速度（常驻漂浮）
        bodyWaveForwardFreq: 0.02,    // 前进时随速度额外推进速度（speedNorm=1 时加此量）
        bodyWaveTurnFreq: 0.008,      // 转向时额外推进速度（|turnVisual|=1 时加此量）
        bodyWaveIdleAmp: 0.28,        // idle 时躯干波幅度基数（低幅常驻）
        bodyWaveForwardAmp: 0.55,     // 前进时躯干波幅度基数（随速度成比例）
        bodyWaveTurnAmp: 1.1,         // 转向时躯干波幅度基数（随 |turnVisual| 成比例）
        // 波幅 → yaw（左右扭）/ roll（侧倾）/ compress（呼吸压缩）的映射系数
        yawWaveFactor: 0.6,           // 躯干波映射到 yaw 的系数
        yawTurnFactor: 0.95,          // turnVisual 直接映射到 yaw 的系数（转向侧扭）
        rollWaveFactor: 0.08,         // 躯干波映射到 roll 的系数（前进/idle 下的侧滚）
        rollTurnFactor: 0.28,         // turnVisual 映射到 roll 的系数（转向时明显侧倾，约 16°满量）
        rollSquashFactor: 0.35,       // roll 通过 Y 轴缩放模拟 3D 倾斜的强度（压扁量 = |roll|×此值）
        rollSquashMax: 0.22,          // Y 轴最大压扁比例（防止过度扁平）
        compressWaveAmp: 0.035,       // 躯干呼吸压缩幅度（二次谐波驱动）
        // 手臂常驻漂摆与转向倾斜
        armBodyWaveAmp: 0.14,         // 手臂跟随躯干波的反相摆动幅度（idle + forward 都有）
        armTurnLeanFactor: 0.22,      // turnVisual 让两臂同向偏移的幅度（表现"掌舵"）
        // 头部蛇形传导
        bodyWaveHeadLead: 0.08,       // 头部波相对身体波的相位领先量（0~0.2，越大头越早动）
        headLeadFactor: 0.35,         // 头部波幅系数（× bodySwayAmp → 头部 yaw 领先量）
        headTurnLead: 1.1,            // turnVisual 直接让头部额外偏移的系数（头先转）
        headOffsetScale: 2.8,         // 头部 yaw 换算成 Y 方向像素偏移的缩放系数
        // idle 状态下腿部呼吸动作
        legIdleAmpNorm: 0.08,         // idle 时腿部保留的最低幅度（0=完全静止，越大呼吸感越强）
        legIdleFreqFactor: 1.8,       // idle 时相位时钟相对 legAutoFreqBase 的倍率（呼吸节奏）
        bodyIdleDriftAmp: 0.45,       // idle 时身体整体呼吸漂移像素（与躯干波同步）
    },

    // ===== 相机系统（弹簧臂 + 水中摇曳）配置 =====
    camera: {
        // 弹簧臂跟随参数
        followStiffness: 0.06,       // 跟随刚度（0~1，越大越紧跟，越小越松弛）
        followDamping: 0.82,         // 跟随阻尼（0~1，越大速度衰减越快）
        lookAheadDistance: 35,       // 前瞻距离（像素，相机会稍微偏向玩家前进方向）
        lookAheadVelocityScale: 8,   // 前瞻速度缩放（速度越快前瞻越远）
        // 水中摇曳参数
        swayAmplitude: 1.8,          // 摇曳幅度（像素）
        swayFrequencyA: 0.37,        // 摇曳频率A（低频主摆动）
        swayFrequencyB: 0.53,        // 摇曳频率B（高频叠加，与A不成整数比避免重复）
        // 模式切换
        resetSnapSpeed: 0.3,         // 模式切换时相机快速归位的速率

        // 远近自适应缩放
        adaptiveZoom: true,              // 是否启用远近自适应缩放
        azRayCount: 12,                  // 空间检测射线数量（均匀分布360°）
        azMaxRayDist: 800,               // 单条射线最大检测距离（像素）
        azRayStep: 15,                    // 射线步进步长（像素，越小越精确但越耗性能）
        azNarrowDist: 50,               // 平均距离低于此值视为狭窄（像素）
        azWideDist: 800,                 // 平均距离高于此值视为空旷（像素）
        azZoomNarrow: 1.35,              // 狭窄区域目标zoom（拉近）
        azZoomWide: 0.80,                // 空旷区域目标zoom（拉远）
        azSmoothSpeed: 0.015,            // zoom平滑过渡速度（越小越慢）
        azUpdateInterval: 3,             // 每隔多少帧更新一次射线检测（降低性能开销）
    },

    // ===== 音频系统配置 =====
    // 说明：
    // - 静音按钮并不真暂停 BGM，只把音量淡到 0，时间轴仍在推进；离开主菜单时才真正暂停
    // - 淡入淡出通过每帧线性逼近 targetVolume 实现
    audio: {
        bgmVolume: 1,         // BGM 目标音量（0~1）
        sfxVolume: 0.8,         // 一次性音效（SFX）目标音量（0~1），与 BGM 独立
        fadeStep: 0.01,         // 每帧音量变化步长（60fps 下约 1.7 秒淡入淡出到位）
        animSpeed: 0.01,        // 按钮音符旋转速度（弧度/帧，0.03 约每秒半圈）
        iconFadeStep: 0.08,     // 按钮图标在静音/开启之间切换的淡入淡出步长

        // 云存储配置：音频放在微信小游戏云开发的云存储里，不占主包体
        // 运行时会先用 wx.cloud.init() 初始化云开发，再用 getTempFileURL 把 FileID 换成临时 HTTPS URL
        // 临时 URL 有效期 2 小时，URL 过期时（errCode=10002）会自动重新请求
        cloud: {
            enabled: true,                                          // 是否启用云存储；关闭则回退到本地路径
            envId: 'cloud1-d8gh6fpnh6d0928e8',                      // 云开发环境 ID
            // 每条音频的 FileID 映射；key 必须与 AudioManager 的 AudioKey 对应
            fileIDs: {
                menuBGM: 'cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/Echoes_of_the_Sunken_Grotto_2026-04-22T150024.mp3',
                diveSplash: 'cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/ElevenLabs_A_diver_jumps_into_the_.mp3',
                breathLoop: 'cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/BreathBubble.mp3',
                collisionRock: 'cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/HitRock.mp3',
                collisionBreath: 'cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/BreathBubble.mp3',
                // 岸上营地环境音：鸟语花香循环，仅在 mazeRescue 的 shore / resolved_idle 两个真正暴露在营地的 phase 激活
                // 警情弹窗 / 救援成功 / 搜寻终止 等叙事页以及下潜中、菜单全部停
                campAmbience: 'cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/CampBird.mp3',
            } as Record<string, string>,
        },
    },
};
