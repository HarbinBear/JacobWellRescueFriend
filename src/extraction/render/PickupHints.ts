// 拾取飘字渲染
//
// 显示位置：跟随物品的世界坐标（受相机变换），上浮 + 淡出
// 设计参考：现有 Relic 的"发现 hint"飘字

import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { getPickupHints, updatePickupHints } from '../logic/ItemPickup';

export function isPickupHintsVisible(): boolean {
    if (state.screen !== 'mazeRescue') return false;
    const maze: any = state.mazeRescue;
    if (!maze) return false;
    return maze.phase === 'play';
}

/** 在 HUD 层绘制（已经经过相机变换还原回屏幕坐标） */
export function drawPickupHints(): void {
    if (!isPickupHintsVisible()) return;

    // 推进生命周期
    updatePickupHints();

    const hints = getPickupHints();
    if (hints.length === 0) return;

    const cw = CONFIG.screenWidth;
    const ch = CONFIG.screenHeight;
    const cam = state.camera;
    if (!cam) return;
    const camX = cam.x + (cam.swayX || 0);
    const camY = cam.y + (cam.swayY || 0);
    const zoom = cam.zoom || 1;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const h of hints) {
        // 世界坐标 → 屏幕坐标
        const screenX = cw / 2 + (h.x - camX) * zoom;
        const screenY = ch / 2 + (h.y - camY) * zoom;

        // 视椎剔除
        if (screenX < -100 || screenX > cw + 100) continue;
        if (screenY < -50 || screenY > ch + 50) continue;

        // 生命周期透明度（前 0.2 期淡入，后 0.3 期淡出）
        const tNorm = h.life / h.maxLife;
        let alpha = 1;
        if (tNorm < 0.15) alpha = tNorm / 0.15;
        else if (tNorm > 0.7) alpha = (1 - tNorm) / 0.3;
        alpha = Math.max(0, Math.min(1, alpha));

        // 黑色阴影衬底
        ctx.fillStyle = 'rgba(0, 0, 0, ' + (alpha * 0.7) + ')';
        ctx.font = 'bold 13px "PingFang SC", Arial';
        ctx.fillText(h.text, screenX + 1, screenY + 1);

        // 主文字（金色）
        ctx.fillStyle = 'rgba(255, 220, 140, ' + alpha + ')';
        ctx.fillText(h.text, screenX, screenY);
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
