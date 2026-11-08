import { getImage,registerImage,releaseImages } from '../../src/render/ImageAssets';
import { drawDiver } from '../../src/render/RenderDiver';
import { drawTapeDeck } from '../../src/render/TapeDeckVisual';
import { sampleWorkMotion } from '../../src/render/InteractionPose';
import type { WorkPose } from '../../src/render/InteractionPose';
import { state } from '../../src/core/state';
import { world } from './Geometry';

const PARTS=['head','torso','upperarm','forearm','hand','thigh','calf','tank','fin'];
let loaded=false;
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function ensureExpeditionDiver(){if(!loaded){loaded=true;PARTS.forEach(p=>registerImage('expedition/'+p,'design/continuous-world/assets/diver-'+p+'.png'));}}
export function releaseExpeditionDiver(){releaseImages(PARTS.map(p=>'expedition/'+p));loaded=false;}
function stamp(c:CanvasRenderingContext2D,name:string,x:number,y:number,w:number,h:number){const im=getImage('expedition/'+name);if(im)c.drawImage(im,x,y,w,h);}
function limb(c:CanvasRenderingContext2D,name:string,a:{x:number;y:number},b:{x:number;y:number},width:number){
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);c.save();c.translate(a.x,a.y);c.rotate(Math.atan2(dy,dx)-Math.PI/2);stamp(c,name,-width/2,-1,width,length+3);c.restore();
}
function ik(origin:{x:number;y:number},target:{x:number;y:number},upper:number,lower:number,side:number){
    const dx=target.x-origin.x,dy=target.y-origin.y,dist=clamp(Math.hypot(dx,dy),Math.abs(upper-lower)+.1,upper+lower-.1),bearing=Math.atan2(dy,dx);
    const bend=Math.acos(clamp((upper*upper+dist*dist-lower*lower)/(2*upper*dist),-1,1))*side;
    return {x:origin.x+Math.cos(bearing+bend)*upper,y:origin.y+Math.sin(bearing+bend)*upper};
}
export function expeditionDiverReady(){return PARTS.every(p=>!!getImage('expedition/'+p));}
export function expeditionImageBytes(){return PARTS.reduce((n,p)=>{const im=getImage('expedition/'+p);return n+(im?im.width*im.height*4:0);},0);}
export function expeditionPose(motion:any,angle:number){
    const land=clamp(motion.landPose?.blend||0),phase=(motion.landPose?.phase||0)*Math.PI*2,effort=clamp(motion.landPose?.effort||0),face=land>.6?(motion.landPose?.facing||1):1;
    const work:WorkPose|undefined=motion.workPose;
    const crouch=land>.6&&work?.kind==='tie'?clamp((-work.x-14)/28)*Math.min(1,work.progress/.18,(1-work.progress)/.15):0;
    const swimPhase=(world()?.elapsed||0)*(2+Math.min(4,Math.hypot(motion.vx||0,motion.vy||0))*.7),swim=1-land;
    const hips=[{x:-4,y:8+crouch*24},{x:4,y:8+crouch*24}],ankles:any[]=[],knees:any[]=[];
    for(let i=0;i<2;i++){const p=phase+i*Math.PI,stride=Math.sin(p)*11*effort,lift=Math.max(0,Math.cos(p))*7*effort;
        const kick=Math.sin(swimPhase+i*Math.PI)*6*clamp(motion.swimEffort??Math.hypot(motion.vx||0,motion.vy||0)/4),x=hips[i].x+stride*land+kick*swim,y=43-lift*land-Math.max(0,kick)*swim*.5;
        const foot={x,y};ankles.push(foot);knees.push(ik(hips[i],foot,18,18,i?-.7:.7));
    }
    const shoulders=[{x:-11,y:-16+crouch*28},{x:11,y:-16+crouch*28}],hands=[{x:-12+Math.sin(phase)*8*effort*land,y:12},{x:12-Math.sin(phase)*8*effort*land,y:12}];
    let authored:any=null;
    if(work){authored=sampleWorkMotion(work);hands[0]={x:authored.left.y/face,y:-authored.left.x};hands[1]={x:authored.right.y/face,y:-authored.right.x};}
    else{hands[0].x-=Math.sin(swimPhase*.6)*2*swim;hands[1].x+=Math.sin(swimPhase*.6)*2*swim;}
    const elbows=shoulders.map((p,i)=>ik(p,hands[i],15,14,i?1:-1));
    return {land,face,crouch,rotation:angle+Math.PI/2,hips,ankles,knees,shoulders,hands,elbows,authored};
}
export function drawExpeditionDiver(c:CanvasRenderingContext2D,x:number,y:number,angle:number,motion:any={}){
    ensureExpeditionDiver();if(!expeditionDiverReady()){drawDiver(c,x,y,angle,null,motion);return;}
    const p=expeditionPose(motion,angle);c.save();c.translate(x,y);c.rotate(p.rotation);c.scale(p.face,1);
    // A restrained upright action leans the torso; the legs stay planted. The
    // root angle is controlled by physical land contact, not the selected ray.
    for(const i of [0,1]){c.save();if(i===0)c.globalAlpha=.82;limb(c,'thigh',p.hips[i],p.knees[i],8.5);limb(c,'calf',p.knees[i],p.ankles[i],7);
        const a=p.ankles[i];c.save();c.translate(a.x,a.y);c.rotate((1-p.land)*Math.PI/2);stamp(c,'fin',-3,-3,23,8.5);c.restore();c.restore();}
    const drawArm=(i:number)=>{limb(c,'upperarm',p.shoulders[i],p.elbows[i],7);limb(c,'forearm',p.elbows[i],p.hands[i],6);stamp(c,'hand',p.hands[i].x-3,p.hands[i].y-2,6,7);};
    c.save();c.globalAlpha=.82;drawArm(0);c.restore();
    c.save();c.translate(0,p.crouch*28);c.rotate(p.authored?p.authored.roll*.10:Math.sin((world()?.elapsed||0)*2)*.008);stamp(c,'torso',-15,-23,30,36);if(motion.tapeVisual)drawTapeDeck(c,0,-2,9,motion.tapeVisual,true);stamp(c,'tank',-19,-23,14,31);if((motion.tankCount||1)>1)stamp(c,'tank',10,-22,11,29);c.save();c.translate(0,-29);c.rotate(-(1-p.land)*Math.PI/2);stamp(c,'head',-10,-13,21,26);c.restore();c.restore();
    drawArm(1);
    // A real waist harness, using the same world-space endpoint as the live rope.
    c.strokeStyle='#bbaa70';c.lineWidth=1;c.beginPath();c.arc(0,6,2.3,0,Math.PI*2);c.stroke();
    if(p.authored){const m=p.authored,h=p.hands[1];c.save();c.translate(h.x,h.y);c.rotate(m.toolAngle-Math.PI/2);
        if(m.tool==='tank')stamp(c,'tank',-4,-7,9,20);
        if(m.tool==='shears'){c.strokeStyle='#c8cdb4';c.lineWidth=1.7;c.beginPath();c.moveTo(-6,-3);c.lineTo(7,m.toolOpen*7);c.moveTo(-6,3);c.lineTo(7,-m.toolOpen*7);c.stroke();}
        c.restore();if(m.thread.length){c.strokeStyle='#e3cf94';c.lineWidth=1;c.beginPath();m.thread.forEach((q:any,i:number)=>{const a=q.y/p.face,b=-q.x;i?c.lineTo(a,b):c.moveTo(a,b);});c.stroke();}}
    c.restore();
}
