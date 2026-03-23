import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUND_ENABLED_KEY = "arena_sound_enabled_v1";

interface AudioContextType {
  isBgmEnabled: boolean;
  setIsBgmEnabled: (enabled: boolean) => void;
  isGameOverBgmEnabled: boolean;
  setIsGameOverBgmEnabled: (enabled: boolean) => void;
  isSoundEnabled: boolean;
  setIsSoundEnabled: (enabled: boolean) => void;
  // Hold references to pre-loaded players for zero-latency access
  bgmPlayer?: any;
  countdownPlayer?: any;
  dodgePool?: any[];
  levelUpPlayer?: any;
  gameOverPlayer?: any;
  gameOverLobbyPlayer?: any;
  gameState: string;
  setGameState: (state: string) => void;
  playSfx: (player: any, volume?: number, force?: boolean) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ 
  children: ReactNode;
  bgmPlayer?: any;
  countdownPlayer?: any;
  dodgePool?: any[];
  levelUpPlayer?: any;
  gameOverPlayer?: any;
  gameOverLobbyPlayer?: any;
}> = ({ children, bgmPlayer, countdownPlayer, dodgePool, levelUpPlayer, gameOverPlayer, gameOverLobbyPlayer }) => {
  const [isBgmEnabled, setIsBgmEnabled] = useState(true);
  const [isGameOverBgmEnabled, setIsGameOverBgmEnabled] = useState(false);
  const [isSoundEnabled, setIsSoundEnabledState] = useState(true);
  const [gameState, setGameState] = useState("menu");

  // Load sound preference on mount
  useEffect(() => {
    AsyncStorage.getItem(SOUND_ENABLED_KEY).then(val => {
      if (val !== null) {
        setIsSoundEnabledState(val === "true");
      }
    }).catch(() => {});
  }, []);

  const setIsSoundEnabled = (enabled: boolean) => {
    setIsSoundEnabledState(enabled);
    AsyncStorage.setItem(SOUND_ENABLED_KEY, enabled ? "true" : "false").catch(() => {});
  };

  /**
   * Centralized robust SFX player with zero-latency logic
   */
  const playSfx = React.useCallback((player: any, volume: number = 1.0, force: boolean = false) => {
    if (!player) {
      console.log("[AudioContext] playSfx Rejected: player is null");
      return;
    }
    
    if (!isSoundEnabled && !force) {
      console.log("[AudioContext] playSfx Muted: isSoundEnabled is false");
      return;
    }

    try {
      // Set volume before play for instant effect
      if (player.volume !== volume) player.volume = volume;
      
      // OPTIMIZATION: On many Android systems, seekTo(0) adds 20-40ms of buffering latency.
      // We only seek if the player isn't already at the start.
      if (player.currentTime > 0) {
        player.seekTo(0);
      }
      player.play();
    } catch (e) {
      console.warn("[AudioContext] SFX Playback Error:", e);
    }
  }, [isSoundEnabled]);

  return (
    <AudioContext.Provider value={{ 
      isBgmEnabled, 
      setIsBgmEnabled,
      isGameOverBgmEnabled,
      setIsGameOverBgmEnabled,
      isSoundEnabled,
      setIsSoundEnabled,
      bgmPlayer,
      countdownPlayer,
      dodgePool,
      levelUpPlayer,
      gameOverPlayer,
      gameOverLobbyPlayer,
      gameState,
      setGameState,
      playSfx
    }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
