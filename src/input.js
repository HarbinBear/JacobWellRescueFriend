import { CONFIG } from './config.js';
import { state, input, touches } from './state.js';

export function initInput(onReset) {
    tt.onTouchStart((res) => {
        if(state.screen !== 'play') {
            if (onReset) onReset();
            return;
        }

        for(let t of res.touches) {
            if(t.clientX < CONFIG.screenWidth / 2) {
                // 左半屏 -> 移动摇杆
                if(touches.leftId === null) {
                    touches.leftId = t.identifier;
                    touches.leftStart = { x: t.clientX, y: t.clientY };
                    touches.leftCurr = { x: t.clientX, y: t.clientY };
                }
            } else {
                // 右半屏 -> 转向摇杆
                if(touches.rightId === null) {
                    touches.rightId = t.identifier;
                    touches.rightStart = { x: t.clientX, y: t.clientY };
                    touches.rightCurr = { x: t.clientX, y: t.clientY };
                }
            }
        }
    });

    tt.onTouchMove((res) => {
        for(let t of res.touches) {
            if(t.identifier === touches.leftId) {
                touches.leftCurr = { x: t.clientX, y: t.clientY };
                // 计算移动输入
                let dx = touches.leftCurr.x - touches.leftStart.x;
                let dy = touches.leftCurr.y - touches.leftStart.y;
                let dist = Math.hypot(dx, dy);
                
                // 限制摇杆显示范围
                if(dist > 40) {
                    let angle = Math.atan2(dy, dx);
                    touches.leftCurr.x = touches.leftStart.x + Math.cos(angle) * 40;
                    touches.leftCurr.y = touches.leftStart.y + Math.sin(angle) * 40;
                }

                // 逻辑输入
                if(dist > 10) {
                    input.move = 1;
                    // 如果推到底，加速
                    input.speedUp = dist > 35;
                } else {
                    input.move = 0;
                    input.speedUp = false;
                }
            } else if(t.identifier === touches.rightId) {
                touches.rightCurr = { x: t.clientX, y: t.clientY };
                
                let dx = touches.rightCurr.x - touches.rightStart.x;
                let dy = touches.rightCurr.y - touches.rightStart.y;
                let dist = Math.hypot(dx, dy);

                if(dist > 40) {
                    let angle = Math.atan2(dy, dx);
                    touches.rightCurr.x = touches.rightStart.x + Math.cos(angle) * 40;
                    touches.rightCurr.y = touches.rightStart.y + Math.sin(angle) * 40;
                }

                // 计算角度
                if(dist > 10) {
                    input.targetAngle = Math.atan2(dy, dx);
                }
            }
        }
    });

    tt.onTouchEnd((res) => {
        handleTouchEnd(res.changedTouches);
    });

    tt.onTouchCancel((res) => {
        handleTouchEnd(res.changedTouches);
    });
}

function handleTouchEnd(changedTouches) {
    for(let t of changedTouches) {
        if(t.identifier === touches.leftId) {
            touches.leftId = null;
            input.move = 0;
            input.speedUp = false;
        } else if(t.identifier === touches.rightId) {
            touches.rightId = null;
        }
    }
}
