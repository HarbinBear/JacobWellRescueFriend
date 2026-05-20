// 家场景演员系统
//
// 男主和女孩在客厅画面上的位置插值。坐标是逻辑屏幕像素。
// 不做物理碰撞——客厅就一张静态背景，演员只是装饰性走两步。

import { state } from '../core/state';
import { Anchor } from './scripts/types';

// 客厅锚点定义（比例屏幕坐标）
// cw 是逻辑屏宽，ch 是逻辑屏高，调用方提供。
export function anchorPos(cw: number, ch: number, anchor: Anchor): { x: number; y: number } {
    switch (anchor) {
        case 'door':   return { x: cw * 0.85, y: ch * 0.62 };  // 玄关，靠右
        case 'sofa':   return { x: cw * 0.42, y: ch * 0.62 };
        case 'desk':   return { x: cw * 0.22, y: ch * 0.62 };
        case 'window': return { x: cw * 0.62, y: ch * 0.50 };
        case 'exit':   return { x: cw * 1.05, y: ch * 0.62 };  // 出门：屏幕外右侧
        case 'center': return { x: cw * 0.50, y: ch * 0.62 };
    }
}

const MOVE_SPEED = 1.6; // 像素/帧

export function setMan(cw: number, ch: number, at: Anchor, immediate = true) {
    const home: any = state.home;
    if (!home) return;
    const p = anchorPos(cw, ch, at);
    home.actors.man.targetX = p.x;
    home.actors.man.targetY = p.y;
    if (immediate) {
        home.actors.man.x = p.x;
        home.actors.man.y = p.y;
    }
}

export function setGirl(cw: number, ch: number, at: Anchor, immediate = true) {
    const home: any = state.home;
    if (!home) return;
    const p = anchorPos(cw, ch, at);
    home.actors.girl.targetX = p.x;
    home.actors.girl.targetY = p.y;
    if (immediate) {
        home.actors.girl.x = p.x;
        home.actors.girl.y = p.y;
    }
}

/**
 * 由对话脚本 action='move' 触发：让某个演员开始向目标锚点移动（非瞬移）。
 * 实际目标点会在 HomeScene.update() 中根据当时屏宽屏高重算。
 * 这里仅记录 anchor 字符串，渲染那一帧 cw/ch 已知再设目标。
 */
const _pendingMoves: { who: 'man' | 'girl'; anchor: Anchor }[] = [];

export function beginActorMove(who: 'man' | 'girl', to: Anchor) {
    _pendingMoves.push({ who, anchor: to });
}

export function consumePendingMoves(cw: number, ch: number) {
    if (_pendingMoves.length === 0) return;
    const home: any = state.home;
    if (!home) { _pendingMoves.length = 0; return; }
    for (const m of _pendingMoves) {
        const p = anchorPos(cw, ch, m.anchor);
        if (m.who === 'man') {
            home.actors.man.targetX = p.x;
            home.actors.man.targetY = p.y;
            home.actors.man.pose = 'walk';
        } else {
            home.actors.girl.targetX = p.x;
            home.actors.girl.targetY = p.y;
            home.actors.girl.pose = 'walk';
            home.actors.girl.visible = true;
        }
    }
    _pendingMoves.length = 0;
}

/**
 * 每帧推进位置插值。返回是否两个演员都已到位（用于 HomeScene 等待入场动画结束）。
 */
export function tickActors(): boolean {
    const home: any = state.home;
    if (!home) return true;
    let manDone = stepTowards(home.actors.man, MOVE_SPEED);
    let girlDone = stepTowards(home.actors.girl, MOVE_SPEED);
    // 走到目标改回站姿
    if (manDone) home.actors.man.pose = 'stand';
    if (girlDone) {
        if (home.actors.girl.pose === 'walk') {
            home.actors.girl.pose = 'stand';
        }
        // 如果目标点是 exit（屏幕外），到位后自动隐藏
        // 这里没法直接知道是不是 exit，用 x 坐标启发：超出屏幕右边外缘视为离开
        // 实际由 HomeScene 在 post 流程里处理 visible=false
    }
    return manDone && girlDone;
}

function stepTowards(actor: any, speed: number): boolean {
    const dx = actor.targetX - actor.x;
    const dy = actor.targetY - actor.y;
    const d = Math.hypot(dx, dy);
    if (d < speed) {
        actor.x = actor.targetX;
        actor.y = actor.targetY;
        return true;
    }
    actor.x += (dx / d) * speed;
    actor.y += (dy / d) * speed;
    return false;
}
