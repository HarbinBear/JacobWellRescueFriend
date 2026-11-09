import { CONFIG } from '../src/core/config';
import { state, player, input } from '../src/core/state';
import { getKarstTerrain, buildKarstTerrain, karstRay } from '../src/world/KarstTerrain';
import { releaseKarstSurface, inspectKarst } from '../src/render/RenderKarst';
import { world, circleCollision } from '../src/world/continuous/Geometry';
import { snapCameraToPlayer } from '../src/logic/CameraLogic';
import { resetDriveInput } from '../src/logic/DriveMode';
import { resetBCDSystem } from '../src/logic/BCDSystem';

export interface KarstReviewSite {
    player: { x: number; y: number }; aim: { x: number; y: number }; length: number;
    label: string; grammar: string; roomId: number;
}
const labels: Record<string, string> = { flow: '流石垂幕', fracture: '倾斜断裂', tufa: '钙华盆地', vault: '巨岩低拱' };
// Only testing convenience is added here. All pixels, collisions and saves still
// use game.ts + src. These teleport/variant controls stay outside the phone pack.
export function karstReviewSites() {
    const maze = state.mazeRescue, t = getKarstTerrain(maze), w = world(); if (!t || !w) return [];
    const features = t.formations.filter(f => f.y > w.seamY + 160 && (t.generation === 'chambers' || f.direction > 0));
    const score = (f: typeof features[number]) => Math.abs(f.x - w.originX) * .07 + Math.abs(f.y - 2400) * .05 - f.length * 1.2 - ((f as any).landmark ? 150 : 0);
    features.sort((a, b) => score(a) - score(b));
    const sites: KarstReviewSite[] = [];
    function add(f: typeof features[number]) {
        const extra = f as any, ax = extra.axisX ?? 0, ay = extra.axisY ?? f.direction;
        const room = t.chambers?.rooms[extra.roomId], grammar = room?.grammar || 'flow';
        let aim = { x: f.x + ax * f.length * .43, y: f.y + ay * f.length * .43 };
        if (sites.some(s => Math.hypot(s.aim.x - aim.x, s.aim.y - aim.y) < 220)) return;
        const right=ay>=0?1:-1;
        const choices:number[][]=[];for(const u of [.46,.62,.28,.79])for(const margin of [75,108,145])for(const side of [right,-right])choices.push([u,margin,side]);
        for (const [u,margin,side] of choices) {
            const width=f.width*Math.pow(Math.max(.06,1-u),extra.taper??.69),distance=width+margin,depth=f.length*u;
            const centerBend=f.bend*u*u*(3-2*u);
            const p = { x: f.x + ax * depth + ay * (distance * side+centerBend), y: f.y + ay * depth - ax * (distance * side+centerBend) };
            const target={x:f.x+ax*depth+ay*centerBend,y:f.y+ay*depth-ax*centerBend};aim=target;
            if (circleCollision(p.x, p.y, 26)) continue;
            const rayLength=Math.hypot(aim.x-p.x,aim.y-p.y),hit=karstRay(t,p.x,p.y,(aim.x-p.x)/rayLength,(aim.y-p.y)/rayLength,rayLength+85);
            if(!hit.wall||hit.distance>rayLength+35||hit.distance<42||hit.distance>235)continue;
            aim={x:hit.x,y:hit.y};
            sites.push({ player: p, aim, length: f.length, label: labels[grammar] || grammar, grammar, roomId: extra.roomId ?? -1 }); break;
        }
    }
    if (t.generation === 'chambers') for (const grammar of ['flow', 'fracture', 'tufa', 'vault']) {
        for (const f of features) { if (t.chambers?.rooms[(f as any).roomId]?.grammar !== grammar) continue;
            const before = sites.length; add(f); if (sites.length > before) break; }
    }
    for (const f of features) { if (sites.length >= 7) break; add(f); }
    return sites;
}
export function inspectKarstSite(index = 0) {
    const w = world(), site = karstReviewSites()[index]; if (!w || !site) return false;
    resetDriveInput(); Object.assign(player, site.player, { vx: 0, vy: 0 });
    player.angle = player.targetAngle = input.targetAngle = Math.atan2(site.aim.y - player.y, site.aim.x - player.x);
    Object.assign(w, { wet: 1, headWet: true, grounded: false, landBlend: 0, stationId: null, resting: false, panel: null, notice: '', noticeUntil: 0 });
    CONFIG.infiniteO2 = true; resetBCDSystem(); snapCameraToPlayer();
    state.camera.x+=(site.aim.x-player.x)*.32;state.camera.y+=(site.aim.y-player.y)*.28;
    if(getKarstTerrain(state.mazeRescue)?.generation==='chambers')state.camera.zoom=state.camera.targetZoom=.88;
    return true;
}
export function chooseKarstVersion(version = 'E01', preservePosition = true) {
    const maze: any = state.mazeRescue, w = world(); if (!maze || !w) return false;
    const generation = version === 'V01' || version === 'E01' ? 'legacy' : 'chambers';
    const previous = getKarstTerrain(maze), wasHidden = w.hidden;
    if (previous?.generation !== generation && (state.rope.ropes.length || state.rope.links.length)) {
        w.notice='已有绳网时请用新评审档比较不同洞形'; w.noticeUntil=w.elapsed+5; return false;
    }
    w.hidden = true; resetDriveInput();
    CONFIG.karst.surfaceMode = version === 'V01' ? 'baseline' : 'sculpted';
    CONFIG.karst.style = version === 'E03' ? 'engraved' : version === 'E04' ? 'cinematic' : 'natural';
    CONFIG.karst.geometryMode = generation; inspectKarst(0);
    if (previous?.generation !== generation) { releaseKarstSurface(); maze.karstGeneration = generation; buildKarstTerrain(maze, generation); }
    if (!preservePosition || circleCollision(player.x, player.y, 26)) inspectKarstSite(0);
    w.hidden = wasHidden; return true;
}
export function rotateKarstLight(delta = .13) { player.angle += delta; player.targetAngle = input.targetAngle = player.angle; }
export function freezeKarstReview() { const w = world(); if (w) w.hidden = !w.hidden; }
