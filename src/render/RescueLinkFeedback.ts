import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { cutPanel, TAPE } from './TapeDeckVisual';

/** Read the interaction itself, so cancelling cannot leave an animated false success. */
export function getRescueLinkFeedback(now = Date.now()): { mode: 'ready' | 'holding' | 'secured'; progress: number; alpha: number } | null {
    const maze = state.mazeRescue;
    if (!maze || maze.phase !== 'play' || !state.npc.active) return null;
    if (maze.npcRescued) {
        const age = (now - (maze.npcSecuredAt || 0)) / 1000;
        return maze.npcSecuredAt && age >= 0 && age < 4
            ? { mode: 'secured', progress: 1, alpha: Math.min(1, (4 - age) / .7) } : null;
    }
    if (Math.hypot(player.x - state.npc.x, player.y - state.npc.y) >= CONFIG.maze.npcRescueRange) return null;
    return maze.npcRescueHolding
        ? { mode: 'holding', progress: Math.max(0, Math.min(1, (now - maze.npcRescueHoldStart) / (1000 * CONFIG.maze.npcRescueHoldDuration))), alpha: 1 }
        : { mode: 'ready', progress: 0, alpha: .9 };
}

function clasp(x: number, y: number, progress: number, locked: boolean): void {
    // Two pieces of webbing feed into the same clasp, then its gate snaps shut.
    const gap = (1 - progress) * 13;
    ctx.fillStyle = locked ? '#b9452e' : '#8f7257';
    ctx.fillRect(x - 57, y - 5, 41 - gap, 10); ctx.fillRect(x + 16 + gap, y - 5, 41 - gap, 10);
    ctx.strokeStyle = '#e8cf9d'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(x - 53 + i * 6, y - 3); ctx.lineTo(x - 50 + i * 6, y + 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 26 + i * 6, y - 3); ctx.lineTo(x + 29 + i * 6, y + 3); ctx.stroke();
    }
    ctx.lineWidth = 2; ctx.strokeStyle = locked ? TAPE.paper : '#a3aaa0';
    cutPanel(ctx, x - 17 - gap, y - 10, 22, 20, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 17 + gap, y - 9); ctx.lineTo(x + 6 + gap, y - 9);
    ctx.lineTo(x + 6 + gap, y + 9); ctx.lineTo(x + 17 + gap, y + 9); ctx.stroke();
    if (locked) {
        ctx.strokeStyle = TAPE.paper; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x + 8, y - 5); ctx.stroke();
    }
}

export function drawRescueLinkFeedback(): void {
    const feedback = getRescueLinkFeedback();
    if (!feedback) return;
    const camera = state.camera;
    const nx = logicW / 2 + (state.npc.x - camera.x - camera.swayX) * camera.zoom;
    const ny = logicH / 2 + (state.npc.y - camera.y - camera.swayY) * camera.zoom;
    if (nx < -60 || nx > logicW + 60 || ny < -60 || ny > logicH + 60) return;
    // Attach to the person, above or below their silhouette, never at the old toast position.
    const w = 156, h = feedback.mode === 'secured' ? 72 : 61;
    const x = Math.max(87, Math.min(logicW - w - 57, nx - w / 2));
    const y = Math.max(110, Math.min(logicH - 130, ny > logicH - 210 ? ny - 118 : ny + 72));
    const locked = feedback.mode === 'secured';
    ctx.save(); ctx.globalAlpha *= feedback.alpha;
    ctx.fillStyle = locked ? TAPE.paper : 'rgba(18,30,31,.94)'; cutPanel(ctx, x, y, w, h, 7); ctx.fill();
    ctx.fillStyle = '#b9452e'; ctx.fillRect(x, y + 8, 3, h - 16);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px "PingFang SC", Arial'; ctx.fillStyle = locked ? TAPE.ink : TAPE.paper;
    ctx.fillText(locked ? '接住你了。' : feedback.mode === 'holding' ? '别松手' : '按住他 · 接上安全绳', x + w / 2, y + 15);
    ctx.save();
    if (locked) { ctx.fillStyle = TAPE.ink; cutPanel(ctx, x + 12, y + 29, w - 24, 27, 3); ctx.fill(); }
    clasp(x + w / 2, y + 41, feedback.progress, locked); ctx.restore();
    if (locked) {
        ctx.fillStyle = '#6c705e'; ctx.font = '9px "PingFang SC", Arial';
        ctx.fillText('安全绳已扣紧  /  一起回去', x + w / 2, y + 63);
    } else if (feedback.mode === 'holding') {
        ctx.fillStyle = '#b9452e'; ctx.fillRect(x + 12, y + h - 4, (w - 24) * feedback.progress, 2);
    }
    ctx.restore();
}
