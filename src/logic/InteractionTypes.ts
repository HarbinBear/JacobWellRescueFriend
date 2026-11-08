import type { FishEnemy } from './FishEnemy';
import type { RopeAnchor } from './Rope';
import type { RopePoint } from './RopeNet';
import type { RopeRemovalPlan } from './RopeTopology';

export interface RopeEndpoint {
    kind: 'rock' | 'rope' | 'fish' | 'player' | 'loose'; point: RopePoint;
    wall?: any; rope?: any; fish?: FishEnemy; vx?: number; vy?: number;
}
export interface TetherLine {
    id: number; start: RopeEndpoint; end: RopeEndpoint; path: RopePoint[]; length: number; tension: number; age: number;
}
export interface RopeCut { rope: any; point: RopePoint }
export interface RopeFade { path: RopePoint[]; startedAt: number; duration: number }
export interface ActionTarget {
    kind: 'fish' | 'fishKnot' | 'net' | 'cut' | 'untie' | 'self' | 'tether';
    point: RopePoint; localPoint?: RopePoint; fish?: FishEnemy; rope?: any; end?: 'start' | 'end'; link?: TetherLine;
    cuts?: RopeCut[]; removal?: RopeRemovalPlan;
}
export interface ActionAim { angle: number; reach: number; pointer: RopePoint; target: ActionTarget | null }
export interface ActionGesture {
    touchId: number; x: number; y: number; startX: number; startY: number; centerX: number; centerY: number;
    selectionLost?: boolean; dragged: boolean; scope: object;
}
export interface InteractionTask {
    kind: 'tie' | 'stun' | 'untie' | 'cut'; anchor?: RopeAnchor; target?: ActionTarget;
    phase: 'approach' | 'perform'; point: RopePoint; stance: RopePoint; origin: RopePoint;
    time: number; duration: number; source: object | null; scope: object; travelled: number; applied?: boolean;
}
export interface InteractionFeedback { point: RopePoint; text: string; timer: number; success: boolean }
export interface ImpactPulse { point: RopePoint; angle: number; startedAt: number; kind: 'stun' | 'cut' }
export interface InteractionRuntime {
    gesture: ActionGesture | null; aim: ActionAim | null; task: InteractionTask | null;
    feedback: InteractionFeedback | null; cooldown: number; nextLinkId: number; lastUpdateAt?: number; impact?: ImpactPulse; holdUntil?: number;
}
