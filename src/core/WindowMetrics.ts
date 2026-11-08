// 配置与画布共用一次窗口查询。真机调试的性能 SDK 可能包装旧接口并在内部抛错。
export interface WindowMetrics {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    safeTop: number;
    safeBottom: number;
    safeLeft: number;
    safeRight: number;
}

let cached: WindowMetrics | null = null;

function positive(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function firstPositive(...values: unknown[]): number {
    return values.find(positive) as number;
}

export function refreshWindowMetrics(width?: number, height?: number, reverse = false): WindowMetrics {
    cached = null;
    return readWindowMetrics(width, height, reverse);
}

export function getWindowMetrics(): WindowMetrics {
    if (cached) return cached;
    return readWindowMetrics();
}

function readWindowMetrics(resizedWidth?: number, resizedHeight?: number, reverse = false): WindowMetrics {
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
    const width = firstPositive(resizedWidth, modern.windowWidth, legacy.windowWidth, host.innerWidth,
        gameHost.innerWidth, modern.screenWidth, legacy.screenWidth);
    const height = firstPositive(resizedHeight, modern.windowHeight, legacy.windowHeight, host.innerHeight,
        gameHost.innerHeight, modern.screenHeight, legacy.screenHeight);
    if (!width || !height) {
        console.warn('[WindowMetrics] 窗口接口未提供有效尺寸，暂用 375 × 667；请检查真机基础库/调试环境。');
    }
    const raw = (modern as any).safeArea || (legacy as any).safeArea || {};
    const status = (modern as any).statusBarHeight || (legacy as any).statusBarHeight || 0;
    const w = width || 375, h = height || 667, landscape = w > h;
    let top = Number.isFinite(raw.top) ? raw.top : (landscape ? 0 : status);
    let bottom = raw.bottom ? h - raw.bottom : 0;
    let left = raw.left || 0, right = raw.right ? w - raw.right : 0;
    // safeArea 可能仍使用竖屏正方向坐标；旋转的是边距，不能把原 top 当横屏顶部。
    if (landscape && raw.bottom > h) {
        const portraitBottom = Math.max(0, w - raw.bottom), portraitRight = Math.max(0, h - (raw.right || h));
        left = reverse ? portraitBottom : top;
        right = reverse ? top : portraitBottom;
        top = reverse ? (raw.left || 0) : portraitRight;
        bottom = reverse ? portraitRight : (raw.left || 0);
    }
    cached = {
        safeTop: landscape ? Math.max(8, Math.min(48, top + 8)) : Math.max(8, Math.min(h * .2, top + 8)),
        safeBottom: Math.max(landscape ? 12 : 18, Math.min(64, bottom + 10)),
        safeLeft: Math.max(6, Math.min(80, left + 6)),
        safeRight: Math.max(6, Math.min(80, right + 6)),
        windowWidth: w,
        windowHeight: h,
        pixelRatio: firstPositive(modern.pixelRatio, legacy.pixelRatio, host.devicePixelRatio,
            gameHost.devicePixelRatio, 2),
    };
    return cached;
}
