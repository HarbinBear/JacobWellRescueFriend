const systemInfo = wx.getSystemInfoSync();

export const CONFIG = {
    // 画布设置 (竖屏适配)
    screenWidth: systemInfo.windowWidth,
    screenHeight: systemInfo.windowHeight,
    
    // 游戏参数
    ambient: 0.5,        // 环境光亮度
    lightRange: 350,      // 手电筒距离 (竖屏视野长，稍微增加距离)
    fov: 70,              // 视野角度 (竖屏稍微增加视野)
    moveSpeed: 8,         // 移动速度
    safeAscentSpeed: 2.5, // 安全上浮速度阈值
    siltFactor: 1.0,      // 扬尘产生倍率
    rayCount: 120,        // 射线数量
    turnSpeed: 0.08,      // 转向速度 (单摇杆操作可能需要更灵敏的转向)
    acceleration: 0.005,   // 加速度
    waterDrag: 0.98,       // 水阻力
    
    // 地图参数
    tileSize: 40,
    cols: 60,
    rows: 60,
    
    // 目标名字库
    targetNames: ["伟仔", "毛丁", "树茂", "熊", "亮子", "潘子"]
};
