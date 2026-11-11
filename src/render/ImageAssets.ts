// ===========================================================
// 图片资源管理器
//
// 用于加载家场景背景、角色立绘、道具特写等大尺寸位图。
// path 是资源清单 key，由统一资源层解析为远端下载缓存或开发用本地路径。
//
// 用法：
//   import { registerImage, getImage, isImageReady } from '../render/ImageAssets';
//   registerImage('home_bg_night', 'images/home/living_room_night.png');
//   // 在渲染时：
//   const img = getImage('home_bg_night');
//   if (img) ctx.drawImage(img, ...);
//
// 进阶用法 · 色键抠图：
//   const cut = getProcessedImage('home_girl_stand', 'chromaKeyDarkGray');
//   if (cut) ctx.drawImage(cut, ...);
// ===========================================================
import { resolveAssetPath, invalidateAsset } from '../assets/AssetStorage';

type ImageEntry = {
    key: string;
    path: string;
    img: any | null;     // wx.Image / HTMLImageElement
    ready: boolean;
    failed: boolean;
    loading: boolean;
    generation: number;
    cancelDecode: (() => void) | null;
    // 预处理缓存：key=processorName → 离屏 canvas
    processed: { [name: string]: any };
};

const _entries: Record<string, ImageEntry> = {};
const DECODE_TIMEOUT_MS = 15000;
export interface ImageLoadStatus { ready: number; loading: number; failed: number; total: number; }

// 微信小游戏 wx.createImage / 浏览器 new Image 兼容
function createImg(): any {
    const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
    if (wxAny && typeof wxAny.createImage === 'function') {
        return wxAny.createImage();
    }
    if (typeof Image !== 'undefined') return new Image();
    return null;
}

// 创建离屏 canvas（小游戏 wx.createCanvas 或 document.createElement）
function createOffscreenCanvas(w: number, h: number): any {
    const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
    if (wxAny && typeof wxAny.createCanvas === 'function') {
        const c = wxAny.createCanvas();
        c.width = w;
        c.height = h;
        return c;
    }
    if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }
    return null;
}

function decodeImage(entry: ImageEntry, source: string): Promise<any> {
    return new Promise((resolve, reject) => {
        let img: any;
        try { img = createImg(); } catch (error) { reject({ retryable: false, error }); return; }
        if (!img) { reject({ retryable: false, error: Error('当前环境无法创建图片') }); return; }
        let done = false;
        let timer: ReturnType<typeof setTimeout>;
        const finish = (ok: boolean, error?: any) => {
            if (done) return;
            done = true; clearTimeout(timer); img.onload = null; img.onerror = null;
            if (entry.cancelDecode === cancel) entry.cancelDecode = null;
            if (ok) resolve(img); else reject(error || Error('图片解码失败'));
        };
        const cancel = () => finish(false, Error('图片加载已取消'));
        entry.cancelDecode = cancel;
        img.onload = () => finish(Number.isFinite(img.width) && img.width > 0 && Number.isFinite(img.height) && img.height > 0, Error('图片解码后尺寸无效'));
        img.onerror = (error: any) => finish(false, error);
        timer = setTimeout(() => finish(false, Error('图片解码超时')), DECODE_TIMEOUT_MS);
        try {
            // Browser previews may provide HTML images through a wx shim. Native wx needs no DOM.
            if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement && /^(https?:)?\/\//i.test(source)) img.crossOrigin = 'anonymous';
            img.src = source;
        } catch (error) { finish(false, error); }
    });
}
async function loadImage(entry: ImageEntry): Promise<void> {
    const generation = ++entry.generation;
    const current = () => _entries[entry.key] === entry && entry.generation === generation;
    entry.ready = entry.failed = false; entry.loading = true; entry.img = null; entry.processed = {};
    try {
        for (let attempt = 0; attempt < 2; attempt++) {
            const source = await resolveAssetPath(entry.path);
            if (!current()) return;
            try {
                const img = await decodeImage(entry, source);
                if (!current()) return;
                entry.img = img; entry.ready = true; return;
            } catch (error) {
                if (!current()) return;
                if (attempt || (error as any)?.retryable === false) throw error;
                // One fresh fetch handles a corrupt cached file; a second failure stays visible to retry UI.
                await invalidateAsset(entry.path);
                if (!current()) return;
            }
        }
    } catch (error) {
        if (current()) { entry.failed = true; console.warn('[ImageAssets] 加载失败', entry.key, entry.path, error); }
    } finally {
        if (current()) entry.loading = false;
    }
}
export function registerImage(key: string, path: string): void {
    if (_entries[key]?.path === path) return;
    if (_entries[key]) releaseImages([key]);
    const entry: ImageEntry = { key, path, img: null, ready: false, failed: false, loading: true,
        generation: 0, cancelDecode: null, processed: {} };
    _entries[key] = entry;
    void loadImage(entry);
}
function selectedEntries(keys?: string[]): ImageEntry[] {
    return Array.from(new Set(keys || Object.keys(_entries))).map(key => _entries[key]).filter(Boolean);
}
/** Counts registered entries only; duplicate or unknown keys do not inflate totals. */
export function getImageLoadStatus(keys?: string[]): ImageLoadStatus {
    const result = { ready: 0, loading: 0, failed: 0, total: 0 };
    for (const entry of selectedEntries(keys)) {
        result.total++; if (entry.ready) result.ready++; else if (entry.loading) result.loading++; else if (entry.failed) result.failed++;
    }
    return result;
}
/** Retry only completed failures; ready and in-flight entries retain their current work. */
export async function retryImages(keys?: string[]): Promise<void> {
    await Promise.all(selectedEntries(keys).filter(entry => entry.failed && !entry.loading).map(loadImage));
}

export function getImage(key: string): any | null {
    const e = _entries[key];
    if (!e) return null;
    if (!e.ready) return null;
    return e.img;
}

export function isImageReady(key: string): boolean {
    const e = _entries[key];
    return !!(e && e.ready);
}

export function isImageFailed(key: string): boolean {
    const e = _entries[key];
    return !!(e && e.failed);
}

export function registerImages(entries: { key: string; path: string }[]): void {
    for (const it of entries) registerImage(it.key, it.path);
}

/** Release only named transient scene assets; persistent home assets stay intact. */
export function releaseImages(keys:string[]):void {
    for(const key of keys){
        const e=_entries[key];if(!e)continue;
        e.generation++;e.cancelDecode?.();
        if(e.img){e.img.onload=null;e.img.onerror=null;}
        e.img=null;e.processed={};delete _entries[key];
    }
}

// ===========================================================
// 预处理：色键抠图
//
// 把深灰背景剔除（设为 alpha=0）。返回处理后的离屏 canvas，
// 可直接当 CanvasImageSource 喂给 drawImage。
// 首次调用时执行抠图并缓存；后续调用直接返回缓存。
//
// 算法：
//   - 取每个像素的 (r,g,b)，计算与基准灰色 (38,42,48) 的欧氏距离
//   - 距离 < threshold → alpha=0（透明）
//   - 距离在 threshold~threshold+softness → 线性渐变 alpha
//   - 距离 > 整体 → 保留原 alpha
// ===========================================================
export function getProcessedImage(key: string, processor: 'chromaKeyDarkGray'): any | null {
    const e = _entries[key];
    if (!e || !e.ready || !e.img) return null;
    if (e.processed[processor]) return e.processed[processor];

    const img = e.img;
    const w = img.width;
    const h = img.height;
    const canvas = createOffscreenCanvas(w, h);
    if (!canvas) return null;
    const c2d: any = canvas.getContext('2d');
    if (!c2d) return null;

    try {
        c2d.drawImage(img, 0, 0, w, h);
    } catch (err) {
        console.warn('[ImageAssets] processed drawImage 异常', key, err);
        return null;
    }

    let imgData: any;
    try {
        imgData = c2d.getImageData(0, 0, w, h);
    } catch (err) {
        // 小游戏部分平台不支持 getImageData（跨域/cors 限制）
        console.warn('[ImageAssets] getImageData 不可用，跳过抠图', key, err);
        e.processed[processor] = canvas; // 退化为原图
        return canvas;
    }

    const data = imgData.data;
    if (processor === 'chromaKeyDarkGray') {
        // 基准色：动态采样四角（小游戏/AI 出图常见底色：深灰、白）
        const samples: [number, number, number][] = [];
        for (const [px, py] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) {
            const idx = (py * w + px) * 4;
            samples.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
        let br = 0, bg = 0, bb = 0;
        for (const s of samples) { br += s[0]; bg += s[1]; bb += s[2]; }
        br /= samples.length; bg /= samples.length; bb /= samples.length;

        // 自适应阈值：白色背景用更小阈值（避免抠掉皮肤/牙齿等浅色），深色背景可以更大
        const isLight = (br + bg + bb) / 3 > 200;
        const HARD = isLight ? 12 : 22;
        const SOFT = isLight ? 24 : 38;

        for (let i = 0; i < data.length; i += 4) {
            const dr = data[i] - br;
            const dg = data[i + 1] - bg;
            const db = data[i + 2] - bb;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist < HARD) {
                data[i + 3] = 0;
            } else if (dist < SOFT) {
                const t = (dist - HARD) / (SOFT - HARD);
                data[i + 3] = Math.round(data[i + 3] * t);
            }
        }
        c2d.putImageData(imgData, 0, 0);
    }

    e.processed[processor] = canvas;
    return canvas;
}

