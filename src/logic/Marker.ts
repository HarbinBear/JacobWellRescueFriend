import { CONFIG } from '../core/config';
import { state, player, input } from '../core/state';
import { findNearestWall } from './Rope';
import { pathLength, samplePolyline } from './Pathfinding';

// ============ 类型定义 ============

export type MarkerType = 'danger' | 'unknown' | 'safe';
export type MarkerAttach = 'wall' | 'rope';

export interface Marker {
    id: number;
    type: MarkerType;
    attachType: MarkerAttach;
    // 岩石标记
    wallX?: number;
    wallY?: number;
    wallR?: number;
    surfaceX?: number;
    surfaceY?: number;
    normalAngle?: number;
    // 绳索标记
    ropeIndex?: number;
    ropeT?: number;          // 绳索路径上的参数位置（0~1）
    // 动画
    placeTimer: number;      // 放置动画剩余帧数（0=动画完成）
    removeTimer: number;     // 拆除动画剩余帧数（0=未在拆除，>0=正在拆除）
}

// 轮盘扇区动作类型
export type WheelAction =
    | 'startRope'    // 开始铺绳
    | 'endRope'      // 结束铺绳
    | 'removeRope'   // 拆除绳索
    | 'markDanger'   // 放红叉标记
    | 'markUnknown'  // 放黄问号标记
    | 'markSafe'     // 放绿圈标记
    | 'removeMarker'; // 拆除标记

export interface WheelSector {
    action: WheelAction;
    label: string;
    startAngle: number;  // 扇区起始角度（弧度）
    endAngle: number;    // 扇区结束角度（弧度）
}

// 上下文类型
export type WheelContext =
    | 'emptyWall'       // 靠近空岩石（无绳索、无标记）
    | 'ropeEndWall'     // 靠近已完成绳索的端点岩石
    | 'ropingWall'      // 正在铺绳中，靠近新岩石
    | 'markedWall'      // 靠近已有标记的岩石
    | 'ropeMid'         // 靠近绳索中段
    | 'ropeMarkedMid'   // 靠近绳索中段已有标记
    | 'none';           // 不在任何可交互对象附近

// ============ 全局标记 ID 计数器 ============
let _nextMarkerId = 1;

// ============ 标记列表（挂在 state 上，这里提供操作函数） ============

/** 获取当前标记列表 */
export function getMarkers(): Marker[] {
    return state.markers || [];
}

/** 在岩石上放置标记 */
export function placeWallMarker(type: MarkerType, wall: any): Marker | null {
    if (!wall) return null;
    const angle = Math.atan2(player.y - wall.y, player.x - wall.x);
    const surfaceX = wall.x + Math.cos(angle) * wall.r;
    const surfaceY = wall.y + Math.sin(angle) * wall.r;

    // 检查该岩石上是否已有标记，如果有则替换
    const markers = getMarkers();
    const existing = markers.findIndex(m =>
        m.attachType === 'wall' && m.wallX === wall.x && m.wallY === wall.y
    );
    if (existing >= 0) {
        markers.splice(existing, 1);
    }

    const marker: Marker = {
        id: _nextMarkerId++,
        type,
        attachType: 'wall',
        wallX: wall.x,
        wallY: wall.y,
        wallR: wall.r,
        surfaceX,
        surfaceY,
        normalAngle: angle,
        placeTimer: CONFIG.marker.placeAnimDuration,
        removeTimer: 0,
    };
    markers.push(marker);
    return marker;
}

/** 在绳索上放置标记 */
export function placeRopeMarker(type: MarkerType, ropeIndex: number, ropeT: number): Marker | null {
    const markers = getMarkers();
    // 检查该绳索同一位置附近是否已有标记
    const existing = markers.findIndex(m =>
        m.attachType === 'rope' && m.ropeIndex === ropeIndex && Math.abs((m.ropeT || 0) - ropeT) < 0.05
    );
    if (existing >= 0) {
        markers.splice(existing, 1);
    }

    const marker: Marker = {
        id: _nextMarkerId++,
        type,
        attachType: 'rope',
        ropeIndex,
        ropeT,
        placeTimer: CONFIG.marker.placeAnimDuration,
        removeTimer: 0,
    };
    markers.push(marker);
    return marker;
}

/** 拆除标记（启动拆除动画） */
export function startRemoveMarker(markerId: number) {
    const markers = getMarkers();
    const m = markers.find(mk => mk.id === markerId);
    if (m) {
        m.removeTimer = CONFIG.marker.removeAnimDuration;
    }
}

/** 更新标记动画（每帧调用） */
export function updateMarkers() {
    const markers = getMarkers();
    for (let i = markers.length - 1; i >= 0; i--) {
        const m = markers[i];
        // 放置动画倒计时
        if (m.placeTimer > 0) m.placeTimer--;
        // 拆除动画倒计时
        if (m.removeTimer > 0) {
            m.removeTimer--;
            if (m.removeTimer <= 0) {
                markers.splice(i, 1); // 动画结束，真正移除
            }
        }
    }
}

// ============ 上下文检测 ============

interface NearbyInfo {
    context: WheelContext;
    wall?: any;           // 最近的岩石
    ropeIndex?: number;   // 最近的绳索索引
    ropeT?: number;       // 绳索上的参数位置
    isEndpoint?: boolean; // 是否是绳索端点
    existingMarker?: Marker; // 已有标记
}

/** 检测玩家附近的可交互对象，返回上下文信息 */
export function detectWheelContext(): NearbyInfo {
    const result: NearbyInfo = { context: 'none' };
    if (!state.rope) return result;

    const anchorDist = CONFIG.ropeAnchorDistance;

    // 1. 检测是否靠近绳索端点
    for (let i = 0; i < state.rope.ropes.length; i++) {
        const rope = state.rope.ropes[i];
        if (!rope.start || !rope.end) continue;
        const distToStart = Math.hypot(player.x - rope.start.x, player.y - rope.start.y);
        const distToEnd = Math.hypot(player.x - rope.end.x, player.y - rope.end.y);
        if (distToStart < anchorDist || distToEnd < anchorDist) {
            result.ropeIndex = i;
            result.isEndpoint = true;
            // 检查端点岩石上是否有标记
            const endWall = distToStart < distToEnd ? rope.startWall : rope.endWall;
            result.wall = endWall;
            const markers = getMarkers();
            const existing = markers.find(m =>
                m.attachType === 'wall' && m.wallX === endWall.x && m.wallY === endWall.y
            );
            if (existing) {
                result.existingMarker = existing;
                result.context = 'markedWall';
            } else {
                result.context = 'ropeEndWall';
            }
            return result;
        }
    }

    // 2. 检测是否靠近绳索中段
    for (let i = 0; i < state.rope.ropes.length; i++) {
        const rope = state.rope.ropes[i];
        if (!rope.path || rope.path.length < 2) continue;
        const totalLen = pathLength(rope.path);
        if (totalLen < 1) continue;
        // 找最近点
        let minDist = Infinity;
        let bestT = 0.5;
        const steps = Math.max(10, Math.ceil(totalLen / 20));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const d = t * totalLen;
            const pt = samplePolyline(rope.path, d);
            const dist = Math.hypot(player.x - pt.x, player.y - pt.y);
            if (dist < minDist) {
                minDist = dist;
                bestT = t;
            }
        }
        if (minDist < anchorDist) {
            result.ropeIndex = i;
            result.ropeT = bestT;
            result.isEndpoint = false;
            // 检查绳索上是否有标记
            const markers = getMarkers();
            const existing = markers.find(m =>
                m.attachType === 'rope' && m.ropeIndex === i && Math.abs((m.ropeT || 0) - bestT) < 0.1
            );
            if (existing) {
                result.existingMarker = existing;
                result.context = 'ropeMarkedMid';
            } else {
                result.context = 'ropeMid';
            }
            return result;
        }
    }

    // 3. 检测是否靠近岩石
    const nearest = findNearestWall(player.x, player.y, anchorDist);
    if (nearest) {
        result.wall = nearest.wall;
        // 检查是否正在铺绳
        if (state.rope.active) {
            result.context = 'ropingWall';
            return result;
        }
        // 检查岩石上是否有标记
        const markers = getMarkers();
        const existing = markers.find(m =>
            m.attachType === 'wall' && m.wallX === nearest.wall.x && m.wallY === nearest.wall.y
        );
        if (existing) {
            result.existingMarker = existing;
            result.context = 'markedWall';
        } else {
            result.context = 'emptyWall';
        }
        return result;
    }

    return result;
}

// ============ 轮盘扇区生成 ============

/** 根据上下文生成轮盘扇区列表 */
export function buildWheelSectors(ctx: WheelContext, hasExistingMarker: boolean): WheelSector[] {
    const sectors: WheelSector[] = [];

    // 根据上下文决定顶部操作
    switch (ctx) {
        case 'emptyWall':
            sectors.push({ action: 'startRope', label: '铺绳', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markDanger', label: '危险', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markSafe', label: '安全', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markUnknown', label: '未定', startAngle: 0, endAngle: 0 });
            break;
        case 'ropeEndWall':
            sectors.push({ action: 'removeRope', label: '拆绳', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markDanger', label: '危险', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markSafe', label: '安全', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markUnknown', label: '未定', startAngle: 0, endAngle: 0 });
            break;
        case 'ropingWall':
            sectors.push({ action: 'endRope', label: '结束铺绳', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markDanger', label: '危险', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markSafe', label: '安全', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markUnknown', label: '未定', startAngle: 0, endAngle: 0 });
            break;
        case 'markedWall':
            sectors.push({ action: 'startRope', label: '铺绳', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markDanger', label: '危险', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markSafe', label: '安全', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'removeMarker', label: '拆标记', startAngle: 0, endAngle: 0 });
            break;
        case 'ropeMid':
            sectors.push({ action: 'markDanger', label: '危险', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markSafe', label: '安全', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markUnknown', label: '未定', startAngle: 0, endAngle: 0 });
            break;
        case 'ropeMarkedMid':
            sectors.push({ action: 'markDanger', label: '危险', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'markSafe', label: '安全', startAngle: 0, endAngle: 0 });
            sectors.push({ action: 'removeMarker', label: '拆标记', startAngle: 0, endAngle: 0 });
            break;
        default:
            return [];
    }

    // 均匀分配角度（从顶部开始，顺时针）
    const count = sectors.length;
    const gap = (Math.PI * 2) / count;
    const startOffset = -Math.PI / 2; // 从正上方开始
    for (let i = 0; i < count; i++) {
        sectors[i].startAngle = startOffset + i * gap;
        sectors[i].endAngle = startOffset + (i + 1) * gap;
    }

    return sectors;
}

// ============ 轮盘交互按钮可见性更新 ============

/** 每帧更新轮盘交互按钮的可见性（替代旧的绳索按钮逻辑） */
export function updateWheelButtonVisibility() {
    if (!state.wheel) return;
    // 轮盘打开时不更新按钮
    if (state.wheel.open) return;

    // 水面以上不显示（主线模式）
    if (state.screen === 'play' && player.y <= 0) {
        state.wheel.btnVisible = false;
        return;
    }

    // 检测静止
    const speedThreshold = CONFIG.ropeStillSpeedThreshold || 1.5;
    const isStill = input.move === 0 && Math.hypot(player.vx, player.vy) < speedThreshold;

    const nearbyInfo = detectWheelContext();
    if (nearbyInfo.context !== 'none' && isStill) {
        state.wheel.stillTimer += 1 / 60;
    } else {
        state.wheel.stillTimer = 0;
    }

    if (nearbyInfo.context !== 'none' && state.wheel.stillTimer >= CONFIG.ropeStillTimeToShow) {
        state.wheel.btnVisible = true;
        state.wheel.nearbyInfo = nearbyInfo;
    } else {
        state.wheel.btnVisible = false;
        state.wheel.nearbyInfo = null;
    }
}

// ============ 执行轮盘选中的操作 ============

/** 执行轮盘选中的操作 */
export function executeWheelAction(action: WheelAction) {
    const wheel = state.wheel;
    if (!wheel || !wheel.nearbyInfo) return;
    const info = wheel.nearbyInfo;

    switch (action) {
        case 'startRope': {
            // 触发开始铺绳（复用旧逻辑：设置 rope.hold 状态，让 Rope.ts 处理）
            if (info.wall && state.rope) {
                state.rope.hold.active = true;
                state.rope.hold.type = 'start';
                state.rope.hold.timer = CONFIG.ropeHoldDuration; // 直接完成
                state.rope.hold.anchor = info.wall;
            }
            break;
        }
        case 'endRope': {
            if (info.wall && state.rope) {
                state.rope.hold.active = true;
                state.rope.hold.type = 'end';
                state.rope.hold.timer = CONFIG.ropeHoldDuration;
                state.rope.hold.anchor = info.wall;
            }
            break;
        }
        case 'removeRope': {
            if (info.ropeIndex !== undefined && state.rope) {
                // 拆除整段绳索
                const idx = info.ropeIndex;
                if (idx >= 0 && idx < state.rope.ropes.length) {
                    // 同时移除绑在这段绳索上的所有标记
                    const markers = getMarkers();
                    for (let i = markers.length - 1; i >= 0; i--) {
                        if (markers[i].attachType === 'rope' && markers[i].ropeIndex === idx) {
                            markers.splice(i, 1);
                        }
                    }
                    // 更新其他标记的 ropeIndex（索引后移）
                    for (const m of markers) {
                        if (m.attachType === 'rope' && m.ropeIndex !== undefined && m.ropeIndex > idx) {
                            m.ropeIndex--;
                        }
                    }
                    state.rope.ropes.splice(idx, 1);
                }
            }
            break;
        }
        case 'markDanger':
        case 'markUnknown':
        case 'markSafe': {
            const markerType: MarkerType =
                action === 'markDanger' ? 'danger' :
                action === 'markUnknown' ? 'unknown' : 'safe';
            if (info.context === 'ropeMid' || info.context === 'ropeMarkedMid') {
                // 绳索上放标记
                if (info.ropeIndex !== undefined && info.ropeT !== undefined) {
                    placeRopeMarker(markerType, info.ropeIndex, info.ropeT);
                }
            } else if (info.wall) {
                // 岩石上放标记
                placeWallMarker(markerType, info.wall);
            }
            break;
        }
        case 'removeMarker': {
            if (info.existingMarker) {
                startRemoveMarker(info.existingMarker.id);
            }
            break;
        }
    }
}
