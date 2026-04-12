import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

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
}

/**
 * 自适应相机远近系统：
 * - 空旷区域 → 相机拉远（zoom 变小），看到更多环境
 * - 狭窄拥挤区域 → 相机拉近（zoom 变大），增强压迫感
 *
 * 原理：向玩家周围 8 个方向发射射线，统计平均可达距离。
 * 距离越远说明越空旷，距离越近说明越狭窄。
 */
export function updateCameraAdaptiveZoom() {
    const cam = state.camera;
    const cfg = CONFIG.camera;

    // 如果没有启用自适应 zoom，直接返回
    if (!cfg.adaptiveZoomEnabled) return;

    // 判断当前模式使用哪套地图数据
    const isMaze = state.screen === 'mazeRescue' && state.mazeRescue && state.mazeRescue.phase === 'play';
    const isMainline = state.screen === 'play';
    const isArena = state.screen === 'fishArena';

    if (!isMaze && !isMainline && !isArena) return;

    // 获取地图数据和 tileSize
    let map: any;
    let tileSize: number;
    if (isMaze) {
        map = state.mazeRescue.mazeMap;
        tileSize = state.mazeRescue.mazeTileSize || CONFIG.maze.tileSize;
    } else {
        map = state.map;
        tileSize = CONFIG.tileSize;
    }
    if (!map) return;

    // 向 8 个方向发射射线，统计平均可达距离
    const maxProbe = cfg.adaptiveZoomProbeRange;
    const step = tileSize * 0.5; // 每步半个格子
    const dirs = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]
    ];

    let totalDist = 0;
    for (const [dx, dy] of dirs) {
        let dist = 0;
        for (let d = step; d <= maxProbe; d += step) {
            const px = player.x + dx * d;
            const py = player.y + dy * d;
            const r = Math.floor(py / tileSize);
            const c = Math.floor(px / tileSize);
            if (!map[r] || !map[r][c]) {
                // 超出地图边界视为墙
                if (r < 0 || c < 0 || (map.length > 0 && r >= map.length)) break;
                // 空格子，继续
                dist = d;
                continue;
            }
            const cell = map[r][c];
            if (cell === 0 || cell === false) {
                dist = d;
                continue;
            }
            // 碰到墙体
            if (typeof cell === 'object') {
                const wallDist = Math.hypot(px - cell.x, py - cell.y) - cell.r;
                if (wallDist < 0) break;
                dist = d;
            } else {
                break;
            }
        }
        totalDist += dist;
    }

    const avgDist = totalDist / dirs.length;

    // 将平均距离映射到 zoom 值
    // avgDist 小（狭窄）→ zoom 大（拉近）
    // avgDist 大（空旷）→ zoom 小（拉远）
    const t = Math.min(1, Math.max(0, (avgDist - cfg.adaptiveZoomNearDist) / (cfg.adaptiveZoomFarDist - cfg.adaptiveZoomNearDist)));
    // t=0 → 狭窄 → zoomNear, t=1 → 空旷 → zoomFar
    const targetAdaptiveZoom = cfg.adaptiveZoomNear + (cfg.adaptiveZoomFar - cfg.adaptiveZoomNear) * t;

    // 平滑过渡
    cam.targetZoom += (targetAdaptiveZoom - cam.targetZoom) * cfg.adaptiveZoomSpeed;
    cam.zoom += (cam.targetZoom - cam.zoom) * cfg.adaptiveZoomSpeed;
}
