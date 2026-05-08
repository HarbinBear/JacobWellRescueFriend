// 基础运行参数：版本 / 画布 / 调试 / 菜单解锁 / 基础移动 / 地图 / 氧气 / 光照 / 泥沙 / 绳索 / 第三关关键点 / 第三关恐怖事件
// 从 config/index.ts 按需展开合并进 CONFIG。

const systemInfo = wx.getSystemInfoSync();

export const baseConfig = {
    // 版本信息
    version: 'v1.0.15',

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
        startGame: false,       // 开始游戏是否解锁
        chapterSelect: false,   // 章节选择是否解锁
        fishArena: false,       // 食人鱼竞技场是否解锁
        mazeMode: true,        // 迷宫纯享版是否解锁
    },

    // 游戏参数
    ambient: 0.01,        // 环境光亮度
    lightRange: 650,      // 手电筒距离 (竖屏视野长，稍微增加距离)
    fov: 65,              // 视野角度 (竖屏稍微增加视野)
    moveSpeed: 20,         // 移动速度（自动挡基准，主线/竞技场）
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
};
