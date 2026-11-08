import { state,player } from '../../src/core/state';
import { CONFIG } from '../../src/core/config';
import type { TetherLine } from '../../src/logic/InteractionTypes';
import type { RockPoint } from '../../src/world/RockGeometry';
import { world } from './Geometry';
import { terrainCircle,terrainNearest,terrainRay,terrainSegmentClear,terrainWallFor,terrainPath } from './ContourTerrain';

export function hasContourTerrain(){return state.screen==='mazeRescue'&&!!world()?.terrain;}
export function contourCircle(wall:any,x:number,y:number,radius:number){return terrainCircle(world()!.terrain!,x,y,radius,wall.terrainRoot);}
export function contourClosest(wall:any,x:number,y:number){return terrainNearest(world()!.terrain!,x,y,Infinity,wall.terrainRoot);}
export function contourRay(wall:any,x:number,y:number,dx:number,dy:number,range:number){const hit=terrainRay(world()!.terrain!,x,y,dx,dy,range);return hit.wallRoot===wall.terrainRoot?hit.distance:range;}
export function contourSegment(a:any,b:any,padding=0){return terrainSegmentClear(world()!.terrain!,a,b,padding);}
export function contourNearestWall(x:number,y:number,maxDistance:number){const t=world()!.terrain!,p=terrainNearest(t,x,y,maxDistance);return p.dist<maxDistance&&p.wallRoot?{wall:terrainWallFor(t,p.wallRoot),dist:p.dist}:null;}
export function contourPath(a:any,b:any,padding:number){return terrainPath(world()!.terrain!,state.mazeRescue,a,b,padding);}
export function contourDirectionHit(angle:number,range:number){const t=world()!.terrain!,p=terrainRay(t,player.x,player.y,Math.cos(angle),Math.sin(angle),range);return p.distance<range?{kind:'rock' as const,distance:p.distance,point:{x:p.x,y:p.y},wall:terrainWallFor(t,p.wallRoot)}:null;}
export function contourLightPolygon(x:number,y:number,angle:number,range:number,fov:number,rays:number){
    const t=world()!.terrain!,count=Math.min(320,Math.max(96,rays)),width=fov*Math.PI/180,points:any[]=[];
    for(let i=0;i<=count;i++){const a=angle-width/2+width*i/count,p=terrainRay(t,x,y,Math.cos(a),Math.sin(a),range);points.push({x:p.x,y:p.y,dist:p.distance});}return points;
}

export function contourTetherRoute(link:TetherLine & {route?:RockPoint[]},start:RockPoint,end:RockPoint):RockPoint[]{
    const t=world()!.terrain!;
    if(terrainSegmentClear(t,start,end,.5)){link.route=[{...start},{...end}];return link.route.map(p=>({...p}));}
    let route:RockPoint[]=[];
    if(link.route && link.route.length>2){const old=[{...start},...link.route.slice(1,-1).map(p=>({...p})),{...end}];if(old.slice(1).every((p,i)=>terrainSegmentClear(t,old[i],p,.5)))route=old;}
    if(!route.length)route=terrainPath(t,state.mazeRescue,start,end,CONFIG.ropeAvoidPadding);
    if(route.length>2){const result=[route[0]];for(let i=0;i<route.length-1;){let far=i+1;for(let j=i+2;j<route.length;j++)if(terrainSegmentClear(t,route[i],route[j],.5))far=j;else break;result.push(route[far]);i=far;}route=result;}
    link.route=route.map(p=>({...p}));return route.map(p=>({...p}));
}
