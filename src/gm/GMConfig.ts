// GM面板参数条目配置
// 新增可调参数只需在 TABS 数组中添加条目

// ============ 类型定义 ============

export interface GMNumberItem {
    type: 'number';
    label: string;       // 显示名称
    path: string;        // CONFIG 中的路径，如 'lightRange' 或 'fishEnemy.size'
    min?: number;
    max?: number;
    step?: number;        // 每次点击加减的步长
    precision?: number;   // 小数位数
}

export interface GMBoolItem {
    type: 'bool';
    label: string;
    path: string;
}

export interface GMActionItem {
    type: 'action';
    label: string;
    actionId: string;    // 操作标识符，由 GMPanel 中的回调处理
}

export type GMItem = GMNumberItem | GMBoolItem | GMActionItem;

export interface GMTab {
    name: string;
    items: GMItem[];
}

// ============ 参数条目定义 ============

export const TABS: GMTab[] = [
    {
        name: '手电筒',
        items: [
            { type: 'number', label: 'flatRatio(全亮区占比)', path: 'flashlight.flatRatio', min: 0, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: 'edgeFadeRatio(边缘淡出)', path: 'flashlight.edgeFadeRatio', min: 0.05, max: 0.8, step: 0.05, precision: 2 },
            { type: 'number', label: 'maskPow(遮罩pow)', path: 'flashlight.maskPow', min: 0.1, max: 2, step: 0.05, precision: 2 },
            { type: 'number', label: 'maskMinAlpha(最亮处透明)', path: 'flashlight.maskMinAlpha', min: 0, max: 0.5, step: 0.01, precision: 2 },
            { type: 'number', label: 'volOuter(外层泛光强度)', path: 'flashlight.volOuterIntensity', min: 0, max: 2, step: 0.05, precision: 2 },
            { type: 'number', label: 'volCenter(中心光束强度)', path: 'flashlight.volCenterIntensity', min: 0, max: 2, step: 0.05, precision: 2 },
            { type: 'number', label: 'vplBounce(VPL反弹基数)', path: 'flashlight.vplBounceBase', min: 0, max: 2, step: 0.05, precision: 2 },
            { type: 'number', label: 'vplRadius(VPL半径)', path: 'flashlight.vplRadius', min: 20, max: 200, step: 5 },
            { type: 'number', label: 'vplMask(VPL遮罩层)', path: 'flashlight.vplMaskStrength', min: 0, max: 5, step: 0.1, precision: 1 },
            { type: 'number', label: 'vplVol(VPL体积光层)', path: 'flashlight.vplVolStrength', min: 0, max: 2, step: 0.05, precision: 2 },
            { type: 'number', label: 'scatter(漫散射强度)', path: 'flashlight.scatterIntensity', min: 0, max: 1, step: 0.02, precision: 2 },
            { type: 'number', label: 'scatterDist(散射距离比)', path: 'flashlight.scatterDistRatio', min: 0.1, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: 'scatterR(散射半径比)', path: 'flashlight.scatterRadiusRatio', min: 0.1, max: 1.5, step: 0.05, precision: 2 },
        ]
    },
    {
        name: '光照',
        items: [
            { type: 'number', label: 'ambient(环境光)', path: 'ambient', min: 0, max: 1, step: 0.01, precision: 3 },
            { type: 'number', label: 'lightRange(手电距离)', path: 'lightRange', min: 50, max: 1000, step: 10 },
            { type: 'number', label: 'fov(视野角度)', path: 'fov', min: 10, max: 180, step: 5 },
            { type: 'number', label: 'rayCount(射线数)', path: 'rayCount', min: 30, max: 720, step: 30 },
            { type: 'number', label: 'ambientLightSurface(水面光)', path: 'ambientLightSurface', min: 0, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: 'ambientLightDeep(深层光)', path: 'ambientLightDeep', min: 0, max: 0.5, step: 0.005, precision: 3 },
            { type: 'number', label: 'darknessStartDepth(变暗深度)', path: 'darknessStartDepth', min: 500, max: 5000, step: 100 },
            { type: 'number', label: 'flashlightCenterFov(中心光束角)', path: 'flashlightCenterFov', min: 5, max: 90, step: 5 },
            { type: 'number', label: 'selfGlowRadius(自发光半径)', path: 'selfGlowRadius', min: 50, max: 500, step: 10 },
            { type: 'number', label: 'selfGlowIntensity(自发光强度)', path: 'selfGlowIntensity', min: 0, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: 'lightEdgeFeather(边缘羽化)', path: 'lightEdgeFeather', min: 10, max: 300, step: 10 },
            { type: 'number', label: 'ambientPerceptionRadius(感知半径)', path: 'ambientPerceptionRadius', min: 10, max: 300, step: 10 },
            { type: 'number', label: 'ambientPerceptionIntensity(感知强度)', path: 'ambientPerceptionIntensity', min: 0, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: 'siltSampleSteps(泥沙采样步数)', path: 'siltSampleSteps', min: 4, max: 64, step: 4 },
            { type: 'number', label: 'siltAbsorptionCoeff(泥沙吸收)', path: 'siltAbsorptionCoeff', min: 0, max: 3, step: 0.1, precision: 1 },
            { type: 'number', label: 'siltInfluenceRadius(泥沙影响半径)', path: 'siltInfluenceRadius', min: 1, max: 50, step: 1 },
        ]
    },
    {
        name: 'Debug',
        items: [
            { type: 'bool', label: 'debug(调试模式)', path: 'debug' },
            { type: 'number', label: 'debugSpeedMultiplier(速度倍率)', path: 'debugSpeedMultiplier', min: 0.1, max: 10, step: 0.5, precision: 1 },
            { type: 'bool', label: 'bShowNpcFlashLight(NPC手电)', path: 'bShowNpcFlashLight' },
            { type: 'bool', label: '开始游戏(解锁)', path: 'menuUnlock.startGame' },
            { type: 'bool', label: '章节选择(解锁)', path: 'menuUnlock.chapterSelect' },
            { type: 'bool', label: '食人鱼竞技场(解锁)', path: 'menuUnlock.fishArena' },
            { type: 'bool', label: '迷宫纯享版(解锁)', path: 'menuUnlock.mazeMode' },
            { type: 'bool', label: 'infiniteO2(无限氧气)', path: 'infiniteO2' },
        ]
    },
    {
        name: '玩法',
        items: [
            { type: 'number', label: 'moveSpeed(移动速度)', path: 'moveSpeed', min: 1, max: 40, step: 1 },
            { type: 'number', label: 'turnSpeed(转向速度)', path: 'turnSpeed', min: 0.01, max: 0.3, step: 0.01, precision: 2 },
            { type: 'number', label: 'acceleration(加速度)', path: 'acceleration', min: 0.001, max: 0.05, step: 0.001, precision: 3 },
            { type: 'number', label: 'waterDrag(水阻力)', path: 'waterDrag', min: 0.9, max: 1, step: 0.005, precision: 3 },
            { type: 'number', label: 'o2ConsumptionBase(氧气基础消耗)', path: 'o2ConsumptionBase', min: 0, max: 0.05, step: 0.001, precision: 3 },
            { type: 'number', label: 'o2ConsumptionMove(氧气移动消耗)', path: 'o2ConsumptionMove', min: 0, max: 0.05, step: 0.001, precision: 3 },
            { type: 'number', label: 'siltFactor(扬尘倍率)', path: 'siltFactor', min: 0, max: 5, step: 0.1, precision: 1 },
            { type: 'number', label: 'siltLife(扬尘生命)', path: 'siltLife', min: 0.1, max: 5, step: 0.1, precision: 1 },
            { type: 'number', label: 'maze.moveSpeed(迷宫移动速度)', path: 'maze.moveSpeed', min: 1, max: 30, step: 1 },
            { type: 'number', label: 'attack.range(攻击距离)', path: 'attack.range', min: 20, max: 200, step: 5 },
            { type: 'number', label: 'attack.angle(攻击角度)', path: 'attack.angle', min: 30, max: 360, step: 10 },
            { type: 'number', label: 'attack.cooldown(攻击CD帧)', path: 'attack.cooldown', min: 30, max: 600, step: 30 },
        ]
    },
    {
        name: '尘埃',
        items: [
            { type: 'bool', label: '启用尘埃', path: 'dust.enabled' },
            { type: 'number', label: '密度(每格)', path: 'dust.density', min: 1, max: 10, step: 1 },
            { type: 'number', label: '格子大小', path: 'dust.cellSize', min: 40, max: 200, step: 10 },
            { type: 'number', label: '基础大小', path: 'dust.baseSize', min: 0.3, max: 4, step: 0.1, precision: 1 },
            { type: 'number', label: '大小变化', path: 'dust.sizeVariation', min: 0, max: 3, step: 0.1, precision: 1 },
            { type: 'number', label: '漂移速度', path: 'dust.driftSpeed', min: 0.05, max: 2, step: 0.05, precision: 2 },
            { type: 'number', label: '漂移幅度', path: 'dust.driftAmplitude', min: 0.5, max: 10, step: 0.5, precision: 1 },
            { type: 'number', label: '暗色透明度', path: 'dust.baseAlpha', min: 0.01, max: 0.3, step: 0.01, precision: 2 },
            { type: 'number', label: '亮色透明度', path: 'dust.litAlpha', min: 0.05, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: '散射光晕半径', path: 'dust.litRadius', min: 1, max: 8, step: 0.5, precision: 1 },
            { type: 'number', label: '散射衰减', path: 'dust.litFalloff', min: 0.05, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: '手电增强', path: 'dust.flashlightBoost', min: 0.1, max: 3, step: 0.1, precision: 1 },
            { type: 'number', label: '深水密度上限', path: 'dust.depthDensityScale', min: 0.5, max: 3, step: 0.1, precision: 1 },
            { type: 'number', label: '密度增加深度', path: 'dust.depthDensityStart', min: 0, max: 3000, step: 100 },
        ]
    },
    {
        name: '手动挡',
        items: [
            { type: 'bool', label: '启用手动挡', path: 'manualDrive.enabled' },
            { type: 'bool', label: '调试辅助线', path: 'manualDrive.debugDraw' },
            { type: 'number', label: '有效行程', path: 'manualDrive.effectiveDistance', min: 40, max: 240, step: 4 },
            { type: 'number', label: '基础推进', path: 'manualDrive.thrustBase', min: 0.05, max: 3, step: 0.05, precision: 2 },
            { type: 'number', label: '后段推进增量', path: 'manualDrive.thrustDistanceScale', min: 0, max: 3, step: 0.05, precision: 2 },
            { type: 'number', label: '速度推进增量', path: 'manualDrive.thrustSpeedScale', min: 0, max: 0.08, step: 0.002, precision: 3 },
            { type: 'number', label: '单帧推进上限', path: 'manualDrive.thrustMax', min: 0.2, max: 5, step: 0.1, precision: 1 },
            { type: 'number', label: '基础转向', path: 'manualDrive.turnBase', min: 0.05, max: 2.5, step: 0.05, precision: 2 },
            { type: 'number', label: '速度转向增量', path: 'manualDrive.turnSpeedScale', min: 0, max: 0.08, step: 0.002, precision: 3 },
            { type: 'number', label: '单帧转向上限', path: 'manualDrive.turnMax', min: 0.1, max: 3, step: 0.05, precision: 2 },
            { type: 'number', label: '后向转向权重', path: 'manualDrive.backwardTurnScale', min: 0, max: 2.5, step: 0.05, precision: 2 },
            { type: 'number', label: '最大速度', path: 'manualDrive.maxSpeed', min: 1, max: 15, step: 0.5, precision: 1 },
            { type: 'number', label: '前向水阻', path: 'manualDrive.dragForward', min: 0.8, max: 0.995, step: 0.005, precision: 3 },
            { type: 'number', label: '侧向水阻', path: 'manualDrive.dragLateral', min: 0.5, max: 0.99, step: 0.01, precision: 2 },
            { type: 'number', label: '踢水进度上限', path: 'manualDrive.kickProgressRate', min: 0.01, max: 0.2, step: 0.005, precision: 3 },
            { type: 'number', label: '踢水回收速度', path: 'manualDrive.kickRecoverRate', min: 0.005, max: 0.1, step: 0.002, precision: 3 },
            { type: 'number', label: '力度抬升速度', path: 'manualDrive.kickStrengthRise', min: 0.01, max: 0.3, step: 0.01, precision: 2 },
            { type: 'number', label: '力度衰减速度', path: 'manualDrive.kickStrengthDecay', min: 0.005, max: 0.2, step: 0.005, precision: 3 },
            { type: 'number', label: '身体跟随速率', path: 'manualDrive.bodyAlignRate', min: 0.01, max: 0.5, step: 0.01, precision: 2 },
            { type: 'number', label: '跟随最低速度', path: 'manualDrive.bodyAlignMinSpeed', min: 0.05, max: 2, step: 0.05, precision: 2 },
            { type: 'number', label: '掉头阈值(弧度)', path: 'manualDrive.bigTurnThreshold', min: 0.5, max: 2.5, step: 0.05, precision: 2 },
            { type: 'number', label: '掉头软过渡宽度', path: 'manualDrive.bigTurnBlendWidth', min: 0.05, max: 1.2, step: 0.05, precision: 2 },
            { type: 'number', label: '掉头朝向补偿', path: 'manualDrive.bigTurnAssist', min: 0, max: 0.3, step: 0.01, precision: 2 },
            { type: 'number', label: '掉头推进残留', path: 'manualDrive.bigTurnThrustFactor', min: 0, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: '输入死区', path: 'manualDrive.minSwipeDist', min: 0.5, max: 10, step: 0.5, precision: 1 },
            { type: 'bool', label: '反转方向', path: 'manualDrive.reverseDir' },
        ]
    },
    {
        name: '角色',
        items: [
            { type: 'number', label: '手臂待机频率', path: 'diver.armIdleFrequency', min: 0.1, max: 1.5, step: 0.05, precision: 2 },
            { type: 'number', label: '手臂待机幅度', path: 'diver.armIdleAmplitude', min: 0, max: 0.08, step: 0.002, precision: 3 },
            { type: 'number', label: '手臂踢水摆幅', path: 'diver.armKickSwing', min: 0, max: 0.4, step: 0.01, precision: 2 },
            { type: 'number', label: '手臂转向摆幅', path: 'diver.armTurnSwing', min: 0, max: 1.2, step: 0.01, precision: 2 },
            { type: 'number', label: '速度收臂幅度', path: 'diver.armCloseBySpeed', min: 0, max: 1, step: 0.02, precision: 2 },
            { type: 'number', label: '滑行踢水频率', path: 'diver.legKickFrequency', min: 0.1, max: 2, step: 0.05, precision: 2 },
            { type: 'number', label: '滑行踢水幅度', path: 'diver.legKickAmplitude', min: 0.01, max: 0.2, step: 0.005, precision: 3 },
            { type: 'number', label: '回收带腿量', path: 'diver.kickRecoverLength', min: 1, max: 10, step: 0.2, precision: 1 },
            { type: 'number', label: '发力送腿量', path: 'diver.kickDriveLength', min: 2, max: 12, step: 0.2, precision: 1 },
            { type: 'number', label: '身体传导扭力', path: 'diver.kickBodyWave', min: 0, max: 4, step: 0.1, precision: 1 },
            { type: 'number', label: '脚蹼后扫量', path: 'diver.finDriveLength', min: 2, max: 14, step: 0.2, precision: 1 },
            { type: 'number', label: '脚蹼前收量', path: 'diver.finRecoverLength', min: 0, max: 8, step: 0.2, precision: 1 },
            { type: 'number', label: '转向腿偏移', path: 'diver.turnLegOffset', min: 0, max: 6, step: 0.1, precision: 1 },
            { type: 'number', label: '漂浮摆动速度', path: 'diver.idleDriftSpeed', min: 0.05, max: 1.2, step: 0.05, precision: 2 },
            { type: 'number', label: '蛙鞋基础开合', path: 'diver.finSpreadBase', min: 0.2, max: 3, step: 0.1, precision: 1 },
            { type: 'number', label: '滑行额外开合', path: 'diver.finSpreadSwim', min: 0, max: 3, step: 0.1, precision: 1 },
            { type: 'number', label: '踢水额外开合', path: 'diver.finSpreadStroke', min: 0, max: 3, step: 0.1, precision: 1 },
            { type: 'number', label: '转向蛙鞋偏转', path: 'diver.finTurnSkew', min: 0, max: 1, step: 0.02, precision: 2 },
        ]
    },
    {
        name: '相机',
        items: [
            { type: 'number', label: '跟随刚度', path: 'camera.followStiffness', min: 0.01, max: 0.3, step: 0.01, precision: 2 },
            { type: 'number', label: '跟随阻尼', path: 'camera.followDamping', min: 0.5, max: 0.99, step: 0.01, precision: 2 },
            { type: 'number', label: '前瞻距离', path: 'camera.lookAheadDistance', min: 0, max: 100, step: 5 },
            { type: 'number', label: '前瞻速度缩放', path: 'camera.lookAheadVelocityScale', min: 0, max: 30, step: 1 },
            { type: 'number', label: '摇曳幅度', path: 'camera.swayAmplitude', min: 0, max: 8, step: 0.2, precision: 1 },
            { type: 'number', label: '摇曳频率A', path: 'camera.swayFrequencyA', min: 0.05, max: 1.5, step: 0.05, precision: 2 },
            { type: 'number', label: '摇曳频率B', path: 'camera.swayFrequencyB', min: 0.05, max: 1.5, step: 0.05, precision: 2 },
            { type: 'number', label: '归位速度', path: 'camera.resetSnapSpeed', min: 0.05, max: 1, step: 0.05, precision: 2 },
            { type: 'bool', label: '自适应缩放', path: 'camera.adaptiveZoom' },
            { type: 'number', label: '射线数量', path: 'camera.azRayCount', min: 4, max: 24, step: 2 },
            { type: 'number', label: '射线最大距离', path: 'camera.azMaxRayDist', min: 200, max: 1200, step: 50 },
            { type: 'number', label: '射线步长', path: 'camera.azRayStep', min: 4, max: 20, step: 2 },
            { type: 'number', label: '狭窄阈值', path: 'camera.azNarrowDist', min: 40, max: 300, step: 10 },
            { type: 'number', label: '空旷阈值', path: 'camera.azWideDist', min: 150, max: 800, step: 25 },
            { type: 'number', label: '狭窄zoom', path: 'camera.azZoomNarrow', min: 1.0, max: 2.0, step: 0.05, precision: 2 },
            { type: 'number', label: '空旷zoom', path: 'camera.azZoomWide', min: 0.5, max: 1.2, step: 0.05, precision: 2 },
            { type: 'number', label: '缩放过渡速度', path: 'camera.azSmoothSpeed', min: 0.005, max: 0.1, step: 0.005, precision: 3 },
            { type: 'number', label: '检测间隔帧', path: 'camera.azUpdateInterval', min: 1, max: 10, step: 1 },
        ]
    },
    {
        name: '后处理',
        items: [
            { type: 'bool', label: '手动曝光开关', path: 'postProcess.enableManualExposure' },
            { type: 'number', label: '手动曝光值', path: 'postProcess.manualExposure', min: 0.1, max: 5, step: 0.1, precision: 1 },
            { type: 'bool', label: '自动曝光开关', path: 'postProcess.enableAutoExposure' },
            { type: 'number', label: '自动曝光最小值', path: 'postProcess.autoExposureMin', min: 0.1, max: 2, step: 0.1, precision: 1 },
            { type: 'number', label: '自动曝光最大值', path: 'postProcess.autoExposureMax', min: 1, max: 10, step: 0.5, precision: 1 },
            { type: 'number', label: '自动曝光速度', path: 'postProcess.autoExposureSpeed', min: 0.001, max: 0.2, step: 0.005, precision: 3 },
            { type: 'number', label: '自动曝光目标亮度', path: 'postProcess.autoExposureTarget', min: 0.05, max: 1, step: 0.05, precision: 2 },
            { type: 'bool', label: 'ToneMapping开关', path: 'postProcess.enableToneMapping' },
            { type: 'number', label: 'ToneMapping模式(0=Reinhard,1=ACES)', path: 'postProcess.toneMappingMode', min: 0, max: 1, step: 1 },
            { type: 'number', label: 'Reinhard白点', path: 'postProcess.reinhardWhitePoint', min: 0.5, max: 10, step: 0.5, precision: 1 },
        ]
    },
    {
        name: '浅水区',
        items: [
            { type: 'bool', label: '浅水区总开关', path: 'maze.shallowWater.enabled' },
            { type: 'number', label: '浅水区深度', path: 'maze.shallowWater.depth', min: 500, max: 4000, step: 100 },
            { type: 'number', label: '天空高度', path: 'maze.shallowWater.skyHeight', min: 200, max: 2000, step: 100 },
            { type: 'number', label: '最大环境光', path: 'maze.shallowWater.ambientMax', min: 0.3, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: '最小环境光', path: 'maze.shallowWater.ambientMin', min: 0, max: 0.3, step: 0.01, precision: 2 },
            { type: 'number', label: '遮罩曲线指数', path: 'maze.shallowWater.maskCurveExp', min: 0.3, max: 5, step: 0.1, precision: 1 },
            { type: 'number', label: '遮罩中点位置', path: 'maze.shallowWater.maskMidPoint', min: 0.05, max: 0.8, step: 0.05, precision: 2 },
            { type: 'number', label: '水体色调透明度', path: 'maze.shallowWater.tintAlpha', min: 0, max: 0.8, step: 0.05, precision: 2 },
            { type: 'bool', label: '阳光平行光', path: 'maze.shallowWater.sunlightEnabled' },
            { type: 'number', label: '阳光角度', path: 'maze.shallowWater.sunlightAngle', min: -0.8, max: 0.8, step: 0.05, precision: 2 },
            { type: 'number', label: '阳光光柱数', path: 'maze.shallowWater.sunlightRayCount', min: 2, max: 16, step: 1 },
            { type: 'number', label: '光柱宽度', path: 'maze.shallowWater.sunlightRayWidth', min: 10, max: 80, step: 5 },
            { type: 'number', label: '光柱长度', path: 'maze.shallowWater.sunlightRayLength', min: 200, max: 1200, step: 50 },
            { type: 'number', label: '阳光强度', path: 'maze.shallowWater.sunlightIntensity', min: 0.05, max: 0.6, step: 0.02, precision: 2 },
            { type: 'number', label: '光柱间距', path: 'maze.shallowWater.sunlightSpacing', min: 60, max: 400, step: 20 },
            { type: 'number', label: '光柱摇曳速度', path: 'maze.shallowWater.sunlightSwaySpeed', min: 0.1, max: 1.5, step: 0.1, precision: 1 },
            { type: 'number', label: '光柱摇曳幅度', path: 'maze.shallowWater.sunlightSwayAmount', min: 5, max: 80, step: 5 },
        ]
    },
    {
        name: '标记',
        items: [
            { type: 'number', label: '按钮半径', path: 'marker.btnRadius', min: 20, max: 50, step: 2 },
            { type: 'number', label: '轮盘外径', path: 'marker.wheelOuterRadius', min: 50, max: 120, step: 5 },
            { type: 'number', label: '轮盘内径', path: 'marker.wheelInnerRadius', min: 10, max: 40, step: 2 },
            { type: 'number', label: '岩石牌面宽', path: 'marker.wallSignWidth', min: 6, max: 20, step: 1 },
            { type: 'number', label: '岩石牌面高', path: 'marker.wallSignHeight', min: 4, max: 16, step: 1 },
            { type: 'number', label: '岩石短杆长', path: 'marker.wallStakeLength', min: 4, max: 16, step: 1 },
            { type: 'number', label: '绳索标签宽', path: 'marker.ropeTagWidth', min: 4, max: 16, step: 1 },
            { type: 'number', label: '绳索标签高', path: 'marker.ropeTagHeight', min: 4, max: 14, step: 1 },
            { type: 'number', label: '放置动画帧', path: 'marker.placeAnimDuration', min: 5, max: 40, step: 1 },
            { type: 'number', label: '拆除动画帧', path: 'marker.removeAnimDuration', min: 5, max: 30, step: 1 },
            { type: 'number', label: '绳索标记摆速', path: 'marker.ropeTagSwaySpeed', min: 0.5, max: 3, step: 0.1, precision: 1 },
            { type: 'number', label: '绳索标记摆幅', path: 'marker.ropeTagSwayAmplitude', min: 0.05, max: 0.4, step: 0.01, precision: 2 },
        ]
    },
    {
        name: '迷宫鱼',
        items: [
            { type: 'bool', label: '启用食人鱼', path: 'maze.fishEnabled' },
            // 聚集点数量
            { type: 'number', label: '聚集点最少', path: 'maze.denCountMin', min: 1, max: 6, step: 1 },
            { type: 'number', label: '聚集点最多', path: 'maze.denCountMax', min: 1, max: 8, step: 1 },
            // 每个聚集点的鱼数量
            { type: 'number', label: '每窝最少鱼', path: 'maze.denFishCountMin', min: 1, max: 10, step: 1 },
            { type: 'number', label: '每窝最多鱼', path: 'maze.denFishCountMax', min: 1, max: 12, step: 1 },
            // 聚集点空间参数
            { type: 'number', label: '游荡半径', path: 'maze.denRadius', min: 200, max: 1200, step: 50 },
            { type: 'number', label: '脱敌距离', path: 'maze.denLeashDistance', min: 600, max: 3000, step: 100 },
            { type: 'number', label: '离出生点最小距离', path: 'maze.denMinDistToSpawn', min: 800, max: 4000, step: 100 },
            { type: 'number', label: '窝间最小距离', path: 'maze.denMinDistBetween', min: 800, max: 4000, step: 100 },
            { type: 'bool', label: '必覆盖关键路径', path: 'maze.denMustCoverCriticalPath' },
            // 骷髅装饰
            { type: 'number', label: '骷髅最少', path: 'maze.denSkullCountMin', min: 0, max: 20, step: 1 },
            { type: 'number', label: '骷髅最多', path: 'maze.denSkullCountMax', min: 0, max: 30, step: 1 },
            { type: 'number', label: '骷髅搜索半径比', path: 'maze.denSkullSearchRadiusRatio', min: 0.3, max: 1.5, step: 0.05, precision: 2 },
            // 鱼本体关键参数
            { type: 'number', label: '怕光最大距离', path: 'fishEnemy.lightFearMaxDistance', min: 50, max: 600, step: 10 },
            { type: 'number', label: '怕光亮度阈值', path: 'fishEnemy.lightFearThreshold', min: 0.05, max: 1, step: 0.05, precision: 2 },
            { type: 'number', label: '感知距离', path: 'fishEnemy.detectRange', min: 100, max: 800, step: 20 },
            // 快捷动作
            { type: 'action', label: '🐟 生成一条食人鱼', actionId: 'spawnMazeFish' },
            { type: 'action', label: '💀 杀死所有食人鱼', actionId: 'killAllFish' },
            { type: 'action', label: '🧹 清除所有食人鱼', actionId: 'removeAllFish' },
        ]
    },
];

// ============ 面板布局常量 ============
// GMPanel 和 GMRender 都从这里导入，避免循环依赖

import { logicW, logicH } from '../render/Canvas';

export const BTN_RADIUS = 18;       // GM按钮半径
export const BTN_X = logicW / 2;    // 按钮X（屏幕顶部中央）
export const BTN_Y = 18;             // 按钮Y

// 面板默认位置（运行时可通过拖动改变）
export const PANEL_DEFAULT_X = 10;
export const PANEL_DEFAULT_Y = 42;
export const PANEL_W = logicW - 20;
export const PANEL_H = logicH * 0.65;

export const DRAG_BAR_H = 22;       // 顶部拖动条高度
export const TAB_H = 32;            // tab页签高度
export const TAB_FIXED_W = 60;      // 每个tab固定宽度（可滑动）
export const ITEM_H = 38;           // 每个条目高度
export const ITEM_PAD = 6;          // 条目内边距
export const LABEL_W_RATIO = 0.48;  // 标签占宽度比例
export const INPUT_H = 26;          // 输入框高度
