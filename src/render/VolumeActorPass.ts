/** Optional external actor in the cave's existing WebGL pass; no default asset or loader. */
export interface VolumeActorPrepareContext {
    x: number; y: number; angle: number; elapsed: number;
    cx: number; cy: number; halfW: number; halfH: number; surfaceY: number;
    enabled: boolean;
}
export interface VolumeActorPass {
    /** Increment whenever geometry, pose, visibility or material changes. */
    readonly revision: number;
    readonly count: number;
    readonly matte?: number;
    readonly triangles?: number;
    readonly bytes?: number;
    prepare(context: VolumeActorPrepareContext): void;
    /** World-space position/normal/color use attributes 0/1/2; shadow needs only 0.
     * Keep the current program, uniforms, framebuffer and render state unchanged.
     * Return true only after submitting a complete actor; false keeps the 2D player. */
    draw(shadow: boolean): boolean;
    dispose(): void;
}
/** Called again after context restoration; the factory must retain CPU source data. */
export type VolumeActorPassFactory = (gl: WebGLRenderingContext) => VolumeActorPass;
