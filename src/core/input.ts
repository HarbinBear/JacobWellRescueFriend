import { CONFIG } from './config';
import { state, input, touches, player } from './state';
import { createFishEnemy, triggerPlayerAttack, findSafeSpawnPosition } from '../logic/FishEnemy';
import { DEBUG_FISH_BTN, ATTACK_BTN, FLASHLIGHT_BTN } from '../render/RenderUI';
import { isGMOpen, handleGMTouchStart, handleGMTouchMove, handleGMTouchEnd } from '../gm/GMPanel';
import { buildWheelSectors, executeWheelAction } from '../logic/Marker';
import { getWheelBtnPos } from '../render/RenderWheel';

// 章节页滑动状态
let chapterTouchStartY = 0;
let chapterTouchStartScrollY = 0;
let chapterTouchMoved = false;

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

// 计算章节卡片的点击区域（与RenderUI中的布局保持一致，需传入scrollY偏移）
function getChapterCardBounds(cw, ch, scrollY) {
    let cardW = cw * 0.82;
    let cardH = ch * 0.22;
    let cardX = (cw - cardW) / 2;
    let gap = ch * 0.025;
    let listTop = 58;
    let card1Y = listTop + 12 - scrollY;
    let card2Y = card1Y + cardH + gap;
    let card3Y = card2Y + cardH + gap;
    let card4Y = card3Y + cardH + gap;
    return [
        { cardX, cardY: card1Y, cardW, cardH },
        { cardX, cardY: card2Y, cardW, cardH },
        { cardX, cardY: card3Y, cardW, cardH },
        { cardX, cardY: card4Y, cardW, cardH }
    ];
}

function consumeNextManualStrokeSide() {
    const md = state.manualDrive;
    const side = md.nextStrokeSide;
    md.nextStrokeSide = side > 0 ? -1 : 1;
    return side;
}

export function initInput(onReset, onArena?, onMaze?, onMazeReplay?, onMazeDive?, onReturnToShore?) {
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
                    if(state.menuScreen === 'chapter') {
                        state.menuScreen = 'main';
                    } else if(!state.transition.active) {
                        state.transition.active = true;
                        state.transition.alpha = 0;
                        state.transition.mode = 'out';
                        state.transition.callback = () => {
                            if (onReset) onReset(1);
                        };
                    }
                }
                return;
            }

            if(state.screen !== 'play') {
                // 第二关结局：分页剧情
                if (state.screen === 'ending' && state.story.flags.stage2Ending) {
                    if (!state.endingTimer || state.endingTimer < 1200) return;
                    if(e.code === 'Space' && !state.transition.active) {
                        state.transition.active = true;
                        state.transition.alpha = 0;
                        state.transition.mode = 'out';
                        state.transition.callback = () => {
                            if (onReset) onReset(7);
                        };
                    }
                    return;
                }
                // 熊子死亡结局
                if (state.screen === 'ending' && state.story.flags.bearDied) {
                    if (!state.endingTimer || state.endingTimer < 1200) return;
                    if(e.code === 'Space') { state.screen = 'menu'; state.menuScreen = 'main'; }
                    return;
                }
                // 如果是结局画面，必须等待播放完毕 (timer > 1320)
                if (state.screen === 'ending' && (!state.endingTimer || state.endingTimer < 1320)) {
                    return;
                }
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
        // GM面板优先消费触摸事件
        const gmTouch = res.touches[res.touches.length - 1];
        if (gmTouch && handleGMTouchStart(gmTouch.clientX, gmTouch.clientY)) {
            return;
        }
        // GM面板打开时拦截所有游戏输入
        if (isGMOpen()) return;

        if(state.screen === 'menu') {
            const touch = res.touches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;
            const cw = CONFIG.screenWidth;
            const ch = CONFIG.screenHeight;

            if(state.menuScreen === 'chapter') {
                // 记录触摸起始位置，用于判断是滑动还是点击
                chapterTouchStartY = ty;
                chapterTouchStartScrollY = state.chapterScrollY || 0;
                chapterTouchMoved = false;
                return;
            }

            // 主菜单：只记录起始位置，等 touchEnd 再判断点击
            menuTouchStartX = tx;
            menuTouchStartY = ty;
            return;
        }

        if(state.screen !== 'play') {
            // 迷宫模式：岸上阶段只记录触摸起始位置
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'shore') {
                const touch = res.touches[0];
                shoreTouchStartX = touch.clientX;
                shoreTouchStartY = touch.clientY;
                return;
            }
            // 迷宫模式：入水动效阶段不响应操作
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'diving_in') {
                return;
            }
            // 迷宫模式：上浮动画阶段不响应操作
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'surfacing') {
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
                    state.menuScreen = 'main';
                    state.fishArena = null;
                }
                return;
            }
            // 第二关结局：分页剧情，等到最后一页（timer > 1200）才能点击
            if (state.screen === 'ending' && state.story.flags.stage2Ending) {
                if (!state.endingTimer || state.endingTimer < 1200) return;
                // 点击进入第三关
                if(!state.transition.active) {
                    state.transition.active = true;
                    state.transition.alpha = 0;
                    state.transition.mode = 'out';
                    state.transition.callback = () => {
                        if (onReset) onReset(7);
                    };
                }
                return;
            }
            // 熊子死亡结局：等到最后一页才能点击
            if (state.screen === 'ending' && state.story.flags.bearDied) {
                if (!state.endingTimer || state.endingTimer < 1200) return;
                state.screen = 'menu';
                state.menuScreen = 'main';
                return;
            }
            // 如果是结局画面，必须等待播放完毕 (timer > 1320)
            if (state.screen === 'ending' && (!state.endingTimer || state.endingTimer < 1320)) {
                return;
            }
            // 游戏结束或失败，点击返回主菜单
            state.screen = 'menu';
            state.menuScreen = 'main';
            return;
            } // else 结束
        }

        // 轮盘交互按钮检测（替代旧绳索按钮）
        if (state.wheel && state.wheel.btnVisible && !state.wheel.open) {
            const { x: btnX, y: btnY } = getWheelBtnPos();
            for (let t of res.touches) {
                const dx = t.clientX - btnX;
                const dy = t.clientY - btnY;
                if (Math.hypot(dx, dy) <= CONFIG.marker.btnRadius) {
                    // 打开轮盘
                    const nearbyInfo = state.wheel.nearbyInfo;
                    if (nearbyInfo) {
                        const sectors = buildWheelSectors(nearbyInfo.context, !!nearbyInfo.existingMarker);
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
            }

            // 检测放弃救援按钮长按
            if(state.story.flags.abandonBtnVisible && state.story.stage === 7) {
                const cw = CONFIG.screenWidth;
                const ch = CONFIG.screenHeight;
                const btnW = 200, btnH = 64;
                const btnX = cw / 2 - btnW / 2;
                const btnY = ch * 0.28 - btnH / 2;
                if(t.clientX >= btnX && t.clientX <= btnX + btnW &&
                   t.clientY >= btnY && t.clientY <= btnY + btnH) {
                    abandonTouchId = t.identifier;
                    state.story.flags.abandonBtnHolding = true;
                    state.story.flags.abandonBtnHoldStartTime = Date.now();
                    continue;
                }
            }

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
        // GM面板优先消费滑动事件
        if (isGMOpen()) {
            const t = res.touches[0];
            if (t) handleGMTouchMove(t.clientX, t.clientY);
            return;
        }

        // 放弃按钮长按计时（在 update 循环中处理，这里不需要）
        if(state.screen === 'menu' && state.menuScreen === 'chapter') {
            const touch = res.touches[0];
            const dy = touch.clientY - chapterTouchStartY;
            if(Math.abs(dy) > 5) chapterTouchMoved = true;
            const ch = CONFIG.screenHeight;
            const cardH = ch * 0.22;
            const gap = ch * 0.025;
            const totalContentH = 4 * cardH + 3 * gap + 20;
            const listH = ch - 58;
            const maxScroll = Math.max(0, totalContentH - listH + 12);
            let newScroll = chapterTouchStartScrollY - dy;
            if(newScroll < 0) newScroll = 0;
            if(newScroll > maxScroll) newScroll = maxScroll;
            state.chapterScrollY = newScroll;
            return;
        }
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
        // GM面板优先消费触摸结束事件
        if (isGMOpen()) {
            const t = res.changedTouches[0];
            if (t) handleGMTouchEnd(t.clientX, t.clientY);
            return;
        }

        // 迷宫模式：岸上阶段点击处理
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'shore') {
            const touch = res.changedTouches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;
            const cw = CONFIG.screenWidth;
            const ch = CONFIG.screenHeight;
            // 防止滑动误触
            const moved = Math.hypot(tx - shoreTouchStartX, ty - shoreTouchStartY) > 10;
            if (!moved) {
                const maze = state.mazeRescue;

                // 全屏地图打开时，点击任意位置关闭
                if (maze.shoreMapOpen) {
                    maze.shoreMapOpen = false;
                    return;
                }

                // 点击认知地图图标（信息卡片右上角的小地图区域）
                const cardX = cw * 0.06;
                const cardY = ch * 0.56;
                const cardW = cw * 0.88;
                const mapIconX = cardX + cardW - 40;
                const mapIconY = cardY + 8;
                const mapIconSize = 36;
                if (tx >= mapIconX && tx <= mapIconX + mapIconSize &&
                    ty >= mapIconY && ty <= mapIconY + mapIconSize) {
                    maze.shoreMapOpen = true;
                    return;
                }

                // 点击洞口（水面入口）下潜
                const poolX = cw * 0.5;
                const poolY = ch * 0.44;
                const poolW = 80;
                const poolH = 40;
                const distToPool = Math.hypot(tx - poolX, ty - poolY);
                if (distToPool < Math.max(poolW, poolH) + 10) {
                    // 根据是否已发现NPC自动决定下潜类型
                    const diveType = maze.npcFound ? 'rescue' : 'scout';
                    if (onMazeDive) onMazeDive(diveType);
                    return;
                }

                // "返回主菜单"按钮（左上角）
                if (tx < 80 && ty < 50) {
                    state.screen = 'menu';
                    state.menuScreen = 'main';
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
            const mapY = CONFIG.maze.minimapY + 130; // 与渲染层 yOffset 保持一致
            const toggleBtnSize = 28;
            // 检测折叠/展开按钮区域
            if (tx >= mapX && tx <= mapX + toggleBtnSize && ty >= mapY && ty <= mapY + toggleBtnSize) {
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

            // 救援成功结算页
            if (state.mazeRescue.phase === 'rescued') {
                // "下一局"按钮（底部居中）
                const nextBtnW = cw * 0.55;
                const nextBtnH = 44;
                const nextBtnX = (cw - nextBtnW) / 2;
                const nextBtnY = ch - 50;
                if (tx >= nextBtnX && tx <= nextBtnX + nextBtnW &&
                    ty >= nextBtnY - nextBtnH / 2 && ty <= nextBtnY + nextBtnH / 2) {
                    if (onMaze) onMaze();
                    return;
                }
                // 点击其他区域返回主菜单
                state.screen = 'menu';
                state.menuScreen = 'main';
                state.mazeRescue = null;
                return;
            }

            // 探路结算页（debrief）
            // "回到岸上"按钮（底部居中）
            const shoreBtnW = cw * 0.55;
            const shoreBtnH = 44;
            const shoreBtnX = (cw - shoreBtnW) / 2;
            const shoreBtnY = ch - 50;
            if (tx >= shoreBtnX && tx <= shoreBtnX + shoreBtnW &&
                ty >= shoreBtnY - shoreBtnH / 2 && ty <= shoreBtnY + shoreBtnH / 2) {
                if (onReturnToShore) onReturnToShore();
                return;
            }
            return;
        }

        if(state.screen === 'menu') {
            const touch = res.changedTouches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;
            const cw = CONFIG.screenWidth;
            const ch = CONFIG.screenHeight;

            if(state.menuScreen === 'main') {
                // 判断手指没有明显移动（防止滑动误触）
                const moved = Math.hypot(tx - menuTouchStartX, ty - menuTouchStartY) > 10;
                if(!moved) {
                    // 检测"开始游戏"按钮
                    let btnY = ch * 0.50;
                    let btnW = 180, btnH = 50;
                    let btnX = cw / 2 - btnW / 2;
                    if(tx >= btnX && tx <= btnX + btnW && ty >= btnY - btnH / 2 && ty <= btnY + btnH / 2) {
                        if (!CONFIG.menuUnlock.startGame) {
                            // 置灰状态，提示未解锁
                            state.alertMsg = '这个游戏还拿不出手，先玩其他模式吧！';
                            state.alertColor = 'rgba(255,100,50,0.95)';
                            if (state.msgTimer) clearTimeout(state.msgTimer);
                            state.msgTimer = setTimeout(() => { state.alertMsg = ''; }, 2500);
                            return;
                        }
                        if(!state.transition.active) {
                            state.transition.active = true;
                            state.transition.alpha = 0;
                            state.transition.mode = 'out';
                            state.transition.callback = () => {
                                if (onReset) onReset(1);
                            };
                        }
                        return;
                    }
                    // 检测"章节选择"按钮
                    let chBtnY = ch * 0.62;
                    let chBtnW = 180, chBtnH = 50;
                    let chBtnX = cw / 2 - chBtnW / 2;
                    if(tx >= chBtnX && tx <= chBtnX + chBtnW && ty >= chBtnY - chBtnH / 2 && ty <= chBtnY + chBtnH / 2) {
                        if (!CONFIG.menuUnlock.chapterSelect) {
                            state.alertMsg = '这个游戏还拿不出手，先玩其他模式吧！';
                            state.alertColor = 'rgba(255,100,50,0.95)';
                            if (state.msgTimer) clearTimeout(state.msgTimer);
                            state.msgTimer = setTimeout(() => { state.alertMsg = ''; }, 2500);
                            return;
                        }
                        state.menuScreen = 'chapter';
                        state.chapterScrollY = 0;
                        return;
                    }
                    // 检测"食人鱼竞技场"按钮
                    let arenaBtnY = ch * 0.74;
                    let arenaBtnW = 200, arenaBtnH = 50;
                    let arenaBtnX = cw / 2 - arenaBtnW / 2;
                    if(tx >= arenaBtnX && tx <= arenaBtnX + arenaBtnW && ty >= arenaBtnY - arenaBtnH / 2 && ty <= arenaBtnY + arenaBtnH / 2) {
                        if (!CONFIG.menuUnlock.fishArena) {
                            state.alertMsg = '食人鱼竞技场尚未解锁！';
                            state.alertColor = 'rgba(255,100,50,0.95)';
                            if (state.msgTimer) clearTimeout(state.msgTimer);
                            state.msgTimer = setTimeout(() => { state.alertMsg = ''; }, 2500);
                            return;
                        }
                        if (onArena) onArena();
                        return;
                    }
                    // 检测"迷宫纯享版"按钮
                    let mazeBtnY = ch * 0.86;
                    let mazeBtnW = 200, mazeBtnH = 50;
                    let mazeBtnX = cw / 2 - mazeBtnW / 2;
                    if(tx >= mazeBtnX && tx <= mazeBtnX + mazeBtnW && ty >= mazeBtnY - mazeBtnH / 2 && ty <= mazeBtnY + mazeBtnH / 2) {
                        if (!CONFIG.menuUnlock.mazeMode) {
                            state.alertMsg = '迷宫纯享版尚未解锁！';
                            state.alertColor = 'rgba(255,100,50,0.95)';
                            if (state.msgTimer) clearTimeout(state.msgTimer);
                            state.msgTimer = setTimeout(() => { state.alertMsg = ''; }, 2500);
                            return;
                        }
                        if (onMaze) onMaze();
                        return;
                    }                }
                return;
            }
            if(state.menuScreen === 'chapter') {
                // 如果没有发生明显滑动，则判断为点击
                if(!chapterTouchMoved) {
                    // 返回按钮（左上角区域）
                    if(tx < 90 && ty < 52) {
                        state.menuScreen = 'main';
                        state.chapterScrollY = 0;
                        return;
                    }
                    // 章节卡片点击（需在可滚动区域内）
                    if(ty >= 58) {
                        const bounds = getChapterCardBounds(cw, ch, state.chapterScrollY || 0);
                        for(let i = 0; i < bounds.length; i++) {
                            const b = bounds[i];
                            if(tx >= b.cardX && tx <= b.cardX + b.cardW && ty >= b.cardY && ty <= b.cardY + b.cardH) {
                                // 章节未解锁时置灰，点击提示
                                if (!CONFIG.menuUnlock.chapterSelect) {
                                    state.alertMsg = '章节选择尚未解锁！';
                                    state.alertColor = 'rgba(255,100,50,0.95)';
                                    if (state.msgTimer) clearTimeout(state.msgTimer);
                                    state.msgTimer = setTimeout(() => { state.alertMsg = ''; }, 2500);
                                    return;
                                }
                                let startStage = i === 0 ? 1 : (i === 1 ? 3 : (i === 2 ? 7 : 9));
                                if(!state.transition.active) {
                                    state.transition.active = true;
                                    state.transition.alpha = 0;
                                    state.transition.mode = 'out';
                                    state.transition.callback = () => {
                                        if (onReset) onReset(startStage);
                                    };
                                }
                                return;
                            }
                        }
                    }
                }
                return;
            }
            return;
        }        handleTouchEnd(res.changedTouches);
    });

    wx.onTouchCancel((res) => {
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
        // 放弃按钮松手
        if(t.identifier === abandonTouchId) {
            abandonTouchId = null;
            state.story.flags.abandonBtnHolding = false;
            state.story.flags.abandonBtnHoldStartTime = 0;
        }
        // 攻击按钮触点释放
        if(t.identifier === attackTouchId) {
            attackTouchId = null;
        }
        // 轮盘松手：执行选中操作或取消
        if (state.wheel && state.wheel.open && t.identifier === state.wheel.touchId) {
            if (state.wheel.highlightIndex >= 0 && state.wheel.sectors[state.wheel.highlightIndex]) {
                executeWheelAction(state.wheel.sectors[state.wheel.highlightIndex].action);
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
