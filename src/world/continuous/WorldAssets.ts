import { ASSET_STORAGE } from '../../assets/AssetCatalog';
import { registerImage, releaseImages, isImageReady, getImageLoadStatus, retryImages } from '../../render/ImageAssets';
import { activeWorld } from './Geometry';

export const WORLD_IMAGE_FILES = ['woodland-native.jpg', 'woodland-sky-strip.png', 'bank-left.jpg', 'bank-right.jpg', 'shop.png', 'tent.png', 'board.png', 'air.png', 'fish.png'];
const keys = WORLD_IMAGE_FILES.map(file => 'shore/' + file);
let registered = false;
export function updateWorldAssets() {
    if (activeWorld() && !registered) {
        registered = true;
        WORLD_IMAGE_FILES.forEach(file => registerImage('shore/' + file, 'images/shore/' + file));
    } else if (!activeWorld() && registered) {
        releaseImages(keys);
        registered = false;
    }
}
export function assetsReady() { return registered && keys.every(isImageReady); }
export function worldAssetStatus() { return getImageLoadStatus(keys); }
export function retryWorldAssets() { return retryImages(keys); }
// 云资源首次下载期间不能在看不见岸坡/营地设施时继续游动或耗氧。
export function worldAssetsBlocked() { return ASSET_STORAGE.mode === 'cloud' && activeWorld() && !assetsReady(); }
