const assert=require('assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'../src'),cache=new Map(),storage=new Map();
const noop=()=>0,idle=new Proxy({}, {get:()=>noop});
const overrides={
 'core/SaveStorage':{saveJSON:(k,d)=>{storage.set(k,JSON.parse(JSON.stringify(d)));return true},loadJSON:k=>storage.has(k)?JSON.parse(JSON.stringify(storage.get(k))):null,removeKey:k=>storage.delete(k)},
 'audio/AudioManager':idle,'audio/AdaptiveMusic':{warmUpAdaptiveMusic:noop,resetAdaptiveMusic:noop,getAdaptiveMusicPreparation:()=>({status:'ready'}),getAdaptiveMusicClock:()=>({playing:true})},
 'story/HomeScene':idle,'logic/Particle':idle,'logic/BreathSystem':new Proxy({computeBuoyancyOffset:()=>0},{get:(o,k)=>o[k]||noop}),
 'logic/ManualDrive':idle,'logic/CollisionImpact':idle,'logic/Marker':idle,'logic/Relic':{buildRelicsForMaze:()=>[],resetRelicDiscoveryForDive:noop,updateRelicDiscovery:noop},
 'logic/LifeDetector':idle,'logic/NPCPerception':{isRescueTargetVisible:()=>false},'logic/DecompressionSystem':new Proxy({getPenaltyO2MaxMul:()=>1},{get:(o,k)=>o[k]||noop}),'logic/BCDSystem':idle,
 'logic/FishEnemy':{generateFishDens:()=>[],updateAllFishEnemies:noop},
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
logic.startCaveRockTrial();assert.notEqual(state.markers,originalMarkers);assert.equal(state.markers.length,0);state.markers.push({x:999,y:999});assert(state.mazeRescue.rockTrial);assert.equal(state.mazeRescue.phase,'tape_rewind');assert.notEqual(state.extraction,originalEx);
state.extraction.coins=9999;state.extraction.consumables.airTankS=0;state.story2.nightIndex=99;
assert.equal(save.saveMazeProgress(),false);assert.equal(exSave.saveExtractionProgress(),false);assert.equal(story.saveStoryProgress(),false);
save.clearMazeSave();exSave.clearExtractionSave();story.clearStoryProgress();assert.equal(JSON.stringify([...storage]),saved,'Trial must not mutate or delete persisted data');
logic.exitCaveRockTrial();assert.equal(state.mazeRescue,originalMaze);assert.equal(state.extraction,originalEx);assert.equal(state.story2,originalStory);assert.equal(state.markers,originalMarkers);assert.deepEqual(state.markers,[{x:111,y:222,type:'arrow'}]);assert.equal(originalEx.coins,432);assert.equal(originalEx.consumables.airTankS,7);assert.equal(CONFIG.lightRange,originalLight);assert.equal(state.screen,'menu');
logic.startCaveRockTrial();logic.replayMazeLogic();assert(state.mazeRescue.rockTrial);assert.equal(JSON.stringify([...storage]),saved);logic.acceptNewCase();assert.equal(state.screen,'menu');assert.equal(JSON.stringify([...storage]),saved);
console.log('Cave rock trial: real routes, collision/light/anchor/rope geometry, ordinary map determinism and save/equipment isolation passed');
