// 悬浮尘埃系统
// 尘埃是永久存在的环境元素，不使用粒子生命周期
// 基于世界坐标的确定性伪随机采样，只绘制视口内的尘埃
// 两层渲染：暗色层（光照前，移动参照物）+ 亮色层（光照后，手电散射）

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

// ============ 配置接口 ============
// 从 CONFIG.dust 读取，运行时可通过 GM 面板调整

function getDustConfig() {
    const d = (CONFIG as any).dust;
    if (!d) return null;
    return d as {
        enabled: boolean;
        density: number;
        cellSize: number;
        baseSize: number;
        sizeVariation: number;
        driftSpeed: number;
        driftAmplitude: number;
        baseAlpha: number;
        litAlpha: number;
        litRadius: number;
        litFalloff: number;
        flashlightBoost: number;
        depthDensityScale: number;
        depthDensityStart: number;
    };
}

// ============ 伪随机哈希 ============
// 用世界坐标格子确定性生成尘埃位置，不需要存储

function hash(x: number, y: number): number {
    // 简单但足够好的整数哈希
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return h;
}

function hashFloat(x: number, y: number, seed: number): number {
    // 返回 0~1 的伪随机浮点数
    let h = hash(x * 31 + seed, y * 37 + seed * 7);
    return (h & 0x7fffffff) / 0x7fffffff;
}

// ============ 尘埃漂移状态 ============
// 用全局时间驱动，不需要逐粒子存储

let _globalTime = 0;

export function updateDustTime(dt: number) {
    _globalTime += dt;
}

// ============ 渲染：暗色尘埃层（光照前绘制） ============
// 作为移动参照物，微弱可见

export function drawDustDarkLayer(
    ctx: CanvasRenderingContext2D,
    viewL: number, viewR: number, viewT: number, viewB: number,
    zoom: number
) {
    const cfg = getDustConfig();
    if (!cfg || !cfg.enabled) return;

    const cellSize = cfg.cellSize;
    const density = cfg.density;
    const baseSize = cfg.baseSize;
    const sizeVar = cfg.sizeVariation;
    const driftSpeed = cfg.driftSpeed;
    const driftAmp = cfg.driftAmplitude;
    const baseAlpha = cfg.baseAlpha;

    // 深度密度缩放：越深尘埃越多
    const depthFactor = getDepthDensityFactor(cfg);
    const effectiveDensity = Math.ceil(density * depthFactor);
    if (effectiveDensity <= 0) return;

    // 遍历视口内的格子
    const startCellX = Math.floor(viewL / cellSize);
    const endCellX = Math.floor(viewR / cellSize);
    const startCellY = Math.floor(viewT / cellSize);
    const endCellY = Math.floor(viewB / cellSize);

    const t = _globalTime;

    for (let cy = startCellY; cy <= endCellY; cy++) {
        for (let cx = startCellX; cx <= endCellX; cx++) {
            // 每个格子内生成 effectiveDensity 个尘埃
            for (let i = 0; i < effectiveDensity; i++) {
                // 确定性位置
                const px = cx * cellSize + hashFloat(cx, cy, i * 3 + 1) * cellSize;
                const py = cy * cellSize + hashFloat(cx, cy, i * 3 + 2) * cellSize;

                // 检查是否在岩石内部（简单检查，避免尘埃出现在墙里）
                if (isInsideWall(px, py)) continue;

                // 布朗运动漂移
                const driftSeed = hash(cx * 100 + i, cy * 100 + i);
                const driftPhaseX = (driftSeed & 0xff) / 255 * Math.PI * 2;
                const driftPhaseY = ((driftSeed >> 8) & 0xff) / 255 * Math.PI * 2;
                const dx = Math.sin(t * driftSpeed + driftPhaseX) * driftAmp
                         + Math.sin(t * driftSpeed * 0.7 + driftPhaseX * 1.3) * driftAmp * 0.5;
                const dy = Math.cos(t * driftSpeed * 0.8 + driftPhaseY) * driftAmp
                         + Math.cos(t * driftSpeed * 0.5 + driftPhaseY * 1.7) * driftAmp * 0.5;

                const finalX = px + dx;
                const finalY = py + dy;

                // 尘埃大小
                const size = baseSize + hashFloat(cx, cy, i * 3 + 100) * sizeVar;

                // 暗色层：微弱灰白色，刚好能感知到
                const alpha = baseAlpha * (0.6 + hashFloat(cx, cy, i * 3 + 200) * 0.4);
                if (alpha < 0.003) continue;

                ctx.fillStyle = `rgba(180, 190, 200, ${alpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(finalX, finalY, size / zoom, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

// ============ 渲染：亮色尘埃层（光照后绘制） ============
// 被手电照到的尘埃会发光散射

export function drawDustLitLayer(
    ctx: CanvasRenderingContext2D,
    viewL: number, viewR: number, viewT: number, viewB: number,
    zoom: number,
    flashlightActive: boolean
) {
    const cfg = getDustConfig();
    if (!cfg || !cfg.enabled) return;
    if (!flashlightActive) return; // 没有手电就没有亮色尘埃

    const cellSize = cfg.cellSize;
    const density = cfg.density;
    const baseSize = cfg.baseSize;
    const sizeVar = cfg.sizeVariation;
    const driftSpeed = cfg.driftSpeed;
    const driftAmp = cfg.driftAmplitude;
    const litAlpha = cfg.litAlpha;
    const litRadius = cfg.litRadius;
    const litFalloff = cfg.litFalloff;
    const flashBoost = cfg.flashlightBoost;

    const depthFactor = getDepthDensityFactor(cfg);
    const effectiveDensity = Math.ceil(density * depthFactor);
    if (effectiveDensity <= 0) return;

    // 手电参数
    const fovRad = CONFIG.fov * Math.PI / 180;
    const halfFov = fovRad / 2;
    const maxDist = CONFIG.lightRange;

    const startCellX = Math.floor(viewL / cellSize);
    const endCellX = Math.floor(viewR / cellSize);
    const startCellY = Math.floor(viewT / cellSize);
    const endCellY = Math.floor(viewB / cellSize);

    const t = _globalTime;
    const pAngle = player.angle;

    for (let cy = startCellY; cy <= endCellY; cy++) {
        for (let cx = startCellX; cx <= endCellX; cx++) {
            for (let i = 0; i < effectiveDensity; i++) {
                const px = cx * cellSize + hashFloat(cx, cy, i * 3 + 1) * cellSize;
                const py = cy * cellSize + hashFloat(cx, cy, i * 3 + 2) * cellSize;

                if (isInsideWall(px, py)) continue;

                // 布朗运动漂移（与暗色层完全一致）
                const driftSeed = hash(cx * 100 + i, cy * 100 + i);
                const driftPhaseX = (driftSeed & 0xff) / 255 * Math.PI * 2;
                const driftPhaseY = ((driftSeed >> 8) & 0xff) / 255 * Math.PI * 2;
                const dx = Math.sin(t * driftSpeed + driftPhaseX) * driftAmp
                         + Math.sin(t * driftSpeed * 0.7 + driftPhaseX * 1.3) * driftAmp * 0.5;
                const dy = Math.cos(t * driftSpeed * 0.8 + driftPhaseY) * driftAmp
                         + Math.cos(t * driftSpeed * 0.5 + driftPhaseY * 1.7) * driftAmp * 0.5;

                const finalX = px + dx;
                const finalY = py + dy;

                // 计算与玩家的距离和角度
                const relX = finalX - player.x;
                const relY = finalY - player.y;
                const dist = Math.sqrt(relX * relX + relY * relY);

                if (dist > maxDist * 1.1) continue; // 超出手电范围

                // 检查是否在手电光锥内
                let angleToMote = Math.atan2(relY, relX);
                let angleDiff = angleToMote - pAngle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                const absAngleDiff = Math.abs(angleDiff);
                if (absAngleDiff > halfFov * 1.2) continue; // 不在光锥范围

                // 距离衰减
                const distRatio = dist / maxDist;
                const distFade = 1 - distRatio * distRatio; // 平方衰减
                if (distFade <= 0) continue;

                // 角度衰减（光锥边缘渐变）
                let angleFade = 1.0;
                if (absAngleDiff > halfFov * 0.7) {
                    angleFade = 1 - (absAngleDiff - halfFov * 0.7) / (halfFov * 0.5);
                    angleFade = Math.max(0, angleFade);
                }

                // 综合亮度
                const brightness = distFade * angleFade * flashBoost;
                if (brightness < 0.01) continue;

                // 尘埃大小（被照亮时略大）
                const size = (baseSize + hashFloat(cx, cy, i * 3 + 100) * sizeVar) * (1 + brightness * 0.5);

                // 亮色：暖白色散射光
                const alpha = litAlpha * brightness * (0.7 + hashFloat(cx, cy, i * 3 + 200) * 0.3);
                if (alpha < 0.005) continue;

                // 散射光晕（较大的柔和光圈）
                const glowSize = size * litRadius / zoom;
                const glowAlpha = alpha * litFalloff;
                if (glowAlpha > 0.005) {
                    ctx.fillStyle = `rgba(255, 250, 220, ${glowAlpha.toFixed(3)})`;
                    ctx.beginPath();
                    ctx.arc(finalX, finalY, glowSize, 0, Math.PI * 2);
                    ctx.fill();
                }

                // 尘埃核心亮点
                ctx.fillStyle = `rgba(255, 253, 240, ${Math.min(alpha, 0.8).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(finalX, finalY, size / zoom, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

// ============ 辅助函数 ============

function getDepthDensityFactor(cfg: { depthDensityScale: number; depthDensityStart: number }): number {
    // 浅水区尘埃少，深水区尘埃多
    const depth = player.y;
    if (depth < cfg.depthDensityStart) {
        return 0.3; // 浅水区保留少量尘埃
    }
    const depthRatio = Math.min(1, (depth - cfg.depthDensityStart) / 3000);
    return 0.3 + depthRatio * (cfg.depthDensityScale - 0.3);
}

function isInsideWall(x: number, y: number): boolean {
    // 严格检查：该位置是否在岩石内部或岩石渲染范围内
    // 尘埃必须完全在水中，不能出现在任何岩石的视觉范围内
    const isMazeMode = state.screen === 'mazeRescue' && state.mazeRescue;
    const map = isMazeMode ? state.mazeRescue.mazeMap : state.map;
    const ts = isMazeMode ? state.mazeRescue.mazeTileSize : CONFIG.tileSize;
    const rows = isMazeMode ? state.mazeRescue.mazeRows : CONFIG.rows;
    const cols = isMazeMode ? state.mazeRescue.mazeCols : CONFIG.cols;

    const r = Math.floor(y / ts);
    const c = Math.floor(x / ts);

    // 地图外视为墙内
    if (r < 0 || r >= rows || c < 0 || c >= cols) return true;

    // 当前格子是实体墙
    if (map[r] && map[r][c] === 2) return true;

    // 检查当前格子及相邻格子的圆形 wall 对象
    // 需要检查周围 3x3 范围，因为圆形 wall 可能跨格子覆盖
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (!map[nr]) continue;
            const cell = map[nr][nc];
            if (!cell) continue;
            if (cell === 2) {
                // 实体墙格子：检查点是否在格子范围内（含少量边距）
                const cellCx = nc * ts + ts / 2;
                const cellCy = nr * ts + ts / 2;
                const dist = Math.sqrt((x - cellCx) * (x - cellCx) + (y - cellCy) * (y - cellCy));
                if (dist < ts * 0.6) return true;
            } else if (typeof cell === 'object') {
                // 圆形墙体：检查是否在圆的渲染范围内
                // 使用 cell.r（不缩小），确保尘埃不会出现在岩石视觉边缘
                const dist = Math.sqrt((x - cell.x) * (x - cell.x) + (y - cell.y) * (y - cell.y));
                if (dist < cell.r) return true;
                // 同时检查额外装饰圆（迷宫模式的 extras）
                if (cell.extras) {
                    for (const extra of cell.extras) {
                        const eDist = Math.sqrt((x - extra.x) * (x - extra.x) + (y - extra.y) * (y - extra.y));
                        if (eDist < extra.r) return true;
                    }
                }
            }
        }
    }
    return false;
}
