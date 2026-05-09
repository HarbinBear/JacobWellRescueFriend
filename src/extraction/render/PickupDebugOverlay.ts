// 拾取调试可视化（世界层）
//
// 默认关闭；GM 面板可以打开。
// 打开时显示：
// - 玩家周围的拾取范围圆圈（蓝色虚线）
// - 范围内的 Relic：绿色实线圈 + "可拾取"文字
// - 范围外但视野内的 Relic：橙色虚线圈 + 距离文字
//
// 用于排查"为什么拾取按钮不出现"的问题

import { CONFIG } from '../../core/config';
import { state, player } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { getPickupRange } from '../logic/ItemPickup';
import { getExtractionState } from '../core/ExtractionState';

export function isPickupDebugEnabled(): boolean {
    const cfg: any = (CONFIG as any).extraction;
    return !!(cfg && cfg.debugPickupOverlay);
}

/** 在世界层（已经做过相机变换）绘制 */
export function drawPickupDebugOverlay(): void {
    if (!isPickupDebugEnabled()) return;
    if (state.screen !== 'mazeRescue') return;
    const maze: any = state.mazeRescue;
    if (!maze || maze.phase !== 'play') return;
    const relics: any[] = maze.relics || [];

    const range = getPickupRange();

    ctx.save();

    // 玩家周围的拾取范围圆圈（蓝色虚线）
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(player.x, player.y, range, 0, Math.PI * 2);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

    // 中心十字标
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(player.x - 6, player.y);
    ctx.lineTo(player.x + 6, player.y);
    ctx.moveTo(player.x, player.y - 6);
    ctx.lineTo(player.x, player.y + 6);
    ctx.stroke();

    // 拾取范围数值（小字）
    ctx.fillStyle = 'rgba(100, 180, 255, 0.8)';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('拾取 R=' + range, player.x + 8, player.y + range + 4);

    // 已拾取 set
    const ex = getExtractionState();
    const picked = ex ? ex.diveSession.pickedRelicIds : [];
    const pickedSet = new Set(picked);

    // 遍历每个 Relic 画判定
    for (const r of relics) {
        if (pickedSet.has(r.id)) continue;
        const dist = Math.hypot(player.x - r.x, player.y - r.y);
        const inRange = dist < range;

        // 圈
        if (typeof ctx.setLineDash === 'function') {
            ctx.setLineDash(inRange ? [] : [4, 3]);
        }
        ctx.strokeStyle = inRange ? 'rgba(80, 230, 130, 0.95)' : 'rgba(255, 170, 80, 0.65)';
        ctx.lineWidth = inRange ? 2 : 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 22, 0, Math.PI * 2);
        ctx.stroke();
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

        // 文字
        ctx.fillStyle = inRange ? 'rgba(120, 255, 160, 0.95)' : 'rgba(255, 200, 120, 0.85)';
        ctx.font = inRange ? 'bold 11px Arial' : '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (inRange) {
            ctx.fillText('✓ 可拾取 (' + Math.round(dist) + 'px)', r.x, r.y + 28);
        } else {
            ctx.fillText(Math.round(dist) + 'px', r.x, r.y + 28);
        }
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
