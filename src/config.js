const systemInfo = wx.getSystemInfoSync();

export const CONFIG = {
    // 画布设置 (竖屏适配)
    screenWidth: systemInfo.windowWidth,
    screenHeight: systemInfo.windowHeight,
    
    // 游戏参数
    ambient: 0.5,        // 环境光亮度
    lightRange: 350,      // 手电筒距离 (竖屏视野长，稍微增加距离)
    fov: 70,              // 视野角度 (竖屏稍微增加视野)
    moveSpeed: 10,         // 移动速度
    safeAscentSpeed: 2.5, // 安全上浮速度阈值
    siltFactor: 1.0,      // 扬尘产生倍率
    rayCount: 120,        // 射线数量
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
    
    // 目标名字库
    targetNames: ["伟仔", "毛丁", "树茂", "熊", "亮子", "潘子"]
};
