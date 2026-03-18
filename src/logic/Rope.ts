import { CONFIG } from '../core/config';
import { state, player, input } from '../core/state';
import { buildAvoidedPath } from './Pathfinding';
import { triggerSilt } from './Particle';

function getActiveWalls() {
    if (state.screen === 'mazeRescue' && state.mazeRescue) {
        return state.mazeRescue.mazeWalls;
    }
    return state.walls;
}

// 辅助函数：在 maxDist 范围内找最近的墙壁
export function findNearestWall(x: number, y: number, maxDist: number): any {
    let nearest: any = null;
    let minDist = maxDist;
    const walls = getActiveWalls();
    if(!walls) return null;
    for(let wall of walls) {
        let dist = Math.hypot(x - wall.x, y - wall.y) - wall.r;
        if(dist < minDist) {
            minDist = dist;
            nearest = wall;
        }
    }
    if(!nearest) return null;
    return { wall: nearest, dist: minDist };
}

function getAnchorPoint(wall: any, fromX: number, fromY: number) {
    let angle = Math.atan2(fromY - wall.y, fromX - wall.x);
    return {
        x: wall.x + Math.cos(angle) * wall.r,
        y: wall.y + Math.sin(angle) * wall.r
    };
}

// 开始铺绳：将锚点固定在锁定岩石上
function startRope(anchorWall: any) {
    if(!anchorWall) return;
    const anchorPoint = getAnchorPoint(anchorWall, player.x, player.y);
    state.rope.active = true;
    state.rope.current.start = anchorPoint;
    state.rope.current.startWall = anchorWall;
    state.rope.current.end = null;
    state.rope.current.path = buildAvoidedPath(anchorPoint, { x: player.x, y: player.y }, CONFIG.ropeAvoidPadding);
    state.rope.current.basePoints = state.rope.current.path;
    state.rope.current.slackFactor = 1;
    state.rope.current.mode = 'loose';
    state.rope.current.time = 0;
    state.rope.stillTimer = 0;
}

// 结束铺绳：将末端固定在岩石上，拉紧并锁定
function endRope(anchorWall: any) {
    if(!state.rope.active || !state.rope.current.start || !anchorWall) return;
    const endPoint = getAnchorPoint(anchorWall, player.x, player.y);
    const path = buildAvoidedPath(state.rope.current.start, endPoint, CONFIG.ropeAvoidPadding);
    state.rope.ropes.push({
        start: state.rope.current.start,
        startWall: state.rope.current.startWall,
        end: endPoint,
        endWall: anchorWall,
        path,
        slackFactor: 0,
        mode: 'tight'
    });
    state.rope.active = false;
    state.rope.current = {
        start: null,
        startWall: null,
        end: null,
        path: [],
        basePoints: [],
        slackFactor: 1,
        mode: 'loose',
        time: 0
    };
    state.rope.stillTimer = 0;
}

// 绳索系统主更新
export function updateRopeSystem() {
    if(!state.rope) return;
    const dt = 1 / 60;

    if(state.rope.current) {
        if(!state.rope.current.time) state.rope.current.time = 0;
        state.rope.current.time += dt;
    }

    if(state.rope.hold.active) {
        state.rope.hold.timer += dt;
        state.rope.ui.visible = true;
        state.rope.ui.type = state.rope.hold.type;
        state.rope.ui.anchor = state.rope.hold.anchor;
        state.rope.ui.progress = Math.min(1, state.rope.hold.timer / CONFIG.ropeHoldDuration);
    }

    if(state.rope.active && state.rope.current.start) {
        let endPoint = { x: player.x, y: player.y };
        if(state.rope.hold.active && state.rope.hold.type === 'end' && state.rope.hold.anchor) {
            endPoint = getAnchorPoint(state.rope.hold.anchor, player.x, player.y);
            state.rope.current.end = endPoint;
            state.rope.current.mode = 'tightening';
            state.rope.current.slackFactor += (0 - state.rope.current.slackFactor) * CONFIG.ropeTightenLerp;
        } else if(state.rope.current.mode === 'tightening') {
            state.rope.current.slackFactor += (1 - state.rope.current.slackFactor) * 0.2;
            if(state.rope.current.slackFactor > 0.95) {
                state.rope.current.slackFactor = 1;
                state.rope.current.mode = 'loose';
            }
        }
        state.rope.current.path = buildAvoidedPath(state.rope.current.start, endPoint, CONFIG.ropeAvoidPadding);
        state.rope.current.basePoints = state.rope.current.path;
    }

    if(state.rope.hold.active && state.rope.hold.timer >= CONFIG.ropeHoldDuration) {
        if(state.rope.hold.type === 'start') {
            startRope(state.rope.hold.anchor);
        } else if(state.rope.hold.type === 'end') {
            endRope(state.rope.hold.anchor);
        }
        state.rope.hold.active = false;
        state.rope.hold.type = null;
        state.rope.hold.timer = 0;
        state.rope.hold.touchId = null;
        state.rope.hold.anchor = null;
        state.rope.ui.progress = 0;
    }

    if(state.rope.hold.active) return;

    if(player.y <= 0) {
        state.rope.ui.visible = false;
        state.rope.ui.type = null;
        state.rope.ui.anchor = null;
        state.rope.stillTimer = 0;
        return;
    }

    let nearest = findNearestWall(player.x, player.y, CONFIG.ropeAnchorDistance);
    let speedThreshold = CONFIG.ropeStillSpeedThreshold || 1.5;
    let isStill = input.move === 0 && Math.hypot(player.vx, player.vy) < speedThreshold;

    if(nearest && isStill) state.rope.stillTimer += dt;
    else state.rope.stillTimer = 0;

    if(nearest && state.rope.stillTimer >= CONFIG.ropeStillTimeToShow) {
        state.rope.ui.visible = true;
        state.rope.ui.type = state.rope.active ? 'end' : 'start';
        state.rope.ui.anchor = nearest.wall;
    } else {
        state.rope.ui.visible = false;
        state.rope.ui.type = null;
        state.rope.ui.anchor = null;
    }
}
