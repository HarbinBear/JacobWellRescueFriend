import { state } from '../../core/state';
import { closestRockPoint, RockPoint, RockWall, rockSegmentClear } from '../RockGeometry';
import { circleCollision, world, clamp } from './Geometry';

export function closestWorldSurface(x:number,y:number,maxDistance=Infinity){
    const m:any=state.mazeRescue,w=world();let best={x,y,dist:maxDistance,nx:0,ny:-1};if(!m||!w)return best;
    const walls=new Set<RockWall>(),ts=m.mazeTileSize,r=Math.floor(y/ts),c=Math.floor(x/ts);
    if(y<w.seamY+maxDistance)w.banks.forEach(b=>walls.add(b));
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        const cell=m.mazeMap[r+dy]?.[c+dx];if(cell&&typeof cell==='object'){walls.add(cell);for(const extra of cell.extras||[])walls.add(extra);}
    }
    for(const wall of walls){const p=closestRockPoint(wall,x,y);if(p.dist>=best.dist)continue;
        const sign=p.dist<0?-1:1,dx=(x-p.x)*sign,dy=(y-p.y)*sign,len=Math.hypot(dx,dy)||1;
        best={...p,nx:dx/len,ny:dy/len};
    }return best;
}
export function worldSegmentClear(a:RockPoint,b:RockPoint,padding=0){
    const w=world();if(!w)return true;const length=Math.hypot(b.x-a.x,b.y-a.y);
    if(length<.01)return !circleCollision(a.x,a.y,padding);
    if(!rockSegmentClear(w.banks,a,b,0))return false;
    const count=Math.max(1,Math.ceil(length/3));
    for(let i=1;i<count;i++){const f=i/count,r=Math.min(padding,length*f*.45,length*(1-f)*.45);if(circleCollision(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f,r))return false;}
    return true;
}
// A bounded local navigation grid for existing circular cave walls and the two
// shore profiles. No new terrain generation or rendering engine is involved.
export function buildWorldPath(start:RockPoint,end:RockPoint,padding:number):RockPoint[]{
    if(worldSegmentClear(start,end,padding))return[{...start},{...end}];
    const m:any=state.mazeRescue,step=32,pad=256;
    const left=Math.max(0,Math.floor((Math.min(start.x,end.x)-pad)/step)*step),top=Math.max(0,Math.floor((Math.min(start.y,end.y)-pad)/step)*step);
    const cols=Math.ceil((Math.min(m.mazeCols*m.mazeTileSize,Math.max(start.x,end.x)+pad)-left)/step),rows=Math.ceil((Math.min(m.mazeRows*m.mazeTileSize,Math.max(start.y,end.y)+pad)-top)/step);
    if(cols<=0||rows<=0||cols*rows>90000)return[{...start}];
    const point=(id:number)=>({x:left+(id%cols+.5)*step,y:top+(Math.floor(id/cols)+.5)*step});
    const occupancy=new Map<number,boolean>(),allowed=(id:number)=>{if(!occupancy.has(id)){const p=point(id);occupancy.set(id,!circleCollision(p.x,p.y,padding));}return occupancy.get(id)!;};
    const connectors=(p:RockPoint)=>{const r=Math.floor((p.y-top)/step),c=Math.floor((p.x-left)/step),out:number[]=[];
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const rr=r+dy,cc=c+dx,id=rr*cols+cc;if(rr<0||cc<0||rr>=rows||cc>=cols||!allowed(id)||!worldSegmentClear(p,point(id),padding))continue;out.push(id);}return out;
    };
    const ends=new Set(connectors(end)),cost=new Map<number,number>(),parent=new Map<number,number>(),closed=new Set<number>(),heap:{id:number;f:number}[]=[];
    const heuristic=(id:number)=>{const p=point(id);return Math.hypot(p.x-end.x,p.y-end.y);};
    const push=(entry:{id:number;f:number})=>{heap.push(entry);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].f<=entry.f)break;heap[i]=heap[p];i=p;}heap[i]=entry;};
    const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first.id;};
    for(const id of connectors(start)){const p=point(id),g=Math.hypot(p.x-start.x,p.y-start.y);cost.set(id,g);push({id,f:g+heuristic(id)});}
    let found=-1;
    for(let i=0;heap.length&&i<6000;i++){
        const id=pop();if(closed.has(id))continue;if(ends.has(id)){found=id;break;}closed.add(id);
        const r=Math.floor(id/cols),c=id%cols,p=point(id);
        for(const [dy,dx]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){const rr=r+dy,cc=c+dx,next=rr*cols+cc;
            if(rr<0||cc<0||rr>=rows||cc>=cols||closed.has(next)||!allowed(next))continue;const q=point(next);if(!worldSegmentClear(p,q,padding))continue;
            const g=cost.get(id)!+Math.hypot(p.x-q.x,p.y-q.y);if(!cost.has(next)||cost.get(next)!>g){cost.set(next,g);parent.set(next,id);push({id:next,f:g+heuristic(next)});}
        }
    }
    if(found<0)return[{...start}];const route=[{...end}];for(let id:number|undefined=found;id!==undefined;id=parent.get(id))route.push(point(id));route.push({...start});route.reverse();
    const result=[route[0]];for(let i=0;i<route.length-1;){let far=i+1;for(let j=i+2;j<route.length;j++)if(worldSegmentClear(route[i],route[j],padding))far=j;result.push(route[far]);i=far;}return result;
}
export function routeWorldTether(link:any,start:RockPoint,end:RockPoint):RockPoint[]{
    if(worldSegmentClear(start,end,.5)){link.route=[{...start},{...end}];return link.route.map((p:RockPoint)=>({...p}));}
    let route:RockPoint[]=[];
    if(Array.isArray(link.route)&&link.route.length>2){const old=[{...start},...link.route.slice(1,-1),{...end}];if(old.slice(1).every((p:RockPoint,i:number)=>worldSegmentClear(old[i],p,.5)))route=old;}
    if(!route.length)route=buildWorldPath(start,end,12);
    if(route.length>2){const result=[route[0]];for(let i=0;i<route.length-1;){let far=i+1;for(let j=i+2;j<route.length;j++)if(worldSegmentClear(route[i],route[j],.5))far=j;result.push(route[far]);i=far;}route=result;}
    link.route=route.map(p=>({...p}));return route.map(p=>({...p}));
}
