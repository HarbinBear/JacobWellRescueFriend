// 截图自检：复用仓库现成的独立无头浏览器封装，截图写到被 Git 忽略的缓存目录。
const path = require('path');
const { openReviewBrowser } = require('../cave-room/browser.cjs');
const OUT = path.resolve(__dirname, '../../node_modules/.cache/cave-volume'), seed = process.argv[2] || 7;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    const b = await openReviewBrowser('file://' + path.join(__dirname, 'index.html') + '?seed=' + seed, 1334, 750);
    try {
        for (let i = 0; i < 100 && !await b.evaluate('CaveVolume.ready'); i++) await wait(100);
        const sites = await b.evaluate('CaveVolume.sites()');
        const shots = [['flashlight', { persp: 2, light: 0, tilt: 0, line: 0 }], ['structure', { persp: 2, light: 1 }], ['ortho', { persp: 0, light: 1 }], ['tilt', { persp: 2, light: 1, tilt: 1 }]];
        for (const site of sites) for (const [name, options] of site.name === 'chamber' ? shots : shots.slice(0, 1)) {
            await b.evaluate(`CaveVolume.set(${JSON.stringify(options)});CaveVolume.go(${site.x},${site.y},${site.angle})`); await wait(350);
            await b.screenshot(path.join(OUT, `s${seed}-${site.name}-${name}.png`));
        }
        console.log(JSON.stringify({ out: OUT, report: await b.evaluate('CaveVolume.cave.report'), errors: b.errors }));
    } finally { await b.close(); }
})().catch(error => { console.error(error); process.exit(1); });
