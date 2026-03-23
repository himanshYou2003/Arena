import React, { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { useAudio } from '@/context/AudioContext';

export const BackgroundMusic: React.FC = () => {
    const { 
        isBgmEnabled, 
        bgmPlayer, 
        isGameOverBgmEnabled, 
        gameOverLobbyPlayer,
        playingLobbyPlayer,
        isSoundEnabled,
        isPlayingLobbyBgmEnabled,
    } = useAudio();
    const pathname = usePathname();
    
    // Normalize pathname to check for home page
    const isHomePage = pathname === '/';
    console.log("[BGM] Current Pathname:", pathname, "isHomePage:", isHomePage);

    const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const gameOverFadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const playingFadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── MAIN LOBBY MUSIC ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!bgmPlayer) return;
        bgmPlayer.loop = true;

        const shouldPlay = isHomePage && isBgmEnabled && !isGameOverBgmEnabled && isSoundEnabled;
        console.log("[BGM] shouldPlay Evaluation:", shouldPlay, "(Home:", isHomePage, "Ena:", isBgmEnabled, "Gov:", isGameOverBgmEnabled, "Snd:", isSoundEnabled, ")");

        if (shouldPlay) {
            console.log("[BGM] Entering Play Block. Player Playing State:", bgmPlayer.playing);
            if (!bgmPlayer.playing) {
                console.log("[BGM] Initiating Playback + Fade-in Sequence...");
                bgmPlayer.volume = 0;
                bgmPlayer.play();
                const targetVolume = 0.2;
                const duration = 2000;
                const interval = 50;
                const steps = duration / interval;
                const increment = targetVolume / steps;

                let currentVolume = 0;
                if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
                fadeTimerRef.current = setInterval(() => {
                    currentVolume += increment;
                    if (currentVolume >= targetVolume) {
                        bgmPlayer.volume = targetVolume;
                        if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
                        fadeTimerRef.current = null;
                    } else {
                        bgmPlayer.volume = currentVolume;
                    }
                }, interval);
            }
        } else {
            if (fadeTimerRef.current) {
                clearInterval(fadeTimerRef.current);
                fadeTimerRef.current = null;
            }
            if (bgmPlayer.playing) {
                bgmPlayer.pause();
            }
        }
    }, [bgmPlayer, isHomePage, isBgmEnabled, isGameOverBgmEnabled, isSoundEnabled]);

    // ── IN-GAME PLAYING MUSIC (playing_Lobby.mp3) ─────────────────────────────
    useEffect(() => {
        if (!playingLobbyPlayer) return;
        playingLobbyPlayer.loop = true;

        const isPlaying = isPlayingLobbyBgmEnabled && isSoundEnabled;

        if (isPlaying) {
            if (!playingLobbyPlayer.playing) {
                playingLobbyPlayer.volume = 0;
                playingLobbyPlayer.play();
                const targetVolume = 0.3;
                const duration = 1000;
                const interval = 50;
                const steps = duration / interval;
                const increment = targetVolume / steps;

                let currentVolume = 0;
                if (playingFadeTimerRef.current) clearInterval(playingFadeTimerRef.current);
                playingFadeTimerRef.current = setInterval(() => {
                    currentVolume += increment;
                    if (currentVolume >= targetVolume) {
                        playingLobbyPlayer.volume = targetVolume;
                        if (playingFadeTimerRef.current) clearInterval(playingFadeTimerRef.current);
                        playingFadeTimerRef.current = null;
                    } else {
                        playingLobbyPlayer.volume = currentVolume;
                    }
                }, interval);
            }
        } else {
            if (playingFadeTimerRef.current) {
                clearInterval(playingFadeTimerRef.current);
                playingFadeTimerRef.current = null;
            }
            if (playingLobbyPlayer.playing) {
                playingLobbyPlayer.pause();
            }
        }
    }, [playingLobbyPlayer, isPlayingLobbyBgmEnabled, isSoundEnabled]);

    // ── GAME OVER LOBBY MUSIC ─────────────────────────────────────────────────
    useEffect(() => {
        if (!gameOverLobbyPlayer) return;
        gameOverLobbyPlayer.loop = true;

        if (isGameOverBgmEnabled && isSoundEnabled) {
            if (!gameOverLobbyPlayer.playing) {
                gameOverLobbyPlayer.volume = 0;
                gameOverLobbyPlayer.play();
                const targetVolume = 0.25; // Slightly higher for lobby feel
                const duration = 1500;
                const interval = 50;
                const steps = duration / interval;
                const increment = targetVolume / steps;

                let currentVolume = 0;
                if (gameOverFadeTimerRef.current) clearInterval(gameOverFadeTimerRef.current);
                gameOverFadeTimerRef.current = setInterval(() => {
                    currentVolume += increment;
                    if (currentVolume >= targetVolume) {
                        gameOverLobbyPlayer.volume = targetVolume;
                        if (gameOverFadeTimerRef.current) clearInterval(gameOverFadeTimerRef.current);
                        gameOverFadeTimerRef.current = null;
                    } else {
                        gameOverLobbyPlayer.volume = currentVolume;
                    }
                }, interval);
            }
        } else {
            if (gameOverFadeTimerRef.current) {
                clearInterval(gameOverFadeTimerRef.current);
                gameOverFadeTimerRef.current = null;
            }
            if (gameOverLobbyPlayer.playing) {
                gameOverLobbyPlayer.pause();
            }
        }
    }, [gameOverLobbyPlayer, isGameOverBgmEnabled, isSoundEnabled]);

    return null;
};
