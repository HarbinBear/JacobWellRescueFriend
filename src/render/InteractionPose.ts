import type { RopePoint } from '../logic/RopeNet';

export interface WorkPose {
    kind: 'tie' | 'stun' | 'untie' | 'cut'; progress: number; x: number; y: number; self?: boolean; applied?: boolean;
}
export interface WorkMotion {
    left: RopePoint; right: RopePoint; roll: number; recoil: number; lean: number;
    tool: 'rope' | 'tank' | 'shears'; toolAngle: number; toolOpen: number; thread: RopePoint[]; phase: string;
}
const ease = (v: number) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
const between = (a: RopePoint, b: RopePoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Distinct authored trajectories; no shared 'both arms extend' animation. */
export function sampleWorkMotion(work: WorkPose): WorkMotion {
    const p = Math.max(0, Math.min(1, work.progress));
    const target = { x: work.x, y: work.y }, waist = { x: -7, y: 5 };
    let left = { x: 12, y: -10 }, right = { x: 5, y: 11 }, roll = 0, recoil = 0, lean = 0;
    let tool: WorkMotion['tool'] = 'rope', toolAngle = 0, toolOpen = 0, thread: RopePoint[] = [], phase = '';
    if (work.kind === 'tie') {
        const hold = { x: target.x - 2, y: target.y - 4 };
        if (p < .18) {
            const t = ease(p / .18); left = between(left, hold, t); right = between(waist, { x: target.x - 8, y: target.y + 9 }, t);
            phase = '取绳';
        } else if (p < .55) {
            const t = (p - .18) / .37, angle = -Math.PI / 2 + t * Math.PI * 4;
            left = hold; right = { x: target.x + Math.cos(angle) * 8, y: target.y + Math.sin(angle) * 9 };
            roll = Math.sin(angle) * .09; lean = .6; phase = '绕两圈';
            thread = [left, target, right];
        } else if (p < .79) {
            const t = ease((p - .55) / .24); left = { x: target.x - 4, y: target.y - 6 + t * 9 };
            right = { x: target.x + 6 - t * 10, y: target.y + 6 - t * 9 };
            phase = '交叉穿结'; thread = [left, { x: target.x + 4, y: target.y - 4 }, right];
        } else {
            const t = ease((p - .79) / .21); left = { x: target.x - 2 - t * 7, y: target.y - 3 - t * 8 };
            right = { x: target.x - 2 - t * 8, y: target.y + 3 + t * 8 };
            recoil = t * 2.6; roll = -.10 * t; phase = '双手拉紧'; thread = [left, target, right];
        }
    } else if (work.kind === 'untie') {
        if (p < .25) {
            const t = ease(p / .25); left = between(left, { x: target.x - 3, y: target.y - 5 }, t);
            right = between(right, { x: target.x + 1, y: target.y + 5 }, t); phase = '扶结';
        } else if (p < .56) {
            const t = (p - .25) / .31; left = { x: target.x - 3, y: target.y - 5 };
            right = { x: target.x + 4 * Math.cos(t * Math.PI), y: target.y + 5 + 5 * Math.sin(t * Math.PI) };
            toolAngle = -t * Math.PI / 2; roll = t * .10; phase = '挑开绳环';
        } else {
            const t = ease((p - .56) / .44); left = { x: target.x - 4 - t * 2, y: target.y - 5 };
            right = { x: target.x - 3 - t * 18, y: target.y + 4 + t * 10 };
            recoil = t * 3.2; roll = -.13 * t; phase = '抽出绳尾'; thread = [target, right];
        }
    } else if (work.kind === 'cut') {
        tool = 'shears'; left = { x: target.x - 2, y: target.y - 7 };
        if(p<.30){right=between({x:-8,y:12},{x:target.x-5,y:target.y+5},ease(p/.3));toolOpen=.8;phase='取剪';}
        else if(p<.52){const t=ease((p-.3)/.22);right={x:target.x-5,y:target.y+4};left={x:target.x-2-t*4,y:target.y-7-t*3};
            toolOpen=.85;roll=-.18*t;recoil=t*2;phase='绷绳蓄力';}
        else if(p<.61){const t=ease((p-.52)/.09);right={x:target.x-5+t*2,y:target.y+4-t*3};toolOpen=.85*(1-t);
            roll=-.18*(1-t);lean=t*2;phase='猛然合剪';}
        else{const t=ease((p-.61)/.39);right={x:target.x-3-t*12,y:target.y+1+t*10};left={x:target.x-6-t*5,y:target.y-10};
            recoil=Math.sin(t*Math.PI)*4.5;roll=.12*Math.sin(t*Math.PI);phase='弹回收手';}
        toolAngle=-.4;
    } else {
        tool='tank';left=between({x:12,y:-10},{x:target.x-8,y:target.y-6},ease(p/.24));
        if(p<.48){const t=ease(p/.48);right={x:6-t*18,y:11+t*11};roll=-.38*t;recoil=t*4;toolAngle=-1.4*t;phase='举瓶收肘';}
        else if(p<.60){const t=ease((p-.48)/.12);right=between({x:-12,y:22},{x:target.x-9,y:target.y},t);
            roll=-.38*(1-t);recoil=(1-t)*4;lean=t*1.6;toolAngle=-1.4*(1-t);phase='猛砸';}
        else{const t=ease((p-.60)/.40);right=between({x:target.x-9,y:target.y},{x:5,y:15},t);
            left=between(left,{x:12,y:-10},t);roll=.15*Math.sin(t*Math.PI);recoil=Math.sin(t*Math.PI)*4.5;
            toolAngle=-t*.6;phase='回弹收瓶';}
    }
    return { left, right, roll, recoil, lean, tool, toolAngle, toolOpen, thread, phase };
}
