import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { createRescueRagdoll } from './RescueRagdoll';
import { playSFX } from '../audio/AudioManager';

/** Stun or clasp only while the same uninterrupted hold is still in reach. */
export function updateRescueLink(now = Date.now()): void {
    const maze = state.mazeRescue;
    if (!maze || maze.phase !== 'play' || maze.npcRescued || !state.npc.active || !maze.npcRescueHolding) return;
    if (Math.hypot(player.x - state.npc.x, player.y - state.npc.y) >= CONFIG.maze.npcRescueRange) {
        maze.npcRescueHolding = false;
        maze.npcRescueHoldStart = 0;
        maze.npcRescueTouchId = null;
        return;
    }
    const stunned = !!maze.npcStunned;
    const duration = stunned ? CONFIG.maze.npcRescueHoldDuration : CONFIG.maze.npcStunHoldDuration;
    if (now - maze.npcRescueHoldStart < duration * 1000) return;
    maze.npcRescueHolding = false;
    maze.npcRescueHoldStart = 0;
    maze.npcRescueTouchId = null;
    if (!stunned) {
        maze.npcStunned = true;
        maze.npcStunnedAt = now;
        maze.rescueRagdoll = createRescueRagdoll(state.npc.vx, state.npc.vy);
        state.npc.state = 'limp';
        const dx = state.npc.x - player.x, dy = state.npc.y - player.y;
        const dist = Math.hypot(dx, dy) || 1;
        state.npc.vx += dx / dist * .9;
        state.npc.vy += dy / dist * .9;
        state.npc.distressActive = false;
        state.npc.distressBubbles = [];
        state.npc.distressHalos = [];
        // Dedicated, locally bundled cartoon bonk; still works with music off.
        playSFX('rescueBonk', { volume: .8 });
        return;
    }
    maze.npcRescued = true;
    maze.npcSecuredAt = now;
    state.npc.state = 'limp';
}
