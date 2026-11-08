const path=require('path');

// These checked, in-memory adapters use the real current source files. They do
// not patch the working tree, copy an old game or replace the mobile baseline.
function integrate(id,source){
 function edit(find,replace){const count=source.split(find).length-1;if(count!==1)throw Error('Continuous-world adapter expected one match in '+id+': '+find.slice(0,100)+' (found '+count+')');source=source.replace(find,replace);}
 function add(module,symbols){const from=path.posix.dirname(id),to='/design/continuous-world/'+module;let rel=path.posix.relative(from,to);if(!rel.startsWith('.'))rel='./'+rel;source=`import { ${symbols} } from '${rel}';\n`+source;}
 if(id==='/src/logic/MazeLogic'){
  add('Runtime','shouldEnterWorld, enterContinuousWorld, previewSeed, continueWithoutDiveReset, updateContinuousWorld');add('Geometry','activeWorld');
  edit('export function resetMazeLogic(rockTrial=false) {','export function resetMazeLogic(rockTrial=false) {\n    if (shouldEnterWorld(rockTrial)) { enterContinuousWorld(() => { resetMazeLogic(); startMazeDive(\'scout\'); }); return; }');
  edit('export function startMazeDive(diveType: string) {','export function startMazeDive(diveType: string) {\n    if (continueWithoutDiveReset()) return;');
  edit('const mazeData = rockTrial?createCaveRockTrialMap():generateMazeMap();','const mazeData = rockTrial?createCaveRockTrialMap():generateMazeMap(previewSeed());');
  edit('export function updateMaze() {','export function updateMaze() {\n    if (activeWorld()) { updateContinuousWorld(); return; }');
 }
 if(id==='/src/logic/MazeSave'){
  add('WorldSave','saveWorldProgress, clearWorldSnapshot');add('Runtime','isBootingWorld');
  edit('export function saveMazeProgress(): boolean {','export function saveMazeProgress(): boolean {\n    if (isBootingWorld() || state.mazeRescue?.rockTrial) return false;\n    return saveWorldProgress();');
  edit('export function loadMazeProgress(): boolean {','export function loadMazeProgress(): boolean {\n    return false;');
  edit('export function clearMazeSave(): void {','export function clearMazeSave(): void {\n    if (!state.mazeRescue?.rockTrial) { clearWorldSnapshot(); return; }');
 }
 if(id==='/src/render/Render'){
  add('Geometry','activeWorld');add('RenderWorld','updateWorldAssets, drawContinuousFrame');
  edit('function drawFrame() {','function drawFrame() {\n    updateWorldAssets();\n    if (activeWorld()) { updateCaveRockResources(); drawContinuousFrame(); return; }');
 }
 if(id==='/src/core/input'){
  add('WorldHUD','worldTouchStart, worldTouchMove, worldTouchEnd');add('Runtime','exitContinuousWorld');add('Geometry','activeWorld');
  edit("function returnToMainMenu(){if(state.mazeRescue?.rockTrial)exitCaveRockTrial();else state.screen='menu';}","function returnToMainMenu(){if(activeWorld())exitContinuousWorld();else if(state.mazeRescue?.rockTrial)exitCaveRockTrial();else state.screen='menu';}");
  edit('wx.onTouchStart((res) => {','wx.onTouchStart((res) => {\n        if (worldTouchStart(res)) return;');
  edit('wx.onTouchMove((res) => {','wx.onTouchMove((res) => {\n        if (worldTouchMove(res)) return;');
  edit('wx.onTouchEnd((res) => {','wx.onTouchEnd((res) => {\n        if (worldTouchEnd(res)) return;');
  edit('wx.onTouchCancel((res) => {','wx.onTouchCancel((res) => {\n        if (worldTouchEnd(res, true)) return;');
 }
 if(id==='/src/logic/Collision'){
  add('Geometry','activeWorld, circleCollision');
  edit('export function checkMazeCollision(x: number, y: number, maze: any): boolean {','export function checkMazeCollision(x: number, y: number, maze: any): boolean {\n    if (activeWorld()) return circleCollision(x,y,CONFIG.maze.playerRadius);');
 }
 if(id==='/src/logic/FishEnemy'){
  add('Geometry','activeWorld, circleCollision');add('Runtime','stepAirFish, moveContinuousFish');
  edit('function checkCollisionMazeLocal(x: number, y: number): boolean {','function checkCollisionMazeLocal(x: number, y: number): boolean {\n    if (activeWorld()) return circleCollision(x,y,CONFIG.maze.playerRadius);');
  edit('export function updateFishEnemy(fish: FishEnemy, dt: number, getGlow = illuminatedRockSpot, school?: SchoolContext) {','export function updateFishEnemy(fish: FishEnemy, dt: number, getGlow = illuminatedRockSpot, school?: SchoolContext) {\n    if(activeWorld() && !fish.bound && (Math.abs(fish.x-player.x)>1150 || Math.abs(fish.y-player.y)>900)) return;\n    if(activeWorld() && stepAirFish(fish)) return;');
  edit('function applyMovement(fish: FishEnemy, effort = { x: fish.vx, y: fish.vy }) {','function applyMovement(fish: FishEnemy, effort = { x: fish.vx, y: fish.vy }) {\n    if(activeWorld()) return moveContinuousFish(fish,effort);');
 }
 if(id==='/src/render/HUDTopLeft'){
  add('Geometry','activeWorld, depthMeters');
  edit("id: 'retreat', visible: () => !state.mazeRescue?.npcRescued,","id: 'retreat', visible: () => !activeWorld() && !state.mazeRescue?.npcRescued,");
  edit('Math.max(0, Math.floor(player.y / (maze.mazeTileSize || 40)))','Math.floor(depthMeters(player.y))');
  edit('Math.max(0, Math.floor(player.y / (maze.mazeTileSize || 120)))','Math.floor(depthMeters(player.y))');
  edit('Math.max(0, Math.floor(player.y / tile))','Math.floor(depthMeters(player.y))');
 }
 if(id==='/src/logic/RopeTether'){
  add('Geometry','activeWorld');
  edit("const radius = state.screen === 'mazeRescue' ? CONFIG.maze.playerRadius : CONFIG.playerRadius;","const radius = activeWorld() && body !== player ? CONFIG.fishEnemy.size*(body.kind==='shoal'?.18:body.kind==='rammer'?.48:body.kind==='provoked'?.64:.38)*.85 : (state.screen === 'mazeRescue' ? CONFIG.maze.playerRadius : CONFIG.playerRadius);");
  edit("const mass = body === player ? (otherMoves ? .34 : .68) : .8;","const mass = activeWorld() ? (body === player ? (otherMoves ? .10 : .68) : endpoint.fish?.kind==='shoal' ? 2.1 : endpoint.fish?.kind==='curious' ? 1.6 : endpoint.fish?.kind==='rammer' ? 1.0 : .8) : (body === player ? (otherMoves ? .34 : .68) : .8);");
 }
 if(id==='/src/render/RenderFishHandling'){
  add('Geometry','activeWorld, world');
  edit("    if (state.interaction.task || Math.hypot(player.x - fish.x, player.y - fish.y) > 140) return;","    if (activeWorld() && fish.y < world()!.surfaceY) return;\n    if (state.interaction.task || Math.hypot(player.x - fish.x, player.y - fish.y) > 140) return;");
 }
 if(id==='/src/world/Visibility'){
  add('Geometry','activeWorld, world');
  edit("import { rockSegmentClear } from './RockGeometry';","import { rockSegmentClear, circleHitsRock } from './RockGeometry';");
  edit('export function isLineOfSight(x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {','export function isLineOfSight(x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {\n    if (activeWorld() && !rockSegmentClear(world()!.banks,{x:x1,y:y1},{x:x2,y:y2})) return false;');
  edit("if (Math.hypot(cx - w.x, cy - w.y) < w.r) return false;","if (circleHitsRock(w,cx,cy,0)) return false;");
 }
 if(id==='/src/render/RenderLight'){
  add('Geometry','activeWorld');
  edit('if ((CONFIG as any).quality?.skipOcclusion) {','if ((CONFIG as any).quality?.skipOcclusion && !activeWorld()) {');
  edit('            let dx = w.x - sx, dy = w.y - sy;','            if (w.rockPolygon) { if(Math.abs(w.x-sx)<w.r+maxDist && Math.abs(w.y-sy)<w.r+maxDist)obstacles.push({type:\'poly\',wall:w}); continue; }\n            let dx = w.x - sx, dy = w.y - sy;');
  edit("let hitDist = obs.type==='circle'", "let hitDist = obs.type==='poly' ? rayHitsRock(obs.wall,sx,sy,dx,dy,closestDist) : obs.type==='circle'");
 }
 if(id==='/src/render/shaders/maskFrag.glsl'){
  edit("uniform float u_maskAlpha;","uniform float u_maskAlpha;\nuniform float u_worldSurfaceY;");
  edit("float darkness = u_maskAlpha;","float darkness = u_maskAlpha;\n    if (u_worldSurfaceY >= 0.0) { float depth = clamp((worldPos.y-u_worldSurfaceY)/1100.0,0.0,1.0); darkness = mix(0.03,0.995,pow(depth,1.48)); }");
 }
 if(id==='/src/render/WebGLLight'){
  edit("    maskAlpha: number,","    maskAlpha: number,\n    worldSurfaceY?: number,");
  edit("    gl.uniform1f(u['u_maskAlpha']!, params.maskAlpha);","    gl.uniform1f(u['u_maskAlpha']!, params.maskAlpha);\n    gl.uniform1f(gl.getUniformLocation(ctx.program,'u_worldSurfaceY'),Number.isFinite(params.worldSurfaceY)?params.worldSurfaceY!:-1);");
 }
 if(id==='/src/logic/DecompressionSystem'){
  add('Geometry','activeWorld, depthMeters');
  edit('export function getCurrentDepthMeters(): number {','export function getCurrentDepthMeters(): number {\n    if (activeWorld()) return depthMeters(player.y);');
 }
 if(id==='/src/render/RenderBCD'){
  add('Geometry','world');
  edit("state.mazeRescue?.phase === 'play' &&","state.mazeRescue?.phase === 'play' && (!world() || world()!.headWet) &&");
 }
 if(id==='/src/extraction/logic/Loadout'){
  add('Geometry','world');
  edit('export function getActiveAirTanks(): string[] {','export function getActiveAirTanks(): string[] {\n    if(world()?.airTanks.length)return world()!.airTanks.slice();');
 }
 if(id==='/src/render/RenderMenu')source=source.replace("label: '一键下潜'","label: '继续连续章节'").replace("label: '继续游戏'","label: '进入林泉营地'").replace("subLabel: '营地与准备'","subLabel: '真实行走与原位存档'");
 if(id==='/game'){
  edit("const inCamp = state.screen === 'mazeRescue' && maze && (maze.phase === 'shore' || maze.phase === 'resolved_idle');","const inCamp = state.screen === 'mazeRescue' && maze && (maze.continuous ? !maze.continuous.headWet : (maze.phase === 'shore' || maze.phase === 'resolved_idle'));");
 }
 if(id==='/src/render/RenderDiver'){
  edit('type DiverMotion = {','type DiverMotion = {\n    landPose?: { blend:number; phase:number; effort:number; facing:number };');
  edit('    limp?: { thigh: number; shin: number },\n) {','    limp?: { thigh: number; shin: number },\n    groundPose?: { blend:number; phase:number; effort:number; facing:number },\n) {');
  for(const symbol of ['kneePX','kneePY','anklePX','anklePY'])edit('    const '+symbol+' =','    let '+symbol+' =');
  edit('    // ===== 绘制大腿 =====',`    const land = groundPose?.blend || 0;
    if (land > 0) {
        const phase = (groundPose!.phase + (side > 0 ? .5 : 0)) * Math.PI * 2;
        const stride = Math.sin(phase) * 13 * groundPose!.effort * groundPose!.facing;
        const lift = Math.max(0,Math.cos(phase)) * 5.5 * groundPose!.effort;
        kneePX += (hipPX - 17 + lift*.4 - kneePX) * land;
        kneePY += (side*2.5 + stride*.45 - kneePY) * land;
        anklePX += (-43 + lift - anklePX) * land;
        anklePY += (side*2.7 + stride - anklePY) * land;
    }
    // ===== 绘制大腿 =====`);
  edit('    const footDirX = calfDX / calfLen;','    const footDirX = calfDX / calfLen * (1-land);');
  edit('    const footDirY = calfDY / calfLen;','    const footDirY = calfDY / calfLen * (1-land) + (groundPose?.facing || 1)*land;');
  edit('    const finLengthFactor = 1 + ankleWave * cfg.finLengthPulse;','    const finLengthFactor = (1 + ankleWave * cfg.finLengthPulse) * (1-land*.58);');
  edit("    const authoredWork = motion.workPose ? sampleWorkMotion(motion.workPose) : null;","    const authoredWork = motion.workPose ? sampleWorkMotion(motion.workPose) : null;\n    const landBlend = motion.landPose?.blend || 0;");
  for(const symbol of ['leftArmUpper','leftArmLower','rightArmUpper','rightArmLower'])edit('    const '+symbol+' =','    let '+symbol+' =');
  edit('    renderCtx.save();\n    const workOffset',`    if (landBlend > 0 && !authoredWork) {
        const swing = Math.sin(motion.landPose!.phase*Math.PI*2)*.38*motion.landPose!.effort;
        leftArmUpper += (Math.PI + .13 + swing-leftArmUpper)*landBlend;
        leftArmLower += (Math.PI + .19 + swing-leftArmLower)*landBlend;
        rightArmUpper += (Math.PI - .13 - swing-rightArmUpper)*landBlend;
        rightArmLower += (Math.PI - .19 - swing-rightArmLower)*landBlend;
    }
    renderCtx.save();
    const workOffset`);
  edit('y + Math.sin(angle) * workOffset + (limp || authoredWork ? 0 : dance ? dance.bounce : driftY));','y + Math.sin(angle) * workOffset + (limp || authoredWork ? 0 : dance ? dance.bounce : driftY*(1-landBlend)));');
  edit('angle + (limp ? 0 : authoredWork ? authoredWork.roll : dance ? dance.roll : bodyRoll + resonance.roll)','angle + (limp ? 0 : authoredWork ? authoredWork.roll : dance ? dance.roll : (bodyRoll + resonance.roll)*(1-landBlend))');
  edit('limp ? { thigh: limp.leftThigh, shin: limp.leftShin } : undefined);','limp ? { thigh: limp.leftThigh, shin: limp.leftShin } : undefined, motion.landPose);');
  edit('limp ? { thigh: limp.rightThigh, shin: limp.rightShin } : undefined);','limp ? { thigh: limp.rightThigh, shin: limp.rightShin } : undefined, motion.landPose);');
 }
 return source;
}
module.exports={integrate};
