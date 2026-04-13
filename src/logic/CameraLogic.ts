import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

// === 自适应缩放运行态（模块内部状态，不挂全局state） ===
let _azFrameCounter = 0;       // 帧计数器，用于降频更新
let _azOpenness = 0.5;         // 当前空间开阔度（0=极狭窄，1=极空旷）
let _azTargetZoom = 1.0;       // 自适应缩放计算出的目标zoom
let _azCurrentZoom = 1.0;      // 自适应缩放当前平滑后的zoom值

/**
 * 重置自适应缩放运行态（模式切换/重置时调用）。
 */
export function resetAdaptiveZoom() {
    _azFrameCounter = 0;
    _azOpenness = 0.5;
    _azTargetZoom = 1.0;
    _azCurrentZoom = 1.0;
}

/**
 * 获取当前自适应缩放的zoom值（供外部读取）。
 */
export function getAdaptiveZoom(): number {
    return _azCurrentZoom;
}

/**
 * 获取当前空间开阔度（供调试显示）。
 */
export function getOpenness(): number {
    return _azOpenness;
}

/**
 * 多方向射线空间检测。
 * 从指定位置向周围发射均匀分布的射线，检测每个方向到最近墙体的距离。
 * 支持主线/竞技场（用state.map）和迷宫模式（用maze数据）。
 */
function castSpaceRays(px: number, py: number): number[] {
    const cfg = CONFIG.camera;
    const rayCount = cfg.azRayCount;
    const maxDist = cfg.azMaxRayDist;
    const step = cfg.azRayStep;
    const distances: number[] = [];

    // 判断当前是迷宫模式还是主线/竞技场模式
    const isMaze = state.screen === 'mazeRescue' && state.mazeRescue;
    const map = isMaze ? state.mazeRescue!.mazeMap : state.map;
    const tileSize = isMaze ? state.mazeRescue!.mazeTileSize : CONFIG.tileSize;

    for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        let hitDist = maxDist;

        // 沿射线步进检测
        for (let d = step; d <= maxDist; d += step) {
            const sx = px + dirX * d;
            const sy = py + dirY * d;
            const r = Math.floor(sy / tileSize);
            const c = Math.floor(sx / tileSize);

            // 越界视为墙
            if (!map[r] || map[r][c] === undefined) {
                hitDist = d;
                break;
            }

            const cell = map[r][c];
            if (!cell) continue; // 空格子，继续

            if (typeof cell === 'object') {
                // 圆形墙体：检测点到圆心距离
                const dist = Math.hypot(sx - cell.x, sy - cell.y);
                if (dist < cell.r) {
                    hitDist = d;
                    break;
                }
                // 迷宫模式额外装饰圆
                if (isMaze && cell.extras) {
                    let hitExtra = false;
                    for (const extra of cell.extras) {
                        if (Math.hypot(sx - extra.x, sy - extra.y) < extra.r) {
                            hitExtra = true;
                            break;
                        }
                    }
                    if (hitExtra) {
                        hitDist = d;
                        break;
                    }
                }
            } else if (cell === 2) {
                // 实体格子
                hitDist = d;
                break;
            }
        }

        distances.push(hitDist);
    }

    return distances;
}

/**
 * 根据射线距离计算空间开阔度指标（0~1）。
 * 0 = 极狭窄，1 = 极空旷。
 */
function computeOpenness(distances: number[]): number {
    if (distances.length === 0) return 0.5;

    const cfg = CONFIG.camera;
    const narrowDist = cfg.azNarrowDist;
    const wideDist = cfg.azWideDist;

    // 计算加权平均距离（去掉最大和最小各一个，减少极端值影响）
    const sorted = [...distances].sort((a, b) => a - b);
    let sum = 0;
    let count = 0;
    const trimCount = Math.max(1, Math.floor(sorted.length * 0.1));
    for (let i = trimCount; i < sorted.length - trimCount; i++) {
        sum += sorted[i];
        count++;
    }
    const avgDist = count > 0 ? sum / count : sorted[Math.floor(sorted.length / 2)];

    // 线性映射到 0~1
    if (avgDist <= narrowDist) return 0;
    if (avgDist >= wideDist) return 1;
    return (avgDist - narrowDist) / (wideDist - narrowDist);
}

/**
 * 将开阔度映射到目标zoom值。
 * 使用 smoothstep 曲线让过渡更自然。
 */
function opennessToZoom(openness: number): number {
    const cfg = CONFIG.camera;
    // smoothstep 让中间区域变化更平缓，两端更敏感
    const t = openness * openness * (3 - 2 * openness);
    return cfg.azZoomNarrow + (cfg.azZoomWide - cfg.azZoomNarrow) * t;
}

/**
 * 更新自适应缩放（每帧调用，内部自行降频）。
 * 返回当前自适应缩放的zoom值。
 */
export function updateAdaptiveZoom(): number {
    const cfg = CONFIG.camera;

    if (!cfg.adaptiveZoom) {
        _azCurrentZoom = 1.0;
        return _azCurrentZoom;
    }

    // 降频更新射线检测
    _azFrameCounter++;
    if (_azFrameCounter >= cfg.azUpdateInterval) {
        _azFrameCounter = 0;

        // 执行射线检测
        const distances = castSpaceRays(player.x, player.y);

        // 计算开阔度
        const newOpenness = computeOpenness(distances);

        // 平滑开阔度（避免突变）
        _azOpenness += (newOpenness - _azOpenness) * 0.15;

        // 映射到目标zoom
        _azTargetZoom = opennessToZoom(_azOpenness);
    }

    // 每帧平滑过渡zoom值
    _azCurrentZoom += (_azTargetZoom - _azCurrentZoom) * cfg.azSmoothSpeed;

    return _azCurrentZoom;
}

/**
 * 更新相机弹簧臂跟随和水中摇曳。
 * 所有模式（主线/竞技场/迷宫）共用此函数。
 * 相机目标 = 玩家位置 + 前瞻偏移，实际位置通过弹簧阻尼追踪目标。
 * 水中摇曳用多频正弦叠加，幅度很小，只增加漂浮感。
 */
export function updateCameraSpringArm() {
    const cam = state.camera;
    const cfg = CONFIG.camera;

    // 1. 计算前瞻偏移：速度越快，相机越偏向前进方向
    const speed = Math.hypot(player.vx, player.vy);
    let lookAheadX = 0;
    let lookAheadY = 0;
    if (speed > 0.5) {
        const normVx = player.vx / speed;
        const normVy = player.vy / speed;
        const lookDist = Math.min(cfg.lookAheadDistance, speed * cfg.lookAheadVelocityScale);
        lookAheadX = normVx * lookDist;
        lookAheadY = normVy * lookDist;
    }

    // 2. 目标位置 = 玩家位置 + 前瞻
    cam.targetX = player.x + lookAheadX;
    cam.targetY = player.y + lookAheadY;

    // 3. 弹簧臂跟随：用刚度和阻尼驱动相机速度
    const dx = cam.targetX - cam.x;
    const dy = cam.targetY - cam.y;
    // 弹簧力 = 偏差 * 刚度
    cam.vx += dx * cfg.followStiffness;
    cam.vy += dy * cfg.followStiffness;
    // 阻尼
    cam.vx *= cfg.followDamping;
    cam.vy *= cfg.followDamping;
    // 更新位置
    cam.x += cam.vx;
    cam.y += cam.vy;

    // 4. 水中摇曳：多频正弦叠加
    cam.swayTime += 1 / 60;
    const t = cam.swayTime;
    cam.swayX = Math.sin(t * cfg.swayFrequencyA * Math.PI * 2) * cfg.swayAmplitude
              + Math.sin(t * cfg.swayFrequencyB * Math.PI * 2 + 1.3) * cfg.swayAmplitude * 0.6;
    cam.swayY = Math.cos(t * cfg.swayFrequencyA * Math.PI * 2 + 0.7) * cfg.swayAmplitude * 0.8
              + Math.cos(t * cfg.swayFrequencyB * Math.PI * 2 + 2.1) * cfg.swayAmplitude * 0.5;

    // 5. 自适应缩放
    updateAdaptiveZoom();
}

/**
 * 将相机快速归位到玩家位置（模式切换/重置时调用）。
 */
export function snapCameraToPlayer() {
    const cam = state.camera;
    cam.x = player.x;
    cam.y = player.y;
    cam.targetX = player.x;
    cam.targetY = player.y;
    cam.vx = 0;
    cam.vy = 0;
    cam.swayX = 0;
    cam.swayY = 0;
    cam.swayTime = 0;
    resetAdaptiveZoom();
}
