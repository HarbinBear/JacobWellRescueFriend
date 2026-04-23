// 确定性伪随机数生成器（mulberry32）
//
// 用途：让迷宫地图生成（generateMazeMap / createMazeSceneData）可以根据种子完全重建。
//
// 用法：
//   1. 进入地图生成前调用 setActiveSeededRandom(seed) 激活
//   2. 生成过程中调用 srand() / srandInt() / srandRange() / srandPick()
//   3. 生成结束后调用 clearActiveSeededRandom() 回到普通随机
//
// 设计选择：
//   - 用模块级"活跃实例"而不是把 rng 当参数一层层传，这样可以最小化改动
//     map.ts / mazeScene.ts 里所有 Math.random() 只需改成 srand()
//   - 没有活跃实例时 srand() 退化为 Math.random()，保护运行时效果
//     （比如粒子、鱼群动画里的随机不会被误解为需要确定性）

export class SeededRandom {
    private state: number;

    constructor(seed: number) {
        // 保证种子在 uint32 范围内且非 0
        let s = seed >>> 0;
        if (s === 0) s = 0x9E3779B9;
        this.state = s;
    }

    // mulberry32：周期 2^32，质量足以支撑迷宫生成这类用途
    next(): number {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// =============== 活跃实例管理 ===============

let activeRng: SeededRandom | null = null;

export function setActiveSeededRandom(seed: number): void {
    activeRng = new SeededRandom(seed);
}

export function clearActiveSeededRandom(): void {
    activeRng = null;
}

export function hasActiveSeededRandom(): boolean {
    return activeRng !== null;
}

// =============== 公共随机接口（带兜底） ===============

// 基础随机 [0, 1)
export function srand(): number {
    return activeRng ? activeRng.next() : Math.random();
}

// 区间整数 [min, max]
export function srandInt(min: number, max: number): number {
    return Math.floor(min + srand() * (max - min + 1));
}

// 区间浮点 [min, max)
export function srandRange(min: number, max: number): number {
    return min + srand() * (max - min);
}

// 数组中取一项
export function srandPick<T>(arr: T[]): T {
    return arr[Math.floor(srand() * arr.length)];
}

// =============== 种子生成与验证 ===============

// 生成一个随机 uint32 种子（不受活跃实例影响，用 Math.random）
export function generateRandomSeed(): number {
    return (Math.random() * 0xFFFFFFFF) >>> 0;
}
