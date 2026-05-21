// ===========================================================
// 图片资源管理器
//
// 用于加载家场景背景、角色立绘、道具特写等大尺寸位图。
// 与音频系统一样支持云端 FileID（CloudBase）+ 本地路径双通道，
// 但本期先只走本地路径，等图片定稿后再上传云端。
//
// 用法：
//   import { registerImage, getImage, isImageReady } from '../render/ImageAssets';
//   registerImage('home_bg_night', 'images/home/living_room_night.png');
//   // 在渲染时：
//   const img = getImage('home_bg_night');
//   if (img) ctx.drawImage(img, ...);
// ===========================================================

type ImageEntry = {
    key: string;
    path: string;
    img: any | null;     // wx.Image / HTMLImageElement
    ready: boolean;
    failed: boolean;
};

const _entries: Record<string, ImageEntry> = {};

// 微信小游戏 wx.createImage / 浏览器 new Image 兼容
function createImg(): any {
    const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
    if (wxAny && typeof wxAny.createImage === 'function') {
        return wxAny.createImage();
    }
    // 浏览器/typecheck 兜底
    if (typeof Image !== 'undefined') return new Image();
    return null;
}

/**
 * 注册并开始加载一张图片。重复注册同 key 直接返回旧 entry。
 */
export function registerImage(key: string, path: string): void {
    if (_entries[key]) return;
    const entry: ImageEntry = {
        key,
        path,
        img: null,
        ready: false,
        failed: false,
    };
    _entries[key] = entry;
    const img = createImg();
    if (!img) {
        entry.failed = true;
        return;
    }
    entry.img = img;
    img.onload = () => { entry.ready = true; };
    img.onerror = (e: any) => {
        entry.failed = true;
        console.warn('[ImageAssets] 加载失败', key, path, e);
    };
    try {
        img.src = path;
    } catch (e) {
        entry.failed = true;
        console.warn('[ImageAssets] 设置 src 异常', key, path, e);
    }
}

/**
 * 取已加载的图片对象。未注册或未就绪都返回 null。
 * 渲染端应做空检查并提供占位回退。
 */
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

/**
 * 一次性注册多张图。
 */
export function registerImages(entries: { key: string; path: string }[]): void {
    for (const it of entries) registerImage(it.key, it.path);
}
