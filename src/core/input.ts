import { CONFIG } from './config';
import { state, input, touches } from './state';

// 计算章节卡片的点击区域（与RenderUI中的布局保持一致）
function getChapterCardBounds(cw, ch) {
    let cardW = cw * 0.82;
    let cardH = ch * 0.22; // 四张卡片时稍小一些
    let cardX = (cw - cardW) / 2;
    let gap = ch * 0.025;
    let card1Y = 70;
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
                // 返回按钮（左上角区域）
                if(tx < 90 && ty < 52) {
                    state.menuScreen = 'main';
                    return;
                }
                // 章节卡片点击
                const bounds = getChapterCardBounds(cw, ch);
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
                return;
            }

            // 主菜单：检测"开始游戏"按钮区域
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

            // 检测"章节选择"按钮区域
            let chBtnY = ch * 0.7;
            let chBtnW = 160, chBtnH = 44;
            let chBtnX = cw / 2 - chBtnW / 2;
            if(tx >= chBtnX && tx <= chBtnX + chBtnW && ty >= chBtnY - chBtnH / 2 && ty <= chBtnY + chBtnH / 2) {
                state.menuScreen = 'chapter';
                return;
            }

            // 点击其他区域也触发开始游戏（兼容旧逻辑）
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
            touches.joystickId = t.identifier;
            touches.start = { x: t.clientX, y: t.clientY };
            touches.curr = { x: t.clientX, y: t.clientY };
            
            // 初始按下时不移动，等待滑动
            input.move = 0;
            input.speedUp = false;
        }
    });

    wx.onTouchMove((res) => {
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
        handleTouchEnd(res.changedTouches);
    });

    wx.onTouchCancel((res) => {
        handleTouchEnd(res.changedTouches);
    });
}

function handleTouchEnd(changedTouches) {
    for(let t of changedTouches) {
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
