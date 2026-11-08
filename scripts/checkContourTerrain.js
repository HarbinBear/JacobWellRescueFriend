const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),cache=new Map();
function load(file){file=path.posix.normalize(file);if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
 if(cache.has(file))return cache.get(file).exports;if(!fs.existsSync(path.join(ROOT,file+'.ts')))file+='/index';if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(fs.readFileSync(path.join(ROOT,file+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 new Function('module','exports','require',code)(module,module.exports,name=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),name))));return module.exports;
}
const core=load('src/core/state'),map=load('src/world/map'),geometry=load('design/continuous-world/Geometry'),contour=load('design/continuous-world/ContourTerrain');
const seeds=[26110941,0,1,2,128473,7391,42017,82901,91731,107773,192133,884492,4294967295];
const report={scope:'纯内存多种子几何回归；共享实际地图生成器，不建立另一张演示地图',seeds:[],samples:0};
for(const seed of seeds){
 const data=map.generateMazeMap(seed),m={...data,mazeTileSize:data.mazeTileSize,exitX:data.exitX,npcInitX:data.npcInitX,npcInitY:data.npcInitY};
 core.state.mazeRescue=m;core.state.screen='mazeRescue';const world=geometry.attachWorldTerrain(m),t=world.terrain,ts=m.mazeTileSize;
 assert(t.walls.length>0);assert(t.edges.length>1000);assert(!geometry.circleCollision(m.npcInitX,m.npcInitY,12),'新轮廓不能吞掉救援目标 seed='+seed);
 for(const wall of t.walls){assert(wall.rockPolygon.length>=4);assert.equal(wall.contourTerrain,true);assert(wall.edges.every(e=>Number.isFinite(e.a.x+e.a.y+e.b.x+e.b.y)));}
 const start=[Math.floor(world.seamY/ts),Math.floor(world.originX/ts)],goal=[Math.floor(m.npcInitY/ts),Math.floor(m.npcInitX/ts)],q=[start],seen=new Set([start.join(',')]);
 for(let i=0;i<q.length;i++){const[r,c]=q[i];for(const[dy,dx]of [[1,0],[-1,0],[0,1],[0,-1]]){const y=r+dy,x=c+dx,key=y+','+x;if(y>=start[0]&&m.mazeMap[y]?.[x]===0&&!seen.has(key)){seen.add(key);q.push([y,x]);}}}
 assert(seen.has(goal.join(',')),'接缝必须沿实际深洞连通目标 seed='+seed);
 let random=seed;for(let i=0;i<400;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;const x=random/4294967296*m.mazeCols*ts;random=(Math.imul(random,1664525)+1013904223)>>>0;const y=500+random/4294967296*(m.mazeRows*ts-650);
   const scalar=contour.terrainSample(t,x,y),point=contour.terrainNearest(t,x,y,45);
   if(Math.abs(scalar)>.03)assert.equal(contour.terrainCircle(t,x,y,0),scalar<0,'碰撞符号必须与渲染标量一致');
   if(point.dist>=0&&point.dist<35){const ray=contour.terrainRay(t,x,y,(point.x-x)/point.dist,(point.y-y)/point.dist,Math.max(1,point.dist+2));if(point.dist>.1)assert(Math.abs(ray.distance-point.dist)<.1,'手电与最近岩面必须同一轮廓');}
   report.samples++;
 }
 const dryX=world.originX-1100,dryY=geometry.groundAt(dryX)-43;Object.assign(core.player,{x:dryX,y:dryY,vx:0,vy:0});
 assert(!geometry.circleCollision(dryX,dryY,18),'岸上出生点必须净空');
 for(const depth of [100,600,1300,7000]){const body={x:dryX,y:dryY+depth,vx:1,vy:0},before=body.y;assert.equal(geometry.bankSupport(body,43),false,'深洞不能被当作近地面');assert.equal(body.y,before);}
 report.seeds.push({seed,roots:t.walls.length,edges:t.edges.length,ms:t.generationMs,reachable:seen.size});
}
const output=path.join(ROOT,'node_modules/.cache/continuous-world/contour-check.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
