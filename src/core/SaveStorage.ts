// 本地存储封装：统一封装微信小游戏 wx.setStorageSync / getStorageSync / removeStorageSync
// H5 或其他非微信环境下降级到 window.localStorage
//
// 使用约定：
// - 所有 value 都以 JSON 字符串形式存储（wx.setStorageSync 本身支持对象，但为了跨平台统一我们自己做序列化）
// - 读取失败（格式错误、key 不存在）返回 null，不抛异常
// - 单 key 上限：微信小游戏 1MB，总容量 10MB；本项目迷宫存档预计 100KB~500KB，单存档够用

const wxAny: any = (typeof wx !== 'undefined') ? wx : null;

function hasWxStorage(): boolean {
    return !!(wxAny && typeof wxAny.setStorageSync === 'function'
        && typeof wxAny.getStorageSync === 'function'
        && typeof wxAny.removeStorageSync === 'function');
}

function hasLocalStorage(): boolean {
    try {
        return typeof (globalThis as any).localStorage !== 'undefined'
            && (globalThis as any).localStorage !== null;
    } catch (e) {
        return false;
    }
}

/**
 * 写入一个 key（自动 JSON 序列化），写入失败时打印警告但不抛异常
 */
export function saveJSON(key: string, value: any): boolean {
    let str: string;
    try {
        str = JSON.stringify(value);
    } catch (e) {
        console.warn('[SaveStorage] 序列化失败 key=' + key, e);
        return false;
    }

    if (hasWxStorage()) {
        try {
            wxAny.setStorageSync(key, str);
            return true;
        } catch (e) {
            console.warn('[SaveStorage] wx.setStorageSync 失败 key=' + key, e);
            return false;
        }
    }

    if (hasLocalStorage()) {
        try {
            (globalThis as any).localStorage.setItem(key, str);
            return true;
        } catch (e) {
            console.warn('[SaveStorage] localStorage.setItem 失败 key=' + key, e);
            return false;
        }
    }

    console.warn('[SaveStorage] 当前环境无可用存储，写入被忽略 key=' + key);
    return false;
}

/**
 * 读取一个 key（自动 JSON 反序列化），失败时返回 null
 */
export function loadJSON<T = any>(key: string): T | null {
    let raw: any = null;

    if (hasWxStorage()) {
        try {
            raw = wxAny.getStorageSync(key);
        } catch (e) {
            console.warn('[SaveStorage] wx.getStorageSync 失败 key=' + key, e);
            return null;
        }
    } else if (hasLocalStorage()) {
        try {
            raw = (globalThis as any).localStorage.getItem(key);
        } catch (e) {
            console.warn('[SaveStorage] localStorage.getItem 失败 key=' + key, e);
            return null;
        }
    } else {
        return null;
    }

    // wx.getStorageSync 不存在时返回 ''（空串）；localStorage 不存在时返回 null
    if (raw === '' || raw === null || raw === undefined) return null;

    // 兼容：如果平台直接返回了对象（旧数据），直接返回
    if (typeof raw === 'object') return raw as T;

    try {
        return JSON.parse(raw) as T;
    } catch (e) {
        console.warn('[SaveStorage] JSON 解析失败 key=' + key, e);
        return null;
    }
}

/**
 * 移除一个 key，失败时打印警告但不抛异常
 */
export function removeKey(key: string): boolean {
    if (hasWxStorage()) {
        try {
            wxAny.removeStorageSync(key);
            return true;
        } catch (e) {
            console.warn('[SaveStorage] wx.removeStorageSync 失败 key=' + key, e);
            return false;
        }
    }

    if (hasLocalStorage()) {
        try {
            (globalThis as any).localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.warn('[SaveStorage] localStorage.removeItem 失败 key=' + key, e);
            return false;
        }
    }

    return false;
}
