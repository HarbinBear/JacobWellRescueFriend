import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

const ORIGIN={x:5520,y:5760};
let scene:any=null,style=0,inspection=false,overlay=false,aa=true,fallback=false;
let images:HTMLImageElement[]=[],surface:HTMLCanvasElement|null=null;
let gl:WebGLRenderingContext|null=null,program:WebGLProgram|null=null;
let textures:WebGLTexture[]=[],beamTexture:WebGLTexture|null=null,lossExtension:any=null;
let polyKey='',polyCache:any[]=[],polyMs=0,surfaceMs=0,textureWidth=640,textureHeight=1120;
let sampling='balanced',gpuMs:number|null=null;
const labels=['断冠双岔洞 · D 岩体重做'];
let backImage:HTMLImageElement|null=null,roomWidth=720,roomHeight=1120,surfaceOcclusion=true;
export function isReviewActive(){return !!scene && !!(window as any).__CAVE_REVIEW;}
function inside(p:number[][],x:number,y:number){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
function segmentDistance(x:number,y:number,a:number[],b:number[]){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);}
export function reviewCollision(x:number,y:number,radius=CONFIG.maze.playerRadius){if(!scene)return false;x-=ORIGIN.x;y-=ORIGIN.y;if(x<radius||y<radius||x>roomWidth-radius||y>roomHeight-radius)return true;for(const p of scene.shapes){if(inside(p,x,y))return true;if(radius>0)for(let i=0;i<p.length;i++)if(segmentDistance(x,y,p[i],p[(i+1)%p.length])<radius)return true;}return false;}
export function reviewRaycast(x:number,y:number,dx:number,dy:number,range:number){if(!scene)return range;x-=ORIGIN.x;y-=ORIGIN.y;let best=range;for(const p of scene.shapes)for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],ex=b[0]-a[0],ey=b[1]-a[1],det=dx*ey-dy*ex;if(Math.abs(det)<1e-8)continue;const ax=a[0]-x,ay=a[1]-y,t=(ax*ey-ay*ex)/det,u=(ax*dy-ay*dx)/det;if(t>1e-4&&t<best&&u>=0&&u<=1)best=t;}return best;}
export function reviewLightPolygon(x:number,y:number,angle:number,range:number,fov:number){
 const count=aa?(sampling==='economy'?128:256):60,key=[scene?.id,x,y,angle,range,fov,count].join('/');if(key===polyKey)return polyCache;
 const start=performance.now(),p:any[]=[];
 for(let i=0;i<=count;i++){const a=angle+(i/count-.5)*fov*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),d=reviewRaycast(x,y,dx,dy,range);p.push({x:x+dx*d,y:y+dy*d,dist:d});}
 polyKey=key;polyCache=p;polyMs=performance.now()-start;return p;
}
const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment=`precision highp float;
varying vec2 uv;uniform sampler2D albedo;uniform sampler2D normals;uniform sampler2D detail;uniform sampler2D beam;
uniform vec4 viewport;uniform vec2 origin;uniform vec2 light;uniform float angle;uniform float fov;uniform float range;
uniform float on;uniform float style;uniform float inspection;uniform float aa;uniform vec3 theme;uniform vec2 roomSize;uniform float surfaceOcclusion;uniform vec2 selfGlow;uniform vec2 perception;
float beamDistance(float t){
 float x=clamp(t,0.,1.)*511.;float i=floor(x);vec2 a=texture2D(beam,vec2((i+.5)/512.,.5)).rg;
 float da=(a.r*256.+a.g)/257.;if(aa<.5)return da*range;
 vec2 b=texture2D(beam,vec2((min(511.,i+1.)+.5)/512.,.5)).rg;
 return mix(da,(b.r*256.+b.g)/257.,fract(x))*range;
}
void main(){
 vec2 world=vec2(viewport.x+uv.x*viewport.z,viewport.y+(1.-uv.y)*viewport.w),st=(world-origin)/roomSize;
 if(st.x<0.||st.x>1.||st.y<0.||st.y>1.){gl_FragColor=vec4(0.);return;}
 vec4 base=texture2D(albedo,st),d=texture2D(detail,st);if(base.a<.001){gl_FragColor=vec4(0.);return;}
 vec3 n=normalize(texture2D(normals,st).rgb*2.-1.);
 vec2 delta=world-light;float theta=atan(delta.y,delta.x)-angle;theta=atan(sin(theta),cos(theta));
 float cone=(1.-smoothstep(fov*.29,fov*.5,abs(theta)))*on;
 float height=d.b*100.;
 vec3 l=normalize(vec3(-delta,95.-height));
 float lambert=max(0.,dot(n,l));
 float bands=.24+.37*smoothstep(.25,.31,lambert)+.39*smoothstep(.63,.70,lambert);
 float diffuse=mix(.19+.81*lambert,bands,.25);
 vec3 stone=base.rgb,color=stone*mix(vec3(.38,.49,.61),vec3(1.06,1.01,.84),diffuse)*1.30;
 float ao=d.r;
 vec2 towardLight=normalize(-delta+vec2(.0001));
 float localVisibility=1.;
 if(surfaceOcclusion>.5){
  for(int j=0;j<3;j++){
   float stepWorld=j==0?8.:j==1?19.:38.;
   vec2 q=st+towardLight*stepWorld/roomSize;
   vec4 other=texture2D(detail,q);float solid=texture2D(albedo,q).a;
   float predicted=height+(95.-height)*stepWorld/max(1.,length(delta));
   float obstruction=smoothstep(predicted+2.,predicted+9.,other.b*100.)*solid;
   localVisibility=min(localVisibility,1.-obstruction*.45);
  }
 }
 color*=mix(.37,1.,ao)*localVisibility;
 float spec=pow(max(0.,dot(n,normalize(l+vec3(0,0,1)))),22.);
 color+=vec3(.26,.33,.33)*spec*.09*ao*localVisibility;
 float hit=beamDistance(theta/fov+.5);
 float reach=1.-smoothstep(hit+20.,hit+190.,length(delta));
 float incident=cone*reach*(1.-smoothstep(range*.25,range,length(delta)));
 float dist=length(delta);
 float proximity=selfGlow.y*(1.-smoothstep(0.,selfGlow.x,dist))+perception.y*(1.-smoothstep(0.,perception.x,dist));
 color=stone*.012+color*(.32*proximity+.95*incident);
 if(inspection>.5)color=(n*.5+.5)*(.04+.80*incident);
 // Keep fractional silhouette coverage. No alpha>.9 hard threshold.
 float coverage=aa>.5?base.a:step(.50,base.a);
 gl_FragColor=vec4(clamp(color,0.,1.),coverage);
}`;
let buffer:WebGLBuffer|null=null,timerExtension:any=null,queries:any[]=[];
function setup(){
 if(!surface){surface=document.createElement('canvas');surface.addEventListener('webglcontextlost',e=>{e.preventDefault();gl=null;program=null;queries=[];});surface.addEventListener('webglcontextrestored',()=>{gl=null;program=null;initGL();});}
 if(!gl)initGL();
}
function initGL(){
 gl=surface!.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true}) as WebGLRenderingContext;
 if(!gl||gl.isContextLost()){gl=null;return;}
 const compile=(t:number,s:string)=>{const shader=gl!.createShader(t)!;gl!.shaderSource(shader,s);gl!.compileShader(shader);if(!gl!.getShaderParameter(shader,gl!.COMPILE_STATUS))throw Error(gl!.getShaderInfoLog(shader)!);return shader;};
 const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram()!;gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)!);
 gl.useProgram(program);buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const a=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);textures=[];uploadImages();
 beamTexture=gl.createTexture()!;gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,beamTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,'beam'),3);
 timerExtension=gl.getExtension('EXT_disjoint_timer_query');lossExtension=gl.getExtension('WEBGL_lose_context');
}
function uploadImages(){if(!gl||!program||images.length!==3)return;gl.useProgram(program);textures.forEach(t=>gl!.deleteTexture(t));textures=[];
 ['albedo','normals','detail'].forEach((name,i)=>{const tex=gl!.createTexture()!;textures.push(tex);gl!.activeTexture(gl!.TEXTURE0+i);gl!.bindTexture(gl!.TEXTURE_2D,tex);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0);gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,gl!.RGBA,gl!.UNSIGNED_BYTE,images[i]);gl!.uniform1i(gl!.getUniformLocation(program!,name),i);});
}
const beamBytes=new Uint8Array(512*4);
let beamKey='';
function uploadBeam(){if(!gl)return;const p=reviewLightPolygon(player.x,player.y,player.angle,CONFIG.lightRange,CONFIG.fov);if(beamKey===polyKey)return;for(let i=0;i<512;i++){const f=i/511*(p.length-1),k=Math.min(p.length-2,Math.floor(f)),t=f-k;const d=aa?p[k].dist*(1-t)+p[k+1].dist*t:p[Math.min(p.length-1,Math.round(f))].dist;const v=Math.round(d/CONFIG.lightRange*65535);beamBytes[i*4]=v>>8;beamBytes[i*4+1]=v&255;beamBytes[i*4+3]=255;}gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,beamTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,1,0,gl.RGBA,gl.UNSIGNED_BYTE,beamBytes);beamKey=polyKey;}
function background(ctx:CanvasRenderingContext2D){if(!backImage)return;const cam=state.camera;const dx=(cam.x-ORIGIN.x-scene.player[0])*.075,dy=(cam.y-ORIGIN.y-scene.player[1])*.075;ctx.save();ctx.globalAlpha=.40;ctx.drawImage(backImage,ORIGIN.x+dx,ORIGIN.y+dy,roomWidth,roomHeight);ctx.restore();}
function timerStart(){if(!gl||!timerExtension)return null;const ext=timerExtension;while(queries.length&&ext.getQueryObjectEXT(queries[0],ext.QUERY_RESULT_AVAILABLE_EXT)){const q=queries.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpuMs=ext.getQueryObjectEXT(q,ext.QUERY_RESULT_EXT)/1e6;ext.deleteQueryEXT(q);}if(queries.length>4)return null;const q=ext.createQueryEXT();ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q);return q;}
function timerEnd(q:any){if(q&&timerExtension){timerExtension.endQueryEXT(timerExtension.TIME_ELAPSED_EXT);queries.push(q);}}
export function drawReviewCave(ctx:CanvasRenderingContext2D,l:number,r:number,t:number,b:number,zoom:number){
 if(!isReviewActive()||images.length!==3)return;const start=performance.now();setup();background(ctx);
 if(gl&&program&&!gl.isContextLost()&&!fallback){
   const resolution=aa?(sampling==='economy'?1:sampling==='sharp'?2:1.5):.6;
   const w=Math.ceil((r-l)*zoom*resolution),h=Math.ceil((b-t)*zoom*resolution);if(surface!.width!==w)surface!.width=w;if(surface!.height!==h)surface!.height=h;
   gl.viewport(0,0,w,h);gl.useProgram(program);uploadBeam();const u=(s:string)=>gl!.getUniformLocation(program!,s);
   gl.uniform4f(u('viewport'),l,t,r-l,b-t);gl.uniform2f(u('origin'),ORIGIN.x,ORIGIN.y);gl.uniform2f(u('light'),player.x,player.y);gl.uniform1f(u('angle'),player.angle);gl.uniform1f(u('fov'),CONFIG.fov*Math.PI/180);gl.uniform1f(u('range'),CONFIG.lightRange);gl.uniform1f(u('on'),state.flashlightOn===false?0:1);gl.uniform1f(u('style'),style);gl.uniform1f(u('inspection'),inspection?1:0);gl.uniform1f(u('aa'),aa?1:0);gl.uniform3fv(u('theme'),scene.theme);gl.uniform2f(u('roomSize'),roomWidth,roomHeight);gl.uniform1f(u('surfaceOcclusion'),surfaceOcclusion?1:0);gl.uniform2f(u('selfGlow'),CONFIG.selfGlowRadius,CONFIG.selfGlowIntensity);gl.uniform2f(u('perception'),CONFIG.ambientPerceptionRadius,CONFIG.ambientPerceptionIntensity);
   gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);const query=timerStart();gl.drawArrays(gl.TRIANGLES,0,6);timerEnd(query);
   ctx.save();ctx.imageSmoothingEnabled=true;ctx.drawImage(surface!,l,t,r-l,b-t);ctx.restore();
 }else{
   ctx.save();ctx.globalAlpha=.035;ctx.drawImage(images[0],ORIGIN.x,ORIGIN.y,roomWidth,roomHeight);ctx.restore();
   if(state.flashlightOn!==false){ctx.save();ctx.beginPath();for(const p of scene.shapes){p.forEach((v:number[],i:number)=>i?ctx.lineTo(ORIGIN.x+v[0],ORIGIN.y+v[1]):ctx.moveTo(ORIGIN.x+v[0],ORIGIN.y+v[1]));ctx.closePath();}ctx.clip();const hits=reviewLightPolygon(player.x,player.y,player.angle,CONFIG.lightRange,CONFIG.fov);for(let i=0;i<hits.length;i+=24){const p=hits[i];if(p.dist>=CONFIG.lightRange)continue;const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,80);g.addColorStop(0,'rgba(145,145,125,.26)');g.addColorStop(1,'rgba(145,145,125,0)');ctx.fillStyle=g;ctx.fillRect(p.x-80,p.y-80,160,160);}ctx.restore();}
 }
 if(overlay){ctx.save();ctx.strokeStyle='#ffbf70';ctx.lineWidth=1/zoom;for(const p of scene.shapes){ctx.beginPath();p.forEach((v:number[],i:number)=>i?ctx.lineTo(ORIGIN.x+v[0],ORIGIN.y+v[1]):ctx.moveTo(ORIGIN.x+v[0],ORIGIN.y+v[1]));ctx.closePath();ctx.stroke();}ctx.strokeStyle='#8de8b1';ctx.beginPath();ctx.arc(player.x,player.y,CONFIG.maze.playerRadius,0,Math.PI*2);ctx.stroke();ctx.restore();}
 surfaceMs=performance.now()-start;
}
let selectToken=0;
export async function selectReviewScene(data:any,index:number,selectedStyle:number){const token=++selectToken,next=data.scenes[index];const prefix=next.assetPrefix||'';const loaded=await Promise.all(['albedo','normal','detail'].map(s=>new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Missing asset '+next.id+' '+s));im.src=prefix+next.id+'-'+s+'.png';})));if(token!==selectToken)return null;
 scene=next;roomWidth=next.width;roomHeight=next.height;style=next.variant??selectedStyle;images=loaded;backImage=await new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=next.id+'-back.png';});textureWidth=images[0].width;textureHeight=images[0].height;polyKey='';beamKey='';setup();uploadImages();
 player.x=ORIGIN.x+scene.player[0];player.y=ORIGIN.y+scene.player[1];player.vx=player.vy=0;reviewAim(ORIGIN.x+scene.aim[0],ORIGIN.y+scene.aim[1]);const c=state.camera;c.x=c.targetX=player.x;c.y=c.targetY=player.y;c.vx=c.vy=c.swayX=c.swayY=0;c.zoom=1;
 return{name:scene.name,variant:labels[style],sceneIndex:index,points:scene.shapes.reduce((n:number,p:any[])=>n+p.length,0)};
}
export function reviewAim(x:number,y:number){player.angle=player.targetAngle=Math.atan2(y-player.y,x-player.x);}
export function setReviewStyle(v:number){style=v;return labels[v];}
export function setReviewInspection(v:boolean){inspection=v;}
export function setReviewCollision(v:boolean){overlay=v;}
export function setReviewFallback(v:boolean){fallback=v;}
export function setReviewAA(v:boolean){aa=v;polyKey='';beamKey='';}
export function setReviewSampling(v:string){sampling=v;polyKey='';beamKey='';}
export function reviewStats(){return{scene:scene?.id,style:labels[style],aa,sampling,surfaceCPUms:surfaceMs,rayCPUms:polyMs,gpuSurfaceMs:gpuMs,rayCount:polyCache.length,mode:fallback||!gl||gl.isContextLost()?'albedo-fallback':'webgl1-normal',textureBytes:textureWidth*textureHeight*4*3+2048,surfacePixels:surface?surface.width*surface.height:0,glError:gl&&!gl.isContextLost()?gl.getError():null,origin:ORIGIN,scope:'isolated same-game art study; paused simulation; not phone acceptance'};}
export function reviewContextLoss(restore=false){if(!lossExtension)return false;restore?lossExtension.restoreContext():lossExtension.loseContext();beamKey='';return true;}
export function geometryCheck(){if(!scene)return null;let count=0,mismatches=0;for(let y=20;y<roomHeight-20;y+=27)for(let x=20;x<roomWidth-20;x+=23){count++;if(reviewCollision(x+ORIGIN.x,y+ORIGIN.y,0)!==scene.shapes.some((p:number[][])=>inside(p,x,y)))mismatches++;}let rayError=0;const hits=reviewLightPolygon(player.x,player.y,player.angle,CONFIG.lightRange,CONFIG.fov);for(const hit of hits){if(hit.dist>=CONFIG.lightRange)continue;const x=hit.x-ORIGIN.x,y=hit.y-ORIGIN.y;let d=Infinity;for(const p of scene.shapes)for(let i=0;i<p.length;i++)d=Math.min(d,segmentDistance(x,y,p[i],p[(i+1)%p.length]));rayError=Math.max(rayError,d);}return{samples:count,mismatches,playerBlocked:reviewCollision(player.x,player.y),rayError};}

export function setSurfaceOcclusion(value:boolean){surfaceOcclusion=value;}
export function reviewMove(dx:number,dy:number){const length=Math.hypot(dx,dy);const count=Math.max(1,Math.ceil(length/2));let moved=false;for(let i=0;i<count;i++){const x=player.x+dx/count,y=player.y+dy/count;if(!reviewCollision(x,y)){player.x=x;player.y=y;moved=true;}}const c=state.camera;c.x=c.targetX=player.x;c.y=c.targetY=player.y;return{moved,blocked:reviewCollision(player.x,player.y),x:player.x,y:player.y};}
export function reviewSite(index:number){const site=scene.sites[index];player.x=ORIGIN.x+site.player[0];player.y=ORIGIN.y+site.player[1];const c=state.camera;c.x=c.targetX=player.x;c.y=c.targetY=player.y;reviewAim(ORIGIN.x+site.aim[0],ORIGIN.y+site.aim[1]);return{name:site.name,blocked:reviewCollision(player.x,player.y)};}
