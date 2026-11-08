const path=require('path');
function integrateContour(id,source){
 function edit(find,replace){const n=source.split(find).length-1;if(n!==1)throw Error('Contour adapter requires one match: '+id+' '+find.slice(0,90)+' ('+n+')');source=source.replace(find,replace);}
 function add(module,symbols){let rel=path.posix.relative(path.posix.dirname(id),'/design/continuous-world/'+module);if(!rel.startsWith('.'))rel='./'+rel;source=`import { ${symbols} } from '${rel}';\n`+source;}
 if(id==='/src/world/RockGeometry'){
  add('TerrainQueries','hasContourTerrain, contourClosest, contourCircle, contourRay, contourSegment');
  edit('export type RockWall = { x: number; y: number; r: number; row: number; col: number; rockPolygon?: RockPoint[] };','export type RockWall = { x: number; y: number; r: number; row: number; col: number; rockPolygon?: RockPoint[]; rockHoles?: RockPoint[][]; contourTerrain?:boolean; terrainRoot?:number };');
  edit('export function closestRockPoint(wall: RockWall, x: number, y: number): RockPoint & { dist: number } {','export function closestRockPoint(wall: RockWall, x: number, y: number): RockPoint & { dist: number } {\n    if(wall.contourTerrain && hasContourTerrain())return contourClosest(wall,x,y);');
  edit('export function circleHitsRock(wall: RockWall, x: number, y: number, radius: number): boolean {','export function circleHitsRock(wall: RockWall, x: number, y: number, radius: number): boolean {\n    if(wall.contourTerrain && hasContourTerrain())return contourCircle(wall,x,y,radius);');
  edit('export function rayHitsRock(wall: RockWall, x: number, y: number, dx: number, dy: number, range: number): number {','export function rayHitsRock(wall: RockWall, x: number, y: number, dx: number, dy: number, range: number): number {\n    if(wall.contourTerrain && hasContourTerrain())return contourRay(wall,x,y,dx,dy,range);');
  edit('export function rockSegmentClear(walls: RockWall[], a: RockPoint, b: RockPoint, padding = 0): boolean {','export function rockSegmentClear(walls: RockWall[], a: RockPoint, b: RockPoint, padding = 0): boolean {\n    if(hasContourTerrain() && walls.some(w=>w.contourTerrain))return contourSegment(a,b,padding);');
 }
 if(id==='/src/world/Visibility'){
  add('TerrainQueries','hasContourTerrain, contourSegment');
  edit('export function isLineOfSight(x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {','export function isLineOfSight(x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {\n    if(hasContourTerrain())return Math.hypot(x2-x1,y2-y1)<=maxDist && contourSegment({x:x1,y:y1},{x:x2,y:y2});');
 }
 if(id==='/src/logic/Rope'){
  add('TerrainQueries','hasContourTerrain, contourNearestWall');
  edit('export function findNearestWall(x: number, y: number, maxDist: number): any {','export function findNearestWall(x: number, y: number, maxDist: number): any {\n    if(hasContourTerrain())return contourNearestWall(x,y,maxDist);');
 }
 if(id==='/src/logic/Pathfinding'){
  add('TerrainQueries','hasContourTerrain, contourPath');
  edit('export function buildAvoidedPath(start: any, end: any, padding: number): any[] {','export function buildAvoidedPath(start: any, end: any, padding: number): any[] {\n    if(hasContourTerrain())return contourPath(start,end,padding);');
 }
 if(id==='/src/logic/InteractionRay'){
  add('TerrainQueries','hasContourTerrain, contourDirectionHit');
  edit('export function firstRockHit(angle: number, range: number): DirectionHit | null {','export function firstRockHit(angle: number, range: number): DirectionHit | null {\n    if(hasContourTerrain())return contourDirectionHit(angle,range);');
 }
 if(id==='/src/render/RenderLight'){
  add('TerrainQueries','hasContourTerrain, contourLightPolygon');
  edit('    let points: any[] = [];','    let points: any[] = [];\n    if(hasContourTerrain())return contourLightPolygon(sx,sy,angle,maxDist,fovDeg,(CONFIG as any).quality?.rayCount??CONFIG.rayCount);');
 }
 if(id==='/src/logic/Interaction'){
  add('TerrainQueries','hasContourTerrain');add('Geometry','world, circleCollision');
  edit("    const distance = Math.hypot(point.x - player.x, point.y - player.y), reach = CONFIG.fishInteraction.handReach;","    const distance = Math.hypot(point.x - player.x, point.y - player.y), reach = CONFIG.fishInteraction.handReach;\n    if(hasContourTerrain() && world()!.grounded && world()!.landBlend>.6)return distance<=reach+24 && visibleInteractionPoint(point)?{x:player.x,y:player.y}:null;");
  edit("Math.hypot(point.x - player.x, point.y - player.y) > CONFIG.fishInteraction.handReach + 8","Math.hypot(point.x - player.x, point.y - player.y) > CONFIG.fishInteraction.handReach + (hasContourTerrain() && world()!.grounded && task.kind==='tie'?24:8)");
  edit('function canOccupy(point: RopePoint) {','function canOccupy(point: RopePoint) {\n    if(hasContourTerrain())return !circleCollision(point.x,point.y,18);');
  edit("    if (!task.anchor?.self && task.target?.kind !== 'self') {","    if (hasContourTerrain() && world()!.grounded && world()!.landBlend>.6 && Math.abs(point.x-player.x)>2)world()!.facing=point.x>player.x?1:-1;\n    if (!task.anchor?.self && task.target?.kind !== 'self' && !(hasContourTerrain() && world()!.grounded && world()!.landBlend>.6)) {");
 }
 if(id==='/src/logic/RopeTether'){
  add('TerrainQueries','hasContourTerrain, contourTetherRoute');add('Geometry','circleCollision');
  edit("function routeLine(link: TetherLine, start: RopePoint, end: RopePoint) {","function routeLine(link: TetherLine, start: RopePoint, end: RopePoint) {\n    if(hasContourTerrain())return contourTetherRoute(link,start,end);");
  edit("const radius = activeWorld() && body !== player ? CONFIG.fishEnemy.size*(body.kind==='shoal'?.18:body.kind==='rammer'?.48:body.kind==='provoked'?.64:.38)*.85 : (state.screen === 'mazeRescue' ? CONFIG.maze.playerRadius : CONFIG.playerRadius);","const radius = hasContourTerrain() ? (body===player?18:CONFIG.fishEnemy.size*(body.kind==='shoal'?.18:body.kind==='rammer'?.48:body.kind==='provoked'?.64:.38)) : (state.screen === 'mazeRescue' ? CONFIG.maze.playerRadius : CONFIG.playerRadius);");
  const rel=path.posix.relative(path.posix.dirname(id),'/src/logic/FishGeometry');source="import { fishKnotPoint } from '"+(rel.startsWith('.')?rel:'./'+rel)+"';\n"+source;
  edit("    const context = getActiveMapContext();","    const context = getActiveMapContext();\n    if(hasContourTerrain() && body!==player && body.bound){const knot=fishKnotPoint(body);if(circleCollision(to.x+knot.x-body.x,to.y+knot.y-body.y,1.5))return false;}");
 }
 if(id==='/src/logic/RescueTow'){
  add('TerrainQueries','hasContourTerrain');
  edit("let npcCorrection = over * .78;","let npcCorrection = hasContourTerrain()?Math.min(2.8,over*.78):over*.78;");
  edit("const pull = over - npcCorrection;","const pull = hasContourTerrain()?Math.min(2.2,over-npcCorrection):over-npcCorrection;");
  edit("const x = npc.x + nx * (44 - dist), y = npc.y + ny * (44 - dist);","const amount=hasContourTerrain()?Math.min(2.4,44-dist):44-dist;const x = npc.x + nx * amount, y = npc.y + ny * amount;");
 }
 // Fins are equipment, not a shape scaled down merely by moving into air.
 // The original swimmer remains as fallback; equip/unequip is a separate task.
 if(id==='/src/render/RenderDiver')edit('const finLengthFactor = (1 + ankleWave * cfg.finLengthPulse) * (1-land*.58);','const finLengthFactor = 1 + ankleWave * cfg.finLengthPulse;');
 return source;
}
module.exports={integrateContour};
