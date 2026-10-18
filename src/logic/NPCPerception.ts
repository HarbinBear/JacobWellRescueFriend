import { state } from '../core/state';
import { getWindowMetrics } from '../core/WindowMetrics';

function framing(): { x: number; y: number; vx: number; vy: number; halfX: number; halfY: number } | null {
    const npc = state.npc, maze = state.mazeRescue;
    if (!maze || !npc || !npc.active || maze.npcRescued) return null;
    const camera = state.camera, zoom = Math.max(0.01, camera.zoom), window = getWindowMetrics();
    return { x: npc.x - camera.x - camera.swayX, y: npc.y - camera.y - camera.swayY,
        vx: ((npc.vx || 0) - (camera.vx || 0)) * 60, vy: ((npc.vy || 0) - (camera.vy || 0)) * 60,
        // Include the raised hand, bent fins and lateral dance step, so discovery
        // music is scheduled as the body enters rather than waiting for its centre.
        halfX: window.windowWidth / (2 * zoom) + 32, halfY: window.windowHeight / (2 * zoom) + 56 };
}

// 游戏发现仍以实际视口为准；保留未来单帧查询供其他调用方使用。
export function isRescueTargetVisible(lookAheadSeconds = 0): boolean {
    const f = framing();
    if (!f) return false;
    const t = Math.max(0, Math.min(1.1, lookAheadSeconds));
    return Math.abs(f.x + f.vx * t) <= f.halfX && Math.abs(f.y + f.vy * t) <= f.halfY;
}

// 扫掠角色身体与视口的相交时间，考虑相机/角色相对速度和缩放。
// 同时求两轴在屏幕内的时间区间；高速穿过或斜向错过也能正确判断。
export function rescueTargetEntrySeconds(maxSeconds = 1.1): number {
    const f = framing();
    if (!f) return Infinity;
    let enter = 0, leave = Math.max(0, Math.min(1.1, maxSeconds));
    for (const [position, velocity, extent] of [[f.x, f.vx, f.halfX], [f.y, f.vy, f.halfY]]) {
        if (Math.abs(velocity) < 0.001) {
            if (Math.abs(position) > extent) return Infinity;
        } else {
            const a = (-extent - position) / velocity, b = (extent - position) / velocity;
            enter = Math.max(enter, Math.min(a, b));
            leave = Math.min(leave, Math.max(a, b));
        }
    }
    return enter <= leave ? enter : Infinity;
}
