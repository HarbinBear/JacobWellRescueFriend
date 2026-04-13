const systemInfo = wx.getSystemInfoSync();

export const CONFIG = {
    // 画布设置 (竖屏适配)
    screenWidth: systemInfo.windowWidth,
    screenHeight: systemInfo.windowHeight,
    
    // 调试
    debug: false,              // 调试模式：显示小地图和实时坐标
    debugSpeedMultiplier: 1,  // 调试模式下的移动速度系数
    bShowNpcFlashLight: false,
    infiniteO2: false,        // 无限氧气（所有模式生效）

    // ===== 主菜单解锁配置 =====
    menuUnlock: {
        startGame: true,       // 开始游戏是否解锁
        chapterSelect: true,   // 章节选择是否解锁
        fishArena: true,       // 食人鱼竞技场是否解锁
        mazeMode: true,        // 迷宫纯享版是否解锁
    },

    // 游戏参数
    ambient: 0.01,        // 环境光亮度
    lightRange: 650,      // 手电筒距离 (竖屏视野长，稍微增加距离)
    fov: 65,              // 视野角度 (竖屏稍微增加视野)
    moveSpeed: 14,         // 移动速度
    siltFactor: 1.0,      // 扬尘产生倍率
    rayCount: 360,        // 射线数量（越高光锥边缘越平滑）
    siltLife: 1,         // 扬尘生命周期
    bloodLife: 2,         // 血迹生命周期
    turnSpeed: 0.08,      // 转向速度 (单摇杆操作可能需要更灵敏的转向)
    acceleration: 0.005,   // 加速度
    waterDrag: 0.98,       // 水阻力
    
    // 玩家碰撞半径（主线/竞技场通用，碰撞检测时 dist < wall.r + playerRadius）
    playerRadius: 10,

    // 地图参数
    tileSize: 40,
    cols: 80,
    rows: 150,
    
    // 氧气与生存参数
    o2ConsumptionBase: 0.005, // 基础氧气消耗
    o2ConsumptionMove: 0.003,  // 移动额外消耗
    o2DamageMultiplier: 6.0,   // 氧气瓶损坏后的消耗倍率
    o2RefillRate: 1.0,         // 接触NPC时的回复速度
    
    // 光照参数
    ambientLightSurface: 1.0,     // 水面/浅层环境光亮度
    ambientLightDeep: 0.01,       // 深层最低环境光亮度
    darknessStartDepth: 2500,     // 开始变暗的深度 (第一洞室底部)
    flashlightColor: 'rgba(255, 247, 160, 0.13)', // 手电筒泛光颜色
    flashlightCenterColor: 'rgba(253, 253, 37, 0.3)', // 手电筒中心光束颜色
    flashlightCenterFov: 50,      // 中心光束角度
    
    // 自身发光参数
    selfGlowRadius: 230,          // 自身发光半径（迷宫模式调亮）
    selfGlowIntensity: 0.1,      // 自身发光强度 (0-1, 越大越亮)
    
    // 视野与遮挡参数
    lightEdgeFeather: 100,          // 光照边缘羽化距离（像素，越大边缘越柔和）
    ambientPerceptionRadius: 80,   // 周围环境感知半径（非手电筒方向也能微弱看到近距离东西）
    ambientPerceptionIntensity: 0.35, // 周围环境感知强度 (0-1)

    // 泥沙光线遮挡参数（线性截断 + 逐粒子射线投影）
    siltSampleSteps: 16,            // 每条射线沿距离方向的采样步数（越多越精细）
    siltAbsorptionCoeff: 0.8,       // 泥沙吸收强度（线性截断：τ≥1完全遮挡，推荐0.3~1.5）
    siltInfluenceRadius: 10,        // 每个泥沙粒子对射线的横向影响半径（像素）
    siltSpawnMaxWallDist: 80,       // 生成泥沙的最大岩壁距离（像素）

    // 绳索系统参数
    ropeAnchorDistance: 60,        // 靠近岩石多近才能锚定（距岩石表面的像素距离）
    ropeStillTimeToShow: 0.8,      // 静止多少秒后显示铺线按钮
    ropeStillSpeedThreshold: 1.5,  // 判定静止的速度阈值（低于此值视为静止）
    ropeHoldDuration: 0.6,         // 长按多少秒完成铺线/结束操作
    ropeButtonRadius: 32,          // UI按钮半径
    ropeButtonXRatio: 0.82,        // UI按钮X位置比例（占屏幕宽度）
    ropeButtonYRatio: 0.75,        // UI按钮Y位置比例（占屏幕高度）
    ropeSlackAmplitude: 14,        // 松弛绳子垂坠幅度（垂直于路径的偏移）
    ropeSlackGravity: 10,          // 绳子在水中的重力下坠量
    ropeWaveAmplitude: 6,          // 绳子波浪动画幅度
    ropeWaveFrequency: 1.6,        // 绳子波浪频率（沿绳长方向）
    ropeWaveSpeed: 2.2,            // 绳子波浪动画速度
    ropeDriftAmplitude: 4,         // 水流缓慢漂动幅度
    ropeDriftSpeed: 0.8,           // 水流缓慢漂动速度
    ropeSegmentLength: 12,         // 绳子渲染分段长度（越小越平滑）
    ropeAvoidPadding: 12,          // 绳子绕岩石的额外间距
    ropeAStarMaxIters: 3000,       // A*寻路最大迭代次数
    ropeColor: 'rgba(230, 220, 170, 0.9)',   // 铺线中绳子颜色
    ropeTightColor: 'rgba(230, 220, 170, 1.0)', // 拉紧绳子颜色
    ropeWidth: 2.5,                // 铺线中绳子宽度
    ropeTightWidth: 2,             // 拉紧绳子宽度
    ropeNailRadius: 4,             // 钉子半径
    ropeNailColor: '#888',         // 钉子颜色
    ropeKnotRadius: 3,             // 绳结半径
    ropeKnotColor: 'rgba(230, 220, 170, 0.95)', // 绳结颜色
    ropeTightenLerp: 0.12,         // 收紧绳子的插值系数
    ropeReelRadius: 8,             // 玩家身上线轮指示器半径
    ropeReelColor: 'rgba(200, 190, 140, 0.7)', // 线轮指示器颜色

    // ===== 标记系统配置 =====
    marker: {
        // 交互按钮（轮盘触发器）
        btnRadius: 36,              // 交互按钮半径
        btnXRatio: 0.82,            // 按钮X位置比例（与旧绳索按钮相同位置）
        btnYRatio: 0.75,            // 按钮Y位置比例
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

    // ===== 第三关关键点位配置 =====
    // 第一二洞室连接处（row20, col63）
    chamber12JunctionX: 718,
    chamber12JunctionY: 2380,
    // 二三洞室连接处结尾（大缝隙出口，第三洞室入口）
    chamber23JunctionX: 2266,
    chamber23JunctionY: 5700,
    // 第四关出生点（二三洞室连接处另一侧，刚进入第三洞室）
    chapter4SpawnOffsetY: 350,      // 相对于二三洞室连接处向下偏移的距离

    // ===== 第三关恐怖事件配置 =====
    fishEyeFlashDuration: 0.3,      // 鱼眼闪现持续秒数
    flashlightFixedOffTriggerDist: 350,  // 距灰色物体多近时手电筒固定灭（像素）
    fishEyeTriggerDist: 120,        // 距灰色物体多近时触发鱼眼闪现（像素）
    abandonBtnAppearDelay: 2.0,     // 鱼眼出现后多少秒显示放弃按钮
    abandonBtnHoldDuration: 3.0,    // 长按放弃按钮需要多少秒
    flashlightResumeDuration: 5.0,  // 鱼眼触发后多少秒手电筒重新亮起
    // 灰色物体（二三洞室连接处开始处的石头上）
    grayThingX: 1870,               // 灰色物体X坐标（连接处开始处）
    grayThingY: 5480,               // 灰色物体Y坐标（连接处开始处）
    grayThingVisibleDist: 400,      // 灰色物体在多少像素内开始可见

    // ===== 食人鱼纯享版配置 =====
    fishArena: {
        // 竞技场地图参数
        mapSize: 2000,              // 正方形地图边长（像素）
        wallThickness: 120,         // 外围岩石厚度（像素）
        tileSize: 40,               // 竞技场格子大小

        // 障碍物生成
        obstacleCount: 6,           // 随机障碍物数量
        obstacleMinSize: 80,        // 障碍物最小尺寸（像素）
        obstacleMaxSize: 200,       // 障碍物最大尺寸（像素）
        obstacleMinDist: 200,       // 障碍物与玩家出生点的最小距离

        // 轮次参数
        prepDuration: 3.5,          // 每轮开始前的准备时间（秒）
        fishPerRound: 1,            // 每轮新增鱼数（第N轮 = N条鱼）

        // 成就反馈阈值
        clearTextRound: 1,          // 每轮清图都触发
        shutdownRound: 3,           // 第3轮起触发 SHUTDOWN
        unbelievableRound: 6,       // 第6轮起触发 UNBELIEVABLE
        legendRound: 10,            // 第10轮起触发 LEGENDARY
    },

    // ===== 凶猛鱼（敌人）配置 =====
    fishEnemy: {
        size: 28,                   // 鱼体基础尺寸（像素）

        // 感知与探测
        detectRange: 320,           // 感知玩家的距离（像素）
        safeDistance: 60,           // 非冲刺状态下鱼与玩家的最小安全距离（像素），玩家进入此范围鱼立刻逃跑

        // 各状态移动速度
        roamSpeed: 1.2,             // 自由游弋速度
        stalkSpeed: 1.8,            // 悄悄靠近速度
        lungeSpeed: 14,             // 扑击冲刺速度
        fleeSpeed: 10,              // 被光驱赶逃跑速度

        // 转向灵敏度（0~1，越大转向越快）
        turnSpeedRoam: 0.04,        // 游弋时转向速度
        turnSpeedStalk: 0.06,       // 靠近时转向速度
        turnSpeedCircle: 0.08,      // 徘徊时转向速度
        turnSpeedFlee: 0.12,        // 逃跑时转向速度

        // 徘徊参数
        circleRadius: 120,          // 绕玩家徘徊的半径（像素）
        circleSpeed: 0.018,         // 绕圈角速度（弧度/帧）
        circleBeforeLunge: 180,     // 徘徊多少帧后发动扑击

        // 扑击参数
        lungeChargeDuration: 40,    // 蓄力帧数
        lungeMaxDuration: 80,       // 扑击最大持续帧数（超时未命中则放弃）
        biteRange: 35,              // 命中判定距离（像素）

        // 撕咬与吞食
        biteDuration: 60,           // 撕咬持续帧数
        devourDuration: 40,         // 吞食持续帧数

        // 撤退
        retreatDuration: 200,       // 慢慢撤退持续帧数

        // 怕光参数
        lightFearThreshold: 0.25,   // 触发怕光的最低亮度阈值（0~1）
        fearPauseDuration: 20,      // 怕光停顿帧数（惊吓反应）
        fearDuration: 180,          // 迅速逃跑持续帧数

        // 发现目标停顿
        detectPauseDuration: 45,    // 发现目标后停顿帧数

        // 死亡过场
        deathFadeDuration: 120,     // 死亡红屏淡出帧数

        // 被打逃跑
        hitFleeDistance: 400,       // 被打后逃跑到多远才回到常态（像素）
        hitFleeSpeed: 12,           // 被打后逃跑速度

        // 死亡动画
        deathRollDuration: 90,      // 翻肚皮动画帧数（1.5s @ 60fps）
        deathFadeOutDuration: 30,   // 死亡淡出帧数（0.5s @ 60fps）

        // 冲刺起手动画
        lungeChargeGlowDuration: 20, // 眼睛发光持续帧数（蓄力阶段）
    },

    // ===== 迷宫纯享版模式配置 =====
    maze: {
        // 地图参数
        // 注意：迷宫用随机游走+元胞自动机生成洞穴，通道宽度约3~5格
        // 格子大小120px（放大一倍让空间不拥挤），通道宽3格=360px
        cols: 100,              // 迷宫列数（接近正方形，允许横向发展）
        rows: 100,              // 迷宫行数（接近正方形，不强制纵向）
        tileSize: 120,          // 格子大小（像素），放大一倍让空间更宽敞
        wallThickness: 5,       // 外围岩石厚度（格子数），加厚防止看到地图外空白

        // 迷宫模式移动速度（比主线慢）
        moveSpeed: 10,          // 迷宫模式基础移动速度（主线14）

        // 玩家碰撞半径（迷宫格子120px，通道宽3格=360px，12px半径合适）
        playerRadius: 12,

        // 氧气参数
        o2ConsumptionBase: 0.008,   // 基础氧气消耗（加快，增加紧迫感）
        o2ConsumptionMove: 0.005,   // 移动额外消耗

        // NPC（被救者）配置
        npcMinDistRatio: 0.55,      // NPC离出发点的最小距离占地图对角线比例
        npcRescueRange: 80,         // 靠近NPC多近触发救援交互（像素）
        npcRescueHoldDuration: 0.8, // 长按多少秒完成绑绳（秒）
        npcFollowSpeed: 3.2,        // NPC跟随速度

        // 小地图
        minimapSize: 160,           // 小地图尺寸（像素）
        minimapX: 10,               // 小地图左上角X
        minimapY: 10,               // 小地图左上角Y

        // 深度显示
        depthUnit: 40,              // 每格对应多少像素（用于计算深度m）

        // 结算
        deadTimerBeforeResult: 120, // 死亡后多少帧显示结算

        // === 场景辨识度参数入口 ===
        themesPerGame: { min: 3, max: 4 },
        sceneTransitionWidth: 100,
        stalactiteClusterChance: 0.3,

        // === 浅水区渲染配置 ===
        shallowWater: {
            enabled: true,              // 浅水区渲染总开关
            depth: 2000,                // 浅水区深度范围（从水面往下多少像素算浅水区）
            skyHeight: 400,             // 天空背景高度（水面上方多少像素绘制天空）
            ambientMax: 0.95,           // 浅水区最大环境光（水面处，0=全暗，1=全亮）
            ambientMin: 0.01,           // 浅水区最小环境光（深处，等于 ambientLightDeep）
            maskCurveExp: 2.2,          // 环境光遮罩衰减曲线指数（>1=前段亮后段快速变暗，<1=前段快暗后段慢）
            maskMidPoint: 0.05,          // 环境光遮罩中点位置（0~1，在浅水区多深处亮度降到一半）
            waterSurfaceY: 60,          // 水面Y坐标偏移（相对于出口Y，对齐洞口顶部=玩家可达水面）
            tintR: 60,                  // 浅水区水体色调R（0~255）
            tintG: 180,                 // 浅水区水体色调G
            tintB: 220,                 // 浅水区水体色调B
            tintAlpha: 0.35,            // 浅水区水体色调叠加强度
            skyColorTop: '#87CEEB',     // 天空顶部颜色
            skyColorMid: '#E0F7FA',     // 天空中部颜色
            skyColorWater: '#4DD0E1',   // 水面附近颜色
            skyColorDeep: '#1a3a5a',    // 天空渐变最深处颜色（水下深处，不透明）
            waveEnabled: true,          // 是否绘制水面波浪
            tyndallEnabled: true,       // 是否绘制丁达尔光柱
            tyndallCount: 5,            // 丁达尔光柱数量
            tyndallAlpha: 0.15,         // 丁达尔光柱透明度
            bgTintEnabled: true,        // 是否对浅水区水域格子叠加浅蓝色

            // === 阳光平行光 ===
            sunlightEnabled: true,      // 是否启用阳光平行光
            sunlightAngle: 0.25,        // 阳光入射角偏移（弧度，0=正下方，正值=偏右）
            sunlightRayCount: 8,        // 阳光光柱数量
            sunlightRayWidth: 35,       // 单根光柱宽度（像素）
            sunlightRayLength: 500,     // 光柱穿透深度（像素）
            sunlightIntensity: 0.22,    // 阳光光柱亮度
            sunlightSpacing: 160,       // 光柱间距（像素）
            sunlightSwaySpeed: 0.4,     // 光柱摇曳速度
            sunlightSwayAmount: 30,     // 光柱摇曳幅度（像素）
            sunlightFadeStart: 0.3,     // 光柱从水面多深开始衰减（占总长比例）
            sunlightColor: [200, 240, 255], // 光柱颜色 RGB
        },

        // === 多次下潜闭环配置 ===
        retreatHoldDuration: 1.0,   // 探路撤离长按秒数
        retreatBtnRadius: 36,       // 撤离按钮半径
        retreatBtnXRatio: 0.18,     // 撤离按钮X位置比例
        retreatBtnYRatio: 0.88,     // 撤离按钮Y位置比例
        surfacingDuration: 60,      // 上浮动画帧数（1秒）
        debriefShowDelay: 30,       // 结算页延迟显示帧数
    },

    // ===== 悬浮尘埃配置 =====
    dust: {
        enabled: true,              // 是否启用悬浮尘埃
        density: 2,                 // 每个格子内的尘埃数量（基础值，受深度缩放）
        cellSize: 100,               // 尘埃采样格子大小（像素，越小越密集但越耗性能）
        baseSize: 0.3,              // 尘埃基础半径（像素）
        sizeVariation: 0.1,         // 尘埃大小随机变化范围
        driftSpeed: 0.8,            // 漂移速度（越大飘得越快）
        driftAmplitude: 3.0,        // 漂移幅度（像素，越大飘得越远）
        baseAlpha: 0.06,            // 暗色层基础透明度（刚好能感知到）
        litAlpha: 0.5,             // 亮色层基础透明度（被手电照亮时）
        litRadius: 1.0,             // 散射光晕半径倍数
        litFalloff: 0.3,            // 散射光晕衰减系数
        flashlightBoost: 1.0,       // 手电照射增强系数
        depthDensityScale: 1.0,     // 深水区密度缩放上限
        depthDensityStart: 500,     // 开始增加密度的深度（像素）
    },

    // ===== 手电筒光照参数 =====
    flashlight: {
        // 遮罩层（决定哪里被照亮、哪里黑暗）
        flatRatio: 0,              // 径向全亮区占比（0~1，前这么多比例的距离内亮度不衰减）
        edgeFadeRatio: 0.35,         // 角度边缘淡出区占比（0~1，从 FOV 的 (1-此值) 处开始渐变到边缘）
        maskPow: 0.75,               // 遮罩 alpha 的 pow 指数（越低亮区越透明）
        maskMinAlpha: 0.10,          // 最亮处的最小遮罩 alpha（越低越透明）

        // 体积光层（决定光路上可见的暖色光柱）
        volOuterIntensity: 0.25,     // 外层暖色泛光强度
        volCenterIntensity: 0.25,    // 中心光束强度
        volOuterColor: [1.0, 0.969, 0.627],   // 外层泛光颜色 RGB (0~1)
        volCenterColor: [0.992, 0.992, 0.145], // 中心光束颜色 RGB (0~1)

        // VPL 反弹光
        vplBounceBase: 0.4,          // VPL 基础反弹强度（CPU 端上传时的 alpha 基数）
        vplRadius: 20.0,             // VPL 影响半径（像素）
        vplMaskStrength: 1.2,        // VPL 在遮罩层的亮度系数
        vplVolStrength: 0.2,         // VPL 在体积光层的亮度系数

        // 漫散射
        scatterIntensity: 0.16,      // 漫散射强度
        scatterDistRatio: 0.6,       // 漫散射中心距离占 maxDist 比例
        scatterRadiusRatio: 0.8,     // 漫散射半径占 maxDist 比例
    },

    // ===== 后处理（曝光 + Tone Mapping）配置 =====
    postProcess: {
        // 手动曝光
        enableManualExposure: false,     // 是否启用手动曝光
        manualExposure: 1.0,             // 手动曝光值（>1 提亮，<1 压暗）

        // 自动曝光
        enableAutoExposure: true,       // 是否启用自动曝光
        autoExposureMin: 0.5,            // 自动曝光最低值
        autoExposureMax: 2.5,            // 自动曝光最高值
        autoExposureSpeed: 0.02,         // 自动曝光适应速度（越小越慢）
        autoExposureTarget: 0.5,        // 目标平均亮度（画面整体想维持在多亮）

        // Tone Mapping
        enableToneMapping: false,        // 是否启用 Tone Mapping
        toneMappingMode: 1,              // 0=Reinhard, 1=ACES
        reinhardWhitePoint: 2.0,         // Reinhard 扩展白点（越大允许越亮的值保留）
    },

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
        turnBase: 0.58,              // 整段有效行程内的基础转向强度
        turnSpeedScale: 0.03,        // 输入速度到额外转向强度的映射系数
        turnMax: 2,                  // 单帧转向强度上限（弧度系数）
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

        // --- 身体朝向跟随参数 ---
        bodyAlignRate: 0.12,         // 身体朝向跟随速度方向的速率（0~1，越大越快对齐）
        bodyAlignMinSpeed: 0.3,      // 速度低于此值时身体不跟随（避免静止时抖动）

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
        azZoomNarrow: 1.6,              // 狭窄区域目标zoom（拉近）
        azZoomWide: 0.85,                // 空旷区域目标zoom（拉远）
        azSmoothSpeed: 0.015,            // zoom平滑过渡速度（越小越慢）
        azUpdateInterval: 3,             // 每隔多少帧更新一次射线检测（降低性能开销）
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
