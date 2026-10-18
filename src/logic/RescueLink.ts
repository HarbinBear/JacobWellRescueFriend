import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

/** Commit the clasp only while the same uninterrupted hold is still in reach. */
export function updateRescueLink(now = Date.now()): void {
    const maze = state.mazeRescue;
    if (!maze || maze.phase !== 'play' || maze.npcRescued || !state.npc.active || !maze.npcRescueHolding) return;
    if (Math.hypot(player.x - state.npc.x, player.y - state.npc.y) >= CONFIG.maze.npcRescueRange) {
        maze.npcRescueHolding = false;
        maze.npcRescueHoldStart = 0;
        maze.npcRescueTouchId = null;
        return;
    }
    if (now - maze.npcRescueHoldStart < CONFIG.maze.npcRescueHoldDuration * 1000) return;
    maze.npcRescued = true;
    maze.npcRescueHolding = false;
    maze.npcRescueTouchId = null;
    maze.npcSecuredAt = now;
    state.npc.state = 'follow';
}
