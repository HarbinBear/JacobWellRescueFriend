import { CONFIG } from '../../src/core/config';
import { state, player, input, createFishBumpState } from '../../src/core/state';
import { resetDriveInput } from '../../src/logic/DriveMode';
import { processJoystickDrive } from '../../src/logic/JoystickDrive';
import { processSemiAutoDrive } from '../../src/logic/SemiAutoDrive';
import { processManualDrive } from '../../src/logic/ManualDrive';
import { updateInteractionMovement, resetInteractions } from '../../src/logic/Interaction';
import { updateRopeMotion, updateRopeSystem, resolveWovenRopeContact, getRopeContact, steadyRopeContact } from '../../src/logic/Rope';
import { updateAllFishEnemies, createFishEnemy, FishEnemy } from '../../src/logic/FishEnemy';
import { updateOxygenTanks, triggerO2LossFlash } from '../../src/logic/OxygenTank';
import { updateLifeDetector } from '../../src/logic/LifeDetector';
import { updateRelicDiscovery } from '../../src/logic/Relic';
import { updateRescueLink } from '../../src/logic/RescueLink';
import { updateRescueTow } from '../../src/logic/RescueTow';
import { isRescueTargetVisible } from '../../src/logic/NPCPerception';
import { updateWheelButtonVisibility } from '../../src/logic/Marker';
import { updateParticles, updateSplashes } from '../../src/logic/Particle';
import { resetBreathSystem, updateBreathSystem, consumeBreathO2, computeBuoyancyOffset } from '../../src/logic/BreathSystem';
import { updateBCDSystem, computeBCDBuoyancyAccel, consumeBCDO2, releaseBCDControls, getBCDRuntime, resetBCDSystem } from '../../src/logic/BCDSystem';
import { updateDecompressionSystem } from '../../src/logic/DecompressionSystem';
import { updateRegulatorAnim } from '../../src/logic/CollisionImpact';
import { updateCarryItemAnim } from '../../src/extraction';
import { getActiveAirTanks } from '../../src/extraction/logic/Loadout';
import { resetAdaptiveMusic } from '../../src/audio/AdaptiveMusic';
import { saveWorldProgress, readWorldSnapshot, restoreWorld, WorldSnapshot } from './WorldSave';
import { activeWorld, attachWorldTerrain, world, bodyWet, groundAt, bankSupport, slopeAt, sweptMove, circleCollision, landAmount,
    clamp, smooth, layout, stationPosition, WorldStation, depthMeters } from './Geometry';

let booting = false, pending: WorldSnapshot | null = null, bootstrap: (() => void) | null = null;
let lastFrame = 0, accumulated = 0, nextSave = 0, lifecycleBound = false;
export function shouldEnterWorld(rockTrial = false) { return !rockTrial && !booting; }
export function isBootingWorld() { return booting; }
export function previewSeed() { return pending?.seed ?? 26110941; }
export function enterContinuousWorld(originalBootstrap: () => void) {
    pending = readWorldSnapshot(); bootstrap = originalBootstrap; booting = true;
    try {
        originalBootstrap();
        const m: any = state.mazeRescue, w = attachWorldTerrain(m);
        w.airTanks = getActiveAirTanks(); m.phase='play';m.briefingShown=true;m.startTime=Date.now();
        m.caseNumber='林泉营地 · 连续章节';m.npcSecuredAt=0;
        state.fishEnemies.forEach((f:any) => f.worldId=w.nextFishId++);
        for (const [dx,dy,kind] of [[-224,92,'curious'],[22,176,'curious'],[200,155,'shoal'],[246,227,'shoal']] as const) {
            const f: any = createFishEnemy(w.originX+dx,w.surfaceY+dy,w.originX+dx,w.surfaceY+dy,110,kind);
            f.worldId=w.nextFishId++;f.vx=f.vy=0;state.fishEnemies.push(f);
        }
        state.fishBump=createFishBumpState();resetInteractions();resetDriveInput();releaseBCDControls();resetBreathSystem();
        if (pending) restoreWorld(pending);
        else { player.x=w.originX+layout.spawn[0];player.y=groundAt(player.x)-layout.footReach;player.vx=player.vy=0;player.angle=player.targetAngle=-Math.PI/2; resetBCDSystem(); }
        state.camera.x=player.x+90;state.camera.y=player.y+35;state.camera.targetX=state.camera.x;state.camera.targetY=state.camera.y;
        state.camera.zoom=state.camera.targetZoom=.92;state.camera.swayX=state.camera.swayY=0;state.camera.vx=state.camera.vy=0;
        state.screen='mazeRescue';lastFrame=0;accumulated=0;nextSave=w.elapsed+4;
        if (!pending) saveWorldProgress();
        if (!lifecycleBound) {
            lifecycleBound=true;
            if((wx as any).onHide)(wx as any).onHide(()=>{if(!activeWorld())return;const w=world()!;if(!w.hidden)w.hiddenAt=Date.now();w.hidden=true;saveWorldProgress();resetDriveInput();releaseBCDControls();});
            if((wx as any).onShow)(wx as any).onShow(()=>{if(!activeWorld())return;const w=world()!,now=Date.now(),paused=w.hidden?now-(w.hiddenAt||now):0;for(const f of state.fishEnemies)if(f.stunUntil>0)f.stunUntil+=paused;w.hidden=false;w.hiddenAt=0;state.semiAutoDrive.lastUpdateAt=now;lastFrame=0;accumulated=0;});
            if(typeof window!=='undefined') {window.addEventListener('pagehide',()=>{if(activeWorld())saveWorldProgress();});window.addEventListener('beforeunload',()=>{if(activeWorld())saveWorldProgress();});}
        }
    } finally { booting=false; pending=null; }
}
export function continueWithoutDiveReset() { if(activeWorld()&&!booting){notice('沿浅滩直接入水；本章节不会按次重置');return true;}return false; }
export function notice(text:string,seconds=4) {const w=world();if(w){w.notice=text;w.noticeUntil=w.elapsed+seconds;}}
export function exitContinuousWorld() {if(activeWorld())saveWorldProgress();resetDriveInput();releaseBCDControls();resetAdaptiveMusic();state.screen='menu';}
export function resumeContinuousWorld() {if(bootstrap)enterContinuousWorld(bootstrap);}
export function toggleOverview() {const w:any=world();if(w)w.overview=!w.overview;}
export function closeWorldPanel() {const w=world();if(w)w.panel=null;resetDriveInput();}

function movePlayer() {
    const w=world()!, from={x:player.x,y:player.y}, supportTarget=landAmount(player.x);
    const nearGround=Number.isFinite(groundAt(player.x))&&groundAt(player.x)-player.y<90;
    const slope=slopeAt(player.x);
    let foot=Math.max(layout.footReach*supportTarget+20*(1-supportTarget),18*Math.sqrt(1+slope*slope)+1.5);
    const land=w.grounded&&supportTarget>.10 || nearGround&&supportTarget>.65&&groundAt(player.x)-player.y-foot<10;
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
        if(Number.isFinite(nextGround)&&rise<=Math.abs(player.vx)*1.7+4&&!circleCollision(nextX,nextGround-foot,Math.min(18,foot-2))) {
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
        if(wet>.7){updateBCDSystem(1/60);player.vy+=(computeBCDBuoyancyAccel()+computeBuoyancyOffset())*wet;}
        else {releaseBCDControls();(getBCDRuntime() as any).active=false;player.vy+=.37*(1-wet);player.vx*=.97;}
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
export function moveContinuousFish(fish:FishEnemy,effort={x:fish.vx,y:fish.vy}) {
    const w=world()!, f:any=fish, from={x:f.x,y:f.y};
    const work=state.interaction.task;
    if(work?.phase==='perform'&&work.kind==='stun'&&work.target?.fish===fish&&Math.hypot(player.x-work.point.x,player.y-work.point.y)<=CONFIG.fishInteraction.handReach+3){fish.vx*=.12;fish.vy*=.12;if(!getRopeContact(fish))return null;}
    if(work?.phase==='perform'&&(work.kind==='stun'&&work.target?.fish===fish||work.kind==='tie'&&work.anchor?.fish===fish)&&Math.hypot(player.x-work.point.x,player.y-work.point.y)<=CONFIG.fishInteraction.handReach+8&&steadyRopeContact(fish)){fish.vx=fish.vy=0;return 'snag';}
    const size=CONFIG.fishEnemy.size,radius=size*(f.kind==='shoal'?.18:f.kind==='rammer'?.48:f.kind==='provoked'?.64:.38);
    const wet=bodyWet(f.y,radius), grounded=!!f.shoreGrounded;
    f.vy+=.32*(1-wet);if(wet<.2){f.vx*=grounded?.84:.985;f.vy*=.98;}
    const nextX=f.x+f.vx, floor=groundAt(nextX),slope=slopeAt(nextX);
    const support=Math.max(radius+.8,radius*.85*Math.sqrt(1+slope*slope)+1.5);
    if(grounded&&Number.isFinite(floor)&&Math.abs(floor-support-f.y)<Math.abs(f.vx)*1.8+7&&!circleCollision(nextX,floor-support,radius*.85)) {
        f.x=nextX;f.y=floor-support;f.vy=Math.min(0,f.vy);f.shoreGrounded=true;
    } else {sweptMove(f,radius*.85);f.shoreGrounded=bankSupport(f,support);}
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
    c.targetZoom=overview?Math.min(CONFIG.screenWidth/(layout.maxX-layout.minX+160),CONFIG.screenHeight/1080):(CONFIG.screenWidth>CONFIG.screenHeight?.9:.96);
    c.zoom+=(c.targetZoom-c.zoom)*.08;
    c.targetX=overview?w.originX+(layout.minX+layout.maxX)/2:player.x+Math.cos(input.targetAngle)*input.move*58;
    c.targetY=overview?650:player.y+30*w.landBlend;
    c.x+=(c.targetX-c.x)*.105;c.y+=(c.targetY-c.y)*.085;
    c.swayTime+=1/60;c.swayX=Math.sin(c.swayTime*.63)*w.wet*.8;c.swayY=Math.sin(c.swayTime*.81)*w.wet*.6;
}
function tickWorld() {
    const m:any=state.mazeRescue,w=world()!;w.elapsed+=1/60;
    const wasHeadWet=w.headWet,oldWet=w.wet;
    state.fx.shake*=.84;state.fx.redOverlay*=.96;
    updateRopeMotion();movePlayer();w.wet=bodyWet(player.y);
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
    if(w.headWet) {
        updateBreathSystem();let o2=consumeBreathO2()+consumeBCDO2();
        if(depthMeters(player.y)>m.maxDepthAllowed)o2*=1.5;
        if(!CONFIG.infiniteO2&&o2>0){const old=player.o2;player.o2=Math.max(0,old-o2);if(o2>.1)triggerO2LossFlash(old,player.o2);}
    }
    if(CONFIG.infiniteO2)player.o2=player.o2Max;
    updateDecompressionSystem(1/60);updateRegulatorAnim();updateCarryItemAnim();updateAllFishEnemies(1);
    // There is no success radius at the old exit, no debrief and no inventory
    // liquidation. A casualty remains a physical body until the camp receives it.
    if(m.phase!=='play'){m.phase='play';notice('需要处理身体状态；章节世界与所有牵引仍然保留',6);}
    if(player.o2<=0&&w.headWet)w.panel='depleted';
    const ground=groundAt(player.x);if(w.landBlend>.5&&Number.isFinite(ground)&&player.y>ground-layout.footReach+12)bankSupport(player,layout.footReach,true);
    m.maxDepthReached=Math.max(m.maxDepthReached||0,Math.max(0,player.y-w.surfaceY));
    const ts=m.mazeTileSize,r=Math.floor(player.y/ts),c=Math.floor(player.x/ts);
    for(let y=r-3;y<=r+3;y++)for(let x=c-3;x<=c+3;x++)if(m.mazeExplored[y]&&x>=0&&x<m.mazeCols&&Math.hypot(y-r,x-c)<=3)m.mazeExplored[y][x]=true;
    if(!m.playerPath.length||Math.hypot(player.x-m.playerPath[m.playerPath.length-1].x,player.y-m.playerPath[m.playerPath.length-1].y)>22)m.playerPath.push({x:player.x,y:player.y});
    w.stationId=null;let near=Infinity;
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
    const now=typeof performance!=='undefined'?performance.now():Date.now();
    if(!lastFrame){lastFrame=now;return;}accumulated+=Math.min(.10,(now-lastFrame)/1000);lastFrame=now;
    let steps=0;while(accumulated>=1/60&&steps++<6){tickWorld();accumulated-=1/60;}
}
export function useNearestStation() {
    const w=world(),m:any=state.mazeRescue;if(!w||!w.stationId)return;
    resetDriveInput();
    switch(w.stationId){
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
export function setupTowReview(count=3) {
    const w=world();if(!w)return false;
    resetDriveInput();resetInteractions();state.rope.links=[];
    player.x=w.originX-267;player.y=groundAt(player.x)-layout.footReach;player.vx=player.vy=0;player.angle=player.targetAngle=-Math.PI/2;
    w.landBlend=1;w.grounded=true;w.panel=null;w.headWet=false;w.wet=bodyWet(player.y);
    const created:any[]=[];
    for(let i=0;i<count;i++){
        const f:any=createFishEnemy(player.x+45+i*29,w.surfaceY+42+i*26,player.x+60,w.surfaceY+70,110,i===1?'shoal':'curious');
        f.worldId=w.nextFishId++;f.bound=true;f.stunFrames=180;f.stunUntil=Date.now()+3000;f.state='stunned';f.vx=f.vy=0;created.push(f);
        const id=state.interaction.nextLinkId++;
        state.rope.links.push({id,start:{kind:'player',point:{x:player.x,y:player.y}},end:{kind:'fish',point:{x:f.x,y:f.y},fish:f},path:[{x:player.x,y:player.y},{x:f.x,y:f.y}],length:105+i*23,tension:0,age:0});
    }
    state.fishEnemies=state.fishEnemies.filter((f:any)=>!f.reviewTow);created.forEach(f=>f.reviewTow=true);state.fishEnemies.push(...created);
    notice('验收布置：三条鱼分别系在腰上。向左拖上岸，再原路入水。',6);cameraStep();return created.map(f=>f.worldId);
}
export function setupRescueReview() {
    const w=world(),m:any=state.mazeRescue;if(!w)return false;
    player.x=w.originX-1360;player.y=groundAt(player.x)-layout.footReach;player.vx=player.vy=0;w.grounded=true;w.landBlend=1;w.headWet=false;w.panel=null;
    let i=0;for(const fish of state.fishEnemies as any[]){if(!fish.reviewTow||!fish.bound)continue;fish.x=player.x+48+i++*24;fish.y=groundAt(fish.x)-24;fish.vx=fish.vy=0;fish.shoreGrounded=true;}
    Object.assign(state.npc,{active:true,x:w.originX-1250,y:groundAt(w.originX-1250)-24,vx:0,vy:0,state:'follow'});
    m.npcRescued=true;m.npcStunned=true;m.rescueRagdoll=null;w.chapterStatus='searching';notice('验收布置：救援绳仍连接。把对象实际带到帐篷，再移交。',5);return true;
}
