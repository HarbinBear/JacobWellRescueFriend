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

export function drawMazeBackgroundDecorations(
    ctx: CanvasRenderingContext2D,
    renderMap: any[][],
    viewRowMin: number,
    viewRowMax: number,
    viewColMin: number,
    viewColMax: number,
    renderTs: number
) {
    const maze = getMazeThemeState();
    if (!maze) return;

    ctx.save();
    ctx.globalAlpha = 0.15;
    for (let r = viewRowMin; r <= viewRowMax; r++) {
        if (!renderMap[r]) continue;
        for (let c = viewColMin; c <= viewColMax; c++) {
            if (renderMap[r][c] !== 0) continue;
            const themeIndex = maze.sceneThemeMap[r]?.[c];
            const themeConfig = getMazeSceneThemeConfigByIndex(maze.sceneThemeKeys, themeIndex);
            if (!themeConfig) continue;

            // 在过渡带上根据混合比例概率性选择装饰类型
            let decoType = themeConfig.bgDecoType;
            let decoWallColor = themeConfig.wallColor;
            let decoHighlight = themeConfig.wallHighlight;
            const blend = maze.sceneBlendMap?.[r]?.[c];
            if (blend && blend.blend > 0.1 && blend.theme2 >= 0) {
                const secondary = getMazeSceneThemeConfigByIndex(maze.sceneThemeKeys, blend.theme2);
                if (secondary) {
                    // 用稳定哈希决定该格用哪种装饰
                    const decoHash = Math.sin(r * 91.37 + c * 213.51) * 43758.5453;
                    const decoProb = decoHash - Math.floor(decoHash);
                    if (decoProb < blend.blend) {
                        decoType = secondary.bgDecoType;
                        decoWallColor = secondary.wallColor;
                        decoHighlight = secondary.wallHighlight;
                    }
                }
            }

            const cx = c * renderTs + renderTs / 2;
            const cy = r * renderTs + renderTs / 2;
            const hash = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
            const prob = hash - Math.floor(hash);
            if (prob > 0.25) continue;

            switch (decoType) {
                case 'blobShadow': {
                    ctx.fillStyle = decoWallColor;
                    ctx.beginPath();
                    ctx.arc(cx + (prob - 0.12) * 20, cy + (hash % 1 - 0.5) * 15, renderTs * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }
                case 'sharpEdge': {
                    ctx.strokeStyle = decoHighlight;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(cx - renderTs * 0.3, cy + renderTs * 0.2);
                    ctx.lineTo(cx, cy - renderTs * 0.3);
                    ctx.lineTo(cx + renderTs * 0.3, cy + renderTs * 0.15);
                    ctx.stroke();
                    break;
                }

                case 'veinLines': {
                    ctx.strokeStyle = decoHighlight;
                    ctx.lineWidth = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(cx - renderTs * 0.3, cy - renderTs * 0.2);
                    ctx.quadraticCurveTo(cx + prob * 10, cy, cx + renderTs * 0.3, cy + renderTs * 0.2);
                    ctx.stroke();
                    break;
                }
                case 'grainDots': {
                    ctx.fillStyle = decoWallColor;
                    for (let i = 0; i < 4; i++) {
                        const dx = Math.sin(i * 2.3 + r) * renderTs * 0.25;
                        const dy = Math.cos(i * 3.1 + c) * renderTs * 0.25;
                        ctx.beginPath();
                        ctx.arc(cx + dx, cy + dy, 1.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;
                }
                case 'glowOrb':
                default: {
                    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, renderTs * 0.3);
                    grad.addColorStop(0, 'rgba(200,210,220,0.2)');
                    grad.addColorStop(1, 'rgba(200,210,220,0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(cx, cy, renderTs * 0.3, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }
            }
        }
    }
    ctx.restore();
}

export function drawMazeWallShape(
    ctx: CanvasRenderingContext2D,
    wall: any,
    row: number,
    col: number
) {
    const maze = getMazeThemeState();
    const wallColor = maze ? getMazeThemeColorByCell(row, col, 'wallColor', '#222') : '#222';
    const wallHighlight = maze ? getMazeThemeColorByCell(row, col, 'wallHighlight', '#1a1a1a') : '#1a1a1a';
    const themeIndex = maze ? maze.sceneThemeMap[row]?.[col] : -1;
    const themeConfig = getMazeSceneThemeConfigByIndex(maze?.sceneThemeKeys, themeIndex);
    const structureKey = maze?.sceneStructureMap?.[row]?.[col] || 'none';

    // 在过渡带上根据混合比例概率性选择造型，让造型也自然过渡
    let rockShape = structureKey === 'stalactite' ? 'spiky' : (themeConfig?.rockShape || 'round');
    if (structureKey !== 'stalactite' && maze) {
        const blend = maze.sceneBlendMap?.[row]?.[col];
        if (blend && blend.blend > 0.1 && blend.theme2 >= 0) {
            const secondary = getMazeSceneThemeConfigByIndex(maze.sceneThemeKeys, blend.theme2);
            if (secondary && secondary.rockShape !== rockShape) {
                // 用稳定哈希决定该格用哪种造型，避免每帧闪烁
                const shapeHash = Math.sin(row * 73.17 + col * 157.93) * 43758.5453;
                const shapeProb = shapeHash - Math.floor(shapeHash);
                if (shapeProb < blend.blend) {
                    rockShape = secondary.rockShape;
                }
            }
        }
    }

    ctx.fillStyle = wallColor;

    switch (rockShape) {
        case 'angular': {
            const hash = Math.sin(row * 127.1 + col * 311.7) * 43758.5453;
            const sides = 5 + Math.floor((hash - Math.floor(hash)) * 3);
            ctx.beginPath();
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2 + (hash % 1) * 0.5;
                const rr = wall.r * (0.7 + Math.sin(a * 3 + hash) * 0.3);
                const px = wall.x + Math.cos(a) * rr;
                const py = wall.y + Math.sin(a) * rr;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = wallHighlight;
            ctx.beginPath();
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2 + (hash % 1) * 0.5;
                const rr = wall.r * 0.45 * (0.7 + Math.sin(a * 3 + hash) * 0.3);
                const px = wall.x - wall.r * 0.2 + Math.cos(a) * rr;
                const py = wall.y - wall.r * 0.2 + Math.sin(a) * rr;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            break;
        }

        case 'smooth': {
            ctx.beginPath();
            ctx.arc(wall.x, wall.y, wall.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = wallHighlight;
            ctx.beginPath();
            ctx.arc(wall.x - wall.r * 0.15, wall.y - wall.r * 0.15, wall.r * 0.7, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'spiky': {
            ctx.beginPath();
            ctx.arc(wall.x, wall.y, wall.r * 0.7, 0, Math.PI * 2);
            ctx.fill();
            const spikeCount = structureKey === 'stalactite' ? 4 : 3 + Math.floor(Math.sin(row * 5 + col * 7) * 1.5 + 1.5);
            const startAngle = structureKey === 'stalactite' ? -Math.PI * 0.85 : row * 0.3;
            const angleSpan = structureKey === 'stalactite' ? Math.PI * 0.7 : Math.PI * 2;
            for (let i = 0; i < spikeCount; i++) {
                const ratio = spikeCount <= 1 ? 0 : i / (spikeCount - 1);
                const a = structureKey === 'stalactite'
                    ? startAngle + angleSpan * ratio
                    : (i / spikeCount) * Math.PI * 2 + startAngle;
                const spikeLength = structureKey === 'stalactite'
                    ? wall.r * (0.95 + ratio * 0.5)
                    : wall.r * (0.8 + Math.sin(i * 2.7 + col) * 0.4);
                ctx.beginPath();
                ctx.moveTo(wall.x + Math.cos(a - 0.22) * wall.r * 0.55, wall.y + Math.sin(a - 0.22) * wall.r * 0.55);
                ctx.lineTo(wall.x + Math.cos(a) * spikeLength, wall.y + Math.sin(a) * spikeLength);
                ctx.lineTo(wall.x + Math.cos(a + 0.22) * wall.r * 0.55, wall.y + Math.sin(a + 0.22) * wall.r * 0.55);
                ctx.fill();
            }
            ctx.fillStyle = wallHighlight;
            ctx.beginPath();
            ctx.arc(wall.x - wall.r * 0.2, wall.y - wall.r * 0.2, wall.r * 0.35, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'round':
        default: {
            ctx.beginPath();
            ctx.arc(wall.x, wall.y, wall.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = wallHighlight;
            ctx.beginPath();
            ctx.arc(wall.x - wall.r * 0.3, wall.y - wall.r * 0.3, wall.r * 0.6, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
    }
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
 * 绘制迷宫浅水区天空背景和水面波浪
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

    // 只在视口能看到天空/水面时才绘制
    if (viewT > surfaceY + 200) return;

    // 天空渐变背景（从明亮天蓝过渡到浅水区色调，延伸到水面以下避免灰色间隙）
    const extendBelow = 500; // 天空渐变延伸到水面以下的距离
    const totalHeight = sw.skyHeight + extendBelow;
    const skyGrad = ctx.createLinearGradient(0, skyTop, 0, surfaceY + extendBelow);
    skyGrad.addColorStop(0, sw.skyColorTop);
    skyGrad.addColorStop(0.35, sw.skyColorMid);
    // 水面附近用浅水区色调
    const surfaceRatio = sw.skyHeight / totalHeight;
    skyGrad.addColorStop(surfaceRatio * 0.9, sw.skyColorWater);
    // 水面以下逐渐变透明，颜色用浅水区色调而非灰色
    skyGrad.addColorStop(surfaceRatio, `rgba(${sw.tintR}, ${sw.tintG}, ${sw.tintB}, 0.5)`);
    skyGrad.addColorStop(1, `rgba(${sw.tintR}, ${sw.tintG}, ${sw.tintB}, 0)`);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(viewL - 100, skyTop, (viewR - viewL) + 200, totalHeight);

    // 水面波浪
    if (sw.waveEnabled) {
        // 后层波浪（较暗，较慢）
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const waveStart = Math.floor(viewL / 40) * 40 - 40;
        const waveEnd = Math.ceil(viewR / 40) * 40 + 40;
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

    // 丁达尔光柱（浅水区可见）
    if (sw.tyndallEnabled) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < sw.tyndallCount; i++) {
            // 光柱分布在出口附近
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
    tintGrad.addColorStop(0, `rgba(${sw.tintR}, ${sw.tintG}, ${sw.tintB}, ${sw.tintAlpha})`);
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

    // 浅水区：环境光从 ambientMin 渐变到 ambientMax
    const ambient = sw.ambientMin + (sw.ambientMax - sw.ambientMin) * factor;
    return Math.max(0, 1 - ambient);
}

