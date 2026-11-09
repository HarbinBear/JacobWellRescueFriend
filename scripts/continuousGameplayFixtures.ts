import { CONFIG } from '../src/core/config';
import { state,player } from '../src/core/state';
import { resetDriveInput } from '../src/logic/DriveMode';
import { resetInteractions } from '../src/logic/Interaction';
import { createFishEnemy } from '../src/logic/FishEnemy';
import { world,groundAt,layout,bodyWet } from '../src/world/continuous/Geometry';
import * as runtime from '../src/world/continuous/Runtime';
export function setupTowReview(count=3) {
    const w=world();if(!w)return false;
    resetDriveInput();resetInteractions();state.rope.links=[];
    player.x=w.originX-267;player.y=groundAt(player.x)-layout.footReach;player.vx=player.vy=0;player.angle=player.targetAngle=-Math.PI/2;
    w.landBlend=1;w.grounded=true;w.panel=null;w.headWet=false;w.wet=bodyWet(player.y);
    const created:any[]=[];
    for(let i=0;i<count;i++){
        const f:any=createFishEnemy(player.x+45+i*29,w.surfaceY+42+i*26,player.x+60,w.surfaceY+70,110,i===1?'shoal':'curious');
        f.worldId=w.nextFishId++;f.bound=true;f.stunFrames=180;f.stunUntil=Date.now()+3000;f.state='stunned';f.vx=f.vy=0;created.push(f);
        const id=state.interaction.nextLinkId++;
        state.rope.links.push({id,start:{kind:'player',point:{x:player.x,y:player.y}},end:{kind:'fish',point:{x:f.x,y:f.y},fish:f},path:[{x:player.x,y:player.y},{x:f.x,y:f.y}],length:105+i*23,tension:0,age:0});
    }
    state.fishEnemies=state.fishEnemies.filter((f:any)=>!f.reviewTow);created.forEach(f=>f.reviewTow=true);state.fishEnemies.push(...created);
    runtime.notice('验收布置：三条鱼分别系在腰上。向左拖上岸，再原路入水。',6);return created.map(f=>f.worldId);
}
export function setupRescueReview() {
    const w=world(),m:any=state.mazeRescue;if(!w)return false;
    player.x=w.originX-1360;player.y=groundAt(player.x)-layout.footReach;player.vx=player.vy=0;w.grounded=true;w.landBlend=1;w.headWet=false;w.panel=null;
    let i=0;for(const fish of state.fishEnemies as any[]){if(!fish.reviewTow||!fish.bound)continue;fish.x=player.x+48+i++*24;fish.y=groundAt(fish.x)-24;fish.vx=fish.vy=0;fish.shoreGrounded=true;}
    Object.assign(state.npc,{active:true,x:w.originX-1250,y:groundAt(w.originX-1250)-24,vx:0,vy:0,state:'follow'});
    m.npcRescued=true;m.npcStunned=true;m.rescueRagdoll=null;w.chapterStatus='searching';runtime.notice('验收布置：救援绳仍连接。把对象实际带到帐篷，再移交。',5);return true;
}
