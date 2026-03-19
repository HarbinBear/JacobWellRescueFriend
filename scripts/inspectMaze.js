const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const moduleCache = new Map();

if (!global.wx) {
    global.wx = {
        getSystemInfoSync() {
            return {
                windowWidth: 390,
                windowHeight: 844,
            };
        },
    };
}

function resolveModulePath(fromFile, specifier) {
    const basePath = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.js`,
        path.join(basePath, 'index.ts'),
        path.join(basePath, 'index.js'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(`无法解析模块: ${specifier}（来自 ${fromFile}）`);
}

function loadTsModule(filePath) {
    const normalizedPath = path.resolve(filePath);
    if (moduleCache.has(normalizedPath)) {
        return moduleCache.get(normalizedPath).exports;
    }

    const source = fs.readFileSync(normalizedPath, 'utf8');
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
            esModuleInterop: true,
        },
        fileName: normalizedPath,
    });

    const moduleRecord = { exports: {} };
    moduleCache.set(normalizedPath, moduleRecord);

    function localRequire(specifier) {
        if (specifier.startsWith('.')) {
            const resolvedPath = resolveModulePath(normalizedPath, specifier);
            if (resolvedPath.endsWith('.ts')) {
                return loadTsModule(resolvedPath);
            }
            return require(resolvedPath);
        }
        return require(specifier);
    }

    const context = {
        module: moduleRecord,
        exports: moduleRecord.exports,
        require: localRequire,
        __dirname: path.dirname(normalizedPath),
        __filename: normalizedPath,
        console,
        process,
        global,
        wx: global.wx,
        Math,
        Date,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
    };

    vm.runInNewContext(transpiled.outputText, context, { filename: normalizedPath });
    return moduleRecord.exports;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function worldToCell(value, tileSize, maxIndex) {
    return clamp(Math.floor(value / tileSize), 0, maxIndex);
}

function extractGrid(maze) {
    const grid = [];
    for (let r = 0; r < maze.mazeRows; r++) {
        grid[r] = [];
        for (let c = 0; c < maze.mazeCols; c++) {
            grid[r][c] = maze.mazeMap[r][c] === 0 ? 0 : 1;
        }
    }
    return grid;
}

function isOpen(grid, r, c) {
    return r >= 0 && r < grid.length && c >= 0 && c < grid[0].length && grid[r][c] === 0;
}

function countOpen4(grid, r, c) {
    let count = 0;
    if (isOpen(grid, r - 1, c)) count++;
    if (isOpen(grid, r + 1, c)) count++;
    if (isOpen(grid, r, c - 1)) count++;
    if (isOpen(grid, r, c + 1)) count++;
    return count;
}

function analyzeMaze(maze) {
    const grid = extractGrid(maze);
    const rows = maze.mazeRows;
    const cols = maze.mazeCols;
    const tileSize = maze.mazeTileSize;
    const spawn = {
        r: worldToCell(maze.spawnY, tileSize, rows - 1),
        c: worldToCell(maze.spawnX, tileSize, cols - 1),
    };
    const npc = {
        r: worldToCell(maze.npcInitY, tileSize, rows - 1),
        c: worldToCell(maze.npcInitX, tileSize, cols - 1),
    };
    const exit = {
        r: 0,
        c: worldToCell(maze.exitX, tileSize, cols - 1),
    };

    grid[spawn.r][spawn.c] = 0;
    grid[npc.r][npc.c] = 0;
    grid[exit.r][exit.c] = 0;

    const degree = Array.from({ length: rows }, () => new Array(cols).fill(0));
    let openCount = 0;
    let deadEnds = 0;
    let junctions = 0;
    let maxRowRun = 0;
    let maxColRun = 0;
    let maxWindowOpen = 0;

    for (let r = 0; r < rows; r++) {
        let run = 0;
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 0) {
                openCount++;
                run++;
                const deg = countOpen4(grid, r, c);
                degree[r][c] = deg;
                if (deg <= 1) deadEnds++;
                if (deg >= 3) junctions++;
            } else {
                maxRowRun = Math.max(maxRowRun, run);
                run = 0;
            }
        }
        maxRowRun = Math.max(maxRowRun, run);
    }

    for (let c = 0; c < cols; c++) {
        let run = 0;
        for (let r = 0; r < rows; r++) {
            if (grid[r][c] === 0) {
                run++;
            } else {
                maxColRun = Math.max(maxColRun, run);
                run = 0;
            }
        }
        maxColRun = Math.max(maxColRun, run);
    }

    const windowRadius = 3;
    for (let r = windowRadius; r < rows - windowRadius; r++) {
        for (let c = windowRadius; c < cols - windowRadius; c++) {
            let count = 0;
            for (let dr = -windowRadius; dr <= windowRadius; dr++) {
                for (let dc = -windowRadius; dc <= windowRadius; dc++) {
                    if (grid[r + dr][c + dc] === 0) count++;
                }
            }
            maxWindowOpen = Math.max(maxWindowOpen, count);
        }
    }

    const dist = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    const parentR = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    const parentC = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    const queue = [spawn];
    dist[spawn.r][spawn.c] = 0;

    let reachableCount = 0;
    for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        reachableCount++;
        const neighbors = [
            { r: current.r - 1, c: current.c },
            { r: current.r + 1, c: current.c },
            { r: current.r, c: current.c - 1 },
            { r: current.r, c: current.c + 1 },
        ];
        for (const next of neighbors) {
            if (!isOpen(grid, next.r, next.c)) continue;
            if (dist[next.r][next.c] !== -1) continue;
            dist[next.r][next.c] = dist[current.r][current.c] + 1;
            parentR[next.r][next.c] = current.r;
            parentC[next.r][next.c] = current.c;
            queue.push(next);
        }
    }

    const pathCells = [];
    const pathLen = dist[npc.r][npc.c];
    let turnCount = 0;
    let pathDecisionCount = 0;
    if (pathLen >= 0) {
        let cr = npc.r;
        let cc = npc.c;
        let prevDr = 0;
        let prevDc = 0;
        while (!(cr === spawn.r && cc === spawn.c)) {
            pathCells.push({ r: cr, c: cc });
            const pr = parentR[cr][cc];
            const pc = parentC[cr][cc];
            if (pr < 0 || pc < 0) break;
            const dr = cr - pr;
            const dc = cc - pc;
            if ((prevDr !== 0 || prevDc !== 0) && (dr !== prevDr || dc !== prevDc)) {
                turnCount++;
            }
            if (degree[cr][cc] >= 3) pathDecisionCount++;
            prevDr = dr;
            prevDc = dc;
            cr = pr;
            cc = pc;
        }
        pathCells.push(spawn);
        pathCells.reverse();
    }

    const openRatio = openCount / (rows * cols);
    const reachableRatio = openCount > 0 ? reachableCount / openCount : 0;
    const accepted = (
        openRatio >= 0.15 &&
        openRatio <= 0.7 &&
        reachableRatio >= 0.8 &&
        pathLen >= Math.floor(rows * 0.01) &&
        deadEnds >= 1 &&
        junctions >= 2 &&
        pathDecisionCount >= 1 &&
        turnCount >= 1 &&
        maxRowRun <= 60 &&
        maxColRun <= 60 &&
        maxWindowOpen <= 200
    );

    let score = 0;
    score += Math.max(0, 1 - Math.abs(openRatio - 0.3) / 0.13) * 220;
    score += Math.min(reachableRatio, 1) * 180;
    score += Math.max(0, Math.min(1, pathLen / (rows * 1.65))) * 190;
    score += Math.max(0, Math.min(1, deadEnds / 70)) * 120;
    score += Math.max(0, Math.min(1, junctions / 150)) * 110;
    score += Math.max(0, Math.min(1, pathDecisionCount / 26)) * 125;
    score += Math.max(0, Math.min(1, turnCount / 22)) * 110;
    score += Math.max(0, 1 - Math.max(0, maxRowRun - 10) / 8) * 110;
    score += Math.max(0, 1 - Math.max(0, maxColRun - 12) / 8) * 110;
    score += Math.max(0, 1 - Math.abs(maxWindowOpen - 40) / 18) * 150;
    if (!accepted) score -= 220;

    return {
        grid,
        spawn,
        npc,
        exit,
        pathCells,
        openCount,
        openRatio,
        reachableRatio,
        pathLen,
        deadEnds,
        junctions,
        pathDecisionCount,
        turnCount,
        maxRowRun,
        maxColRun,
        maxWindowOpen,
        accepted,
        score,
    };
}

function renderAscii(metrics, showPath) {
    const pathSet = new Set(metrics.pathCells.map(cell => `${cell.r},${cell.c}`));
    const lines = [];
    for (let r = 0; r < metrics.grid.length; r++) {
        let line = '';
        for (let c = 0; c < metrics.grid[0].length; c++) {
            const key = `${r},${c}`;
            let ch = metrics.grid[r][c] === 0 ? '.' : '#';
            if (showPath && pathSet.has(key)) ch = '+';
            if (r === metrics.exit.r && c === metrics.exit.c) ch = 'E';
            if (r === metrics.spawn.r && c === metrics.spawn.c) ch = 'S';
            if (r === metrics.npc.r && c === metrics.npc.c) ch = 'N';
            line += ch;
        }
        lines.push(line);
    }
    return lines.join('\n');
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function printMetrics(index, total, metrics) {
    console.log(`\n=== 样本 ${index + 1}/${total} ===`);
    console.log(`通过验收: ${metrics.accepted ? '是' : '否'} | 分数: ${metrics.score.toFixed(1)}`);
    console.log(
        [
            `开阔率 ${formatPercent(metrics.openRatio)}`,
            `可达率 ${formatPercent(metrics.reachableRatio)}`,
            `主路径 ${metrics.pathLen}`,
            `死路 ${metrics.deadEnds}`,
            `岔点 ${metrics.junctions}`,
            `主路决策点 ${metrics.pathDecisionCount}`,
            `转弯 ${metrics.turnCount}`,
            `横向最长直通 ${metrics.maxRowRun}`,
            `纵向最长直通 ${metrics.maxColRun}`,
            `最大局部开阔 ${metrics.maxWindowOpen}`,
        ].join(' | ')
    );
}

function printSummary(results) {
    const acceptedCount = results.filter(item => item.accepted).length;
    const avg = key => results.reduce((sum, item) => sum + item[key], 0) / results.length;
    const best = results.reduce((current, item) => (item.score > current.score ? item : current), results[0]);
    const worst = results.reduce((current, item) => (item.score < current.score ? item : current), results[0]);

    console.log('\n=== 汇总 ===');
    console.log(`样本数: ${results.length} | 通过数: ${acceptedCount} | 通过率: ${formatPercent(acceptedCount / results.length)}`);
    console.log(
        [
            `平均开阔率 ${formatPercent(avg('openRatio'))}`,
            `平均主路径 ${avg('pathLen').toFixed(1)}`,
            `平均死路 ${avg('deadEnds').toFixed(1)}`,
            `平均岔点 ${avg('junctions').toFixed(1)}`,
            `平均转弯 ${avg('turnCount').toFixed(1)}`,
            `平均最大局部开阔 ${avg('maxWindowOpen').toFixed(1)}`,
        ].join(' | ')
    );
    console.log(`最佳样本: #${best.sampleIndex + 1}（${best.score.toFixed(1)}） | 最差样本: #${worst.sampleIndex + 1}（${worst.score.toFixed(1)}）`);
}

function parseArgs(argv) {
    let sampleCount = 3;
    let showPath = false;

    for (const arg of argv) {
        if (arg === '--path') {
            showPath = true;
            continue;
        }
        const parsed = Number(arg);
        if (Number.isInteger(parsed) && parsed > 0) {
            sampleCount = parsed;
        }
    }

    return { sampleCount, showPath };
}

function main() {
    const { sampleCount, showPath } = parseArgs(process.argv.slice(2));
    const mapModule = loadTsModule(path.join(projectRoot, 'src/world/map.ts'));
    const generateMazeMap = mapModule.generateMazeMap;

    if (typeof generateMazeMap !== 'function') {
        throw new Error('未找到 generateMazeMap 导出');
    }

    const results = [];

    console.log(`离线迷宫验图开始：共 ${sampleCount} 张${showPath ? '（显示主路径）' : ''}`);
    for (let i = 0; i < sampleCount; i++) {
        const maze = generateMazeMap();
        const metrics = analyzeMaze(maze);
        metrics.sampleIndex = i;
        results.push(metrics);
        printMetrics(i, sampleCount, metrics);
        console.log(renderAscii(metrics, showPath));
    }

    printSummary(results);
}

main();
