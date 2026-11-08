import { state, player, createRopeState, createInteractionState } from '../../src/core/state';
import { saveJSON, loadJSON, removeKey } from '../../src/core/SaveStorage';
import { getBCDRuntime } from '../../src/logic/BCDSystem';
import { getDecoRuntime } from '../../src/logic/DecompressionSystem';
import { resetRopeMotion } from '../../src/logic/Rope';
import { CONFIG } from '../../src/core/config';
import { world, layout, ShoreWorld } from './Geometry';

export const WORLD_SAVE_KEY = 'continuous_world_v1';
export const WORLD_BACKUP_KEY = WORLD_SAVE_KEY + '_backup';
let restoredSnapshot: WorldSnapshot | null = null;
export function getLastRestoreSnapshot() { return restoredSnapshot; }
export function clearWorldSnapshot() { removeKey(WORLD_SAVE_KEY); removeKey(WORLD_BACKUP_KEY); }
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const MAZE_FIELDS = ['npcFound','npcRescued','npcStunned','rescueRagdoll','maxDepthReached','totalRopePlaced','discoveredThemes',
    'thisNewThemes','currentThemeKey','consumedTankIds','discoveredRelicIds','codexKinds','maxDepthAllowed','playerPath'];
const WORLD_FIELDS = ['elapsed','chapterStatus','walkPhase','facing','wet','headWet','grounded','landBlend','nextFishId','airTanks','journal'];
interface PackedEndpoint { kind: string; point: {x: number; y: number}; wall: number; rope: number; fish: number; vx?: number; vy?: number }
export interface WorldSnapshot {
    version: number; layoutVersion: number; timestamp: number; seed: number; rows: number; cols: number;
    player: any; npc: any; fish: any[]; ropes: any[]; links: any[]; current: any; ropeActive: boolean; markers: any[];
    maze: any; world: Partial<ShoreWorld>; explored: number[]; extraction: any; story: any; bcd: any; deco: any;
    stamina?: { remaining: number; exhausted: boolean };
    config: { lightRange: number; moveSpeed: number; breathPeak: number };
}
export function packExplored(matrix: boolean[][]): number[] {
    const out: number[] = []; let count = 0, last = false;
    for (const row of matrix) for (const value of row) {
        const v = !!value; if (v === last) count++; else { if (count) out.push(last ? count : -count); count = 1; last = v; }
    }
    if (count) out.push(last ? count : -count); return out;
}
export function unpackExplored(runs: number[], rows: number, cols: number): boolean[][] {
    const matrix = Array.from({length: rows}, () => new Array(cols).fill(false)); let i = 0;
    for (const run of runs) {
        if (!Number.isInteger(run) || run === 0 || i + Math.abs(run) > rows * cols) throw new Error('探索位图损坏');
        for (let n = 0; n < Math.abs(run); n++, i++) matrix[Math.floor(i / cols)][i % cols] = run > 0;
    }
    if (i !== rows * cols) throw new Error('探索位图尺寸不完整'); return matrix;
}
function endpoint(e: any): PackedEndpoint | null {
    if (!e) return null;
    return {kind:e.kind, point:copy(e.point), wall:state.mazeRescue!.mazeWalls.indexOf(e.wall), rope:state.rope.ropes.indexOf(e.rope),
        fish:e.fish ? (e.fish as any).worldId : -1, vx:e.vx, vy:e.vy};
}
function unendpoint(e: PackedEndpoint | null, fish: Map<number, any>): any {
    if (!e) return null;
    const value: any = {kind:e.kind, point:copy(e.point), vx:e.vx, vy:e.vy};
    if (e.wall >= 0) value.wall = state.mazeRescue!.mazeWalls[e.wall];
    if (e.rope >= 0) value.rope = state.rope.ropes[e.rope];
    if (e.fish >= 0) value.fish = fish.get(e.fish);
    if (e.kind === 'fish' && !value.fish || e.kind === 'rope' && !value.rope || e.kind === 'rock' && !value.wall) throw new Error('绳索端点引用不完整');
    return value;
}
export function captureWorld(): WorldSnapshot {
    const m: any = state.mazeRescue, w = world(); if (!m || !w) throw new Error('没有连续章节');
    const maze: any = {}, savedWorld: any = {},clock=w.hidden?(w.hiddenAt||Date.now()):Date.now();
    for (const k of MAZE_FIELDS) if (m[k] !== undefined) maze[k] = copy(m[k]);
    for (const k of WORLD_FIELDS) savedWorld[k] = copy((w as any)[k]);
    return {version:1, layoutVersion:layout.version, timestamp:Date.now(), seed:m.seed, rows:m.mazeRows, cols:m.mazeCols,
        player:copy(player), npc:copy(state.npc), fish:state.fishEnemies.map((f:any) => ({...copy(f), stunRemaining:Math.max(0,(f.stunUntil-clock)/1000)})),
        ropes:state.rope.ropes.map(r => ({start:copy(r.start),end:copy(r.end),path:copy(r.path),mode:r.mode,slackFactor:r.slackFactor,
            threadId:r.threadId,startOnRope:r.startOnRope,endOnRope:r.endOnRope,startLoose:r.startLoose,endLoose:r.endLoose,
            startWall:m.mazeWalls.indexOf(r.startWall),endWall:m.mazeWalls.indexOf(r.endWall)})),
        links:state.rope.links.map(l => ({id:l.id,start:endpoint(l.start),end:endpoint(l.end),path:copy(l.path),length:l.length,tension:l.tension,age:l.age})),
        current:{...copy({...state.rope.current,startWall:undefined,startAttachment:undefined}),startWall:m.mazeWalls.indexOf(state.rope.current.startWall),startAttachment:endpoint(state.rope.current.startAttachment)},
        ropeActive:state.rope.active, markers:copy(state.markers), maze, world:savedWorld, explored:packExplored(m.mazeExplored),
        extraction:copy((state as any).extraction), story:copy(state.story2), bcd:copy(getBCDRuntime()), deco:copy(getDecoRuntime()),
        stamina:{remaining:state.semiAutoDrive.remaining,exhausted:state.semiAutoDrive.exhausted},
        config:{lightRange:CONFIG.lightRange,moveSpeed:CONFIG.maze.moveSpeed,breathPeak:CONFIG.breath.o2PerBreathPeak}};
}
export function validSnapshot(data: any): data is WorldSnapshot {
    return !!data && data.version === 1 && data.layoutVersion === layout.version && Number.isInteger(data.seed) &&
        Number.isInteger(data.rows) && data.rows > 0 && Number.isInteger(data.cols) && data.cols > 0 &&
        Number.isFinite(data.player?.x) && Number.isFinite(data.player?.y) && Number.isFinite(data.player?.o2) &&
        Array.isArray(data.fish) && Array.isArray(data.ropes) && Array.isArray(data.links) && Array.isArray(data.explored) &&
        typeof data.world?.elapsed === 'number' && !!data.extraction && !!data.story && !!data.bcd && !!data.deco && !!data.config;
}
export function readWorldSnapshot(): WorldSnapshot | null {
    for (const key of [WORLD_SAVE_KEY,WORLD_BACKUP_KEY]) {
        const data = loadJSON<WorldSnapshot>(key);
        if (!validSnapshot(data)) continue;
        try {unpackExplored(data.explored,data.rows,data.cols); return data;} catch(e) {console.warn('[连续世界] 尝试备份存档',e);}
    }
    return null;
}
export function saveWorldProgress(): boolean {
    const w = world(); if (!w) return false;
    let ok = false;
    try {
        const snapshot = captureWorld(), previous = loadJSON<WorldSnapshot>(WORLD_SAVE_KEY);
        if (validSnapshot(previous) && !saveJSON(WORLD_BACKUP_KEY, previous)) throw new Error('备份写入失败');
        ok = saveJSON(WORLD_SAVE_KEY, snapshot);
        if (ok) w.savedAt = snapshot.timestamp;
    } catch(e) {console.error('[连续世界] 保存失败，原存档未主动删除',e);}
    w.saveOK = ok; return ok;
}
export function restoreWorld(data: WorldSnapshot) {
    const m: any = state.mazeRescue, w = world();
    if (!validSnapshot(data) || !w || data.rows !== m.mazeRows || data.cols !== m.mazeCols || data.seed !== m.seed) throw new Error('章节存档与地图不匹配');
    Object.assign(player,copy(data.player)); Object.assign(state.npc,copy(data.npc));
    state.fishEnemies = data.fish.map((f:any) => {const v=copy(f);v.stunUntil=v.stunRemaining>0?Date.now()+v.stunRemaining*1000:0;delete v.stunRemaining;return v;});
    const fish = new Map<number,any>(state.fishEnemies.map((f:any) => [f.worldId,f]));
    state.rope = createRopeState();
    state.rope.ropes = data.ropes.map((r:any) => ({...copy(r),startWall:r.startWall>=0?m.mazeWalls[r.startWall]:null,endWall:r.endWall>=0?m.mazeWalls[r.endWall]:null}));
    state.rope.links = data.links.map((l:any) => ({...copy(l),start:unendpoint(l.start,fish),end:unendpoint(l.end,fish)}));
    state.rope.active = data.ropeActive;
    state.rope.current = {...copy(data.current),startWall:data.current.startWall>=0?m.mazeWalls[data.current.startWall]:null,startAttachment:unendpoint(data.current.startAttachment,fish)};
    for (const k of MAZE_FIELDS) if (data.maze[k] !== undefined) m[k]=copy(data.maze[k]);
    m.oxygenTanks.forEach((t:any)=>t.consumed=(m.consumedTankIds||[]).includes(t.id));
    if(data.stamina)Object.assign(state.semiAutoDrive,data.stamina,{lastUpdateAt:Date.now(),thrusting:false,effort:0});
    Object.assign(w,copy(data.world)); w.panel=null; w.pendingAction=null; w.actionTime=0; w.hidden=false;
    w.savedAt=data.timestamp; w.saveOK=true; w.notice='已原位续接章节；离线期间世界没有偷偷推进';w.noticeUntil=w.elapsed+4;
    m.mazeExplored=unpackExplored(data.explored,m.mazeRows,m.mazeCols);state.markers=copy(data.markers);
    (state as any).extraction=copy(data.extraction);state.story2=copy(data.story);
    Object.assign(getBCDRuntime(),copy(data.bcd),{inflateHeld:false,deflateHeld:false,inflateBurstRemain:0,deflateBurstRemain:0,inflating:false,deflating:false});
    Object.assign(getDecoRuntime(),copy(data.deco),{boostActive:false});
    CONFIG.lightRange=data.config.lightRange;CONFIG.maze.moveSpeed=data.config.moveSpeed;CONFIG.breath.o2PerBreathPeak=data.config.breathPeak;
    state.interaction=createInteractionState();state.interaction.nextLinkId=Math.max(0,...state.rope.links.map(l=>l.id))+1;
    resetRopeMotion();m.phase='play';
    restoredSnapshot=captureWorld();
}
