// 微信小游戏 wx API 类型声明

declare namespace wx {
    interface SystemInfo {
        windowWidth: number;
        windowHeight: number;
        screenWidth: number;
        screenHeight: number;
        pixelRatio: number;
        platform: string;
        system: string;
        version: string;
        SDKVersion: string;
        brand: string;
        model: string;
        language: string;
        fontSizeSetting: number;
        benchmarkLevel: number;
        albumAuthorized: boolean;
        cameraAuthorized: boolean;
        locationAuthorized: boolean;
        microphoneAuthorized: boolean;
        notificationAuthorized: boolean;
        bluetoothEnabled: boolean;
        locationEnabled: boolean;
        wifiEnabled: boolean;
        safeArea: SafeArea;
    }

    interface SafeArea {
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
    }

    interface Touch {
        identifier: number;
        clientX: number;
        clientY: number;
        pageX: number;
        pageY: number;
        force: number;
    }

    interface TouchEvent {
        touches: Touch[];
        changedTouches: Touch[];
        timeStamp: number;
    }

    // 微信小游戏 Canvas 接口，运行时可直接传给 ctx.drawImage()
    // 注意：不继承 HTMLCanvasElement，避免 getContext 重载签名冲突；
    // 在需要传给 drawImage 的地方使用 as unknown as CanvasImageSource 断言
    interface Canvas {
        width: number;
        height: number;
        getContext(contextType: '2d'): CanvasRenderingContext2D;
        getContext(contextType: 'webgl'): WebGLRenderingContext;
        toDataURL(type?: string, quality?: number): string;
        toTempFilePath(options: object): void;
    }

    interface Image {
        src: string;
        width: number;
        height: number;
        onload: (() => void) | null;
        onerror: ((err: any) => void) | null;
    }

    function getSystemInfoSync(): SystemInfo;
    function createCanvas(): Canvas;
    function createImage(): Image;

    function onTouchStart(callback: (event: TouchEvent) => void): void;
    function onTouchMove(callback: (event: TouchEvent) => void): void;
    function onTouchEnd(callback: (event: TouchEvent) => void): void;
    function onTouchCancel(callback: (event: TouchEvent) => void): void;

    function offTouchStart(callback?: (event: TouchEvent) => void): void;
    function offTouchMove(callback?: (event: TouchEvent) => void): void;
    function offTouchEnd(callback?: (event: TouchEvent) => void): void;
    function offTouchCancel(callback?: (event: TouchEvent) => void): void;

    function showToast(options: {
        title: string;
        icon?: 'success' | 'error' | 'loading' | 'none';
        image?: string;
        duration?: number;
        mask?: boolean;
        success?: () => void;
        fail?: () => void;
        complete?: () => void;
    }): void;

    function hideToast(options?: {
        success?: () => void;
        fail?: () => void;
        complete?: () => void;
    }): void;

    function showModal(options: {
        title?: string;
        content?: string;
        showCancel?: boolean;
        cancelText?: string;
        cancelColor?: string;
        confirmText?: string;
        confirmColor?: string;
        success?: (res: { confirm: boolean; cancel: boolean }) => void;
        fail?: () => void;
        complete?: () => void;
    }): void;

    function request(options: {
        url: string;
        data?: object | string;
        header?: object;
        method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT';
        dataType?: string;
        responseType?: 'text' | 'arraybuffer';
        success?: (res: { data: any; statusCode: number; header: object }) => void;
        fail?: (err: any) => void;
        complete?: () => void;
    }): void;

    function setPreferredFramesPerSecond(fps: number): void;
    function onShow(callback: () => void): void;
    function onHide(callback: () => void): void;
    function exitMiniProgram(options?: object): void;
}

// 全局 GameGlobal 命名空间（用于跨模块通信）
declare namespace GameGlobal {
    let triggerSilt: ((x: number, y: number, count: number) => void) | undefined;
    let addBubble: ((x: number, y: number) => void) | undefined;
}

// requestAnimationFrame 在微信小游戏中是全局函数
declare function requestAnimationFrame(callback: (timestamp: number) => void): number;
declare function cancelAnimationFrame(id: number): void;

// setTimeout / clearTimeout 在微信小游戏中是全局函数
declare function setTimeout(callback: () => void, delay?: number): number;
declare function clearTimeout(id: number | null): void;
declare function setInterval(callback: () => void, delay?: number): number;
declare function clearInterval(id: number): void;
