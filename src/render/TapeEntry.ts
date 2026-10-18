import { ctx, logicW, logicH } from './Canvas';
import { state } from '../core/state';
import { getAdaptiveMusicPreparation, getAdaptiveMusicClock } from '../audio/AdaptiveMusic';
import { drawPaperCassette } from './PaperCassette';
import { cutPanel, TAPE } from './TapeDeckVisual';

export const TAPE_TRACK_TITLE = '夜航';
export function getTapeEntryButtons() {
    const prep = getAdaptiveMusicPreparation();
    const blocked = prep.status === 'error' || prep.status === 'locked';
    return {
        retry: { x: logicW / 2 - 102, y: logicH * .79, w: 204, h: 42, enabled: blocked },
        back: { x: logicW / 2 - 84, y: logicH * .89, w: 168, h: 36, enabled: state.mazeRescue && (state.mazeRescue.phase === 'tape_rewind' || blocked) },
    };
}
function text(s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center') {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function recovery() {
    const buttons = getTapeEntryButtons(), prep = getAdaptiveMusicPreparation();
    if (buttons.retry.enabled) {
        ctx.fillStyle = '#a7412c'; cutPanel(ctx, buttons.retry.x, buttons.retry.y, buttons.retry.w, buttons.retry.h, 3); ctx.fill();
        text(prep.status === 'locked' ? '轻点，唤醒随身听' : '重新倒带', logicW / 2, buttons.retry.y + 21, '13px Arial', '#eee6cf');
    }
    if (buttons.back.enabled) text('返回主界面', logicW / 2, buttons.back.y + 18, '11px Arial', '#697361');
}
export function drawTapeRewind(): void {
    const maze = state.mazeRescue, prep = getAdaptiveMusicPreparation();
    const secs = Math.max(0, (Date.now() - (maze.tapeEntryStartedAt || Date.now())) / 1000);
    // This is tape transport position, not a made-up network percentage. Even a
    // cached tape completes its short physical rewind gesture before entering water.
    const transportProgress = Math.min(prep.progress, secs / .7);
    const bg = ctx.createRadialGradient(logicW / 2, logicH * .47, 20, logicW / 2, logicH * .47, logicH * .8);
    bg.addColorStop(0, '#ddd8c9'); bg.addColorStop(1, '#c4c4b3'); ctx.fillStyle = bg; ctx.fillRect(0, 0, logicW, logicH);
    text('DEEPTAPE  /  SIDE A', logicW / 2, logicH * .18, '10px Arial', '#69715e');
    drawPaperCassette(ctx, logicW / 2, logicH * .46, Math.min(410, logicW * .86), {
        mode: prep.status === 'loading' || (prep.status === 'ready' && transportProgress < 1) ? 'rewind' : 'stop', progress: transportProgress, seconds: secs,
    });
    const counter = '00:' + ('0' + Math.ceil((1 - transportProgress) * 16)).slice(-2);
    text('◀◀  REWIND', logicW / 2 - 48, logicH * .67, '10px monospace', '#69715e');
    text(counter, logicW / 2 + 72, logicH * .67, '19px monospace', '#384d39');
    if (prep.status === 'error' || prep.status === 'locked') text(prep.status === 'error' ? '音频准备失败' : '等待音频解锁', logicW / 2, logicH * .73, '11px Arial', '#6a705d');
    recovery();
}
/** Underwater transport close-up. No center-screen story toast. */
export function drawTapePlayIntro(): void {
    const maze = state.mazeRescue, frame = maze.tapeIntroTimer || 0;
    const prep = getAdaptiveMusicPreparation();
    const enter = Math.min(1, frame / 18), leave = Math.max(0, Math.min(1, (frame - 44) / 20));
    ctx.save(); ctx.globalAlpha *= 1 - leave;
    ctx.fillStyle = 'rgba(6,20,22,.36)'; ctx.fillRect(0, 0, logicW, logicH);
    const cy = logicH * .68 + (1 - enter) * 90;
    drawPaperCassette(ctx, logicW / 2, cy, Math.min(350, logicW * .75), {
        mode: maze.tapePlaybackStarted ? 'play' : 'stop', progress: 1,
        seconds: getAdaptiveMusicClock()?.seconds || 0, press: Math.max(0, Math.min(1, (frame - 18) / 12)),
    }, -.035 * (1 - enter));
    text(maze.tapePlaybackStarted ? '▶  PLAY  /  SIDE A' : 'SIDE A  /  PRESS PLAY', logicW / 2, cy - Math.min(350, logicW * .75) * .38, '10px monospace', TAPE.paper);
    ctx.restore();
    if (prep.status === 'error' || prep.status === 'locked') { ctx.save(); ctx.fillStyle = '#d5d2c1'; ctx.fillRect(0, logicH * .75, logicW, logicH * .25); recovery(); ctx.restore(); }
}
/** A short paper label alongside the cassette slot; fully disappears after 4.2s. */
export function drawTapeNowPlaying(c: CanvasRenderingContext2D, x: number, y: number): void {
    const at = state.mazeRescue && state.mazeRescue.tapeNowPlayingAt;
    if (!at) return;
    const age = (Date.now() - at) / 1000;
    if (age < 0 || age > 4.2) return;
    const alpha = Math.min(1, age / .25, (4.2 - age) / .7);
    c.save(); c.globalAlpha *= alpha; c.translate(x - (1 - alpha) * 16, y);
    c.fillStyle = '#ded6bc'; cutPanel(c, 0, 0, 166, 47, 3); c.fill();
    c.fillStyle = '#b3452d'; c.fillRect(0, 0, 3, 47);
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#7d654e'; c.font = '8px monospace'; c.fillText('▶  NOW PLAYING  /  SIDE A', 12, 12);
    c.fillStyle = '#384537'; c.font = '14px "Kaiti SC", STKaiti, serif'; c.fillText(TAPE_TRACK_TITLE, 12, 31);
    c.restore();
}
