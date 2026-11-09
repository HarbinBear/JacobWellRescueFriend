import { world, layout, groundAt } from './Geometry';
import { getImage } from '../../render/ImageAssets';

type View = { l:number; r:number; t:number; b:number };
function polygon(c:CanvasRenderingContext2D,points:number[][],fill:string) {
    c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();
}
function line(c:CanvasRenderingContext2D,points:number[][],color:string,width=1) {
    c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function bamboo(c:CanvasRenderingContext2D,a:number[],b:number[],width=5) {
    line(c,[a,b],'#555a37',width+1.5);line(c,[a,b],'#adab6a',width);
    line(c,[[a[0]-.7,a[1]-.9],[b[0]-.7,b[1]-.9]],'#d4c58b',width*.22);
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1,n=Math.max(1,Math.floor(length/22));
    for(let i=1;i<=n;i++){const t=i/(n+1),x=a[0]+dx*t,y=a[1]+dy*t;
        line(c,[[x-dy/length*width*.56,y+dx/length*width*.56],[x+dy/length*width*.56,y-dx/length*width*.56]],'#697047',1.1);
    }
}
function lounge(c:CanvasRenderingContext2D,x:number,y:number,scale=1) {
    c.save();c.translate(x,y);c.scale(scale,scale);c.lineCap='round';c.lineJoin='round';
    c.fillStyle='rgba(33,49,27,.18)';c.beginPath();c.ellipse(-2,2,82,6,0,0,Math.PI*2);c.fill();
    bamboo(c,[-43,-20],[35,0],5);bamboo(c,[28,-23],[-37,0],5);
    bamboo(c,[-47,-16],[-75,-56],5);bamboo(c,[31,-22],[58,-22],5);
    polygon(c,[[-76,-59],[-62,-63],[-30,-27],[66,-29],[68,-19],[-37,-17]],'#929357');
    for(let i=0;i<8;i++){
        const x0=-74+i*5.1,y0=-58+i*4.5;
        bamboo(c,[x0,y0],[x0+13,y0-3],2.1);
    }
    for(let x0=-29;x0<65;x0+=5)bamboo(c,[x0,-26],[x0+2,-19],2.1);
    bamboo(c,[-77,-60],[-37,-22],4);bamboo(c,[-63,-63],[-25,-27],4);
    bamboo(c,[-38,-21],[69,-23],4);bamboo(c,[-26,-27],[67,-29],3.5);
    bamboo(c,[-41,-25],[-41,-35],3);bamboo(c,[12,-26],[12,-35],3);bamboo(c,[-46,-36],[19,-36],4);
    c.fillStyle='#d0c9a0';c.beginPath();c.ellipse(-63,-55,12,4.3,.63,0,Math.PI*2);c.fill();
    line(c,[[-71,-58],[-59,-49]],'#e6dec0',1.2);
    for(const [bx,by] of [[-38,-22],[28,-23],[-41,-35]])for(let j=0;j<3;j++)line(c,[[bx-3,by-3+j*2],[bx+3,by+j*2]],'#bba783',.8);
    c.restore();
}
function canvasShade(c:CanvasRenderingContext2D,x:number,y:number,t:number) {
    c.save();c.translate(x,y);c.lineCap='round';
    const flutter=Math.sin(t*.9)*1.2;
    line(c,[[-154,0],[-122,-103]],'#96896b',1);line(c,[[155,0],[111,-106]],'#96896b',1);
    bamboo(c,[-121,0],[-121,-111],6);bamboo(c,[111,0],[111,-111],6);bamboo(c,[-121,-111],[111,-111],4);
    c.fillStyle='rgba(44,58,33,.1)';c.beginPath();c.ellipse(-5,0,139,9,0,0,Math.PI*2);c.fill();
    polygon(c,[[-140,-110],[-48,-145],[98,-125],[126,-110+flutter],[31,-98],[-121,-100+flutter]],'#c9c29a');
    polygon(c,[[-48,-145],[98,-125],[31,-98],[-12,-110]],'#e0d7b3');
    polygon(c,[[-140,-110],[-121,-100+flutter],[-12,-110],[-48,-145]],'#b6b58a');
    c.beginPath();c.moveTo(-140,-110);c.quadraticCurveTo(-66,-105,-12,-110);c.quadraticCurveTo(49,-97,126,-110+flutter);
    c.strokeStyle='#e5dbb7';c.lineWidth=2;c.stroke();
    line(c,[[-48,-143],[-12,-111],[31,-100]],'#9d9c78',.8);
    for(let i=0;i<11;i++){const x0=-120+i*21;line(c,[[x0,-112],[x0+7,-108]],'rgba(114,119,85,.24)',.6);}
    for(const px of [-121,111]){c.fillStyle='#747650';c.beginPath();c.ellipse(px,0,5,2,0,0,Math.PI*2);c.fill();}
    c.restore();
}
function teaTable(c:CanvasRenderingContext2D,x:number,y:number) {
    c.save();c.translate(x,y);c.lineCap='round';
    c.fillStyle='rgba(26,45,25,.16)';c.beginPath();c.ellipse(0,2,29,4,0,0,Math.PI*2);c.fill();
    bamboo(c,[-17,-25],[-15,0],4);bamboo(c,[17,-25],[15,0],4);
    polygon(c,[[-27,-29],[17,-33],[27,-26],[-17,-22]],'#ac9a67');
    for(let i=0;i<7;i++)line(c,[[-25+i*7,-28-i*.35],[-16+i*7,-22-i*.35]],'#e0c28d',1);
    c.fillStyle='#727c5b';c.beginPath();c.ellipse(-7,-33,8,8,0,0,Math.PI*2);c.fill();
    line(c,[[-1,-35],[6,-41],[5,-34]],'#788366',2.8);
    c.beginPath();c.arc(-8,-40,5,Math.PI,Math.PI*2);c.strokeStyle='#546145';c.lineWidth=2;c.stroke();
    c.fillStyle='#b4b592';c.beginPath();c.ellipse(-8,-39,6,1.8,0,0,Math.PI*2);c.fill();
    c.fillStyle='#d9d1ac';c.fillRect(13,-33,6,6);c.strokeStyle='#8e9774';c.strokeRect(13,-33,6,6);
    c.beginPath();c.arc(20,-30,2,Math.PI*1.5,Math.PI*.5);c.stroke();
    c.restore();
}
export function drawCampLeisure(c:CanvasRenderingContext2D,v:View) {
    const w=world();if(!w)return;const x=w.originX+layout.rest.x,y=groundAt(x);
    if(x+215<v.l||x-200>v.r||y<v.t||y-175>v.b)return;
    c.save();c.translate(x,y);
    polygon(c,[[-98,-1],[87,-4],[112,8],[-84,12]],'#b3aa75');
    for(let i=0;i<24;i++)line(c,[[-96+i*7,-1],[ -82+i*7,11]],i%3?'rgba(209,192,141,.64)':'#7e8953',.75);
    for(let j=0;j<4;j++)line(c,[[-92+j*3,1+j*3],[91+j*3,-2+j*3]],'#c9bd88',.6);
    canvasShade(c,-31,-1,w.elapsed);lounge(c,-7,-1);lounge(c,143,0,.77);teaTable(c,84,-1);
    c.fillStyle='#829162';c.beginPath();c.ellipse(-109,-3,13,5,0,0,Math.PI*2);c.fill();
    polygon(c,[[-121,-5],[-99,-5],[-103,-23],[-117,-23]],'#b09664');
    for(let i=0;i<5;i++)line(c,[[-119+i*4,-7],[-116+i*3,-21]],'#d0b483',.9);
    c.beginPath();c.arc(-110,-24,8,Math.PI,0);c.strokeStyle='#8b7850';c.lineWidth=2;c.stroke();
    c.fillStyle='#d6cca8';c.fillRect(-111,-22,10,9);line(c,[[-113,-14],[-101,-14]],'#aba781',1);
    c.restore();
}
export function drawNaturalBoundaries(c:CanvasRenderingContext2D,v:View) {
    const w=world();if(!w)return;
    for(let index=0;index<w.boundaries.length;index++){
        const wall=w.boundaries[index],points=wall.rockPolygon!,minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
        if(maxX<v.l||minX>v.r||v.t>535||v.b<0)continue;
        c.save();c.lineCap='round';c.lineJoin='round';
        c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();
        const g=c.createLinearGradient(minX,210,maxX,540);g.addColorStop(0,'#45583d');g.addColorStop(.45,'#87896b');g.addColorStop(1,'#a7a184');
        c.fillStyle=g;c.fillRect(minX,0,maxX-minX,550);
        const stone=getImage(index?'shore/bank-right.jpg':'shore/bank-left.jpg');
        if(stone){c.globalAlpha=.87;c.drawImage(stone,110,40,Math.min(360,stone.width-110),stone.height-40,minX,165,maxX-minX,370);c.globalAlpha=1;}
        const shade=c.createLinearGradient(minX,0,maxX,530);shade.addColorStop(0,'rgba(36,62,33,.52)');shade.addColorStop(.65,'rgba(72,88,47,.18)');shade.addColorStop(1,'rgba(120,116,79,.07)');
        c.fillStyle=shade;c.fillRect(minX,0,maxX-minX,550);
        for(let j=0;j<15;j++){
            const x0=minX+(j*61%(maxX-minX)),yy=248+(j*43%237);
            c.beginPath();c.moveTo(x0,yy);c.bezierCurveTo(x0+9,yy+9,x0-5,yy+25,x0+9,yy+37);c.quadraticCurveTo(x0+15,yy+47,x0+8,yy+54);
            c.strokeStyle='rgba(55,66,42,.22)';c.lineWidth=.65;c.stroke();
        }
        const tx=index===0?maxX-66:minX+142;
        c.beginPath();c.moveTo(tx-15,30);c.bezierCurveTo(tx+2,194,tx-20,342,tx-50,466);
        c.strokeStyle='#46513a';c.lineWidth=25;c.stroke();c.strokeStyle='#72744e';c.lineWidth=14;c.stroke();
        c.beginPath();c.moveTo(tx-22,50);c.bezierCurveTo(tx-6,224,tx-33,366,tx-58,450);c.strokeStyle='rgba(156,146,96,.5)';c.lineWidth=3;c.stroke();
        for(let j=0;j<7;j++){
            const x0=tx-71+j*25,yy=452+(j%3)*15;
            c.beginPath();c.moveTo(tx-17+j*2,324+j*9);c.bezierCurveTo(tx-36+j*9,392,x0-21,yy-37,x0+(j-3)*9,yy);
            c.strokeStyle='#48563b';c.lineWidth=7-j%3;c.stroke();c.strokeStyle='#808059';c.lineWidth=3-j%2;c.stroke();
        }
        c.restore();
        for(let j=0;j<7;j++){
            const p=points[Math.min(points.length-2,2+j)],x=p.x+(index?7:-7),y=p.y-1;
            c.beginPath();c.moveTo(x-10,y);c.quadraticCurveTo(x-16,y-7,x-4,y-8);c.quadraticCurveTo(x+1,y-16,x+7,y-7);c.quadraticCurveTo(x+23,y-5,x+12,y+1);c.closePath();
            c.fillStyle=j%2?'#72845a':'#59744b';c.fill();
        }
    }
}
