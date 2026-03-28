import { CONFIG } from '../core/config';

export type MazeMainThemeKey = 'muddy' | 'limestone' | 'rusty' | 'shale' | 'hardRock';
export type MazeRockShape = 'round' | 'angular' | 'layered' | 'smooth' | 'spiky';
export type MazeBackgroundDecorationType = 'blobShadow' | 'sharpEdge' | 'layerLines' | 'veinLines' | 'grainDots' | 'glowOrb';
export type MazeStructureKey = 'none' | 'stalactite';

export interface MazeSceneCellBlend {
    theme2: number;
    blend: number;
}

export interface MazeMainThemeConfig {
    name: string;
    wallColor: string;
    wallHighlight: string;
    innerColor: string;
    waterTint: string;
    particleDensity: number;
    particleColor: string;
    mapColor: string;
    rockShape: MazeRockShape;
    bgDecoType: MazeBackgroundDecorationType;
}

export interface MazeThemeSeed {
    id: number;
    r: number;
    c: number;
}

export interface MazeSceneData {
    sceneThemeKeys: MazeMainThemeKey[];
    sceneThemeMap: number[][];
    sceneBlendMap: MazeSceneCellBlend[][];
    sceneStructureMap: MazeStructureKey[][];
}

const MAZE_MAIN_THEME_KEYS: MazeMainThemeKey[] = [
    'muddy',
    'limestone',
    'rusty',
    'shale',
    'hardRock',
];

const MAZE_MAIN_THEMES: Record<MazeMainThemeKey, MazeMainThemeConfig> = {
    muddy: {
        name: '黄泥区',
        wallColor: '#3a3020',
        wallHighlight: '#4a3d28',
        innerColor: '#2a2218',
        waterTint: 'rgba(80,65,30,0.08)',
        particleDensity: 1.6,
        particleColor: 'rgba(140,110,60,VAR)',
        mapColor: 'rgba(160,130,70,0.55)',
        rockShape: 'round',
        bgDecoType: 'blobShadow',
    },
    limestone: {
        name: '白石灰岩区',
        wallColor: '#3a3a3e',
        wallHighlight: '#555560',
        innerColor: '#28282c',
        waterTint: 'rgba(180,190,210,0.06)',
        particleDensity: 0.6,
        particleColor: 'rgba(180,190,200,VAR)',
        mapColor: 'rgba(170,180,200,0.55)',
        rockShape: 'smooth',
        bgDecoType: 'sharpEdge',
    },
    rusty: {
        name: '红褐沉积区',
        wallColor: '#3a2520',
        wallHighlight: '#4d3028',
        innerColor: '#2a1a15',
        waterTint: 'rgba(120,50,30,0.07)',
        particleDensity: 1.2,
        particleColor: 'rgba(150,80,50,VAR)',
        mapColor: 'rgba(170,100,70,0.55)',
        rockShape: 'round',
        bgDecoType: 'veinLines',
    },
    shale: {
        name: '页岩夹层区',
        wallColor: '#302828',
        wallHighlight: '#453838',
        innerColor: '#201a1a',
        waterTint: 'rgba(80,60,60,0.07)',
        particleDensity: 0.9,
        particleColor: 'rgba(130,100,100,VAR)',
        mapColor: 'rgba(150,120,120,0.55)',
        rockShape: 'layered',
        bgDecoType: 'layerLines',
    },
    hardRock: {
        name: '硬岩块裂区',
        wallColor: '#272932',
        wallHighlight: '#3d4250',
        innerColor: '#1b1d24',
        waterTint: 'rgba(60,70,90,0.07)',
        particleDensity: 0.45,
        particleColor: 'rgba(110,120,150,VAR)',
        mapColor: 'rgba(110,125,155,0.55)',
        rockShape: 'angular',
        bgDecoType: 'glowOrb',
    },
};

function shuffleArray<T>(items: T[]): T[] {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = result[i];
        result[i] = result[j];
        result[j] = temp;
    }
    return result;
}

function randInt(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function createEmptyBlendMap(rows: number, cols: number): MazeSceneCellBlend[][] {
    const blendMap: MazeSceneCellBlend[][] = [];
    for (let r = 0; r < rows; r++) {
        blendMap[r] = [];
        for (let c = 0; c < cols; c++) {
            blendMap[r][c] = { theme2: -1, blend: 0 };
        }
    }
    return blendMap;
}

function createStructureMap(
    mazeMap: any[][],
    sceneThemeMap: number[][],
    sceneThemeKeys: MazeMainThemeKey[],
    rows: number,
    cols: number
): MazeStructureKey[][] {
    const structureMap: MazeStructureKey[][] = [];
    for (let r = 0; r < rows; r++) {
        structureMap[r] = new Array(cols).fill('none');
    }

    const eligibleThemes = new Set<MazeMainThemeKey>(['limestone', 'hardRock']);
    const clusterChance = CONFIG.maze.stalactiteClusterChance || 0.3;

    for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
            if (mazeMap[r][c] === 0) continue;
            if (mazeMap[r + 1][c] !== 0) continue;
            if (mazeMap[r - 1][c] === 0) continue;

            const themeIndex = sceneThemeMap[r][c];
            const themeKey = sceneThemeKeys[themeIndex];
            if (!themeKey || !eligibleThemes.has(themeKey)) continue;

            const clusterNoise = Math.sin(Math.floor(r / 3) * 17.71 + Math.floor(c / 4) * 9.23) * 43758.5453;
            const detailNoise = Math.sin(r * 12.9898 + c * 78.233) * 15731.743;
            const clusterValue = clusterNoise - Math.floor(clusterNoise);
            const detailValue = detailNoise - Math.floor(detailNoise);

            if (clusterValue > 1 - clusterChance && detailValue > 0.22) {
                structureMap[r][c] = 'stalactite';
            }
        }
    }

    return structureMap;
}

export function getMazeMainThemeKeys(): MazeMainThemeKey[] {
    return MAZE_MAIN_THEME_KEYS.slice();
}

export function getMazeMainThemeConfig(key: string | null | undefined): MazeMainThemeConfig | null {
    if (!key) return null;
    return MAZE_MAIN_THEMES[key as MazeMainThemeKey] || null;
}

export function getMazeSceneThemeKeyByIndex(sceneThemeKeys: string[] | null | undefined, index: number): string | null {
    if (!sceneThemeKeys || index < 0 || index >= sceneThemeKeys.length) return null;
    return sceneThemeKeys[index] || null;
}

export function getMazeSceneThemeConfigByIndex(sceneThemeKeys: string[] | null | undefined, index: number): MazeMainThemeConfig | null {
    const key = getMazeSceneThemeKeyByIndex(sceneThemeKeys, index);
    return getMazeMainThemeConfig(key);
}

export function getMazeMainThemeName(key: string | null | undefined): string {
    return getMazeMainThemeConfig(key)?.name || '未知区域';
}

export function pickMazeSceneThemeKeys(): MazeMainThemeKey[] {
    const shuffled = shuffleArray(MAZE_MAIN_THEME_KEYS);
    const count = randInt(CONFIG.maze.themesPerGame.min, CONFIG.maze.themesPerGame.max);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function blendHexColors(hex1: string, hex2: string, t: number): string {
    const r1 = parseInt(hex1.slice(1, 3), 16);
    const g1 = parseInt(hex1.slice(3, 5), 16);
    const b1 = parseInt(hex1.slice(5, 7), 16);
    const r2 = parseInt(hex2.slice(1, 3), 16);
    const g2 = parseInt(hex2.slice(3, 5), 16);
    const b2 = parseInt(hex2.slice(5, 7), 16);
    const r = Math.round(r1 * (1 - t) + r2 * t);
    const g = Math.round(g1 * (1 - t) + g2 * t);
    const b = Math.round(b1 * (1 - t) + b2 * t);
    return `rgb(${r},${g},${b})`;
}

export function createMazeSceneData(
    nodes: MazeThemeSeed[],
    mazeMap: any[][],
    rows: number,
    cols: number
): MazeSceneData {
    const sceneThemeKeys = pickMazeSceneThemeKeys();
    const themeCount = sceneThemeKeys.length;
    const sortedNodes = nodes.slice().sort((a, b) => a.r - b.r);
    const bandSize = Math.ceil(sortedNodes.length / Math.max(themeCount, 1));
    const shuffledThemeIndices = shuffleArray(sceneThemeKeys.map((_, index) => index));
    const nodeThemeMap = new Map<number, number>();

    for (let i = 0; i < sortedNodes.length; i++) {
        const bandIndex = Math.min(Math.floor(i / Math.max(1, bandSize)), themeCount - 1);
        nodeThemeMap.set(sortedNodes[i].id, shuffledThemeIndices[bandIndex]);
    }

    const sceneThemeMap: number[][] = [];
    const sceneBlendMap = createEmptyBlendMap(rows, cols);
    const distMap: number[][] = [];
    const dist2Map: number[][] = [];
    const theme1Map: number[][] = [];
    const theme2Map: number[][] = [];

    for (let r = 0; r < rows; r++) {
        sceneThemeMap[r] = new Array(cols).fill(-1);
        distMap[r] = new Array(cols).fill(Infinity);
        dist2Map[r] = new Array(cols).fill(Infinity);
        theme1Map[r] = new Array(cols).fill(-1);
        theme2Map[r] = new Array(cols).fill(-1);
    }

    const queue: { r: number; c: number; dist: number; theme: number }[] = [];
    for (const node of sortedNodes) {
        const nr = Math.max(0, Math.min(rows - 1, Math.round(node.r)));
        const nc = Math.max(0, Math.min(cols - 1, Math.round(node.c)));
        const theme = nodeThemeMap.get(node.id) || 0;
        if (distMap[nr][nc] === Infinity) {
            distMap[nr][nc] = 0;
            theme1Map[nr][nc] = theme;
            queue.push({ r: nr, c: nc, dist: 0, theme });
        } else if (theme !== theme1Map[nr][nc] && dist2Map[nr][nc] === Infinity) {
            dist2Map[nr][nc] = 0;
            theme2Map[nr][nc] = theme;
        }
    }

    let head = 0;
    while (head < queue.length) {
        const current = queue[head++];
        const nextDist = current.dist + 1;
        const neighbors = [
            [current.r - 1, current.c],
            [current.r + 1, current.c],
            [current.r, current.c - 1],
            [current.r, current.c + 1],
        ];

        for (const [nr, nc] of neighbors) {
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (nextDist < distMap[nr][nc]) {
                if (theme1Map[nr][nc] !== -1 && theme1Map[nr][nc] !== current.theme) {
                    if (distMap[nr][nc] < dist2Map[nr][nc]) {
                        dist2Map[nr][nc] = distMap[nr][nc];
                        theme2Map[nr][nc] = theme1Map[nr][nc];
                    }
                }
                distMap[nr][nc] = nextDist;
                theme1Map[nr][nc] = current.theme;
                queue.push({ r: nr, c: nc, dist: nextDist, theme: current.theme });
            } else if (current.theme !== theme1Map[nr][nc] && nextDist < dist2Map[nr][nc]) {
                dist2Map[nr][nc] = nextDist;
                theme2Map[nr][nc] = current.theme;
            }
        }
    }

    const transitionWidth = CONFIG.maze.sceneTransitionWidth || 6;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            sceneThemeMap[r][c] = theme1Map[r][c] >= 0 ? theme1Map[r][c] : 0;
            if (theme2Map[r][c] < 0 || dist2Map[r][c] === Infinity) continue;

            const d1 = distMap[r][c];
            const d2 = dist2Map[r][c];
            const total = d1 + d2;
            if (total <= 0) continue;
            if (d1 < transitionWidth && d2 < transitionWidth) {
                sceneBlendMap[r][c] = {
                    theme2: theme2Map[r][c],
                    blend: Math.max(0, Math.min(1, d1 / total)),
                };
            }
        }
    }

    const sceneStructureMap = createStructureMap(mazeMap, sceneThemeMap, sceneThemeKeys, rows, cols);

    return {
        sceneThemeKeys,
        sceneThemeMap,
        sceneBlendMap,
        sceneStructureMap,
    };
}
