// 真实引导绳和编网的显示/灯光/动力学回归；单绳没有woven网的拦鱼能力。
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html?rope-volume';
const OUT = path.resolve(__dirname, '../node_modules/.cache/continuous-gameplay/rope-volume');
const PREVIEW = process.argv.includes('--preview'), SWIM_ONLY = process.argv.includes('--swim-only');
const DEPTH_ONLY = process.argv.includes('--depth-only');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const b = await openReviewBrowser(URL, 1440, 900), report = { scope: '真实洞室/实锚路径，隔离Chrome；非微信真机；单绳不拦鱼' };
    const ev = source => b.evaluate(source);
    async function shot(name) {
        const data = await ev('document.getElementById("game").toDataURL("image/png")');
        fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    }
    async function settle() {
        await wait(100);
        const start = Date.now();
        while (await ev('DeepTapeGame.cave.volume.karstVolumeStats().pending')) {
            assert(Date.now() - start < 18000, '当前洞室分块未完成'); await wait(100);
        }
        await wait(100);
    }
    const stats = () => ev('DeepTapeGame.cave.volume.karstVolumeStats()');
    const drawn = () => ev('DeepTapeGame.cave.volume.isVolumeRopeDrawn(DeepTapeGame.state.rope.ropes[0])');
    const allDrawn = () => ev('DeepTapeGame.state.rope.ropes.every(r=>DeepTapeGame.cave.volume.isVolumeRopeDrawn(r))');
    const ropePath = () => ev('JSON.stringify(DeepTapeGame.state.rope.ropes.map(r=>r.path))');
    // 固定世界点取样，同时验证受光响应与亮黄色在最终合成中可读。
    async function ropeSample() {
        return ev(`(()=>{const g=DeepTapeGame,c=g.state.camera,p=window.__ropeVolumeReview.center,can=document.getElementById('game'),cfg=g.cave.config;
            const sx=(cfg.screenWidth/2+(p.x-c.x-c.swayX)*c.zoom)*can.width/cfg.screenWidth;
            const sy=(cfg.screenHeight/2+(p.y-c.y-c.swayY)*c.zoom)*can.height/cfg.screenHeight;
            const a=can.getContext('2d').getImageData(Math.round(sx)-3,Math.round(sy)-3,6,6).data;
            let sum=0,yellow=[0,0,0],strongest=0;
            for(let i=0;i<a.length;i+=4){
                const r=a[i],g=a[i+1],b=a[i+2],chroma=Math.min(r,g)-b;
                sum+=.2126*r+.7152*g+.0722*b;
                if(chroma>strongest){strongest=chroma;yellow=[r,g,b];}
            }
            return{luma:sum/36,yellow};})()`);
    }
    async function actualSwim() {
        const fixedView = 'DeepTapeGame.review.inspectVolumeRopeView(1);Object.assign(DeepTapeGame.state.camera,{zoom:1.4,targetZoom:1.4})';
        await ev('window.__ropeVolumeReview=DeepTapeGame.review.inspectVolumeRope();' + fixedView);
        await settle(); const pathBefore = await ropePath();
        const sample = () => ev(`(()=>{const g=DeepTapeGame,f=g.state.fishEnemies[0],p=g.state.rope.ropes[0].path,a=p[0],b=p[p.length-1];
            const side=q=>((b.x-a.x)*(q.y-a.y)-(b.y-a.y)*(q.x-a.x))/Math.hypot(b.x-a.x,b.y-a.y);
            return{x:f.x,y:f.y,animTime:f.animTime,side:side(f),playerSide:side(g.player),time:g.world.geometry.world().elapsed,
                contact:g.interactions.rope.getRopeContact(f)?.kind||null};})()`);
        const before = await sample(); assert(before.side * before.playerSide < 0, '初始鱼和潜水员应位于绳线两侧');
        await shot('10-swim-before'); await ev('DeepTapeGame.world.geometry.world().hidden=false');
        let nearLine = null, crossed = false;
        for (let i = 0; i < 35; i++) {
            await wait(80); const current = await sample(); crossed ||= current.side * before.side < 0;
            if (!nearLine && Math.abs(current.side) < 8) {
                await ev(fixedView);
                await wait(50); nearLine = await sample(); await shot('11-fish-near-rope');
                await ev('DeepTapeGame.world.geometry.world().hidden=false');
            }
        }
        await ev(fixedView);
        await wait(80); const after = await sample(); await shot('12-swim-after');
        const distance = Math.hypot(after.x - before.x, after.y - before.y);
        assert(distance > 10 && after.animTime > before.animTime, '真实AI必须推进游动和动画');
        assert.equal(await ropePath(), pathBefore, '鱼游动不能修改固定引导绳路径');
        assert.notEqual(after.contact, 'snag', '非woven单绳不能伪造捕获');
        assert(await drawn()); assert(await ev('DeepTapeGame.cave.volume.isVolumeFishDrawn(DeepTapeGame.state.fishEnemies[0])'));
        return { before, after, distance, simulationSeconds: after.time - before.time, crossed, nearLine,
            rule: '真实AI游动；非woven单绳按现有规则不拦鱼，未修改路径或伪造接触' };
    }
    async function depthOcclusion() {
        // 仅隔离渲染摆位：鱼与绳中心同在z=0，鱼的前半体积应遮住更细的管体。
        const placement = await ev(`(()=>{const g=DeepTapeGame;window.__ropeVolumeReview=g.review.inspectVolumeRope();
            g.review.inspectVolumeRopeView(1);g.cave.config.quality.scale=.3;
            const rope=g.state.rope.ropes[0],a=rope.path[0],b=rope.path[rope.path.length-1],p=window.__ropeVolumeReview.center;
            const length=Math.hypot(b.x-a.x,b.y-a.y),dx=(b.x-a.x)/length,dy=(b.y-a.y)/length,f=g.state.fishEnemies[0];
            Object.assign(f,{x:p.x,y:p.y,angle:Math.atan2(dy,dx),targetAngle:Math.atan2(dy,dx),animTime:.37});
            window.__depthRopes=g.state.rope.ropes;window.__depthPoints=[{x:p.x,y:p.y},{x:p.x+dx*60,y:p.y+dy*60}];
            return{fish:{x:f.x,y:f.y},points:window.__depthPoints};})()`);
        const originalPath = await ropePath(); await settle();
        const withStats = await stats(); assert(withStats.ropeCount === 1 && withStats.fishCount === 1);
        // stats.shadows表示阴影缓冲已分配；实际shadowOn由quality.scale>.3决定。
        assert.equal(await ev('DeepTapeGame.cave.config.quality.scale'), .3);
        const patches = () => ev(`(()=>{const g=DeepTapeGame,c=g.state.camera,can=document.getElementById('game'),cfg=g.cave.config;
            return window.__depthPoints.map(p=>{const x=(cfg.screenWidth/2+(p.x-c.x-c.swayX)*c.zoom)*can.width/cfg.screenWidth;
                const y=(cfg.screenHeight/2+(p.y-c.y-c.swayY)*c.zoom)*can.height/cfg.screenHeight;
                return Array.from(can.getContext('2d').getImageData(Math.round(x)-3,Math.round(y)-3,6,6).data);});})()`);
        const withRope = await patches();
        await ev('DeepTapeGame.state.rope.ropes=[]'); await wait(120);
        const withoutStats = await stats(); assert.equal(withoutStats.ropeCount, 0); assert.equal(withoutStats.fishCount, 1);
        const withoutRope = await patches();
        const difference = (a, b) => {
            let sum = 0, maximum = 0, count = 0;
            for (let i = 0; i < a.length; i++) if (i % 4 !== 3) { const d = Math.abs(a[i] - b[i]); sum += d; maximum = Math.max(maximum, d); count++; }
            return { mean: sum / count, maximum };
        };
        const fishPatch = difference(withRope[0], withoutRope[0]), outsidePatch = difference(withRope[1], withoutRope[1]);
        assert(fishPatch.mean < .2 && fishPatch.maximum <= 1, '鱼身中央不能叠上绳索亮线');
        assert(outsidePatch.mean > 1, '鱼外绳段应仍可见，不能用整根漏画通过遮挡检查');
        await ev('DeepTapeGame.state.rope.ropes=window.__depthRopes'); await wait(120);
        assert(await drawn()); assert.equal(await ropePath(), originalPath); await shot('13-fish-rope-depth-study');
        return { placement, shadowQualityScale: .3, fishPatch, outsidePatch,
            scope: '仅渲染摆位与共享深度验收，不代表AI横穿、碰撞或单绳拦鱼' };
    }
    async function wovenProgression() {
        let previousPaths = await ev('DeepTapeGame.state.rope.ropes.map(r=>JSON.stringify(r.path))');
        const camera = await ev('JSON.stringify(DeepTapeGame.state.camera)');
        const views = [];
        for (const count of [1, 2, 3]) {
            if (count > 1) {
                const crossing = await ev('DeepTapeGame.review.setVolumeRopeCrossing(true,' + count + ')');
                assert(crossing && crossing.woven === count && crossing.ropes === count, '真实放绳应组成' + count + '根编网');
            }
            await wait(150); const current = await stats();
            assert.equal(current.ropeCount, count, '新增交叉绳不能让已有绳退回二维'); assert(await allDrawn());
            const currentPaths = await ev('DeepTapeGame.state.rope.ropes.map(r=>JSON.stringify(r.path))');
            previousPaths.forEach((saved, i) => assert.equal(currentPaths[i], saved, '编网不能改写已有绳路'));
            previousPaths = currentPaths;
            assert.equal(await ev('JSON.stringify(DeepTapeGame.state.camera)'), camera, '进阶截图必须保持同一机位');
            const savedPaths = await ropePath(); await wait(200);
            assert.equal(await ropePath(), savedPaths); assert.equal((await stats()).ropeBuilds, current.ropeBuilds, '静止编网不能每帧上传');
            const name = '14-' + count + '-ropes-same-view'; await shot(name);
            views.push({ count, triangles: current.ropeTriangles, builds: current.ropeBuilds, screenshot: name + '.png' });
        }
        return views;
    }
    async function actualSnag() {
        // 只在独立评审Chrome中记录实际上传且用于drawElements的顶点，不加产品调试接口。
        await ev(`(()=>{const p=WebGLRenderingContext.prototype,uploads=new Map();window.__ropeGpu={uploads,bufferData:p.bufferData,drawElements:p.drawElements};
            p.bufferData=function(target,data,usage){if(target===this.ARRAY_BUFFER&&data instanceof Float32Array)
                uploads.set(this.getParameter(this.ARRAY_BUFFER_BINDING),{positions:Array.from(data),drawn:false,count:0});
                return window.__ropeGpu.bufferData.call(this,target,data,usage);};
            p.drawElements=function(mode,count,type,offset){const record=uploads.get(this.getVertexAttrib(0,this.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING));
                if(record){record.drawn=true;record.count=count;}return window.__ropeGpu.drawElements.call(this,mode,count,type,offset);};})()`);
        const comparePose = () => ev(`(()=>{const g=DeepTapeGame,expected=g.review.inspectVolumeRopePose();let error=Infinity;
            for(const upload of window.__ropeGpu.uploads.values())if(upload.drawn&&upload.count===expected.indexCount&&upload.positions.length===expected.positions.length){
                let maximum=0;for(let i=0;i<expected.positions.length;i++)maximum=Math.max(maximum,Math.abs(upload.positions[i]-expected.positions[i]));error=Math.min(error,maximum);}
            return{maxError:Number.isFinite(error)?error:null,displacement:expected.displacement,ropeCount:expected.ropeCount,rejected:expected.rejected,
                contact:g.interactions.rope.getRopeContact(g.state.fishEnemies[0])?.kind||null,stats:g.cave.volume.karstVolumeStats()};})()`);
        try {
            const fixture = await ev(`(()=>{const g=DeepTapeGame,result=g.review.inspectVolumeFish('snag');g.world.geometry.world().hidden=true;g.input.move=0;return result;})()`);
            assert(fixture.caught, '必须由真实移动碰撞取得入网接触'); await settle();
            const originalPath = await ropePath(), before = await comparePose();
            assert.equal(before.contact, 'snag'); assert(before.ropeCount >= 3); assert(await allDrawn());
            assert.equal(before.stats.ropeCount, fixture.ropes);
            assert(before.maxError !== null && before.maxError < .002, '实际GPU绳路必须跟随getRopeDeformedPoint');
            assert(before.displacement > .1, '入网应产生真实绳网形变'); await shot('15-real-snag-deformed');
            await wait(300); const frozen = await comparePose();
            assert.equal(frozen.stats.ropeBuilds, before.stats.ropeBuilds, '定格接触形变不能重复上传');
            await ev('DeepTapeGame.world.geometry.world().hidden=false'); await wait(700);
            await ev('DeepTapeGame.world.geometry.world().hidden=true'); await wait(120);
            const after = await comparePose();
            assert(after.stats.ropeBuilds > before.stats.ropeBuilds, '真实接触变化必须更新管体');
            assert(after.maxError !== null && after.maxError < .002, '动态更新后GPU绳路必须仍跟随真实形变');
            assert.equal(await ropePath(), originalPath, '形变显示不得改写玩法基线路径'); assert(await allDrawn());
            await shot('16-real-snag-updated');
            const removed = await ev(`(()=>{const g=DeepTapeGame,r=g.interactions.rope,f=g.state.fishEnemies[0],cuts=r.fishPocketCuts(f);
                return{cuts:cuts.length,removed:r.cutGuideRopes(cuts),remaining:g.state.rope.ropes.length,contact:r.getRopeContact(f)?.kind||null};})()`);
            assert(removed.cuts > 0 && removed.removed); assert.equal(removed.remaining, 0, '真实剪网应拆除整张相连编网');
            await wait(150); assert.equal((await stats()).ropeCount, 0, '整网移除后不能残留GPU管体');
            return { fixture, before, frozenBuilds: frozen.stats.ropeBuilds, after, removed,
                rule: '真实运动取得snag；实际绘制GPU顶点与getRopeDeformedPoint生成的管体逐点对照；真实剪网整张拆除' };
        } finally {
            await ev('WebGLRenderingContext.prototype.bufferData=window.__ropeGpu.bufferData;WebGLRenderingContext.prototype.drawElements=window.__ropeGpu.drawElements;delete window.__ropeGpu');
        }
    }
    try {
        report.fixture = await ev(`(()=>{const g=DeepTapeGame;g.cave.config.quality.auto=false;g.cave.config.quality.scale=.75;
            const result=g.review.inspectVolumeRope();window.__ropeVolumeReview=result;return result;})()`);
        assert(report.fixture && report.fixture.nonWoven && report.fixture.path.length >= 2);
        assert(report.fixture.anchors.start >= 0 && report.fixture.anchors.end >= 0, '两端必须挂在当前地图的真实墙上');
        assert(await ev('DeepTapeGame.cave.config.karst.volumeRopes'), '立体引导绳默认启用');
        const initialPath = await ropePath();
        if (DEPTH_ONLY) {
            report.depth = await depthOcclusion(); report.errors = b.errors;
            assert.equal(b.errors.length, 0, JSON.stringify(b.errors)); report.status = 'passed'; return;
        }
        if (SWIM_ONLY) {
            report.swim = await actualSwim(); report.errors = b.errors;
            assert.equal(b.errors.length, 0, JSON.stringify(b.errors)); report.status = 'passed'; return;
        }
        await settle(); report.enabled = await stats();
        assert(report.enabled.ready && report.enabled.ropeCount === 1 && report.enabled.ropeTriangles > 0 && !report.enabled.ropeFailure);
        assert(await drawn()); assert.equal(report.enabled.fishCount, 1); await shot('01-front-volume');
        report.progression = await wovenProgression();
        await ev('DeepTapeGame.review.setVolumeRopeCrossing(false)'); await wait(150);
        assert.equal(await ropePath(), initialPath);
        await ev('DeepTapeGame.cave.config.karst.volumeRopes=false'); await wait(150);
        report.disabled = await stats(); assert.equal(report.disabled.ropeCount, 0); assert(!await drawn());
        assert(report.disabled.ready && report.disabled.fishCount === 1, '退回二维绳不能关闭洞室或实体鱼');
        assert.equal(await ropePath(), initialPath); await shot('02-front-original-2d');
        await ev('DeepTapeGame.cave.config.karst.volumeRopes=true'); await wait(150); assert(await drawn());
        if (PREVIEW) { report.status = 'preview'; return; }

        const beforeCache = await stats(); await wait(650); const afterCache = await stats();
        assert.equal(afterCache.ropeBuilds, beforeCache.ropeBuilds, '相同静态路径不能每帧重建网格');
        report.stableCache = { builds: afterCache.ropeBuilds, triangles: afterCache.ropeTriangles };
        await ev('DeepTapeGame.review.inspectVolumeRopeView(1)'); await settle(); await shot('03-close-volume');
        const front = await ropeSample(); report.frontLuma = front.luma; report.frontYellow = front.yellow;
        await ev('DeepTapeGame.review.rotateKarstLight(Math.PI)'); await wait(150); report.turnedLuma = (await ropeSample()).luma; await shot('04-turned-light');
        await ev('DeepTapeGame.state.flashlightOn=false'); await wait(150);
        const off = await ropeSample(); report.offLuma = off.luma; report.offYellow = off.yellow; await shot('05-light-off');
        const [red, green, blue] = front.yellow;
        assert(Math.min(red, green) > 185 && Math.min(red, green) - blue > 80, '手电直射的绳芯应是饱和亮黄色');
        assert(Math.min(off.yellow[0], off.yellow[1]) - off.yellow[2] > 55, '近身绳段在关灯时仍应可辨认');
        assert(report.frontLuma > report.offLuma + 1, '绳索可见受光不能在关灯后保持固定亮度');
        assert(report.frontLuma > report.turnedLuma + .5, '绳索受光应跟随手电朝向');
        await ev('DeepTapeGame.state.flashlightOn=true;DeepTapeGame.review.rotateKarstLight(-Math.PI);DeepTapeGame.review.inspectVolumeRopeView(2)');
        await settle(); await shot('06-real-wall-anchor'); assert.equal(await ropePath(), initialPath, '镜头和灯光不能修改真实绳路');

        // 无鱼时也保持整张编网立体，开关只改变显示；关闭交叉是场景恢复，不是游戏剪网。
        await ev('DeepTapeGame.state.fishEnemies=[];DeepTapeGame.review.inspectVolumeRopeView(0)'); await settle();
        report.crossing = await ev('DeepTapeGame.review.setVolumeRopeCrossing(true)'); assert.equal(report.crossing.woven, 2);
        const wovenPath = await ropePath(); await wait(150);
        const wovenStats = await stats(); assert.equal(wovenStats.ropeCount, 2); assert.equal(wovenStats.fishCount, 0);
        assert(await allDrawn()); await shot('07-crossing-stays-volume');
        await ev('DeepTapeGame.cave.config.karst.volumeRopes=false'); await wait(120);
        assert.equal((await stats()).ropeCount, 0); assert(!await drawn()); assert.equal(await ropePath(), wovenPath);
        await ev('DeepTapeGame.cave.config.karst.volumeRopes=true'); await wait(150);
        assert.equal((await stats()).ropeCount, 2); assert(await allDrawn()); assert.equal(await ropePath(), wovenPath);

        assert(await ev('DeepTapeGame.cave.volume.loseKarstVolumeContext()')); await wait(450); await settle();
        report.wovenRecovered = await stats(); assert(report.wovenRecovered.ready && report.wovenRecovered.ropeCount === 2);
        assert(await allDrawn()); assert.equal(await ropePath(), wovenPath);
        await ev('DeepTapeGame.review.setVolumeRopeCrossing(false)'); await wait(150);
        report.singleRestored = await stats(); assert.equal(report.singleRestored.ropeCount, 1); assert(await drawn());
        assert.equal(await ropePath(), initialPath); await shot('08-single-restored-no-fish');

        assert(await ev('DeepTapeGame.cave.volume.loseKarstVolumeContext()')); await wait(450); await settle();
        report.recovered = await stats(); assert(report.recovered.ready && report.recovered.ropeCount === 1 && !report.recovered.ropeFailure);
        assert(await drawn()); assert.equal(await ropePath(), initialPath); await shot('09-context-restored');
        const restoredBuilds = report.recovered.ropeBuilds; await wait(400);
        assert.equal((await stats()).ropeBuilds, restoredBuilds, '上下文恢复后静态缓存应重新稳定');
        await ev('DeepTapeGame.state.rope.ropes=[]'); await wait(150);
        report.removed = await stats(); assert.equal(report.removed.ropeCount, 0, '删光绳和鱼后不得残留管体批次');
        report.snag = await actualSnag();
        report.swim = await actualSwim();
        report.depth = await depthOcclusion();
        report.errors = b.errors; assert.equal(b.errors.length, 0, JSON.stringify(b.errors)); report.status = 'passed';
    } catch (error) { report.status = 'failed'; report.failure = String(error.stack || error); report.errors = b.errors; process.exitCode = 1; }
    finally {
        fs.writeFileSync(path.join(OUT, PREVIEW ? 'preview-report.json' : DEPTH_ONLY ? 'depth-report.json' : SWIM_ONLY ? 'swim-report.json' : 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2)); await b.close();
    }
})();
