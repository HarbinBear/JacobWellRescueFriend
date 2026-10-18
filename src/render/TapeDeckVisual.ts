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
/** The same physical cassette at HUD, worn and loading sizes. */
export function drawTapeDeck(c: CanvasRenderingContext2D, x: number, y: number, width: number, v: TapeVisual, worn = false): void {
    c.save(); c.translate(x, y);
    c.rotate(worn ? -.12 : -.045 - v.kick * .025);
    c.translate(0, -v.kick * width / 50);
    if (worn) {
        c.fillStyle = '#273e47'; c.fillRect(-width * .12, -width * .55, width * .14, width * 1.1);
    }
    drawPaperCassette(c, 0, 0, width, {
        mode: v.playing ? 'play' : 'stop', progress: .65,
        seconds: v.beats / 2, side: v.mood === 'return' ? 'B' : 'A',
    }, 0);
    // Beat markers stay inside the lower shell. They never change its label or shape.
    c.save(); c.scale(width / 560, width / 560); c.translate(-280, -177.5);
    const alpha = c.globalAlpha;
    for (let i = 1; i <= 5; i++) {
        const lane = v.lanes[i]; c.globalAlpha = alpha * (.3 + .7 * lane.gain);
        c.fillStyle = TAPE.paper; c.fillRect(158 + (i - 1) * 50, 286 - lane.hit * 5, 24, 7 + lane.hit * 5);
    }
    if (v.lanes[5].gain > .01) {
        c.globalAlpha = alpha * .9; c.fillStyle = '#b9452e';
        c.fillRect(235 + ((v.lanes[5].step % 10 + 10) % 10) * 8, 175, 7, 5);
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
