// GM面板状态与交互逻辑
// 负责面板状态管理、触摸处理、键盘输入、CONFIG 读写
// 绘制逻辑在 GMRender.ts，参数配置在 GMConfig.ts

import { CONFIG } from '../core/config';
import {
    TABS, GMNumberItem, GMActionItem,
    BTN_RADIUS, BTN_X, BTN_Y,
    PANEL_DEFAULT_X, PANEL_DEFAULT_Y, PANEL_W, PANEL_H,
    DRAG_BAR_H, TAB_H, TAB_FIXED_W,
    ITEM_H, ITEM_PAD, LABEL_W_RATIO, INPUT_H,
} from './GMConfig';
import { logicW, logicH } from '../render/Canvas';
import { state, player } from '../core/state';
import { createFishEnemy, findMazeFishSpawnPosition, findSafeSpawnPosition } from '../logic/FishEnemy';

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

// 面板位置（可拖动）
let _panelX = PANEL_DEFAULT_X;
let _panelY = PANEL_DEFAULT_Y;

// 拖动状态
let _dragging = false;
let _dragOffsetX = 0;
let _dragOffsetY = 0;

// Tab 滑动状态
let _tabScrollX = 0;
let _tabScrolling = false;
let _tabScrollTouchStartX = 0;
let _tabScrollStartX = 0;

// ============ 状态访问接口（供 GMRender 使用） ============

export function getGMState() {
    return {
        open: _open,
        activeTab: _activeTab,
        scrollY: _scrollY,
        editingItem: _editingItem,
        editingValue: _editingValue,
        panelX: _panelX,
        panelY: _panelY,
        tabScrollX: _tabScrollX,
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
    if (tx < _panelX || tx > _panelX + PANEL_W || ty < _panelY || ty > _panelY + PANEL_H) {
        return false;
    }

    // 检测拖动条点击（面板顶部边框区域）
    if (ty >= _panelY && ty <= _panelY + DRAG_BAR_H) {
        _dragging = true;
        _dragOffsetX = tx - _panelX;
        _dragOffsetY = ty - _panelY;
        return true;
    }

    // 检测tab点击（拖动条下方）
    const tabY = _panelY + DRAG_BAR_H;
    if (ty >= tabY && ty <= tabY + TAB_H) {
        // 计算总 tab 宽度，判断是否需要滑动
        const totalTabW = TABS.length * TAB_FIXED_W;
        if (totalTabW > PANEL_W) {
            // 可滑动模式：记录起始位置用于判断是点击还是滑动
            _tabScrolling = true;
            _tabScrollTouchStartX = tx;
            _tabScrollStartX = _tabScrollX;
        }
        // 计算点击了哪个 tab
        const relX = tx - _panelX + _tabScrollX;
        const tabIdx = Math.floor(relX / TAB_FIXED_W);
        if (tabIdx >= 0 && tabIdx < TABS.length) {
            _activeTab = tabIdx;
            _scrollY = 0;
            _editingItem = null;
            _editingValue = '';
        }
        return true;
    }

    // 检测条目点击
    const contentY = _panelY + DRAG_BAR_H + TAB_H + 2;
    const contentH = PANEL_H - DRAG_BAR_H - TAB_H - 4;
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
            const valueX = _panelX + labelW + 4;
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
            } else if (item.type === 'action') {
                // 执行 action 操作
                _executeAction((item as GMActionItem).actionId);
                return true;
            }
        }
        return true;
    }

    return true;
}

export function handleGMTouchMove(tx: number, ty: number): boolean {
    if (!_open) return false;

    // 拖动面板
    if (_dragging) {
        let newX = tx - _dragOffsetX;
        let newY = ty - _dragOffsetY;
        // 限制面板不超出屏幕
        newX = Math.max(0, Math.min(logicW - PANEL_W, newX));
        newY = Math.max(0, Math.min(logicH - PANEL_H, newY));
        _panelX = newX;
        _panelY = newY;
        return true;
    }

    // Tab 滑动
    if (_tabScrolling) {
        const dx = _tabScrollTouchStartX - tx;
        const totalTabW = TABS.length * TAB_FIXED_W;
        const maxScroll = Math.max(0, totalTabW - PANEL_W);
        _tabScrollX = Math.max(0, Math.min(maxScroll, _tabScrollStartX + dx));
        return true;
    }

    // 面板区域内的滑动 -> 内容滚动
    if (tx >= _panelX && tx <= _panelX + PANEL_W && ty >= _panelY && ty <= _panelY + PANEL_H) {
        const dy = _scrollTouchStartY - ty;
        const tab = TABS[_activeTab];
        if (tab) {
            const contentH = PANEL_H - DRAG_BAR_H - TAB_H - 4;
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

    // 结束拖动
    if (_dragging) {
        _dragging = false;
        return true;
    }

    // 结束 Tab 滑动
    if (_tabScrolling) {
        _tabScrolling = false;
        return true;
    }

    // 面板区域内的触摸结束
    if (tx >= _panelX && tx <= _panelX + PANEL_W && ty >= _panelY && ty <= _panelY + PANEL_H) {
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

// ============ Action 操作处理 ============

function _executeAction(actionId: string): void {
    switch (actionId) {
        case 'spawnMazeFish': {
            // 在迷宫模式下生成一条食人鱼
            if (state.screen === 'mazeRescue' && state.mazeRescue) {
                const pos = findMazeFishSpawnPosition();
                state.fishEnemies.push(createFishEnemy(pos.x, pos.y));
                console.log(`[GM] 生成食人鱼 @ (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})，当前共 ${state.fishEnemies.length} 条`);
            } else if (state.screen === 'fishArena' || state.screen === 'play') {
                // 主线/竞技场模式：在玩家附近生成
                const pos = findSafeSpawnPosition(player.x, player.y);
                state.fishEnemies.push(createFishEnemy(pos.x, pos.y));
                console.log(`[GM] 生成食人鱼 @ (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})，当前共 ${state.fishEnemies.length} 条`);
            } else {
                console.log('[GM] 当前不在游戏中，无法生成食人鱼');
            }
            break;
        }
        case 'killAllFish': {
            // 杀死所有食人鱼（触发死亡动画）
            if (state.fishEnemies && state.fishEnemies.length > 0) {
                let count = 0;
                for (const fish of state.fishEnemies) {
                    if (fish.state !== 'dying' && !fish.dead) {
                        fish.state = 'dying' as any;
                        fish.dyingTimer = 0;
                        fish.dyingAlpha = 1;
                        fish.dyingRoll = 0;
                        fish.vx = 0;
                        fish.vy = 0;
                        count++;
                    }
                }
                console.log(`[GM] 杀死 ${count} 条食人鱼`);
            } else {
                console.log('[GM] 当前没有食人鱼');
            }
            break;
        }
        case 'removeAllFish': {
            // 直接清除所有食人鱼（不播放动画）
            const count = state.fishEnemies ? state.fishEnemies.length : 0;
            state.fishEnemies = [];
            console.log(`[GM] 清除 ${count} 条食人鱼`);
            break;
        }
        default:
            console.log(`[GM] 未知操作: ${actionId}`);
    }
}
