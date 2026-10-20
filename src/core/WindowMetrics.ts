// 配置与画布共用一次窗口查询。真机调试的性能 SDK 可能包装旧接口并在内部抛错。
export interface WindowMetrics {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    safeTop: number;
    safeBottom: number;
}

let cached: WindowMetrics | null = null;

function positive(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function firstPositive(...values: unknown[]): number {
    return values.find(positive) as number;
}

export function getWindowMetrics(): WindowMetrics {
    if (cached) return cached;
    const api = typeof wx !== 'undefined' ? wx : null;
    let modern: Partial<wx.WindowInfo> = {};
    let legacy: Partial<wx.SystemInfo> = {};

    if (api && typeof api.getWindowInfo === 'function') {
        try {
            modern = api.getWindowInfo() || {};
        } catch (error) {
            console.warn('[WindowMetrics] getWindowInfo 失败，尝试兼容路径:', error);
        }
    }

    // 新接口正常时完全绕过 getSystemInfoSync，避免再次触发旧接口上的性能检测钩子。
    if ((!positive(modern.windowWidth) || !positive(modern.windowHeight) || !positive(modern.pixelRatio))
        && api && typeof api.getSystemInfoSync === 'function') {
        try {
            legacy = api.getSystemInfoSync() || {};
        } catch (error) {
            console.warn('[WindowMetrics] getSystemInfoSync 失败，使用可用窗口尺寸:', error);
        }
    }

    const host = globalThis as any;
    const gameHost = host.GameGlobal || {};
    const width = firstPositive(modern.windowWidth, legacy.windowWidth, host.innerWidth,
        gameHost.innerWidth, modern.screenWidth, legacy.screenWidth);
    const height = firstPositive(modern.windowHeight, legacy.windowHeight, host.innerHeight,
        gameHost.innerHeight, modern.screenHeight, legacy.screenHeight);
    if (!width || !height) {
        console.warn('[WindowMetrics] 窗口接口未提供有效尺寸，暂用 375 × 667；请检查真机基础库/调试环境。');
    }
    const raw = (modern as any).safeArea || (legacy as any).safeArea || {};
    const status = (modern as any).statusBarHeight || (legacy as any).statusBarHeight || 0;
    cached = {
        safeTop: Math.max(62, Math.min((height || 667) * .2, Math.max(raw.top || 0, status) + 12)),
        safeBottom: Math.max(18, Math.min(64, (raw.bottom ? (height || 667) - raw.bottom : 0) + 10)),
        windowWidth: width || 375,
        windowHeight: height || 667,
        pixelRatio: firstPositive(modern.pixelRatio, legacy.pixelRatio, host.devicePixelRatio,
            gameHost.devicePixelRatio, 2),
    };
    return cached;
}
