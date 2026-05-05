// 渲染相关：悬浮尘埃 / 手电筒光照 / 画质分档 / 性能 HUD / 后处理

export const renderingConfig = {
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
        // VPL 光锥角度权重：让靠光锥中心的 VPL 更亮、靠边缘的 VPL 更暗，
        // 消除 "VPL 强度均匀、手电边缘却已经很弱" 导致的观感突兀。
        // 公式：t = candidateI/rays*2 - 1 (-1~1)；w = (1 - |t|^pow)^exp；最后再和 edgeFloor 取 max。
        vplConeFalloffPow: 1.6,      // 中心平台宽度（<1 更尖峰、>1 更平，推荐 1~2）
        vplConeFalloffExp: 2.0,      // 边缘下跌速度（越大边缘越暗，推荐 1.5~3）
        vplConeEdgeFloor: 0.15,      // 光锥边缘最低保留亮度（0 会死黑，推荐 0.1~0.2）

        // 漫散射
        scatterIntensity: 0.16,      // 漫散射强度
        scatterDistRatio: 0.6,       // 漫散射中心距离占 maxDist 比例
        scatterRadiusRatio: 0.8,     // 漫散射半径占 maxDist 比例
    },

    // ===== 画质分档 / 自适应（FPS 自适应光照性能） =====
    // 核心手段：降低 WebGL 光照 canvas 的分辨率 + 压低 VPL 上限 + 低档关闭漫散射 / NPC 体积光
    // 档位：0=low / 1=medium / 2=high / 3=ultra
    quality: {
        // ===== 画质预设系统（PC 游戏式） =====
        // preset: 当前预设名（'low'|'medium'|'high'|'ultra'|'custom'）
        // 选预设 → 下方小项同步刷新；手动改小项 → preset 自动变 custom
        // auto 开启 → preset 变 custom，小项被 FPS 自适应实时改写
        preset: 'high' as string,

        // ---- 运行时小项（可被预设覆写，也可被用户/auto 手动改） ----
        scale: 0.75,                   // WebGL canvas 分辨率缩放（0~1）
        rayCount: 180,                 // 射线数量（光锥精度，越高边缘越平滑）
        vplMax: 96,                    // VPL 上传点数上限
        enableScatter: true,           // 是否启用漫散射
        enableNpcVol: true,            // 是否启用 NPC 体积光
        skipOcclusion: false,          // 跳过射线遮挡计算（CPU 端最贵的循环，low 档启用；开启后光锥会“穿墙”）

        // ---- 预设参数模板 ----
        presets: {
            low:    { scale: 0.25, rayCount: 10,  vplMax: 3,   enableScatter: false, enableNpcVol: false, skipOcclusion: true  },
            medium: { scale: 0.50, rayCount: 60,  vplMax: 32,  enableScatter: true,  enableNpcVol: true,  skipOcclusion: false },
            high:   { scale: 0.75, rayCount: 180, vplMax: 96,  enableScatter: true,  enableNpcVol: true,  skipOcclusion: false },
            ultra:  { scale: 1.00, rayCount: 360, vplMax: 128, enableScatter: true,  enableNpcVol: true,  skipOcclusion: false },
        } as Record<string, { scale: number; rayCount: number; vplMax: number; enableScatter: boolean; enableNpcVol: boolean; skipOcclusion: boolean }>,

        // ---- FPS 自适应 ----
        auto: true,                   // 是否自动根据 FPS 升降档（默认关，等稳定后再开）
        autoMaxLevel: 3,               // auto 能升到的最高档索引（0=low,1=med,2=high,3=ultra）
        initialAutoLevel: 2,           // auto 启动时的初始档位索引
        fpsWindowFrames: 60,           // 每个统计窗口多少帧
        fpsDownThreshold: 45,          // 平均 FPS 低于此值触发降档候选
        fpsUpThreshold: 55,            // 平均 FPS 高于此值触发升档候选
        downWindows: 2,                // 连续多少个窗口低于阈值才降档
        upWindows: 3,                  // 连续多少个窗口高于阈值才升档
        switchCooldownMs: 2000,        // 档位切换冷却（防震荡）
    },

    // ===== 性能 HUD（帧时 / 各段耗时屏幕中央文字） =====
    // 读取方：src/debug/PerfHUD.ts
    // GM 面板「性能」Tab 里的 perfHUD.* 三项都依赖这里的默认值存在；
    // 如果这个对象缺失，GM 面板的勾选框和数字框会因为 setConfigValue 找不到父对象而静默失败。
    perfHUD: {
        enabled: false,                // 是否显示屏幕中央文字 HUD（FPS/各段耗时）
        enableMarks: false,            // 是否调用 performance.mark/measure（录火焰图时开，平时关）
        fontSize: 11,                  // HUD 字号
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
        enableToneMapping: true,        // 是否启用 Tone Mapping
        toneMappingMode: 1,              // 0=Reinhard, 1=ACES
        reinhardWhitePoint: 2.0,         // Reinhard 扩展白点（越大允许越亮的值保留）
    },
};
