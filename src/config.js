const systemInfo = wx.getSystemInfoSync();

export const CONFIG = {
    // 画布设置 (竖屏适配)
    screenWidth: systemInfo.windowWidth,
    screenHeight: systemInfo.windowHeight,
    
    // 调试
    bShowNpcFlashLight: false,

    // 游戏参数
    ambient: 0.5,        // 环境光亮度
    lightRange: 350,      // 手电筒距离 (竖屏视野长，稍微增加距离)
    fov: 70,              // 视野角度 (竖屏稍微增加视野)
    moveSpeed: 14,         // 移动速度
    safeAscentSpeed: 2.5, // 安全上浮速度阈值
    siltFactor: 1.0,      // 扬尘产生倍率
    rayCount: 120,        // 射线数量
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
    ambientLightDeep: 0.2,       // 深层最低环境光亮度
    darknessStartDepth: 2500,     // 开始变暗的深度 (第一洞室底部)
    flashlightColor: 'rgba(255, 247, 160, 0.2)', // 手电筒泛光颜色
    flashlightCenterColor: 'rgba(253, 253, 37, 0.41)', // 手电筒中心光束颜色
    flashlightCenterFov: 25,      // 中心光束角度
    
    // 自身发光参数
    selfGlowRadius: 150,          // 自身发光半径
    selfGlowIntensity: 0.6,       // 自身发光强度 (0-1, 越大越亮)
    
    // 视野与遮挡参数
    lightEdgeFeather: 25,          // 光照边缘羽化距离（像素，越大边缘越柔和）
    ambientPerceptionRadius: 80,   // 周围环境感知半径（非手电筒方向也能微弱看到近距离东西）
    ambientPerceptionIntensity: 0.35, // 周围环境感知强度 (0-1)

    // 泥沙遮挡光线参数（Beer-Lambert 光吸收模型 + 空间哈希加速）
    siltSampleSteps: 28,            // 沿射线的采样步数（影响距离分辨率：步数越多，泥沙前亮后暗的过渡越细腻）
    siltAbsorptionCoeff: 0.5,      // 泥沙粒子的光吸收系数（越大泥沙遮挡越强，建议 0.05~0.5）
    siltInfluenceRadius: 40,        // 泥沙粒子对射线的横向影响半径（像素，也是空间哈希网格粒度）

    // Rope gameplay
    ropeAnchorDistance: 60,        // 靠近岩石多近才能锚定（距岩石表面的像素距离）
    ropeStillTimeToShow: 0.8,      // 静止多少秒后显示铺线按钮
    ropeStillSpeedThreshold: 1.5,  // 判定静止的速度阈值（低于此值视为静止）
    ropeHoldDuration: 1.2,         // 长按多少秒完成铺线/结束操作
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
    targetNames: ["伟仔", "毛丁", "树茂", "熊", "亮子", "潘子"]
};
