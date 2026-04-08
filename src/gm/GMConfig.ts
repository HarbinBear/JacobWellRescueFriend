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

export type GMItem = GMNumberItem | GMBoolItem;

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
            { type: 'bool', label: 'fishArenaMode(纯享版模式)', path: 'fishArenaMode' },
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
];

// ============ 面板布局常量 ============
// GMPanel 和 GMRender 都从这里导入，避免循环依赖

import { logicW, logicH } from '../render/Canvas';

export const BTN_RADIUS = 18;       // GM按钮半径
export const BTN_X = logicW / 2;    // 按钮X（屏幕顶部中央）
export const BTN_Y = 18;             // 按钮Y

export const PANEL_X = 10;
export const PANEL_Y = 42;
export const PANEL_W = logicW - 20;
export const PANEL_H = logicH * 0.65;

export const TAB_H = 32;            // tab页签高度
export const ITEM_H = 38;           // 每个条目高度
export const ITEM_PAD = 6;          // 条目内边距
export const LABEL_W_RATIO = 0.48;  // 标签占宽度比例
export const INPUT_H = 26;          // 输入框高度
