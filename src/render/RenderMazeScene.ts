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
    // 用密集色停消除色带，全程平滑插值
    const totalHeight = sw.skyHeight + sw.depth;
    const skyGrad = ctx.createLinearGradient(0, skyTop, 0, skyTop + totalHeight);
    const surfaceRatio = sw.skyHeight / totalHeight;

    // 定义关键颜色节点的 RGB 值
    // 天空顶部 '#87CEEB' -> rgb(135, 206, 235)
    const skyTopR = 135, skyTopG = 206, skyTopB = 235;
    // 天空中部 '#E0F7FA' -> rgb(224, 247, 250)
    const skyMidR = 224, skyMidG = 247, skyMidB = 250;
    // 水面附近 '#4DD0E1' -> rgb(77, 208, 225)
    const skyWaterR = 77, skyWaterG = 208, skyWaterB = 225;
    // 水面色调
    const wR = sw.tintR, wG = sw.tintG, wB = sw.tintB;
    // 深蓝 '#1a3a5a' -> rgb(26, 58, 90)
    const dR = 26, dG = 58, dB = 90;
    // 最暗 '#080e15' -> rgb(8, 14, 21)
    const kR = 8, kG = 14, kB = 21;

    // 用 20 个均匀色停覆盖全程，彻底消除色带
    const totalStops = 20;
    for (let i = 0; i <= totalStops; i++) {
        const globalT = i / totalStops; // 0 ~ 1，覆盖从天空顶到浅水区底
        let r: number, g: number, b: number;

        if (globalT <= surfaceRatio) {
            // 天空部分：天空顶 -> 天空中 -> 水面色
            const skyT = globalT / surfaceRatio; // 0~1 在天空范围内
            if (skyT < 0.35) {
                // 天空顶 -> 天空中
                const lt = skyT / 0.35;
                r = Math.round(skyTopR + (skyMidR - skyTopR) * lt);
                g = Math.round(skyTopG + (skyMidG - skyTopG) * lt);
                b = Math.round(skyTopB + (skyMidB - skyTopB) * lt);
            } else if (skyT < 0.75) {
                // 天空中 -> 水面色
                const lt = (skyT - 0.35) / 0.4;
                r = Math.round(skyMidR + (skyWaterR - skyMidR) * lt);
                g = Math.round(skyMidG + (skyWaterG - skyMidG) * lt);
                b = Math.round(skyMidB + (skyWaterB - skyMidB) * lt);
            } else {
                // 水面色 -> 水体色调
                const lt = (skyT - 0.75) / 0.25;
                r = Math.round(skyWaterR + (wR - skyWaterR) * lt);
                g = Math.round(skyWaterG + (wG - skyWaterG) * lt);
                b = Math.round(skyWaterB + (wB - skyWaterB) * lt);
            }
        } else {
            // 水下部分：水体色调 -> 深蓝 -> 最暗
            const underwaterT = (globalT - surfaceRatio) / (1 - surfaceRatio); // 0~1 在水下范围内
            // 用幂函数让前段变化快、后段平稳
            const darkT = Math.pow(underwaterT, 0.5);
            if (darkT < 0.35) {
                // 水色 -> 深蓝
                const lt = darkT / 0.35;
                r = Math.round(wR + (dR - wR) * lt);
                g = Math.round(wG + (dG - wG) * lt);
                b = Math.round(wB + (dB - wB) * lt);
            } else {
                // 深蓝 -> 最暗
                const lt = (darkT - 0.35) / 0.65;
                r = Math.round(dR + (kR - dR) * lt);
                g = Math.round(dG + (kG - dG) * lt);
                b = Math.round(dB + (kB - dB) * lt);
            }
        }
        skyGrad.addColorStop(Math.min(globalT, 1), `rgb(${r}, ${g}, ${b})`);
    }
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
 * 计算迷宫模式下的全局环境光遮罩
 * 返回 maskAlpha（0=全亮，1=全暗）
 *
 * 从水面到深处用一条完全连续的曲线过渡，没有任何分段拼接或突变。
 *
 * 曲线设计：
 *   factor = 1（水面）→ 0（浅水区底部）
 *   用 pow(1 - factor, maskCurveExp) 把 factor 映射成 darkProgress（0=水面，1=最暗）
 *   maskCurveExp > 1 时：前段（水面附近）变暗慢，后段快速变暗
 *   maskCurveExp < 1 时：前段快速变暗，后段慢
 *   maskCurveExp = 1 时：线性
 *
 * 可调参数（CONFIG.maze.shallowWater）：
 *   ambientMax    - 水面处的环境光亮度（默认 0.95）
 *   ambientMin    - 深处的环境光亮度（默认 0.01，等于 ambientLightDeep）
 *   maskCurveExp  - 衰减曲线指数（默认 2.5，>1=前亮后暗快）
 *   maskMidPoint  - 中点位置（0~1，在浅水区多深处亮度降到一半，默认 0.3）
 */
export function getMazeShallowMaskAlpha(playerY: number, exitY: number): number {
    const sw = CONFIG.maze.shallowWater;
    if (!sw || !sw.enabled) {
        return Math.max(0, 1 - CONFIG.ambientLightDeep);
    }

    const surfaceY = exitY + sw.waterSurfaceY;
    const deepY = surfaceY + sw.depth;
    const ambientMax = sw.ambientMax;
    const ambientMin = sw.ambientMin;
    const curveExp = sw.maskCurveExp || 2.5;
    const midPoint = sw.maskMidPoint || 0.3;

    // 水面以上：全亮
    if (playerY <= surfaceY) {
        return Math.max(0, 1 - ambientMax);
    }

    // 浅水区以下：全暗（等于深洞暗度）
    if (playerY >= deepY) {
        return Math.max(0, 1 - ambientMin);
    }

    // 浅水区内：连续曲线过渡
    // t = 0（水面）→ 1（浅水区底部）
    const t = (playerY - surfaceY) / (deepY - surfaceY);

    // 用 midPoint 调整曲线形状：
    // 当 t = midPoint 时，ambient 应该恰好在 (ambientMax + ambientMin) / 2
    // 通过调整指数来实现：pow(midPoint, exp) = 0.5 → exp = ln(0.5) / ln(midPoint)
    // 但为了简单可控，直接用 curveExp 作为主控参数，midPoint 作为辅助偏移
    //
    // 最终曲线：darkProgress = pow(t, curveExp * (1 / (-ln2 / ln(midPoint))))
    // 简化为：先用 midPoint 计算等效指数，再和 curveExp 叠加
    //
    // 更直观的方案：用 curveExp 直接控制，midPoint 通过重映射 t 来实现
    // 重映射：让 t 在 midPoint 处对应 darkProgress=0.5
    // adjustedExp = log(0.5) / log(midPoint) * curveExp
    const adjustedExp = midPoint > 0.01 && midPoint < 0.99
        ? (-0.693147 / Math.log(midPoint)) * curveExp
        : curveExp;

    // darkProgress: 0（水面，全亮）→ 1（深处，全暗）
    const darkProgress = Math.pow(t, adjustedExp);

    // ambient 从 ambientMax 线性插值到 ambientMin
    const ambient = ambientMax + (ambientMin - ambientMax) * darkProgress;

    return Math.max(0, Math.min(1, 1 - ambient));
}


// =============================================
// 绘制迷宫模式食人鱼聚集点附近的骷髅装饰
// 每只骷髅贴在岩石外缘，面朝聚集点外侧（营造"有人死在这里"的氛围）
// 注意：骷髅纯视觉表现，不参与碰撞，不改变玩家行为
// =============================================
export function drawFishDenSkulls(
    ctx: CanvasRenderingContext2D,
    viewL: number,
    viewR: number,
    viewT: number,
    viewB: number
) {
    const maze = state.mazeRescue;
    if (!maze || !maze.fishDens || maze.fishDens.length === 0) return;

    ctx.save();
    for (const den of maze.fishDens) {
        if (!den.skulls || den.skulls.length === 0) continue;
        for (const sk of den.skulls) {
            // 视锥外跳过（padding 要覆盖 size=20 + 1.7倍躯干骨放大系数的边界）
            if (sk.x < viewL - 120 || sk.x > viewR + 120 || sk.y < viewT - 120 || sk.y > viewB + 120) continue;
            drawSingleSkull(ctx, sk.x, sk.y, sk.angle, sk.size, sk.seed);
        }
    }
    ctx.restore();
}

// =============================================
// 骨骼渲染：把 seed 映射成 11 种不同造型
// - 头骨类（6 种）：正脸 / 3 四侧 / 正侧 / 后脑 / 无下颌 / 下颌错位
// - 躯干骨（2 种）：胸廓 / 盆骨
// - 长骨与零散骨（3 种）：大腿骨 / 散肋 / 脊椎节
// 所有骨骼：统一左上世界光源方向；局部坐标系内用 unrotate 补偿旋转，保证光感一致
// =============================================

// 伪随机辅助：从 seed 派生 [0,1) 的稳定随机序列
function seedRand(seed: number, salt: number): number {
    const v = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
    return v - Math.floor(v);
}

// 世界光源方向（屏幕坐标：左上→右下）
const LIGHT_WORLD_DX = -0.7;
const LIGHT_WORLD_DY = -0.7;

// 11 种骨骼造型
type BoneKind =
    | 'skull_front' | 'skull_3q' | 'skull_side' | 'skull_back'
    | 'skull_jawless' | 'skull_jaw_dislocated'
    | 'ribcage' | 'pelvis' | 'femur' | 'rib_loose' | 'vertebra';

// 按 seed 选 kind；头骨类总权重更高
function pickBoneKind(seed: number): BoneKind {
    const r = seedRand(seed, 3.7);
    // 累积权重
    if (r < 0.14) return 'skull_front';
    if (r < 0.28) return 'skull_3q';
    if (r < 0.42) return 'skull_side';
    if (r < 0.50) return 'skull_back';
    if (r < 0.58) return 'skull_jawless';
    if (r < 0.62) return 'skull_jaw_dislocated';
    if (r < 0.74) return 'ribcage';
    if (r < 0.84) return 'pelvis';
    if (r < 0.92) return 'femur';
    if (r < 0.97) return 'rib_loose';
    return 'vertebra';
}

// 统一调色：返回一组风化骨色 + 阴影色
function getBonePalette(seed: number) {
    const shade = 0.72 + seedRand(seed, 1.1) * 0.22;
    const baseR = Math.floor(220 * shade);
    const baseG = Math.floor(210 * shade);
    const baseB = Math.floor(185 * shade);
    const hiR = Math.min(255, baseR + 20);
    const hiG = Math.min(255, baseG + 18);
    const hiB = Math.min(255, baseB + 12);
    const loR = Math.max(0, baseR - 35);
    const loG = Math.max(0, baseG - 40);
    const loB = Math.max(0, baseB - 40);
    return {
        light: `rgba(${hiR},${hiG},${hiB},0.9)`,
        base: `rgba(${baseR},${baseG},${baseB},0.88)`,
        dark: `rgba(${loR},${loG},${loB},0.85)`,
        outline: `rgba(${Math.max(0, baseR - 80)},${Math.max(0, baseG - 85)},${Math.max(0, baseB - 80)},0.7)`,
        shadow: `rgba(30,22,18,0.55)`,
        hole: `rgba(8,5,5,0.92)`,
    };
}

// 画风化斑点（写实加分）
function drawWeatherSpots(ctx: CanvasRenderingContext2D, seed: number, boundR: number, palette: ReturnType<typeof getBonePalette>) {
    const n = 2 + Math.floor(seedRand(seed, 5.2) * 3);
    ctx.fillStyle = palette.outline;
    for (let i = 0; i < n; i++) {
        const a = seedRand(seed, 6 + i) * Math.PI * 2;
        const d = seedRand(seed, 7 + i) * boundR * 0.7;
        const sx = Math.cos(a) * d;
        const sy = Math.sin(a) * d;
        const rr = boundR * (0.04 + seedRand(seed, 8 + i) * 0.05);
        ctx.beginPath();
        ctx.arc(sx, sy, rr, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 单个骨骼分发绘制
function drawSingleSkull(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    size: number,
    seed: number
) {
    const kind = pickBoneKind(seed);
    const palette = getBonePalette(seed);

    // 局部光向量 = 把世界光方向用 -angleRot 旋回局部坐标
    // 外层 rotate(angle + PI/2) 后，世界 x 轴对应的局部方向是 (cos(-rot), sin(-rot))
    const rot = angle + Math.PI / 2;
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const localLx = LIGHT_WORLD_DX * cos - LIGHT_WORLD_DY * sin;
    const localLy = LIGHT_WORLD_DX * sin + LIGHT_WORLD_DY * cos;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    // 躯干骨和长骨不按"头顶朝外"摆放那么刻意，加一点个人朝向扰动
    const tweak = (seedRand(seed, 9.1) - 0.5) * 0.4;
    if (kind === 'ribcage' || kind === 'pelvis' || kind === 'femur' || kind === 'rib_loose' || kind === 'vertebra') {
        ctx.rotate(tweak);
    }

    // 躯干和长骨做尺寸放大，更写实比例
    const isLarge = (kind === 'ribcage' || kind === 'pelvis' || kind === 'femur');
    const s = isLarge ? size * 1.7 : size;

    switch (kind) {
        case 'skull_front':          drawSkullFront(ctx, s, seed, palette, localLx, localLy); break;
        case 'skull_3q':             drawSkull3Q(ctx, s, seed, palette, localLx, localLy); break;
        case 'skull_side':           drawSkullSide(ctx, s, seed, palette, localLx, localLy); break;
        case 'skull_back':           drawSkullBack(ctx, s, seed, palette, localLx, localLy); break;
        case 'skull_jawless':        drawSkullJawless(ctx, s, seed, palette, localLx, localLy); break;
        case 'skull_jaw_dislocated': drawSkullJawDislocated(ctx, s, seed, palette, localLx, localLy); break;
        case 'ribcage':              drawRibcage(ctx, s, seed, palette, localLx, localLy); break;
        case 'pelvis':               drawPelvis(ctx, s, seed, palette, localLx, localLy); break;
        case 'femur':                drawFemur(ctx, s, seed, palette, localLx, localLy); break;
        case 'rib_loose':            drawRibLoose(ctx, s, seed, palette, localLx, localLy); break;
        case 'vertebra':             drawVertebra(ctx, s, seed, palette, localLx, localLy); break;
    }

    ctx.restore();
}

type Palette = ReturnType<typeof getBonePalette>;

// ---------------- 头骨：正面 ----------------
function drawSkullFront(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    // 底衬阴影（按光方向偏移）
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.25, -ly * s * 0.25, s * 0.9, s * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();

    // 颅骨主轮廓（带渐变）
    const grad = ctx.createLinearGradient(lx * s, ly * s, -lx * s, -ly * s);
    grad.addColorStop(0, p.light);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    // 上半颅顶
    ctx.moveTo(-s * 0.78, -s * 0.12);
    ctx.bezierCurveTo(-s * 0.95, -s * 1.05, s * 0.95, -s * 1.05, s * 0.78, -s * 0.12);
    // 颞部轻微凹陷
    ctx.lineTo(s * 0.68, s * 0.15);
    // 颧骨
    ctx.bezierCurveTo(s * 0.75, s * 0.25, s * 0.6, s * 0.4, s * 0.5, s * 0.35);
    // 下颌
    ctx.bezierCurveTo(s * 0.45, s * 0.9, -s * 0.45, s * 0.9, -s * 0.5, s * 0.35);
    ctx.bezierCurveTo(-s * 0.6, s * 0.4, -s * 0.75, s * 0.25, -s * 0.68, s * 0.15);
    ctx.closePath();
    ctx.fill();

    // 轮廓描边
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 冠状缝合线
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.75);
    ctx.bezierCurveTo(-s * 0.2, -s * 0.85, s * 0.2, -s * 0.85, s * 0.55, -s * 0.75);
    ctx.stroke();
    // 矢状缝合线
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.85);
    ctx.lineTo(0, -s * 0.2);
    ctx.stroke();

    // 眼窝
    ctx.fillStyle = p.hole;
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.15, s * 0.22, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.3, -s * 0.15, s * 0.22, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鼻腔
    ctx.beginPath();
    ctx.moveTo(0, s * 0.05);
    ctx.lineTo(-s * 0.11, s * 0.3);
    ctx.lineTo(s * 0.11, s * 0.3);
    ctx.closePath();
    ctx.fill();

    // 上下排牙齿
    ctx.strokeStyle = 'rgba(25,18,12,0.6)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
        const tx = i * s * 0.1;
        ctx.moveTo(tx, s * 0.42);
        ctx.lineTo(tx, s * 0.56);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
        const tx = i * s * 0.1;
        ctx.moveTo(tx, s * 0.62);
        ctx.lineTo(tx, s * 0.76);
    }
    ctx.stroke();

    drawWeatherSpots(ctx, seed, s * 0.7, p);
}

// ---------------- 头骨：3/4 侧 ----------------
function drawSkull3Q(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    // 底衬
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.25 + s * 0.1, -ly * s * 0.25 + s * 0.1, s * 0.9, s * 1.0, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 偏转角度模拟 3/4 侧
    const turn = seedRand(seed, 2.1) > 0.5 ? 1 : -1; // 朝左 or 朝右

    ctx.save();
    ctx.scale(turn, 1); // 统一按"向右 3/4"绘制，然后左右翻转

    const grad = ctx.createLinearGradient(lx * s, ly * s, -lx * s, -ly * s);
    grad.addColorStop(0, p.light);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;

    ctx.beginPath();
    // 颅顶（左宽右略收缩模拟透视）
    ctx.moveTo(-s * 0.7, -s * 0.1);
    ctx.bezierCurveTo(-s * 0.95, -s * 1.0, s * 0.7, -s * 1.05, s * 0.85, -s * 0.2);
    // 右侧脸颊（近侧）
    ctx.lineTo(s * 0.88, s * 0.15);
    ctx.bezierCurveTo(s * 0.9, s * 0.35, s * 0.65, s * 0.5, s * 0.45, s * 0.4);
    // 下颌
    ctx.bezierCurveTo(s * 0.4, s * 0.88, -s * 0.45, s * 0.85, -s * 0.5, s * 0.3);
    // 左侧脸颊（远侧，收缩）
    ctx.bezierCurveTo(-s * 0.62, s * 0.28, -s * 0.72, s * 0.08, -s * 0.7, -s * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 鼻骨桥（斜侧凸起）
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(s * 0.05, -s * 0.25);
    ctx.lineTo(s * 0.25, s * 0.1);
    ctx.stroke();

    // 眼窝（近侧大，远侧小且变形）
    ctx.fillStyle = p.hole;
    // 近侧
    ctx.beginPath();
    ctx.ellipse(s * 0.38, -s * 0.12, s * 0.22, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    // 远侧（透视变扁）
    ctx.beginPath();
    ctx.ellipse(-s * 0.15, -s * 0.15, s * 0.12, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鼻腔（偏右）
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.08);
    ctx.lineTo(s * 0.1, s * 0.3);
    ctx.lineTo(s * 0.28, s * 0.3);
    ctx.closePath();
    ctx.fill();

    // 牙列（侧视）
    ctx.strokeStyle = 'rgba(25,18,12,0.6)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = -2; i <= 3; i++) {
        const tx = i * s * 0.11;
        ctx.moveTo(tx, s * 0.45);
        ctx.lineTo(tx, s * 0.6);
    }
    ctx.stroke();

    ctx.restore();
    drawWeatherSpots(ctx, seed, s * 0.7, p);
}

// ---------------- 头骨：正侧 ----------------
function drawSkullSide(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.25, -ly * s * 0.25, s * 1.0, s * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    const turn = seedRand(seed, 2.2) > 0.5 ? 1 : -1;
    ctx.save();
    ctx.scale(turn, 1);

    const grad = ctx.createLinearGradient(lx * s, ly * s, -lx * s, -ly * s);
    grad.addColorStop(0, p.light);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;

    // 侧视颅骨：后脑圆、前面有凸出的鼻骨和尖下巴
    ctx.beginPath();
    ctx.moveTo(-s * 0.85, -s * 0.1);
    // 颅顶
    ctx.bezierCurveTo(-s * 1.0, -s * 0.95, s * 0.45, -s * 1.1, s * 0.75, -s * 0.6);
    // 前额到鼻
    ctx.bezierCurveTo(s * 0.95, -s * 0.3, s * 1.05, -s * 0.05, s * 0.8, s * 0.1);
    // 上颌突出
    ctx.bezierCurveTo(s * 0.85, s * 0.25, s * 0.7, s * 0.35, s * 0.55, s * 0.35);
    // 下颌
    ctx.bezierCurveTo(s * 0.45, s * 0.7, -s * 0.2, s * 0.85, -s * 0.55, s * 0.55);
    // 下颌后缘 -> 后脑
    ctx.bezierCurveTo(-s * 0.8, s * 0.4, -s * 0.95, s * 0.15, -s * 0.85, -s * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 只画一个眼窝（近眼）
    ctx.fillStyle = p.hole;
    ctx.beginPath();
    ctx.ellipse(s * 0.35, -s * 0.2, s * 0.2, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    // 耳道孔
    ctx.beginPath();
    ctx.ellipse(-s * 0.4, -s * 0.1, s * 0.07, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鼻骨凸起线
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(s * 0.6, -s * 0.35);
    ctx.lineTo(s * 0.85, s * 0.0);
    ctx.stroke();

    // 侧面牙列
    ctx.strokeStyle = 'rgba(25,18,12,0.6)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const tx = s * 0.15 + i * s * 0.12;
        ctx.moveTo(tx, s * 0.38);
        ctx.lineTo(tx, s * 0.52);
    }
    ctx.stroke();

    ctx.restore();
    drawWeatherSpots(ctx, seed, s * 0.75, p);
}

// ---------------- 头骨：后脑 ----------------
function drawSkullBack(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.25, -ly * s * 0.25, s * 0.85, s * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createRadialGradient(-lx * s * 0.3, -ly * s * 0.3, s * 0.1, 0, 0, s * 1.0);
    grad.addColorStop(0, p.light);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;

    // 后脑勺椭圆
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.15, s * 0.78, s * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 枕骨粗隆（小凸起阴影）
    ctx.fillStyle = p.outline;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.1, s * 0.25, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // 矢状缝
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.0);
    ctx.lineTo(0, s * 0.3);
    ctx.stroke();

    // 人字缝
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, s * 0.0);
    ctx.lineTo(0, s * 0.25);
    ctx.lineTo(s * 0.55, s * 0.0);
    ctx.stroke();

    // 枕骨大孔（连接脊柱的位置）
    ctx.fillStyle = p.hole;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.55, s * 0.18, s * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    // 几节颈椎贴着
    ctx.fillStyle = p.base;
    for (let i = 0; i < 2; i++) {
        const vy = s * 0.75 + i * s * 0.25;
        ctx.beginPath();
        ctx.ellipse(0, vy, s * 0.2, s * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = p.outline;
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    drawWeatherSpots(ctx, seed, s * 0.7, p);
}

// ---------------- 头骨：无下颌 ----------------
function drawSkullJawless(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.25, -ly * s * 0.25, s * 0.85, s * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(lx * s, ly * s, -lx * s, -ly * s);
    grad.addColorStop(0, p.light);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;

    // 上颅骨（没有下颌部分）
    ctx.beginPath();
    ctx.moveTo(-s * 0.78, -s * 0.1);
    ctx.bezierCurveTo(-s * 0.95, -s * 1.05, s * 0.95, -s * 1.05, s * 0.78, -s * 0.1);
    // 上颌（只到牙龈线）
    ctx.lineTo(s * 0.7, s * 0.15);
    ctx.bezierCurveTo(s * 0.55, s * 0.4, -s * 0.55, s * 0.4, -s * 0.7, s * 0.15);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 断裂边缘（下颌铰链断口，两侧小凹痕）
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-s * 0.58, s * 0.3, s * 0.08, s * 0.05, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.58, s * 0.3, s * 0.08, s * 0.05, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // 眼窝
    ctx.fillStyle = p.hole;
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.15, s * 0.22, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.3, -s * 0.15, s * 0.22, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鼻腔
    ctx.beginPath();
    ctx.moveTo(0, s * 0.05);
    ctx.lineTo(-s * 0.11, s * 0.3);
    ctx.lineTo(s * 0.11, s * 0.3);
    ctx.closePath();
    ctx.fill();

    // 上排牙齿（露出）
    ctx.strokeStyle = 'rgba(25,18,12,0.65)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
        const tx = i * s * 0.1;
        ctx.moveTo(tx, s * 0.28);
        ctx.lineTo(tx, s * 0.42);
    }
    ctx.stroke();

    drawWeatherSpots(ctx, seed, s * 0.65, p);
}

// ---------------- 头骨：下颌错位 ----------------
function drawSkullJawDislocated(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.25, -ly * s * 0.25 + s * 0.15, s * 0.95, s * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(lx * s, ly * s, -lx * s, -ly * s);
    grad.addColorStop(0, p.light);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;

    // 上颅骨（同 jawless）
    ctx.beginPath();
    ctx.moveTo(-s * 0.78, -s * 0.1);
    ctx.bezierCurveTo(-s * 0.95, -s * 1.05, s * 0.95, -s * 1.05, s * 0.78, -s * 0.1);
    ctx.lineTo(s * 0.7, s * 0.15);
    ctx.bezierCurveTo(s * 0.55, s * 0.4, -s * 0.55, s * 0.4, -s * 0.7, s * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 眼窝 & 鼻腔
    ctx.fillStyle = p.hole;
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.15, s * 0.22, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.3, -s * 0.15, s * 0.22, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, s * 0.05);
    ctx.lineTo(-s * 0.11, s * 0.3);
    ctx.lineTo(s * 0.11, s * 0.3);
    ctx.closePath();
    ctx.fill();

    // 错位的下颌骨（偏移 + 旋转）
    ctx.save();
    const offX = (seedRand(seed, 4.4) - 0.5) * s * 0.5;
    const offY = s * 0.35 + seedRand(seed, 4.5) * s * 0.2;
    const rotJ = (seedRand(seed, 4.6) - 0.5) * 0.8;
    ctx.translate(offX, offY);
    ctx.rotate(rotJ);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, -s * 0.1);
    ctx.bezierCurveTo(-s * 0.55, s * 0.4, s * 0.55, s * 0.4, s * 0.6, -s * 0.1);
    ctx.bezierCurveTo(s * 0.45, -s * 0.05, -s * 0.45, -s * 0.05, -s * 0.6, -s * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // 下颌牙齿
    ctx.strokeStyle = 'rgba(25,18,12,0.6)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
        const tx = i * s * 0.1;
        ctx.moveTo(tx, -s * 0.08);
        ctx.lineTo(tx, s * 0.06);
    }
    ctx.stroke();
    ctx.restore();

    drawWeatherSpots(ctx, seed, s * 0.7, p);
}

// ---------------- 胸廓 ----------------
function drawRibcage(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    // 底衬
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.25, -ly * s * 0.25, s * 0.75, s * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // 脊柱
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = s * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.05);
    ctx.lineTo(0, s * 1.05);
    ctx.stroke();

    // 胸骨（中线前方一条稍粗的短骨）
    ctx.strokeStyle = p.base;
    ctx.lineWidth = s * 0.14;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5);
    ctx.lineTo(0, s * 0.2);
    ctx.stroke();

    // 肋骨对：左右各 5~6 对弧形
    const nRibs = 5 + Math.floor(seedRand(seed, 5.6) * 2);
    ctx.strokeStyle = p.base;
    ctx.lineWidth = s * 0.08;
    ctx.lineCap = 'round';
    for (let i = 0; i < nRibs; i++) {
        const t = i / (nRibs - 1);
        const ribY = -s * 0.85 + t * s * 1.5;
        const spread = s * (0.35 + t * 0.5); // 越往下越宽
        const curveUp = s * 0.15;
        // 左肋
        ctx.beginPath();
        ctx.moveTo(0, ribY);
        ctx.quadraticCurveTo(-spread * 0.7, ribY + curveUp, -spread, ribY + s * 0.1);
        ctx.stroke();
        // 右肋
        ctx.beginPath();
        ctx.moveTo(0, ribY);
        ctx.quadraticCurveTo(spread * 0.7, ribY + curveUp, spread, ribY + s * 0.1);
        ctx.stroke();
    }

    // 描一下暗侧
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = s * 0.04;
    for (let i = 0; i < nRibs; i++) {
        const t = i / (nRibs - 1);
        const ribY = -s * 0.85 + t * s * 1.5;
        const spread = s * (0.35 + t * 0.5);
        const curveUp = s * 0.15;
        const sideSign = lx > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(0, ribY);
        ctx.quadraticCurveTo(sideSign * spread * 0.7, ribY + curveUp, sideSign * spread, ribY + s * 0.1);
        ctx.stroke();
    }

    drawWeatherSpots(ctx, seed, s * 0.9, p);
}

// ---------------- 盆骨 ----------------
function drawPelvis(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.25, -ly * s * 0.25 + s * 0.1, s * 1.15, s * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(lx * s, ly * s, -lx * s, -ly * s);
    grad.addColorStop(0, p.light);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;

    // 蝴蝶形状：两个髂翼 + 中间骶骨
    // 左髂翼
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, -s * 0.3);
    ctx.bezierCurveTo(-s * 0.9, -s * 0.4, -s * 1.1, s * 0.1, -s * 0.8, s * 0.4);
    ctx.bezierCurveTo(-s * 0.6, s * 0.55, -s * 0.3, s * 0.4, -s * 0.18, s * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 右髂翼
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(s * 0.15, -s * 0.3);
    ctx.bezierCurveTo(s * 0.9, -s * 0.4, s * 1.1, s * 0.1, s * 0.8, s * 0.4);
    ctx.bezierCurveTo(s * 0.6, s * 0.55, s * 0.3, s * 0.4, s * 0.18, s * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 中央骶骨
    ctx.fillStyle = p.base;
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 0.3);
    ctx.lineTo(s * 0.18, -s * 0.3);
    ctx.lineTo(s * 0.12, s * 0.25);
    ctx.lineTo(-s * 0.12, s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 闭孔（两侧大洞）
    ctx.fillStyle = p.hole;
    ctx.beginPath();
    ctx.ellipse(-s * 0.55, s * 0.2, s * 0.18, s * 0.15, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.55, s * 0.2, s * 0.18, s * 0.15, -0.2, 0, Math.PI * 2);
    ctx.fill();

    drawWeatherSpots(ctx, seed, s * 0.9, p);
}

// ---------------- 长骨（股骨） ----------------
function drawFemur(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.2, -ly * s * 0.2, s * 0.35, s * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(lx * s * 0.3, 0, -lx * s * 0.3, 0);
    grad.addColorStop(0, p.light);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;

    // 骨干（竖向的胶囊形）
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.15, s * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // 近端关节头（球状）
    ctx.beginPath();
    ctx.arc(-s * 0.1, -s * 1.1, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // 大转子（近端外侧凸起）
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(s * 0.15, -s * 1.0, s * 0.12, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 远端双髁（关节）
    ctx.beginPath();
    ctx.ellipse(-s * 0.1, s * 1.1, s * 0.18, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(s * 0.12, s * 1.1, s * 0.18, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 骨干描边
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.15, s * 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();

    drawWeatherSpots(ctx, seed, s * 0.5, p);
}

// ---------------- 零散肋骨 ----------------
function drawRibLoose(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.2, -ly * s * 0.2, s * 0.8, s * 0.4, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // 画 2~3 根弧形肋骨错落
    const nBones = 2 + Math.floor(seedRand(seed, 6.1) * 2);
    ctx.strokeStyle = p.base;
    ctx.lineWidth = s * 0.1;
    ctx.lineCap = 'round';
    for (let i = 0; i < nBones; i++) {
        const off = (i - (nBones - 1) / 2) * s * 0.25;
        const rot = (seedRand(seed, 6.5 + i) - 0.5) * 0.6;
        ctx.save();
        ctx.translate(off, off * 0.3);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, s * 0.1);
        ctx.quadraticCurveTo(0, -s * 0.3, s * 0.7, s * 0.1);
        ctx.stroke();
        // 端点小膨大
        ctx.fillStyle = p.base;
        ctx.beginPath();
        ctx.arc(-s * 0.7, s * 0.1, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.7, s * 0.1, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ---------------- 脊椎节 ----------------
function drawVertebra(ctx: CanvasRenderingContext2D, s: number, seed: number, p: Palette, lx: number, ly: number) {
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(-lx * s * 0.2, -ly * s * 0.2, s * 0.7, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createRadialGradient(-lx * s * 0.2, -ly * s * 0.2, s * 0.05, 0, 0, s * 0.6);
    grad.addColorStop(0, p.light);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;

    // 椎体（中心圆盘）
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // 椎孔（中心小孔）
    ctx.fillStyle = p.hole;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // 两侧横突
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(-s * 0.55, s * 0.0, s * 0.18, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(s * 0.55, s * 0.0, s * 0.18, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 后方棘突
    ctx.beginPath();
    ctx.ellipse(0, s * 0.48, s * 0.1, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}
