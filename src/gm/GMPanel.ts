// GM面板状态与交互逻辑
// 负责面板状态管理、触摸处理、键盘输入、CONFIG 读写
// 绘制逻辑在 GMRender.ts，参数配置在 GMConfig.ts

import { CONFIG } from '../core/config';
import {
    TABS, GMNumberItem,
    BTN_RADIUS, BTN_X, BTN_Y,
    PANEL_X, PANEL_Y, PANEL_W, PANEL_H,
    TAB_H, ITEM_H, ITEM_PAD, LABEL_W_RATIO, INPUT_H,
} from './GMConfig';

// 重新导出绘制函数，保持外部引用不变
export { drawGMButton, drawGMPanel } from './GMRender';

// ============ 面板状态 ============

let _open = false;           // 面板是否打开
let _activeTab = 0;          // 当前激活的tab索引
let _scrollY = 0;            // 当前tab内容滚动偏移
let _editingItem: string | null = null;  // 正在编辑的条目路径
let _editingValue = '';      // 编辑中的文本值
let _scrollTouchStartY = 0;  // 滚动触摸起始Y
let _scrollStartY = 0;       // 滚动起始偏移

// ============ 状态访问接口（供 GMRender 使用） ============

export function getGMState() {
    return {
        open: _open,
        activeTab: _activeTab,
        scrollY: _scrollY,
        editingItem: _editingItem,
        editingValue: _editingValue,
    };
}

// ============ CONFIG 读写工具 ============

export function getConfigValue(path: string): any {
    const parts = path.split('.');
    let obj: any = CONFIG;
    for (const p of parts) {
        if (obj == null) return undefined;
        obj = obj[p];
    }
    return obj;
}

export function setConfigValue(path: string, value: any): void {
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
