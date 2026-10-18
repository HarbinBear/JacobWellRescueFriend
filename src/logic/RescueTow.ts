import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { checkMazeCollision } from './Collision';
import { createRescueRagdoll, stepRescueRagdoll } from './RescueRagdoll';

function canMove(x: number, y: number, tx: number, ty: number): boolean {
    const maze = state.mazeRescue;
    if (!maze) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) / 6));
    for (let i = 1; i <= steps; i++) {
        if (checkMazeCollision(x + (tx - x) * i / steps, y + (ty - y) * i / steps, maze)) return false;
    }
    return true;
}

export function updateRescueTow(): void {
    const maze = state.mazeRescue, npc = state.npc;
    if (!maze || !maze.npcStunned || !npc.active) return;
    const r = maze.rescueRagdoll || (maze.rescueRagdoll = createRescueRagdoll(npc.vx, npc.vy));
    let dx = player.x - npc.x, dy = player.y - npc.y, dist = Math.hypot(dx, dy);
    const rest = CONFIG.maze.npcTetherIdealDist;
    let towAngle: number | null = null;
    if (maze.npcRescued && dist > rest) {
        // A slack rope cannot push or propel him. Stretch alone accelerates him.
        const force = Math.min(1.6, (dist - rest) * .013);
        npc.vx += dx / dist * force;
        npc.vy += dy / dist * force;
        towAngle = Math.atan2(dy, dx);
    }
    npc.vx *= .955; npc.vy *= .955;
    const speed = Math.hypot(npc.vx, npc.vy);
    if (speed > 11) { npc.vx *= 11 / speed; npc.vy *= 11 / speed; }
    if (!checkMazeCollision(npc.x + npc.vx, npc.y, maze)) npc.x += npc.vx;
    else { npc.vx *= -.22; r.bodyVelocity += .6; }
    if (!checkMazeCollision(npc.x, npc.y + npc.vy, maze)) npc.y += npc.vy;
    else { npc.vy *= -.22; r.bodyVelocity -= .6; }

    dx = player.x - npc.x; dy = player.y - npc.y; dist = Math.hypot(dx, dy);
    if (maze.npcRescued && dist < 44) {
        // Soft body contact while the rope is slack: don't pile both silhouettes
        // into one figure after stopping or reversing direction.
        const nx = dist > .001 ? -dx / dist : -Math.cos(player.angle);
        const ny = dist > .001 ? -dy / dist : -Math.sin(player.angle);
        const x = npc.x + nx * (44 - dist), y = npc.y + ny * (44 - dist);
        if (canMove(npc.x, npc.y, x, y)) {
            npc.x = x; npc.y = y;
            npc.vx += nx * .12; npc.vy += ny * .12;
        }
        dx = player.x - npc.x; dy = player.y - npc.y; dist = Math.hypot(dx, dy);
    }
    const max = CONFIG.maze.npcTetherMaxDist;
    if (maze.npcRescued && dist > max) {
        // Split the hard rope correction by mass. If rock blocks the casualty,
        // the diver bears the correction instead of teleporting him through it.
        const over = dist - max, nx = dx / dist, ny = dy / dist;
        let npcCorrection = over * .78;
        const x = npc.x + nx * npcCorrection, y = npc.y + ny * npcCorrection;
        if (canMove(npc.x, npc.y, x, y)) { npc.x = x; npc.y = y; }
        else npcCorrection = 0;
        const pull = over - npcCorrection;
        const px = player.x - nx * pull, py = player.y - ny * pull;
        if (canMove(player.x, player.y, px, py)) { player.x = px; player.y = py; }
        const away = player.vx * nx + player.vy * ny;
        if (away > 0) { player.vx -= nx * away * .35; player.vy -= ny * away * .35; }
    }
    npc.angle = stepRescueRagdoll(r, npc.angle, npc.vx, npc.vy, towAngle);
}
