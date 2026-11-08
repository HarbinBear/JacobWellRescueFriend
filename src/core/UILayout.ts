import { CONFIG } from './config';

/** 绘制与命中测试共用逻辑像素；小图标保留 44px 触摸间距。 */
export function getUILayout(width = CONFIG.screenWidth, height = CONFIG.screenHeight) {
    const landscape = width > height;
    const left = CONFIG.uiSafeLeft || 6, right = CONFIG.uiSafeRight || 6;
    const top = CONFIG.uiSafeTop || 8, bottom = CONFIG.uiSafeBottom || 18;
    const rope = { x: width - right - 76, y: height - bottom - 76, radius: 26 };
    const action = { x: rope.x - 82, y: rope.y - 46, radius: 26 };
    // 横屏贴顶横排；竖屏恢复贴左向下的独立竖列。
    const toolbar = landscape
        ? { orientation: { x: left + 172, y: top + 22 }, settings: { x: left + 216, y: top + 22 },
            tape: { x: left + 260, y: top + 22 }, flashlight: { x: left + 304, y: top + 22 }, retreat: { x: left + 348, y: top + 22 } }
        : { tape: { x: left + 22, y: top + 136 }, retreat: { x: left + 22, y: top + 180 },
            settings: { x: left + 22, y: top + 224 }, flashlight: { x: left + 22, y: top + 268 }, orientation: { x: left + 22, y: top + 312 } };
    return {
        landscape, left, right, top, bottom, rope, action,
        oxygen: { x: left + 22, y: top + 22, size: 44 },
        depth: { x: left + (landscape ? 78 : 22), y: top + (landscape ? 22 : 86), size: 36 },
        deco: { x: left + (landscape ? 124 : 66), y: top + (landscape ? 22 : 86), size: 28 },
        stamina: { x: left + 2, y: top + 60, width: landscape ? 60 : 44, height: 3 },
        orientation: { ...toolbar.orientation, size: 26 },
        settings: { ...toolbar.settings, size: 28 },
        tape: { ...toolbar.tape, size: 32 },
        flashlight: { ...toolbar.flashlight, size: 28 },
        retreat: { ...toolbar.retreat, size: 26 },
        bag: { x: left + (landscape ? 82 : 2), y: top + (landscape ? 50 : 348) },
        trialExit: { x: left + (landscape ? 186 : 2), y: top + (landscape ? 50 : 384) },
        moveTop: top + (landscape ? 84 : 128),
    };
}

export function getOrientationButton(inDive: boolean) {
    const L = getUILayout();
    return inDive ? L.orientation : { x: L.left + 22, y: L.top + 22, size: 26 };
}
