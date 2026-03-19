import { CONFIG } from './config';
import { state, input, touches, player } from './state';
import { createFishEnemy, triggerPlayerAttack, findSafeSpawnPosition } from '../logic/FishEnemy';
import { DEBUG_FISH_BTN, ATTACK_BTN, FLASHLIGHT_BTN } from '../render/RenderUI';

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

export function initInput(onReset, onArena?, onMaze?, onMazeReplay?) {
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

            if (dx !== 0 || dy !== 0) {
                input.move = 1;
                input.targetAngle = Math.atan2(dy, dx);
                input.speedUp = keys.shift;
            } else {
                input.move = 0;
                input.speedUp = false;
            }
        };

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
            // 迷宫模式：游戏进行中允许正常操作
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
                // 继续往下处理摇杆和救援按钮
            } else if (state.screen === 'mazeRescue' && state.mazeRescue &&
                (state.mazeRescue.phase === 'rescued' || state.mazeRescue.phase === 'dead')) {
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

        if(state.rope && state.rope.ui && state.rope.ui.visible) {
            const btnX = CONFIG.screenWidth * CONFIG.ropeButtonXRatio;
            const btnY = CONFIG.screenHeight * CONFIG.ropeButtonYRatio;
            for (let t of res.touches) {
                const dx = t.clientX - btnX;
                const dy = t.clientY - btnY;
                if (Math.hypot(dx, dy) <= CONFIG.ropeButtonRadius) {
                    state.rope.hold.active = true;
                    state.rope.hold.type = state.rope.ui.type;
                    state.rope.hold.timer = 0;
                    state.rope.hold.touchId = t.identifier;
                    state.rope.hold.anchor = state.rope.ui.anchor;
                    input.move = 0;
                    input.speedUp = false;
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

            // 迷宫模式：检测救援长按（靠近NPC时）
            if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
                const maze = state.mazeRescue;
                if (!maze.npcRescued && state.npc.active && mazeRescueTouchId === null) {
                    const zoom = state.camera ? state.camera.zoom : 1;
                    const npcScreenX = CONFIG.screenWidth / 2 + (state.npc.x - player.x) * zoom;
                    const npcScreenY = CONFIG.screenHeight / 2 + (state.npc.y - player.y) * zoom;
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

            // 摇杆：只绑定第一个未被其他功能占用的触点
            if (touches.joystickId === null) {
                touches.joystickId = t.identifier;
                touches.start = { x: t.clientX, y: t.clientY };
                touches.curr = { x: t.clientX, y: t.clientY };
                input.move = 0;
                input.speedUp = false;
            }
        }
    });

    wx.onTouchMove((res) => {
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
        if (state.rope && state.rope.hold && state.rope.hold.active) {
            for (let t of res.touches) {
                if (t.identifier === state.rope.hold.touchId) {
                    input.move = 0;
                    input.speedUp = false;
                    return;
                }
            }
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
        // 迷宫模式：游戏进行中的小地图折叠按钮点击
        if (state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play') {
            const touch = res.changedTouches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;
            const mapX = CONFIG.maze.minimapX;
            const mapY = CONFIG.maze.minimapY;
            const toggleBtnSize = 28;
            // 检测折叠/展开按钮区域
            if (tx >= mapX && tx <= mapX + toggleBtnSize && ty >= mapY && ty <= mapY + toggleBtnSize) {
                state.mazeRescue.minimapExpanded = !state.mazeRescue.minimapExpanded;
                return;
            }
        }

        // 迷宫结算页点击处理（在菜单判断之前）
        if (state.screen === 'mazeRescue' && state.mazeRescue &&
            (state.mazeRescue.phase === 'rescued' || state.mazeRescue.phase === 'dead') &&
            state.mazeRescue.resultTimer >= 60) {
            const touch = res.changedTouches[0];
            const tx = touch.clientX;
            const ty = touch.clientY;
            const cw = CONFIG.screenWidth;
            const ch = CONFIG.screenHeight;
            // 重玩本局按鈕（左下）
            const replayBtnX = cw * 0.15;
            const replayBtnY = ch * 0.88;
            const replayBtnW = cw * 0.32;
            const replayBtnH = 52;
            if (tx >= replayBtnX && tx <= replayBtnX + replayBtnW &&
                ty >= replayBtnY - replayBtnH / 2 && ty <= replayBtnY + replayBtnH / 2) {
                if (onMazeReplay) onMazeReplay();
                return;
            }
            // 下一局按鈕（右下）
            const nextBtnX = cw * 0.53;
            const nextBtnY = ch * 0.88;
            const nextBtnW = cw * 0.32;
            const nextBtnH = 52;
            if (tx >= nextBtnX && tx <= nextBtnX + nextBtnW &&
                ty >= nextBtnY - nextBtnH / 2 && ty <= nextBtnY + nextBtnH / 2) {
                if (onMaze) onMaze();
                return;
            }
            // 重播轨迹按钮 (中上)
            const statsY = ch * 0.38;
            const replayAnimBtnX = cw * 0.34;
            const replayAnimBtnY = statsY + 130;
            const replayAnimBtnW = cw * 0.32;
            const replayAnimBtnH = 36;
            if (tx >= replayAnimBtnX && tx <= replayAnimBtnX + replayAnimBtnW &&
                ty >= replayAnimBtnY - replayAnimBtnH / 2 && ty <= replayAnimBtnY + replayAnimBtnH / 2) {
                // 重置结算计时器以重新播放动画
                state.mazeRescue.resultTimer = 30; 
                return;
            }
            // 点击其他区域返回主菜单
            state.screen = 'menu';
            state.menuScreen = 'main';
            state.mazeRescue = null;
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
                    // 检测"开始游戏"按鈕（fishArenaMode 开启时置灰）
                    let btnY = ch * 0.50;
                    let btnW = 180, btnH = 50;
                    let btnX = cw / 2 - btnW / 2;
                    if(tx >= btnX && tx <= btnX + btnW && ty >= btnY - btnH / 2 && ty <= btnY + btnH / 2) {
                        if (CONFIG.fishArenaMode) {
                            // 置灰状态，提示拿不出手
                            state.alertMsg = '这个游戏还拿不出手，先玩食人鱼纯享版吧！';
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
                    // 检测"食人鱼纯享版"按鈕
                    let arenaBtnY = ch * 0.62;
                    let arenaBtnW = 200, arenaBtnH = 50;
                    let arenaBtnX = cw / 2 - arenaBtnW / 2;
                    if(tx >= arenaBtnX && tx <= arenaBtnX + arenaBtnW && ty >= arenaBtnY - arenaBtnH / 2 && ty <= arenaBtnY + arenaBtnH / 2) {
                        if (onArena) onArena();
                        return;
                    }
                    // 检测"迷宫引导绳"按鈕
                    let mazeBtnY = ch * 0.74;
                    let mazeBtnW = 200, mazeBtnH = 50;
                    let mazeBtnX = cw / 2 - mazeBtnW / 2;
                    if(tx >= mazeBtnX && tx <= mazeBtnX + mazeBtnW && ty >= mazeBtnY - mazeBtnH / 2 && ty <= mazeBtnY + mazeBtnH / 2) {
                        if (onMaze) onMaze();
                        return;
                    }
                    // 检测"章节选择"按鈕（fishArenaMode 开启时置灰）
                    let chBtnY = ch * 0.86;
                    let chBtnW = 160, chBtnH = 44;
                    let chBtnX = cw / 2 - chBtnW / 2;
                    if(tx >= chBtnX && tx <= chBtnX + chBtnW && ty >= chBtnY - chBtnH / 2 && ty <= chBtnY + chBtnH / 2) {
                        if (CONFIG.fishArenaMode) {
                            state.alertMsg = '这个游戏还拿不出手，先玩食人鱼纯享版吧！';
                            state.alertColor = 'rgba(255,100,50,0.95)';
                            if (state.msgTimer) clearTimeout(state.msgTimer);
                            state.msgTimer = setTimeout(() => { state.alertMsg = ''; }, 2500);
                            return;
                        }
                        state.menuScreen = 'chapter';
                        state.chapterScrollY = 0;
                        return;
                    }
                }
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
                                // fishArenaMode 开启时章节置灰，点击提示
                                if (CONFIG.fishArenaMode) {
                                    state.alertMsg = '这个游戏还拿不出手，先玩食人鱼纯享版吧！';
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
        if(state.rope && state.rope.hold && t.identifier === state.rope.hold.touchId) {
            state.rope.hold.active = false;
            state.rope.hold.type = null;
            state.rope.hold.timer = 0;
            state.rope.hold.touchId = null;
            state.rope.ui.progress = 0;
        }
        if(t.identifier === touches.joystickId) {
            touches.joystickId = null;
            input.move = 0;
            input.speedUp = false;
        }
    }
}
