const assert=require('assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
function compile(file,deps){const exports={};const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS}}).outputText;new Function('exports','require',source)(exports,name=>{if(name in deps)return deps[name];throw Error('Missing '+name)});return exports}
const originalNow=Date.now;let now=1000000,prep='loading',audible=false;Date.now=()=>now;
try{
  const state={screen:'mazeRescue',mazeRescue:{phase:'tape_rewind',tapeEntryStartedAt:now,tapeIntroTimer:0,tapePlaybackStarted:false,tapeNowPlayingAt:0,startTime:0,divingInTimer:0},npc:{active:true,x:0,y:0}};
  const player={o2:100,x:0,y:0},sounds=[];
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/logic/MazeLogic.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS}}).outputText;
  const deps={
    '../core/config':{CONFIG:{lifeDetector:{enabled:true,music:{enabled:true}}}},
    '../core/state':{state,player,particles:[],input:{},touches:{}},
    '../story/StoryManager':{StoryManager:class{showText(){throw Error('Entry must not use the generic text toast')}}},
    '../audio/AdaptiveMusic':{getAdaptiveMusicPreparation:()=>({status:prep,progress:prep==='ready'?1:.5}),getAdaptiveMusicClock:()=>({playing:audible})},
    '../audio/AudioManager':{playSFX:key=>sounds.push(key)},
  };
  const exports={};new Function('exports','require',code)(exports,name=>deps[name]||new Proxy({},{get:(_,key)=>()=>{throw Error('World system ran during entry: '+String(key))}}));
  const maze=state.mazeRescue,tick=()=>exports.updateMaze();
  for(let i=0;i<180;i++)tick();assert.equal(maze.phase,'tape_rewind');assert.equal(player.o2,100);assert.equal(maze.startTime,0);
  prep='error';tick();assert.equal(maze.phase,'tape_rewind');
  prep='locked';tick();assert.equal(maze.phase,'tape_rewind');
  prep='ready';tick();assert.equal(maze.phase,'tape_rewind','Cached tape still completes its brief physical rewind');
  now+=701;tick();assert.equal(maze.phase,'diving_in');assert.deepEqual(sounds,['diveSplash']);
  for(let i=0;i<89;i++)tick();assert.equal(maze.phase,'diving_in');tick();assert.equal(maze.phase,'tape_play');
  for(let i=0;i<35;i++)tick();assert.equal(maze.tapePlaybackStarted,false);assert.equal(maze.phase,'tape_play');
  assert.deepEqual(sounds,['diveSplash','uiSecondary']);
  tick();assert.equal(maze.tapePlaybackStarted,true);
  for(let i=0;i<100;i++)tick();assert.equal(maze.phase,'tape_play','The animation finishing cannot unlock a silent / failed audio engine');
  assert.equal(player.o2,100);assert.equal(maze.startTime,0);
  audible=true;tick();assert.equal(maze.phase,'play');assert.equal(maze.startTime,now);assert.equal(maze.tapeNowPlayingAt,now);
  const dance=compile('render/RescueDance',{});
  const v={playing:true,fallback:false,beats:2.3,kick:0,snare:0};
  const pose=dance.sampleRescueDance(v),repeat=dance.sampleRescueDance({...v,beats:10.3});
  for(const key of Object.keys(pose))assert(Math.abs(pose[key]-repeat[key])<1e-9,'Continuous eight-beat pose '+key);
  assert.equal(dance.sampleRescueDance({...v,playing:false}),undefined);
  assert(dance.sampleRescueDance({...v,kick:1}).compress<pose.compress-.1);
  const samples=Array.from({length:64},(_,i)=>dance.sampleRescueDance({...v,beats:i/8}));
  assert(Math.max(...samples.map(p=>p.lu))-Math.min(...samples.map(p=>p.lu))>1.5);
  assert(Math.max(...samples.map(p=>p.leftBend))-Math.min(...samples.map(p=>p.leftBend))>.6);
  const strings=[];const context=new Proxy({globalAlpha:1,fillText:s=>strings.push(s)},{get:(o,k)=>k in o?o[k]:()=>{}});
  const entry=compile('render/TapeEntry',{'./Canvas':{ctx:context,logicW:375,logicH:667},'../core/state':{state},'../audio/AdaptiveMusic':deps['../audio/AdaptiveMusic'],'./PaperCassette':{drawPaperCassette(){}},'./TapeDeckVisual':{cutPanel(){},TAPE:{paper:'#eee'}}});
  now+=300;entry.drawTapeNowPlaying(context,86,360);assert(strings.includes('夜航'));
  strings.length=0;now+=4000;entry.drawTapeNowPlaying(context,86,360);assert.equal(strings.length,0,'Track title must fully disappear');
  state.camera={x:0,y:0,zoom:1,swayX:0,swayY:0};
  const encounter=compile('render/RescueEncounterNote',{'./Canvas':{ctx:context,logicW:375,logicH:667},'../core/state':{state,player},'./TapeDeckVisual':{TAPE:{paper:'#eee'}}});
  maze.npcEncounterNoteAt=now-1000;strings.length=0;encounter.drawRescueEncounterNote();
  assert.equal(strings.length,1,'Whisper appears one short line at a time');
  now+=2800;encounter.drawRescueEncounterNote();assert(strings.some(s=>s.includes('舞池')));
  assert(!strings.some(s=>/手记|自言自语|心声|声音来自/.test(s)),'Speech has no explanation label or source reveal');
  strings.length=0;maze.npcRescueHolding=true;encounter.drawRescueEncounterNote();assert.equal(strings.length,0,'Whisper yields to the binding interaction');
  maze.npcRescueHolding=false;now+=8100;encounter.drawRescueEncounterNote();assert.equal(strings.length,0,'Speech is transient');
  const cfg={CONFIG:{maze:{npcRescueRange:120,npcRescueHoldDuration:2}}};
  const linkDeps={'../core/config':cfg,'../core/state':{state,player}};
  const link=compile('logic/RescueLink',linkDeps);
  const feedback=compile('render/RescueLinkFeedback',{...linkDeps,'./Canvas':{ctx:context,logicW:375,logicH:667},'./TapeDeckVisual':{cutPanel(){},TAPE:{paper:'#eee',ink:'#111'}}});
  state.npc.x=50;state.npc.y=0;maze.npcRescued=false;maze.npcRescueHolding=true;maze.npcRescueHoldStart=now;
  now+=1000;link.updateRescueLink();assert(!maze.npcRescued);assert.equal(feedback.getRescueLinkFeedback().progress,.5);
  maze.npcRescueHolding=false;now+=2000;link.updateRescueLink();assert(!maze.npcRescued,'Release cancels completion');assert.equal(feedback.getRescueLinkFeedback().mode,'ready');
  maze.npcRescueHolding=true;maze.npcRescueHoldStart=now;state.npc.x=130;now+=2000;link.updateRescueLink();assert(!maze.npcRescued,'Drifting away cannot complete a hidden binding');assert.equal(feedback.getRescueLinkFeedback(),null);
  state.npc.x=50;maze.npcRescueHolding=true;maze.npcRescueHoldStart=now;now+=2000;link.updateRescueLink();assert(maze.npcRescued);assert.equal(state.npc.state,'follow');assert.equal(feedback.getRescueLinkFeedback().mode,'secured');
  strings.length=0;feedback.drawRescueLinkFeedback();assert(strings.includes('接住你了。'));
  const securedAt=maze.npcSecuredAt;now+=4100;link.updateRescueLink();assert.equal(maze.npcSecuredAt,securedAt);assert.equal(feedback.getRescueLinkFeedback(),null,'Confirmation disappears; saved follow state cannot replay it');
  const bcd=compile('render/RenderBCD',{'../core/config':{CONFIG:{screenWidth:375,screenHeight:667,bcd:{enabled:true,uiVisible:true}}},'../core/state':{state},'./Canvas':{ctx:context},'./TapeDeckVisual':{cutPanel(){},TAPE:{}},'../logic/BCDSystem':{getBCDRuntime:()=>({ascentWarn:1,descentWarn:1}),getBCDGaugeInfo:()=>({})}});
  context.createLinearGradient=()=>({addColorStop(){}});strings.length=0;bcd.drawBCDWarnOverlay(1);
  assert.equal(strings.length,0,'BCD ascent/descent warnings retain color without instruction text');
  const menu=compile('render/RenderMenu',{'../core/config':{CONFIG:{}},'../core/state':{state:{story2:{nightIndex:0,knownNights:[]}}},'./Canvas':{ctx:context,logicW:375,logicH:667}});
  const buttons=menu.getMenuButtonRects();assert.equal(buttons[0].id,'dive');assert.equal(buttons[0].primary,true);
  assert(buttons.every(b=>b.y>0&&b.y+b.h<645));
  console.log('通过：准备/失败/解锁门禁、倒带→入水→按键→可听音乐→控制、入场无世界更新/氧耗、八拍舞步、曲名退场、角色短句退场、绑绳松手/越界取消与完成反馈退场、BCD文案移除、主界面直达布局。');
}finally{Date.now=originalNow}
