// 当前洞室中的实体鱼回归。使用真实AI/绳网；桌面浏览器不代替手机性能验收。
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const OUT = path.resolve(__dirname, '../node_modules/.cache/karst-review/fish-volume');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html?fish-volume';
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const b = await openReviewBrowser(URL, 1280, 900), report = { scope: '实际手机版渲染，桌面Chrome；不代表微信真机性能' };
    const ev = s => b.evaluate(s);
    async function shot(name) {
        const data = await ev('document.getElementById("game").toDataURL("image/png")');
        fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    }
    async function settle() {
        await wait(100);
        for (let i = 0; i < 160 && await ev('DeepTapeGame.cave.volume.karstVolumeStats().pending'); i++) await wait(100);
    }
    async function fishLuma() {
        return ev(`(()=>{const g=DeepTapeGame,f=g.state.fishEnemies[0],c=g.state.camera,can=document.getElementById('game'),cfg=g.cave.config;
            const sx=(cfg.screenWidth/2+(f.x-c.x-c.swayX)*c.zoom)*can.width/cfg.screenWidth;
            const sy=(cfg.screenHeight/2+(f.y-c.y-c.swayY)*c.zoom)*can.height/cfg.screenHeight;
            const p=can.getContext('2d').getImageData(Math.round(sx)-3,Math.round(sy)-3,6,6).data;
            let sum=0;for(let i=0;i<p.length;i+=4)sum+=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];return sum/36;})()`);
    }
    try {
        report.free = await ev(`(()=>{const g=DeepTapeGame;g.cave.config.quality.auto=false;g.cave.config.quality.scale=.75;const result=g.review.inspectVolumeFish('free');g.world.geometry.world().hidden=true;g.input.move=0;return result;})()`);
        assert.equal(report.free.fishCount, 2); await settle(); await shot('01-free');
        report.volume = await ev('DeepTapeGame.cave.volume.karstVolumeStats()'); assert.equal(report.volume.fishCount, 2); assert.equal(report.volume.fishFailure, '');
        report.lightOn = await fishLuma();
        await ev('DeepTapeGame.state.flashlightOn=false'); await wait(150); report.lightOff = await fishLuma(); await shot('02-lights-off');
        assert(report.lightOn > report.lightOff + 3, '鱼体必须随实际手电受光，不能是固定亮度贴图');
        await ev('DeepTapeGame.state.flashlightOn=true;DeepTapeGame.cave.config.karst.volumeFish=false'); await wait(150);
        assert.equal(await ev('DeepTapeGame.cave.volume.karstVolumeStats().fishCount'), 0); await shot('03-original-2d');
        await ev('DeepTapeGame.cave.config.karst.volumeFish=true'); await wait(100);
        // 镜头内有两种实体鱼时继续真实AI；不是演示脚本给轨迹。
        const before = await ev('DeepTapeGame.state.fishEnemies.map(f=>({x:f.x,y:f.y,animTime:f.animTime}))');
        await ev('DeepTapeGame.world.geometry.world().hidden=false'); await wait(1200); await ev('DeepTapeGame.world.geometry.world().hidden=true');
        report.swim = await ev('DeepTapeGame.state.fishEnemies.map(f=>({x:f.x,y:f.y,animTime:f.animTime,blocked:DeepTapeGame.world.geometry.circleCollision(f.x,f.y,6)}))');
        assert(report.swim.some((f,i)=>Math.hypot(f.x-before[i].x,f.y-before[i].y)>10)); assert(report.swim.every(f=>!f.blocked));
        await shot('04-swim');
        report.snag = await ev(`(()=>{const g=DeepTapeGame,r=g.review.inspectVolumeFish('snag');return r;})()`);
        assert.equal(report.snag.caught, true); await wait(900); await ev('DeepTapeGame.world.geometry.world().hidden=true');
        report.contact = await ev(`(()=>{const g=DeepTapeGame,f=g.state.fishEnemies[0],c=g.interactions.rope.getRopeContact(f);return{kind:c?.kind,bound:f.bound,state:f.state,volume:g.cave.volume.isVolumeFishDrawn(f)};})()`);
        assert.equal(report.contact.kind, 'snag'); assert(report.contact.volume); await shot('05-real-snag');
        // 状态投影另外覆盖：实际敲晕/绑缚提交时机由fish:check验收，这里只验证显示没有重复或消失。
        await ev('Object.assign(DeepTapeGame.state.fishEnemies[0],{stunFrames:240,bound:true})'); await wait(120); await shot('06-bound-stunned');
        assert(await ev('DeepTapeGame.cave.volume.isVolumeFishDrawn(DeepTapeGame.state.fishEnemies[0])'));
        // 仅渲染验收：把鱼临时放进实心剖面，体积前半不能越过切面显形。关闭阴影排除投影变化。
        report.wallClip = await ev(`(()=>{const g=DeepTapeGame,t=g.cave.terrain.getKarstTerrain(g.state.mazeRescue),f=g.state.fishEnemies[0];
            window.__fishRestore={f,pose:{...f},others:g.state.fishEnemies.slice(),quality:g.cave.config.quality.scale};
            const wall=g.cave.terrain.karstNearest(t,g.player.x,g.player.y,800);let p=null;
            for(const d of [30,50,70]){const q={x:wall.x-wall.nx*d,y:wall.y-wall.ny*d};if(g.cave.terrain.sampleKarst(t,q.x,q.y)<-15){p=q;break;}}
            if(!p)return false;
            Object.assign(f,p,{bound:false,stunFrames:0,alertTimer:0});g.interactions.rope.releaseRopeContact(f);g.state.fishEnemies=[f];g.cave.config.quality.scale=.3;
            return {field:g.cave.terrain.sampleKarst(t,p.x,p.y)};})()`);
        assert(report.wallClip); await wait(120); const inRock = await fishLuma();
        await ev('DeepTapeGame.state.fishEnemies[0].dead=true'); await wait(120); const withoutFish = await fishLuma();
        report.wallClip.lumaDifference = Math.abs(inRock-withoutFish); assert(report.wallClip.lumaDifference<.3, '实心切面不能露出鱼体');
        await ev('(()=>{const r=window.__fishRestore;Object.assign(r.f,r.pose);DeepTapeGame.state.fishEnemies=r.others;DeepTapeGame.cave.config.quality.scale=r.quality;})()');
        // 独立鱼shader失败只能退回二维鱼，不能关闭已经成功的三维洞室。
        report.shaderFallback = await ev(`(()=>{const g=DeepTapeGame,p=WebGLRenderingContext.prototype,original=p.getShaderParameter;
            p.getShaderParameter=function(s,q){if(q===this.COMPILE_STATUS&&this.getShaderSource(s).includes('attribute vec3 color;'))return false;return original.call(this,s,q);};
            try{g.cave.volume.releaseKarstVolume();g.cave.draw();return g.cave.volume.karstVolumeStats();}
            finally{p.getShaderParameter=original;}
        })()`);
        assert(report.shaderFallback.ready && report.shaderFallback.fishFailure && report.shaderFallback.fishCount===0);
        await ev('DeepTapeGame.cave.volume.releaseKarstVolume()'); await settle();
        assert.equal(await ev('DeepTapeGame.cave.volume.karstVolumeStats().fishCount'), 2);
        assert(await ev('DeepTapeGame.cave.volume.loseKarstVolumeContext()')); await wait(500); await settle();
        report.recovered = await ev('DeepTapeGame.cave.volume.karstVolumeStats()'); assert(report.recovered.ready && report.recovered.fishCount===2 && !report.recovered.fishFailure);
        await shot('07-recovered');
        // 删除鱼后不得留上一帧的体积或二次叠画。
        await ev('DeepTapeGame.state.fishEnemies.forEach(f=>f.dead=true)'); await wait(150);
        assert.equal(await ev('DeepTapeGame.cave.volume.karstVolumeStats().fishCount'), 0);
        report.errors = b.errors; assert.equal(b.errors.length, 0, JSON.stringify(b.errors)); report.status = 'passed';
    } catch (e) { report.status = 'failed'; report.failure = String(e.stack || e); process.exitCode = 1; }
    finally { fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await b.close(); }
})();
