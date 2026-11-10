// 截图自检：复用仓库现成的独立无头浏览器封装，截图写到被 Git 忽略的缓存目录。
const path = require('path');
const { openReviewBrowser } = require('../cave-room/browser.cjs');
const OUT = path.resolve(__dirname, '../../node_modules/.cache/cave-volume'), seed = process.argv[2] || 7;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    const b = await openReviewBrowser('file://' + path.join(__dirname, 'index.html') + '?seed=' + seed, 1334, 750);
    try {
        for (let i = 0; i < 200 && !await b.evaluate('CaveVolume.ready'); i++) await wait(100);
        const sites = await b.evaluate('CaveVolume.sites()'), base = { persp: 2, light: 0, tilt: 0, line: 0, cut: 1, map: 0 };
        const shots = [['map', { map: 1, light: 1 }], ['map-line', { map: 1, light: 1, line: 1 }], ['hall-edge', {}], ['hall-black', { cut: 0 }], ['hall-strata', { cut: 2 }],
            ['hall-structure', { light: 1 }], ['hall-tilt', { light: 1, tilt: 1 }], ['squeeze-edge', { site: 1 }], ['squeeze-structure', { site: 1, light: 1 }]];
        for (const [name, options] of shots) {
            const site = sites[options.site || 0], state = Object.assign({}, base, options); delete state.site;
            await b.evaluate(`CaveVolume.set(${JSON.stringify(state)});CaveVolume.go(${site.x},${site.y},${site.angle})`); await wait(350);
            await b.screenshot(path.join(OUT, `s02-${seed}-${name}.png`));
        }
        console.log(JSON.stringify({ out: OUT, sites, report: await b.evaluate('CaveVolume.cave.report'), errors: b.errors }));
    } finally { await b.close(); }
})().catch(error => { console.error(error); process.exit(1); });
