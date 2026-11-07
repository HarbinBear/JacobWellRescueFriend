import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import type { FishEnemy } from '../logic/FishEnemy';

/** Broad shoulders, a swept dorsal fin and a crescent tail separate the hunter
 * from the small piranha and the flexible, blunt-headed ramming eel. */
export function drawHunterShark(c: CanvasRenderingContext2D, fish: FishEnemy, strain: number) {
    const attack = fish.state === 'lunge' || fish.state === 'bite' || fish.state === 'devour';
    const beat = Math.sin(fish.animTime * (attack ? 2.4 : .85)) * .16 + strain * .45;
    c.save(); c.scale(CONFIG.fishEnemy.size * 1.35, CONFIG.fishEnemy.size * 1.35);
    c.fillStyle = '#465f70'; c.strokeStyle = '#253a49'; c.lineWidth = .035;
    // The fins sit behind the heavy body, rather than looking like another jaw.
    c.beginPath(); c.moveTo(.06, -.29); c.lineTo(-.40, -1.02); c.quadraticCurveTo(-.62, -.63, -.52, -.24); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(.28, .17); c.lineTo(-.49, .93 + beat * .3); c.lineTo(-.28, .27); c.closePath(); c.fill(); c.stroke();
    c.save(); c.translate(-1.03, beat * .45); c.rotate(beat);
    c.beginPath(); c.moveTo(.05, 0); c.quadraticCurveTo(-.15, -.35, -.64, -.72);
    c.quadraticCurveTo(-.42, -.17, -.29, 0); c.quadraticCurveTo(-.41, .27, -.61, .61);
    c.quadraticCurveTo(-.15, .39, .05, 0); c.fill(); c.stroke(); c.restore();
    const skin = c.createLinearGradient(0, -.43, 0, .43);
    skin.addColorStop(0, '#354e60'); skin.addColorStop(.48, '#7f99a5'); skin.addColorStop(1, '#d3dbd4');
    c.fillStyle = skin;
    c.beginPath(); c.moveTo(1.29, .02); c.bezierCurveTo(.93, -.43, .17, -.48, -.37, -.31);
    c.quadraticCurveTo(-.82, -.12 + beat * .2, -1.12, beat * .45);
    c.quadraticCurveTo(-.65, .15 + beat * .2, -.28, .30);
    c.quadraticCurveTo(.58, .46, 1.29, .02); c.fill(); c.stroke();
    c.strokeStyle = '#435968'; c.lineWidth = .038;
    c.beginPath();
    for (let i = 0; i < 4; i++) { const x = .21 - i * .10; c.moveTo(x, -.21); c.quadraticCurveTo(x - .10, 0, x - .02, .18); }
    c.stroke();
    c.fillStyle = '#101e29'; c.beginPath(); c.ellipse(.84, -.13, .061, .051, -.25, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#dce8e4'; c.beginPath(); c.arc(.86, -.15, .018, 0, Math.PI * 2); c.fill();
    const jaw = attack ? .12 + .035 * Math.sin(fish.animTime * 2) : .026;
    c.fillStyle = '#30282d'; c.beginPath(); c.moveTo(1.16, .07);
    c.quadraticCurveTo(.86, .11 + jaw, .53, .14); c.quadraticCurveTo(.91, .04, 1.16, .07); c.fill();
    if (attack) {
        c.fillStyle = '#f0e8d7'; c.beginPath();
        for (let i = 0; i < 5; i++) { const x = .65 + i * .087; c.moveTo(x, .10); c.lineTo(x + .028, .16); c.lineTo(x + .06, .095); }
        c.fill();
    }
    c.restore();
}

export function drawSilverFish(c: CanvasRenderingContext2D, fish: FishEnemy, strain: number) {
    const beat = Math.sin(fish.animTime * (fish.state === 'flee' ? 4 : 1.8) + fish.circleAngle) * .22 + strain * .65;
    c.save(); c.scale(CONFIG.fishEnemy.size * .39, CONFIG.fishEnemy.size * .39);
    c.fillStyle = '#88acb9';
    c.save(); c.translate(-.67, 0); c.rotate(beat);
    c.beginPath(); c.moveTo(.05, 0); c.lineTo(-.44, -.35); c.lineTo(-.31, 0); c.lineTo(-.44, .35); c.closePath(); c.fill(); c.restore();
    const skin = c.createLinearGradient(0, -.28, 0, .28);
    skin.addColorStop(0, '#567e94'); skin.addColorStop(.48, '#e3eff0'); skin.addColorStop(1, '#7fabb9');
    c.fillStyle = skin; c.beginPath(); c.ellipse(0, 0, .78, .26, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#b9d6d9'; c.beginPath(); c.moveTo(-.22, -.19); c.lineTo(-.18, -.43); c.lineTo(.10, -.23); c.fill();
    c.strokeStyle = '#eff9ef'; c.lineWidth = .06; c.beginPath(); c.moveTo(-.50, -.01); c.lineTo(.39, -.04); c.stroke();
    c.fillStyle = '#152c3a'; c.beginPath(); c.arc(.50, -.065, .071, 0, Math.PI * 2); c.fill();
    c.restore();
}

/** A brief water-pressure crescent marks the actual contact; its expansion and
 * the diver's recoil accompany the velocity impulse without a damage overlay. */
export function drawFishBumpWorld(c: CanvasRenderingContext2D) {
    const bump = state.fishBump;
    if (bump.timer <= 0) return;
    const p = 1 - bump.timer / 26;
    const angle = Math.atan2(bump.ny, bump.nx);
    c.save(); c.translate(bump.x, bump.y); c.rotate(angle);
    c.globalAlpha = (1 - p) * .75;
    c.strokeStyle = '#c4eee6'; c.lineWidth = 2 * (1 - p) + .5;
    c.beginPath(); c.arc(0, 0, 9 + p * 27, -.90, .90); c.stroke();
    c.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
        const x = 6 + p * (22 + i * 4), y = i * (9 + p * 14);
        c.beginPath(); c.arc(x, y, 1.2 + p * 2, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
}

export function fishBumpPose(): number {
    const bump = state.fishBump;
    if (bump.timer <= 0) return 0;
    const side = Math.cos(player.angle) * bump.ny - Math.sin(player.angle) * bump.nx;
    return Math.sin((1 - bump.timer / 26) * Math.PI) * bump.strength * (side < 0 ? -1 : 1);
}
