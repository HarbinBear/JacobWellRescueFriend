import { TapeVisual } from '../audio/AdaptiveMusicVisuals';

// Small, code-native artwork: the exact same cassette is worn by the diver and
// drawn in the HUD, detail sleeve, and review page. No image loading or particles.
export const TAPE = { ink: '#101e26', paper: '#f4e7c7', orange: '#ff754c', lime: '#d7ee74', mint: '#81e3ce', muted: '#738e92' };
// A worn owner's note, not an explanation of where the music comes from.
export const TAPE_NOTE = '听不清，就再近一点。';
const TAU = Math.PI * 2;
export function tapeAccent(v: TapeVisual): string { return v.mood === 'return' ? TAPE.mint : v.mood === 'found' ? TAPE.lime : TAPE.orange; }
export function cutPanel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut = 6): void {
    c.beginPath(); c.moveTo(x + cut, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - cut);
    c.lineTo(x + w - cut, y + h); c.lineTo(x, y + h); c.lineTo(x, y + cut); c.closePath();
}
function reel(c: CanvasRenderingContext2D, x: number, angle: number, hit: number): void {
    c.save(); c.translate(x, 0); c.rotate(angle);
    c.fillStyle = TAPE.paper; c.beginPath(); c.arc(0, 0, 6 + hit * .5, 0, TAU); c.fill();
    c.fillStyle = TAPE.ink; c.beginPath(); c.arc(0, 0, 2.2, 0, TAU); c.fill();
    c.strokeStyle = TAPE.ink; c.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; c.beginPath(); c.moveTo(Math.cos(a) * 3.6, Math.sin(a) * 3.6); c.lineTo(Math.cos(a) * 5.2, Math.sin(a) * 5.2); c.stroke(); }
    c.restore();
}

/** width is the total footprint, including the rhythmic outline. */
export function drawTapeDeck(c: CanvasRenderingContext2D, x: number, y: number, width: number, v: TapeVisual, worn = false): void {
    const accent = tapeAccent(v), kick = v.kick;
    c.save(); c.translate(x, y); c.scale(width / 66, width / 66);
    // The shell punches on actual kick onsets; the 20 Hz rush stays in its ribbon.
    c.rotate(worn ? -.12 : -.045 - kick * .025);
    c.translate(0, -kick * 1.3);
    if (worn) {
        c.strokeStyle = TAPE.paper; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-20, -10); c.quadraticCurveTo(-31, -21, -23, -30); c.stroke();
        c.fillStyle = '#273e47'; c.fillRect(-25, -24, 4, 48);
    }
    c.fillStyle = 'rgba(0,0,0,.35)'; cutPanel(c, -28, -19, 59, 44, 5); c.fill();
    c.fillStyle = TAPE.ink; c.strokeStyle = accent; c.lineWidth = 1.4;
    cutPanel(c, -29, -22, 58, 44, 5); c.fill(); c.stroke();
    // Orange enamel, paper label, little waterproof latch.
    c.fillStyle = accent; cutPanel(c, -26, -19, 52, 13, 3); c.fill();
    c.fillStyle = TAPE.ink; c.font = 'bold 6px Arial'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('DEEPTAPE', -22, -12);
    c.fillText(v.mood === 'return' ? 'B' : 'A', 19, -12);
    c.fillStyle = '#253a42'; cutPanel(c, -24, -3, 48, 16, 3); c.fill();
    c.strokeStyle = TAPE.muted; c.lineWidth = 1; c.beginPath(); c.moveTo(-15, 5); c.lineTo(15, 5); c.stroke();
    c.save(); c.translate(0, 5);
    reel(c, -14, v.beats * Math.PI / 2, v.lanes[2].hit);
    reel(c, 14, v.beats * Math.PI / 2 + .5, v.lanes[2].hit);
    c.restore();
    // Five separate layer windows: fast notes advance a location, not a white strobe.
    for (let i = 1; i <= 5; i++) {
        const lane = v.lanes[i]; c.globalAlpha *= .25 + lane.gain * .75;
        c.fillStyle = i === 5 ? TAPE.lime : TAPE.paper; c.fillRect(-21 + (i - 1) * 9, 16 - lane.hit * 3, 6, 2 + lane.hit * 3);
        c.globalAlpha /= .25 + lane.gain * .75;
    }
    if (v.lanes[5].gain > .01) {
        const head = ((v.lanes[5].step % 10) + 10) % 10;
        c.fillStyle = TAPE.lime; c.fillRect(-24 + head * 4.9, -5, 4, 2);
    }
    c.fillStyle = TAPE.paper; c.fillRect(29, -10, 2, 8);
    if (!v.playing) { c.fillStyle = TAPE.muted; c.fillRect(-2, 2, 1.5, 6); c.fillRect(1, 2, 1.5, 6); }
    c.restore();
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
    c.fillText(v.fallback ? '双音模式' : !v.playing ? '磁带就绪' : v.mood === 'return' ? 'B 面 / 一起回去' : v.mood === 'found' ? 'A 面 / 就在这里' : 'A 面 / 向深处去', 14, 58);
    drawTapeRibbons(c, 66, 77, w - 80, 17, v);
    c.font = '9px Arial';
    ['微光', '低流', '重鼓', '疾行', '奔涌'].forEach((label, i) => { c.fillStyle = v.lanes[i + 1].gain > .01 ? TAPE.paper : TAPE.muted; c.fillText('0' + (i + 1) + ' ' + label, 14, 85 + i * 17); });
    c.fillStyle = TAPE.muted; c.font = '10px Arial';
    c.fillText(v.playing ? `${v.level}/5 层  ·  120 BPM  ·  ${v.bar + 1}/8 小节` : '带上音乐，下潜。', 14, 180);
    c.save(); c.translate(14, 197); c.rotate(-.025);
    c.fillStyle = TAPE.paper; cutPanel(c, 0, -2, w - 28, 21, 3); c.fill();
    c.fillStyle = TAPE.ink; c.font = 'italic 10px Arial'; c.fillText(TAPE_NOTE, 7, 9); c.restore();
    c.restore();
}
