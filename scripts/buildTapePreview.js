// Review page bundles the actual score, clock, cassette, diver and HUD renderers.
// Only game state/services are fixtures; audio synthesis and rendering are live.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { browserBundle } = require('./adaptiveAudioModules');
const modules = {
    AdaptiveMusicVisuals: 'audio/AdaptiveMusicVisuals', TapeDeckVisual: 'render/TapeDeckVisual',
    TapeResonance: 'render/TapeResonance',
    RenderDiver: 'render/RenderDiver', HUDTopLeft: 'render/HUDTopLeft', RenderAudioToggle: 'render/RenderAudioToggle',
    character: 'core/config/character', gameplay: 'core/config/gameplay',
};
const factories = Object.entries(modules).map(([id, file]) => `${JSON.stringify(id)}:function(exports,require){${ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src', file + '.ts'), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }
).outputText}}`).join(',');
const bundle = browserBundle() + `
(function(){const factories={${factories}},cache={};
const scene=document.getElementById('scene'),context=scene.getContext('2d');
const state={screen:'mazeRescue',audio:{muted:false,iconProgress:1,animPhase:0},mazeRescue:{phase:'play',mazeTileSize:120,maxDepthAllowed:60,npcRescued:false}};
const player={o2:84,o2Max:100,y:3360};let visual;
const noop=()=>{},deco={nitrogenLoad:.12,boostActive:false,inHoldWindow:false};
function load(name){const id=name.split('/').pop();
 if(id==='AdaptiveScore')return SignalBelow;
 if(id==='config')return {CONFIG:{...load('character').characterConfig,...load('gameplay').gameplayConfig}};
 if(id==='state')return {state,player};
 if(id==='Canvas')return {ctx:context,logicW:375,logicH:660};
 if(id==='RescueTape')return {getRescueTapeVisual:()=>visual};
 if(id==='RenderRelic')return {drawRelicIconAt:noop};
 if(id==='AudioManager')return {playSFX:noop,toggleMuted:()=>{state.audio.muted=!state.audio.muted;state.audio.iconProgress=state.audio.muted?0:1}};
 if(id==='GMConfig')return {BTN_RADIUS:20};
 if(id==='GMPanel')return {toggleGMOpen:noop,isGMOpen:()=>false};
 if(id==='Loadout')return {getActiveAirTanks:()=>[]};
 if(id==='BreathSystem')return {getBreathPhaseAngle:()=>0,getBreathPhase:()=> 'inhale',getBreathPressure:()=>0,getLungVolume:()=>.5};
 if(id==='DecompressionSystem')return {getDecoRuntime:()=>deco,getDecoLevel:()=>0,getCurrentStopInfo:()=>null,isDecompressionRequired:()=>false,isDecoLockActive:()=>false,setDecoBoost:noop,getCurrentDepthMeters:()=>28};
 if(!factories[id])throw Error('Missing preview module: '+name);
 if(!cache[id]){cache[id]={};factories[id](cache[id],load)}return cache[id];}
window.DeepTape={...load('AdaptiveMusicVisuals'),...load('TapeDeckVisual'),...load('TapeResonance'),...load('RenderDiver'),...load('HUDTopLeft'),
 setVisual:v=>{visual=v},state,player};})();`;
const output = path.join(__dirname, '../design/deeptape');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'index.html'), fs.readFileSync(path.join(__dirname, 'tapePreview.html'), 'utf8').replace('/* TAPE_BUNDLE */', () => bundle));
// Keep the existing audio review entry current without re-exporting unchanged WAVs.
fs.writeFileSync(path.join(__dirname, '../design/adaptive-audio/listen.html'), fs.readFileSync(path.join(__dirname, 'adaptiveAudioPreview.html'), 'utf8').replace('/* AUDIO_BUNDLE */', () => browserBundle()));
console.log('深流随身听预览：design/deeptape/index.html（游戏原绘制代码 + 实时原音乐）');
