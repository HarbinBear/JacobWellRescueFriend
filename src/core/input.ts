import { CONFIG } from './config';
import { state, input, touches, player } from './state';
import { createFishEnemy, triggerPlayerAttack, findSafeSpawnPosition } from '../logic/FishEnemy';
import { DEBUG_FISH_BTN, ATTACK_BTN, FLASHLIGHT_BTN } from '../render/RenderUI';
import { isGMOpen, handleGMTouchStart, handleGMTouchMove, handleGMTouchEnd } from '../gm/GMPanel';
import { handleHUDTouchStart, handleHUDTouchMove, handleHUDTouchEnd } from '../render/HUDTopLeft';
import { buildWheelSectors, executeWheelAction } from '../logic/Marker';
import { ALL_RELIC_KINDS } from '../logic/Relic';
import { getWheelBtnPos } from '../render/RenderWheel';
// 撤离玩法：UI hit-test 入口集中导入
import {
    getSellAllBtnRect,
    performSellAll,
    isShopOpen,
    openShop,
    closeShop,
    performShopBuy,
    performShopRerollAction,
    openShopSlotDetail,
    getShopEntryBtnRect,
    getShopCloseBtnRect,
    getShopRerollBtnRect,
    getShopSlotHitTests,
    getShopBuyBtnRect,
    isDetailCardOpen,
    closeDetailCard,
    getDetailCardData,
    getDetailCardCloseRect,
    getDetailCardActionRect,
    listDetailCardActionIds,
    discardBagItemAtPlayer,
    // 背包 HUD（胶囊态）
    getInventoryHUDCapsuleRect,
    openBagFullPage,
    isBagFullPageOpen,
    // 背包全屏页（拖拽与单击）
    onBagPageTouchStart,
    onBagPageTouchMove,
    onBagPageTouchEnd,
    // 仓库全屏页
    isWarehousePageOpen,
    openWarehousePage,
    closeWarehousePage,
    getWarehouseCloseBtnRect,
    getWarehouseSellAllBtnRect,
    getWarehouseSlotHitTests,
    getWarehouseEntryBtnRect,
    openWarehouseItemDetail,
    performWarehouseSell,
    performWarehouseSellAll,
} from '../extraction';
import {
    getBriefingAcceptBtnRect,
    getAbandonBtnRect,
    getResolvedIdleNewCaseBtnRect,
    getResolvedBtnRects,
    getAbandonedAcceptBtnRect,
    getCodexEntryBtnRect,
    getCodexCloseBtnRect,
    getCodexCellCount,
    getCodexCellRectByIndex,
} from '../render/RenderMazeUI';
import { tryShoreButtonBar } from '../render/mazeUI/ShoreButtonBar';
import { handleHomeTap, handleHomeDrag, replayNight } from '../story/HomeScene';
import { getMenuButtonRects, getNewGameConfirmRects, MenuButtonId } from '../render/RenderMenu';
import { getProgressBackBtnRect, getProgressCardRect, getUnlockedScenes } from '../render/RenderProgressSelect';
import { clearStoryProgress } from '../story/StoryProgressSave';
import { clearMazeSave } from '../logic/MazeSave';
import { playSFX } from '../audio/AudioManager';

// 放弃救援按钮长按状态
let abandonTouchId = null;

// 攻击按钮独立触点 ID（多点触控：与摇杆互不干扰）
let attackTouchId: number | null = null;

// 迷宫救援长按触点 ID
let mazeRescueTouchId: number | null = null;

// 迷宫撤离长按触点 ID
let mazeRetreatTouchId: number | null = null;

// 岸上页面触摸起始位置
let shoreTouchStartX = 0;
let shoreTouchStartY = 0;

// 主菜单触摸起始位置（用于 touchEnd 判断点击）
let menuTouchStartX = 0;
let menuTouchStartY = 0;

// 家场景：多点 touch 跟踪（按 identifier 索引）
const _homeTouchPrev: { [id: number]: number } = {};
const _homeTouchStartX: { [id: number]: number } = {};
const _homeTouchStartY: { [id: number]: number } = {};
const _homeTouchMoved: { [id: number]: boolean } = {};

// 主菜单按钮 → 行为
function handleMenuButton(id: MenuButtonId, onMaze?: () => void) {
    switch (id) {
        case 'continue':
            // 直接进迷宫救援营地（旧存档由 resetMazeLogic 自动 loadMazeProgress）
            if (onMaze) onMaze();
            return;
        case 'progress':
            state.screen = 'progressSelect';
            return;
        case 'newGame':
            (state as any)._menuConfirmNewGame = true;
            return;
        case 'settings':
            // 占位，阶段 4 暂不实装
            return;
    }
}

function consumeNextManualStrokeSide() {
    const md = state.manualDrive;
    const side = md.nextStrokeSide;
    md.nextStrokeSide = side > 0 ? -1 : 1;
    return side;
}

export function initInput(onReset, onArena?, onMaze?, onMazeReplay?, onMazeDive?, onReturnToShore?, onAbandonCase?, onAcceptNewCase?, onStayInResolvedCase?, onMarkBriefingShown?, onEnterResolved?) {
    // PC 调试键盘支持 
    if (typeof window !== 'undefined' && window.addEventListener) {
        const keys = { w: false, a: false, s: false, d: false, shift: false };
        
        const updateKeyInput = () => {
            // 如果有触摸操作，优先触摸
            if (touches.joystickId !== null) return;

            let dx = 0, dy = 0;
            if (keys.w) dy -= 1;
            if (keys.s) dy += 1;
            if (keys.a) dx -= 1;
            if (keys.d) dx += 1;

            if (CONFIG.manualDrive.enabled) {
                // 手动挡模式：键盘模拟持续搓屏
                // 每次 updateKeyInput 被调用（keydown/keyup），更新虚拟触点
                // 关键：curr 每帧递增，让逻辑层能检测到帧间位移
                const md = state.manualDrive;
                if (dx !== 0 || dy !== 0) {
                    // 键盘不需要反转方向，直接用方向向量
                    const step = 20; // 每帧虚拟位移步长（像素）
                    if (!md.activeTouches[-1]) {
                        md.activeTouches[-1] = {
                            startX: 0, startY: 0,
                            prevX: 0, prevY: 0,
                            currX: dx * step, currY: dy * step,
                            strokeSide: consumeNextManualStrokeSide(),
                            consumedDistance: 0,
                            finished: false,
                        };
                    } else {
                        const td = md.activeTouches[-1];
                        // curr 在方向上持续递增（不重置 prev，由逻辑层推进）
                        td.currX += dx * step;
                        td.currY += dy * step;
                    }
                } else {
                    delete md.activeTouches[-1];
                }
                input.move = 0;
                input.speedUp = false;
            } else if (dx !== 0 || dy !== 0) {
                input.move = 1;
                input.targetAngle = Math.atan2(dy, dx);
                input.speedUp = keys.shift;
            } else {
                input.move = 0;
                input.speedUp = false;
            }
        };

        // 手动挡键盘：不再需要 prevKeys 和脉冲产生逻辑，updateKeyInput 已处理

        window.addEventListener('keydown', (e) => {
            if(state.screen === 'menu') {
                if(e.code === 'Space') {
                    if(!state.transition.active) {
                        state.transition.active = true;
                        state.transition.alpha = 0;
                        state.transition.mode = 'out';
                        state.transition.callback = () => {
                            if (onReset) onReset();
                        };
                    }
                }
                return;
            }

            if(state.screen !== 'play') {
                // 旧主线 ending 分支已废弃。
                if(e.code === 'Space') state.screen = 'menu';
                return;
            }
            
            switch(e.key.toLowerCase()) {
                case 'w': keys.w = true; break;
                case 'a': keys.a = true; break;
                case 's': keys.s = true; break;
                case 'd': keys.d = true; break;
                case 'shift': keys.shift = true; break;
            }
            updateKeyInput();
        });

        window.addEventListener('keyup', (e) => {
            switch(e.key.toLowerCase()) {
                case 'w': keys.w = false; break;
                case 'a': keys.a = false; break;
                case 's': keys.s = false; break;
                case 'd': keys.d = false; break;
                case 'shift': keys.shift = false; break;
            }
            updateKeyInput();
        });
    }

    wx.onTouchStart((res) => {
        // GM 面板优先消费触摸事件（面板本身或 HUD 栏的 GM 齿轮按钮）
        const gmTouch = res.touches[res.touches.length - 1];
        if (gmTouch && handleGMTouchStart(gmTouch.clientX, gmTouch.clientY)) {
            return;
        }

        // === 撤离玩法：物品详情卡（最高优先级，遮罩拦截全屏） ===
        // 详情卡打开时，所有点击都进入这个分支，不会下传给迷宫/HUD/轮盘
        if (isDetailCardOpen()) {
            const t = res.changedTouches[0] || res.touches[res.touches.length - 1];
            if (!t) return;
            const tx = t.clientX, ty = t.clientY;

            // 点关闭 X
            const xR = getDetailCardCloseRect();
            if (xR && tx >= xR.x && tx <= xR.x + xR.w && ty >= xR.y && ty <= xR.y + xR.h) {
                playSFX('uiSecondary');
                closeDetailCard();
                return;
            }

            // 点动作按钮（遍历）
            const actionIds = listDetailCardActionIds();
            for (const aid of actionIds) {
                const ar = getDetailCardActionRect(aid);
                if (ar && tx >= ar.x && tx <= ar.x + ar.w && ty >= ar.y && ty <= ar.y + ar.h) {
                    handleDetailCardAction(aid);
                    return;
                }
            }
            // 点其他位置（遮罩）→ 关闭
            // （为避免误关，限制一下：必须落在卡片外）
            // 简化：直接关闭
            playSFX('uiSecondary');
            closeDetailCard();
            return;
        }

        // === 撤离玩法：背包全屏页（仅 play 阶段；最高优先级，独占触摸）===
        if (isBagFullPageOpen()) {
            const t = res.changedTouches[0] || res.touches[res.touches.length - 1];
            if (t) {
                onBagPageTouchStart(t.clientX, t.clientY);
            }
            return;
        }

        // === 撤离玩法：水下点击背包胶囊 → 打开全屏背包页 ===
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
            const t = res.changedTouches[0] || res.touches[res.touches.length - 1];
            if (t) {
                const cap = getInventoryHUDCapsuleRect();
                if (cap && t.clientX >= cap.x && t.clientX <= cap.x + cap.w &&
                    t.clientY >= cap.y && t.clientY <= cap.y + cap.h) {
                    playSFX('uiSecondary');
                    openBagFullPage();
                    // 立刻清空玩家移动输入，避免打开背包页时角色继续滑行
                    input.move = 0;
                    input.speedUp = false;
                    touches.joystickId = null;
                    return;
                }
            }
        }

        // 左上角 HUD 栏始终优先（即使 GM 开着也允许交互）
        // 这样 GM 开启后可以再点齿轮图标关闭，也保留切音频/手动挡等能力
        // 只在迷宫 play 阶段启用；岸上/入水/结算阶段不启用，这些阶段有自己的 UI
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
            const hudTouch = res.changedTouches && res.changedTouches.length > 0 ? res.changedTouches[0] : res.touches[res.touches.length - 1];
            if (hudTouch && handleHUDTouchStart(hudTouch.identifier, hudTouch.clientX, hudTouch.clientY)) {
                return;
            }
        }

        // GM 面板打开时拦截剩余所有游戏输入（HUD 栏已在上面优先处理完）
        if (isGMOpen()) return;

        // 家场景：touchStart 阶段记录起点（用于 touchmove 拖拽），不做点击逻辑
        if (state.screen === 'home_evening') {
            for (const t of res.touches) {
                _homeTouchPrev[t.identifier] = t.clientX;
                _homeTouchStartX[t.identifier] = t.clientX;
                _homeTouchStartY[t.identifier] = t.clientY;
                _homeTouchMoved[t.identifier] = false;
            }
            return;
        }

        if(state.screen === 'menu') {
            const touch = res.touches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;

            // 主菜单：只记录起始位置，等 touchEnd 再判断点击
            menuTouchStartX = tx;
            menuTouchStartY = ty;
            return;
        }

        // 剧情进度选择页：与主菜单共用 menuTouchStartX/Y，touchEnd 再分发
        if (state.screen === 'progressSelect') {
            const touch = res.touches[0];
            menuTouchStartX = touch.clientX;
            menuTouchStartY = touch.clientY;
            return;
        }

        if(state.screen !== 'play') {
            // 迷宫模式：岸上阶段只记录触摸起始位置
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'shore') {
                const touch = res.touches[0];
                const tx = touch.clientX;
                const ty = touch.clientY;
                shoreTouchStartX = tx;
                shoreTouchStartY = ty;
                const maze: any = state.mazeRescue;
                const cw = CONFIG.screenWidth;
                const ch = CONFIG.screenHeight;
                // 图鉴全屏页打开：只记录起点，touchEnd 做"返回"或"点空白关闭"分发
                if (maze.codexOpen) {
                    return;
                }
                // 警情通报页打开时：吃掉所有点击，touchEnd 再处理"接受任务"
                if (!maze.briefingShown && !maze.shoreMapOpen) {
                    return;
                }
                // "放弃救援"按钮按下 → 启动长按计时
                if (!maze.shoreMapOpen && maze.briefingShown) {
                    const ar = getAbandonBtnRect(cw, ch);
                    if (tx >= ar.x && tx <= ar.x + ar.w && ty >= ar.y && ty <= ar.y + ar.h) {
                        maze.abandonHolding = true;
                        maze.abandonHoldStart = Date.now();
                        maze.abandonTouchId = touch.identifier;
                    }
                }
                return;
            }
            // 迷宫模式：结案后"留在此处"阶段：与 shore 共用记录起点，touchEnd 再做按钮分发
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'resolved_idle') {
                const touch = res.touches[0];
                shoreTouchStartX = touch.clientX;
                shoreTouchStartY = touch.clientY;
                return;
            }
            // 迷宫模式：救援结案（resolved）/搜寻终止（abandoned）全屏叙事页：只记录起点
            if (state.screen === 'mazeRescue' && state.mazeRescue &&
                (state.mazeRescue.phase === 'resolved' || state.mazeRescue.phase === 'abandoned')) {
                const touch = res.touches[0];
                shoreTouchStartX = touch.clientX;
                shoreTouchStartY = touch.clientY;
                return;
            }
            // 迷宫模式：入水动效阶段不响应操作
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'diving_in') {
                return;
            }
            // 迷宫模式：上浮/失败转场阶段不响应操作
            if (state.screen === 'mazeRescue' && state.mazeRescue &&
                (state.mazeRescue.phase === 'surfacing' || state.mazeRescue.phase === 'failed')) {
                return;
            }
            // 迷宫模式：游戏进行中允许正常操作
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
                // 继续往下处理摇杆和救援按钮
            } else if (state.screen === 'mazeRescue' && state.mazeRescue &&
                (state.mazeRescue.phase === 'rescued' || state.mazeRescue.phase === 'debrief')) {
                // 迷宫结算页：等待1秒后可点击
                if (state.mazeRescue.resultTimer >= 60) {
                    // 结算页点击由 touchEnd 处理
                }
                return;
            } else if (state.screen === 'fishArena' && state.fishArena &&
                (state.fishArena.phase === 'fight' || state.fishArena.phase === 'clear' || state.fishArena.phase === 'prep')) {
                // 继续往下处理摇杆和攻击按钮
            } else {
            // 竞技场死亡结算页面：等待 2 秒后可点击返回主菜单
            if (state.screen === 'fishArena' && state.fishArena && state.fishArena.phase === 'dead') {
                if (state.fishArena.deadTimer >= 120) {
                    state.screen = 'menu';
                    state.fishArena = null;
                }
                return;
            }
            // 旧主线 ending 分支已废弃。
            // 游戏结束或失败，点击返回主菜单
            state.screen = 'menu';
            return;
            } // else 结束
        }

        // 轮盘交互按钮检测（替代旧绳索按钮）
        // 仅在 btnActive 为 true 时响应点击；灰态（btnVisible=true 但 btnActive=false）不响应
        if (state.wheel && state.wheel.btnVisible && state.wheel.btnActive && !state.wheel.open) {
            const { x: btnX, y: btnY } = getWheelBtnPos();
            for (let t of res.touches) {
                const dx = t.clientX - btnX;
                const dy = t.clientY - btnY;
                if (Math.hypot(dx, dy) <= CONFIG.marker.btnRadius) {
                    // 打开轮盘
                    const nearbyInfo = state.wheel.nearbyInfo;
                    if (nearbyInfo) {
                        const sectors = buildWheelSectors(nearbyInfo.context, !!nearbyInfo.existingMarker);
                        // 撤离玩法：拾取扇区的 label 替换为带具体物品名（"拾取 · 黄铜指南针"）
                        if (nearbyInfo.context === 'pickupRelic' && (nearbyInfo as any).pickupRelicLabel && sectors.length > 0) {
                            sectors[0].label = (nearbyInfo as any).pickupRelicLabel;
                        }
                        state.wheel.open = true;
                        state.wheel.sectors = sectors;
                        state.wheel.highlightIndex = -1;
                        state.wheel.expandProgress = 0;
                        state.wheel.touchId = t.identifier;
                        state.wheel.centerX = btnX;
                        state.wheel.centerY = btnY;
                        input.move = 0;
                        input.speedUp = false;
                        // 手动挡：冻结输入
                        if (state.manualDrive) state.manualDrive.activeTouches = {};
                    }
                    return;
                }
            }
        }

        // 遍历所有新增触点，多点触控：摇杆和攻击按钮互不干扰
        for (const t of res.changedTouches) {
            // 检测攻击按钮（右下角常驻，游戏进行中或竞技场战斗中，任意触点均可触发）
            // 被咬死亡过场期间禁止攻击
            const isBiting = state.fishBite && state.fishBite.active;
            const isGameActive = !isBiting && (
                state.screen === 'play' ||
                (state.screen === 'fishArena' && state.fishArena && state.fishArena.phase === 'fight')
            );
            if (isGameActive && attackTouchId === null) {
                const atkBtn = ATTACK_BTN;
                const adx = t.clientX - atkBtn.x;
                const ady = t.clientY - atkBtn.y;
                if (Math.hypot(adx, ady) <= atkBtn.r) {
                    attackTouchId = t.identifier;
                    triggerPlayerAttack();
                    continue;
                }
            }

            // 检测手电筒开关按钮（游戏进行中或竞技场战斗中均可切换）
            if (isGameActive) {
                const flBtn = FLASHLIGHT_BTN;
                const fdx = t.clientX - flBtn.x;
                const fdy = t.clientY - flBtn.y;
                if (Math.hypot(fdx, fdy) <= flBtn.r) {
                    state.flashlightOn = !state.flashlightOn;
                    continue;
                }
            }

            // 检测凶猛鱼调试按钮（仅在调试模式且游戏进行中）
            if (CONFIG.debug && state.screen === 'play') {
                const btn = DEBUG_FISH_BTN;
                if (
                    t.clientX >= btn.x && t.clientX <= btn.x + btn.w &&
                    t.clientY >= btn.y && t.clientY <= btn.y + btn.h
                ) {
                    const spawnPos = findSafeSpawnPosition(player.x, player.y);
                    if (!state.fishEnemies) state.fishEnemies = [];
                    state.fishEnemies.push(createFishEnemy(spawnPos.x, spawnPos.y));
                    continue;
                }
            }

            // 迷宫模式：检测救援长按（靠近NPC时，仅正式救援下潜）
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
                const maze = state.mazeRescue;
                // 救援绑绳（发现NPC后即可绑绳，不区分下潜类型）
                if (!maze.npcRescued && state.npc.active && mazeRescueTouchId === null) {
                    const zoom = state.camera ? state.camera.zoom : 1;
                    const camX = state.camera ? state.camera.x + state.camera.swayX : player.x;
                    const camY = state.camera ? state.camera.y + state.camera.swayY : player.y;
                    const npcScreenX = CONFIG.screenWidth / 2 + (state.npc.x - camX) * zoom;
                    const npcScreenY = CONFIG.screenHeight / 2 + (state.npc.y - camY) * zoom;
                    const screenDist = Math.hypot(t.clientX - npcScreenX, t.clientY - npcScreenY);
                    const worldDist = Math.hypot(player.x - state.npc.x, player.y - state.npc.y);
                    if (screenDist < 60 && worldDist < CONFIG.maze.npcRescueRange) {
                        mazeRescueTouchId = t.identifier;
                        maze.npcRescueHolding = true;
                        maze.npcRescueHoldStart = Date.now();
                        maze.npcRescueTouchId = t.identifier;
                        continue;
                    }
                }
                // 撤离按钮（未带人时可用）
                if (!maze.npcRescued && mazeRetreatTouchId === null) {
                    const retreatBtnX = CONFIG.screenWidth * CONFIG.maze.retreatBtnXRatio;
                    const retreatBtnY = CONFIG.screenHeight * CONFIG.maze.retreatBtnYRatio;
                    const rdx = t.clientX - retreatBtnX;
                    const rdy = t.clientY - retreatBtnY;
                    if (Math.hypot(rdx, rdy) <= CONFIG.maze.retreatBtnRadius) {
                        mazeRetreatTouchId = t.identifier;
                        maze.retreatHolding = true;
                        maze.retreatHoldStart = Date.now();
                        maze.retreatTouchId = t.identifier;
                        continue;
                    }
                }

                // 左上角 HUD 按住检测：由 HUDTopLeft 管理器统一接管（四项按钮全部采用短按=主操作+弹 tip）
                if (handleHUDTouchStart(t.identifier, t.clientX, t.clientY)) {
                    continue;
                }
            }

            // 旧主线第三关放弃按钮已废弃（迷宫的"放弃救援"是另外一个按钮，由 abandonHolding 管理）

            // 手动挡模式：记录滑动起始点，实时跟踪
            if (CONFIG.manualDrive.enabled) {
                const md = state.manualDrive;
                const activeCount = Object.keys(md.activeTouches).length;
                if (activeCount < CONFIG.manualDrive.maxTouchPoints) {
                    md.activeTouches[t.identifier] = {
                        startX: t.clientX,
                        startY: t.clientY,
                        prevX: t.clientX,
                        prevY: t.clientY,
                        currX: t.clientX,
                        currY: t.clientY,
                        strokeSide: consumeNextManualStrokeSide(),
                        consumedDistance: 0,
                        finished: false,
                    };
                }
            } else {
                // 自动挡（摇杆）：只绑定第一个未被其他功能占用的触点
                if (touches.joystickId === null) {
                    touches.joystickId = t.identifier;
                    touches.start = { x: t.clientX, y: t.clientY };
                    touches.curr = { x: t.clientX, y: t.clientY };
                    input.move = 0;
                    input.speedUp = false;
                }
            }
        }
    });

    wx.onTouchMove((res) => {
        // === 家场景：镜头拖拽 ===
        if (state.screen === 'home_evening') {
            const t = res.changedTouches[0] || res.touches[res.touches.length - 1];
            if (t) {
                const id = t.identifier;
                const last = _homeTouchPrev[id];
                const startX = _homeTouchStartX[id];
                if (typeof last === 'number') {
                    const dx = t.clientX - last;
                    if (Math.abs(dx) > 0.5) {
                        // 手指右滑（dx>0）→ 想看屋内左边 → cameraX 应减小
                        handleHomeDrag(dx, CONFIG.screenWidth);
                    }
                    // 累计位移超过阈值才算"已拖拽"，避免无意小动一下被误判
                    if (typeof startX === 'number' && Math.abs(t.clientX - startX) > 8) {
                        _homeTouchMoved[id] = true;
                    }
                }
                _homeTouchPrev[id] = t.clientX;
            }
            return;
        }

        // === 撤离玩法：背包全屏页拖拽跟手 ===
        if (isBagFullPageOpen()) {
            const t = res.changedTouches[0] || res.touches[res.touches.length - 1];
            if (t) onBagPageTouchMove(t.clientX, t.clientY);
            return;
        }

        // HUD 栏优先处理自己跟踪的触点（即使 GM 开着也要让 HUD 长按阐值继续生效）
        // HUD 只处理一开始注册过的 identifier，其他触点会被它忽略，不会误吃 GM 拖动
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
            for (const t of res.touches) {
                handleHUDTouchMove(t.identifier, t.clientX, t.clientY);
            }
        }

        // 放弃救援长按取消检测：手指离开按钮则立即取消
        // 注意：长按到时触发已移到 MazeLogic.updateMaze（每帧轮询），这里只管"半途松开/移开取消"
        //      理由：PC 微信开发者工具按住鼠标不动不发 onTouchMove，原本写在这里的"到时触发"在 PC 永远不响应
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'shore') {
            const maze: any = state.mazeRescue;
            if (maze.abandonHolding && maze.abandonTouchId !== null) {
                // 找到对应触点，确认仍在按钮范围内
                let stillOnBtn = false;
                const ar = getAbandonBtnRect(CONFIG.screenWidth, CONFIG.screenHeight);
                for (const t of res.touches) {
                    if (t.identifier === maze.abandonTouchId) {
                        const tx = t.clientX, ty = t.clientY;
                        if (tx >= ar.x && tx <= ar.x + ar.w && ty >= ar.y && ty <= ar.y + ar.h) {
                            stillOnBtn = true;
                        }
                        break;
                    }
                }
                if (!stillOnBtn) {
                    maze.abandonHolding = false;
                    maze.abandonHoldStart = 0;
                    maze.abandonTouchId = null;
                }
                // 注意：到时触发由 MazeLogic.updateMaze 处理，这里不再判定 >= 2000
            }
        }

        // GM面板消费拖动事件（包括面板自身拖动和 Tab 滑动）
        if (isGMOpen()) {
            const t = res.touches[0];
            if (t) handleGMTouchMove(t.clientX, t.clientY);
            return;
        }

        // 放弃按钮长按计时（在 update 循环中处理，这里不需要）
        // 旧"章节选择"页滑动逻辑已废弃。
        // 轮盘打开时：滑动更新高亮扇区
        if (state.wheel && state.wheel.open && state.wheel.touchId !== null) {
            for (let t of res.touches) {
                if (t.identifier === state.wheel.touchId) {
                    const dx = t.clientX - state.wheel.centerX;
                    const dy = t.clientY - state.wheel.centerY;
                    const dist = Math.hypot(dx, dy);
                    if (dist < CONFIG.marker.wheelInnerRadius) {
                        state.wheel.highlightIndex = -1; // 在死区内，无高亮
                        state.wheel.previewAction = null;
                    } else {
                        // 计算角度，匹配扇区
                        let angle = Math.atan2(dy, dx);
                        const sectors = state.wheel.sectors;
                        let found = -1;
                        for (let i = 0; i < sectors.length; i++) {
                            let start = sectors[i].startAngle;
                            let end = sectors[i].endAngle;
                            // 规范化角度到 [-PI, PI]
                            let a = angle;
                            while (a < start) a += Math.PI * 2;
                            while (a > end) a -= Math.PI * 2;
                            if (a >= start && a <= end) {
                                found = i;
                                break;
                            }
                        }
                        // 备用：用最近扇区中心角
                        if (found < 0) {
                            let minDiff = Infinity;
                            for (let i = 0; i < sectors.length; i++) {
                                const mid = (sectors[i].startAngle + sectors[i].endAngle) / 2;
                                let diff = Math.abs(angle - mid);
                                if (diff > Math.PI) diff = Math.PI * 2 - diff;
                                if (diff < minDiff) {
                                    minDiff = diff;
                                    found = i;
                                }
                            }
                        }
                        state.wheel.highlightIndex = found;
                        // 同步更新预览操作类型
                        if (found >= 0 && sectors[found]) {
                            state.wheel.previewAction = sectors[found].action;
                        } else {
                            state.wheel.previewAction = null;
                        }
                    }
                    input.move = 0;
                    input.speedUp = false;
                    return;
                }
            }
        }

        if (state.rope && state.rope.hold && state.rope.hold.active) {
            for (let t of res.touches) {
                if (t.identifier === state.rope.hold.touchId) {
                    input.move = 0;
                    input.speedUp = false;
                    return;
                }
            }
        }

        // 手动挡模式：touchMove 只更新当前位置，prev 由逻辑层推进
        if (CONFIG.manualDrive.enabled) {
            const md = state.manualDrive;
            for (let t of res.touches) {
                const td = md.activeTouches[t.identifier];
                if (td) {
                    // 只更新 curr，不动 prev（prev 由 processManualDrive 每帧推进）
                    td.currX = t.clientX;
                    td.currY = t.clientY;
                }
            }
            return;
        }

        for(let t of res.touches) {
            if(t.identifier === touches.joystickId) {
                touches.curr = { x: t.clientX, y: t.clientY };
                
                // 计算偏移
                let dx = touches.curr.x - touches.start.x;
                let dy = touches.curr.y - touches.start.y;
                let dist = Math.hypot(dx, dy);
                
                // 限制摇杆显示范围 (视觉上)
                if(dist > 40) {
                    let angle = Math.atan2(dy, dx);
                    touches.curr.x = touches.start.x + Math.cos(angle) * 40;
                    touches.curr.y = touches.start.y + Math.sin(angle) * 40;
                }

                // 逻辑输入
                if(dist > 10) {
                    // 有效推动
                    input.move = 1;
                    // 更新方向
                    input.targetAngle = Math.atan2(dy, dx);
                    // 如果推到底(>35)，加速
                    input.speedUp = dist > 35;
                } else {
                    // 死区内不移动
                    input.move = 0;
                    input.speedUp = false;
                }
                break; // 找到摇杆后就不处理其他触摸了
            }
        }
    });

    wx.onTouchEnd((res) => {
        // 家场景（晚上）：完全独立的 UI 派发，不与营地/水下混用
        if (state.screen === 'home_evening') {
            const t = res.changedTouches[0] || res.touches[res.touches.length - 1];
            if (t) {
                const id = t.identifier;
                const moved = !!_homeTouchMoved[id];
                // 清理本次 touch 跟踪
                delete _homeTouchPrev[id];
                delete _homeTouchStartX[id];
                delete _homeTouchStartY[id];
                delete _homeTouchMoved[id];
                // 不是拖拽才算点击
                if (!moved) {
                    handleHomeTap(t.clientX, t.clientY);
                }
            }
            return;
        }

        // === 撤离玩法：背包全屏页松手（拖拽放置 / 单击选中）===
        if (isBagFullPageOpen()) {
            const t = res.changedTouches[0] || res.touches[res.touches.length - 1];
            if (t) onBagPageTouchEnd(t.clientX, t.clientY);
            return;
        }

        // HUD 栏优先处理自己跟踪的触点释放（即使 GM 开着，点齿轮关 GM 也走这条路）
        // HUD 只处理它自己注册过的 identifier，其他触点会被忽略，不会误吃 GM 面板事件
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
            for (const t of res.changedTouches) {
                // HUD 如果消费了（返回 true），不进一步走其他分支；未消费就继续向下
                if (handleHUDTouchEnd(t.identifier, t.clientX, t.clientY)) {
                    // 查看是否仍有其他未处理触点；这里简单处理成 early return，大多数场景下一次只有一个 changedTouch
                    return;
                }
            }
        }

        // 放弃救援长按松手：未到 2s 就算取消（到 2s 的情况已在 touchMove 里直接触发并清空了）
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'shore') {
            const maze: any = state.mazeRescue;
            if (maze.abandonHolding) {
                for (const t of res.changedTouches) {
                    if (t.identifier === maze.abandonTouchId) {
                        maze.abandonHolding = false;
                        maze.abandonHoldStart = 0;
                        maze.abandonTouchId = null;
                        return; // 松手即取消，不继续走其它点击分发
                    }
                }
            }
            // 警情通报页打开时：吃掉所有其它点击，只允许点"接受任务"按钮
            if (!maze.briefingShown && !maze.shoreMapOpen) {
                const touch = res.changedTouches[0];
                if (!touch) return;
                const tx = touch.clientX, ty = touch.clientY;
                const cw = CONFIG.screenWidth, ch = CONFIG.screenHeight;
                const br = getBriefingAcceptBtnRect(cw, ch);
                if (tx >= br.x && tx <= br.x + br.w && ty >= br.y && ty <= br.y + br.h) {
                    playSFX('uiPrimary');
                    if (onMarkBriefingShown) onMarkBriefingShown();
                }
                return;
            }
        }

        // resolved_idle 阶段：右上角"接受新的任务"按钮
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'resolved_idle') {
            const maze: any = state.mazeRescue;
            const touch = res.changedTouches[0];
            if (!touch) return;
            const tx = touch.clientX, ty = touch.clientY;
            const cw = CONFIG.screenWidth, ch = CONFIG.screenHeight;
            // 全屏地图打开时：复用 shore 的全屏地图分发（直接掉到下面岸上分支）
            if (!maze.shoreMapOpen) {
                const nr = getResolvedIdleNewCaseBtnRect(cw, ch);
                if (tx >= nr.x && tx <= nr.x + nr.w && ty >= nr.y && ty <= nr.y + nr.h) {
                    playSFX('uiPrimary');
                    if (onAcceptNewCase) onAcceptNewCase();
                    return;
                }
                // 点击"本案已结案"水面入口：不响应下潜（什么也不做，提示文字已经在 UI 上）
                const poolX = cw * 0.5, poolY = ch * 0.44;
                const distToPool = Math.hypot(tx - poolX, ty - poolY);
                if (distToPool < 110) {
                    return;
                }
            }
            // 其它点击（信息卡片、下潜记录、全屏地图）：让 shore 分支统一处理（复用一份岸上交互代码）
            // 伪造一次 shore-like 分发：直接把 phase 暂时当 shore 处理
            // 简单做法：下面 shore 分支会检查 maze.phase === 'shore'，这里改为手动调用一次
            // 最稳的方法：下面 shore 分支的 hit-test 代码直接把 phase 条件放宽
        }

        // resolved 结案页：双按钮
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'resolved') {
            const maze: any = state.mazeRescue;
            if ((maze.caseResultTimer || 0) < 60) return; // 未到可点击时间
            const touch = res.changedTouches[0];
            if (!touch) return;
            const tx = touch.clientX, ty = touch.clientY;
            const cw = CONFIG.screenWidth, ch = CONFIG.screenHeight;
            const br = getResolvedBtnRects(cw, ch);
            // 留在此处（左）
            if (tx >= br.stayX && tx <= br.stayX + br.w && ty >= br.y && ty <= br.y + br.h) {
                playSFX('uiSecondary');
                if (onStayInResolvedCase) onStayInResolvedCase();
                return;
            }
            // 接受新的任务（右）
            if (tx >= br.newX && tx <= br.newX + br.w && ty >= br.y && ty <= br.y + br.h) {
                playSFX('uiPrimary');
                if (onAcceptNewCase) onAcceptNewCase();
                return;
            }
            return;
        }

        // abandoned 搜寻终止结案页：单按钮"接受新的任务"
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'abandoned') {
            const maze: any = state.mazeRescue;
            if ((maze.caseResultTimer || 0) < 60) return;
            const touch = res.changedTouches[0];
            if (!touch) return;
            const tx = touch.clientX, ty = touch.clientY;
            const cw = CONFIG.screenWidth, ch = CONFIG.screenHeight;
            const ar = getAbandonedAcceptBtnRect(cw, ch);
            if (tx >= ar.x && tx <= ar.x + ar.w && ty >= ar.y && ty <= ar.y + ar.h) {
                playSFX('uiPrimary');
                if (onAcceptNewCase) onAcceptNewCase();
            }
            return;
        }

        // GM面板消费触摸结束事件
        if (isGMOpen()) {
            const t = res.changedTouches[0];
            if (t) handleGMTouchEnd(t.clientX, t.clientY);
            return;
        }

        // 迷宫模式：岸上阶段点击处理（shore 和 resolved_idle 共用此分支）
        if (state.screen === 'mazeRescue' && state.mazeRescue &&
            (state.mazeRescue.phase === 'shore' || state.mazeRescue.phase === 'resolved_idle')) {
            const touch = res.changedTouches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;
            const cw = CONFIG.screenWidth;
            const ch = CONFIG.screenHeight;
            // 防止滑动误触
            const moved = Math.hypot(tx - shoreTouchStartX, ty - shoreTouchStartY) > 10;
            if (!moved) {
                const maze = state.mazeRescue;

                // ---- 撤离玩法商店全屏页打开时的分发（最高优先级）----
                if (isShopOpen()) {
                    // 点关闭按钮
                    const cr = getShopCloseBtnRect();
                    if (cr && tx >= cr.x && tx <= cr.x + cr.w && ty >= cr.y && ty <= cr.y + cr.h) {
                        playSFX('uiSecondary');
                        closeShop();
                        return;
                    }
                    // 点"换一批"按钮
                    const rr = getShopRerollBtnRect();
                    if (rr && tx >= rr.x && tx <= rr.x + rr.w && ty >= rr.y && ty <= rr.y + rr.h) {
                        const r = performShopRerollAction();
                        if (r.ok) {
                            playSFX('uiPrimary');
                            console.log('[Extraction] 换一批，花费 ' + r.cost + ' 金');
                        } else {
                            playSFX('uiSecondary');
                            console.log('[Extraction] 换一批失败：' + r.reason);
                        }
                        return;
                    }
                    // 点货架卡片 → 打开详情卡（含"购买"按钮）
                    const slotHits = getShopSlotHitTests();
                    for (const sh of slotHits) {
                        if (tx >= sh.x && tx <= sh.x + sh.w && ty >= sh.y && ty <= sh.y + sh.h) {
                            playSFX('uiSecondary');
                            openShopSlotDetail(sh.slotId);
                            return;
                        }
                    }
                    // 商店内空白点击：什么都不做
                    return;
                }

                // ---- 撤离玩法仓库全屏页打开时的分发 ----
                if (isWarehousePageOpen()) {
                    // 点关闭按钮
                    const cr = getWarehouseCloseBtnRect();
                    if (cr && tx >= cr.x && tx <= cr.x + cr.w && ty >= cr.y && ty <= cr.y + cr.h) {
                        playSFX('uiSecondary');
                        closeWarehousePage();
                        return;
                    }
                    // 点"全部卖出"按钮
                    const sr = getWarehouseSellAllBtnRect();
                    if (sr && tx >= sr.x && tx <= sr.x + sr.w && ty >= sr.y && ty <= sr.y + sr.h) {
                        const earned = performWarehouseSellAll();
                        if (earned > 0) {
                            playSFX('uiPrimary');
                            console.log('[Extraction] 仓库全部卖出，获得 ' + earned + ' 金');
                        } else {
                            playSFX('uiSecondary');
                        }
                        return;
                    }
                    // 点格子 → 详情卡
                    const slotHits = getWarehouseSlotHitTests();
                    for (const sh of slotHits) {
                        if (tx >= sh.x && tx <= sh.x + sh.w && ty >= sh.y && ty <= sh.y + sh.h) {
                            playSFX('uiSecondary');
                            openWarehouseItemDetail(sh.itemUniqueId);
                            return;
                        }
                    }
                    return;
                }

                // ---- 图鉴全屏页打开时的分发 ----
                if (maze.codexOpen) {
                    const selKind: string | null = (maze as any).codexSelectedKind || null;
                    // 详情卡已开：点任何地方都关详情卡（不关整页）
                    if (selKind) {
                        playSFX('uiSecondary');
                        (maze as any).codexSelectedKind = null;
                        return;
                    }
                    // 点返回按钮：关整个图鉴页
                    const cr = getCodexCloseBtnRect();
                    if (tx >= cr.x && tx <= cr.x + cr.w && ty >= cr.y && ty <= cr.y + cr.h) {
                        playSFX('uiSecondary');
                        maze.codexOpen = false;
                        return;
                    }
                    // 点某一格：选中这种，弹详情卡
                    const total = getCodexCellCount();
                    for (let i = 0; i < total; i++) {
                        const rect = getCodexCellRectByIndex(cw, ch, i);
                        if (!rect) continue;
                        if (tx >= rect.x && tx <= rect.x + rect.w && ty >= rect.y && ty <= rect.y + rect.h) {
                            const kind = ALL_RELIC_KINDS[i];
                            if (kind) {
                                playSFX('uiPrimary');
                                (maze as any).codexSelectedKind = kind;
                            }
                            return;
                        }
                    }
                    // 点其它空白：保持页面打开，不做任何动作（只有显式点"返回"才关）
                    return;
                }

                // ---- 营地按钮栏（新主线：今天就到这吧 等）优先派发 ----
                if (tryShoreButtonBar(tx, ty, cw, ch)) {
                    return;
                }

                // ---- 点击右上角"图鉴"按钮：打开全屏图鉴页 ----
                {
                    const codexRect = getCodexEntryBtnRect(cw);
                    if (tx >= codexRect.x && tx <= codexRect.x + codexRect.w &&
                        ty >= codexRect.y && ty <= codexRect.y + codexRect.h) {
                        // 只有非全屏地图状态下才开（防止和地图全屏互相叠）
                        if (!maze.shoreMapOpen) {
                            playSFX('uiSecondary');
                            maze.codexOpen = true;
                            return;
                        }
                    }
                }

                // ---- 点击左上角"杂货铺"按钮：打开商店全屏页 ----
                {
                    const shopRect = getShopEntryBtnRect();
                    if (shopRect && tx >= shopRect.x && tx <= shopRect.x + shopRect.w &&
                        ty >= shopRect.y && ty <= shopRect.y + shopRect.h) {
                        if (!maze.shoreMapOpen) {
                            playSFX('uiPrimary');
                            openShop();
                            return;
                        }
                    }
                }

                // ---- 点击"仓库"按钮：打开仓库全屏页 ----
                {
                    const wr = getWarehouseEntryBtnRect();
                    if (wr && tx >= wr.x && tx <= wr.x + wr.w && ty >= wr.y && ty <= wr.y + wr.h) {
                        if (!maze.shoreMapOpen) {
                            playSFX('uiPrimary');
                            openWarehousePage();
                            return;
                        }
                    }
                }

                // ---- 全屏地图打开时的分发：有两种子页面（列表 / 回放） ----
                if (maze.shoreMapOpen) {
                    const idx = (typeof maze.shoreMapDiveIndex === 'number') ? maze.shoreMapDiveIndex : -1;
                    const list = maze.diveHistory || [];

                    // 子页面A：单次下潜手绘地图回放
                    if (idx >= 0 && list[idx]) {
                    // 点击左上"← 记录"按钮：回到列表
                        if (tx >= 8 && tx <= 8 + 78 && ty >= 8 && ty <= 8 + 30) {
                            playSFX('uiSecondary');
                            maze.shoreMapDiveIndex = -1;
                            maze.shoreMapAnimTimer = 0;
                            return;
                        }
                        // 点击其它区域：回到下潜记录列表（不关闭全屏）
                        playSFX('uiSecondary');
                        maze.shoreMapDiveIndex = -1;
                        maze.shoreMapAnimTimer = 0;
                        return;
                    }

                    // 子页面B：下潜记录列表
                    // 点击左上"← 返回"按钮：关闭全屏回到岸上
                    if (tx >= 8 && tx <= 8 + 68 && ty >= 8 && ty <= 8 + 30) {
                        playSFX('uiSecondary');
                        maze.shoreMapOpen = false;
                        return;
                    }
                    // 点击列表中的某一条：打开回放
                    if (list.length > 0) {
                        const listTop = 78;
                        const listBottom = ch - 36;
                        const maxCards = 5;
                        const avail = listBottom - listTop;
                        const gap = 10;
                        const cardH = Math.min(92, (avail - gap * (maxCards - 1)) / maxCards);
                        const cardX = cw * 0.06;
                        const cardW = cw * 0.88;
                        for (let i = 0; i < list.length; i++) {
                            const cy = listTop + i * (cardH + gap);
                            if (tx >= cardX && tx <= cardX + cardW && ty >= cy && ty <= cy + cardH) {
                                playSFX('uiSecondary');
                                const reverseIdx = list.length - 1 - i; // 渲染时逆序
                                maze.shoreMapDiveIndex = reverseIdx;
                                maze.shoreMapAnimTimer = 0;
                                return;
                            }
                        }
                    }
                    // 点击其它空白区域：关闭全屏
                    playSFX('uiSecondary');
                    maze.shoreMapOpen = false;
                    return;
                }

                // 点击"下潜记录"按钮（信息卡片标题栏右侧）—— 打开列表
                const cardX = cw * 0.06;
                const cardW = cw * 0.88;
                const cardCollapsedH = 48;
                const cardExpandedH = ch * 0.42;
                // 使用动画进度计算实际高度
                const animT = maze._shoreRecordAnim || 0;
                const animEase = animT * animT * (3 - 2 * animT);
                const cardH = cardCollapsedH + (cardExpandedH - cardCollapsedH) * animEase;
                const cardY = ch - cardH - 16;
                const mapIconSize = 34;
                const mapIconX = cardX + cardW - mapIconSize - 12;
                const mapIconY = cardY + (cardCollapsedH - mapIconSize) / 2;
                if (tx >= mapIconX && tx <= mapIconX + mapIconSize &&
                    ty >= mapIconY && ty <= mapIconY + mapIconSize) {
                    playSFX('uiSecondary');
                    maze.shoreMapOpen = true;
                    maze.shoreMapDiveIndex = -1; // 默认先看列表
                    maze.shoreMapAnimTimer = 0;
                    return;
                }

                // 点击探索记录标题栏（折叠/展开）
                if (tx >= cardX && tx <= cardX + cardW &&
                    ty >= cardY && ty <= cardY + cardCollapsedH) {
                    // 排除下潜记录按钮区域
                    if (!(tx >= mapIconX && tx <= mapIconX + mapIconSize)) {
                        playSFX('uiSecondary');
                        maze._shoreRecordOpen = !maze._shoreRecordOpen;
                        return;
                    }
                }

                // 点击洞口（水面入口）下潜
                const poolX = cw * 0.5;
                const poolY = ch * 0.44;
                const poolW = 80;
                const poolH = 40;
                const distToPool = Math.hypot(tx - poolX, ty - poolY);
                if (distToPool < Math.max(poolW, poolH) + 10) {
                    // resolved_idle 状态：本案已结案，不允许再下潜
                    if (maze.phase === 'resolved_idle') {
                        return;
                    }
                    // 根据是否已发现NPC自动决定下潜类型
                    const diveType = maze.npcFound ? 'rescue' : 'scout';
                    playSFX('uiPrimary');
                    if (onMazeDive) onMazeDive(diveType);
                    return;
                }

                // "返回主菜单"按钮（左上角，与杂货铺/图鉴同基线 SAFE_TOP=62）
                // 实际渲染位置：x=14, y=62, w=72, h=30（见 mazeUI/shore.ts）
                // 这里用稍宽松的 hit-test 提高可点性
                if (tx >= 8 && tx <= 92 && ty >= 56 && ty <= 96) {
                    playSFX('uiSecondary');
                    state.screen = 'menu';
                    state.mazeRescue = null;
                    return;
                }
            }
            return;
        }

        // 迷宫模式：游戏进行中的小地图折叠按钮点击（仅调试模式）
        if (CONFIG.debug && state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
            const touch = res.changedTouches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;
            const mapX = CONFIG.maze.minimapX;
            const mapY = CONFIG.maze.minimapY;
            const toggleBtnSize = 28;
            // 检测折叠/展开按钮区域
            if (tx >= mapX && tx <= mapX + toggleBtnSize && ty >= mapY && ty <= mapY + toggleBtnSize) {
                playSFX('uiSecondary');
                state.mazeRescue.minimapExpanded = !state.mazeRescue.minimapExpanded;
                return;
            }
        }

        // 迷宫结算页点击处理（在菜单判断之前）
        if (state.screen === 'mazeRescue' && state.mazeRescue &&
            (state.mazeRescue.phase === 'rescued' || state.mazeRescue.phase === 'debrief') &&
            state.mazeRescue.resultTimer >= 60) {
            const touch = res.changedTouches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;
            const cw = CONFIG.screenWidth;
            const ch = CONFIG.screenHeight;

            // 救援成功结算页（数据页 rescued）：继续按钮 → 进入叙事结案页 resolved
            if (state.mazeRescue.phase === 'rescued') {
                // "继续 ▶"按钮（底部居中，与 drawMazeDebrief 里定义的布局一致）
                const nextBtnW = cw * 0.55;
                const nextBtnH = 44;
                const nextBtnX = (cw - nextBtnW) / 2;
                const nextBtnY = ch - 50;
                if (tx >= nextBtnX && tx <= nextBtnX + nextBtnW &&
                    ty >= nextBtnY - nextBtnH / 2 && ty <= nextBtnY + nextBtnH / 2) {
                    // 进入叙事结案页：切 phase 到 resolved，caseResultTimer 归零
                    playSFX('uiPrimary');
                    if (onEnterResolved) onEnterResolved();
                    return;
                }
                // 其他区域点击在这个新流程里不再直接返回主菜单（容易误触）
                // 什么也不做，让玩家明确点"继续"
                return;
            }

            // 探路结算页（debrief）
            // 撤离玩法："全部卖出"按钮 hit-test（在右上角小卡内，优先级高于"回到岸上"）
            {
                const sellRect = getSellAllBtnRect();
                if (sellRect && tx >= sellRect.x && tx <= sellRect.x + sellRect.w &&
                    ty >= sellRect.y && ty <= sellRect.y + sellRect.h) {
                    const earned = performSellAll();
                    playSFX('uiPrimary');
                    if (earned > 0) {
                        console.log('[Extraction] 全部卖出，获得 ' + earned + ' 金');
                    }
                    return;
                }
            }

            // "回到岸上"按钮（底部居中）
            const shoreBtnW = cw * 0.55;
            const shoreBtnH = 44;
            const shoreBtnX = (cw - shoreBtnW) / 2;
            const shoreBtnY = ch - 50;
            if (tx >= shoreBtnX && tx <= shoreBtnX + shoreBtnW &&
                ty >= shoreBtnY - shoreBtnH / 2 && ty <= shoreBtnY + shoreBtnH / 2) {
                playSFX('uiPrimary');
                if (onReturnToShore) onReturnToShore();
                return;
            }
            return;
        }

        if(state.screen === 'menu') {
            const touch = res.changedTouches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;

            // 防止滑动误触
            const moved = Math.hypot(tx - menuTouchStartX, ty - menuTouchStartY) > 10;
            if(moved) return;

            // ---- 新游戏确认框处理（最高优先级）----
            if ((state as any)._menuConfirmNewGame) {
                const cr = getNewGameConfirmRects();
                if (tx >= cr.confirm.x && tx <= cr.confirm.x + cr.confirm.w &&
                    ty >= cr.confirm.y && ty <= cr.confirm.y + cr.confirm.h) {
                    playSFX('uiPrimary');
                    clearStoryProgress();
                    clearMazeSave();
                    (state as any)._menuConfirmNewGame = false;
                    if (onMaze) onMaze(); // 进迷宫救援营地
                    return;
                }
                if (tx >= cr.cancel.x && tx <= cr.cancel.x + cr.cancel.w &&
                    ty >= cr.cancel.y && ty <= cr.cancel.y + cr.cancel.h) {
                    playSFX('uiSecondary');
                    (state as any)._menuConfirmNewGame = false;
                    return;
                }
                return; // 确认框打开时其余点击吃掉
            }

            // ---- 主菜单 4 个按钮 ----
            const buttons = getMenuButtonRects();
            for (const b of buttons) {
                if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) {
                    if (!b.enabled) {
                        playSFX('uiSecondary');
                        return;
                    }
                    playSFX(b.id === 'continue' || b.id === 'newGame' ? 'uiPrimary' : 'uiSecondary');
                    handleMenuButton(b.id, !!onMaze ? onMaze : undefined);
                    return;
                }
            }
            return;
        }

        // ---- 剧情进度选择页 ----
        if (state.screen === 'progressSelect') {
            const touch = res.changedTouches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;
            const moved = Math.hypot(tx - menuTouchStartX, ty - menuTouchStartY) > 10;
            if (moved) return;

            // 返回按钮
            const back = getProgressBackBtnRect();
            if (tx >= back.x && tx <= back.x + back.w && ty >= back.y && ty <= back.y + back.h) {
                playSFX('uiSecondary');
                state.screen = 'menu';
                return;
            }

            // 卡片
            const unlocked = getUnlockedScenes();
            for (let i = 0; i < unlocked.length; i++) {
                const r = getProgressCardRect(i);
                if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h) {
                    playSFX('uiPrimary');
                    replayNight(unlocked[i].id);
                    return;
                }
            }
            return;
        }
        handleTouchEnd(res.changedTouches);
    });

    wx.onTouchCancel((res) => {
        if (state.screen === 'home_evening') {
            for (const t of res.changedTouches) {
                delete _homeTouchPrev[t.identifier];
                delete _homeTouchStartX[t.identifier];
                delete _homeTouchStartY[t.identifier];
                delete _homeTouchMoved[t.identifier];
            }
            return;
        }
        handleTouchEnd(res.changedTouches);
    });
}

function handleTouchEnd(changedTouches) {
    for(let t of changedTouches) {
        // 迷宫救援长按松手
        if (t.identifier === mazeRescueTouchId) {
            mazeRescueTouchId = null;
            if (state.mazeRescue) {
                state.mazeRescue.npcRescueHolding = false;
                state.mazeRescue.npcRescueTouchId = null;
            }
        }
        // 迷宫撤离长按松手
        if (t.identifier === mazeRetreatTouchId) {
            mazeRetreatTouchId = null;
            if (state.mazeRescue) {
                state.mazeRescue.retreatHolding = false;
                state.mazeRescue.retreatTouchId = null;
            }
        }
        // 左上角 HUD 触点松手（氧气环长按结束、tip 触发等）
        handleHUDTouchEnd(t.identifier, t.clientX, t.clientY);
        // 旧主线第三关放弃按钮松手 → 已废弃；abandonTouchId 现已不被任何路径写入
        if(t.identifier === abandonTouchId) {
            abandonTouchId = null;
        }
        // 攻击按钮触点释放
        if(t.identifier === attackTouchId) {
            attackTouchId = null;
        }
        // 轮盘松手：执行选中操作或取消
        if (state.wheel && state.wheel.open && t.identifier === state.wheel.touchId) {
            if (state.wheel.highlightIndex >= 0 && state.wheel.sectors[state.wheel.highlightIndex]) {
                playSFX('uiPrimary');
                executeWheelAction(state.wheel.sectors[state.wheel.highlightIndex].action);
            } else {
                playSFX('uiSecondary');
            }
            // 关闭轮盘
            state.wheel.open = false;
            state.wheel.sectors = [];
            state.wheel.highlightIndex = -1;
            state.wheel.expandProgress = 0;
            state.wheel.touchId = null;
            state.wheel.previewAction = null;
        }
        if(state.rope && state.rope.hold && t.identifier === state.rope.hold.touchId) {
            state.rope.hold.active = false;
            state.rope.hold.type = null;
            state.rope.hold.timer = 0;
            state.rope.hold.touchId = null;
            state.rope.ui.progress = 0;
        }
        // 手动挡模式：滑动结束时清除触点
        if (CONFIG.manualDrive.enabled && state.manualDrive) {
            const md = state.manualDrive;
            if (md.activeTouches[t.identifier]) {
                delete md.activeTouches[t.identifier];
            }
        }

        if(t.identifier === touches.joystickId) {
            touches.joystickId = null;
            input.move = 0;
            input.speedUp = false;
        }
    }
}

// =============================================
// 撤离玩法：物品详情卡的动作分发
// =============================================
function handleDetailCardAction(actionId: string): void {
    // close
    if (actionId === 'close') {
        playSFX('uiSecondary');
        closeDetailCard();
        return;
    }

    // discard:<bagItemId>
    if (actionId.indexOf('discard:') === 0) {
        const id = parseInt(actionId.slice(8), 10);
        if (!isNaN(id)) {
            const r = discardBagItemAtPlayer(id);
            if (r.ok) {
                playSFX('uiPrimary');
                console.log('[Extraction] 已丢到水底（可重新拾起）');
            } else {
                playSFX('uiSecondary');
            }
        }
        closeDetailCard();
        return;
    }

    // buy:<slotId>（商店购买）
    if (actionId.indexOf('buy:') === 0) {
        const r = performShopBuy(actionId);
        if (r.ok) {
            playSFX('uiPrimary');
            console.log('[Extraction] 购买成功');
        } else {
            playSFX('uiSecondary');
            console.log('[Extraction] 购买失败：' + r.reason);
        }
        return;
    }

    // sell:<warehouseItemId>（仓库单件卖出）
    if (actionId.indexOf('sell:') === 0) {
        const r = performWarehouseSell(actionId);
        if (r.ok) {
            playSFX('uiPrimary');
            console.log('[Extraction] 卖出成功，+' + r.earned + ' 金');
        } else {
            playSFX('uiSecondary');
            console.log('[Extraction] 卖出失败：' + r.reason);
        }
        return;
    }

    // 默认：未识别
    console.log('[Extraction] 未知详情卡动作: ' + actionId);
}

