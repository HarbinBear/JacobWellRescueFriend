import { state } from '../core/state';
import { getAdaptiveMusicPreparation, retryAdaptiveMusic } from '../audio/AdaptiveMusic';
import { cutPanel, TAPE } from './TapeDeckVisual';

export const TAPE_TRACK_TITLE = '夜航';

export function getTapeLoadingLabel(): string {
    const prep = getAdaptiveMusicPreparation();
    if (prep.status === 'ready') return '';
    if (prep.status === 'error') return '音轨暂不可用 · 轻点重试';
    if (prep.status === 'locked') return '音轨 100% · 轻点启用';
    return `音轨准备 ${Math.min(99, Math.floor(prep.progress * 100))}%`;
}

export function retryTapeLoading(): boolean {
    const status = getAdaptiveMusicPreparation().status;
    if (status !== 'error' && status !== 'locked') return false;
    retryAdaptiveMusic();
    return true;
}

/** Real synthesis progress, not a transport animation or a blocking overlay. */
export function drawTapeLoadingHint(c: CanvasRenderingContext2D, x: number, y: number): void {
    const label = getTapeLoadingLabel();
    if (!label) return;
    const prep = getAdaptiveMusicPreparation(), w = 168, h = 32;
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(14,29,29,.88)'; cutPanel(c, 0, 0, w, h, 3); c.fill();
    c.fillStyle = TAPE.paper; c.font = '10px Arial'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(label, 9, 12);
    c.fillStyle = 'rgba(222,214,188,.2)'; c.fillRect(9, 24, w - 18, 2);
    c.fillStyle = prep.status === 'error' ? TAPE.orange : TAPE.mint;
    c.fillRect(9, 24, (w - 18) * Math.max(0, Math.min(1, prep.progress)), 2);
    c.restore();
}

/** Appears only when the nearby encounter's audible clock actually starts. */
export function drawTapeNowPlaying(c: CanvasRenderingContext2D, x: number, y: number): void {
    const at = state.mazeRescue && state.mazeRescue.tapeNowPlayingAt;
    if (!at || getAdaptiveMusicPreparation().status !== 'ready') return;
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
