import type { RockPoint } from '../../src/world/RockGeometry';

export interface TerrainEdge { a:RockPoint; b:RockPoint; root:number; minX:number; minY:number; maxX:number; maxY:number }
export interface TerrainWall { x:number; y:number; r:number; row:number; col:number; terrainRoot:number; contourTerrain:true; rockPolygon:RockPoint[]; rockHoles:RockPoint[][]; edges:TerrainEdge[] }
export interface ContourTerrain {
    step:number; x:number; y:number; cols:number; rows:number; field:Float32Array; labels:Int32Array; distance:Float32Array;
    walls:TerrainWall[]; edges:TerrainEdge[]; buckets:Map<string,TerrainEdge[]>; loops:RockPoint[][];
    texture:Uint8Array; generationMs:number; join:RockPoint;
}
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const BUCKET=192;
function noise(x:number,y:number,scale:number,seed:number) {
    const ix=Math.floor(x/scale),iy=Math.floor(y/scale),fx=smooth(0,1,x/scale-ix),fy=smooth(0,1,y/scale-iy);
    const h=(a:number,b:number)=>{let v=Math.imul(a+seed,374761393)^Math.imul(b-seed,668265263);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295*2-1;};
    return mix(mix(h(ix,iy),h(ix+1,iy),fx),mix(h(ix,iy+1),h(ix+1,iy+1),fx),fy);
}
function profile(nodes:RockPoint[],x:number) {
    for(let i=1;i<nodes.length;i++){const a=nodes[i-1],b=nodes[i];if(x>=Math.min(a.x,b.x)&&x<=Math.max(a.x,b.x))return mix(a.y,b.y,(x-a.x)/(b.x-a.x));}
    return Infinity;
}
export function terrainSample(t:ContourTerrain,x:number,y:number,source=t.field) {
    const fx=(x-t.x)/t.step,fy=(y-t.y)/t.step,c=Math.floor(fx),r=Math.floor(fy);
    if(c<0||r<0||c>=t.cols-1||r>=t.rows-1)return 150;
    const a=r*t.cols+c;return mix(mix(source[a],source[a+1],fx-c),mix(source[a+t.cols],source[a+t.cols+1],fx-c),fy-r);
}
function labelAt(t:ContourTerrain,x:number,y:number) {
    const c=Math.round((x-t.x)/t.step),r=Math.round((y-t.y)/t.step);let best=Infinity,label=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const cc=c+dx,rr=r+dy;if(cc<0||rr<0||cc>=t.cols||rr>=t.rows)continue;const i=rr*t.cols+cc;if(t.labels[i]>0){const d=Math.hypot(t.x+cc*t.step-x,t.y+rr*t.step-y);if(d<best){best=d;label=t.labels[i];}}}
    return label;
}
function area(points:RockPoint[]) {let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a.x*b.y-b.x*a.y;}return sum*.5;}
function blur(source:Float32Array,w:number,h:number) {
    const temp=new Float32Array(source.length),out=new Float32Array(source.length),weights=[1,4,6,4,1];
    for(let r=0;r<h;r++)for(let c=0;c<w;c++){let v=0;for(let i=-2;i<=2;i++)v+=source[r*w+clamp(c+i,0,w-1)]*weights[i+2];temp[r*w+c]=v/16;}
    for(let r=0;r<h;r++)for(let c=0;c<w;c++){let v=0;for(let i=-2;i<=2;i++)v+=temp[clamp(r+i,0,h-1)*w+c]*weights[i+2];out[r*w+c]=v/16;}
    return out;
}
function redistance(field:Float32Array,cols:number,rows:number,step:number) {
    const d=new Float32Array(field.length);d.fill(1e7);
    for(let r=1;r<rows-1;r++)for(let c=1;c<cols-1;c++){
        const i=r*cols+c,f=field[i];for(const n of [i-1,i+1,i-cols,i+cols])if((field[n]<0)!==(f<0))d[i]=Math.min(d[i],step*Math.abs(f)/(Math.abs(f)+Math.abs(field[n])));
    }
    const diag=step*Math.SQRT2;
    for(let r=1;r<rows;r++)for(let c=1;c<cols-1;c++){const i=r*cols+c;d[i]=Math.min(d[i],d[i-1]+step,d[i-cols]+step,d[i-cols-1]+diag,d[i-cols+1]+diag);}
    for(let r=rows-2;r>=0;r--)for(let c=cols-2;c>0;c--){const i=r*cols+c;d[i]=Math.min(d[i],d[i+1]+step,d[i+cols]+step,d[i+cols+1]+diag,d[i+cols-1]+diag);}
    for(let i=0;i<d.length;i++)d[i]=Math.min(192,d[i])*(field[i]<0?-1:1);return d;
}
function buildLoops(t:ContourTerrain) {
    const vertices=new Map<string,RockPoint>(),links=new Map<string,string[]>();
    const point=(edge:number,c:number,r:number,values:number[])=>{
        let key:string,a:RockPoint,b:RockPoint,va:number,vb:number;
        if(edge===0){key='h'+c+','+r;a={x:c,y:r};b={x:c+1,y:r};va=values[0];vb=values[1];}
        else if(edge===1){key='v'+(c+1)+','+r;a={x:c+1,y:r};b={x:c+1,y:r+1};va=values[1];vb=values[2];}
        else if(edge===2){key='h'+c+','+(r+1);a={x:c,y:r+1};b={x:c+1,y:r+1};va=values[3];vb=values[2];}
        else{key='v'+c+','+r;a={x:c,y:r};b={x:c,y:r+1};va=values[0];vb=values[3];}
        if(!vertices.has(key)){const f=clamp(va/(va-vb));vertices.set(key,{x:t.x+(a.x+(b.x-a.x)*f)*t.step,y:t.y+(a.y+(b.y-a.y)*f)*t.step});}
        return key;
    };
    const cases:Record<number,number[][]>={1:[[3,0]],2:[[0,1]],3:[[3,1]],4:[[1,2]],6:[[0,2]],7:[[3,2]],8:[[2,3]],9:[[2,0]],11:[[2,1]],12:[[1,3]],13:[[1,0]],14:[[0,3]]};
    for(let r=0;r<t.rows-1;r++)for(let c=0;c<t.cols-1;c++){
        const i=r*t.cols+c,v=[t.field[i],t.field[i+1],t.field[i+t.cols+1],t.field[i+t.cols]];
        let code=0;v.forEach((f,j)=>{if(f<0)code|=1<<j;});if(code===0||code===15)continue;
        const mid=v.reduce((a,b)=>a+b,0)<0;
        const pairs=code===5?(mid?[[0,1],[2,3]]:[[3,0],[1,2]]):code===10?(mid?[[3,0],[1,2]]:[[0,1],[2,3]]):cases[code];
        for(const [ea,eb]of pairs){const a=point(ea,c,r,v),b=point(eb,c,r,v);if(!links.has(a))links.set(a,[]);if(!links.has(b))links.set(b,[]);links.get(a)!.push(b);links.get(b)!.push(a);}
    }
    const seen=new Set<string>();
    for(const [start,adjacent]of links){if(seen.has(start))continue;const loop:RockPoint[]=[];let at=start,previous='';
        for(let guard=0;guard<=vertices.size;guard++){
            if(at===start&&loop.length)break;
            if(seen.has(at)||links.get(at)?.length!==2)throw Error('不完整岩体轮廓：'+at);
            seen.add(at);loop.push(vertices.get(at)!);const ends=links.get(at)!,next=ends[0]===previous?ends[1]:ends[0];previous=at;at=next;
        }
        if(loop.length>=4&&Math.abs(area(loop))>t.step*t.step*.25)t.loops.push(loop);
    }
}
function createWalls(t:ContourTerrain) {
    const grouped=new Map<number,RockPoint[][]>();
    for(const loop of t.loops){
        let root=0;for(let i=0;i<loop.length&&!root;i++){const a=loop[i],b=loop[(i+1)%loop.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
            for(const side of [-1,1]){const x=mx-dy/len*5*side,y=my+dx/len*5*side;if(terrainSample(t,x,y)<0){root=labelAt(t,x,y);break;}}}
        if(!root)continue;if(!grouped.has(root))grouped.set(root,[]);grouped.get(root)!.push(loop);
    }
    for(const [root,loops]of grouped){loops.sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));
        if(area(loops[0])<0)loops[0].reverse();for(const hole of loops.slice(1))if(area(hole)>0)hole.reverse();
        const points=loops[0],xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
        const wall:TerrainWall={terrainRoot:root,contourTerrain:true,x,y,r:Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/2,row:-1,col:-1,rockPolygon:points,rockHoles:loops.slice(1),edges:[]};
        for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];const edge={a,b,root,minX:Math.min(a.x,b.x),minY:Math.min(a.y,b.y),maxX:Math.max(a.x,b.x),maxY:Math.max(a.y,b.y)};t.edges.push(edge);wall.edges.push(edge);}
        t.walls.push(wall);
    }
    for(const e of t.edges)for(let r=Math.floor(e.minY/BUCKET);r<=Math.floor(e.maxY/BUCKET);r++)for(let c=Math.floor(e.minX/BUCKET);c<=Math.floor(e.maxX/BUCKET);c++){
        const key=c+','+r;if(!t.buckets.has(key))t.buckets.set(key,[]);t.buckets.get(key)!.push(e);
    }
}
export function buildContourTerrain(maze:any,left:RockPoint[],right:RockPoint[],origin:number,seam:number,join:RockPoint):ContourTerrain {
    const begin=Date.now(),step=24,width=maze.mazeCols*maze.mazeTileSize,height=maze.mazeRows*maze.mazeTileSize,pad=step*3;
    const t:ContourTerrain={x:-pad,y:-pad,step,cols:Math.ceil((width+pad*2)/step)+1,rows:Math.ceil((height+pad*2)/step)+1,field:null!,labels:null!,distance:null!,walls:[],edges:[],buckets:new Map(),loops:[],texture:null!,generationMs:0,join};
    const ts=maze.mazeTileSize,raw=new Float32Array(t.cols*t.rows),endY=Math.max(2100,join.y+ts*2),endX=join.x-origin;
    const centers=[[920,0,140],[1190,35,190],[1490,110,280],[1800,endX*.65-35,195],[endY,endX,145]];
    function well(x:number,y:number){
        if(y<880||y>endY+120)return -200;
        let a=centers[0],b=centers[1];for(let i=1;i<centers.length;i++){a=centers[i-1];b=centers[i];if(y<=b[0])break;}
        const f=smooth(a[0],b[0],y),cx=mix(a[1],b[1],f),radius=mix(a[2],b[2],f)*(1-smooth(endY,endY+120,y));
        return radius-Math.abs(x-origin-cx);
    }
    function cave(x:number,y:number){
        const c=x/ts-.5,r=y/ts-.5,cc=Math.floor(c),rr=Math.floor(r);
        const at=(x:number,y:number)=>x>=0&&y>=0&&x<maze.mazeCols&&y<maze.mazeRows&&maze.mazeMap[y]?.[x]===0?76:-76;
        return mix(mix(at(cc,rr),at(cc+1,rr),c-cc),mix(at(cc,rr+1),at(cc+1,rr+1),c-cc),r-rr);
    }
    for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){
        const x=t.x+c*step,y=t.y+r*step,local=x-origin;
        let ground=profile(left,local);if(!Number.isFinite(ground))ground=profile(right,local);
        if(local<left[0].x)ground=left[0].y;if(local>right[0].x)ground=right[0].y;
        const above=Number.isFinite(ground)?clamp(ground-y,-160,160):160;
        const transition=smooth(seam-130,seam+180,y),cut=well(x,y),base=Math.max(mix(above,cave(x,y),transition),cut);
        const erosion=(noise(x,y,160,maze.seed)*7+noise(x,y,63,maze.seed+17)*3.5)*smooth(630,900,y);
        let value=base+erosion;
        if(x<0||y<0||x>width||y>height)value=160;
        raw[r*t.cols+c]=value===0?.001:value;
    }
    const filtered=blur(raw,t.cols,t.rows);t.field=filtered;
    // Do not blur the walking profile; the top 0.6m has exactly the same feet,
    // contact shadow and visible rock boundary as the physical shoreline.
    for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++)if(t.y+r*step<650)filtered[r*t.cols+c]=raw[r*t.cols+c];
    t.labels=new Int32Array(filtered.length);let root=0;const queue=new Int32Array(filtered.length);
    for(let i=0;i<filtered.length;i++){if(filtered[i]>=0||t.labels[i])continue;root++;let head=0,tail=0;queue[tail++]=i;t.labels[i]=root;
        while(head<tail){const at=queue[head++],c=at%t.cols,r=Math.floor(at/t.cols);for(const next of [c>0?at-1:-1,c<t.cols-1?at+1:-1,r>0?at-t.cols:-1,r<t.rows-1?at+t.cols:-1])if(next>=0&&filtered[next]<0&&!t.labels[next]){t.labels[next]=root;queue[tail++]=next;}}
    }
    buildLoops(t);createWalls(t);t.distance=redistance(filtered,t.cols,t.rows,step);t.texture=new Uint8Array(filtered.length*4);
    for(let i=0;i<filtered.length;i++){
        const scalar=Math.round(clamp((filtered[i]+192)/384)*65535),distance=Math.round(clamp((t.distance[i]+192)/384)*255);
        t.texture[i*4]=scalar>>>8;t.texture[i*4+1]=scalar&255;t.texture[i*4+2]=distance;t.texture[i*4+3]=255;
    }
    t.generationMs=Date.now()-begin;return t;
}
export function terrainEdgesIn(t:ContourTerrain,minX:number,minY:number,maxX:number,maxY:number) {
    const out=new Set<TerrainEdge>();for(let r=Math.floor(minY/BUCKET);r<=Math.floor(maxY/BUCKET);r++)for(let c=Math.floor(minX/BUCKET);c<=Math.floor(maxX/BUCKET);c++)for(const e of t.buckets.get(c+','+r)||[])out.add(e);return out;
}
function nearestOnEdge(e:TerrainEdge,x:number,y:number) {const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,f=clamp(((x-e.a.x)*dx+(y-e.a.y)*dy)/(dx*dx+dy*dy||1)),px=e.a.x+dx*f,py=e.a.y+dy*f;return{x:px,y:py,dist:Math.hypot(x-px,y-py),wallRoot:e.root};}
export function terrainNearest(t:ContourTerrain,x:number,y:number,maxDistance=Infinity,root=0) {
    let best:any=null,radius=Math.min(96,maxDistance);
    for(let pass=0;pass<9;pass++){
        const edges=terrainEdgesIn(t,x-radius,y-radius,x+radius,y+radius);
        for(const e of edges){if(root&&e.root!==root)continue;const point=nearestOnEdge(e,x,y);if(point.dist<=maxDistance&&(!best||point.dist<best.dist))best=point;}
        if(best&&best.dist<=radius||radius>=maxDistance)break;radius=Math.min(maxDistance,radius*2);
    }
    if(!best)return{x,y,dist:1e6,wallRoot:root};
    if(terrainSample(t,x,y)<0&&(!root||labelAt(t,x,y)===root))best.dist=-best.dist;return best;
}
export function terrainCircle(t:ContourTerrain,x:number,y:number,radius:number,root=0) {
    if(terrainSample(t,x,y)<-.001&&(!root||labelAt(t,x,y)===root))return true;
    if(radius<=0)return false;const point=terrainNearest(t,x,y,radius,root);return point.dist<radius;
}
export function terrainRay(t:ContourTerrain,x:number,y:number,dx:number,dy:number,range:number) {
    let best=range,wallRoot=0;
    for(const e of terrainEdgesIn(t,Math.min(x,x+dx*range)-1,Math.min(y,y+dy*range)-1,Math.max(x,x+dx*range)+1,Math.max(y,y+dy*range)+1)){
        const ex=e.b.x-e.a.x,ey=e.b.y-e.a.y,det=dx*ey-dy*ex;if(Math.abs(det)<1e-9)continue;
        const ax=e.a.x-x,ay=e.a.y-y,d=(ax*ey-ay*ex)/det,u=(ax*dy-ay*dx)/det;
        if(d>.015&&d<best&&u>=0&&u<=1){best=d;wallRoot=e.root;}
    }
    return{distance:best,wallRoot,x:x+dx*best,y:y+dy*best};
}
export function terrainSegmentClear(t:ContourTerrain,a:RockPoint,b:RockPoint,padding=0) {
    const length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.01)return !terrainCircle(t,a.x,a.y,padding);
    const hit=terrainRay(t,a.x,a.y,(b.x-a.x)/length,(b.y-a.y)/length,length);
    if(hit.distance<length-.1)return false;
    const steps=Math.max(1,Math.ceil(length/12));
    for(let i=1;i<steps;i++){const f=i/steps,r=Math.min(padding,length*f*.45,length*(1-f)*.45);if(terrainCircle(t,mix(a.x,b.x,f),mix(a.y,b.y,f),r))return false;}
    return true;
}
export function terrainWallFor(t:ContourTerrain,root:number){return t.walls.find(w=>w.terrainRoot===root)||null;}
export function terrainPath(t:ContourTerrain,maze:any,start:RockPoint,end:RockPoint,padding:number):RockPoint[] {
    if(terrainSegmentClear(t,start,end,padding))return[{...start},{...end}];
    const ts=maze.mazeTileSize,cols=maze.mazeCols,rows=maze.mazeRows;
    const candidate=(p:RockPoint)=>{const r=Math.floor(p.y/ts),c=Math.floor(p.x/ts);let best:any=null;
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const rr=r+dy,cc=c+dx,at={x:(cc+.5)*ts,y:(rr+.5)*ts};if(rr<0||cc<0||rr>=rows||cc>=cols||maze.mazeMap[rr]?.[cc]!==0||!terrainSegmentClear(t,p,at,Math.min(12,padding)))continue;const d=Math.hypot(at.x-p.x,at.y-p.y);if(!best||d<best.d)best={r:rr,c:cc,d};}return best;};
    const a=candidate(start),b=candidate(end);if(!a||!b)return[];
    const n=cols*rows,g=new Float64Array(n);g.fill(Infinity);const parent=new Int32Array(n);parent.fill(-1);const closed=new Uint8Array(n),heap:{id:number;f:number}[]=[];
    const target=b.r*cols+b.c,begin=a.r*cols+a.c;
    const push=(item:{id:number;f:number})=>{heap.push(item);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].f<=item.f)break;heap[i]=heap[p];i=p;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
    const heuristic=(r:number,c:number)=>Math.hypot(r-b.r,c-b.c);g[begin]=0;push({id:begin,f:heuristic(a.r,a.c)});let found=false;
    for(let count=0;heap.length&&count<cols*rows;count++){
        const at=pop().id;if(closed[at])continue;closed[at]=1;if(at===target){found=true;break;}const r=Math.floor(at/cols),c=at%cols;
        for(const [dy,dx]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){const rr=r+dy,cc=c+dx,id=rr*cols+cc;if(rr<0||cc<0||rr>=rows||cc>=cols||closed[id]||maze.mazeMap[rr]?.[cc]!==0)continue;
            const p={x:(c+.5)*ts,y:(r+.5)*ts},q={x:(cc+.5)*ts,y:(rr+.5)*ts};if(!terrainSegmentClear(t,p,q,padding))continue;
            const cost=g[at]+Math.hypot(dx,dy);if(cost<g[id]){g[id]=cost;parent[id]=at;push({id,f:cost+heuristic(rr,cc)});}
        }
    }
    if(!found)return[];const route:RockPoint[]=[{...end}];let at=target;while(at>=0){route.push({x:(at%cols+.5)*ts,y:(Math.floor(at/cols)+.5)*ts});at=parent[at];}route.push({...start});route.reverse();
    const result=[route[0]];for(let i=0;i<route.length-1;){let far=i+1;for(let j=i+2;j<route.length;j++)if(terrainSegmentClear(t,route[i],route[j],padding))far=j;else break;result.push(route[far]);i=far;}return result;
}
