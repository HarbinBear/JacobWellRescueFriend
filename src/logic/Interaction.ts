import { activeWorld, world, circleCollision } from '../world/continuous/Geometry';
import { worldSegmentClear } from '../world/continuous/Routes';
import { CONFIG } from '../core/config';
import { player, state, input, createInteractionState } from '../core/state';
import { playSFX } from '../audio/AudioManager';
import { getActiveMapContext } from '../world/Visibility';
import { circleHitsRock, rockSegmentClear } from '../world/RockGeometry';
import { resetDriveInput } from './DriveMode';
import { actionTargetPoint, aimActionGesture, interactionScope, isActionTargetValid, isInteractionPlay, visibleInteractionPoint } from './ActionTargets';
import { applyRopeRemoval, cutTether, detachTetherEnd, getRopeContact, placeRopeAt,
    releaseRopeContact, ropeAnchorPoint, getRopeResponseAlong, unbindFish } from './Rope';
import { pointOnStrand } from './RopeNet';
import { isFishStunned, stunFish } from './FishHandling';
import type { RopeAnchor } from './Rope';
import type { ActionTarget, InteractionTask } from './InteractionTypes';
import type { RopePoint } from './RopeNet';

export function interactionFeedback(text: string, point: RopePoint, success = false) {
    state.interaction.feedback = { point: { ...point }, text, success, timer: 80 };
}

export function cancelInteraction(showFeedback = false) {
    const task = state.interaction.task;
    if (showFeedback && task) interactionFeedback('已取消', task.point);
    state.interaction.task = null;
}

export function cancelInteractionInput() {
    cancelInteraction();
    state.interaction.gesture = null;
    state.interaction.aim = null;
    state.wheel.open = false;
    state.wheel.touchId = null;
    state.wheel.expandProgress = 0;
}

export function resetInteractions() {
    cancelInteractionInput();
    state.interaction = createInteractionState();
    state.rope.links = [];
    state.rope.fading = [];
}

function canOccupy(point: RopePoint) {
    if(activeWorld())return !circleCollision(point.x,point.y,18);
    const map = getActiveMapContext(), radius = state.screen === 'mazeRescue' ? CONFIG.maze.playerRadius : CONFIG.playerRadius;
    const r = Math.floor(point.y / map.tileSize), c = Math.floor(point.x / map.tileSize);
    if (r < 0 || c < 0 || r >= map.rows || c >= map.cols || map.map[r]?.[c] === 2) return false;
    return !(map.walls || []).some(w => circleHitsRock(w, point.x, point.y, radius));
}

function clearWorkSegment(from: RopePoint, to: RopePoint, padding = 0) {
    // 连续洞穴使用空间索引，避免每次接近或出手时遍历整张图的岩壁。
    return activeWorld() ? worldSegmentClear(from, to, padding) :
        rockSegmentClear(getActiveMapContext().walls || [], from, to, padding);
}

function clearApproach(from: RopePoint, to: RopePoint) {
    const radius = state.screen === 'mazeRescue' ? CONFIG.maze.playerRadius : CONFIG.playerRadius;
    if (!canOccupy(to) || !clearWorkSegment(from, to, radius)) return false;
    const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1,speed=CONFIG.fishInteraction.approachSpeed;
    const contact=getRopeResponseAlong(player,to,radius,dx/length*speed,dy/length*speed);
    if(contact&&contact.kind!=='glide')return false; // Use the same slow-swim collision response, never teleport.
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4));
    for (let i = 1; i <= steps; i++) {
        const point = { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps };
        if (!canOccupy(point)) return false;
    }
    return true;
}

/** The final approach is a short body movement, not long-range pathfinding. */
function workStance(point: RopePoint): RopePoint | null {
    const distance = Math.hypot(point.x - player.x, point.y - player.y), reach = CONFIG.fishInteraction.handReach;
    if(activeWorld() && world()!.grounded && world()!.landBlend>.6)return distance<=reach+24 && visibleInteractionPoint(point)?{x:player.x,y:player.y}:null;
    if (distance <= reach + 2 && visibleInteractionPoint(point)) return { x: player.x, y: player.y };
    if (distance > CONFIG.fishInteraction.approachLimit) return null;
    const bearing = Math.atan2(player.y - point.y, player.x - point.x);
    for (const offset of [0, -.28, .28, -.55, .55]) {
        const angle = bearing + offset;
        const candidate = { x: point.x + Math.cos(angle) * reach, y: point.y + Math.sin(angle) * reach };
        if (Math.hypot(candidate.x - player.x, candidate.y - player.y) <= CONFIG.fishInteraction.approachLimit &&
            clearApproach(player, candidate) && clearWorkSegment(candidate, point)) return candidate;
    }
    return null;
}

function anchorValid(anchor: RopeAnchor) {
    if (anchor.fish) return !anchor.fish.dead && state.fishEnemies.includes(anchor.fish) && (anchor.fish.bound || isFishStunned(anchor.fish));
    if (anchor.self) return state.rope.active;
    if (anchor.onRope) return (!anchor.rope || state.rope.ropes.includes(anchor.rope)) &&
        state.rope.ropes.some(rope => rope.path.slice(1).some((b: RopePoint, i: number) => pointOnStrand(anchor.point, rope.path[i], b)));
    return !!anchor.wall && (getActiveMapContext().walls || []).includes(anchor.wall);
}

function createTask(kind: InteractionTask['kind'], point: RopePoint, duration: number, anchor?: RopeAnchor, target?: ActionTarget) {
    const stance = anchor?.self || target?.kind === 'self' ? { x: player.x, y: player.y } : workStance(point);
    if (!stance) { interactionFeedback('这里够不到，先靠近一点', point); return false; }
    resetDriveInput();
    state.interaction.task = {
        kind, anchor, target, phase: Math.hypot(stance.x - player.x, stance.y - player.y) > 2 ? 'approach' : 'perform',
        point: { ...point }, stance, origin: { x: player.x, y: player.y }, time: 0, duration,
        source: kind === 'tie' ? state.rope.current : null,
        scope: interactionScope(), travelled: 0,
    };
    state.interaction.aim = null;
    return true;
}

export function beginRopeInteraction(anchor: RopeAnchor) {
    if (!isInteractionPlay() || state.fishBump.stunTimer > 0 || !anchorValid(anchor)) return false;
    if (state.interaction.task) cancelInteraction();
    const cfg = CONFIG.fishInteraction;
    return createTask('tie', ropeAnchorPoint(anchor), anchor.self ? cfg.tieSelfFrames : anchor.fish ? cfg.tieFishFrames : cfg.tieAnchorFrames, anchor);
}

export function beginActionInteraction(target: ActionTarget | null) {
    if (!target || !isInteractionPlay() || state.fishBump.stunTimer > 0 || state.interaction.cooldown > 0 || !isActionTargetValid(target)) return false;
    const point = actionTargetPoint(target), distance = Math.hypot(point.x - player.x, point.y - player.y);
    if (!visibleInteractionPoint(point, CONFIG.fishInteraction.approachLimit)) { interactionFeedback('目标被岩石挡住了', point); return false; }
    const cfg = CONFIG.fishInteraction;
    if (target.kind === 'fish') {
        // Awake, free and netted fish use exactly the same contact/impact rule.
        return createTask('stun', point, cfg.strikeFrames, undefined, target);
    }
    const cut = target.kind === 'cut' || target.kind === 'net' || target.kind === 'tether';
    return createTask(cut ? 'cut' : 'untie', point, cut ? cfg.cutFrames : cfg.untieFrames, undefined, target);
}

function applyCut(task:InteractionTask):boolean{
    const target=task.target!;
    if(target.kind==='tether')return cutTether(target.link!,actionTargetPoint(target));
    const success=!!target.removal&&applyRopeRemoval(target.removal);
    if(success&&target.kind==='net'){releaseRopeContact(target.fish!);target.fish!.netGraceFrames=CONFIG.fishInteraction.freedNetFrames;}
    return success;
}
function impact(task:InteractionTask,point:RopePoint,now:number){
    state.interaction.impact={point:{...point},angle:player.angle,kind:task.kind as 'stun'|'cut',startedAt:now};
    state.fx.shake=Math.max(state.fx.shake,task.kind==='stun'?7:5.5);
    playSFX('rescueBonk',{volume:task.kind==='stun'?.92:.66,playbackRate:task.kind==='stun'?.78:1.6});
    try{if(typeof wx!=='undefined'&&(wx as any).vibrateShort)(wx as any).vibrateShort({type:'heavy'});}catch(_){}
}
function completeTask(task: InteractionTask) {
    let success = false, text = '';
    if (task.kind === 'tie' && task.anchor) {
        const fish = task.anchor.fish, wasBound = !!fish?.bound;
        if (fish) fish.bound = true;
        success = placeRopeAt(task.anchor);
        if (fish && !success) fish.bound = wasBound;
        text = task.anchor.self ? '已系到腰扣' : fish ? '鱼绑好了' : '绳结收紧';
    } else if (task.target) {
        const target = task.target;
        if (task.kind === 'stun') { success = !!task.applied; text = '咚 · 暂时晕了'; }
        else if (target.kind === 'fishKnot') { success = unbindFish(target.fish!); text = '鱼绳已解开'; }
        else if (target.kind === 'self') { success = detachTetherEnd(target.link!, target.end!); text = '这根绳已从腰扣解下'; }
        else if (target.kind === 'untie') { success = applyRopeRemoval(target.removal!); text = '绳结解开 · 整段已取下'; }
        else if (target.kind === 'cut') { success = !!task.applied; text = '整组绳已拆下'; }
        else if (target.kind === 'tether') { success = !!task.applied; text = '牵引绳已拆下'; }
        else if (target.kind === 'net') {
            success = !!task.applied;
            text = '整张网已拆下 · 绑鱼绳保留';
        }
    }
    if (task.kind !== 'tie') state.interaction.cooldown = CONFIG.fishInteraction.actionCooldownFrames;
    if (task.kind !== 'stun' && task.kind !== 'cut') playSFX(success ? 'uiPrimary' : 'uiSecondary', { volume: .42 });
    interactionFeedback(success ? text : '目标已变化，操作取消', task.point, success);
}

/** Called once by the active player movement loop, before ordinary propulsion. */
export function updateInteractionMovement(now = Date.now()): boolean {
    const runtime = state.interaction;
    const dt = runtime.lastUpdateAt ? Math.max(0, Math.min(3, (now - runtime.lastUpdateAt) * .06)) : 1;
    runtime.lastUpdateAt = now;
    if(runtime.impact&&now-runtime.impact.startedAt>260)runtime.impact=undefined;
    if (runtime.feedback && (runtime.feedback.timer -= dt) <= 0) runtime.feedback = null;
    runtime.cooldown = Math.max(0, runtime.cooldown - dt);
    if (!isInteractionPlay()) { cancelInteractionInput(); return false; }
    if (state.fishBump.stunTimer > 0) {
        cancelInteractionInput();
        resetDriveInput();
        player.vx *= .94; player.vy *= .94;
        return true;
    }
    if (runtime.gesture) {
        runtime.aim = aimActionGesture(runtime.gesture, true);
        return false;
    }
    if (state.wheel.open) return false;
    const task = runtime.task;
    if (!task) return false;
    if (task.scope !== interactionScope() || (task.source && state.rope.current !== task.source) ||
        (task.anchor && !anchorValid(task.anchor)) || (task.target && !task.applied && !isActionTargetValid(task.target))) {
        cancelInteraction(); interactionFeedback('目标已变化，操作取消', task.point); return false;
    }
    if (input.move > 0 || Object.keys(state.manualDrive.activeTouches).length > 0) {
        cancelInteraction(true); return false;
    }
    const point = task.applied ? task.point : task.anchor ? ropeAnchorPoint(task.anchor) : actionTargetPoint(task.target!);
    if (!task.applied && Math.hypot(point.x - task.point.x, point.y - task.point.y) > (task.kind === 'stun' ? 22 : 18) ||
        !visibleInteractionPoint(point, CONFIG.fishInteraction.approachLimit)) {
        cancelInteraction(); interactionFeedback(task.target?.fish ? '鱼游开了' : '目标离开了操作位置', task.point); return false;
    }
    const angle = Math.atan2(point.y - player.y, point.x - player.x);
    if(activeWorld() && world()!.grounded && Math.abs(point.x-player.x)>2)world()!.facing=point.x>player.x?1:-1;
    if (!task.anchor?.self && task.target?.kind !== 'self' && !(activeWorld()&&world()!.grounded)) {
        let delta = angle - player.angle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        player.angle += delta * .22;
        player.targetAngle = player.angle;
    }
    if (task.phase === 'approach') {
        if(task.anchor?.fish||task.target?.fish){const stance=workStance(point);if(stance)task.stance=stance;}
        const dx = task.stance.x - player.x, dy = task.stance.y - player.y, distance = Math.hypot(dx, dy);
        if (distance <= 2) { task.phase = 'perform'; task.point={...point}; task.time = 0; player.vx = player.vy = 0; }
        else {
            const speed = Math.min(CONFIG.fishInteraction.approachSpeed, distance);
            const next = { x: player.x + dx / distance * speed, y: player.y + dy / distance * speed };
            if (!clearApproach(player, next) || task.travelled > CONFIG.fishInteraction.approachLimit || getRopeContact(player)?.kind === 'snag') {
                cancelInteraction(); interactionFeedback('接近受阻，先换个位置', task.point); return false;
            }
            player.vx = dx / distance * speed;
            player.vy = dy / distance * speed;
            task.travelled += speed;
            return true;
        }
    }
    if (!task.anchor?.self && task.target?.kind !== 'self' && Math.hypot(point.x - player.x, point.y - player.y) > CONFIG.fishInteraction.handReach + (activeWorld()&&world()!.grounded&&task.kind==='tie'?24:8)) {
        cancelInteraction(); interactionFeedback('失去接触，操作取消', point); return false;
    }
    player.vx *= .35; player.vy *= .35;
    if(task.kind==='cut'&&task.applied&&runtime.impact&&now-runtime.impact.startedAt<50)return true;
    task.time += dt;
    if(task.kind==='stun'&&!task.applied&&task.time>=task.duration*.60){
        if(!task.target?.fish||Math.hypot(point.x-player.x,point.y-player.y)>CONFIG.fishInteraction.handReach+7||!stunFish(task.target.fish)){
            cancelInteraction();interactionFeedback('没有碰到，动作取消',point);return false;
        }
        task.applied=true;impact(task,point,now);
    }
    if(task.kind==='cut'&&!task.applied&&task.time>=task.duration*.61){
        if(!applyCut(task)){cancelInteraction();interactionFeedback('目标变化，拆除取消',point);return false;}
        task.applied=true;task.time=task.duration*.61;impact(task,point,now);
    }
    if (task.time >= task.duration) {
        runtime.task = null;
        completeTask(task);
    }
    return true;
}

export function getInteractionWorkPose() {
    const task = state.interaction.task;
    if (!task || task.phase !== 'perform') return undefined;
    const point = task.applied ? task.point : task.anchor ? ropeAnchorPoint(task.anchor) : actionTargetPoint(task.target!);
    const dx = point.x - player.x, dy = point.y - player.y, c = Math.cos(player.angle), s = Math.sin(player.angle);
    return { kind: task.kind, progress: Math.min(1, task.time / task.duration), x: dx * c + dy * s, y: -dx * s + dy * c,
        self: !!task.anchor?.self || task.target?.kind === 'self', applied: task.applied };
}
