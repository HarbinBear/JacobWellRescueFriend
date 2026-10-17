import { state } from '../core/state';
import { getWindowMetrics } from '../core/WindowMetrics';

// 用户定义的发现：角色身体进入画面即可，不依赖距离、照明、朝向或遮挡。
// lookAheadSeconds 仅供音乐为下个拍点预排；游戏发现文字只查询当前帧。
export function isRescueTargetVisible(lookAheadSeconds = 0): boolean {
    const npc = state.npc, maze = state.mazeRescue;
    if (!maze || !npc || !npc.active || maze.npcRescued) return false;
    const camera = state.camera, zoom = Math.max(0.01, camera.zoom);
    const window = getWindowMetrics();
    const seconds = Math.max(0, Math.min(0.5, lookAheadSeconds));
    // 游戏运动/弹簧相机本身按60帧推进；只预测最多半秒，下一帧重新核验。
    const dx = npc.x - camera.x - camera.swayX + ((npc.vx || 0) - (camera.vx || 0)) * seconds * 60;
    const dy = npc.y - camera.y - camera.swayY + ((npc.vy || 0) - (camera.vy || 0)) * seconds * 60;
    const bodyRadius = 16 * zoom;
    return Math.abs(dx) * zoom <= window.windowWidth / 2 + bodyRadius
        && Math.abs(dy) * zoom <= window.windowHeight / 2 + bodyRadius;
}
