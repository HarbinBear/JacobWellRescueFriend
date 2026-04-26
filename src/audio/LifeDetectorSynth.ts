// 生命探知仪音效：用 Web Audio API 程序化合成两个短促的"嘀"音（D# 和 F）
// 设计原因：
// 1. 不需要外部音频文件，不依赖云存储，直接跑起来
// 2. 频率、音量、衰减、时长全部可参数化，方便手感调优
// 3. 微信小游戏优先用 wx.createWebAudioContext()；浏览器/开发者工具降级到标准 AudioContext
//
// 实现：每次触发时创建一个 OscillatorNode + GainNode，使用 exponential 衰减包络模拟短促"嘀"声
// OscillatorNode 在播放结束后自动断开，无需手动管理生命周期

import { CONFIG } from '../core/config';
import { state } from '../core/state';

// 音符频率定义（科学音高记号法）
// D#5 = 622.25Hz，F5 = 698.46Hz，清亮的中高音段，不会被环境水声淹没
const FREQ_D_SHARP_5 = 622.25;
const FREQ_F_5 = 698.46;

let _audioCtx: any | null = null;
let _initTried = false;

// 懒加载 AudioContext：第一次调用时才创建
// 很多平台（iOS Safari / 微信）需要用户手势触发才能开启音频；迷宫模式下玩家必然已经触摸过屏幕，所以 updateMaze 中首次调用时一般都能成功
function _ensureAudioContext(): any | null {
    if (_audioCtx) return _audioCtx;
    if (_initTried) return null;
    _initTried = true;

    try {
        // 优先用微信小游戏专用接口
        const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
        if (wxAny && typeof wxAny.createWebAudioContext === 'function') {
            _audioCtx = wxAny.createWebAudioContext();
            return _audioCtx;
        }
        // 降级到标准 Web Audio API（开发者工具 / 浏览器）
        const Ctor = (typeof (globalThis as any).AudioContext !== 'undefined')
            ? (globalThis as any).AudioContext
            : (globalThis as any).webkitAudioContext;
        if (Ctor) {
            _audioCtx = new Ctor();
            return _audioCtx;
        }
    } catch (e) {
        console.warn('[LifeDetectorSynth] AudioContext 创建失败:', e);
    }
    return null;
}

// 触发一声短促的"嘀"
// freq：频率 (Hz)
// durationSec：总时长（秒）
// volume：峰值音量（0~1）
function _playBeep(freq: number, durationSec: number, volume: number): void {
    const ctx = _ensureAudioContext();
    if (!ctx) return;
    // 全局静音时跳过
    if (state.audio && state.audio.muted) return;

    try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // 使用三角波：比正弦更有"金属嘀"感，又不像方波那样刺耳
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        // ADSR 简化为 AD 包络：瞬时起音 + 指数衰减
        // 起音 2ms，衰减到接近 0 用 durationSec
        const attack = 0.002;
        const peak = Math.max(0.0001, volume);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(peak, now + attack);
        // exponentialRampToValueAtTime 不能到 0，用一个很小的值代替
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + durationSec + 0.02);

        // OscillatorNode stop 后会自动释放，不需要手动 disconnect
    } catch (e) {
        console.warn('[LifeDetectorSynth] 播放失败:', e);
    }
}

// 播放 D#（低音，警示）
export function playSonarLow(): void {
    const cfg = (CONFIG as any).lifeDetector;
    if (!cfg) return;
    _playBeep(cfg.freqLow || FREQ_D_SHARP_5, cfg.beepDuration || 0.12, cfg.volume || 0.4);
}

// 播放 F（高音，定位）
export function playSonarHigh(): void {
    const cfg = (CONFIG as any).lifeDetector;
    if (!cfg) return;
    _playBeep(cfg.freqHigh || FREQ_F_5, cfg.beepDuration || 0.12, cfg.volume || 0.4);
}

// 暴露 ensure 供外部在用户首次触摸时主动尝试初始化
export function tryWarmUpLifeDetectorAudio(): void {
    _ensureAudioContext();
}
