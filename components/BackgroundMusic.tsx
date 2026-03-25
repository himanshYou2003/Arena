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
        isHydrated,
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


        const shouldPlay = isHomePage && isBgmEnabled && !isGameOverBgmEnabled && isSoundEnabled && isHydrated;
        
        if (shouldPlay) {
            if (!bgmPlayer.playing) {
                // Time-accurate Fade-in
                bgmPlayer.playbackSpeed = 1.0; 
                bgmPlayer.volume = 0;
                bgmPlayer.play();
                
                const targetVolume = 0.2;
                const duration = 2000;
                const startTime = Date.now();

                if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
                fadeTimerRef.current = setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    bgmPlayer.volume = progress * targetVolume;
                    if (progress >= 1) {
                        if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
                        fadeTimerRef.current = null;
                    }
                }, 16);
            }
        } else {
            if (fadeTimerRef.current) {
                clearInterval(fadeTimerRef.current);
                fadeTimerRef.current = null;
            }
            if (bgmPlayer.playing) bgmPlayer.pause();
        }
    }, [bgmPlayer, isHomePage, isBgmEnabled, isGameOverBgmEnabled, isSoundEnabled]);

    // ── IN-GAME PLAYING MUSIC (playing_Lobby.mp3) ─────────────────────────────
    useEffect(() => {
        if (!playingLobbyPlayer) return;
        playingLobbyPlayer.loop = true;


        const isPlaying = isPlayingLobbyBgmEnabled && isSoundEnabled && isHydrated;

        if (isPlaying) {
            if (!playingLobbyPlayer.playing) {
                playingLobbyPlayer.playbackSpeed = 1.0;
                playingLobbyPlayer.volume = 0;
                playingLobbyPlayer.play();
                
                const targetVolume = 0.3;
                const duration = 1000;
                const startTime = Date.now();

                if (playingFadeTimerRef.current) clearInterval(playingFadeTimerRef.current);
                playingFadeTimerRef.current = setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    playingLobbyPlayer.volume = progress * targetVolume;
                    if (progress >= 1) {
                        if (playingFadeTimerRef.current) clearInterval(playingFadeTimerRef.current);
                        playingFadeTimerRef.current = null;
                    }
                }, 16);
            }
        } else {
            if (playingFadeTimerRef.current) {
                clearInterval(playingFadeTimerRef.current);
                playingFadeTimerRef.current = null;
            }
            if (playingLobbyPlayer.playing) playingLobbyPlayer.pause();
        }
    }, [playingLobbyPlayer, isPlayingLobbyBgmEnabled, isSoundEnabled]);

    // ── GAME OVER LOBBY MUSIC ─────────────────────────────────────────────────
    useEffect(() => {
        if (!gameOverLobbyPlayer) return;
        gameOverLobbyPlayer.loop = true;


        if (isGameOverBgmEnabled && isSoundEnabled && isHydrated) {
            if (!gameOverLobbyPlayer.playing) {
                gameOverLobbyPlayer.playbackSpeed = 1.0;
                gameOverLobbyPlayer.volume = 0;
                gameOverLobbyPlayer.play();
                
                const targetVolume = 0.25;
                const duration = 1500;
                const startTime = Date.now();

                if (gameOverFadeTimerRef.current) clearInterval(gameOverFadeTimerRef.current);
                gameOverFadeTimerRef.current = setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    gameOverLobbyPlayer.volume = progress * targetVolume;
                    if (progress >= 1) {
                        if (gameOverFadeTimerRef.current) clearInterval(gameOverFadeTimerRef.current);
                        gameOverFadeTimerRef.current = null;
                    }
                }, 16);
            }
        } else {
            if (gameOverFadeTimerRef.current) {
                clearInterval(gameOverFadeTimerRef.current);
                gameOverFadeTimerRef.current = null;
            }
            if (gameOverLobbyPlayer.playing) gameOverLobbyPlayer.pause();
        }
    }, [gameOverLobbyPlayer, isGameOverBgmEnabled, isSoundEnabled]);

    return null;
};
