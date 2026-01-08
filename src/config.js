const systemInfo = tt.getSystemInfoSync();

export const CONFIG = {
    // 画布设置
    screenWidth: systemInfo.windowWidth,
    screenHeight: systemInfo.windowHeight,
    
    // 游戏参数
    ambient: 0.5,        // 环境光亮度
    lightRange: 300,      // 手电筒距离 (手机上稍微减小)
    fov: 60,              // 视野角度
    moveSpeed: 8,         // 移动速度
    safeAscentSpeed: 2.5, // 安全上浮速度阈值
    siltFactor: 1.0,      // 扬尘产生倍率
    rayCount: 120,        // 射线数量 (手机性能优化，从500降到120)
    turnSpeed: 0.05,      // 转向速度 (稍微加快一点适应手机)
    acceleration: 0.005,   // 加速度
    waterDrag: 0.98,       // 水阻力
    
    // 地图参数
    tileSize: 40,
    cols: 60,
    rows: 60,
    
    // 目标名字库
    targetNames: ["伟仔", "毛丁", "树茂", "熊"]
};
