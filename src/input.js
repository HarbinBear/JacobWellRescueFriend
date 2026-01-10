import { CONFIG } from './config.js';
import { state, input, touches } from './state.js';

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
            if(state.screen !== 'play') {
                // 如果是结局画面，必须等待播放完毕 (timer > 1080)
                if (state.screen === 'ending' && (!state.endingTimer || state.endingTimer < 1080)) {
                    return;
                }
                if(e.code === 'Space' && onReset) onReset();
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
        if(state.screen !== 'play') {
            // 如果是结局画面，必须等待播放完毕 (timer > 1080)
            if (state.screen === 'ending' && (!state.endingTimer || state.endingTimer < 1080)) {
                return;
            }
            if (onReset) onReset();
            return;
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
        if(t.identifier === touches.joystickId) {
            touches.joystickId = null;
            input.move = 0;
            input.speedUp = false;
        }
    }
}
