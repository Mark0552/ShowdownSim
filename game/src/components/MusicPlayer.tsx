import { useState, useRef, useEffect, useCallback } from 'react';

const BASE = import.meta.env.BASE_URL || '/';

interface Track {
    file: string;
    title: string;
    artist: string;
}

const TRACKS: Track[] = [
    { file: 'sounds/music/Dropkick_Murphys_-_Tessie__SPOTISAVER_.mp3', title: 'Tessie', artist: 'Dropkick Murphys' },
    { file: 'sounds/music/The_Bravery_-_An_Honest_Mistake__SPOTISAVER_.mp3', title: 'An Honest Mistake', artist: 'The Bravery' },
    { file: 'sounds/music/Hot_Hot_Heat_-_You_Owe_Me_an_IOU__SPOTISAVER_.mp3', title: 'You Owe Me an IOU', artist: 'Hot Hot Heat' },
    { file: 'sounds/music/Rock__n__Roll_Soldiers_-_Funny_Little_Feeling__SPOTISAVER_.mp3', title: 'Funny Little Feeling', artist: "Rock 'n' Roll Soldiers" },
    { file: 'sounds/music/The_Zutons_-_Pressure_Point__SPOTISAVER_.mp3', title: 'Pressure Point', artist: 'The Zutons' },
    { file: 'sounds/music/Louis_XIV__Jason_Hill__Brian_Karscig_-_Finding_out_True_Love_Is_Blind_-_Album_EP_Version__SPOTISAVER_.mp3', title: 'Finding out True Love Is Blind', artist: 'Louis XIV' },
    { file: 'sounds/music/And_You_Will_Know_Us_by_the_Trail_of_Dead_-_Let_It_Dive__SPOTISAVER_.mp3', title: 'Let It Dive', artist: '...Trail of Dead' },
    { file: 'sounds/music/Donots_-_We_Got_the_Noise__SPOTISAVER_.mp3', title: 'We Got the Noise', artist: 'Donots' },
    { file: 'sounds/music/The_High_Speed_Scene_-_The_I_Roc_Z_Song__SPOTISAVER_.mp3', title: 'The I Roc Z Song', artist: 'The High Speed Scene' },
];

export default function MusicPlayer() {
    const [trackIdx, setTrackIdx] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [volume, setVolume] = useState(0.3);
    const [minimized, setMinimized] = useState(true);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const track = TRACKS[trackIdx];

    // Create audio element once, reuse
    useEffect(() => {
        const audio = new Audio();
        audio.volume = volume;
        audioRef.current = audio;
        audio.addEventListener('ended', () => {
            setTrackIdx(prev => (prev + 1) % TRACKS.length);
        });
        audio.addEventListener('loadedmetadata', () => {
            setDuration(audio.duration);
        });
        return () => { audio.pause(); audio.src = ''; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load track when index changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const wasPlaying = playing;
        audio.src = `${BASE}${TRACKS[trackIdx].file}`;
        audio.load();
        setProgress(0);
        setDuration(0);
        if (wasPlaying) {
            audio.play().catch(() => {});
        }
    }, [trackIdx]); // eslint-disable-line react-hooks/exhaustive-deps

    // Volume sync
    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    // Progress tracking
    useEffect(() => {
        if (playing) {
            intervalRef.current = setInterval(() => {
                if (audioRef.current) setProgress(audioRef.current.currentTime);
            }, 500);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [playing]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) {
            audio.pause();
            setPlaying(false);
        } else {
            audio.play().then(() => setPlaying(true)).catch(() => {});
        }
    }, [playing]);

    const nextTrack = useCallback(() => {
        setTrackIdx(prev => (prev + 1) % TRACKS.length);
    }, []);

    const prevTrack = useCallback(() => {
        setTrackIdx(prev => (prev - 1 + TRACKS.length) % TRACKS.length);
    }, []);

    const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * duration;
        setProgress(audio.currentTime);
    }, [duration]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // Minimized: just a small button
    if (minimized) {
        return (
            <div onClick={() => setMinimized(false)} style={{
                position: 'fixed', bottom: 12, left: 12, zIndex: 9999,
                background: '#0a1428', border: '1px solid #d4a018', borderRadius: 8,
                padding: '6px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}>
                <span style={{ fontSize: 16 }}>{playing ? '\u23F8' : '\u25B6'}</span>
                <span style={{ color: '#d4a018', fontSize: 11, fontFamily: 'Arial' }}>
                    {playing ? `${track.artist} — ${track.title}` : 'Music'}
                </span>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed', bottom: 12, left: 12, zIndex: 9999,
            background: '#0a1628', border: '1px solid #d4a018', borderRadius: 10,
            padding: 14, width: 320, boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
            fontFamily: 'Arial, sans-serif',
        }}>
            {/* Header with minimize */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: '#d4a018', fontSize: 10, letterSpacing: 2 }}>NOW PLAYING</span>
                <span onClick={() => setMinimized(true)} style={{
                    color: '#6a8aba', fontSize: 14, cursor: 'pointer', padding: '0 4px',
                }}>{'\u2015'}</span>
            </div>

            {/* Track info */}
            <div style={{ marginBottom: 8 }}>
                <div style={{ color: '#eee', fontSize: 15 }}>{track.title}</div>
                <div style={{ color: '#8aade0', fontSize: 12 }}>{track.artist}</div>
            </div>

            {/* Progress bar */}
            <div onClick={seek} style={{
                height: 4, background: '#1a3050', borderRadius: 2, cursor: 'pointer', marginBottom: 6,
            }}>
                <div style={{
                    height: '100%', background: '#d4a018', borderRadius: 2,
                    width: duration > 0 ? `${(progress / duration) * 100}%` : '0%',
                    transition: 'width 0.5s linear',
                }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4a6a90', marginBottom: 10 }}>
                <span>{formatTime(progress)}</span>
                <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 10 }}>
                <span onClick={prevTrack} style={{ color: '#8aade0', fontSize: 18, cursor: 'pointer' }}>{'\u23EE'}</span>
                <span onClick={togglePlay} style={{
                    color: '#d4a018', fontSize: 28, cursor: 'pointer',
                    width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid #d4a018', borderRadius: '50%',
                }}>{playing ? '\u23F8' : '\u25B6'}</span>
                <span onClick={nextTrack} style={{ color: '#8aade0', fontSize: 18, cursor: 'pointer' }}>{'\u23ED'}</span>
            </div>

            {/* Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#4a6a90', fontSize: 12 }}>{'\uD83D\uDD0A'}</span>
                <input type="range" min="0" max="1" step="0.05" value={volume}
                    onChange={e => setVolume(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: '#d4a018', height: 4 }} />
            </div>

            {/* Track number */}
            <div style={{ textAlign: 'center', color: '#4a6a90', fontSize: 10, marginTop: 6 }}>
                {trackIdx + 1} / {TRACKS.length}
            </div>
        </div>
    );
}
