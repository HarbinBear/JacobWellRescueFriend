// 玩法模式配置：食人鱼竞技场 / 凶猛鱼 / 迷宫纯享版（含浅水区、食人鱼聚集点、多次下潜闭环）

export const modesConfig = {
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
        lightFearMaxDistance: 260,  // 触发怕光的最大距离（像素，鱼距玩家超过此距离即使被照到也不怕）
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

        // 迷宫模式移动速度
        moveSpeed: 17,          // 迷宫模式自动挡基础移动速度

        // 玩家碰撞半径（迷宫格子120px，通道宽3格=360px，12px半径合适）
        playerRadius: 12,

        // 氧气参数
        o2ConsumptionBase: 0.008,   // 基础氧气消耗（加快，增加紧迫感）
        o2ConsumptionMove: 0.005,   // 移动额外消耗

        // NPC（被救者）配置
        npcMinDistRatio: 0.55,      // NPC离出发点的最小距离占地图对角线比例
        npcRescueRange: 80,         // 靠近NPC多近触发救援交互（像素）
        npcRescueHoldDuration: 0.8, // 长按多少秒完成绑绳（秒）
        npcFollowSpeed: 3.2,        // NPC基础跟随速度（跟随阶段兜底值）

        // === NPC 跟随距离约束（绑绳后，D方案：柔性加速+超距拖慢玩家）===
        npcTetherIdealDist: 70,     // 理想跟随距离（像素，NPC在此距离舒适漂移）
        npcTetherMaxDist: 220,      // 绳索最大拉伸距离，超过此距离玩家被拖慢
        npcFollowSpeedMin: 1.2,     // 距离等于理想值时的最低追赶速度
        npcFollowSpeedMax: 9.0,     // 距离接近最大值时的最高追赶速度
        npcTetherPullFactor: 0.55,  // 玩家超距时被拖慢系数（0=不拖慢，1=完全拉停）

        // === NPC 呼救表现（未被救时，玩家进入感知半径才呼救）===
        npcDistressActivateRatio: 3.0, // 呼救激活距离 = npcRescueRange * 该系数
        npcDistressBubbleRate: 0.08,   // 每帧生成呼救气泡的概率
        npcDistressHaloInterval: 1.6,  // 呼救闪光圈周期（秒）
        npcDistressArmSwing: 0.55,     // 挥手幅度（弧度）

        // === 救援绳渲染（玩家↔NPC，绑绳后）===
        rescueRopeColor: '#d7c48a',    // 绳索基色
        rescueRopeWidth: 2,            // 绳索粗细
        rescueRopeSegments: 10,        // 绳索折线段数
        rescueRopeSlackAmp: 6,         // 绳索松弛幅度（像素）
        rescueRopeWaveAmp: 2,          // 绳索水中摆动幅度（像素）

        // 小地图
        minimapSize: 160,           // 小地图尺寸（像素）
        minimapX: 10,               // 小地图左上角X
        minimapY: 60,               // 小地图左上角Y（下移避开深度氧气HUD）

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

        // === 迷宫食人鱼配置 ===
        fishEnabled: true,          // 是否在迷宫中生成食人鱼
        fishCountMin: 1,            // （旧）每局最少食人鱼数量（聚集点模式下已废弃，保留兼容）
        fishCountMax: 3,            // （旧）每局最多食人鱼数量（聚集点模式下已废弃，保留兼容）

        // === 食人鱼聚集点配置（replaces per-fish random spawn） ===
        denCountMin: 2,             // 全图聚集点最少数量
        denCountMax: 3,             // 全图聚集点最多数量
        denFishCountMin: 2,         // 每个聚集点最少食人鱼
        denFishCountMax: 6,         // 每个聚集点最多食人鱼
        denRadius: 600,             // 聚集点游荡半径（像素，鱼在此半径内自由游弋）
        denLeashDistance: 1400,     // 离家脱离仇恨距离（像素，离开聚集点超过此距离即放弃追击回家）
        denMinDistToSpawn: 2000,    // 聚集点离玩家出生点最小距离（像素）
        denMinDistBetween: 1800,    // 聚集点之间最小距离（像素，避免两窝挨太近）
        denMustCoverCriticalPath: true, // 是否保证至少一个聚集点在玩家出生点→NPC的关键路径附近
        denSkullCountMin: 4,        // 每个聚集点附近的骷髅装饰最少数量
        denSkullCountMax: 8,        // 每个聚集点附近的骷髅装饰最多数量
        denSkullSearchRadiusRatio: 0.9, // 骷髅搜索半径占聚集点半径的比例

        // === 多次下潜闭环配置 ===
        retreatHoldDuration: 1.0,   // 探路撤离长按秒数
        retreatBtnRadius: 36,       // 撤离按钮半径
        retreatBtnXRatio: 0.18,     // 撤离按钮X位置比例
        retreatBtnYRatio: 0.88,     // 撤离按钮Y位置比例
        surfacingDuration: 30,      // 上浮动画帧数（0.5秒，蓄力→爆发→破水）
        debriefShowDelay: 30,       // 结算页延迟显示帧数
    },
};
