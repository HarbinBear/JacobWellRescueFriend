import { CONFIG } from '../src/core/config';
import { state, player } from '../src/core/state';
import { world } from '../src/world/continuous/Geometry';
import * as camera from '../src/logic/CameraLogic';
import { resetDriveInput } from '../src/logic/DriveMode';
import { inspectSpeleothems, inspectVolumeSite } from './karstReviewFixtures';

// 仅浏览器美术评审：静态造型贴片复用真实游戏坐标和原灯光合成。
// 不伪造踢腿/转身，也不把贴片当作三维蒙皮角色或正式装备外观。
type Crop = { x: number; y: number; width: number; height: number };
type Layout = { width: number; mouthX: number; mouthY: number; mouthWorldX: number; crop: Crop | null };
const layout: Layout = { width: 76, mouthX: 2040, mouthY: 268, mouthWorldX: 21, crop: null };
const assetPath = '/design/diver-art/v01/diver.png';
let installed = false, enabled = true, zoom = 1;
let asset: HTMLImageElement | null = null, alphaCrop: Crop | null = null;
let status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle', failure = '';
let drawnFrames = 0, fallbackFrames = 0;

function findAlphaBounds(image: HTMLImageElement): Crop {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw Error('无法读取图稿透明边界');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] <= 8) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left || bottom < top) throw Error('图稿没有可见像素');
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function loadArt() {
    if (status !== 'idle') return;
    status = 'loading'; asset = new Image();
    asset.onload = () => {
        try { alphaCrop = findAlphaBounds(asset!); status = 'ready'; }
        catch (error) { status = 'failed'; failure = String(error); }
    };
    asset.onerror = () => { status = 'failed'; failure = '图稿加载失败，已回退原角色'; };
    asset.src = assetPath;
}

export function installDiverArtReview(rendererModule: { drawDiver: (...args: any[]) => void }) {
    if (installed) return diverArtReviewStatus();
    const original = rendererModule.drawDiver;
    rendererModule.drawDiver = (ctx, x, y, angle, colors, motion = {}) => {
        const crop = layout.crop || alphaCrop;
        if (!enabled || status !== 'ready' || !asset || !crop || motion.id !== 'player' || !(world()?.wet > .5)) {
            if (motion.id === 'player') fallbackFrames++;
            original(ctx, x, y, angle, colors, motion); return;
        }
        // 旧角色嘴部在局部 x=21，光源仍沿用真实 player.x/y。
        // 用图稿嘴部锚点对齐旧头部，腰部也因此接近现有物理中心。
        const scale = layout.width / crop.width;
        ctx.save();
        try {
            ctx.translate(x, y); ctx.rotate(angle); ctx.imageSmoothingEnabled = true;
            ctx.drawImage(asset, crop.x, crop.y, crop.width, crop.height,
                layout.mouthWorldX - (layout.mouthX - crop.x) * scale,
                -(layout.mouthY - crop.y) * scale, layout.width, crop.height * scale);
            drawnFrames++;
        } catch (error) { status = 'failed'; failure = String(error); }
        finally { ctx.restore(); }
        if (status === 'failed') { fallbackFrames++; original(ctx, x, y, angle, colors, motion); }
    };
    // 只在显式安装的小样页固定镜头倍率。原稿与新稿共用同一镜头。
    const originalZoom = camera.getAdaptiveZoom;
    (camera as any).getAdaptiveZoom = () => installed ? zoom : originalZoom();
    installed = true; loadArt(); return diverArtReviewStatus();
}

export function setDiverArtLayout(next: Partial<Layout>) {
    const candidate = { ...layout, ...next };
    if (![candidate.width, candidate.mouthX, candidate.mouthY, candidate.mouthWorldX].every(Number.isFinite)
        || candidate.width <= 0) throw Error('无效的造型尺寸或锚点');
    const crop = candidate.crop;
    if (crop && (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
        || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
        || (asset?.naturalWidth && (crop.x + crop.width > asset.naturalWidth || crop.y + crop.height > asset.naturalHeight)))) {
        throw Error('无效的图稿裁切范围');
    }
    Object.assign(layout, candidate); return diverArtReviewStatus();
}

export function selectDiverArtReview(showArt: boolean) {
    enabled = !!showArt; return diverArtReviewStatus();
}

export function setDiverArtZoom(close = false) {
    zoom = close ? 2 : 1;
    state.camera.zoom = state.camera.targetZoom = zoom;
    return diverArtReviewStatus();
}

export function toggleDiverArtFreeze() {
    const w = world(); if (w) { resetDriveInput(); w.hidden = !w.hidden; }
    return diverArtReviewStatus();
}

export function inspectDiverArtReview() {
    if (!(inspectSpeleothems() || inspectVolumeSite(0))) return false;
    const w = world()!; w.hidden = true;
    state.flashlightOn = true; CONFIG.infiniteO2 = true;
    camera.snapCameraToPlayer(); setDiverArtZoom(zoom > 1);
    return diverArtReviewStatus();
}

export function diverArtReviewStatus() {
    return { installed, enabled, status, failure, source: assetPath,
        image: asset ? { width: asset.naturalWidth, height: asset.naturalHeight } : null,
        crop: layout.crop || alphaCrop, layout: { ...layout }, zoom,
        frozen: !!world()?.hidden, light: state.flashlightOn,
        player: { x: player.x, y: player.y, angle: player.angle }, drawnFrames, fallbackFrames,
        scope: '造型贴片；未制作骨骼、转身和踢腿动作；保留原玩法判定和灯光暗罩' };
}
