import { state, player, input } from '../../src/core/state';
import { CONFIG } from '../../src/core/config';
import { logicW, logicH } from '../../src/render/Canvas';
import { drawHUDTopLeft, initMazeHUDTopLeft } from '../../src/render/HUDTopLeft';
import { drawBCDController } from '../../src/render/RenderBCD';
import { drawInventoryHUD } from '../../src/extraction/render/InventoryHUD';
import { getDecoRuntime } from '../../src/logic/DecompressionSystem';
import { activeWorld, world, layout, depthMeters, stationPosition } from './Geometry';
import { useNearestStation, closeWorldPanel, exitContinuousWorld, toggleOverview } from './Runtime';
import { saveWorldProgress } from './WorldSave';

let initialized=false;
type Button={id:string;x:number;y:number;w:number;h:number;label:string};
const held=new Map<number,{id:string;x:number;y:number}>();
export function worldButtons():Button[] {
    if(!activeWorld())return [];
    const w=world()!,cw=logicW,ch=logicH;
    const top:Button[]=[];
    if(w.panel) {
        top.push({id:'close',x:cw/2+Math.min(300,cw-36)/2-34,y:ch*.16+10,w:24,h:24,label:'×'});
        return top;
    }
    if(w.stationId){const s=layout.stations.find(s=>s.id===w.stationId)!;top.push({id:'station',x:cw/2-100,y:ch-55,w:200,h:33,label:w.pendingAction?'正在补气 · 可随时离开':w.stationId==='medical'&&w.chapterStatus==='rescued'?'查看营地救援记录':s.action});}
    return top;
}
function hit(x:number,y:number){return worldButtons().find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);}
export function worldTouchStart(res:any):boolean {
    if(!activeWorld())return false;
    const t=res.changedTouches?.[0];if(!t)return false;
    const b=hit(t.clientX,t.clientY);
    if(b){held.set(t.identifier,{id:b.id,x:t.clientX,y:t.clientY});return true;}
    if(world()!.panel){held.set(t.identifier,{id:'panel',x:t.clientX,y:t.clientY});return true;}
    return false;
}
export function worldTouchMove(res:any):boolean{return !!res.changedTouches?.length&&res.changedTouches.every((t:any)=>held.has(t.identifier));}
export function worldTouchEnd(res:any,cancel=false):boolean {
    if(!res.changedTouches?.length)return false;let consumed=false;
    for(const t of res.changedTouches){const h=held.get(t.identifier);if(!h)continue;held.delete(t.identifier);consumed=true;
        if(cancel||Math.hypot(t.clientX-h.x,t.clientY-h.y)>10)continue;
        if(h.id==='overview')toggleOverview();if(h.id==='close')closeWorldPanel();if(h.id==='station')useNearestStation();
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
    drawHUDTopLeft(w.elapsed);drawInventoryHUD();if(w.headWet)drawBCDController(w.elapsed);
    const mode=w.landBlend>.7?(w.wet>.12?'涉水':'岸上步行'):w.headWet?'水下游泳':'水面换气';
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
    for(const b of worldButtons()){
        if(b.id==='close')continue;
        panelPath(c,b.x,b.y,b.w,b.h,5);c.fillStyle=b.id==='station'?'rgba(224,220,177,.95)':'rgba(221,221,191,.76)';c.fill();
        c.strokeStyle='rgba(93,115,78,.45)';c.lineWidth=.7;c.stroke();c.textAlign='center';text(c,b.label,b.x+b.w/2,b.y+b.h*.66,10,'#455a43');c.textAlign='left';
    }
    if(w.panel){
        const pw=Math.min(300,logicW-36),ph=Math.min(284,logicH*.73),px=logicW/2-pw/2,py=logicH*.16;
        c.fillStyle='rgba(16,36,30,.27)';c.fillRect(0,0,logicW,logicH);
        panelPath(c,px,py,pw,ph,9);c.fillStyle='#e5e1c8';c.fill();c.strokeStyle='#929c75';c.lineWidth=1;c.stroke();
        text(c,'近身交互',px+17,py+22,9,'#879174');
        const titles:any={map:'调查地图',shop:'潜水装备铺',fish:'鱼档 · 预留场地',medical:'救援营地',depleted:'气瓶已耗尽'};
        text(c,titles[w.panel]||'营地',px+17,py+44,17,'#3d5745');
        if(w.panel==='map')drawMap(c,px+15,py+60,pw-30,ph-76);
        else {
            const lines:any={shop:['货架、面镜、气瓶和脚蹼是场景里的实体。','必须先走到这里，再查看陈列。','','本节点只验收空间与交互。','购买、库存、价格和换装将在下一阶段接入。'],
                fish:['这个位置将接收实际拖过来的鱼。','鱼目前仍绑在你的腰上，不会变成背包数字。','','卖鱼、烧烤、水族馆和资源转化本次不做。'],
                medical:w.chapterStatus==='rescued'?['被救者已经实际移交营地。','章节完成，但泉井、鱼和绳网仍然保留。','你可以继续上岸下水，不必立刻换洞。','','跨章节出发将在下一个验收节点接入。']:['把救援对象连同安全绳实际带到帐篷旁。','仅自己浮到水面不会触发完成。','','这顶帐篷是本洞章节的交接位置。'],
                depleted:['没有把你传送回岸上，也没有清空牵引。','失败恢复与营地救援规则还未接入。','','可退出试跑；实验存档仍会保留原位置。']};
            (lines[w.panel]||[]).forEach((line:string,i:number)=>text(c,line,px+17,py+71+i*22,10,'#69765d'));
            if(w.panel==='medical')text(c,`累计调查 ${(w.elapsed/60).toFixed(1)} 分钟`,px+17,py+ph-20,10,'#8a9878');
        }
        const close=worldButtons().find(b=>b.id==='close')!;c.textAlign='center';text(c,'×',close.x+12,close.y+18,18,'#617158');c.textAlign='left';
    }
    c.restore();
}
