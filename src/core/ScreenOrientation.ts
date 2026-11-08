import { CONFIG } from './config';
import { getWindowMetrics, refreshWindowMetrics } from './WindowMetrics';
import { resizeCanvas } from '../render/Canvas';

type Direction = 'portrait' | 'landscape';
const STORAGE_KEY = 'jwr-screen-orientation';
let cancelInput = () => {}, resizeLighting = () => {};
let initialized = false, pending: Direction | null = null, reverse = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let requestSerial = 0;

export function isOrientationSwitchPending() { return pending !== null; }

function notify(message: string) {
    const api = wx as any;
    if (typeof api.showToast === 'function') api.showToast({ title: message, icon: 'none' });
    else console.warn('[ScreenOrientation]', message);
}

function clearPending() {
    pending = null;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
}

function updateWindow(width?: number, height?: number) {
    const before = getWindowMetrics(), next = refreshWindowMetrics(width, height, reverse);
    if (before.windowWidth !== next.windowWidth || before.windowHeight !== next.windowHeight ||
        before.pixelRatio !== next.pixelRatio || before.safeLeft !== next.safeLeft || before.safeTop !== next.safeTop ||
        before.safeRight !== next.safeRight || before.safeBottom !== next.safeBottom) {
        cancelInput();
        resizeCanvas(next);
        resizeLighting();
    }
    const direction: Direction = next.windowWidth > next.windowHeight ? 'landscape' : 'portrait';
    if (pending === direction) {
        try { (wx as any).setStorageSync(STORAGE_KEY, direction); } catch (_) { /* 存储失败不影响切屏。 */ }
        clearPending();
    }
}

function requestDirection(direction: Direction, quiet = false) {
    if (pending) return;
    const api = wx as any;
    if (typeof api.setDeviceOrientation !== 'function') {
        if (!quiet) notify('当前微信版本暂不支持切屏');
        return;
    }
    pending = direction;
    const serial = ++requestSerial;
    cancelInput();
    const fail = () => {
        if (serial !== requestSerial || pending !== direction) return;
        clearPending(); if (!quiet) notify('切屏未完成，请退出全屏或稍后重试');
    };
    pendingTimer = setTimeout(fail, 2500);
    try {
        api.setDeviceOrientation({ value: direction,
            success: () => {
                if (serial !== requestSerial || pending !== direction) return;
                refreshTimer = setTimeout(() => updateWindow(), 180);
            },
            fail,
        });
    } catch (_) { fail(); }
}

export function toggleScreenOrientation() {
    requestDirection(CONFIG.screenWidth > CONFIG.screenHeight ? 'portrait' : 'landscape');
}

export function initScreenOrientation(onCancelInput: () => void, onResizeLighting: () => void) {
    if (initialized) return;
    initialized = true;
    cancelInput = onCancelInput;
    resizeLighting = onResizeLighting;
    const api = wx as any;
    if (typeof api.onWindowResize === 'function') api.onWindowResize((res: any) => {
        updateWindow(res.windowWidth, res.windowHeight);
    });
    if (typeof api.onDeviceOrientationChange === 'function') api.onDeviceOrientationChange((res: any) => {
        reverse = res.value === 'landscapeReverse';
        const current = getWindowMetrics();
        // 方向事件可能早于/晚于 resize；有 resize 监听时不把临时旧查询覆盖回去。
        if (typeof api.onWindowResize === 'function') updateWindow(current.windowWidth, current.windowHeight);
        else updateWindow();
    });
    if (typeof api.onShow === 'function') api.onShow(() => updateWindow());
    let saved: unknown;
    try { saved = api.getStorageSync(STORAGE_KEY); } catch (_) { return; }
    const current = CONFIG.screenWidth > CONFIG.screenHeight ? 'landscape' : 'portrait';
    if ((saved === 'portrait' || saved === 'landscape') && saved !== current) requestDirection(saved, true);
}
