import { SCORE, notesFor, ScoreTrack, VariantName, DEFAULT_VARIANT, MusicMood, WARM_LAYER_TRACKS } from './AdaptiveScore';
import { MusicClock } from './AdaptiveMusicEngine';

export interface MusicHit { beat: number; strength: number; }
export interface VisualLane {
    hit: number; gain: number; age: number; step: number; phase: number;
}
export interface TapeVisual {
    playing: boolean; level: number; requestedLevel: number; mood: MusicMood;
    beats: number; beatPhase: number; bar: number; kick: number; snare: number;
    lanes: VisualLane[]; fallback: boolean; muted: boolean; levelAgeSeconds: number;
}
const tracks: ScoreTrack[] = [...SCORE.stems, 'bedFound', 'bedReturn', ...WARM_LAYER_TRACKS];
const cache: { [key: string]: MusicHit[] } = {};
const loopBeats = SCORE.bars * SCORE.beatsPerBar;

/** The exact score onsets, including C's syncopation, shared by game and preview.
 * No FFT window, threshold, per-frame trigger, timer, or invented metronome. */
export function visualOnsets(track: ScoreTrack, variant: VariantName = DEFAULT_VARIANT, kind = 'main'): MusicHit[] {
    const key = `${variant}/${track}/${kind}`;
    if (cache[key]) return cache[key];
    const part = track.replace('Found', '');
    const voices = kind === 'kick' ? ['kick'] : kind === 'snare' ? ['snare']
        : part === 'beacon' ? ['sonar'] : part === 'bass' ? ['bass']
        : part === 'drums' ? ['kick', 'snare'] : part === 'arp' ? ['drive']
        : part === 'spark' ? ['rush'] : ['veil', 'horizon', 'home', 'chord'];
    const hits: MusicHit[] = [];
    for (const note of notesFor(track, variant).filter(n => voices.indexOf(n.voice) >= 0).sort((a, b) => a.beat - b.beat)) {
        const strength = part === 'spark' ? note.amp / .4 : part === 'drums' || kind !== 'main' ? note.amp / .39 : part === 'beacon' ? note.amp / .17 : 1;
        const previous = hits[hits.length - 1];
        if (previous && Math.abs(previous.beat - note.beat) < 1e-8) previous.strength = Math.max(previous.strength, strength);
        else hits.push({ beat: note.beat, strength: Math.min(1, strength) });
    }
    return cache[key] = hits;
}

function sample(hits: MusicHit[], beats: number, decay: number): VisualLane {
    if (!hits.length) return { hit: 0, gain: 0, age: Infinity, step: 0, phase: 0 };
    const cycle = Math.floor(beats / loopBeats), position = beats - cycle * loopBeats;
    // Binary search keeps the 320-note stream cheap even on a phone.
    let low = 0, high = hits.length;
    while (low < high) { const mid = (low + high) >>> 1; if (hits[mid].beat <= position + 1e-9) low = mid + 1; else high = mid; }
    const index = low - 1, current = index < 0 ? hits.length - 1 : index;
    const birth = hits[current].beat + (index < 0 ? cycle - 1 : cycle) * loopBeats;
    const next = current + 1 < hits.length ? hits[current + 1].beat - hits[current].beat : loopBeats - hits[current].beat + hits[0].beat;
    const age = (beats - birth) * 60 / SCORE.bpm;
    const beforeStart = birth < 0;
    return { hit: beforeStart ? 0 : hits[current].strength * Math.exp(-age / decay), gain: 1,
        age: beforeStart ? Infinity : age, step: (index < 0 ? cycle - 1 : cycle) * hits.length + current,
        phase: Math.max(0, Math.min(1, (beats - birth) / next)) };
}

export function sampleTapeVisual(clock: MusicClock | null): TapeVisual {
    const lanes: VisualLane[] = Array.from({ length: 6 }, () => ({ hit: 0, gain: 0, age: Infinity, step: 0, phase: 0 }));
    const result: TapeVisual = { playing: !!clock && clock.playing, level: clock ? clock.level : 0,
        requestedLevel: clock ? clock.requestedLevel : 0, mood: clock ? clock.mood : 'search',
        beats: clock ? clock.beats : 0, beatPhase: clock ? clock.beatPhase : 0,
        bar: clock ? clock.bar : 0, kick: 0, snare: 0, lanes, fallback: false, muted: false,
        levelAgeSeconds: clock && Number.isFinite(clock.levelAgeSeconds) ? clock.levelAgeSeconds : Infinity };
    if (!clock || !clock.playing) return result;
    tracks.forEach((track, slot) => {
        const gain = clock.trackGains[slot] || 0;
        if (gain < .001) return;
        const lane = slot === 6 || slot === 7 ? 0 : slot >= 8 ? [1, 2, 4, 5][slot - 8] : slot;
        const event = sample(visualOnsets(track, clock.variant), clock.beats, lane === 5 ? .014 : lane === 4 ? .055 : .12);
        event.hit *= gain; event.gain = gain;
        if (gain >= lanes[lane].gain) lanes[lane] = event;
        if (track === 'drums' || track === 'spark' || track === 'sparkFound') {
            result.kick = Math.max(result.kick, sample(visualOnsets(track, clock.variant, 'kick'), clock.beats, .075).hit * gain);
            result.snare = Math.max(result.snare, sample(visualOnsets(track, clock.variant, 'snare'), clock.beats, .055).hit * gain);
        }
    });
    return result;
}
