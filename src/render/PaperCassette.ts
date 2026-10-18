/** The physical cassette used in the entry sequence. Canvas-only for WeChat. */
export interface CassetteTransport {
    mode: 'rewind' | 'stop' | 'play';
    progress: number;
    seconds: number;
    press?: number;
    side?: 'A' | 'B';
}
function panel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, stroke?: string) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
    c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
}
function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | CanvasGradient) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
}
function screw(c: CanvasRenderingContext2D, x: number, y: number) {
    circle(c, x, y, 6, '#0c0f0d'); circle(c, x, y, 4, '#6b6a5e');
    c.beginPath(); c.moveTo(x - 2.4, y - 2.4); c.lineTo(x + 2.4, y + 2.4);
    c.strokeStyle = '#181c19'; c.lineWidth = 1.6; c.stroke();
}
function spool(c: CanvasRenderingContext2D, x: number, r: number, angle: number) {
    const pack = c.createRadialGradient(x, 179, 15, x, 179, r);
    pack.addColorStop(0, '#1b1b18'); pack.addColorStop(.5, '#3b3024'); pack.addColorStop(1, '#514332');
    circle(c, x, 179, r, pack);
    c.save(); c.translate(x, 179); c.rotate(angle);
    const hub = c.createRadialGradient(0, 0, 0, 0, 0, 29);
    hub.addColorStop(0, '#f3ead7'); hub.addColorStop(.72, '#cec5ae'); hub.addColorStop(1, '#928b79');
    circle(c, 0, 0, 29, hub); circle(c, 0, 0, 23, '#b3ad9a');
    c.fillStyle = '#242722';
    for (let i = 0; i < 6; i++) { c.save(); c.rotate(i * Math.PI / 3); panel(c, -5, -23, 10, 14, 2, '#242722'); c.restore(); }
    circle(c, 0, 0, 11, '#242722'); circle(c, 0, 0, 8, '#151b18');
    c.restore();
}
export function drawPaperCassette(c: CanvasRenderingContext2D, x: number, y: number, width: number, transport: CassetteTransport, angle = -.075): void {
    c.save(); c.translate(x, y); c.rotate(angle); c.scale(width / 560, width / 560); c.translate(-280, -177.5);
    const compact = width < 120;
    const rotation = transport.mode === 'rewind' ? -transport.seconds * 23 : transport.mode === 'play' ? transport.seconds * 1.8 : 0;
    // One object at every size: same outline, paper label, red stripe and reel layout.
    // Tiny worn/HUD versions omit gradients and fine print, rather than changing design.
    if (compact) {
        panel(c, 10, 9, 540, 327, 19, '#222622', '#999a81');
        panel(c, 31, 35, 498, 224, 9, '#e0d6b9');
        c.fillStyle = '#b9452e'; c.fillRect(32, 93, 496, 21); c.fillRect(32, 120, 496, 3);
        panel(c, 61, 132, 438, 94, 45, '#20281f');
        for (const reelX of [159, 401]) {
            circle(c, reelX, 179, 36, '#a6a087');
            c.save(); c.translate(reelX, 179); c.rotate(rotation); circle(c, 0, 0, 12, '#222a20');
            c.strokeStyle = '#222a20'; c.lineWidth = 8;
            for (let i = 0; i < 3; i++) { c.rotate(Math.PI * 2 / 3); c.beginPath(); c.moveTo(15, 0); c.lineTo(29, 0); c.stroke(); }
            c.restore();
        }
        c.fillStyle = '#343b2e'; c.beginPath(); c.moveTo(144, 277); c.lineTo(416, 277); c.lineTo(442, 321); c.lineTo(118, 321); c.closePath(); c.fill();
        c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = 'bold 30px Arial'; c.fillStyle = '#35412f'; c.fillText(transport.side || 'A', 51, 65);
        if (width >= 40) { c.font = 'bold 23px Arial'; c.fillText('DEEPTAPE', 104, 65); c.textAlign = 'right'; c.fillText('C60', 508, 65); }
        c.restore(); return;
    }
    c.shadowColor = 'rgba(12,24,14,.28)'; c.shadowBlur = 25; c.shadowOffsetY = 16;
    panel(c, 10, 9, 540, 327, 19, '#171b17'); c.shadowBlur = 0; c.shadowOffsetY = 0;
    const shell = c.createLinearGradient(0, 9, 0, 336);
    shell.addColorStop(0, '#3b3a37'); shell.addColorStop(.24, '#272725'); shell.addColorStop(1, '#161715');
    panel(c, 16, 15, 528, 315, 15, shell, '#59594e');
    panel(c, 27, 31, 506, 233, 11, '#0b0e0c');
    const paper = c.createLinearGradient(0, 35, 0, 259); paper.addColorStop(0, '#eee5cc'); paper.addColorStop(1, '#d7cdb3');
    panel(c, 31, 35, 498, 224, 9, paper);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillStyle = '#292d24'; c.font = 'bold 27px Arial'; c.fillText(transport.side || 'A', 51, 70);
    c.font = 'bold 21px Arial'; c.fillText('DEEPTAPE / 01', 104, 70);
    c.font = 'bold 21px Arial'; c.fillText('C60', 461, 66);
    c.strokeStyle = '#797c68'; c.lineWidth = .6; c.beginPath(); c.moveTo(85, 47); c.lineTo(85, 79); c.moveTo(100, 77); c.lineTo(431, 77); c.stroke();
    c.fillStyle = '#b9452e'; c.fillRect(32, 93, 496, 21); c.fillRect(32, 118, 496, 1.4); c.fillRect(32, 122, 496, 1.4);
    c.fillStyle = '#f0dfc0'; c.font = '9px Arial'; c.fillText('NORMAL POSITION / TYPE I', 51, 107); c.textAlign = 'right'; c.fillText('LOW NOISE', 508, 107);
    panel(c, 61, 132, 438, 94, 45, '#171d18', '#8a8978');
    const p = Math.max(0, Math.min(1, transport.progress));
    const left = Math.sqrt(31 * 31 + (46 * 46 - 31 * 31) * p), right = Math.sqrt(46 * 46 + (31 * 31 - 46 * 46) * p);
    spool(c, 159, left, rotation * 40 / left); spool(c, 401, right, rotation * 40 / right);
    c.strokeStyle = '#796447'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(160, 219); c.lineTo(401, 219); c.stroke();
    panel(c, 229, 153, 102, 52, 5, '#272e25', '#626754');
    c.strokeStyle = '#a79f83'; c.lineWidth = 1; c.beginPath(); c.moveTo(243, 179); c.lineTo(317, 179);
    for (let i = 0; i < 5; i++) { const px = 252 + i * 14; c.moveTo(px, i === 2 ? 167 : 172); c.lineTo(px, i === 2 ? 191 : 186); } c.stroke();
    const glass = c.createLinearGradient(0, 133, 0, 225); glass.addColorStop(0, 'rgba(193,183,163,.14)'); glass.addColorStop(.45, 'rgba(27,29,26,.4)'); glass.addColorStop(1, 'rgba(172,166,147,.11)');
    panel(c, 62, 133, 436, 92, 45, glass);
    c.textAlign = 'left'; c.fillStyle = '#4c5143'; c.font = '8.5px Arial'; c.fillText('DEEPTAPE / STEREO CASSETTE', 52, 247);
    for (let i = 0; i < 16; i++) c.fillRect(445 + i * 3.5, 235, i % 3 + 1, 13);
    c.beginPath(); c.moveTo(144, 277); c.lineTo(416, 277); c.lineTo(442, 321); c.lineTo(118, 321); c.closePath(); c.fillStyle = '#30322c'; c.fill(); c.strokeStyle = '#68695a'; c.stroke();
    circle(c, 177, 300, 9, '#0f1511'); circle(c, 383, 300, 9, '#0f1511');
    panel(c, 252, 297, 56, 16, 3, '#101610', '#505747'); panel(c, 265, 302, 30, 5, 1, '#4a493b');
    for (const pos of [[29,27],[531,27],[29,316],[531,316],[280,277]]) screw(c, pos[0], pos[1]);
    // The player presses a physical transport key; its depression precedes music.
    const press = transport.press || 0;
    panel(c, 213, 324 + press * 3, 134, 18 - press * 3, 3, press > .5 ? '#a54a32' : '#8c8c78', '#20261d');
    c.fillStyle = '#1c281d'; c.font = 'bold 9px Arial'; c.textAlign = 'center'; c.fillText('▶  PLAY', 280, 337);
    c.restore();
}
