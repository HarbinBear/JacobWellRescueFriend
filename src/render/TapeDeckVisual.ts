import { TapeVisual } from '../audio/AdaptiveMusicVisuals';
import { drawPaperCassette } from './PaperCassette';

// Small, code-native artwork: the exact same cassette is worn by the diver and
// drawn in the HUD, detail sleeve, and review page. No image loading or particles.
export const TAPE = { ink: '#101e26', paper: '#f4e7c7', orange: '#ff754c', lime: '#d7ee74', mint: '#81e3ce', muted: '#738e92' };
// A worn owner's note, not an explanation of where the music comes from.
export const TAPE_NOTE = '听不清，就再近一点。';
export function tapeAccent(v: TapeVisual): string { return v.mood === 'return' ? TAPE.mint : v.mood === 'found' ? TAPE.lime : TAPE.orange; }
export function cutPanel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut = 6): void {
    c.beginPath(); c.moveTo(x + cut, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - cut);
    c.lineTo(x + w - cut, y + h); c.lineTo(x, y + h); c.lineTo(x, y + cut); c.closePath();
}
/** Each newly audible instrument changes the object's motion, not an unrelated clock. */
export function sampleTapeMotion(v: TapeVisual): { x: number; y: number; roll: number; sx: number; sy: number; drive: number; rush: number } {
    const neutral = { x: 0, y: 0, roll: 0, sx: 1, sy: 1, drive: 0, rush: 0 };
    if (!v.playing || v.muted) return neutral;
    const bass = v.lanes[2].hit, drum = v.lanes[3].gain;
    const drive = v.lanes[4].gain, rush = Math.min(1, v.lanes[5].gain / .94);
    const direction = v.lanes[4].step % 2 ? -1 : 1;
    return {
        x: drive * v.lanes[4].hit * direction * .026,
        y: -.016 * v.lanes[1].hit - .025 * bass - v.kick * (.045 * drum + .075 * rush),
        roll: v.snare * (.09 * drum + .07 * rush) - v.kick * (.045 * drum + .07 * rush),
        sx: 1 + .09 * bass + v.kick * .14 * rush,
        sy: 1 - .07 * bass + v.kick * (.08 * drum + .15 * rush), drive, rush,
    };
}

/** The same physical cassette at HUD, worn and loading sizes. */
export function drawTapeDeck(c: CanvasRenderingContext2D, x: number, y: number, width: number, v: TapeVisual, worn = false): void {
    const motion = sampleTapeMotion(v);
    c.save(); c.translate(x, y);
    c.rotate((worn ? -.12 : -.045) + motion.roll);
    c.translate(motion.x * width, motion.y * width);
    c.scale(motion.sx, motion.sy);
    if (worn) {
        c.fillStyle = '#273e47'; c.fillRect(-width * .12, -width * .55, width * .14, width * 1.1);
    }
    drawPaperCassette(c, 0, 0, width, {
        mode: v.playing ? 'play' : 'stop', progress: .65,
        seconds: v.beats / 2, side: v.mood === 'return' ? 'B' : 'A',
    }, 0);
    // The label becomes a moving print: red chevrons at four, a cut-up stripe at five.
    // Everything remains on the existing shell; no halos, rays or off-body trails.
    c.save(); c.scale(width / 560, width / 560); c.translate(-280, -177.5);
    const alpha = c.globalAlpha;
    const audible = v.playing && !v.muted;
    if (audible) {
        c.globalAlpha = alpha * Math.min(1, v.lanes[1].hit);
        c.strokeStyle = TAPE.paper; c.lineWidth = 9;
        for (const rx of [159, 401]) { c.beginPath(); c.arc(rx, 179, 38, 0, Math.PI * 2); c.stroke(); }
        // A broad pair of bass shutters is legible even in the 56px HUD cassette.
        c.globalAlpha = alpha * v.lanes[2].gain;
        c.fillStyle = '#b9452e';
        const bh = 10 + v.lanes[2].hit * 58;
        c.fillRect(242, 218 - bh, 28, bh); c.fillRect(290, 218 - bh, 28, bh);
        c.globalAlpha = alpha * motion.drive;
        c.fillStyle = TAPE.paper;
        for (let i = 0; i < 6; i++) {
            const cx = 50 + ((i * 80 + (v.lanes[4].step % 6) * 16) % 460);
            c.beginPath(); c.moveTo(cx, 93); c.lineTo(cx + 18, 93);
            c.lineTo(cx + 34, 114); c.lineTo(cx + 16, 114); c.closePath(); c.fill();
        }
        if (motion.rush > .01) {
            c.globalAlpha = alpha * motion.rush;
            c.fillStyle = '#d54c32'; c.fillRect(32, 86, 496, 43);
            // Ten exact source events per beat: spatial jump, not an invisible short flash.
            const head = ((v.lanes[5].step % 10) + 10) % 10;
            c.fillStyle = TAPE.paper;
            for (let i = 0; i < 10; i++) {
                const hot = i === head || i === (head + 5) % 10;
                c.fillRect(38 + i * 49, hot ? 86 : 105, 31, hot ? 43 : 8);
            }
            c.fillStyle = '#d54c32';
            c.fillRect(head < 5 ? 124 : 366, 151, 70, 56);
            c.fillStyle = TAPE.paper;
            c.fillRect(head < 5 ? 150 : 392, 157, 18, 44);
        }
    }
    for (let i = 1; i <= 5; i++) {
        const lane = v.lanes[i]; c.globalAlpha = alpha * (.3 + .7 * lane.gain);
        c.fillStyle = TAPE.paper; c.fillRect(158 + (i - 1) * 50, 286 - lane.hit * 20, 24, 7 + lane.hit * 20);
    }
    c.restore(); c.restore();
}

/** Five event ribbons. At 1200/min each note owns a distinct moving cell. */
export function drawTapeRibbons(c: CanvasRenderingContext2D, x: number, y: number, w: number, row: number, v: TapeVisual): void {
    c.save();
    const alpha = c.globalAlpha;
    const colors = [TAPE.mint, TAPE.paper, TAPE.orange, TAPE.orange, TAPE.lime];
    for (let lane = 1; lane <= 5; lane++) {
        const event = v.lanes[lane], count = lane === 5 ? 20 : 12;
        const gap = 2, cell = (w - gap * (count - 1)) / count;
        const head = ((event.step % count) + count) % count;
        for (let i = 0; i < count; i++) {
            const distance = (head - i + count) % count;
            const trail = distance < 4 ? (1 - distance / 4) * event.gain : 0;
            c.globalAlpha = alpha * (.1 + .75 * trail);
            c.fillStyle = colors[lane - 1];
            const h = row * (.26 + .42 * (i === head ? event.hit : trail * .3));
            c.fillRect(x + i * (cell + gap), y + (lane - 1) * row + (row - h) / 2, cell, h);
        }
    }
    c.restore();
}

export function drawTapeSleeve(c: CanvasRenderingContext2D, x: number, y: number, w: number, v: TapeVisual): void {
    c.save(); c.translate(x, y);
    c.fillStyle = TAPE.ink; c.strokeStyle = tapeAccent(v); c.lineWidth = 1;
    cutPanel(c, 0, 0, w, 224, 10); c.fill(); c.stroke();
    c.fillStyle = tapeAccent(v); c.fillRect(12, 12, 4, 25);
    c.fillStyle = TAPE.paper; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = 'bold 15px Arial'; c.fillText('深流随身听', 24, 20);
    c.fillStyle = TAPE.muted; c.font = '9px Arial'; c.fillText('VOL. 01 / 收录：—', 24, 36);
    drawTapeDeck(c, w - 40, 26, 45, v);
    c.fillStyle = tapeAccent(v); c.font = 'bold 11px Arial';
    c.fillText(v.fallback ? '双音模式' : !v.playing ? '磁带就绪' : v.mood === 'return' ? 'B 面 / PLAY' : 'A 面 / PLAY', 14, 58);
    drawTapeRibbons(c, 66, 77, w - 80, 17, v);
    c.font = '9px Arial';
    ['微光', '低流', '重鼓', '疾行', '奔涌'].forEach((label, i) => { c.fillStyle = v.lanes[i + 1].gain > .01 ? TAPE.paper : TAPE.muted; c.fillText('0' + (i + 1) + ' ' + label, 14, 85 + i * 17); });
    c.fillStyle = TAPE.muted; c.font = '10px Arial';
    c.fillText(v.playing ? `${v.level}/5 层  ·  120 BPM  ·  ${v.bar + 1}/8 小节` : 'STOP / SIDE A', 14, 180);
    c.save(); c.translate(14, 197); c.rotate(-.025);
    c.fillStyle = TAPE.paper; cutPanel(c, 0, -2, w - 28, 21, 3); c.fill();
    c.fillStyle = TAPE.ink; c.font = 'italic 10px Arial'; c.fillText(TAPE_NOTE, 7, 9); c.restore();
    c.restore();
}
