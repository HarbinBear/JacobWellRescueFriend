import { getAdaptiveMusicClock } from '../audio/AdaptiveMusic';
import { sampleTapeVisual, TapeVisual } from '../audio/AdaptiveMusicVisuals';
import { getLifeDetectorRuntime } from '../logic/LifeDetector';
import { state } from '../core/state';
import { CONFIG } from '../core/config';

/** Sample at draw time, after music scheduling, for HUD and world alike. */
export function getRescueTapeVisual(): TapeVisual {
    const clock = getAdaptiveMusicClock();
    const visual = sampleTapeVisual(clock);
    if (!clock || !CONFIG.lifeDetector.music.enabled) {
        const detector = getLifeDetectorRuntime();
        visual.fallback = true;
        visual.playing = detector.active;
        visual.lanes[1].gain = detector.active ? 1 : 0;
        visual.lanes[1].hit = detector.pulseT;
        visual.kick = detector.pulseT * .5;
    }
    // Muting leaves a visible tape and progress, but stops claiming audible hits.
    if (state.audio.muted) { visual.kick = visual.snare = 0; visual.lanes.forEach(lane => lane.hit = 0); }
    return visual;
}
