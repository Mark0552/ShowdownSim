/**
 * Sound manager for game audio.
 * Preloads sounds and plays them on demand.
 */

const BASE = import.meta.env.BASE_URL || '/';

const SOUND_FILES: Record<string, string> = {
    'dice-roll': 'sounds/dice-roll.mp3',
    'bathitball': 'sounds/bathitball.mp3',
    'homerun': 'sounds/rbi-baseball-homerun-nes.mp3',
    'ssbhomerun': 'sounds/ssbhomerun.mp3',
    'strike-three': 'sounds/strike-three.mp3',
    'glove-pop': 'sounds/glove-pop.mp3',
    'just-a-bit-outside': 'sounds/just-a-bit-outside_MChbyOK.mp3',
    'pitches-that-close': 'sounds/bob-ueker-pitches-that-close.mp3',
    'safe': 'sounds/safe.mp3',
    'out': 'sounds/out.mp3',
    'game-start': 'sounds/rbi-baseball-game-start-nes.mp3',
    'switch-sides': 'sounds/rbi-baseball-switch-sides-nes.mp3',
    'seventh-inning': 'sounds/rbi-baseball-3-14-seventh-inning-stretch.mp3',
    'victory': 'sounds/rbi-baseball-3-15-undefeated.mp3',
    'rally-1': 'sounds/rbi-baseball-3-09-rally-5-spanish-dance.mp3',
    'rally-2': 'sounds/rbi-baseball-3-07-rally-3-chiapanecas.mp3',
    'run-scored': 'sounds/taco-bell-bong-sfx.mp3',
    'icon-used': 'sounds/mario-1up_eSTTTOB.mp3',
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
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

export function playSoundDelayed(name: string, delayMs: number) {
    setTimeout(() => playSound(name), delayMs);
}

let preloaded = false;
export function preloadSounds() {
    if (preloaded) return;
    preloaded = true;
    for (const name of Object.keys(SOUND_FILES)) {
        getAudio(name);
    }
}
