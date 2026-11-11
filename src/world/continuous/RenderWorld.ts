import assetManifest from './Assets';
import { drawMazeWallShape } from '../../render/RenderMazeScene';
import { drawKarstSurface, karstSurfaceStats, karstAssetsReady } from '../../render/RenderKarst';
import { getKarstTerrain, karstStats } from '../KarstTerrain';
import { getKarstBounce } from '../../render/KarstBounce';
import { drawKarstVolume, restoreKarstVolumeLight, karstVolumeStats, getKarstVolumeBounceLights, getKarstVolumeBounceNormals } from '../../render/RenderKarstVolume';
import { CONFIG } from '../../core/config';
import { state, player, particles } from '../../core/state';
import { canvas,ctx,dpr,logicW,logicH } from '../../render/Canvas';
import { registerImage,getImage,isImageReady,releaseImages } from '../../render/ImageAssets';
import { drawDiver } from '../../render/RenderDiver';
import { drawAllFishEnemies, drawFishBiteEffect, drawFishThreatDirection } from '../../render/RenderFishEnemy';
import { drawBagFullPage } from '../../extraction/render/BagFullPage';
import { drawItemDetailCard } from '../../extraction/render/ItemDetailCard';
import { drawDroppedItemsWorld } from '../../extraction/render/DroppedItemRender';
import { drawRopesWorld,drawRopeApproachWorld } from '../../render/RenderRope';
import { drawRopeTethersWorld,drawRemovedRopesWorld,drawActionControls,drawActionPreviewWorld,drawInteractionWorkWorld,drawInteractionOverlayWorld,drawInteractionHUD } from '../../render/RenderInteraction';
import { drawRescueRopeWorld } from '../../render/RenderRescueRope';
import { drawRescueTarget } from '../../render/RenderRescueTarget';
import { drawBreathBubblesWorld } from '../../render/RenderBreath';
import { drawOxygenTanksWorld,drawOxygenFeedbackWorld } from '../../render/RenderOxygenTank';
import { drawRelicsWorld } from '../../render/RenderRelic';
import { drawWheelButton,drawWheel,drawRopeAimWorld } from '../../render/RenderWheel';
import { getInteractionWorkPose } from '../../logic/Interaction';
import { getRescueTapeVisual } from '../../render/RescueTape';
import { getActiveAirTanks } from '../../extraction/logic/Loadout';
import { getBCDInflationRatio,isBCDVenting } from '../../logic/BCDSystem';
import { getLightPolygon } from '../../render/RenderLight';
import { isWebGLAvailable,uploadPolyData,uploadVPLData,uploadKarstBounceData,renderLightMask,renderVolumetricLight,getGLCanvas,getVolGLCanvas,getGLCanvasPixelSize } from '../../render/WebGLLight';
import { drawGMPanel } from '../../gm/GMPanel';
import { drawPerfHUD } from '../../debug/PerfHUD';
import { activeWorld,world,layout,groundAt,stationPosition,clamp,smooth } from './Geometry';
import { drawWorldHUD } from './WorldHUD';
import { drawCampLeisure, drawNaturalBoundaries } from './Camp';

const assetRoot='images/shore/';
const ASSETS=['woodland-native.jpg','woodland-sky-strip.png','bank-left.jpg','bank-right.jpg','shop.png','tent.png','board.png','air.png','fish.png'];
let registered=false;
let backdropProjection:any=null;
export function backdropProjectionStats(){return backdropProjection;}
export function updateWorldAssets(){
    if(activeWorld()&&!registered){registered=true;ASSETS.forEach(f=>registerImage('shore/'+f,assetRoot+f));}
    else if(!activeWorld()&&registered){releaseImages(ASSETS.map(f=>'shore/'+f));registered=false;}
}
export function assetsReady(){return ASSETS.every(f=>isImageReady('shore/'+f));}
export function worldGraphicsStats(){const imageBytes=ASSETS.reduce((n,f)=>{const im=getImage('shore/'+f);return n+(im?im.width*im.height*4:0);},0);return {webgl:isWebGLAvailable(),pixelSize:getGLCanvasPixelSize(),sceneDecodedRGBABytes:imageBytes,character:"original",rocks:getKarstTerrain(state.mazeRescue)?"continuous-karst":"original-circles",karst:karstStats(state.mazeRescue),surface:karstSurfaceStats(),volume:karstVolumeStats(),crossfade:true};}
function transform(){const c=state.camera;ctx.translate(logicW/2,logicH/2);ctx.scale(c.zoom,c.zoom);ctx.translate(-c.x-c.swayX,-c.y-c.swayY);}
function gradient(y1:number,y2:number,stops:[number,string][]) {const g=ctx.createLinearGradient(0,y1,0,y2);for(const [t,c]of stops)g.addColorStop(t,c);return g;}
function visible(x:number,y:number,w:number,h:number,v:any){return x+w>v.l&&x<v.r&&y+h>v.t&&y<v.b;}
function leafCluster(x:number,y:number,scale:number,phase:number) {
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    const sway=Math.sin(world()!.elapsed*.72+phase)*2;
    for(let i=0;i<5;i++){
        const a=(-1.12+i*.45),len=25+(i%3)*12;
        ctx.strokeStyle=i%2?'#4f7653':'#6a8959';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(Math.sin(a)*len*.35+sway,-len*.65,Math.sin(a)*len+sway,-len);ctx.stroke();
        for(let j=1;j<6;j++){const t=j/6,px=Math.sin(a)*len*t+sway*t,py=-len*t;ctx.fillStyle=j%2?'#7f9b62':'#557c4f';ctx.beginPath();ctx.ellipse(px+4,py+2,7,2.2,a+.6,0,Math.PI*2);ctx.fill();}
    }ctx.restore();
}
function drawBackdrop(v:any) {
    const w=world()!;
    ctx.fillStyle=gradient(v.t,w.surfaceY,[[0,'#f4efdb'],[.7,'#f1efd7'],[1,'#c2d0ad']]);ctx.fillRect(v.l,v.t,v.r-v.l,Math.max(0,w.surfaceY-v.t));
    const bg=getImage('shore/woodland-native.jpg');
    if(bg){const cam=state.camera,waterY=logicH/2+(w.surfaceY-cam.y-cam.swayY)*cam.zoom;
        ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.beginPath();ctx.rect(0,0,logicW,Math.max(0,waterY));ctx.clip();
        const width=logicH>logicW?Math.max(640,logicW*1.12):logicW*1.12,height=width*bg.height/bg.width,treeline=waterY-48*cam.zoom;
        const x=(logicW-width)/2+Math.max(-20,Math.min(20,(w.originX-cam.x)*.018));
        backdropProjection={nativeWidth:bg.width,nativeHeight:bg.height,logicalWidth:width,logicalHeight:height,pixelMagnification:width*dpr/bg.width,independentOfWorldZoom:true};
        const strip=getImage('shore/woodland-sky-strip.png'),y=treeline-height*.72;
        if(strip){const cut=strip.height,shown=cut/bg.height*height;ctx.drawImage(bg,0,cut,bg.width,bg.height-cut,x,y+shown,width,height-shown);ctx.drawImage(strip,x,y,width,shown);}
        else ctx.drawImage(bg,x,y,width,height);ctx.restore();}
    ctx.fillStyle=gradient(w.surfaceY,w.surfaceY+1120,[[0,'#74b7a0'],[.18,'#478f81'],[.46,'#225958'],[.79,'#10383e'],[1,'#061b26']]);
    ctx.fillRect(v.l,w.surfaceY,v.r-v.l,Math.max(0,v.b-w.surfaceY));
    ctx.save();ctx.beginPath();ctx.rect(v.l,w.surfaceY,v.r-v.l,Math.max(0,v.b-w.surfaceY));ctx.clip();
    // A distant eroded wall has its own depth and color. It is not the collision
    // wall and never pretends to be the navigable foreground ledge.
    for(let layer=0;layer<3;layer++){
        ctx.fillStyle=['rgba(100,138,113,.18)','rgba(59,104,92,.21)','rgba(28,74,76,.28)'][layer];ctx.beginPath();
        const left=w.originX-630+layer*120;ctx.moveTo(left,w.surfaceY);
        ctx.bezierCurveTo(left-55,w.surfaceY+145,left+110,w.surfaceY+260,left+160,w.surfaceY+475);
        ctx.bezierCurveTo(left+260,w.surfaceY+660,left+50,w.surfaceY+990,left+280,w.surfaceY+1260);ctx.lineTo(w.originX-1800,w.surfaceY+1260);ctx.lineTo(w.originX-1800,w.surfaceY);ctx.fill();
    }
    for(let i=0;i<5;i++){
        const top=w.originX-235+i*170+Math.sin(w.elapsed*.19+i)*9;
        ctx.save();ctx.translate(top,w.surfaceY+235);ctx.rotate(-.065+(i%3)*.018);ctx.scale(.12+(i%2)*.035,1);
        const glow=ctx.createRadialGradient(0,-170,12,0,0,570);glow.addColorStop(0,'rgba(233,240,181,.13)');glow.addColorStop(.35,'rgba(198,229,185,.045)');glow.addColorStop(1,'rgba(139,210,192,0)');
        ctx.fillStyle=glow;ctx.fillRect(-570,-570,1140,1140);ctx.restore();
    }
    ctx.restore();
}
function drawDeepCave(v:any) {
    const m:any=state.mazeRescue,w=world()!,ts=m.mazeTileSize;
    if(v.b<w.seamY-180||getKarstTerrain(m))return;
    const r0=Math.max(Math.floor((w.seamY-180)/ts),Math.floor(v.t/ts)-1),r1=Math.min(m.mazeRows-1,Math.floor(v.b/ts)+1);
    for(let r=r0;r<=r1;r++)for(let c=Math.max(0,Math.floor(v.l/ts)-1);c<=Math.min(m.mazeCols-1,Math.floor(v.r/ts)+1);c++)if(m.mazeMap[r]?.[c]===2){ctx.fillStyle='#222';ctx.fillRect(c*ts-.4,r*ts-.4,ts+.8,ts+.8);}
    for(const wall of m.mazeWalls){
        if(wall.shoreBank||(wall as any).shoreObstacle||!visible(wall.x-wall.r,wall.y-wall.r,wall.r*2,wall.r*2,v))continue;
        ctx.save();ctx.globalAlpha=smooth(w.seamY-160,w.seamY+100,wall.y);drawMazeWallShape(ctx,wall,wall.row,wall.col);ctx.restore();
    }
}
function drawBanks(v:any){
    const w=world()!;
    for(let i=0;i<assetManifest.banks.length;i++){
        const bank=assetManifest.banks[i],image=getImage('shore/'+bank.file);if(!image||!visible(w.originX+bank.x,bank.y,bank.width,bank.height,v))continue;
        ctx.save();ctx.beginPath();const poly=w.banks[i].rockPolygon!;poly.forEach((p,j)=>j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();
        const solidH=Math.max(0,w.seamY-160-bank.y);ctx.drawImage(image,0,0,bank.width,solidH,w.originX+bank.x,bank.y,bank.width,solidH);
        for(let y=Math.max(bank.y,w.seamY-160);y<bank.y+bank.height;y+=12){const h=Math.min(12,bank.y+bank.height-y);ctx.globalAlpha=1-smooth(w.seamY-160,w.seamY+20,y+h/2);ctx.drawImage(image,0,y-bank.y,bank.width,h,w.originX+bank.x,y,bank.width,h);}
        ctx.restore();
    }
}
function drawCamp(v:any){
    const w=world()!;
    drawCampLeisure(ctx,v);
    for(const s of layout.stations){
        const p=stationPosition(s),asset=(assetManifest.props as any)[s.kind],image=getImage('shore/'+asset.file);
        const width=s.width*1.14,height=width*asset.height/asset.width;
        if(image&&visible(p.x-width/2,p.y-height,width,height,v)){
            ctx.drawImage(image,p.x-width/2,p.y-height+5,width,height);
            ctx.fillStyle='#42583d';ctx.font=`${s.kind==='shop'?12:10}px PingFang SC, sans-serif`;ctx.textAlign='center';
            const signY=s.kind==='shop'?p.y-height+height*.36:s.kind==='board'?p.y-height+height*.24:s.kind==='air'?p.y-height+height*.21:p.y-height+height*.67;
            if(['shop','board','air','fish'].includes(s.kind))ctx.fillText(s.id==='map'?'调查地图':s.id==='air'?'充气':s.id==='fish'?'暂未营业':'潜水装备',p.x,signY);
            if(w.stationId===s.id){ctx.fillStyle='rgba(231,229,165,.86)';ctx.beginPath();ctx.arc(p.x,p.y-height-11,3.6,0,Math.PI*2);ctx.fill();}
        }
    }
    for(const [dx,size]of [[-1870,1.5],[-1605,.8],[-1330,1],[-1180,.65],[-895,.7],[-645,.6],[-482,.4],[815,1.2],[1150,1.5]]as const){const x=w.originX+dx,y=groundAt(x);if(visible(x-50,y-80,100,100,v))leafCluster(x,y,size,dx);}
    // Cast contact shadow onto the real ground, not a floating circle below him.
    if(w.landBlend>.1&&!w.resting){const gy=groundAt(player.x);ctx.fillStyle=`rgba(20,40,27,${w.landBlend*.19})`;ctx.beginPath();ctx.ellipse(player.x+4,gy+1,19,3.2,0,0,Math.PI*2);ctx.fill();}
    if(w.pendingAction==='air'){
        const s=stationPosition(layout.stations.find(s=>s.id==='air')!);
        ctx.strokeStyle='#45674e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.x+12,s.y-72);ctx.bezierCurveTo(s.x+30,s.y-12,player.x-31,player.y+24,player.x-4,player.y+5);ctx.stroke();
    }
}
function lighting(volumeMix:number) {
    const w=world()!,c=state.camera,depth=clamp((player.y-w.surfaceY)/1100),maskAlpha=.03+.965*Math.pow(depth,1.48);
    const waterScreen=logicH/2+(w.surfaceY-c.y-c.swayY)*c.zoom;
    let surfacePoly:any[]|undefined;
    if(waterScreen>=logicH)return;
    ctx.save();ctx.beginPath();ctx.rect(0,Math.max(0,waterScreen),logicW,logicH-Math.max(0,waterScreen));ctx.clip();
    if(isWebGLAvailable()){
        const light=state.flashlightOn!==false&&w.wet>.3,range=CONFIG.lightRange;
        const poly=light?getLightPolygon(player.x,player.y,player.angle,range,CONFIG.fov):[];surfacePoly=poly;
        uploadPolyData(poly,range);
        const terrain=getKarstTerrain(state.mazeRescue),sculpted=!!terrain&&terrain.generation!=='volume'&&CONFIG.karst.surfaceMode!=='baseline';
        const count=terrain?.generation==='volume'?0:uploadVPLData(poly,range)||0;
        uploadKarstBounceData(light&&terrain&&sculpted?getKarstBounce(terrain,poly,player.x,player.y,player.angle,range):null);
        const base={playerX:player.x,playerY:player.y,cameraX:c.x+c.swayX,cameraY:c.y+c.swayY,zoom:c.zoom,shakeX:0,shakeY:0,angle:player.angle,maxDist:range,
            flashlightActive:light,karstMode:!!terrain,karstEnhanced:sculpted,volumeMode:terrain?.generation==='volume',
            volumeBounce:getKarstVolumeBounceLights(),volumeBounceNormals:getKarstVolumeBounceNormals(),
            npcX:state.npc.x,npcY:state.npc.y,npcAngle:state.npc.angle,npcDist:range*.5,npcActive:false,polyCount:poly.length,vplCount:count};
        renderVolumetricLight(base);const size=getGLCanvasPixelSize();
        // 岸边沿用原来的合成。洞室里的水中光柱在遮罩之后画，空旷时也能看清照射方向。
        ctx.globalAlpha=1-volumeMix;
        ctx.globalCompositeOperation='screen';ctx.drawImage(getVolGLCanvas() as any,0,0,size.w,size.h,0,0,logicW,logicH);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
        renderLightMask({...base,maskAlpha,worldSurfaceY:w.surfaceY} as any);ctx.drawImage(getGLCanvas() as any,0,0,size.w,size.h,0,0,logicW,logicH);
        ctx.globalAlpha=.72*volumeMix;ctx.globalCompositeOperation='screen';
        ctx.drawImage(getVolGLCanvas() as any,0,0,size.w,size.h,0,0,logicW,logicH);
    }else{const g=ctx.createLinearGradient(0,waterScreen,0,waterScreen+1100*c.zoom);g.addColorStop(0,'rgba(1,15,21,.03)');g.addColorStop(.4,'rgba(1,15,21,.45)');g.addColorStop(1,'rgba(1,15,21,.995)');ctx.fillStyle=g;ctx.fillRect(0,0,logicW,logicH);}
    ctx.restore();return surfacePoly;
}
function drawSurface(v:any){
    const w=world()!,t=w.elapsed;
    if(v.t>w.surfaceY+140||v.b<w.surfaceY-50)return;
    let left=w.originX-405,right=w.originX+712;
    const near=getImage('shore/woodland.jpg');
    ctx.save();ctx.beginPath();ctx.rect(v.l,w.surfaceY, v.r-v.l,Math.max(0,v.b-w.surfaceY));ctx.clip();
    ctx.fillStyle=gradient(w.surfaceY,w.surfaceY+155,[[0,'rgba(146,196,164,.08)'],[.4,'rgba(82,160,144,.06)'],[1,'rgba(82,160,144,0)']]);ctx.fillRect(left,w.surfaceY,right-left,155);
    ctx.restore();
    for(let layer=0;layer<3;layer++){
        ctx.strokeStyle=['rgba(188,218,173,.62)','rgba(230,235,185,.68)','rgba(94,157,127,.40)'][layer];ctx.lineWidth=layer===1?1.2:2.5;
        ctx.beginPath();for(let x=left;x<=right;x+=5){const fade=Math.sin((x-left)/(right-left)*Math.PI),yy=w.surfaceY+Math.sin(x*.032-t*1.2+layer)*1.45*fade+layer*2; x===left?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}ctx.stroke();
    }
    for(let i=0;i<11;i++){
        const x=left+47+i*83+Math.sin(t*.11+i)*15,y=w.surfaceY+7+(i%3)*5;
        ctx.strokeStyle=`rgba(230,231,177,${.1+.06*Math.sin(t+i)})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+18+(i%3)*8,y);ctx.stroke();
    }
    for(const e of w.events){
        if(e.kind==='step')continue;const alpha=Math.max(0,1-e.age/1.2),radius=8+e.age*35*e.strength;
        ctx.strokeStyle=`rgba(233,239,196,${alpha*.55})`;ctx.lineWidth=.9;ctx.beginPath();ctx.ellipse(e.x,e.y,radius,radius*.15,0,0,Math.PI*2);ctx.stroke();
        if(e.kind==='splash'&&e.age<.6)for(let i=0;i<6;i++){const dx=(i-2.5)*e.age*25,dy=-Math.sin(i*1.9)*e.age*31-e.age*21+e.age*e.age*60;ctx.fillStyle=`rgba(224,239,195,${alpha*.7})`;ctx.beginPath();ctx.arc(e.x+dx,e.y+dy,1.1,0,Math.PI*2);ctx.fill();}
    }
}
export function drawContinuousFrame(){
    updateWorldAssets();const w=world();if(!w)return;
    const c=state.camera,zoom=c.zoom;
    const v={l:c.x-logicW/(2*zoom)-80,r:c.x+logicW/(2*zoom)+80,t:c.y-logicH/(2*zoom)-80,b:c.y+logicH/(2*zoom)+80};
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#08272e';ctx.fillRect(0,0,logicW,logicH);
    // 三维洞腔画在潜水员、鱼和绳索的后面；旧的平面岩壁仍然画在光照遮罩之后。
    const terrain=getKarstTerrain(state.mazeRescue),volume=!!terrain&&terrain.generation==='volume';
    ctx.save();transform();drawBackdrop(v);drawDeepCave(v);
    const volumeDrawn=volume&&drawKarstVolume(ctx,terrain!,zoom,state.flashlightOn!==false&&w.wet>.3);drawBanks(v);drawNaturalBoundaries(ctx,v);drawCamp(v);
    drawRopesWorld(v.l,v.r,v.t,v.b);drawRopeTethersWorld(ctx,v.l,v.r,v.t,v.b);drawRemovedRopesWorld(ctx);drawRescueRopeWorld(ctx);
    drawAllFishEnemies(ctx,v.l,v.r,v.t,v.b);drawOxygenTanksWorld(ctx,v.l,v.r,v.t,v.b);drawOxygenFeedbackWorld(ctx);drawRelicsWorld(ctx,v.l,v.r,v.t,v.b);drawDroppedItemsWorld(v.l,v.r,v.t,v.b);
    const visual=w.headWet?getRescueTapeVisual():undefined;
    const motion:any={id:'player',hasTank:true,tankCount:Math.max(1,w.airTanks.length),animTime:player.animTime,vx:player.vx,vy:player.vy,autoSwim:CONFIG.driveMode!=='manual',
        leftKickProgress:state.manualDrive.leftKickProgress,rightKickProgress:state.manualDrive.rightKickProgress,leftKickStrength:state.manualDrive.leftKickStrength,rightKickStrength:state.manualDrive.rightKickStrength,
        swimEffort:CONFIG.driveMode==='semiAuto'?state.semiAutoDrive.effort:undefined,workPose:getInteractionWorkPose(),bcdInflation:getBCDInflationRatio(),bcdVenting:isBCDVenting(),tapeVisual:visual,
        landPose:{blend:w.landBlend,phase:w.walkPhase,effort:clamp(Math.abs(player.vx)/3.3),facing:w.facing},regulatorAnim:player.regulatorAnim,carryItemAnim:player.carryItemAnim};
    if(w.resting)drawDiver(ctx,w.originX+layout.rest.x-20,groundAt(w.originX+layout.rest.x)-43,Math.PI+.28,null,{...motion,hasTank:false,tankCount:0,autoSwim:false,swimEffort:0});
    else drawDiver(ctx,player.x,player.y,player.angle,null,motion);
    drawInteractionWorkWorld(ctx);ctx.save();ctx.beginPath();ctx.rect(v.l,w.surfaceY,v.r-v.l,Math.max(0,v.b-w.surfaceY));ctx.clip();drawBreathBubblesWorld(ctx,v.l,v.r,v.t,v.b);ctx.restore();
    for(const p of particles){if(p.x<v.l||p.x>v.r||p.y<v.t||p.y>v.b)continue;ctx.fillStyle=p.type==='silt'?`rgba(91,124,97,${p.life*.17})`:`rgba(193,220,180,${p.life*.3})`;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.5,p.size),0,Math.PI*2);ctx.fill();}
    const volumeMix=volumeDrawn?smooth(terrain!.y,terrain!.y+170,player.y):0;
    ctx.restore();const surfacePoly=lighting(volumeMix);
    if(volumeDrawn&&isWebGLAvailable()){const size=getGLCanvasPixelSize();restoreKarstVolumeLight(ctx,getGLCanvas(),size.w,size.h,Math.max(0,logicH/2+(w.surfaceY-c.y-c.swayY)*zoom),volumeMix);}
    ctx.save();transform();if(!volumeDrawn)drawKarstSurface(ctx,zoom,surfacePoly);drawRescueTarget(ctx,visual);drawSurface(v);drawRopeApproachWorld(ctx,zoom,{left:v.l,right:v.r,top:v.t,bottom:v.b});drawRopeAimWorld(ctx);drawActionPreviewWorld(ctx);drawInteractionOverlayWorld(ctx);ctx.restore();
    if((w as any).overview){
        ctx.save();ctx.fillStyle='rgba(226,231,199,.89)';ctx.fillRect(logicW-260,13,245,30);ctx.fillStyle='#52664a';ctx.font='11px PingFang SC';ctx.textAlign='left';ctx.fillText('营地与泉井 · 同一张地图的验收总览',logicW-250,32);
        ctx.font='9px PingFang SC';ctx.textAlign='center';
        for(const station of layout.stations){const p=stationPosition(station),asset=(assetManifest.props as any)[station.kind],height=station.width*1.14*asset.height/asset.width,sx=logicW/2+(p.x-c.x-c.swayX)*zoom,sy=logicH/2+(p.y-height-c.y-c.swayY)*zoom;ctx.fillStyle='#dce6c2';ctx.strokeStyle='#486a48';ctx.lineWidth=2;ctx.strokeText(station.label,sx,sy-6);ctx.fillText(station.label,sx,sy-6);}
        ctx.restore();return;
    }
    drawWorldHUD(ctx);if(!w.panel){drawWheelButton();drawWheel();drawActionControls(ctx);drawInteractionHUD(ctx);}drawFishThreatDirection(ctx,logicW,logicH,c.x,c.y,c.zoom);drawFishBiteEffect(ctx,logicW,logicH);drawBagFullPage();drawItemDetailCard();drawGMPanel(ctx);drawPerfHUD(ctx);
    if(!assetsReady()||!volume&&!karstAssetsReady()){ctx.fillStyle='rgba(231,231,204,.9)';ctx.fillRect(logicW/2-88,logicH/2-18,176,36);ctx.fillStyle='#65755a';ctx.textAlign='center';ctx.font='11px PingFang SC';ctx.fillText('正在铺设林泉营地素材',logicW/2,logicH/2+4);ctx.textAlign='left';}
}
