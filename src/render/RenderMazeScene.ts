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

            const cx = c * renderTs + renderTs / 2;
            const cy = r * renderTs + renderTs / 2;
            const hash = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
            const prob = hash - Math.floor(hash);
            if (prob > 0.25) continue;

            switch (themeConfig.bgDecoType) {
                case 'blobShadow': {
                    ctx.fillStyle = themeConfig.wallColor;
                    ctx.beginPath();
                    ctx.arc(cx + (prob - 0.12) * 20, cy + (hash % 1 - 0.5) * 15, renderTs * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }
                case 'sharpEdge': {
                    ctx.strokeStyle = themeConfig.wallHighlight;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(cx - renderTs * 0.3, cy + renderTs * 0.2);
                    ctx.lineTo(cx, cy - renderTs * 0.3);
                    ctx.lineTo(cx + renderTs * 0.3, cy + renderTs * 0.15);
                    ctx.stroke();
                    break;
                }
                case 'layerLines': {
                    ctx.strokeStyle = themeConfig.wallHighlight;
                    ctx.lineWidth = 0.8;
                    for (let i = 0; i < 3; i++) {
                        const ly = cy - renderTs * 0.2 + i * renderTs * 0.2;
                        ctx.beginPath();
                        ctx.moveTo(cx - renderTs * 0.35, ly + Math.sin(c + i) * 2);
                        ctx.lineTo(cx + renderTs * 0.35, ly + Math.cos(r + i) * 2);
                        ctx.stroke();
                    }
                    break;
                }
                case 'veinLines': {
                    ctx.strokeStyle = themeConfig.wallHighlight;
                    ctx.lineWidth = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(cx - renderTs * 0.3, cy - renderTs * 0.2);
                    ctx.quadraticCurveTo(cx + prob * 10, cy, cx + renderTs * 0.3, cy + renderTs * 0.2);
                    ctx.stroke();
                    break;
                }
                case 'grainDots': {
                    ctx.fillStyle = themeConfig.wallColor;
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
    const rockShape = structureKey === 'stalactite' ? 'spiky' : (themeConfig?.rockShape || 'round');

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
        case 'layered': {
            const layers = 3 + Math.floor(Math.sin(row * 3 + col * 5) + 1.5);
            for (let i = 0; i < layers; i++) {
                const ly = wall.y - wall.r * 0.5 + (i / layers) * wall.r;
                const lw = wall.r * (0.8 + Math.sin(i * 1.5 + row) * 0.2);
                const lh = wall.r / layers * 0.8;
                ctx.fillRect(wall.x - lw, ly, lw * 2, lh);
            }
            ctx.fillStyle = wallHighlight;
            ctx.fillRect(wall.x - wall.r * 0.5, wall.y - wall.r * 0.3, wall.r, wall.r * 0.15);
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

