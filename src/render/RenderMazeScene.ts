import { state } from '../core/state';
import {
    blendHexColors,
    getMazeSceneThemeConfigByIndex,
} from '../world/mazeScene';

type MazeThemeColorKey = 'wallColor' | 'wallHighlight' | 'innerColor';

function getMazeThemeState() {
    const maze = state.mazeRescue;
    if (!maze || !maze.sceneThemeMap) return null;
    return maze;
}

export function getMazeThemeColorByCell(r: number, c: number, colorKey: MazeThemeColorKey, fallback: string): string {
    const maze = getMazeThemeState();
    if (!maze) return fallback;

    const themeIndex = maze.sceneThemeMap[r]?.[c];
    if (themeIndex === undefined || themeIndex < 0) return fallback;
    const themeConfig = getMazeSceneThemeConfigByIndex(maze.sceneThemeKeys, themeIndex);
    if (!themeConfig) return fallback;

    const blend = maze.sceneBlendMap?.[r]?.[c];
    if (blend && blend.blend > 0.05 && blend.theme2 >= 0) {
        const secondary = getMazeSceneThemeConfigByIndex(maze.sceneThemeKeys, blend.theme2);
        if (secondary) {
            return blendHexColors(
                (themeConfig as any)[colorKey],
                (secondary as any)[colorKey],
                blend.blend
            );
        }
    }

    return (themeConfig as any)[colorKey] || fallback;
}

export function getMazeParticleColorByWorld(x: number, y: number, tileSize: number, rows: number, cols: number, alpha: number): string | null {
    const maze = getMazeThemeState();
    if (!maze) return null;

    const r = Math.floor(y / tileSize);
    const c = Math.floor(x / tileSize);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;

    const themeIndex = maze.sceneThemeMap[r]?.[c];
    if (themeIndex === undefined || themeIndex < 0) return null;
    const themeConfig = getMazeSceneThemeConfigByIndex(maze.sceneThemeKeys, themeIndex);
    if (!themeConfig) return null;
    return themeConfig.particleColor.replace('VAR', String(alpha));
}

// 只保留圆形岩石造型
export function drawMazeWallShape(
    ctx: CanvasRenderingContext2D,
    wall: any,
    row: number,
    col: number
) {
    const maze = getMazeThemeState();
    const wallColor = maze ? getMazeThemeColorByCell(row, col, 'wallColor', '#222') : '#222';
    const wallHighlight = maze ? getMazeThemeColorByCell(row, col, 'wallHighlight', '#1a1a1a') : '#1a1a1a';

    // 统一使用圆形岩石
    ctx.fillStyle = wallColor;
    ctx.beginPath();
    ctx.arc(wall.x, wall.y, wall.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = wallHighlight;
    ctx.beginPath();
    ctx.arc(wall.x - wall.r * 0.3, wall.y - wall.r * 0.3, wall.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
}

export function getMazeThemeLegendItems(sceneThemeKeys: string[] | null | undefined) {
    if (!sceneThemeKeys) return [];
    return sceneThemeKeys
        .map((key, index) => {
            const config = getMazeSceneThemeConfigByIndex(sceneThemeKeys, index);
            if (!config) return null;
            return {
                key,
                name: config.name,
                mapColor: config.mapColor,
            };
        })
        .filter(Boolean);
}

// ============ 迷宫浅水区渲染 ============

import { CONFIG } from '../core/config';

/**
 * 计算迷宫模式下某个世界Y坐标的浅水区因子（0=深处洞穴，1=出口水面）
 * @param worldY 世界Y坐标
 * @param exitY 出口Y坐标
 * @returns 0~1 的浅水因子
 */
export function getMazeShallowFactor(worldY: number, exitY: number): number {
    const sw = CONFIG.maze.shallowWater;
    if (!sw || !sw.enabled) return 0;
    const surfaceY = exitY + sw.waterSurfaceY;
    const deepY = surfaceY + sw.depth;
    if (worldY <= surfaceY) return 1;
    if (worldY >= deepY) return 0;
    return 1 - (worldY - surfaceY) / (deepY - surfaceY);
}

/**
 * 绘制迷宫浅水区天空背景、水面波浪和阳光平行光
 * 在世界坐标系中绘制（ctx已经做过相机变换）
 */
export function drawMazeShallowSky(
    ctx: CanvasRenderingContext2D,
    exitX: number,
    exitY: number,
    viewL: number,
    viewR: number,
    viewT: number,
    time: number
) {
    const sw = CONFIG.maze.shallowWater;
    if (!sw || !sw.enabled) return;

    const surfaceY = exitY + sw.waterSurfaceY;
    const skyTop = surfaceY - sw.skyHeight;
    const deepY = surfaceY + sw.depth;

    // 只在视口能看到天空/水面/浅水区时才绘制
    if (viewT > deepY + 200) return;

    // === 天空 + 水下连续渐变（不透明，不露底色） ===
    // 从天空顶部一直延伸到浅水区底部，全程不透明，颜色自然过渡
    const totalHeight = sw.skyHeight + sw.depth;
    const skyGrad = ctx.createLinearGradient(0, skyTop, 0, skyTop + totalHeight);
    // 天空部分：明亮天蓝
    skyGrad.addColorStop(0, sw.skyColorTop);
    skyGrad.addColorStop(0.2, sw.skyColorMid);
    // 水面附近：浅水色调
    const surfaceRatio = sw.skyHeight / totalHeight;
    skyGrad.addColorStop(surfaceRatio * 0.85, sw.skyColorWater);
    // 水面处：开始过渡到水下色调
    const waterColorStr = `rgb(${sw.tintR}, ${sw.tintG}, ${sw.tintB})`;
    skyGrad.addColorStop(surfaceRatio, waterColorStr);
    // 水下光线快速下降：浅水区前15%就开始明显变暗
    const deepColor = sw.skyColorDeep || '#1a3a5a';
    const quickDarkRatio = surfaceRatio + (1 - surfaceRatio) * 0.15;
    skyGrad.addColorStop(quickDarkRatio, deepColor);
    // 浅水区前35%处已经很暗
    const darkRatio = surfaceRatio + (1 - surfaceRatio) * 0.35;
    skyGrad.addColorStop(darkRatio, '#0c1a28');
    // 浅水区50%处完全进入深洞暗色，后半段平稳不变
    const fullDarkRatio = surfaceRatio + (1 - surfaceRatio) * 0.5;
    skyGrad.addColorStop(fullDarkRatio, '#080e15');
    skyGrad.addColorStop(1, '#080e15');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(viewL - 100, skyTop, (viewR - viewL) + 200, totalHeight);

    // 水面波浪
    if (sw.waveEnabled) {
        const waveStart = Math.floor(viewL / 40) * 40 - 40;
        const waveEnd = Math.ceil(viewR / 40) * 40 + 40;

        // 水面反光带（宽幅柔和高光，让水面有光泽感）
        ctx.save();
        const reflectGrad = ctx.createLinearGradient(0, surfaceY - 15, 0, surfaceY + 25);
        reflectGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        reflectGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.12)');
        reflectGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
        reflectGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.08)');
        reflectGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = reflectGrad;
        ctx.fillRect(viewL - 100, surfaceY - 15, (viewR - viewL) + 200, 40);
        ctx.restore();

        // 后层波浪（较暗，较慢）
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(waveStart, surfaceY + 5);
        for (let x = waveStart; x < waveEnd; x += 40) {
            ctx.lineTo(x, surfaceY + 5 + Math.sin(x / 150 + time * 0.8) * 8);
        }
        ctx.stroke();

        // 前层波浪（明亮，较快）
        ctx.strokeStyle = 'rgba(200, 240, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(waveStart, surfaceY + 5);
        for (let x = waveStart; x < waveEnd; x += 30) {
            ctx.lineTo(x, surfaceY + 5 + Math.sin(x / 100 + time) * 5);
        }
        ctx.stroke();
    }

    // === 阳光平行光柱（从水面向下照射的宽幅光束） ===
    if (sw.sunlightEnabled) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const rayCount = sw.sunlightRayCount || 8;
        const rayWidth = sw.sunlightRayWidth || 35;
        const rayLength = sw.sunlightRayLength || 600;
        const intensity = sw.sunlightIntensity || 0.22;
        const spacing = sw.sunlightSpacing || 160;
        const swaySpeed = sw.sunlightSwaySpeed || 0.4;
        const swayAmount = sw.sunlightSwayAmount || 30;
        const fadeStart = sw.sunlightFadeStart || 0.3;
        const sunAngle = sw.sunlightAngle || 0.25;
        const sunColor = sw.sunlightColor || [200, 240, 255];

        // 光柱从出口附近均匀分布
        const totalSpan = (rayCount - 1) * spacing;
        const startX = exitX - totalSpan / 2;

        for (let i = 0; i < rayCount; i++) {
            // 每根光柱有独立的摇曳相位
            const baseX = startX + i * spacing;
            const sway = Math.sin(time * swaySpeed + i * 2.1) * swayAmount;
            const topX = baseX + sway;
            // 光柱向下偏移（模拟斜射阳光）
            const bottomX = topX + Math.sin(sunAngle) * rayLength;
            const bottomY = surfaceY + rayLength;

            // 光柱宽度随深度略微扩散
            const topHalfW = rayWidth * 0.8;
            const bottomHalfW = rayWidth * 1.5;

            // 光柱渐变：从水面处最亮，到深处衰减
            const grad = ctx.createLinearGradient(topX, surfaceY, bottomX, bottomY);
            const r = sunColor[0], g = sunColor[1], b = sunColor[2];
            grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${intensity * 0.6})`);
            grad.addColorStop(fadeStart, `rgba(${r}, ${g}, ${b}, ${intensity})`);
            grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${intensity * 0.5})`);
            grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(topX - topHalfW, surfaceY);
            ctx.lineTo(topX + topHalfW, surfaceY);
            ctx.lineTo(bottomX + bottomHalfW, bottomY);
            ctx.lineTo(bottomX - bottomHalfW, bottomY);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    // 丁达尔光柱（细散射光，补充阳光平行光的间隙）
    if (sw.tyndallEnabled) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < sw.tyndallCount; i++) {
            const rayX = exitX + (i - sw.tyndallCount / 2) * 200 + Math.sin(time * 0.3 + i * 1.5) * 80;
            const rayAngle = Math.PI / 2 + Math.sin(time * 0.5 + i) * 0.2;

            const grad = ctx.createLinearGradient(
                rayX, surfaceY,
                rayX + Math.cos(rayAngle) * 400, surfaceY + Math.sin(rayAngle) * 400
            );
            grad.addColorStop(0, `rgba(200, 255, 255, ${sw.tyndallAlpha})`);
            grad.addColorStop(1, 'rgba(200, 255, 255, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(rayX - 20, surfaceY);
            ctx.lineTo(rayX + 20, surfaceY);
            ctx.lineTo(rayX + Math.cos(rayAngle) * 400 + 40, surfaceY + Math.sin(rayAngle) * 400);
            ctx.lineTo(rayX + Math.cos(rayAngle) * 400 - 40, surfaceY + Math.sin(rayAngle) * 400);
            ctx.fill();
        }
        ctx.restore();
    }
}

/**
 * 绘制浅水区岩石的阳光反光和环境反射光
 * 在世界坐标系中绘制（ctx已经做过相机变换）
 * 应在墙体绘制之后、光照遮罩之前调用
 */
export function drawMazeShallowRockReflections(
    ctx: CanvasRenderingContext2D,
    walls: any[],
    exitY: number,
    viewL: number,
    viewR: number,
    viewT: number,
    viewB: number,
    time: number
) {
    const sw = CONFIG.maze.shallowWater;
    if (!sw || !sw.enabled || !sw.rockReflectEnabled) return;

    const surfaceY = exitY + sw.waterSurfaceY;
    const deepY = surfaceY + sw.depth;

    // 只在视口包含浅水区时才绘制
    if (viewT > deepY || viewB < surfaceY) return;

    const reflectIntensity = sw.rockReflectIntensity || 0.45;
    const reflectSize = sw.rockReflectSize || 0.35;
    const ambientBoost = sw.rockAmbientBoost || 0.18;
    const reflectColor = sw.rockReflectColor || [220, 240, 255];
    const ambientColor = sw.rockAmbientColor || [100, 160, 200];
    const sunAngle = sw.sunlightAngle || 0.25;

    ctx.save();

    for (const w of walls) {
        // 视口裁剪
        if (w.x < viewL - w.r || w.x > viewR + w.r || w.y < viewT - w.r || w.y > viewB + w.r) continue;

        // 只对浅水区内的岩石生效
        if (w.y < surfaceY || w.y > deepY) continue;

        // 浅水因子：越靠近水面越强
        const shallowFactor = 1 - (w.y - surfaceY) / (deepY - surfaceY);
        if (shallowFactor <= 0.02) continue;

        const rr = reflectColor[0], rg = reflectColor[1], rb = reflectColor[2];
        const ar = ambientColor[0], ag = ambientColor[1], ab = ambientColor[2];

        // 1. 环境反射光（整个岩石表面的柔和亮化）
        const ambAlpha = ambientBoost * shallowFactor;
        if (ambAlpha > 0.01) {
            const ambGrad = ctx.createRadialGradient(w.x, w.y, w.r * 0.2, w.x, w.y, w.r * 1.1);
            ambGrad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, ${ambAlpha * 0.8})`);
            ambGrad.addColorStop(0.6, `rgba(${ar}, ${ag}, ${ab}, ${ambAlpha * 0.4})`);
            ambGrad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0)`);
            ctx.fillStyle = ambGrad;
            ctx.beginPath();
            ctx.arc(w.x, w.y, w.r * 1.1, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. 阳光直射高光（岩石顶部偏向阳光方向的亮点）
        const hlAlpha = reflectIntensity * shallowFactor;
        if (hlAlpha > 0.02) {
            // 高光位置：岩石顶部偏向阳光入射方向
            const hlOffsetX = -Math.sin(sunAngle) * w.r * 0.3;
            const hlOffsetY = -w.r * 0.35;
            const hlX = w.x + hlOffsetX;
            const hlY = w.y + hlOffsetY;
            const hlR = w.r * reflectSize;

            // 高光有轻微闪烁（模拟水面波纹折射）
            const flicker = 0.85 + Math.sin(time * 2.3 + w.x * 0.01 + w.y * 0.013) * 0.15;
            const finalAlpha = hlAlpha * flicker;

            const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlR);
            hlGrad.addColorStop(0, `rgba(${rr}, ${rg}, ${rb}, ${finalAlpha})`);
            hlGrad.addColorStop(0.4, `rgba(${rr}, ${rg}, ${rb}, ${finalAlpha * 0.5})`);
            hlGrad.addColorStop(1, `rgba(${rr}, ${rg}, ${rb}, 0)`);
            ctx.fillStyle = hlGrad;
            ctx.beginPath();
            ctx.arc(hlX, hlY, hlR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

/**
 * 绘制迷宫浅水区水面焦散效果（水面波纹投影到水底的光斑）
 * 在世界坐标系中绘制，应在水域色调叠加之后调用
 */
export function drawMazeShallowCaustics(
    ctx: CanvasRenderingContext2D,
    exitX: number,
    exitY: number,
    viewL: number,
    viewR: number,
    viewT: number,
    viewB: number,
    time: number
) {
    const sw = CONFIG.maze.shallowWater;
    if (!sw || !sw.enabled || !sw.sunlightEnabled) return;

    const surfaceY = exitY + sw.waterSurfaceY;
    const deepY = surfaceY + sw.depth;

    // 只在视口包含浅水区时才绘制
    if (viewT > deepY || viewB < surfaceY) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.06;

    // 用伪随机网格生成焦散光斑
    const cellSize = 120;
    const startCol = Math.floor(viewL / cellSize) - 1;
    const endCol = Math.ceil(viewR / cellSize) + 1;
    const startRow = Math.floor(Math.max(viewT, surfaceY) / cellSize);
    const endRow = Math.ceil(Math.min(viewB, deepY) / cellSize);

    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            const hash = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
            const prob = hash - Math.floor(hash);
            if (prob > 0.35) continue;

            const cx = c * cellSize + (hash % 1) * cellSize;
            const cy = r * cellSize + ((hash * 7.3) % 1) * cellSize;

            if (cy < surfaceY || cy > deepY) continue;

            // 浅水因子
            const factor = 1 - (cy - surfaceY) / (deepY - surfaceY);
            if (factor < 0.05) continue;

            // 焦散光斑随时间缓慢移动和变形
            const dx = Math.sin(time * 0.7 + hash * 10) * 15;
            const dy = Math.cos(time * 0.5 + hash * 13) * 10;
            const radius = 20 + prob * 30;

            const grad = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, radius * factor);
            grad.addColorStop(0, `rgba(200, 240, 255, ${factor * 0.8})`);
            grad.addColorStop(1, 'rgba(200, 240, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx + dx, cy + dy, radius * factor, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

/**
 * 绘制迷宫浅水区水域的浅蓝色叠加
 * 用一个大的垂直渐变覆盖整个浅水区，避免逐格子绘制产生色带和方块边缘
 */
export function drawMazeShallowWaterTint(
    ctx: CanvasRenderingContext2D,
    renderMap: any[][],
    viewRowMin: number,
    viewRowMax: number,
    viewColMin: number,
    viewColMax: number,
    renderTs: number,
    exitY: number
) {
    const sw = CONFIG.maze.shallowWater;
    if (!sw || !sw.enabled || !sw.bgTintEnabled) return;

    const surfaceY = exitY + sw.waterSurfaceY;
    const deepY = surfaceY + sw.depth;

    // 只在视口包含浅水区时才绘制
    const viewTopWorld = viewRowMin * renderTs;
    if (viewTopWorld > deepY) return;

    // 用一个大的垂直渐变覆盖整个浅水区范围
    // 从水面处最浓（tintAlpha）到深处完全透明，自然过渡无色带
    const drawTop = Math.max(viewRowMin * renderTs, surfaceY);
    const drawBottom = Math.min((viewRowMax + 1) * renderTs, deepY);
    if (drawBottom <= drawTop) return;

    const drawLeft = viewColMin * renderTs;
    const drawRight = (viewColMax + 1) * renderTs;

    const tintGrad = ctx.createLinearGradient(0, surfaceY, 0, deepY);
    // 水面处最浓，快速衰减到透明
    tintGrad.addColorStop(0, `rgba(${sw.tintR}, ${sw.tintG}, ${sw.tintB}, ${sw.tintAlpha})`);
    tintGrad.addColorStop(0.15, `rgba(${sw.tintR}, ${sw.tintG}, ${sw.tintB}, ${sw.tintAlpha * 0.4})`);
    tintGrad.addColorStop(0.35, `rgba(${sw.tintR}, ${sw.tintG}, ${sw.tintB}, 0.05)`);
    tintGrad.addColorStop(0.5, `rgba(${sw.tintR}, ${sw.tintG}, ${sw.tintB}, 0)`);
    tintGrad.addColorStop(1, `rgba(${sw.tintR}, ${sw.tintG}, ${sw.tintB}, 0)`);
    ctx.fillStyle = tintGrad;
    ctx.fillRect(drawLeft, drawTop, drawRight - drawLeft, drawBottom - drawTop);
}

/**
 * 计算迷宫模式下的环境光（浅水区更亮）
 * 返回 maskAlpha（0=全亮，1=全暗）
 */
export function getMazeShallowMaskAlpha(playerY: number, exitY: number): number {
    const sw = CONFIG.maze.shallowWater;
    if (!sw || !sw.enabled) {
        // 不启用浅水区时，使用默认深洞逻辑
        return Math.max(0, 1 - CONFIG.ambientLightDeep);
    }

    const factor = getMazeShallowFactor(playerY, exitY);
    if (factor <= 0) {
        // 深处：使用默认深洞环境光
        return Math.max(0, 1 - CONFIG.ambientLightDeep);
    }

    // 浅水区：用幂函数加速光线下降，让浅水区很快变暗
    // factor=1 时在水面，factor=0 时在深处
    // 用 pow(factor, 0.3) 让光线在浅处更快下降
    const adjustedFactor = Math.pow(factor, 0.3);
    const ambient = sw.ambientMin + (sw.ambientMax - sw.ambientMin) * adjustedFactor;
    return Math.max(0, 1 - ambient);
}

