import { CONFIG } from '../src/core/config';
import { state, player, input } from '../src/core/state';
import { getKarstTerrain } from '../src/world/KarstTerrain';
import { world, circleCollision } from '../src/world/continuous/Geometry';
import { snapCameraToPlayer } from '../src/logic/CameraLogic';
import { resetDriveInput } from '../src/logic/DriveMode';
import { resetBCDSystem } from '../src/logic/BCDSystem';

// Browser-only review conveniences. There is no alternate game renderer,
// reference photograph backdrop, geometry adapter, or phone teleport button.
export function karstReviewSites() {
    const maze = state.mazeRescue, t = getKarstTerrain(maze), w = world();
    if (!t || !w) return [];
    const features = t.formations.filter(f => f.direction > 0 && f.y > w.seamY + 250 && f.y < 6500);
    const score = (f: typeof features[number]) => Math.abs(f.x - w.originX) * .17 + Math.abs(f.y - 2400) * .1 - f.length * 1.7;
    features.sort((a, b) => score(a) - score(b));
    const sites: { player: { x: number; y: number }; aim: { x: number; y: number }; length: number }[] = [];
    for (const f of features) {
        if (sites.some(s => Math.hypot(s.aim.x - f.x, s.aim.y - f.y) < 220)) continue;
        for (const [dx, dy] of [[-145, f.length * .48], [145, f.length * .48], [-105, f.length + 50], [105, f.length + 50]]) {
            const p = { x: f.x + dx, y: f.y + dy };
            if (circleCollision(p.x, p.y, 26)) continue;
            sites.push({ player: p, aim: { x: f.x, y: f.y + f.length * .45 }, length: f.length }); break;
        }
        if (sites.length >= 5) break;
    }
    return sites;
}
export function inspectKarstSite(index = 0) {
    const w = world(), site = karstReviewSites()[index]; if (!w || !site) return false;
    resetDriveInput(); Object.assign(player, site.player, { vx: 0, vy: 0 });
    player.angle = player.targetAngle = input.targetAngle = Math.atan2(site.aim.y - player.y, site.aim.x - player.x);
    Object.assign(w, { wet: 1, headWet: true, grounded: false, landBlend: 0, stationId: null, resting: false, panel: null, notice: '', noticeUntil: 0 });
    CONFIG.infiniteO2 = true; resetBCDSystem(); snapCameraToPlayer();
    return true;
}
export function rotateKarstLight(delta = .13) {
    player.angle += delta; player.targetAngle = input.targetAngle = player.angle;
}
export function freezeKarstReview() { const w = world(); if (w) w.hidden = !w.hidden; }
