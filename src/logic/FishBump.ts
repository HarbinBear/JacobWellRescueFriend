import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import { playSFX } from '../audio/AudioManager';
import { spawnImpactBurst } from './BreathSystem';
import { applyRopeBodyImpulse, getRopeResponseAlong } from './Rope';
import { projectOntoStrand } from './RopeNet';
import { isLineOfSight } from '../world/Visibility';
import type { FishEnemy } from './FishEnemy';

/** A body collision transfers momentum and leaves the swimmer in control. */
export function tryFishBump(fish: FishEnemy, vx: number, vy: number): boolean {
    if (fish.kind !== 'rammer' || state.fishBite?.active) return false;
    const ux = Math.cos(fish.angle), uy = Math.sin(fish.angle);
    const nose = { x: fish.x + ux * 20, y: fish.y + uy * 20 };
    const next = { x: nose.x + vx, y: nose.y + vy };
    const nearest = projectOntoStrand(player, nose, next);
    const radius = (state.screen === 'mazeRescue' ? CONFIG.maze.playerRadius : CONFIG.playerRadius) + 10;
    if (Math.hypot(player.x - nearest.x, player.y - nearest.y) > radius ||
        !isLineOfSight(fish.x, fish.y, player.x, player.y, radius + 34)) return false;
    const hold = getRopeResponseAlong(fish, player, 13, vx, vy);
    if (hold?.kind === 'snag') return false;
    const dx = player.x - fish.x, dy = player.y - fish.y, distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance, ny = dy / distance;
    const closing = (vx - player.vx) * nx + (vy - player.vy) * ny;
    if (closing <= .5) return false;
    const impulse = Math.min(5.8, closing * .65);
    fish.vx = vx - nx * impulse / .55;
    fish.vy = vy - ny * impulse / .55;
    if (state.fishBump.cooldown > 0) return true;
    applyRopeBodyImpulse(player, nx * impulse, ny * impulse);
    const strength = Math.min(1, impulse / 5.8);
    Object.assign(state.fishBump, {
        timer: 26, cooldown: 65, x: player.x - nx * 11, y: player.y - ny * 11, nx, ny, strength,
    });
    state.fx.shake = Math.max(state.fx.shake || 0, 1.2 + strength * 1.8);
    spawnImpactBurst(player.x, player.y, strength * .25, .16);
    playSFX('collisionBreath', { volume: .28 + strength * .22, playbackRate: .8 });
    return true;
}

export function stepFishBump() {
    const bump = state.fishBump;
    if (bump.cooldown > 0) bump.cooldown--;
    if (bump.timer <= 0) return;
    bump.timer--;
    // Water catches the suddenly displaced body. Steering and propulsion continue.
    if (bump.timer > 8) {
        player.vx *= .94;
        player.vy *= .94;
    }
}
