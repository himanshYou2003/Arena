import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useFonts } from 'expo-font';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { BackgroundMusic } from '@/components/BackgroundMusic';
import { AudioProvider } from '@/context/AudioContext';

// Pre-define asset paths for root loading
const BGM_PATH = require('../assets/sounds/bgm.mp3');
const COUNTDOWN_SOUND = require("../assets/sounds/countdown_simple.mp3");
const DODGE_SOUND = require("../assets/sounds/dodge_simple.mp3");
const LEVELUP_SOUND = require("../assets/sounds/levelup_simple.mp3");
const GAMEOVER_SOUND = require("../assets/sounds/gameover_simple.mp3");
const GAMEOVER_LOBBY_PATH = require("../assets/sounds/gameover_lobby.mp3");
const PLAYING_LOBBY_PATH = require("../assets/sounds/playing_Lobby.mp3");
const THUNDER_STRIKE_SOUND = require("../assets/sounds/ThunderStrick.wav");
const SILENT_SOUND = require("../assets/sounds/silent.mp3");

// Audio mode is initialized safely inside RootLayout's useEffect below.

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // 1. HARDWARE SESSION INITIALIZATION (Inside Component for React 19 / New Arch Safety)
  useEffect(() => {
    async function initAudio() {
      try {
        console.log("[Root] Initializing Audio Session...");
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
        console.log("[Root] Audio Session Ready");
      } catch (err) {
        console.warn("[Root] Audio session error:", err);
      }
    }
    initAudio();
  }, []);

  // Initialize players at the root for zero-latency pre-loading
  const bgmPlayer = useAudioPlayer(require('../assets/sounds/bgm.mp3'), { downloadFirst: true });
  const countdownPlayer = useAudioPlayer(require('../assets/sounds/countdown_simple.mp3'), { downloadFirst: true });
  const levelUpPlayer = useAudioPlayer(require('../assets/sounds/levelup_simple.mp3'), { downloadFirst: true });
  const gameOverPlayer = useAudioPlayer(require('../assets/sounds/gameover_simple.mp3'), { downloadFirst: true });
  const gameOverLobbyPlayer = useAudioPlayer(require('../assets/sounds/gameover_lobby.mp3'), { downloadFirst: true });
  const playingLobbyPlayer = useAudioPlayer(require('../assets/sounds/playing_Lobby.mp3'), { downloadFirst: true });
  const thunderStrikePlayer = useAudioPlayer(require('../assets/sounds/ThunderStrick.wav'), { downloadFirst: true });
  
  const d1 = useAudioPlayer(require('../assets/sounds/dodge_simple.mp3'));
  const d2 = useAudioPlayer(require('../assets/sounds/dodge_simple.mp3'));
  const d3 = useAudioPlayer(require('../assets/sounds/dodge_simple.mp3'));
  const dodgePool = [d1, d2, d3];

  const [fontsLoaded] = useFonts({
    Orbitron: require("../assets/Orbitron[wght].ttf"),
  });

  if (!fontsLoaded) return null;

  return (
    <AudioProvider 
      bgmPlayer={bgmPlayer} 
      countdownPlayer={countdownPlayer}
      dodgePool={dodgePool}
      levelUpPlayer={levelUpPlayer}
      gameOverPlayer={gameOverPlayer}
      gameOverLobbyPlayer={gameOverLobbyPlayer}
      playingLobbyPlayer={playingLobbyPlayer}
      thunderStrikePlayer={thunderStrikePlayer}
    >
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
        <BackgroundMusic />
      </ThemeProvider>
    </AudioProvider>
  );
}
