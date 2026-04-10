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
