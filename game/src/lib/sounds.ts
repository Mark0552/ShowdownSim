/**
 * Sound manager for game audio.
 * Preloads sounds and plays them on demand.
 */

const BASE = import.meta.env.BASE_URL || '/';

const SOUND_FILES: Record<string, string> = {
    'dice-roll': 'sounds/dice-roll.mp3',
    'bat-crack': 'sounds/bat-crack.mp3',
    'strike-three': 'sounds/strike-three.mp3',
    'glove-pop': 'sounds/glove-pop.mp3',
    'ball-four': 'sounds/ball-four.mp3',
    'safe': 'sounds/safe.mp3',
    'out': 'sounds/out.mp3',
    'play-ball': 'sounds/play-ball.mp3',
};

const audioCache: Record<string, HTMLAudioElement> = {};

function getAudio(name: string): HTMLAudioElement | null {
    if (audioCache[name]) return audioCache[name];
    const file = SOUND_FILES[name];
    if (!file) return null;
    const audio = new Audio(`${BASE}${file}`);
    audio.preload = 'auto';
    audioCache[name] = audio;
    return audio;
}

export function playSound(name: string) {
    const audio = getAudio(name);
    if (!audio) return;
    // Reset and play (allows rapid replays)
    audio.currentTime = 0;
    audio.play().catch(() => {}); // ignore autoplay policy errors
}

// Preload all sounds on first user interaction
let preloaded = false;
export function preloadSounds() {
    if (preloaded) return;
    preloaded = true;
    for (const name of Object.keys(SOUND_FILES)) {
        getAudio(name);
    }
}
