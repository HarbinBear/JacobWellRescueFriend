import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import { isLineOfSight } from '../world/Visibility';
import type { FishEnemy } from './FishEnemy';
import type { RopePoint } from './RopeNet';

export function isFishStunned(fish: FishEnemy) {
    return (fish.stunFrames || 0) > 0;
}

export function stunFish(fish: FishEnemy): boolean {
    if (fish.dead || !state.fishEnemies.includes(fish)) return false;
    fish.stunFrames = CONFIG.fishInteraction.stunFrames;
    fish.stunUntil = Date.now() + CONFIG.fishInteraction.stunFrames / 60 * 1000;
    fish.state = 'stunned';
    fish.stateTimer = 0;
    fish.lungeCharge = 0;
    fish.lightFrames = 0;
    fish.alertIcon = '';
    fish.alertTimer = 0;
    fish.vx *= .18;
    fish.vy *= .18;
    return true;
}

/** Captivity is separate from the AI state; a awake bound fish is not a corpse. */
export function stepFishCaptivity(fish: FishEnemy, move: (fish: FishEnemy, effort: RopePoint) => unknown) {
    if (fish.netGraceFrames > 0) fish.netGraceFrames--;
    if (isFishStunned(fish)) {
        fish.stunFrames = fish.stunUntil > 0 ? Math.max(0, (fish.stunUntil - Date.now()) * .06) : fish.stunFrames - 1;
        fish.stateTimer++;
        fish.animTime += .012;
        fish.vx *= .90;
        fish.vy *= .90;
        move(fish, { x: 0, y: 0 });
        if (fish.stunFrames === 0) {
            fish.state = fish.bound ? 'bound' : 'roam';
            fish.stateTimer = 0;
            fish.roamTimer = 0;
            fish.alertIcon = '?';
            fish.alertIconColor = '#d5e9c6';
            fish.alertTimer = 28;
        }
        return true;
    }
    if (!fish.bound) return false;
    fish.state = 'bound';
    fish.stateTimer++;
    fish.animTime += .055;
    const beat = Math.sin(fish.stateTimer * .19);
    const burst = Math.max(0, Math.sin(fish.stateTimer * .043));
    const effort = { x: Math.cos(fish.angle) * burst * 1.25 - Math.sin(fish.angle) * beat,
        y: Math.sin(fish.angle) * burst * 1.25 + Math.cos(fish.angle) * beat };
    fish.vx = fish.vx * .92 + effort.x * .055;
    fish.vy = fish.vy * .92 + effort.y * .055;
    fish.angle += beat * .009;
    move(fish, effort);
    return true;
}

/** A swimmer backs off rather than letting a slow approach become a free hit. */
export function keepFishDistance(fish: FishEnemy) {
    if (fish.bound || isFishStunned(fish) || ['lunge', 'bite', 'devour', 'flee', 'fear', 'hit'].includes(fish.state)) return;
    const dx = fish.x - player.x, dy = fish.y - player.y, distance = Math.hypot(dx, dy);
    const safe = CONFIG.fishInteraction.safeDistance;
    if (distance >= safe || !isLineOfSight(fish.x, fish.y, player.x, player.y, safe + 2)) return;
    const nx = distance > .01 ? dx / distance : Math.cos(fish.angle);
    const ny = distance > .01 ? dy / distance : Math.sin(fish.angle);
    const away = Math.max(1.3, Math.min(4.8, (safe - distance) * .20));
    const inward = fish.vx * nx + fish.vy * ny;
    if (inward < away) { fish.vx += nx * (away - inward); fish.vy += ny * (away - inward); }
}
