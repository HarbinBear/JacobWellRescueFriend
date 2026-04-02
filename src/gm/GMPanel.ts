// GM工具面板
// 运行时参数调试面板，支持 number 和 bool 两种条目类型
// 直接读写 CONFIG 对象，不做序列化

import { CONFIG } from '../core/config';
import { logicW, logicH } from '../render/Canvas';

// ============ 类型定义 ============

interface GMNumberItem {
    type: 'number';
    label: string;       // 显示名称
    path: string;        // CONFIG 中的路径，如 'lightRange' 或 'fishEnemy.size'
    min?: number;
    max?: number;
    step?: number;        // 每次点击加减的步长
    precision?: number;   // 小数位数
}

interface GMBoolItem {
    type: 'bool';
    label: string;
    path: string;
}

type GMItem = GMNumberItem | GMBoolItem;

interface GMTab {
    name: string;
    items: GMItem[];
}

// ============ 面板状态 ============

let _open = false;           // 面板是否打开
let _activeTab = 0;          // 当前激活的tab索引
let _scrollY = 0;            // 当前tab内容滚动偏移
let _editingItem: string | null = null;  // 正在编辑的条目路径
let _editingValue = '';      // 编辑中的文本值
let _scrollTouchStartY = 0;  // 滚动触摸起始Y
let _scrollStartY = 0;       // 滚动起始偏移

// ============ 面板布局常量 ============

const BTN_RADIUS = 18;       // GM按钮半径
const BTN_X = logicW / 2;    // 按钮X（屏幕顶部中央）
const BTN_Y = 18;             // 按钮Y

const PANEL_X = 10;
const PANEL_Y = 42;
const PANEL_W = logicW - 20;
const PANEL_H = logicH * 0.65;

const TAB_H = 32;            // tab页签高度
const ITEM_H = 38;           // 每个条目高度
const ITEM_PAD = 6;          // 条目内边距
const LABEL_W_RATIO = 0.48;  // 标签占宽度比例
const INPUT_H = 26;          // 输入框高度

// ============ 参数条目定义 ============

const TABS: GMTab[] = [
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

// ============ CONFIG 读写工具 ============

function getConfigValue(path: string): any {
    const parts = path.split('.');
    let obj: any = CONFIG;
    for (const p of parts) {
        if (obj == null) return undefined;
        obj = obj[p];
    }
    return obj;
}

function setConfigValue(path: string, value: any): void {
    const parts = path.split('.');
    let obj: any = CONFIG;
    for (let i = 0; i < parts.length - 1; i++) {
        if (obj == null) return;
        obj = obj[parts[i]];
    }
    if (obj != null) {
        obj[parts[parts.length - 1]] = value;
    }
}

// ============ 公共接口 ============

export function isGMOpen(): boolean {
    return _open;
}

export function isGMEditing(): boolean {
    return _editingItem !== null;
}

// ============ 绘制 ============

export function drawGMButton(ctx: CanvasRenderingContext2D): void {
    // 始终绘制GM小圆圈按钮
    ctx.save();
    ctx.globalAlpha = _open ? 0.9 : 0.5;
    ctx.fillStyle = _open ? '#f80' : '#555';
    ctx.beginPath();
    ctx.arc(BTN_X, BTN_Y, BTN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GM', BTN_X, BTN_Y);
    ctx.globalAlpha = 1;
    ctx.restore();
}

export function drawGMPanel(ctx: CanvasRenderingContext2D): void {
    if (!_open) return;

    const tab = TABS[_activeTab];
    if (!tab) return;

    ctx.save();

    // 面板背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.beginPath();
    _rrect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 136, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    _rrect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 8);
    ctx.stroke();

    // Tab 页签
    const tabW = PANEL_W / TABS.length;
    for (let i = 0; i < TABS.length; i++) {
        const tx = PANEL_X + i * tabW;
        const ty = PANEL_Y;
        const isActive = i === _activeTab;

        ctx.fillStyle = isActive ? 'rgba(255, 136, 0, 0.3)' : 'rgba(40, 40, 40, 0.8)';
        ctx.fillRect(tx, ty, tabW, TAB_H);

        if (isActive) {
            ctx.fillStyle = '#f80';
            ctx.fillRect(tx, ty + TAB_H - 2, tabW, 2);
        }

        ctx.fillStyle = isActive ? '#fff' : '#888';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(TABS[i].name, tx + tabW / 2, ty + TAB_H / 2);
    }

    // 内容区域裁剪
    const contentY = PANEL_Y + TAB_H + 2;
    const contentH = PANEL_H - TAB_H - 4;
    ctx.save();
    ctx.beginPath();
    ctx.rect(PANEL_X, contentY, PANEL_W, contentH);
    ctx.clip();

    // 绘制条目
    const items = tab.items;
    const labelW = PANEL_W * LABEL_W_RATIO;
    const valueX = PANEL_X + labelW + 4;
    const valueW = PANEL_W - labelW - 12;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const iy = contentY + i * ITEM_H - _scrollY + ITEM_PAD;

        // 超出可见区域跳过
        if (iy + ITEM_H < contentY || iy > contentY + contentH) continue;

        // 条目背景（交替色）
        ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 30, 30, 0.5)' : 'rgba(20, 20, 20, 0.3)';
        ctx.fillRect(PANEL_X + 2, iy, PANEL_W - 4, ITEM_H - 2);

        // 标签
        ctx.fillStyle = '#ccc';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const labelText = item.label.length > 22 ? item.label.substring(0, 22) + '..' : item.label;
        ctx.fillText(labelText, PANEL_X + 6, iy + ITEM_H / 2);

        if (item.type === 'number') {
            const numItem = item as GMNumberItem;
            const currentVal = getConfigValue(numItem.path);
            const precision = numItem.precision ?? 0;
            const displayVal = typeof currentVal === 'number' ? currentVal.toFixed(precision) : String(currentVal);

            const isEditing = _editingItem === numItem.path;

            // 减号按钮
            const minusBtnX = valueX;
            const minusBtnW = 24;
            ctx.fillStyle = 'rgba(80, 80, 80, 0.8)';
            ctx.fillRect(minusBtnX, iy + (ITEM_H - INPUT_H) / 2, minusBtnW, INPUT_H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('−', minusBtnX + minusBtnW / 2, iy + ITEM_H / 2);

            // 数值显示框
            const inputX = minusBtnX + minusBtnW + 2;
            const inputW = valueW - minusBtnW * 2 - 4;
            ctx.fillStyle = isEditing ? 'rgba(255, 136, 0, 0.2)' : 'rgba(50, 50, 50, 0.8)';
            ctx.fillRect(inputX, iy + (ITEM_H - INPUT_H) / 2, inputW, INPUT_H);
            ctx.strokeStyle = isEditing ? '#f80' : '#555';
            ctx.lineWidth = 1;
            ctx.strokeRect(inputX, iy + (ITEM_H - INPUT_H) / 2, inputW, INPUT_H);

            ctx.fillStyle = isEditing ? '#ff8' : '#eee';
            ctx.font = '12px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isEditing ? _editingValue + '|' : displayVal, inputX + inputW / 2, iy + ITEM_H / 2);

            // 加号按钮
            const plusBtnX = inputX + inputW + 2;
            ctx.fillStyle = 'rgba(80, 80, 80, 0.8)';
            ctx.fillRect(plusBtnX, iy + (ITEM_H - INPUT_H) / 2, minusBtnW, INPUT_H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+', plusBtnX + minusBtnW / 2, iy + ITEM_H / 2);

        } else if (item.type === 'bool') {
            const boolItem = item as GMBoolItem;
            const currentVal = !!getConfigValue(boolItem.path);

            // 勾选框
            const checkX = valueX + valueW / 2 - 12;
            const checkY = iy + (ITEM_H - 24) / 2;
            const checkSize = 24;

            ctx.strokeStyle = currentVal ? '#0f0' : '#666';
            ctx.lineWidth = 2;
            ctx.strokeRect(checkX, checkY, checkSize, checkSize);

            if (currentVal) {
                ctx.fillStyle = 'rgba(0, 200, 0, 0.3)';
                ctx.fillRect(checkX, checkY, checkSize, checkSize);
                // 勾号
                ctx.strokeStyle = '#0f0';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(checkX + 5, checkY + 12);
                ctx.lineTo(checkX + 10, checkY + 18);
                ctx.lineTo(checkX + 19, checkY + 6);
                ctx.stroke();
            }
        }
    }

    // 滚动条
    const totalH = items.length * ITEM_H;
    if (totalH > contentH) {
        const scrollBarH = Math.max(20, contentH * (contentH / totalH));
        const scrollBarY = contentY + (_scrollY / (totalH - contentH)) * (contentH - scrollBarH);
        ctx.fillStyle = 'rgba(255, 136, 0, 0.3)';
        ctx.fillRect(PANEL_X + PANEL_W - 6, scrollBarY, 4, scrollBarH);
    }

    ctx.restore(); // 恢复裁剪
    ctx.restore(); // 恢复最外层save
}

// ============ 触摸处理 ============

// 返回 true 表示事件被GM面板消费，不应传递给游戏
export function handleGMTouchStart(tx: number, ty: number): boolean {
    // 检测GM按钮点击
    if (Math.hypot(tx - BTN_X, ty - BTN_Y) <= BTN_RADIUS + 5) {
        _open = !_open;
        _editingItem = null;
        _editingValue = '';
        _scrollY = 0;
        return true;
    }

    if (!_open) return false;

    // 检测是否在面板区域内
    if (tx < PANEL_X || tx > PANEL_X + PANEL_W || ty < PANEL_Y || ty > PANEL_Y + PANEL_H) {
        return false;
    }

    // 检测tab点击
    if (ty >= PANEL_Y && ty <= PANEL_Y + TAB_H) {
        const tabW = PANEL_W / TABS.length;
        const tabIdx = Math.floor((tx - PANEL_X) / tabW);
        if (tabIdx >= 0 && tabIdx < TABS.length) {
            _activeTab = tabIdx;
            _scrollY = 0;
            _editingItem = null;
            _editingValue = '';
        }
        return true;
    }

    // 检测条目点击
    const contentY = PANEL_Y + TAB_H + 2;
    const contentH = PANEL_H - TAB_H - 4;
    if (ty >= contentY && ty <= contentY + contentH) {
        const tab = TABS[_activeTab];
        if (!tab) return true;

        // 记录滚动起始
        _scrollTouchStartY = ty;
        _scrollStartY = _scrollY;

        const relY = ty - contentY + _scrollY;
        const itemIdx = Math.floor((relY - ITEM_PAD) / ITEM_H);

        if (itemIdx >= 0 && itemIdx < tab.items.length) {
            const item = tab.items[itemIdx];
            const labelW = PANEL_W * LABEL_W_RATIO;
            const valueX = PANEL_X + labelW + 4;
            const valueW = PANEL_W - labelW - 12;

            if (item.type === 'number') {
                const numItem = item as GMNumberItem;
                const step = numItem.step ?? 1;
                const minusBtnX = valueX;
                const minusBtnW = 24;
                const inputX = minusBtnX + minusBtnW + 2;
                const inputW = valueW - minusBtnW * 2 - 4;
                const plusBtnX = inputX + inputW + 2;

                // 减号
                if (tx >= minusBtnX && tx <= minusBtnX + minusBtnW) {
                    let val = getConfigValue(numItem.path);
                    if (typeof val === 'number') {
                        val -= step;
                        if (numItem.min !== undefined) val = Math.max(numItem.min, val);
                        const precision = numItem.precision ?? 0;
                        val = parseFloat(val.toFixed(precision));
                        setConfigValue(numItem.path, val);
                    }
                    _editingItem = null;
                    return true;
                }

                // 加号
                if (tx >= plusBtnX && tx <= plusBtnX + minusBtnW) {
                    let val = getConfigValue(numItem.path);
                    if (typeof val === 'number') {
                        val += step;
                        if (numItem.max !== undefined) val = Math.min(numItem.max, val);
                        const precision = numItem.precision ?? 0;
                        val = parseFloat(val.toFixed(precision));
                        setConfigValue(numItem.path, val);
                    }
                    _editingItem = null;
                    return true;
                }

                // 数值框点击 -> 进入编辑模式
                if (tx >= inputX && tx <= inputX + inputW) {
                    if (_editingItem === numItem.path) {
                        // 已在编辑，不做处理
                    } else {
                        _editingItem = numItem.path;
                        const currentVal = getConfigValue(numItem.path);
                        const precision = numItem.precision ?? 0;
                        _editingValue = typeof currentVal === 'number' ? currentVal.toFixed(precision) : String(currentVal);
                        // 调起键盘
                        _showKeyboard(numItem);
                    }
                    return true;
                }
            } else if (item.type === 'bool') {
                // 切换bool值
                const currentVal = !!getConfigValue(item.path);
                setConfigValue(item.path, !currentVal);
                return true;
            }
        }
        return true;
    }

    return true;
}

export function handleGMTouchMove(tx: number, ty: number): boolean {
    if (!_open) return false;

    // 面板区域内的滑动 -> 滚动
    if (tx >= PANEL_X && tx <= PANEL_X + PANEL_W && ty >= PANEL_Y && ty <= PANEL_Y + PANEL_H) {
        const dy = _scrollTouchStartY - ty;
        const tab = TABS[_activeTab];
        if (tab) {
            const contentH = PANEL_H - TAB_H - 4;
            const totalH = tab.items.length * ITEM_H;
            const maxScroll = Math.max(0, totalH - contentH);
            _scrollY = Math.max(0, Math.min(maxScroll, _scrollStartY + dy));
        }
        return true;
    }

    return false;
}

export function handleGMTouchEnd(tx: number, ty: number): boolean {
    if (!_open) return false;

    // 面板区域内的触摸结束
    if (tx >= PANEL_X && tx <= PANEL_X + PANEL_W && ty >= PANEL_Y && ty <= PANEL_Y + PANEL_H) {
        return true;
    }

    return false;
}

// ============ 键盘输入（微信小游戏） ============

function _showKeyboard(item: GMNumberItem): void {
    const wxAny = wx as any;
    try {
        wxAny.showKeyboard({
            defaultValue: _editingValue,
            maxLength: 12,
            multiple: false,
            confirmHold: false,
            confirmType: 'done',
        });

        // 监听键盘输入
        wxAny.onKeyboardInput((res: { value: string }) => {
            _editingValue = res.value;
        });

        wxAny.onKeyboardConfirm((res: { value: string }) => {
            _applyEditingValue(item);
            wxAny.offKeyboardInput();
            wxAny.offKeyboardConfirm();
            wxAny.offKeyboardComplete();
        });

        wxAny.onKeyboardComplete(() => {
            _applyEditingValue(item);
            wxAny.offKeyboardInput();
            wxAny.offKeyboardConfirm();
            wxAny.offKeyboardComplete();
        });
    } catch (e) {
        // 键盘不可用时（如PC调试），忽略
        console.warn('[GM] 键盘调起失败:', e);
    }
}

function _applyEditingValue(item: GMNumberItem): void {
    if (_editingItem) {
        const val = parseFloat(_editingValue);
        if (!isNaN(val)) {
            let finalVal = val;
            if (item.min !== undefined) finalVal = Math.max(item.min, finalVal);
            if (item.max !== undefined) finalVal = Math.min(item.max, finalVal);
            const precision = item.precision ?? 0;
            finalVal = parseFloat(finalVal.toFixed(precision));
            setConfigValue(_editingItem, finalVal);
        }
    }
    _editingItem = null;
    _editingValue = '';
}

// ============ 辅助函数 ============

function _rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
}
