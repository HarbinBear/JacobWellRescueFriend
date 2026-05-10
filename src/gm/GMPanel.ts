// GM面板状态与交互逻辑
// 负责面板状态管理、触摸处理、键盘输入、CONFIG 读写
// 绘制逻辑在 GMRender.ts，参数配置在 GMConfig.ts

import { CONFIG } from '../core/config';
import {
    TABS, GMNumberItem, GMActionItem, GMSelectItem,
    PANEL_DEFAULT_X, PANEL_DEFAULT_Y, PANEL_W, PANEL_H,
    DRAG_BAR_H, TAB_H, TAB_FIXED_W,
    ITEM_H, ITEM_PAD, LABEL_W_RATIO, INPUT_H,
} from './GMConfig';
import { state, player } from '../core/state';
import { createFishEnemy, findMazeFishSpawnPosition, findSafeSpawnPosition } from '../logic/FishEnemy';
import { setPreset, onItemEdited as qualityOnItemEdited, setAuto as qualitySetAuto } from '../render/QualityManager';
import { playSFX } from '../audio/AudioManager';
// GM 调试：扣氧时同步触发氧气环红色损失动画
import { triggerO2LossFlash } from '../logic/OxygenTank';
// 撤离玩法：GM 调试 action（加钱 / 重置经济等）
import {
    addCoins as exAddCoins,
    resetExtractionState as exResetState,
    clearExtractionSave as exClearSave,
    addToBag as exAddToBag,
    rollCondition as exRollCondition,
    getCoins as exGetCoins,
    getExtractionState as exGetState,
    findNearbyPickupRelic as exFindNearbyRelic,
    ExtractionEnabled as exEnabled,
} from '../extraction';
import { ALL_RELIC_KINDS } from '../logic/Relic';
// 减压系统：GM 调试 action
import { getDecoRuntime, triggerDecoPenaltyOnSurface, resetDecompressionSystem } from '../logic/DecompressionSystem';
import { ensureExtractionState as exEnsureState } from '../extraction/core/ExtractionState';

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

// 对外：HUD 栏 GM 图标短按触发的统一切换入口
// 取代旧的屏幕顶部独立 GM 按钮 hit-test
export function toggleGMOpen(): void {
    _open = !_open;
    _editingItem = null;
    _editingValue = '';
    _scrollY = 0;
}

// ============ 触摸处理 ============

// 返回 true 表示事件被GM面板消费，不应传递给游戏
export function handleGMTouchStart(tx: number, ty: number): boolean {
    // 旧的独立 GM 按钮 hit-test 已废弃；现在 HUD 栏打包第五个 HUD 项，
    // 由 HUDTopLeft 在 onShortTap 里直接调 toggleGMOpen()。此处不再做按钮判定。

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
            if (_activeTab !== tabIdx) playSFX('uiSecondary');
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
                        _notifyQualityItemEdit(numItem.path);
                        playSFX('uiSecondary');
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
                        _notifyQualityItemEdit(numItem.path);
                        playSFX('uiSecondary');
                    }
                    _editingItem = null;
                    return true;
                }

                // 数值框点击 -> 进入编辑模式
                if (tx >= inputX && tx <= inputX + inputW) {
                    if (_editingItem === numItem.path) {
                        // 已在编辑，不做处理
                    } else {
                        playSFX('uiSecondary');
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
                _notifyQualityItemEdit(item.path);
                playSFX('uiSecondary');
                return true;
            } else if (item.type === 'select') {
                // select 类型：左右箭头切换
                const selItem = item as GMSelectItem;
                const currentVal = String(getConfigValue(selItem.path) ?? '');
                const idx = selItem.options.indexOf(currentVal);
                const leftBtnX = valueX;
                const leftBtnW = 24;
                const rightBtnX = valueX + valueW - 24;
                const rightBtnW = 24;
                if (tx >= leftBtnX && tx <= leftBtnX + leftBtnW) {
                    // 左箭头：上一个
                    const newIdx = idx > 0 ? idx - 1 : selItem.options.length - 1;
                    const newVal = selItem.options[newIdx];
                    setConfigValue(selItem.path, newVal);
                    _notifyQualitySelectChange(selItem.path, newVal);
                    playSFX('uiSecondary');
                    return true;
                }
                if (tx >= rightBtnX && tx <= rightBtnX + rightBtnW) {
                    // 右箭头：下一个
                    const newIdx = idx < selItem.options.length - 1 ? idx + 1 : 0;
                    const newVal = selItem.options[newIdx];
                    setConfigValue(selItem.path, newVal);
                    _notifyQualitySelectChange(selItem.path, newVal);
                    playSFX('uiSecondary');
                    return true;
                }
                return true;
            } else if (item.type === 'action') {
                // 执行 action 操作（实质执行类主按钮）
                playSFX('uiPrimary');
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
        // 完全放开屏幕边界限制：面板可被拖出屏幕外（便于调试时让出画面不遮挡）
        _panelX = tx - _dragOffsetX;
        _panelY = ty - _dragOffsetY;
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
            _notifyQualityItemEdit(_editingItem);
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
        // ========== 撤离玩法调试 ==========
        case 'extractionAdd100': {
            exAddCoins(100);
            console.log('[GM][Extraction] +100 金，当前 ' + exGetCoins() + ' 金');
            break;
        }
        case 'extractionAdd1000': {
            exAddCoins(1000);
            console.log('[GM][Extraction] +1000 金，当前 ' + exGetCoins() + ' 金');
            break;
        }
        case 'extractionReset': {
            exClearSave();
            console.log('[GM][Extraction] 撤离玩法已重置为新手起步状态');
            break;
        }
        case 'extractionFillBag': {
            // 给背包随便塞一件随机古物（调试 UI 用）
            const ex = exGetState();
            if (ex) {
                const kind = ALL_RELIC_KINDS[Math.floor(Math.random() * ALL_RELIC_KINDS.length)];
                const condition = exRollCondition('defaultPool');
                const it = exAddToBag(kind, condition);
                if (it) console.log('[GM][Extraction] 背包入物：' + kind + ' (' + condition + ')');
                else console.log('[GM][Extraction] 背包已满');
            }
            break;
        }
        case 'extractionDrainO2_10':
        case 'extractionDrainO2_50': {
            // 调试：直接扣玩家氧气（用于测试低氧、双瓶切换、超深红警等）
            // 在迷宫模式（mazeRescue 的 phase=play）以及主线 play 模式都生效；其他界面忽略
            const drain = actionId === 'extractionDrainO2_10' ? 10 : 50;
            const fromO2 = player.o2;
            const toO2 = Math.max(0, fromO2 - drain);
            player.o2 = toO2;
            // 在迷宫模式触发氧气环上的红色损失弧动画
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
                triggerO2LossFlash(fromO2, toO2);
            }
            console.log('[GM][Extraction] -' + drain + ' 氧气：' + fromO2.toFixed(1) + ' → ' + toO2.toFixed(1) + ' / ' + (player.o2Max || 100));
            break;
        }
        case 'extractionDumpState': {
            const ex = exGetState();
            console.log('[GM][Extraction] state.extraction =', ex);
            break;
        }
        case 'extractionDebugRelics': {
            // 调试：输出当前关 relic 状况 + 玩家附近 relic 距离 + 撤离系统启用状态
            const maze: any = state.mazeRescue;
            console.log('[Debug][Relic] state.screen=' + state.screen);
            console.log('[Debug][Relic] mazeRescue.phase=' + (maze ? maze.phase : 'NO_MAZE'));
            const relics: any[] = maze && maze.relics ? maze.relics : [];
            console.log('[Debug][Relic] relics.length=' + relics.length);
            const ex = exGetState();
            const picked = ex ? ex.diveSession.pickedRelicIds : [];
            console.log('[Debug][Relic] state.extraction=', ex ? '存在' : 'null');
            console.log('[Debug][Relic] 本次已拾取=' + (picked || []).length);
            // 找前 5 个最近的 relic 与玩家的距离
            if (relics.length > 0) {
                const distances: { id: number; kind: string; dist: number; picked: boolean }[] = [];
                const pickedSet = new Set(picked);
                for (const r of relics) {
                    distances.push({
                        id: r.id,
                        kind: r.kind,
                        dist: Math.round(Math.hypot(player.x - r.x, player.y - r.y)),
                        picked: pickedSet.has(r.id),
                    });
                }
                distances.sort((a, b) => a.dist - b.dist);
                console.log('[Debug][Relic] 玩家位置=(' + Math.round(player.x) + ',' + Math.round(player.y) + ')');
                console.log('[Debug][Relic] 最近 5 个：');
                for (let i = 0; i < Math.min(5, distances.length); i++) {
                    console.log('  [' + i + '] kind=' + distances[i].kind +
                                ' dist=' + distances[i].dist + 'px' +
                                (distances[i].picked ? ' (已拾取)' : ''));
                }
            }
            // 测试 findNearbyPickupRelic 返回值
            const nearby = exFindNearbyRelic();
            console.log('[Debug][Relic] findNearbyPickupRelic 返回=' + (nearby ? '找到 id=' + nearby.id + ' kind=' + nearby.kind : 'null'));
            console.log('[Debug][Relic] ExtractionEnabled=' + exEnabled());
            break;
        }
        default:
            // ---- 减压系统 action ----
            if (actionId === 'decoSetYellow' || actionId === 'decoSetRed' || actionId === 'decoSetCritical' || actionId === 'decoClear') {
                // 直接改运行时 nitrogenLoad，同时清空当前减压任务（让系统下一帧按新负荷重新生成任务）
                const rt = getDecoRuntime() as any;
                let target = 0;
                if (actionId === 'decoSetYellow') target = 0.7;
                else if (actionId === 'decoSetRed') target = 1.1;
                else if (actionId === 'decoSetCritical') target = 1.6;
                rt.nitrogenLoad = target;
                rt.currentStopIdx = -1;
                rt.stopProgress = [0, 0, 0, 0];
                rt.hasShownWarning = false;
                console.log('[GM][Deco] nitrogenLoad=' + target);
                break;
            }
            if (actionId === 'decoTriggerPenaltyLv1' || actionId === 'decoTriggerPenaltyLv2') {
                // 先把 N2 拉到对应阈值，再触发一次 surface 惩罚判定
                const rt = getDecoRuntime() as any;
                rt.nitrogenLoad = actionId === 'decoTriggerPenaltyLv2' ? 1.6 : 1.1;
                const sev = triggerDecoPenaltyOnSurface();
                console.log('[GM][Deco] 模拟触发 DCS 惩罚，severity=' + sev);
                // 不清零 N2，让玩家继续看 HUD 变化
                break;
            }
            if (actionId === 'decoClearPenalty') {
                const ex = exEnsureState() as any;
                ex.decoPenalty = undefined;
                resetDecompressionSystem();
                console.log('[GM][Deco] 已清除 decoPenalty 并重置运行时');
                break;
            }
            if (actionId === 'decoDump') {
                const rt = getDecoRuntime();
                const ex = exGetState() as any;
                console.log('[GM][Deco] runtime=', rt);
                console.log('[GM][Deco] decoPenalty=', ex ? ex.decoPenalty : '(no extraction state)');
                break;
            }
            console.log(`[GM] 未知操作: ${actionId}`);
    }
}

// ============ 画质预设联动辅助 ============

// 画质小项路径前缀
const _qualityItemPaths = ['quality.scale', 'quality.rayCount', 'quality.vplMax', 'quality.enableScatter', 'quality.enableNpcVol', 'quality.skipOcclusion'];

// 当 GM 面板手动改了画质小项时，通知 QualityManager 把 preset 置为 custom
function _notifyQualityItemEdit(path: string): void {
    if (_qualityItemPaths.includes(path)) {
        qualityOnItemEdited();
    }
    // auto 开关特殊处理
    if (path === 'quality.auto') {
        qualitySetAuto(!!getConfigValue('quality.auto'));
    }
}

// 当 GM 面板改了 select 类型的画质预设时，通知 QualityManager 同步小项
function _notifyQualitySelectChange(path: string, newVal: string): void {
    if (path === 'quality.preset') {
        setPreset(newVal);
    }
}
