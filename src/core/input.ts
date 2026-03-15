import { CONFIG } from './config';
import { state, input, touches, player } from './state';
import { createFishEnemy } from '../logic/FishEnemy';
import { DEBUG_FISH_BTN } from '../render/RenderUI';

// 章节页滑动状态
let chapterTouchStartY = 0;
let chapterTouchStartScrollY = 0;
let chapterTouchMoved = false;

// 放弃救援按钮长按状态
let abandonTouchId = null;

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

export function initInput(onReset) {
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

        // 单摇杆逻辑：只处理第一个触摸点作为摇杆
        if (touches.joystickId === null && res.touches.length > 0) {
            const t = res.touches[0];

            // 检测凶猛鱼调试按钮（仅在调试模式且游戏进行中）
            if (CONFIG.debug && state.screen === 'play') {
                const btn = DEBUG_FISH_BTN;
                if (
                    t.clientX >= btn.x && t.clientX <= btn.x + btn.w &&
                    t.clientY >= btn.y && t.clientY <= btn.y + btn.h
                ) {
                    // 在玩家前方生成一条凶猛鱼
                    const spawnDist = 300;
                    const spawnAngle = Math.random() * Math.PI * 2;
                    const spawnX = player.x + Math.cos(spawnAngle) * spawnDist;
                    const spawnY = player.y + Math.sin(spawnAngle) * spawnDist;
                    if (!state.fishEnemies) state.fishEnemies = [];
                    state.fishEnemies.push(createFishEnemy(spawnX, spawnY));
                    return;
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
                    return;
                }
            }

            touches.joystickId = t.identifier;
            touches.start = { x: t.clientX, y: t.clientY };
            touches.curr = { x: t.clientX, y: t.clientY };
            
            // 初始按下时不移动，等待滑动
            input.move = 0;
            input.speedUp = false;
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
                    let btnY = ch * 0.56;
                    let btnW = 180, btnH = 50;
                    let btnX = cw / 2 - btnW / 2;
                    if(tx >= btnX && tx <= btnX + btnW && ty >= btnY - btnH / 2 && ty <= btnY + btnH / 2) {
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
                    let chBtnY = ch * 0.7;
                    let chBtnW = 160, chBtnH = 44;
                    let chBtnX = cw / 2 - chBtnW / 2;
                    if(tx >= chBtnX && tx <= chBtnX + chBtnW && ty >= chBtnY - chBtnH / 2 && ty <= chBtnY + chBtnH / 2) {
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
        }
        handleTouchEnd(res.changedTouches);
    });

    wx.onTouchCancel((res) => {
        handleTouchEnd(res.changedTouches);
    });
}

function handleTouchEnd(changedTouches) {
    for(let t of changedTouches) {
        // 放弃按钮松手
        if(t.identifier === abandonTouchId) {
            abandonTouchId = null;
            state.story.flags.abandonBtnHolding = false;
            state.story.flags.abandonBtnHoldStartTime = 0;
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
