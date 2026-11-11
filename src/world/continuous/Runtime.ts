import { updateWorldAssets, worldAssetsBlocked } from './WorldAssets';
import { ensureFishIdentities } from './FishIdentity';
import { CONFIG } from '../../core/config';
import { fishKnotPoint } from '../../logic/FishGeometry';
import { closestWorldSurface } from './Routes';
import { state, player, input, createFishBumpState } from '../../core/state';
import { resetDriveInput } from '../../logic/DriveMode';
import { updateCameraSpringArm, snapCameraToPlayer, getAdaptiveZoom } from '../../logic/CameraLogic';
import { resetCollisionImpact } from '../../logic/CollisionImpact';
import { processJoystickDrive } from '../../logic/JoystickDrive';
import { processSemiAutoDrive } from '../../logic/SemiAutoDrive';
import { processManualDrive } from '../../logic/ManualDrive';
import { updateInteractionMovement, resetInteractions, cancelInteractionInput } from '../../logic/Interaction';
import { updateRopeMotion, updateRopeSystem, resolveWovenRopeContact, getRopeContact, steadyRopeContact, cancelRopePlacement, getPlayerRopeEnds, removeTether, releaseRopeContact } from '../../logic/Rope';
import { updateAllFishEnemies, createFishEnemy, FishEnemy } from '../../logic/FishEnemy';
import { updateOxygenTanks, triggerO2LossFlash } from '../../logic/OxygenTank';
import { updateLifeDetector } from '../../logic/LifeDetector';
import { updateRelicDiscovery } from '../../logic/Relic';
import { updateRescueLink } from '../../logic/RescueLink';
import { updateRescueTow } from '../../logic/RescueTow';
import { isRescueTargetVisible } from '../../logic/NPCPerception';
import { updateWheelButtonVisibility } from '../../logic/Marker';
import { updateParticles, updateSplashes } from '../../logic/Particle';
import { resetBreathSystem, updateBreathSystem, advanceBreathBubbles, consumeBreathO2, computeBuoyancyOffset } from '../../logic/BreathSystem';
import { updateBCDSystem, computeBCDBuoyancyAccel, consumeBCDO2, releaseBCDControls, resetBCDSystem } from '../../logic/BCDSystem';
import { updateDecompressionSystem, resetDecompressionSystem } from '../../logic/DecompressionSystem';
import { updateRegulatorAnim } from '../../logic/CollisionImpact';
import { updateCarryItemAnim } from '../../extraction';
import { getActiveAirTanks } from '../../extraction/logic/Loadout';
import { resetAdaptiveMusic } from '../../audio/AdaptiveMusic';
import { saveWorldProgress, readWorldSnapshot, restoreWorld, clearWorldSnapshot, WorldSnapshot } from './WorldSave';
import { activeWorld, attachWorldTerrain, world, bodyWet, groundAt, bankSupport, slopeAt, sweptMove, circleCollision, landAmount,
    clamp, smooth, layout, stationPosition, WorldStation, depthMeters } from './Geometry';

let booting = false, pending: WorldSnapshot | null = null, bootstrap: (() => void) | null = null;
let lastFrame = 0, accumulated = 0, nextSave = 0, lifecycleBound = false;
let freshSeed: number | null = null, navigationPausedAt = 0, assetPausedAt = 0;
export function shouldEnterWorld(rockTrial = false) { return CONFIG.continuousWorld && !rockTrial && !booting; }
export function isBootingWorld() { return booting; }
export function previewSeed() { return pending?.seed ?? freshSeed ?? 26110941; }
function settleInitialPoint(body:any,radius:number){
    if(!circleCollision(body.x,body.y,radius))return;const m:any=state.mazeRescue,ts=m.mazeTileSize,r=Math.floor(body.y/ts),c=Math.floor(body.x/ts);let best:any=null;
    const consider=(rr:number,cc:number)=>{const x=(cc+.5)*ts,y=(rr+.5)*ts;if(rr<0||cc<0||rr>=m.mazeRows||cc>=m.mazeCols||m.mazeMap[rr]?.[cc]!==0||y<(world()?.surfaceY||0)+radius||circleCollision(x,y,radius))return;const d=Math.hypot(x-body.x,y-body.y);if(!best||d<best.d)best={x,y,d};};
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)consider(r+dy,c+dx);
    if(!best)for(let rr=0;rr<m.mazeRows;rr++)for(let cc=0;cc<m.mazeCols;cc++)consider(rr,cc);
    if(best){body.x=best.x;body.y=best.y;if('vx' in body)body.vx=body.vy=0;}
}
export function enterContinuousWorld(originalBootstrap: () => void, seed?: number) {
    freshSeed = seed === undefined ? null : seed >>> 0;
    pending = freshSeed === null ? readWorldSnapshot() : null; bootstrap = originalBootstrap; booting = true; navigationPausedAt = 0; assetPausedAt = 0;
    try {
        originalBootstrap();
        const m: any = state.mazeRescue;
        m.karstGeneration=pending?(pending.config.karstGeneration||'legacy'):CONFIG.karst.geometryMode;
        const w = attachWorldTerrain(m);
        w.airTanks = getActiveAirTanks(); m.phase='play';m.briefingShown=true;m.startTime=Date.now();
        m.caseNumber='林泉营地 · 连续章节';m.npcSecuredAt=0;
        for (const [dx,dy,kind] of [[-224,92,'curious'],[22,176,'curious'],[200,155,'shoal'],[246,227,'shoal']] as const) {
            const f: any = createFishEnemy(w.originX+dx,w.surfaceY+dy,w.originX+dx,w.surfaceY+dy,110,kind);
            f.vx=f.vy=0;state.fishEnemies.push(f);
        }
        ensureFishIdentities(state.fishEnemies, w);
        for(const f of state.fishEnemies)settleInitialPoint(f,CONFIG.fishEnemy.size*(f.kind==='shoal'?.18:f.kind==='rammer'?.48:f.kind==='provoked'?.64:.38));
        for(const t of m.oxygenTanks||[])settleInitialPoint(t,16);for(const relic of m.relics||[])settleInitialPoint(relic,8);
        state.fishBump=createFishBumpState();resetInteractions();resetDriveInput();releaseBCDControls();resetBreathSystem();
        if (pending) restoreWorld(pending);
        else { player.x=w.originX+layout.spawn[0];player.y=groundAt(player.x)-layout.footReach;player.vx=player.vy=0;player.angle=player.targetAngle=-Math.PI/2; resetBCDSystem(); }
        snapCameraToPlayer();state.camera.zoom=state.camera.targetZoom=1;
        state.screen='mazeRescue';lastFrame=0;accumulated=0;nextSave=w.elapsed+4;
        if (!pending) saveWorldProgress();
        if (!lifecycleBound) {
            lifecycleBound=true;
            if((wx as any).onHide)(wx as any).onHide(()=>{if(!activeWorld())return;advanceAssetPause();advanceNavigationPause();const w=world()!;if(!w.hidden)w.hiddenAt=Date.now();w.hidden=true;saveWorldProgress();resetDriveInput();releaseBCDControls();});
            if((wx as any).onShow)(wx as any).onShow(()=>{if(!activeWorld())return;const w=world()!,now=Date.now(),paused=w.hidden?now-(w.hiddenAt||now):0;if(!navigationPausedAt&&!assetPausedAt)for(const f of state.fishEnemies)if(f.stunUntil>0)f.stunUntil+=paused;w.hidden=false;w.hiddenAt=0;state.semiAutoDrive.lastUpdateAt=now;lastFrame=0;accumulated=0;});
            if(typeof window!=='undefined'&&typeof window.addEventListener==='function') {window.addEventListener('pagehide',()=>{if(activeWorld()){advanceAssetPause();advanceNavigationPause();saveWorldProgress();}});window.addEventListener('beforeunload',()=>{if(activeWorld()){advanceAssetPause();advanceNavigationPause();saveWorldProgress();}});}
        }
    } finally { booting=false; pending=null; freshSeed=null; }
}
export function continueWithoutDiveReset() { if(activeWorld()&&!booting){notice('沿浅滩直接入水；本章节不会按次重置');return true;}return false; }
export function notice(text:string,seconds=4) {const w=world();if(w){w.notice=text;w.noticeUntil=w.elapsed+seconds;}}
export function exitContinuousWorld() {
    advanceAssetPause();
    const wasNavigation=isWorldNavigationOpen();if(wasNavigation)closeWorldPanel();
    if(activeWorld()&&!saveWorldProgress()) {if(wasNavigation)openWorldNavigation();notice('保存未成功，请稍后重试；当前探索仍保留在游戏中',7);return false;}
    resetDriveInput();releaseBCDControls();cancelInteractionInput();resetAdaptiveMusic();state.screen='menu';return true;
}
export function resumeContinuousWorld() {if(bootstrap)enterContinuousWorld(bootstrap);}
export function restartTestChapter(){clearWorldSnapshot();resetDriveInput();releaseBCDControls();if(bootstrap)enterContinuousWorld(bootstrap);}
export function toggleOverview() {const w:any=world();if(w)w.overview=!w.overview;}
export function isWorldNavigationOpen() {const panel=world()?.panel;return activeWorld()&&(panel==='navigation'||panel==='confirm-next-world');}
export function openWorldNavigation() {
    const w=world();if(!activeWorld()||!w)return;
    if(!navigationPausedAt)navigationPausedAt=Date.now();w.panel='navigation';
    cancelInteractionInput();resetDriveInput();releaseBCDControls();state.wheel.open=false;
}
export function requestNextWorld() {if(!isWorldNavigationOpen())return;world()!.panel='confirm-next-world';}
function advanceAssetPause() {
    if(!assetPausedAt)return;
    const now=Date.now(),paused=Math.max(0,now-assetPausedAt);
    if(!navigationPausedAt)for(const f of state.fishEnemies)if(f.stunUntil>0)f.stunUntil+=paused;
    assetPausedAt=now;
}
function advanceNavigationPause() {
    if(!navigationPausedAt)return;const now=Date.now(),paused=Math.max(0,now-navigationPausedAt);
    for(const f of state.fishEnemies)if(f.stunUntil>0)f.stunUntil+=paused;navigationPausedAt=now;
}
export function closeWorldPanel() {
    const w=world();if(w)w.panel=null;
    advanceNavigationPause();navigationPausedAt=0;
    resetDriveInput();lastFrame=0;accumulated=0;
}
export function startNextContinuousWorld() {
    if(world()?.panel!=='confirm-next-world'||!bootstrap)return false;
    const nextSeed=((state.mazeRescue as any).seed+0x9e3779b9)>>>0;
    closeWorldPanel();
    if(!saveWorldProgress()){openWorldNavigation();notice('当前进度保存失败，暂未换地图。请稍后重试。',7);return false;}
    // 先保留旧档；新地图建成后沿用原保存流程写入，并将上一张留作备份。
    try {enterContinuousWorld(bootstrap,nextSeed);notice('已抵达新的泉井；从营地开始这张地图',6);return true;}
    catch(error){console.error('[连续世界] 新地图生成失败，恢复上一张',error);enterContinuousWorld(bootstrap);notice('新地图未能生成，已恢复上一张地图',7);return false;}
}

export function returnToShoreAfterDeath() {returnToShore('death');}
export function quickReturnToShore() {returnToShore('quick');}
function returnToShore(reason:'death'|'quick') {
    const w=world(),m=state.mazeRescue;if(!w||!m)return;
    closeWorldPanel();
    cancelInteractionInput();cancelRopePlacement();releaseRopeContact(player);
    for(const {link} of getPlayerRopeEnds())removeTether(link);
    // Disconnect only the lost diver: neither the fish nor the casualty teleport.
    if(state.npc.active){m.npcRescued=false;m.npcSecuredAt=0;}
    m.npcRescueHolding=false;m.npcRescueHoldStart=0;m.npcRescueTouchId=null;
    resetDriveInput(true);releaseBCDControls();resetBreathSystem();resetDecompressionSystem();resetCollisionImpact();
    state.fishBump=createFishBumpState();state.fishBite=null;
    player.x=w.originX+layout.spawn[0];player.y=groundAt(player.x)-layout.footReach;
    player.vx=player.vy=0;player.angle=player.targetAngle=-Math.PI/2;player.o2=player.o2Max;
    Object.assign(w,{grounded:true,landBlend:1,wet:0,headWet:false,resting:false,panel:null,pendingAction:null,actionTime:0,stationId:null});
    resetBCDSystem();
    state.fx.shake=0;state.fx.redOverlay=0;
    w.journal.push({time:w.elapsed,text:reason==='death'?'水下遇险，返回岸上休息区；已探索的洞穴与固定绳网保留':'快速回到岸上休息区；已探索的洞穴与固定绳网保留'});
    notice('已回到岸上休息区。洞穴进度与固定绳网保留；鱼和被救者留在原处，腰扣牵引已解除。',7);
    snapCameraToPlayer();state.camera.zoom=state.camera.targetZoom=1;saveWorldProgress();nextSave=w.elapsed+4;
}
export function toggleRest() {
    const w=world();if(!w)return;
    if(w.resting){w.resting=false;notice('休息好了，继续探索吧');}
    else {
        if(w.headWet||!w.grounded||Math.abs(player.x-w.originX-layout.rest.x)>105)return;
        if(getPlayerRopeEnds().length||state.mazeRescue?.npcRescued){notice('先解开腰扣上的牵引绳，再躺下休息');return;}
        cancelInteractionInput();resetDriveInput();w.pendingAction=null;w.resting=true;
        player.x=w.originX+layout.rest.x-20;player.y=groundAt(player.x)-layout.footReach;player.vx=player.vy=0;
        notice('躺在竹躺椅上晒会儿太阳；拖动空白处或点起身即可继续探索',5);
    }
    saveWorldProgress();
}
function movePlayer() {
    const w=world()!;
    if(w.resting){
        if(input.move>0||Object.keys(state.manualDrive.activeTouches).length||state.interaction.task)w.resting=false;
        else {player.vx=player.vy=0;state.semiAutoDrive.remaining=Math.min(1,state.semiAutoDrive.remaining+1/240);state.semiAutoDrive.exhausted=false;return;}
    }
    const from={x:player.x,y:player.y}, supportTarget=landAmount(player.x);
    const groundGap=groundAt(player.x)-player.y;
    const nearGround=Number.isFinite(groundGap)&&groundGap>=0&&groundGap<90;
    const slope=slopeAt(player.x);
    let foot=Math.max(layout.footReach*supportTarget+20*(1-supportTarget),18*Math.sqrt(1+slope*slope)+1.5);
    const contactGap=groundGap-foot;
    const land=nearGround&&Math.abs(contactGap)<=10&&(w.grounded&&supportTarget>.10||supportTarget>.65)&&!circleCollision(player.x,player.y,16);
    if(w.panel||player.o2<=0&&w.headWet){input.move=0;input.speedUp=false;player.vx*=.6;}
    const work=updateInteractionMovement();
    if(land) {
        if(!work) {
            let direction=0;
            if(CONFIG.driveMode==='manual') {processManualDrive();if(state.manualDrive.hasInput)direction=Math.cos(state.manualDrive.lastInputAngle);}
            else if(input.move>0)direction=Math.cos(input.targetAngle)*(CONFIG.driveMode==='semiAuto'?Math.max(.6,state.semiAutoDrive.inputPower||1):1);
            const speed=(input.speedUp?4.3:3.3)*(1-.52*w.wet), target=direction*speed;
            player.vx+=(target-player.vx)*.23;if(Math.abs(player.vx)<.025)player.vx=0;
            if(Math.abs(direction)>.05)w.facing=direction>0?1:-1;
        }
        const nextX=player.x+player.vx, nextGround=groundAt(nextX), oldGround=groundAt(player.x);
        const rise=oldGround-nextGround;
        if(Number.isFinite(nextGround)&&Math.abs(nextGround-foot-player.y)<=Math.abs(player.vx)*1.7+6&&rise<=Math.abs(player.vx)*1.7+4&&!circleCollision(nextX,nextGround-foot,Math.min(18,foot-2))) {
            player.x=nextX;player.y=nextGround-foot;player.vy=0;w.grounded=true;
        } else {sweptMove(player,18);w.grounded=bankSupport(player,foot,true);}
    } else {
        const wet=bodyWet(player.y);
        if(!work) {
            const vx=player.vx,vy=player.vy,propulsion=CONFIG.maze.moveSpeed||CONFIG.moveSpeed;
            if(!processManualDrive()&&!processSemiAutoDrive(propulsion))processJoystickDrive(propulsion);
            player.vx=vx*.985*(1-wet)+player.vx*wet;
            player.vy=vy*.985*(1-wet)+player.vy*wet;
        }
        player.vy+=computeBCDBuoyancyAccel()+computeBuoyancyOffset()*wet;
        if(wet<=.7){player.vy+=.37*(1-wet);player.vx*=.97;}
        const cap=9,speed=Math.hypot(player.vx,player.vy);if(speed>cap){player.vx*=cap/speed;player.vy*=cap/speed;}
        // Contact with the low-angle ramp converts lateral movement into stepping,
        // not a scripted climb or a teleport. Each correction stays below 6px.
        const nx=player.x+player.vx, gy=groundAt(nx), amount=landAmount(nx);
        if(amount>.2&&Number.isFinite(gy)&&circleCollision(nx,player.y,18)&&Math.abs(gy-foot-player.y)<Math.abs(player.vx)*1.7+6) {
            player.x=nx;player.y=gy-foot;player.vy=0;w.grounded=true;
        } else {sweptMove(player,18);w.grounded=bankSupport(player,foot)&&amount>.12;}
    }
    resolveWovenRopeContact(player,from,18,{x:Math.cos(input.targetAngle)*input.move*7,y:Math.sin(input.targetAngle)*input.move*7},(x,y)=>!circleCollision(x,y,18));
    w.landBlend+=(clamp(w.grounded?landAmount(player.x):0)-w.landBlend)*.13;
    if(w.landBlend>.05) {
        const swimAngle=input.move>0?input.targetAngle:player.angle;
        const aim=-Math.PI/2+Math.atan2(Math.sin(swimAngle+Math.PI/2),Math.cos(swimAngle+Math.PI/2))*(1-w.landBlend);
        player.angle+=Math.atan2(Math.sin(aim-player.angle),Math.cos(aim-player.angle))*.19;
    }
    w.walkPhase=(w.walkPhase+Math.abs(player.x-from.x)/52)%1;
    player.animTime=(player.animTime||0)+.05+Math.hypot(player.vx,player.vy)*.035;
    if(w.landBlend>.7&&Math.floor(w.walkPhase*2)!==Math.floor(((w.walkPhase-Math.abs(player.x-from.x)/52+1)%1)*2)&&Math.abs(player.vx)>.15) {
        w.events.push({x:player.x,y:groundAt(player.x),age:0,strength:.2,kind:groundAt(player.x)>w.surfaceY?'stepWater':'step'});
    }
}
function clearFishKnot(fish:FishEnemy,radius:number){
    if(!fish.bound)return;const knot=fishKnotPoint(fish),near=closestWorldSurface(knot.x,knot.y,32);if(near.dist>=2.5)return;
    const nx=near.nx,ny=near.ny;
    const correction=Math.min(2.5,2.5-near.dist),x=fish.x+nx*correction,y=fish.y+ny*correction;
    if(!circleCollision(x,y,radius)){fish.x=x;fish.y=y;const into=fish.vx*nx+fish.vy*ny;if(into<0){fish.vx-=nx*into;fish.vy-=ny*into;}}
}
export function moveContinuousFish(fish:FishEnemy,effort={x:fish.vx,y:fish.vy}) {
    const w=world()!, f:any=fish, from={x:f.x,y:f.y};
    const work=state.interaction.task;
    if(work?.phase==='perform'&&work.kind==='stun'&&work.target?.fish===fish&&Math.hypot(player.x-work.point.x,player.y-work.point.y)<=CONFIG.fishInteraction.handReach+3){fish.vx*=.12;fish.vy*=.12;if(!getRopeContact(fish))return null;}
    if(work?.phase==='perform'&&(work.kind==='stun'&&work.target?.fish===fish||work.kind==='tie'&&work.anchor?.fish===fish)&&Math.hypot(player.x-work.point.x,player.y-work.point.y)<=CONFIG.fishInteraction.handReach+8&&steadyRopeContact(fish)){fish.vx=fish.vy=0;return 'snag';}
    const size=CONFIG.fishEnemy.size,radius=size*(f.kind==='shoal'?.18:f.kind==='rammer'?.48:f.kind==='provoked'?.64:.38);
    const wet=bodyWet(f.y,radius), grounded=!!f.shoreGrounded;
    f.vy+=.32*(1-wet);if(wet<.2){f.vx*=grounded?.84:.985;f.vy*=.98;}
    const nextX=f.x+f.vx, floor=groundAt(nextX),slope=slopeAt(nextX);
    const knot=fishKnotPoint(fish),knotSupport=fish.bound?(knot.y-fish.y)-slope*(knot.x-fish.x)+2.5*Math.sqrt(1+slope*slope)+1:0;
    const support=Math.max(radius+.8,radius*Math.sqrt(1+slope*slope)+1.5,knotSupport);
    const lifting=(slope*f.vx-f.vy)/Math.sqrt(1+slope*slope)>.22;
    if(grounded&&!lifting&&Number.isFinite(floor)&&Math.abs(floor-support-f.y)<Math.abs(f.vx)*1.8+7&&!circleCollision(nextX,floor-support,radius)) {
        const oldY=f.y;f.x=nextX;f.y=floor-support;f.vy=f.y-oldY;f.shoreGrounded=true;
    } else {sweptMove(f,radius);f.shoreGrounded=!lifting&&bankSupport(f,support);}
    clearFishKnot(fish,radius);
    if(!f.bound&&f.y<w.surfaceY+radius){f.y=w.surfaceY+radius;f.vy=Math.max(.12,f.vy);f.shoreGrounded=false;}
    return f.netGraceFrames>0?null:resolveWovenRopeContact(f,from,radius,effort,(x,y)=>!circleCollision(x,y,radius));
}
export function stepAirFish(fish:FishEnemy):boolean {
    const w=world();if(!w||fish.y>w.surfaceY+8)return false;
    const f:any=fish;f.stateTimer++;f.animTime+=.022;f.alertTimer=Math.max(0,f.alertTimer-1);
    if(f.stunFrames>0){f.stunFrames=Math.max(0,(f.stunUntil-Date.now())*.06);f.state=f.stunFrames>0?'stunned':f.bound?'bound':'roam';}
    else if(f.bound){f.state='bound';f.vx+=Math.sin(f.stateTimer*.17)*.025;f.angle+=Math.sin(f.stateTimer*.21)*.006;}
    if(f.shoreGrounded){const heading=Math.abs(f.vx)>.05?(f.vx<0?Math.PI:0):(Math.cos(f.angle)<0?Math.PI:0);f.angle+=Math.atan2(Math.sin(heading-f.angle),Math.cos(heading-f.angle))*.065;}
    moveContinuousFish(f);return true;
}
function cameraStep() {
    const w:any=world()!, c=state.camera;
    const overview=!!w.overview;
    if(overview){
        c.targetZoom=Math.min(CONFIG.screenWidth/(layout.maxX-layout.minX+160),CONFIG.screenHeight/1080);
        c.zoom+=(c.targetZoom-c.zoom)*.08;c.targetX=w.originX+(layout.minX+layout.maxX)/2;c.targetY=690;
        c.x+=(c.targetX-c.x)*.105;c.y+=(c.targetY-c.y)*.085;c.vx=c.vy=0;c.swayX=c.swayY=0;return;
    }
    updateCameraSpringArm();
    c.targetZoom=getAdaptiveZoom();c.zoom+=(c.targetZoom-c.zoom)*.02;
    c.swayX*=w.wet;c.swayY*=w.wet;
}
export function tickWorld() {
    const m:any=state.mazeRescue,w=world()!;w.elapsed+=1/60;
    const wasHeadWet=w.headWet,oldWet=w.wet;
    state.fx.shake*=.84;state.fx.redOverlay*=.96;
    updateBCDSystem(1/60);updateRopeMotion();movePlayer();w.wet=bodyWet(player.y);
    const headY=player.y+Math.sin(player.angle)*24;
    if(!w.headWet&&headY>w.surfaceY+5)w.headWet=true;
    if(w.headWet&&headY<w.surfaceY-5)w.headWet=false;
    if(w.headWet!==wasHeadWet){resetBreathSystem();w.events.push({x:player.x,y:w.surfaceY,age:0,strength:clamp(Math.abs(player.vy)/5+.3),kind:'splash'});state.story2.dayHadAnyDive=true;nextSave=Math.min(nextSave,w.elapsed+.3);}
    if(Math.abs(w.wet-oldWet)>.1&&!w.events.some(e=>e.kind==='splash'&&e.age<.1))w.events.push({x:player.x,y:w.surfaceY,age:0,strength:.35,kind:'splash'});
    updateRopeSystem();updateWheelButtonVisibility();updateOxygenTanks();updateLifeDetector();updateRelicDiscovery();
    if(state.wheel.open)state.wheel.expandProgress=Math.min(1,state.wheel.expandProgress+.15);
    if(state.npc.active){
        if(m.npcStunned){if(state.npc.y<w.surfaceY)state.npc.vy+=.26;updateRescueTow();bankSupport(state.npc,23);}
        else {state.npc.angle+=(Math.atan2(player.y-state.npc.y,player.x-state.npc.x)-state.npc.angle)*.035;}
        if(isRescueTargetVisible()){if(!m.npcFound){m.npcFound=true;nextSave=w.elapsed+.1;}if(!m.npcEncounterNoteAt)m.npcEncounterNoteAt=Date.now();}
    }
    updateRescueLink();
    // 充背心在岸上也使用气瓶；深度已通过气压计入BCD耗气，额外深潜倍率只作用呼吸。
    let o2=consumeBCDO2();
    if(w.headWet) {
        updateBreathSystem();let breathO2=consumeBreathO2();
        if(depthMeters(player.y)>m.maxDepthAllowed)breathO2*=1.5;
        o2+=breathO2;
    } else advanceBreathBubbles();
    if(!CONFIG.infiniteO2&&o2>0){const old=player.o2;player.o2=Math.max(0,old-o2);if(o2>.1)triggerO2LossFlash(old,player.o2);}
    if(CONFIG.infiniteO2)player.o2=player.o2Max;
    updateDecompressionSystem(1/60);updateRegulatorAnim();updateCarryItemAnim();updateAllFishEnemies(1);
    // There is no success radius at the old exit, no debrief and no inventory
    // liquidation. A casualty remains a physical body until the camp receives it.
    if(m.phase==='failed'||player.o2<=0&&w.headWet){m.phase='play';returnToShoreAfterDeath();}
    else if(m.phase!=='play'){m.phase='play';notice('章节世界仍然开放',4);}
    const ground=groundAt(player.x);if(w.landBlend>.5&&Number.isFinite(ground)&&player.y>ground-layout.footReach+12)bankSupport(player,layout.footReach,true);
    m.maxDepthReached=Math.max(m.maxDepthReached||0,Math.max(0,player.y-w.surfaceY));
    const ts=m.mazeTileSize,r=Math.floor(player.y/ts),c=Math.floor(player.x/ts);
    for(let y=r-3;y<=r+3;y++)for(let x=c-3;x<=c+3;x++)if(m.mazeExplored[y]&&x>=0&&x<m.mazeCols&&Math.hypot(y-r,x-c)<=3)m.mazeExplored[y][x]=true;
    if(!m.playerPath.length||Math.hypot(player.x-m.playerPath[m.playerPath.length-1].x,player.y-m.playerPath[m.playerPath.length-1].y)>22)m.playerPath.push({x:player.x,y:player.y});
    w.stationId=null;let near=Infinity;
    if(!w.headWet&&w.landBlend>.5&&Math.abs(player.x-w.originX-layout.rest.x)<105){w.stationId='rest';near=Math.abs(player.x-w.originX-layout.rest.x);}
    if(!w.headWet&&w.landBlend>.5)for(const station of layout.stations){const p=stationPosition(station),d=Math.abs(player.x-p.x);if(d<station.width*.55+46&&d<near){w.stationId=station.id;near=d;}}
    if(w.pendingAction==='air'){
        const s=layout.stations.find(s=>s.id==='air')!,p=stationPosition(s);
        if(w.headWet||Math.abs(player.x-p.x)>s.width*.55+48){w.pendingAction=null;w.actionTime=0;notice('离开充气架，软管已断开；保留已充入的气量');}
        else {w.actionTime+=1/60;player.o2=Math.min(player.o2Max,player.o2+player.o2Max/150);if(w.actionTime>=2.5||player.o2===player.o2Max){w.pendingAction=null;w.actionTime=0;notice('气瓶补满；鱼和腰绳仍跟着你');saveWorldProgress();}}
    }
    for(const e of w.events)e.age+=1/60;w.events=w.events.filter(e=>e.age<1.5).slice(-24);
    cameraStep();updateParticles();updateSplashes();
    if(w.elapsed>=nextSave){saveWorldProgress();nextSave=w.elapsed+4;}
}
export function updateContinuousWorld() {
    const w=world();if(!w||w.hidden)return;
    updateWorldAssets();
    if(worldAssetsBlocked()){
        if(!assetPausedAt)assetPausedAt=Date.now();
        lastFrame=0;accumulated=0;resetDriveInput();releaseBCDControls();return;
    }
    if(assetPausedAt){advanceAssetPause();assetPausedAt=0;}
    if(isWorldNavigationOpen()){advanceNavigationPause();return;}
    const now=typeof performance!=='undefined'?performance.now():Date.now();
    if(!lastFrame){lastFrame=now;return;}accumulated+=Math.min(.10,(now-lastFrame)/1000);lastFrame=now;
    let steps=0;while(accumulated>=1/60&&steps++<6){tickWorld();accumulated-=1/60;}
}
export function useNearestStation() {
    const w=world(),m:any=state.mazeRescue;if(!w||!w.stationId)return;
    resetDriveInput();
    switch(w.stationId){
        case 'rest':toggleRest();break;
        case 'map':w.panel='map';break;
        case 'shop':w.panel='shop';break;
        case 'fish':w.panel='fish';break;
        case 'air':w.pendingAction='air';w.actionTime=0;notice('软管已接到气瓶；离开充气架会中断补给',3);break;
        case 'medical':{
            const s=layout.stations.find(s=>s.id==='medical')!,p=stationPosition(s);
            if(w.chapterStatus==='rescued'){w.panel='medical';break;}
            if(m.npcRescued&&state.npc.active&&state.npc.y<w.surfaceY-15&&Math.abs(state.npc.x-p.x)<190){
                w.chapterStatus='rescued';state.npc.active=false;m.finishTime=Date.now();
                w.journal.push({time:w.elapsed,text:'救援对象已移交医疗营地；本洞章节完成，但世界继续开放'});
                notice('救援对象已由营地接收；可以留在这里继续探索',7);w.panel='medical';saveWorldProgress();
            } else {notice('把被救者实际带到这顶帐篷旁，才能完成移交',5);w.panel='medical';}
            break;
        }
    }
}
