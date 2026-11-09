const fs = require('fs'), path = require('path'), ts = require('typescript'), assert = require('assert/strict'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), cache = new Map();
function load(file) {
    file = path.posix.normalize(file);
    if (cache.has(file)) return cache.get(file).exports;
    if (!fs.existsSync(path.join(ROOT, file + '.ts'))) file += '/index';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText;
    new Function('module', 'exports', 'require', code)(module, module.exports,
        name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name))));
    return module.exports;
}
const core = load('src/core/state'), map = load('src/world/map'), geometry = load('src/world/continuous/Geometry');
const karst = load('src/world/KarstTerrain'), rocks = load('src/world/RockGeometry');
const config=load('src/core/config').CONFIG;
config.karst.geometryMode=process.env.JWR_KARST_GENERATION==='chambers'?'chambers':'legacy';
const report = { scope: '实际地图生成器与手机版连续溶洞；内存测试，不是微信GPU实测', generation:config.karst.geometryMode,seeds: [], samples: 0, status: 'passed' };
const fingerprint = data => crypto.createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex').slice(0, 12);
function build(seed) {
    const maze = map.generateMazeMap(seed);
    core.state.mazeRescue = maze; core.state.screen = 'mazeRescue';
    const random = Math.random;
    Math.random = () => { throw Error('地质生成不得消费运行时随机数'); };
    let world;
    try { world = geometry.attachWorldTerrain(maze); } finally { Math.random = random; }
    const terrain = karst.getKarstTerrain(maze);
    assert(terrain && terrain.formations.length > 0 && terrain.edges.length > 1000);
    if(config.karst.geometryMode==='chambers'){assert(terrain.chambers?.rooms.length>=4);assert.equal(new Set(terrain.chambers.rooms.map(r=>r.grammar)).size,4);assert(terrain.formations.some(f=>f.length>130));}
    assert.equal(karst.buildKarstTerrain(maze), terrain, '同一地图不可重复分配地质场');
    assert(terrain.handles.every(wall => maze.mazeWalls.includes(wall)));
    return { maze, world, terrain };
}
for (const seed of [26110941, 0, 1, 7391, 4294967295]) {
    const { maze, world, terrain: t } = build(seed), ts = maze.mazeTileSize;
    const handles = maze.mazeWalls.slice(), digest = fingerprint(t.texture);
    const first = Math.floor(world.seamY / ts), goal = [Math.floor(maze.npcInitY / ts), Math.floor(maze.npcInitX / ts)];
    const queue = [[first, Math.floor(world.originX / ts)]], seen = new Set(queue.map(v => v.join(',')));
    for (let i = 0; i < queue.length; i++) {
        const [r, c] = queue[i], p = { x: (c + .5) * ts, y: (r + .5) * ts };
        const degree=[[-1,0],[1,0],[0,-1],[0,1]].filter(([dy,dx])=>maze.mazeMap[r+dy]?.[c+dx]===0).length;
        if(degree<4)assert(!geometry.circleCollision(p.x,p.y,18),'窄路与分岔口必须保持净空 seed='+seed+' cell='+r+','+c);
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const rr = r + dy, cc = c + dx, key = rr + ',' + cc;
            if (rr < first || maze.mazeMap[rr]?.[cc] !== 0 || seen.has(key)) continue;
            const q = { x: (cc + .5) * ts, y: (rr + .5) * ts };
            const nextDegree=[[-1,0],[1,0],[0,-1],[0,1]].filter(([dy,dx])=>maze.mazeMap[rr+dy]?.[cc+dx]===0).length;
            if(degree<4&&nextDegree<4)assert(karst.karstSegmentClear(t,p,q,18),'窄路之间须保持身体净空 seed='+seed);
            seen.add(key); queue.push([rr, cc]);
        }
    }
    assert(seen.has(goal.join(',')), '泉井与救援目标必须保持连通 seed=' + seed);
    const step=32,cols=Math.ceil(maze.mazeCols*ts/step),top=world.seamY+48,rows=Math.ceil((maze.mazeRows*ts-top)/step);
    const free=new Int8Array(cols*rows),visited=new Uint8Array(free.length),point=id=>({x:(id%cols+.5)*step,y:top+(Math.floor(id/cols)+.5)*step});
    function allowed(id){if(!free[id]){const p=point(id);free[id]=karst.karstCircle(t,p.x,p.y,18)?-1:1;}return free[id]>0;}
    function connectors(p){const c=Math.floor(p.x/step),r=Math.floor((p.y-top)/step),out=[];
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const cc=c+dx,rr=r+dy,id=rr*cols+cc;if(cc<0||rr<0||cc>=cols||rr>=rows||!allowed(id))continue;
            if(karst.karstSegmentClear(t,p,point(id),18))out.push(id);}return out;}
    const ends=new Set(connectors({x:maze.npcInitX,y:maze.npcInitY})),navigation=connectors({x:world.originX,y:world.seamY+ts*.5});
    navigation.forEach(id=>visited[id]=1);let reached=false;
    for(let head=0;head<navigation.length;head++){
        const id=navigation[head];if(ends.has(id)){reached=true;break;}const r=Math.floor(id/cols),c=id%cols,p=point(id);
        for(const [dy,dx] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
            const rr=r+dy,cc=c+dx,next=rr*cols+cc;if(rr<0||cc<0||rr>=rows||cc>=cols||visited[next]||!allowed(next))continue;
            if(!karst.karstSegmentClear(t,p,point(next),18))continue;visited[next]=1;navigation.push(next);
        }
    }
    assert(reached,'按真实人物半径导航必须能从泉井到达救援目标 seed='+seed);

    let random = seed >>> 0, rays = 0;
    for (let i = 0; i < 700; i++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const x = random / 4294967296 * maze.mazeCols * ts;
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const y = world.seamY + 40 + random / 4294967296 * (maze.mazeRows * ts - world.seamY - 80);
        const value = karst.sampleKarst(t, x, y);
        if (Math.abs(value) > .02) assert.equal(karst.karstCircle(t, x, y, 0), value < 0);
        const p = karst.karstNearest(t, x, y, 100);
        if (p.dist > .2 && p.dist < 90) {
            const hit = karst.karstRay(t, x, y, (p.x - x) / p.dist, (p.y - y) / p.dist, p.dist + 3);
            assert(Math.abs(hit.distance - p.dist) < .02, '射线与锚点不得采用两套轮廓');
            assert(hit.wall && maze.mazeWalls.includes(hit.wall));
            assert(rocks.closestRockPoint(hit.wall, hit.x + hit.nx * 1.2, hit.y + hit.ny * 1.2).dist <= 1.21);
            rays++;
        }
        report.samples++;
    }
    let maximumError = 0;
    for (let i = 0; i < t.field.length; i += 37) {
        const decoded = ((t.texture[i * 4] * 256 + t.texture[i * 4 + 1]) / 65535 * 384) - 192;
        maximumError = Math.max(maximumError, Math.abs(decoded - t.field[i]));
    }
    assert(maximumError < .0031, '密度图必须保留16位有效精度');
    assert.deepEqual(maze.mazeWalls, handles, '不可重排已有存档墙面索引');
    assert(!Object.keys(maze).includes('field') && !Object.keys(maze.continuous).includes('terrain'), '地质缓存不可落入游戏存档');
    const repeat = build(seed);
    assert.equal(fingerprint(repeat.terrain.texture), digest, '相同种子必须生成相同高度、材质与轮廓');
    assert.deepEqual(repeat.terrain.formations, t.formations);
    const info = { seed, fingerprint: digest, edges: t.edges.length, formations: t.formations.length,
        protectedCells: seen.size, navigationNodes: navigation.length, trueRadiusNavigation: reached, rayChecks: rays, maxDensityError: maximumError, generationMs: t.generationMs };
    karst.releaseKarstTerrain(maze); karst.releaseKarstTerrain(repeat.maze);
    assert.equal(karst.getKarstTerrain(maze), null);
    assert(t.handles.every(w => !rocks.hasRockSurface(w)), '退出必须解除墙面委托并释放地质场');
    report.seeds.push(info);
}
const out = path.join(ROOT, 'node_modules/.cache/karst-review/geometry-'+config.karst.geometryMode+'-report.json');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
