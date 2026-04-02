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
