const assert=require('assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'../src'),cache=new Map(),storage=new Map();
const noop=()=>0,idle=new Proxy({}, {get:()=>noop});
const overrides={
 'core/SaveStorage':{saveJSON:(k,d)=>{storage.set(k,JSON.parse(JSON.stringify(d)));return true},loadJSON:k=>storage.has(k)?JSON.parse(JSON.stringify(storage.get(k))):null,removeKey:k=>storage.delete(k)},
 'audio/AudioManager':idle,'audio/AdaptiveMusic':{warmUpAdaptiveMusic:noop,resetAdaptiveMusic:noop,getAdaptiveMusicPreparation:()=>({status:'ready'}),getAdaptiveMusicClock:()=>({playing:true})},
 'story/HomeScene':idle,'logic/Particle':idle,'logic/BreathSystem':new Proxy({computeBuoyancyOffset:()=>0},{get:(o,k)=>o[k]||noop}),
 'logic/ManualDrive':idle,'logic/CollisionImpact':idle,'logic/Marker':idle,'logic/Relic':{buildRelicsForMaze:()=>[],resetRelicDiscoveryForDive:noop,updateRelicDiscovery:noop},
 'logic/LifeDetector':idle,'logic/NPCPerception':{isRescueTargetVisible:()=>false},'logic/DecompressionSystem':new Proxy({getPenaltyO2MaxMul:()=>1},{get:(o,k)=>o[k]||noop}),'logic/BCDSystem':idle,
 'extraction':{
  ensureExtractionState:()=>load('extraction/core/ExtractionState').ensureExtractionState(),
  restoreLoadoutAfterDive:()=>load('extraction/logic/Loadout').restoreLoadoutAfterDive(),
  onExtractionDiveStart:()=>load('extraction/logic/Loadout').applyLoadoutForDive(),
  onExtractionDiveEnd:()=>load('extraction/logic/Loadout').restoreLoadoutAfterDive(),updateCarryItemAnim:noop,
 },
};
function load(file){
 if(file in overrides)return overrides[file];if(cache.has(file))return cache.get(file);
 if(!fs.existsSync(path.join(root,file+'.ts')))file+='/index';
 const exports={};cache.set(file,exports);
 let source=fs.readFileSync(path.join(root,file+'.ts'),'utf8');
 if(process.argv.includes('--sculpt')&&file==='world/CaveRockData')source='export const CAVE_ROCK_ROOM = '+fs.readFileSync(path.join(root,'../design/cave-room/sculpt/assets/scene.json'),'utf8')+';';
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('exports','require',code)(exports,n=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),n))));return exports;
}
const {state,player}=load('core/state'),{CONFIG}=load('core/config');
const {createCaveRockTrialMap,buildCaveRockPath}=load('world/CaveRockTrial'),geom=load('world/RockGeometry');
const maze=createCaveRockTrialMap();
assert(!geom.rockTrialCollision(maze,maze.spawnX,maze.spawnY,CONFIG.maze.playerRadius));
assert(!geom.rockTrialCollision(maze,maze.npcInitX,maze.npcInitY,CONFIG.maze.playerRadius));
const spawn={x:maze.spawnX,y:maze.spawnY},npc={x:maze.npcInitX,y:maze.npcInitY};
for(const end of [npc,{x:maze.exitX,y:25},{x:maze.caveRockRoom.x+350,y:maze.caveRockRoom.y+370}]){
 const route=buildCaveRockPath(maze,spawn,end,CONFIG.maze.playerRadius);
 assert(route.length>1,'Playable route missing: '+JSON.stringify(end));
 for(let i=1;i<route.length;i++)assert(geom.rockSegmentClear(maze.mazeWalls,route[i-1],route[i],CONFIG.maze.playerRadius));
 assert(Math.hypot(route.at(-1).x-end.x,route.at(-1).y-end.y)<.01);
}
state.screen='mazeRescue';state.mazeRescue={...maze,rockTrial:true};
const rope=load('logic/Rope'),pathfinding=load('logic/Pathfinding'),collision=load('logic/Collision'),visibility=load('world/Visibility');
const near=rope.findNearestWall(maze.caveRockRoom.x+350,maze.caveRockRoom.y+684,100);
assert(near?.wall.rockPolygon);const anchor=geom.closestRockPoint(near.wall,maze.caveRockRoom.x+350,maze.caveRockRoom.y+684);
const hit=geom.rayHitsRock(near.wall,maze.caveRockRoom.x+350,maze.caveRockRoom.y+684,(anchor.x-maze.caveRockRoom.x-350)/anchor.dist,(anchor.y-maze.caveRockRoom.y-684)/anchor.dist,100);
assert(Math.abs(hit-anchor.dist)<.01,'Light and anchor must meet the same outline');
const crown=maze.mazeWalls[2];assert(collision.checkMazeCollision(crown.x,crown.y,state.mazeRescue));
assert(!visibility.isLineOfSight(crown.x-90,crown.y,crown.x+90,crown.y,1000));
const wallPath=pathfinding.buildAvoidedPath(spawn,npc,12);assert(wallPath.length>=2);
for(let i=1;i<wallPath.length;i++)assert(geom.rockSegmentClear(maze.mazeWalls,wallPath[i-1],wallPath[i],12));
const map=load('world/map');assert.deepEqual(map.generateMazeMap(128473),map.generateMazeMap(128473),'Normal seeded map must stay unchanged');
const logic=load('logic/MazeLogic'),save=load('logic/MazeSave'),exSave=load('extraction/core/ExtractionSave'),story=load('story/StoryProgressSave');
state.mazeRescue=null;logic.resetMazeLogic();
const originalMaze=state.mazeRescue,originalEx=load('extraction/core/ExtractionState').ensureExtractionState(),originalStory=state.story2;
originalEx.coins=432;originalEx.consumables.airTankS=7;save.saveMazeProgress();exSave.saveExtractionProgress();story.saveStoryProgress();
const originalMarkers=state.markers;originalMarkers.push({x:111,y:222,type:'arrow'});
const saved=JSON.stringify([...storage]);const originalLight=CONFIG.lightRange;
logic.startCaveRockTrial();assert.notEqual(state.markers,originalMarkers);assert.equal(state.markers.length,0);state.markers.push({x:999,y:999});assert(state.mazeRescue.rockTrial);assert.equal(state.mazeRescue.phase,'diving_in');assert.notEqual(state.extraction,originalEx);
state.extraction.coins=9999;state.extraction.consumables.airTankS=0;state.story2.nightIndex=99;
assert.equal(save.saveMazeProgress(),false);assert.equal(exSave.saveExtractionProgress(),false);assert.equal(story.saveStoryProgress(),false);
save.clearMazeSave();exSave.clearExtractionSave();story.clearStoryProgress();assert.equal(JSON.stringify([...storage]),saved,'Trial must not mutate or delete persisted data');
logic.exitCaveRockTrial();assert.equal(state.mazeRescue,originalMaze);assert.equal(state.extraction,originalEx);assert.equal(state.story2,originalStory);assert.equal(state.markers,originalMarkers);assert.deepEqual(state.markers,[{x:111,y:222,type:'arrow'}]);assert.equal(originalEx.coins,432);assert.equal(originalEx.consumables.airTankS,7);assert.equal(CONFIG.lightRange,originalLight);assert.equal(state.screen,'menu');
logic.startCaveRockTrial();logic.replayMazeLogic();assert(state.mazeRescue.rockTrial);assert.equal(JSON.stringify([...storage]),saved);logic.acceptNewCase();assert.equal(state.screen,'menu');assert.equal(JSON.stringify([...storage]),saved);
console.log('Cave rock trial: real routes, collision/light/anchor/rope geometry, ordinary map determinism and save/equipment isolation passed');

// Directional aiming selects the exact point on the rope, separate from committing it.
const netGeometry = load('logic/RopeNet');
const fishLogic = load('logic/FishEnemy');
const wheel = load('logic/RopeWheel');
const dynamics = load('logic/RopeDynamics');
const openMaze = {
 ...maze, phase: 'play', caveRockRoom: undefined, rockTrial: false, mazeWalls: [],
 mazeMap: Array.from({length: maze.mazeRows}, () => Array(maze.mazeCols).fill(0)),
};
const point = (x, y) => ({x, y});
const strand = (start, end) => ({start, end, startWall: null, endWall: null, path: [start, end], slackFactor: 0, mode: 'tight'});
state.screen = 'mazeRescue'; state.mazeRescue = openMaze;
const first = strand(point(400, 610.125), point(600, 610.125));
const second = strand(point(550.25, 635), point(550.25, 720));
state.rope.ropes = [first, second];
assert.equal(rope.traceWovenRopes(point(465, 570), point(465, 650), 12), null, 'Separate guide ropes stay passable');
function aimAt(p) {
 const dx = p.x - player.x, dy = p.y - player.y;
 return wheel.aimRopeAnchor(Math.atan2(dy, dx), Math.hypot(dx, dy)).target;
}
Object.assign(player, point(461, 640));
const pickedStart = aimAt(point(467.75, 610.125));
assert.equal(pickedStart?.kind, 'strand');
assert(!state.rope.active, 'Preview does not place a strand');
assert(rope.placeRopeAt(pickedStart.anchor));
assert.deepEqual(state.rope.current.start, point(467.75, 610.125));
Object.assign(player, point(530, 652));
const pickedEnd = aimAt(point(550.25, 651.375));
assert.equal(pickedEnd?.kind, 'strand');
assert(rope.placeRopeAt(pickedEnd.anchor));
assert.equal(state.rope.active, false);
assert.deepEqual(state.rope.ropes[2].end, point(550.25, 651.375));
assert.deepEqual(first.path[1], state.rope.ropes[2].start);
let net = netGeometry.getRopeNet(state.rope.ropes);
assert.equal(net.knots.length, 2);
assert.equal(net.woven.size, 3);
assert.equal(rope.traceWovenRopes(point(345, 570), point(345, 670), 12), null, 'Water beyond the actual strands remains open');
// Local density changes the outcome at identical speed. Unconnected guide lines
// and holes outside the strands remain open.
const mesh = (rows, columns) => netGeometry.getRopeNet([
 ...rows.map(y => strand(point(-148, y), point(148, y))),
 ...columns.map(x => strand(point(x, -134), point(x, 134))),
]);
const sparse = mesh([0], [0]);
const medium = mesh([-30, 0, 30], [0]);
const dense = mesh([-48, -24, 0, 24, 48], [-48, -24, 0, 24, 48]);
function forecast(net, speed) {
 return dynamics.netResponseAlong(net, point(4, -92), point(4, 6), 12, 0, speed, 3.6);
}
const light = forecast(sparse, 3.9), elastic = forecast(medium, 3.9), caught = forecast(dense, 3.9);
assert(light.density < elastic.density && elastic.density < caught.density);
assert.deepEqual([light.kind, elastic.kind, caught.kind], ['glide', 'rebound', 'snag']);
assert.equal(forecast(dense, 1.2).kind, 'glide');

function swim(net, x, y, speed, frames, intent) {
 dynamics.resetNetMotion(net);
 const body = {x, y, vx: 0, vy: speed};
 let mostBent = 0, deepest = y, minVy = 0, snagFrames = 0, first = null;
 for (let i = 0; i < frames; i++) {
  dynamics.stepNetMotion(net);
  const view = dynamics.viewNetContact(net, body);
  const effort = intent(i, view);
  if (view?.kind !== 'snag' && view?.kind !== 'rebound') body.vy += effort.y > 0 ? (speed - body.vy) * .09 : 0;
  const from = point(body.x, body.y);
  body.x += body.vx; body.y += body.vy;
  const kind = dynamics.moveThroughNet(net, body, from, 12, 3.6, effort, () => true);
  first ||= kind;
  const knot = net.knots.find(k => k.y === (net === dense ? -48 : -30) && k.x === 0);
  if (knot) {
   const [a, b] = knot.ropes;
   const posed = dynamics.deformNetPoint(net, knot, a);
   assert.deepEqual(posed, dynamics.deformNetPoint(net, knot, b), 'Branches share one displaced knot');
   mostBent = Math.max(mostBent, Math.hypot(posed.x - knot.x, posed.y - knot.y));
  }
  deepest = Math.max(deepest, body.y);
  minVy = Math.min(minVy, body.vy);
  if (dynamics.viewNetContact(net, body)?.kind === 'snag') snagFrames++;
 }
 return {body, first, mostBent, deepest, minVy, snagFrames};
}
const noEffort = () => point(0, 0);
const gentle = swim(dense, 4, -80, 1.2, 185, () => point(0, 1.2));
assert.equal(gentle.first, 'glide');
assert(gentle.body.y > 48, 'Steady gentle thrust passes a dense net');
const bounced = swim(medium, 4, -54, 3.9, 45, noEffort);
assert.equal(bounced.first, 'rebound');
assert(bounced.mostBent > 8 && bounced.minVy < -2 && bounced.body.y < -42, 'Elastic contact stretches and returns the swimmer');
const trapped = swim(dense, 4, -76, 3.9, 90, noEffort);
assert.equal(trapped.first, 'snag');
assert(trapped.snagFrames > 60 && trapped.deepest > -44 && trapped.mostBent > 20, 'A fast swimmer sinks into a visibly deforming pocket');
const escaped = swim(dense, 4, -76, 3.9, 115, (i, view) => view?.kind === 'snag' && i > 20 ? point(0, -8) : noEffort());
assert(escaped.snagFrames < 60 && escaped.body.y < -62, 'Backing out releases the swimmer and springs the mesh back');
for (let i = 0; i < 150; i++) dynamics.stepNetMotion(dense);
const anchorPoint = dense.strands[0].a;
assert.deepEqual(dynamics.deformNetPoint(dense, anchorPoint, dense.strands[0].rope), anchorPoint, 'Fixed anchors stay attached');
assert.deepEqual(dynamics.deformNetPoint(dense, point(0, -48), 0), point(0, -48), 'A released net settles at rest');

// Saved branch endpoints and the original strand retain the same precise junction.
state.mazeRescue = originalMaze;
assert(save.saveMazeProgress());
state.rope.ropes = [];
assert(save.loadMazeProgress());
assert.equal(netGeometry.getRopeNet(state.rope.ropes).knots.length, 2);
assert.equal(state.rope.ropes[2].startOnRope, true);
assert.deepEqual(state.rope.ropes[0].path[1], state.rope.ropes[2].start);
state.mazeRescue = openMaze;
state.rope.ropes = [strand(point(400, 610), point(600, 610)), strand(point(510, 550), point(510, 690))];
net = netGeometry.getRopeNet(state.rope.ropes);
assert.equal(net.knots.length, 1, 'Intersecting ropes create a single reusable junction');
Object.assign(player, point(488, 585));
const intersection = aimAt(point(512, 607));
assert.equal(intersection?.kind, 'knot');
assert(rope.placeRopeAt(intersection.anchor));
assert.deepEqual(state.rope.current.start, point(510, 610));
rope.cancelRopePlacement();
state.rope.ropes = [];

// The same lit position elicits different responses, while rock occludes all three.
Object.assign(player, {x: 315, y: 300, angle: 0});
const makeFish = kind => Object.assign(fishLogic.createFishEnemy(515, 300, undefined, undefined, undefined, kind), {
 angle: Math.PI, vx: 0, vy: 0, roamTimer: 1000,
});
const curious = makeFish('curious'), provoked = makeFish('provoked'), piranha = makeFish('piranha');
const sample = [curious, provoked, piranha];
state.flashlightOn = true; openMaze.mazeMap[2][3] = 2;
for (let i = 0; i < 25; i++) sample.forEach(fish => fishLogic.updateFishEnemy(fish, 1));
assert.equal(curious.state, 'roam'); assert.equal(provoked.state, 'roam'); assert.equal(piranha.fearTimer, 0);
openMaze.mazeMap[2][3] = 0;
for (let i = 0; i < 40; i++) sample.forEach(fish => fishLogic.updateFishEnemy(fish, 1));
assert.equal(curious.state, 'approach'); assert(curious.x < 515);
assert.equal(provoked.state, 'lunge'); assert(provoked.lungeCharge > 0 && provoked.lungeCharge < 1);
assert.equal(piranha.state, 'flee');
state.flashlightOn = false;
const lastLitTarget = curious.lightTargetX;
for (let i = 0; i < 30; i++) fishLogic.updateFishEnemy(provoked, 1);
assert.equal(provoked.lungeCharge, 1, 'Switching off the lamp does not cancel a committed charge');
fishLogic.updateFishEnemy(curious, 1);
assert.equal(curious.lightTargetX, lastLitTarget); assert.equal(curious.state, 'approach');
for (let i = 0; i < CONFIG.fishEnemy.curious.memoryFrames; i++) fishLogic.updateFishEnemy(curious, 1);
assert.equal(curious.state, 'roam');
// A glow on a rock can draw in a fish outside the direct beam.
Object.assign(player, {x: 315, y: 300, angle: 0});
state.flashlightOn = true;
openMaze.mazeMap[2][4] = 2;
const rockWatcher = Object.assign(fishLogic.createFishEnemy(450, 411, undefined, undefined, undefined, 'curious'), {
 angle: -Math.PI / 2, vx: 0, vy: 0, roamTimer: 1000,
});
for (let i = 0; i < 37; i++) fishLogic.updateFishEnemy(rockWatcher, 1);
assert.equal(rockWatcher.lightInterest, 'rock');
assert(Math.abs(rockWatcher.lightTargetX - 450) < 15 && rockWatcher.lightTargetY === 300 && rockWatcher.y < 411);
openMaze.mazeMap[2][4] = 0;
state.flashlightOn = false;

// Fish collect separate strands as they enter a dense weave, regardless of their
// cruising speed. The first outside rope alone cannot capture a fast attacker.
const fishMesh = [
 ...[-30, -15, 0, 15, 30].map(y => strand(point(300, 610 + y), point(600, 610 + y))),
 ...[-40, -20, 0, 20, 40].map(x => strand(point(450 + x, 535), point(450 + x, 675))),
];
function swimFish(kind, speed, ropes = fishMesh) {
 state.rope.ropes = ropes.slice();
 const fish = fishLogic.createFishEnemy(449, 551, undefined, undefined, undefined, kind);
 Object.assign(fish, {angle: Math.PI / 2, vx: 0, vy: speed});
 const trace = [];
 for (let i = 0; i < 190; i++) {
  rope.updateRopeMotion();
  const previous = point(fish.x, fish.y);
  fish.vx = 0; fish.vy = speed; fish.y += speed;
  rope.resolveWovenRopeContact(fish, previous, CONFIG.fishEnemy.size * (kind === 'shoal' ? .18 : kind === 'provoked' ? .64 : kind === 'rammer' ? .48 : .38), point(0, speed), () => true);
  const contact = rope.getRopeContact(fish);
  trace.push({frame: i, y: fish.y, contact});
  if (contact?.kind === 'snag') break;
 }
 return {fish, trace};
}
for (const [kind, speed, minimum] of [['curious', 2.2, 3], ['curious', .8, 3], ['piranha', 14, 3], ['provoked', 14, 4], ['rammer', 9.2, 4], ['shoal', 1.2, 3], ['shoal', 4.2, 3]]) {
 const {fish, trace} = swimFish(kind, speed);
 const first = trace.find(sample => sample.contact);
 const caught = trace.find(sample => sample.contact?.kind === 'snag');
 assert.equal(first.contact.kind, 'glide', kind + ' must first load the outer strands');
 assert(caught && caught.contact.threads >= minimum, kind + ' catches several separate strands');
 assert(caught.frame > first.frame && caught.y > 586, kind + ' enters the mesh before capture');
 assert(trace.every(sample => sample.contact?.kind !== 'rebound'), 'Fish do not use the diver speed threshold');
 const previous = point(fish.x, fish.y);
 fish.y += .3;
 rope.resolveWovenRopeContact(fish, previous, 12, point(0, 1), () => false);
 assert.deepEqual(point(fish.x, fish.y), previous, 'Net forces cannot move a fish into rock');
}
for (const [kind, speed] of [['curious', 2.2], ['piranha', 14], ['provoked', 14], ['rammer', 9.2], ['shoal', 1.2], ['shoal', 4.2]]) {
 const sparseFish = swimFish(kind, speed, [fishMesh[0], fishMesh[7]]);
 assert(sparseFish.trace.every(sample => sample.contact?.kind !== 'snag'), 'A sparse crossing does not capture ' + kind);
}
// Parallel tails protruding from a dense net are not enough to capture a fish
// outside its first row. It must enter and engage a second crosswise strand.
const fringeMesh = [
 ...[0, 12, 24, 36, 48].map(y => strand(point(300, 580 + y), point(600, 580 + y))),
 ...[-20, -10, 0, 10, 20].map(x => strand(point(450 + x, 535), point(450 + x, 675))),
];
const fringe = swimFish('curious', 2.2, fringeMesh);
assert(fringe.trace.some(sample => sample.y < 580 && sample.contact?.threads >= 3 && sample.contact.kind === 'glide'));
assert(fringe.trace.find(sample => sample.contact?.kind === 'snag')?.y > 586);
// Retrying a dive and replacing the rope array clears the transient grip.
const held = swimFish('curious', 2.2);
assert(rope.getRopeContact(held.fish)?.kind === 'snag');
rope.resetRopeMotion();
assert.equal(rope.getRopeContact(held.fish), null);
console.log('Fish and rope net: immediate aim, saved knots, player elasticity, progressive multi-strand fish capture and light responses passed');


// The training opponent has a visible wind-up, transfers momentum once, and
// recovers in range for another lure. No bite/death state or oxygen penalty.
const bump = load('logic/FishBump');
const {createFishBumpState} = load('core/state');
state.rope.ropes = []; rope.resetRopeMotion(); state.fishBite = null;
state.fishBump = createFishBumpState(); state.flashlightOn = true;
Object.assign(player, {x:450,y:300,vx:0,vy:0,angle:0});
const trainingFish = Object.assign(fishLogic.createFishEnemy(600,300,600,300,220,'rammer'), {
 angle:Math.PI, circleAngle:Math.PI/2, vx:0,vy:0,
});
state.fishEnemies = [trainingFish];
const o2BeforeBump = player.o2;
let woundUp = false, struck = false;
for(let frame=0;frame<130;frame++) {
 fishLogic.updateAllFishEnemies(1);
 woundUp ||= trainingFish.state === 'lunge' && trainingFish.lungeCharge < 1;
 if(state.fishBump.timer > 0) { struck = true; break; }
}
assert(woundUp && struck, 'Light can lure the rammer through its warning into a collision');
assert(player.vx < -2 && Math.abs(player.vy) < 1, 'The collision pushes the diver away from the fish');
assert.equal(trainingFish.state, 'retreat');
assert.equal(state.fishBite, null); assert.equal(player.o2, o2BeforeBump);
const impulseVelocity = player.vx;
const nextFish = Object.assign(fishLogic.createFishEnemy(player.x+35,player.y,undefined,undefined,undefined,'rammer'), {angle:Math.PI});
assert(bump.tryFishBump(nextFish,-9.2,0));
assert.equal(player.vx, impulseVelocity, 'A short immunity prevents a crowd from stacking impulses');
state.flashlightOn = false; player.vx = player.vy = 0;
for(let i=0;i<CONFIG.fishEnemy.rammer.recoverFrames+1;i++) fishLogic.updateAllFishEnemies(1);
assert.equal(trainingFish.state,'roam');
assert(Math.hypot(trainingFish.x-player.x,trainingFish.y-player.y) < 210, 'The rammer remains close enough to be lured again');
assert.equal(state.fishBite,null);
// Fast swimming attracts the rammer even with its lamp switched off.
Object.assign(player,{x:450,y:300,vx:0,vy:2.3});
const startledRammer=Object.assign(fishLogic.createFishEnemy(565,300,undefined,undefined,undefined,'rammer'),{angle:Math.PI,vx:0,vy:0});
for(let i=0;i<24;i++)fishLogic.updateFishEnemy(startledRammer,1);
assert.equal(startledRammer.state,'lunge');

// A school reacts to water disturbance as a group, then reforms with distinct
// individual strokes. Quiet approaches allow the player considerably closer.
Object.assign(player,{x:450,y:300,vx:0,vy:0});
const school = fishLogic.createFishSchool(555,300);
assert.equal(school.length,7); assert.equal(new Set(school.map(f=>f.schoolId)).size,1);
state.fishEnemies = school;
fishLogic.updateAllFishEnemies(1);
assert(school.every(f=>f.state==='roam'));
player.vy=2.3; fishLogic.updateAllFishEnemies(1);
assert(school.every(f=>f.state==='flee'));
assert(new Set(school.map(f=>f.angle.toFixed(3))).size>3, 'School members do not use identical movement');
Object.assign(player,{x:100,y:100,vx:0,vy:0});
for(let i=0;i<CONFIG.fishEnemy.shoal.regroupFrames+8;i++)fishLogic.updateAllFishEnemies(1);
assert(school.every(f=>f.state==='roam')); assert.equal(state.fishBite,null);
state.fishEnemies=[]; state.fishBump.timer=12; state.fishBump.cooldown=40;
logic.startCaveRockTrial(); logic.exitCaveRockTrial();
assert.equal(state.fishBump.timer,0);assert.equal(state.fishBump.cooldown,0);
console.log('Rammer and shoal: warning, nonlethal momentum, recovery, movement awareness, group behaviour and adaptive multi-strand capture passed');

// A bump's global camera shake must recover through the real maze update,
// including when the spawned fish is removed before its feedback has ended.
logic.startCaveRockTrial(); state.mazeRescue.phase='play';
state.fishEnemies=[]; state.flashlightOn=false;
Object.assign(player,{vx:0,vy:0});
const bumpSource=Object.assign(fishLogic.createFishEnemy(player.x+35,player.y,undefined,undefined,undefined,'rammer'),{angle:Math.PI});
assert(bump.tryFishBump(bumpSource,-9.2,0));
const impactShake=state.fx.shake;
assert(impactShake>0,'A real collision still has an initial shake');
logic.updateMaze();
assert(state.fx.shake>0 && state.fx.shake<impactShake,'Camera shake decays on the next gameplay frame');
for(let i=0;i<45;i++)logic.updateMaze();
assert.equal(state.fx.shake,0,'Removing a fish cannot leave a permanent camera shake');
state.fishEnemies=[fishLogic.createFishEnemy(player.x+160,player.y,undefined,undefined,undefined,'curious')];
for(let i=0;i<45;i++)logic.updateMaze();
assert.equal(state.fx.shake,0,'A swimming fish alone does not shake the camera');
// Exercise the same lifecycle for short effects from other existing systems.
state.fx.shake=4;
for(let i=0;i<45;i++)logic.updateMaze();
assert.equal(state.fx.shake,0);
logic.exitCaveRockTrial();
console.log('Maze camera shake: initial impact preserved, per-frame decay, zero residual with/without fish and repeated recovery passed');
