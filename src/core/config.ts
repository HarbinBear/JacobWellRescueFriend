const systemInfo = wx.getSystemInfoSync();

export const CONFIG = {
    // 画布设置 (竖屏适配)
    screenWidth: systemInfo.windowWidth,
    screenHeight: systemInfo.windowHeight,
    
    // 调试
    debug: true,              // 调试模式：显示小地图和实时坐标
    debugSpeedMultiplier: 1,  // 调试模式下的移动速度系数
    bShowNpcFlashLight: false,

    // ===== 食人鱼纯享版开关 =====
    // true：主界面显示纯享版入口，正式关卡置灰不可进入
    fishArenaMode: true,

    // 游戏参数
    ambient: 0.5,        // 环境光亮度
    lightRange: 350,      // 手电筒距离 (竖屏视野长，稍微增加距离)
    fov: 70,              // 视野角度 (竖屏稍微增加视野)
    moveSpeed: 14,         // 移动速度
    safeAscentSpeed: 2.5, // 安全上浮速度阈值
    siltFactor: 1.0,      // 扬尘产生倍率
    rayCount: 60,        // 射线数量
    siltLife: 1,         // 扬尘生命周期
    bloodLife: 2,         // 血迹生命周期
    turnSpeed: 0.08,      // 转向速度 (单摇杆操作可能需要更灵敏的转向)
    acceleration: 0.005,   // 加速度
    waterDrag: 0.98,       // 水阻力
    
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
    ambientLightDeep: 0.1,       // 深层最低环境光亮度
    darknessStartDepth: 2500,     // 开始变暗的深度 (第一洞室底部)
    flashlightColor: 'rgba(255, 247, 160, 0.2)', // 手电筒泛光颜色
    flashlightCenterColor: 'rgba(253, 253, 37, 0.41)', // 手电筒中心光束颜色
    flashlightCenterFov: 25,      // 中心光束角度
    
    // 自身发光参数
    selfGlowRadius: 260,          // 自身发光半径（迷宫模式调亮）
    selfGlowIntensity: 0.9,       // 自身发光强度 (0-1, 越大越亮)
    
    // 视野与遮挡参数
    lightEdgeFeather: 25,          // 光照边缘羽化距离（像素，越大边缘越柔和）
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
    ropePathMaxIters: 12,          // 旧绕障最大迭代次数（已弃用，改用A*）
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
    // 目标名字库
    targetNames: ["伟仔", "毛丁", "树茂", "熊", "亮子", "潘子"],

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

    // ===== 迷宫引导绳模式配置 =====
    maze: {
        // 地图参数
        // 注意：迷宫用随机游走+元胞自动机生成洞穴，通道宽度约3~5格
        // 格子大小60px，通道宽3格=180px，玩家（半径8px）可自由移动
        cols: 55,               // 迷宫列数
        rows: 80,               // 迷宫行数（纵向较长，体现向下深入感）
        tileSize: 60,           // 格子大小（像素），比主线大，通道更宽敞
        wallThickness: 2,       // 外围岩石厚度（格子数）

        // 氧气参数
        o2ConsumptionBase: 0.008,   // 基础氧气消耗（加快，增加紧迫感）
        o2ConsumptionMove: 0.005,   // 移动额外消耗

        // NPC（被救者）配置
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
        themesPerGame: { min: 4, max: 5 },
        sceneTransitionWidth: 6,
        stalactiteClusterChance: 0.3,

        // === 多次下潜闭环配置 ===
        retreatHoldDuration: 1.0,   // 探路撤离长按秒数
        retreatBtnRadius: 36,       // 撤离按钮半径
        retreatBtnXRatio: 0.18,     // 撤离按钮X位置比例
        retreatBtnYRatio: 0.88,     // 撤离按钮Y位置比例
        surfacingDuration: 60,      // 上浮动画帧数（1秒）
        debriefShowDelay: 30,       // 结算页延迟显示帧数
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
