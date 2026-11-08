import { state,player } from '../../src/core/state';
import { CONFIG } from '../../src/core/config';
import { logicW,logicH } from '../../src/render/Canvas';
import { getImage } from '../../src/render/ImageAssets';
import { getLightPolygon } from '../../src/render/RenderLight';
import { world } from './Geometry';
import { terrainSample } from './ContourTerrain';
import type { ContourTerrain } from './ContourTerrain';

let surface:any=null,gl:WebGLRenderingContext|null=null,program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null;
let terrain:ContourTerrain|null=null,textures:WebGLTexture[]=[],beam:WebGLTexture|null=null;
let revision=0,draws=0,inspection=0,failed=false,key='',beamKey='',lostCount=0;
let lastView:{l:number;t:number;w:number;h:number;width:number;height:number}|null=null;
const uniforms:Record<string,WebGLUniformLocation|null>={},beamBytes=new Uint8Array(512*4);
const vertex='attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}';
const fragment=`precision highp float;
varying vec2 uv;
uniform sampler2D geometry;uniform sampler2D material;uniform sampler2D normalDetail;uniform sampler2D beam;
uniform vec4 view;uniform vec4 terrainBounds;uniform vec2 terrainPixels;uniform vec2 light;
uniform float surfaceY;uniform float elapsed;uniform float angle;uniform float fov;uniform float range;uniform float enabled;uniform float pixelWorld;uniform float inspect;
float field(vec2 p){vec2 s=texture2D(geometry,p).rg;return (s.r*65280.+s.g*255.)/65535.*384.-192.;}
float distanceField(vec2 p){return texture2D(geometry,p).b*384.-192.;}
float beamDistance(float t){vec2 b=texture2D(beam,vec2((clamp(t,0.,1.)*511.+.5)/512.,.5)).rg;return (b.r*65280.+b.g*255.)/65535.*range;}
void main(){
 vec2 p=vec2(view.x+uv.x*view.z,view.y+(1.-uv.y)*view.w),local=(p-terrainBounds.xy)/terrainBounds.zw;
 if(local.x<0.||local.y<0.||local.x>1.||local.y>1.){gl_FragColor=vec4(0.);return;}
 vec2 st=(local*(terrainPixels-1.)+.5)/terrainPixels;
 float signedField=field(st),coverage=1.-smoothstep(-pixelWorld*1.1,pixelWorld*1.1,signedField);
 if(coverage<.005){gl_FragColor=vec4(0.);return;}
 vec2 texel=1./terrainPixels;
 float d=distanceField(st),dx=(distanceField(st+vec2(texel.x,0.))-distanceField(st-vec2(texel.x,0.)))/48.;
 float dy=(distanceField(st+vec2(0.,texel.y))-distanceField(st-vec2(0.,texel.y)))/48.;
 float along=p.y+sin(p.x*.0051)*14.+sin(p.x*.0017+p.y*.0008)*22.;
 float bed=sin(along*.056)+.38*sin(along*.113+.4);
 float edgeWidth=44.+15.*sin(p.y*.0083+p.x*.002)+10.*sin(p.x*.0087);
 float bevel=1.-smoothstep(0.,edgeWidth,max(0.,-d));
 vec2 detailUV=vec2(p.x/520.,along/520.);
 vec3 fine=texture2D(normalDetail,detailUV).rgb*2.-1.;
 vec3 n=normalize(vec3(dx*bevel*1.9+fine.x*.33,dy*bevel*1.9+cos(along*.056)*.15+fine.y*.33,1.));
 vec3 base=texture2D(material,detailUV).rgb;
 base*=.95+.05*bed;
 float wet=smoothstep(surfaceY-18.,surfaceY+105.,p.y),depth=max(0.,p.y-surfaceY);
 base=mix(base,base*vec3(.57,.81,.78),wet*.73);
 float shelf=1.-smoothstep(0.,13.,abs(bed+.76));
 float ao=1.-shelf*.12-bevel*.08;
 vec3 sun=normalize(vec3(-.38,-.62,.8));float dayDiffuse=.45+.55*max(0.,dot(n,sun));
 float daylight=exp(-depth/570.);
 vec3 natural=base*dayDiffuse*mix(vec3(1.04,1.02,.84),vec3(.81,1.05,1.03),wet);
 natural*=mix(.99,.56,wet)*max(.07,daylight)*ao;
 vec2 delta=p-light;float distance=length(delta),theta=atan(delta.y,delta.x)-angle;theta=atan(sin(theta),cos(theta));
 float cone=(1.-smoothstep(fov*.29,fov*.50,abs(theta)))*enabled;
 float hit=beamDistance(theta/fov+.5),reach=1.-smoothstep(hit+4.,hit+24.,distance);
 float fall=1.-smoothstep(range*.12,range,distance);
 vec3 incident=normalize(vec3(-delta,94.));float lambert=.22+.78*max(0.,dot(n,incident));
 vec3 lit=base*vec3(1.09,1.08,.91)*lambert*cone*reach*fall;
 float self=1.-smoothstep(12.,90.,distance);
 vec3 color=natural+lit*.94+base*self*.08*wet;
 float spec=pow(max(0.,dot(n,normalize(incident+vec3(0.,0.,1.)))),18.);
 color+=vec3(.21,.32,.26)*spec*.12*wet*cone*reach*fall;
 // Caustics are subtle moving illumination, not a row of diagonal opaque bars.
 float caustic=sin(p.x*.027+p.y*.019+elapsed*.47)*sin(p.x*.018-p.y*.023-elapsed*.31);
 color+=base*max(0.,caustic-.54)*.08*wet*exp(-depth/330.);
 if(inspect>.5&&inspect<1.5)color=vec3(.61,.64,.56)*(.15+dayDiffuse*.67+lambert*cone*reach*fall*.6);
 if(inspect>1.5)color=n*.5+.5;
 gl_FragColor=vec4(clamp(color,0.,1.),coverage);
}`;
function location(name:string){if(!(name in uniforms))uniforms[name]=gl!.getUniformLocation(program!,name);return uniforms[name];}
function init(t:ContourTerrain) {
    if(gl&&!gl.isContextLost()){textures.forEach(t=>gl!.deleteTexture(t));if(beam)gl.deleteTexture(beam);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);}
    textures=[];beam=null;buffer=null;program=null;
    if(!surface){surface=wx.createCanvas();if(typeof surface.addEventListener==='function'){
        surface.addEventListener('webglcontextlost',(e:any)=>{e.preventDefault();gl=null;program=null;terrain=null;textures=[];beam=null;buffer=null;key='';beamKey='';lostCount++;});
        surface.addEventListener('webglcontextrestored',()=>{gl=null;program=null;terrain=null;key='';failed=false;});
    }}
    gl=surface.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false});
    if(!gl||gl.isContextLost())return false;
    const compile=(type:number,source:string)=>{const shader=gl!.createShader(type)!;gl!.shaderSource(shader,source);gl!.compileShader(shader);if(!gl!.getShaderParameter(shader,gl!.COMPILE_STATUS))throw Error(gl!.getShaderInfoLog(shader)||'Terrain shader failed');return shader;};
    const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program!,v);gl.attachShader(program!,f);gl.linkProgram(program!);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(program!,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program!)||'Terrain program failed');
    gl.useProgram(program);for(const k of Object.keys(uniforms))delete uniforms[k];
    buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const p=gl.getAttribLocation(program!,'position');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
    const images=[null,getImage('shore/limestone-color.jpg'),getImage('shore/limestone-normal.png')];textures=[];
    for(let i=0;i<3;i++){const tex=gl.createTexture()!;textures.push(tex);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,i?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,i?gl.REPEAT:gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0);
        if(i)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,images[i]);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,t.cols,t.rows,0,gl.RGBA,gl.UNSIGNED_BYTE,t.texture);
        gl.uniform1i(location(['geometry','material','normalDetail'][i]),i);
    }
    beam=gl.createTexture();gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,beam);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,1,0,gl.RGBA,gl.UNSIGNED_BYTE,beamBytes);gl.uniform1i(location('beam'),3);
    terrain=t;revision++;beamKey='';key='';return true;
}
function uploadBeam() {
    const next=[player.x,player.y,player.angle,CONFIG.lightRange,CONFIG.fov,CONFIG.quality.rayCount].join('/');if(next===beamKey)return;
    const points=getLightPolygon(player.x,player.y,player.angle,CONFIG.lightRange,CONFIG.fov);
    for(let i=0;i<512;i++){const f=i/511*(points.length-1),a=Math.min(points.length-2,Math.floor(f)),v=points[a].dist+(points[a+1].dist-points[a].dist)*(f-a),encoded=Math.round(Math.min(1,v/CONFIG.lightRange)*65535);beamBytes[i*4]=encoded>>>8;beamBytes[i*4+1]=encoded&255;beamBytes[i*4+3]=255;}
    gl!.activeTexture(gl!.TEXTURE3);gl!.bindTexture(gl!.TEXTURE_2D,beam);gl!.texSubImage2D(gl!.TEXTURE_2D,0,0,0,512,1,gl!.RGBA,gl!.UNSIGNED_BYTE,beamBytes);beamKey=next;
}
function fallback(c:CanvasRenderingContext2D,t:ContourTerrain,v:any) {
    c.save();c.beginPath();
    for(const wall of t.walls)for(const loop of [wall.rockPolygon,...wall.rockHoles]){c.moveTo(loop[0].x,loop[0].y);for(const p of loop.slice(1))c.lineTo(p.x,p.y);c.closePath();}
    c.clip();c.fillStyle='#bbb993';c.fillRect(v.l,v.t,v.r-v.l,v.b-v.t);
    const material=getImage('shore/limestone-color.jpg');if(material){for(let y=Math.floor(v.t/520)*520;y<v.b;y+=520)for(let x=Math.floor(v.l/520)*520;x<v.r;x+=520)c.drawImage(material,x,y,520,520);}
    c.restore();
}
export function drawTerrainSurface(c:CanvasRenderingContext2D,zoom:number) {
    const w=world(),t=w?.terrain;if(!w||!t||!getImage('shore/limestone-color.jpg')||!getImage('shore/limestone-normal.png'))return;
    const cam=state.camera,l=cam.x+cam.swayX-logicW/(2*zoom)-2,r=cam.x+cam.swayX+logicW/(2*zoom)+2,top=cam.y+cam.swayY-logicH/(2*zoom)-2,b=cam.y+cam.swayY+logicH/(2*zoom)+2;
    if(!gl||!program||terrain!==t){try{if(!init(t)){fallback(c,t,{l,r,t:top,b});return;}}catch(error){if(!failed)console.warn('[TerrainSurface] fallback',error);failed=true;fallback(c,t,{l,r,t:top,b});return;}}
    const resolution=Math.min(2,Math.max(1.2,(CONFIG.quality.scale||.75)*2));const width=Math.min(1792,Math.ceil((r-l)*zoom*resolution)),height=Math.min(1440,Math.ceil((b-top)*zoom*resolution));
    if(surface.width!==width)surface.width=width;if(surface.height!==height)surface.height=height;
    gl!.viewport(0,0,width,height);gl!.useProgram(program);uploadBeam();
    gl!.uniform4f(location('view'),l,top,r-l,b-top);gl!.uniform4f(location('terrainBounds'),t.x,t.y,(t.cols-1)*t.step,(t.rows-1)*t.step);gl!.uniform2f(location('terrainPixels'),t.cols,t.rows);
    gl!.uniform2f(location('light'),player.x,player.y);gl!.uniform1f(location('surfaceY'),w.surfaceY);gl!.uniform1f(location('elapsed'),w.elapsed);gl!.uniform1f(location('angle'),player.angle);
    gl!.uniform1f(location('fov'),CONFIG.fov*Math.PI/180);gl!.uniform1f(location('range'),CONFIG.lightRange);gl!.uniform1f(location('enabled'),state.flashlightOn!==false&&w.wet>.2?1:0);
    gl!.uniform1f(location('pixelWorld'),(r-l)/width);gl!.uniform1f(location('inspect'),inspection);
    gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);gl!.drawArrays(gl!.TRIANGLES,0,6);gl!.flush();draws++;
    lastView={l,t:top,w:r-l,h:b-top,width,height};
    c.save();c.imageSmoothingEnabled=true;c.drawImage(surface,l,top,r-l,b-top);c.restore();
}
export function terrainSurfaceStats(){const t=world()?.terrain;return{webgl:!!gl&&!gl.isContextLost(),failed,revision,draws,lostCount,textureCount:textures.length+(beam?1:0),fieldBytes:t?.texture.byteLength||0,roots:t?.walls.length||0,edges:t?.edges.length||0,generationMs:t?.generationMs||0};}
export function terrainCoverageDiagnostics(){
    if(!gl||!lastView||!terrain)return {samples:0,failures:['场景未绘制']};
    const view=lastView,bytes=new Uint8Array(view.width*view.height*4);gl.readPixels(0,0,view.width,view.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    const failures:any[]=[];let samples=0;
    for(let iy=0;iy<16;iy++)for(let ix=0;ix<24;ix++){const sx=Math.min(view.width-1,Math.floor((ix+.37)/24*view.width)),sy=Math.min(view.height-1,Math.floor((iy+.61)/16*view.height));
        const x=view.l+(sx+.5)/view.width*view.w,y=view.t+(1-(sy+.5)/view.height)*view.h,field=terrainSample(terrain,x,y),alpha=bytes[(sy*view.width+sx)*4+3];
        if(Math.abs(field)<view.w/view.width*1.6)continue;samples++;if(field<0?alpha<240:alpha>15)if(failures.length<8)failures.push({x,y,field,alpha});
    }return {samples,failures};
}
export function inspectTerrain(mode=0){inspection=mode;}
export function loseTerrainContext(){const ext=gl?.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();setTimeout(()=>ext.restoreContext(),100);return true;}
export function releaseTerrainSurface(){
    if(gl&&!gl.isContextLost()){textures.forEach(t=>gl!.deleteTexture(t));if(beam)gl.deleteTexture(beam);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);}
    gl=null;program=null;terrain=null;textures=[];beam=null;buffer=null;key='';beamKey='';if(surface){surface.width=surface.height=1;surface=null;}failed=false;
}
