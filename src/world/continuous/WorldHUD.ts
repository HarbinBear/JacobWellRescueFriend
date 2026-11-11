import { worldAssetsBlocked, worldAssetStatus, retryWorldAssets } from './WorldAssets';
import { state, player } from '../../core/state';
import { CONFIG } from '../../core/config';
import { logicW, logicH } from '../../render/Canvas';
import { drawHUDTopLeft, initMazeHUDTopLeft } from '../../render/HUDTopLeft';
import { drawBCDController } from '../../render/RenderBCD';
import { drawInventoryHUD } from '../../extraction/render/InventoryHUD';
import { activeWorld, world, layout, depthMeters } from './Geometry';
import { useNearestStation, closeWorldPanel, exitContinuousWorld, toggleOverview, openWorldNavigation,
    isWorldNavigationOpen, quickReturnToShore, requestNextWorld, startNextContinuousWorld } from './Runtime';

let initialized=false;
type Button={id:string;x:number;y:number;w:number;h:number;label:string};
const held=new Map<number,{id:string;x:number;y:number}>();
function navigationLayout() {
    const w=Math.min(340,logicW-32),base=world()?.panel==='confirm-next-world'?270:324;
    const top=(CONFIG.uiSafeTop||8)+4,bottom=(CONFIG.uiSafeBottom||18)+4,h=Math.min(base,logicH-top-bottom);
    return{x:(logicW-w)/2,y:top+(logicH-top-bottom-h)/2,w,h,scale:h/base};
}
export function cancelWorldTouches(){held.clear();}
export function worldButtons():Button[] {
    if(!activeWorld())return [];
    const w=world()!,cw=logicW,ch=logicH;
    if(worldAssetsBlocked())return [
        ...(worldAssetStatus().failed?[{id:'asset-retry',x:cw/2-114,y:ch/2+34,w:108,h:44,label:'重新下载'}]:[]),
        {id:'asset-exit',x:cw/2+6,y:ch/2+34,w:108,h:44,label:'回主界面'},
    ];
    const top:Button[]=[];
    if(isWorldNavigationOpen()){
        const p=navigationLayout(),x=p.x+16,bw=p.w-32,s=p.scale;
        if(w.panel==='confirm-next-world')return[
            {id:'next-cancel',x,y:p.y+150*s,w:bw,h:42*s,label:'保留当前地图'},
            {id:'next-confirm',x,y:p.y+204*s,w:bw,h:42*s,label:'放弃当前洞穴并换图'},
        ];
        return [
            {id:'continue',x,y:p.y+64*s,w:bw,h:42*s,label:'继续探索'},
            {id:'quick-shore',x,y:p.y+114*s,w:bw,h:42*s,label:'快速回岸'},
            {id:'save-menu',x,y:p.y+164*s,w:bw,h:42*s,label:'保存并回主界面'},
            {id:'next-map',x,y:p.y+214*s,w:bw,h:42*s,label:'换一张地图…'},
        ];
    }
    if(w.panel) {
        top.push({id:'close',x:cw/2+Math.min(300,cw-36)/2-34,y:ch*.16+10,w:24,h:24,label:'×'});
        return top;
    }
    const navX=(CONFIG.uiSafeLeft||6)+8,navY=ch-(CONFIG.uiSafeBottom||18)-52;
    top.push({id:'navigation',x:navX,y:navY,w:64,h:44,label:'菜单'});
    if(w.headWet||w.wet>.3)top.push({id:'quick-shore',x:navX+72,y:navY,w:64,h:44,label:'回岸'});
    if(w.stationId&&!w.headWet&&w.wet<=.3){const s=layout.stations.find(s=>s.id===w.stationId),x=Math.max(cw/2-100,navX+72);top.push({id:'station',x,y:ch-55,w:Math.min(200,cw-(CONFIG.uiSafeRight||6)-10-x),h:33,label:w.stationId==='rest'?(w.resting?'起身继续探索':'躺下晒太阳'):w.pendingAction?'正在补气 · 可随时离开':w.stationId==='medical'&&w.chapterStatus==='rescued'?'查看营地救援记录':s?.action||'查看营地'});}
    return top;
}
function hit(x:number,y:number){return worldButtons().find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);}
export function worldTouchStart(res:any):boolean {
    if(!activeWorld())return false;
    let consumed=false;for(const t of res.changedTouches||[]){
        const b=hit(t.clientX,t.clientY);
        if(b||world()!.panel||worldAssetsBlocked()){held.set(t.identifier,{id:b?.id||'panel',x:t.clientX,y:t.clientY});consumed=true;}
    }return consumed;
}
export function worldTouchMove(res:any):boolean{return !!res.changedTouches?.length&&res.changedTouches.every((t:any)=>held.has(t.identifier));}
export function worldTouchEnd(res:any,cancel=false):boolean {
    if(!res.changedTouches?.length)return false;let consumed=false;
    for(const t of res.changedTouches){const h=held.get(t.identifier);if(!h)continue;held.delete(t.identifier);consumed=true;
        if(cancel||Math.hypot(t.clientX-h.x,t.clientY-h.y)>10||hit(t.clientX,t.clientY)?.id!==h.id)continue;
        if(h.id==='asset-retry')void retryWorldAssets();if(h.id==='asset-exit')exitContinuousWorld();
        if(h.id==='overview')toggleOverview();if(h.id==='close')closeWorldPanel();if(h.id==='station')useNearestStation();
        if(h.id==='navigation'||h.id==='next-cancel')openWorldNavigation();
        if(h.id==='continue')closeWorldPanel();if(h.id==='quick-shore')quickReturnToShore();
        if(h.id==='save-menu')exitContinuousWorld();if(h.id==='next-map')requestNextWorld();
        if(h.id==='next-confirm')startNextContinuousWorld();
    }
    return consumed;
}
export function panelPath(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r=9) {
    c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();
}
function text(c:CanvasRenderingContext2D,t:string,x:number,y:number,size:number,color:string){c.font=`${size}px -apple-system, PingFang SC, sans-serif`;c.fillStyle=color;c.fillText(t,x,y);}
function drawMap(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number) {
    const m:any=state.mazeRescue,sw=world()!,pad=12;
    c.fillStyle='#dad8bc';c.fillRect(x,y,w,h);
    c.strokeStyle='#b7b794';c.lineWidth=.5;
    for(let a=x+20;a<x+w;a+=23){c.beginPath();c.moveTo(a,y);c.lineTo(a,y+h);c.stroke();}
    for(let a=y+17;a<y+h;a+=23){c.beginPath();c.moveTo(x,a);c.lineTo(x+w,a);c.stroke();}
    const sx=w/(m.mazeCols*m.mazeTileSize),sy=(h-45)/(m.mazeRows*m.mazeTileSize),scale=Math.min(sx,sy);
    const ox=x+w/2-sw.originX*scale,oy=y+37;
    c.fillStyle='#98ab89';
    for(let r=0;r<m.mazeRows;r++)for(let col=0;col<m.mazeCols;col++)if(m.mazeMap[r][col]===0&&m.mazeExplored[r][col])c.fillRect(ox+col*m.mazeTileSize*scale,oy+r*m.mazeTileSize*scale,Math.max(1,m.mazeTileSize*scale),Math.max(1,m.mazeTileSize*scale));
    text(c,'营地 → 浅滩 → 泉井 → 深洞',x+pad,y+22,11,'#57664b');
    c.strokeStyle='#b57547';c.lineWidth=1.2;c.beginPath();
    m.playerPath.forEach((p:any,i:number)=>{const px=ox+p.x*scale,py=oy+p.y*scale;i?c.lineTo(px,py):c.moveTo(px,py);});c.stroke();
    c.fillStyle='#b45d37';c.beginPath();c.arc(ox+player.x*scale,oy+player.y*scale,3.5,0,Math.PI*2);c.fill();
    text(c,'只记已调查区域；不再按下潜次数回放',x+pad,y+h-12,10,'#6d765b');
}
export function drawWorldHUD(c:CanvasRenderingContext2D) {
    const w=world();if(!w)return;
    if(!initialized){initMazeHUDTopLeft();initialized=true;}
    c.save();c.textAlign='left';
    drawHUDTopLeft(w.elapsed);drawInventoryHUD();drawBCDController(w.elapsed);
    const mode=w.resting?'竹躺椅休息':w.landBlend>.7?(w.wet>.12?'涉水':'岸上步行'):w.headWet?'水下游泳':'水面换气';
    c.textAlign='right';text(c,`${w.chapterStatus==='rescued'?'救援已完成':'搜寻中'} · ${mode}`,logicW-27,58,10,w.headWet?'#c6dfc5':'#587051');
    text(c,w.saveOK?'原位自动保存':'尚未写入存档',logicW-27,logicH-13,9,w.saveOK?'#779886':'#ad795c');
    c.textAlign='left';
    if(w.notice&&w.elapsed<w.noticeUntil&&!w.panel){
        const portrait=logicH>logicW,tw=Math.min(logicW-90,330),x=portrait?65:logicW/2-tw/2,y=portrait?96:76,rows:string[]=[];
        c.font='9px PingFang SC';let line='';
        for(const char of w.notice){if(line&&c.measureText(line+char).width>tw-16){rows.push(line);line=char;}else line+=char;}if(line)rows.push(line);
        panelPath(c,x,y,tw,rows.length*12+12,4);c.fillStyle='rgba(232,229,198,.88)';c.fill();
        rows.forEach((row,i)=>text(c,row,x+8,y+16+i*12,9,'#53654d'));
    }
    if(w.headWet){c.textAlign='right';text(c,`${depthMeters(player.y).toFixed(1)} m`,logicW-27,82,11,'#b9d6c9');c.textAlign='left';}
    for(const b of isWorldNavigationOpen()?[]:worldButtons()){
        if(b.id==='close')continue;
        panelPath(c,b.x,b.y,b.w,b.h,5);c.fillStyle=b.id==='station'?'rgba(224,220,177,.95)':'rgba(221,221,191,.76)';c.fill();
        c.strokeStyle='rgba(93,115,78,.45)';c.lineWidth=.7;c.stroke();c.textAlign='center';text(c,b.label,b.x+b.w/2,b.y+b.h*.66,10,'#455a43');c.textAlign='left';
    }
    if(isWorldNavigationOpen()){
        const p=navigationLayout(),confirm=w.panel==='confirm-next-world',sy=(y:number)=>p.y+y*p.scale;
        c.fillStyle='rgba(4,17,23,.76)';c.fillRect(0,0,logicW,logicH);
        panelPath(c,p.x,p.y,p.w,p.h,9);c.fillStyle='#e5e1c8';c.fill();c.strokeStyle='#929c75';c.lineWidth=1;c.stroke();
        text(c,confirm?'换一张地图？':'探索菜单',p.x+17,sy(29),18,'#3d5745');
        if(confirm){
            ['当前洞穴的探索、鱼和固定绳网将被替换。','新地图从岸上营地开始。','想稍后接着玩，请选“保存并回主界面”。'].forEach((line,i)=>text(c,line,p.x+17,sy(62+i*23),11,'#69765d'));
        }else text(c,'已暂停 · 继续后从当前位置出发',p.x+17,sy(49),10,'#69765d');
        for(const b of worldButtons()){
            const destructive=b.id==='next-confirm';panelPath(c,b.x,b.y,b.w,b.h,5);
            c.fillStyle=destructive?'#a76043':b.id==='continue'?'#527363':'#d6d8bd';c.fill();
            c.strokeStyle=destructive?'#975337':'#a6ae8d';c.stroke();c.textAlign='center';
            text(c,b.label,b.x+b.w/2,b.y+b.h/2+5,13,destructive||b.id==='continue'?'#f4efdb':'#3d5745');c.textAlign='left';
        }
        if(!confirm){
            if(!w.saveOK){text(c,'保存未成功，请稍后重试。',p.x+17,sy(282),11,'#98553d');text(c,'当前探索仍在游戏中；尚未退出或换图。',p.x+17,sy(299),10,'#98553d');}
            else {text(c,'快速回岸保留地图和固定网；解除腰扣牵引。',p.x+17,sy(282),10,'#69765d');text(c,'鱼与被救者留在原处。',p.x+17,sy(299),10,'#69765d');}
        }
    }else if(w.panel){
        const pw=Math.min(300,logicW-36),ph=Math.min(284,logicH*.73),px=logicW/2-pw/2,py=logicH*.16;
        c.fillStyle='rgba(16,36,30,.27)';c.fillRect(0,0,logicW,logicH);
        panelPath(c,px,py,pw,ph,9);c.fillStyle='#e5e1c8';c.fill();c.strokeStyle='#929c75';c.lineWidth=1;c.stroke();
        text(c,'近身交互',px+17,py+22,9,'#879174');
        const titles:any={map:'调查地图',shop:'潜水装备铺',fish:'鱼档 · 预留场地',medical:'救援营地'};
        text(c,titles[w.panel]||'营地',px+17,py+44,17,'#3d5745');
        if(w.panel==='map')drawMap(c,px+15,py+60,pw-30,ph-76);
        else {
            const lines:any={shop:['货架、面镜、气瓶和脚蹼是场景里的实体。','必须先走到这里，再查看陈列。','','本节点只验收空间与交互。','购买、库存、价格和换装将在下一阶段接入。'],
                fish:['这个位置将接收实际拖过来的鱼。','鱼目前仍绑在你的腰上，不会变成背包数字。','','卖鱼、烧烤、水族馆和资源转化本次不做。'],
                medical:w.chapterStatus==='rescued'?['被救者已经实际移交营地。','章节完成，但泉井、鱼和绳网仍然保留。','你可以继续上岸下水，不必立刻换洞。','','在“菜单”中选择“换一张地图”。','确认后将离开当前洞穴。']:['把救援对象连同安全绳实际带到帐篷旁。','仅自己浮到水面不会触发完成。','','这顶帐篷是本洞章节的交接位置。']};
            (lines[w.panel]||[]).forEach((line:string,i:number)=>text(c,line,px+17,py+71+i*22,10,'#69765d'));
            if(w.panel==='medical')text(c,`累计调查 ${(w.elapsed/60).toFixed(1)} 分钟`,px+17,py+ph-20,10,'#8a9878');
        }
        const close=worldButtons().find(b=>b.id==='close')!;c.textAlign='center';text(c,'×',close.x+12,close.y+18,18,'#617158');c.textAlign='left';
    }
    c.restore();
}

// 只依赖代码绘制：断网时也有明确出口，下载重试不会重新生成地图。
export function drawWorldAssetLoading(c:CanvasRenderingContext2D) {
    const status=worldAssetStatus(),cx=logicW/2,cy=logicH/2;
    c.save();c.fillStyle='#10282b';c.fillRect(0,0,logicW,logicH);c.textAlign='center';
    c.strokeStyle='#8aa99a';c.lineWidth=2;c.beginPath();c.arc(cx,cy-54,17,0,Math.PI*2);c.stroke();
    text(c,status.failed?'营地资源未能下载':'正在准备营地',cx,cy-12,17,'#d7dfcd');
    text(c,status.failed?'请检查网络后重试，或返回主界面':`${status.ready} / ${status.total || 9} · 首次下载后可复用缓存`,cx,cy+12,11,'#95b0a5');
    const w=world();if(w?.notice&&w.elapsed<w.noticeUntil)text(c,w.notice,cx,cy+104,10,'#e0c79d');
    for(const b of worldButtons()){
        c.strokeStyle='#698b7d';c.lineWidth=1;panelPath(c,b.x,b.y,b.w,b.h,22);c.stroke();
        text(c,b.label,b.x+b.w/2,b.y+27,12,'#d7dfcd');
    }
    c.restore();
}
