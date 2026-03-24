import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as React from "react";
import { useAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useAudio } from "@/context/AudioContext"; 

/**
 * ARENA – Advanced Cyber-HUD Edition
 * Copyright (c) 2026. All rights reserved.
 */

const { width, height } = Dimensions.get("window");

const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;
const scale = (size: number) => (width / BASE_WIDTH) * size;
const verticalScale = (size: number) => (height / BASE_HEIGHT) * size;
const moderateScale = (size: number, factor = 0.5) => size + (scale(size) - size) * factor;

const PLAYER_SIZE = moderateScale(40);
const ENEMY_SIZE = moderateScale(20);
const PROFILES_KEY = "arena_profiles_v5";
const LAST_PLAYER_KEY = "arena_last_player_v5";
const HISTORY_KEY = "arena_history_v1";
const LB_KEY = "arena_leaderboard_v4";
const HS_KEY = "arena_high_score_v4";
const TUT_KEY = "arena_tutorial_v4";
const MAX_LB = 10;
const DOWNLOAD_URL = "https://play.google.com/store/apps/details?id=com.himanshyou.arena"; // Play Store link placeholder

interface PlayerProfile {
  name: string;
  bestScore: number;
  bestWave: number;
  timestamp: number;
  gamesPlayed: number;
  totalXp: number;
  currentSkin: string;
}
interface GameRecord {
  name: string;
  score: number;
  wave: number;
  timestamp: number;
}
type Profiles = Record<string, PlayerProfile>;

// ─── WAVE TUNING ─────────────────────────────────────────────────────────────
const WAVE_SIZE = 100;
const WAVE1_START = 1.2;
const WAVE1_PEAK = 3.8;
const WAVE_PEAK_STEP = 2.5;
const RESET_FACTOR = 0.6;
const SCORE_TICK_MS = 500;
const BASE_SPAWN_RATE = 2200; // Moderated from 1400 for a smoother start
const SPAWN_RATE_STEP = 150;  // Gradual scaling
const MIN_SPAWN_RATE = 800;   // Tactical floor (approx 2 enemies per second)
const MAX_ENEMIES = 30;       // Balanced buffer for mobile performance

function getEnemySpeed(score: number): number {
  const waveIndex = Math.floor(score / WAVE_SIZE);
  const progress = (score % WAVE_SIZE) / WAVE_SIZE;
  const wavePeak = WAVE1_PEAK + waveIndex * WAVE_PEAK_STEP;
  const prevPeak = WAVE1_PEAK + (waveIndex - 1) * WAVE_PEAK_STEP;
  const waveStart = waveIndex === 0 ? WAVE1_START : prevPeak * RESET_FACTOR;
  return waveStart + (wavePeak - waveStart) * progress;
}
function getSpawnRate(score: number): number {
  const waveIndex = Math.floor(score / WAVE_SIZE);
  // Gradually decrease spawn rate, capping at MIN_SPAWN_RATE
  // Each wave reduces spawn rate by ~20ms, reaching minimum around wave 70.
  return Math.max(
    BASE_SPAWN_RATE - waveIndex * SPAWN_RATE_STEP,
    MIN_SPAWN_RATE,
  );
}

// ─── TUTORIAL STEPS ──────────────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    icon: "◈",
    iconColor: "#D3B07A",
    tag: "COCKPIT CONTROL",
    title: "PILOT COMMAND",
    body: "Slide your finger anywhere on the screen. Your unit follows your movement with zero-latency response.",
    hint: "Your unit stays under your finger ↓",
  },
  {
    icon: "◉",
    iconColor: "#FF0042",
    tag: "THREAT ANALYSIS",
    title: "AVOID HOSTILES",
    body: "RED dots are standard hostiles. YELLOW dots are specialized Snipers—they move 50% faster than normal units.",
    hint: "Velocity is your only armor.",
  },
  {
    icon: "⚡",
    iconColor: "#D3B07A",
    tag: "REFLEX BOOST",
    title: "DODGE & MULTIPLY",
    body: "Enter the Danger Zone (near hostiles) to trigger a Dodge. Multiplier stacks to 10x, but resets to 1x after 3s of safety.",
    hint: "Aggression is the key to 10k+ scores.",
  },
  {
    icon: "⬡",
    iconColor: "#00E5FF",
    tag: "THUNDER PROTOCOL",
    title: "ENERGY OVERLOAD",
    body: "Collecting Shields provides protection. If hit, you only lose ONE charge. Collect 5 to trigger a screen-wide Thunder Strike.",
    hint: "Shields stack to clear the arena.",
  },
  {
    icon: "◇",
    iconColor: "#FFD700",
    tag: "PILOT CAREER",
    title: "WAVES & SAFETY",
    body: "Every 100 points trigger a New Wave. New waves reset enemy speed by 40% for a brief recovery window.",
    hint: "Watch for Boss Alerts at Sector 5, 15...",
  },
  {
    icon: "🚀",
    iconColor: "#D3B07A",
    tag: "PILOT HANGAR",
    title: "FLEET UPGRADES",
    body: "Earn XP by achieving high scores and long survivals. Unlock 10 unique ship classes in the Hangar, each with specialized tactical powers.",
    hint: "Reach 10,000,000 XP for the Omega Protocol.",
  },
];

let _tutorialSeenThisSession = false;
interface Entity {
  id: number;
  x: number;
  y: number;
  type?: "enemy" | "shield";
  nearMissTriggered?: boolean;
  isSniper?: boolean;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const SKINS = [
  { id: "default", color: "#D3B07A", name: "COBALT-GOLD", power: "Standard", desc: "Standard issue Pilot Core. No active powers." },
  { id: "neon", color: "#FFD700", name: "NEON-GOLD", xpRequired: 10000, power: "Precision", desc: "Improved movement precision and minimized responsiveness delay." },
  { id: "ruby", color: "#FF1493", name: "PLASMA-PINK", xpRequired: 50000, power: "Rage Engine", desc: "Reflex Boost ceiling increased. Multiplier cap is now 12x." },
  { id: "emerald", color: "#00FF42", name: "TOXIC-GREEN", xpRequired: 150000, power: "Phase Shift", desc: "Ghost-mode enabled. Become invulnerable for 0.5s every 20 dodges." },
  { id: "amethyst", color: "#BF40BF", name: "AMETHYST-PURPLE", xpRequired: 500000, power: "Storm Cell", desc: "Thunder Strikes trigger twice in a rapid double-burst cycle." },
  { id: "carbon", color: "#4A4A4A", name: "CARBON-GREY", xpRequired: 1000000, power: "Reflex Dilation", desc: "Triggers a brief slo-mo effect when narrowly avoiding hostiles." },
  { id: "nova", color: "#FFA500", name: "SOL-ORANGE", xpRequired: 2500000, power: "Magnetar", desc: "Shields are magnetically pulled toward you from significant distances." },
  { id: "chrome", color: "#E8E8E8", name: "CHROME-WHITE", xpRequired: 5000000, power: "Sonic Trail", desc: "Moving at high velocity creates a wake that destroys enemies." },
  { id: "obsidian", color: "#1A1A1A", name: "OBSIDIAN-BLACK", xpRequired: 7500000, power: "Void Pulse", desc: "Automatic screen-wide EMP burst triggers every 500 session points." },
  { id: "prism", color: "#FF00FF", name: "PRISMATIC-VOID", xpRequired: 10000000, power: "Omega Protocol", desc: "Multipliers never reset. Start every sector with 3 Shields." },
];

export default function ArenaGame() {
  const [fontsLoaded] = useFonts({
    Orbitron: require("../../assets/Orbitron[wght].ttf"),
    Centralwell: require("../../assets/Centralwell.ttf"),
  });
  const { 
    isBgmEnabled, 
    setIsBgmEnabled, 
    bgmPlayer,
    countdownPlayer, 
    levelUpPlayer, 
    gameOverPlayer,
    thunderStrikePlayer,
    isGameOverBgmEnabled,
    setIsGameOverBgmEnabled,
    setIsPlayingLobbyBgmEnabled,
    isSoundEnabled, 
    setIsSoundEnabled,
    gameState,
    setGameState,
    dodgePool,
    gameOverLobbyPlayer,
    playSfx
  } = useAudio();
  const dodgeIndex = useRef(0);
  const [score, setScore] = useState(0);
  const [waveNumber, setWaveNumber] = useState(1);
  const [countdown, setCountdown] = useState(3);
  const [isStarting, setIsStarting] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const multiplierRef = useRef(1);
  const lastDodgeTime = useRef(0);
  const multiplierPulse = useRef(new Animated.Value(1)).current;
  const dodgeShockwave = useRef(new Animated.Value(0)).current;
  const dodgeShockPos = useRef({ x: 0, y: 0 });
  const powerups = useRef<Entity[]>([]);
  const lastPowerupSpawn = useRef(0);
  const thunderPulse = useRef(new Animated.Value(0)).current;
  // Leaderboard & Profiles
  const [profiles, setProfiles] = useState<Profiles>({});
  const [currentPlayer, setCurrentPlayer] = useState("PLAYER1");
  const currentPlayerRef = useRef(currentPlayer);
  useEffect(() => { currentPlayerRef.current = currentPlayer; }, [currentPlayer]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [lbTab, setLbTab] = useState<"top" | "recent">("top");
  const tabSlideAnim = useRef(new Animated.Value(0)).current;
  
  // Name Hint (First-time user discovery)
  const [showNameHint, setShowNameHint] = useState(false);
  const nameHintAnim = useRef(new Animated.Value(0)).current;
  const NAME_HINT_KEY = "arena_name_hint_seen_v1";
  
  // Advanced Skin Power (Logic Refs for 60fps accuracy)
  const dodgeCountRef = useRef(0);
  const isInvulnerableRef = useRef(false);
  const isSloMoRef = useRef(false);
  const lastVoidPulseRef = useRef(0);
  // ── GAME-LOOP REF MIRRORS (prevent RAF restarts on frequent state changes) ──
  const hasShieldRef = useRef(false);
  const thunderChargeRef = useRef(0);
  const currentSkinRef = useRef("default");
  useEffect(() => { currentSkinRef.current = profiles[currentPlayer]?.currentSkin || "default"; }, [profiles, currentPlayer]);
  const isSoundEnabledRef = useRef(true);
  useEffect(() => { isSoundEnabledRef.current = isSoundEnabled; }, [isSoundEnabled]);
  
  const [showHangar, setShowHangar] = useState(false);

  useEffect(() => {
    Animated.spring(tabSlideAnim, {
      toValue: lbTab === "top" ? 0 : 1,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();
  }, [lbTab, tabSlideAnim]);

  const [history, setHistory] = useState<GameRecord[]>([]);

  const highScore = profiles[currentPlayer]?.bestScore || 0;
  
  // ── INIT: Check Name Hint Seen ─────────────────────────────────────────────
  useEffect(() => {
    const checkHint = async () => {
      try {
        const value = await AsyncStorage.getItem(NAME_HINT_KEY);
        if (value === null) {
          setShowNameHint(true);
        }
      } catch (e) {
        console.warn("Hint storage error:", e);
      }
    };
    checkHint();
  }, []);

  // ── ANIM: Name Hint Blinking Loop ─────────────────────────────────────────
  useEffect(() => {
    if (showNameHint) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(nameHintAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(nameHintAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [showNameHint]);
  const pendingScore = useRef(0);
  const pendingWave = useRef(0);
  const lastCommittedName = useRef("");

  const pendingStart = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<number | null>(null);
  const panResponderStart = useRef({ x: width / 2, y: height / 2 });

  // LOGIC STATE
  const stateRef = useRef(gameState);
  const playerPos = useRef({ x: width / 2, y: height / 2 });
  const enemies = useRef<Entity[]>([]);
  const lastSpawnTime = useRef(0);
  const lastScoreTick = useRef(0);
  const nextId = useRef(0);
  const currentScore = useRef(0);
  const lastWave = useRef(0);
  const minDist = useRef(9999);

  // ANIMATED VALUES
  const playerAnimX = useRef(
    new Animated.Value(width / 2 - PLAYER_SIZE / 2),
  ).current;
  const playerAnimY = useRef(
    new Animated.Value(height / 2 - PLAYER_SIZE / 2),
  ).current;
  const menuFade = useRef(new Animated.Value(1)).current;
  const uiPulse = useRef(new Animated.Value(0)).current;
  // Screen shake
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeY = useRef(new Animated.Value(0)).current;
  // Countdown animation
  const cdScale = useRef(new Animated.Value(1.4)).current;
  const cdOpacity = useRef(new Animated.Value(0)).current;
  // Tutorial
  const tutCardFade = useRef(new Animated.Value(0)).current;
  const tutCardSlide = useRef(new Animated.Value(40)).current;
  // Demo finger animation
  const fingerX = useRef(new Animated.Value(width * 0.35)).current;
  const fingerY = useRef(new Animated.Value(height * 0.55)).current;
  const fingerScale = useRef(new Animated.Value(1)).current;
  // Wave flash
  const waveFlashOpacity = useRef(new Animated.Value(0)).current;
  const waveFlashScale = useRef(new Animated.Value(0.7)).current;
  const waveFlashLabel = useRef("WAVE 1");

  const [, setFrame] = useState(0);

  // Throttle React re-render pressure:
  // - Game physics runs every RAF tick
  // - UI (enemies/powerups transforms + JSX) only re-renders at a fixed rate
  // This prevents `enemies.current.map(...)` from running 60fps on the JS thread.
  const lastRenderMsRef = useRef<number>(0);

  // ── GLOBAL CONFIG ─────────────────────────────────────────────────────────

  useEffect(() => {
    // Removed debug log for state transition
    stateRef.current = gameState;
    if (gameState === "menu") {
      setIsBgmEnabled(true);
    } else if (gameState === "countdown" || gameState === "playing" || gameState === "gameover") {
      setIsBgmEnabled(false);
    }
  }, [gameState, setIsBgmEnabled, isBgmEnabled]);

  // ── LOAD PROFILES + CURRENT PLAYER on mount ───────────────────────────────────
  useEffect(() => {
    AsyncStorage.multiGet([PROFILES_KEY, LAST_PLAYER_KEY, LB_KEY, HS_KEY, TUT_KEY, HISTORY_KEY])
      .then(([[, profs], [, player], [, lb], [, hs], [, tut], [, hist]]) => {
        if (tut) _tutorialSeenThisSession = true;
        let loadedProfiles: Profiles = {};
        let loadedPlayer = player || "PLAYER1";
        let didMigrate = false;

        if (hist) setHistory(JSON.parse(hist));

        if (profs) {
          loadedProfiles = JSON.parse(profs);
        } else if (lb || hs) {
          if (lb) {
            const parsed = JSON.parse(lb);
            parsed.forEach((e: any) => {
              if(!loadedProfiles[e.name]) {
                loadedProfiles[e.name] = { name: e.name, bestScore: e.score, bestWave: e.wave, timestamp: e.timestamp, gamesPlayed: 1, totalXp: 0, currentSkin: "default" };
              }
            });
          }
          if (hs && !loadedProfiles["YOU"]) {
             loadedProfiles["YOU"] = { name: "YOU", bestScore: parseInt(hs, 10), bestWave: 1, timestamp: Date.now(), gamesPlayed: 1, totalXp: 0, currentSkin: "default" };
          }
          didMigrate = true;
        }

        setProfiles(loadedProfiles);
        setCurrentPlayer(loadedPlayer);
        if (didMigrate) AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(loadedProfiles)).catch(() => {});
      })
      .catch(() => {});
  }, []);

  // ── PERSISTENCE HOOKS ────────────────────────────────────────────────────────
  useEffect(() => {
    if (Object.keys(profiles).length > 0) {
      AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)).catch(() => {});
    }
  }, [profiles]);

  useEffect(() => {
    if (history.length > 0) {
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {});
    }
  }, [history]);

  // ── PROFILE SAVE HELPER ───────────────────────────────────────────────────────
  const commitScore = useCallback((name: string, curScore: number, curWave: number, isRename: boolean = false) => {
    const pName = name.trim().toUpperCase() || "UNKNOWN";
    
    setHistory((prev) => {
      let updatedHist = [...prev];
      if (isRename && updatedHist.length > 0) {
        updatedHist[0] = { ...updatedHist[0], name: pName };
      } else {
        const newRecord: GameRecord = { name: pName, score: curScore, wave: curWave, timestamp: Date.now() };
        updatedHist = [newRecord, ...updatedHist].slice(0, 30); // FIFO 30 max
      }
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHist)).catch(() => {});
      return updatedHist;
    });

    setProfiles((prev) => {
      const prof = prev[pName] || { name: pName, bestScore: 0, bestWave: 1, timestamp: Date.now(), gamesPlayed: 0, totalXp: 0, currentSkin: "default" };
      const isBest = curScore > prof.bestScore;
      
      const earnedXp = curScore + (curWave * curWave * 10);
      const newXp = (prof.totalXp || 0) + (isRename ? 0 : earnedXp);

      const updated = {
        ...prev,
        [pName]: {
          ...prof,
          name: pName,
          bestScore: isBest ? curScore : prof.bestScore,
          bestWave: isBest ? curWave : prof.bestWave,
          timestamp: isBest ? Date.now() : prof.timestamp,
          gamesPlayed: isRename ? prof.gamesPlayed : prof.gamesPlayed + 1,
          totalXp: newXp,
        }
      };

      const entries = Object.values(updated).sort((a,b) => b.bestScore - a.bestScore);
      if (entries.length > 30) {
        const newDict: Record<string, PlayerProfile> = {};
        entries.slice(0, 30).forEach(p => newDict[p.name] = p);
        return newDict;
      }
      return updated;
    });
    if (!isRename) {
      AsyncStorage.setItem(LAST_PLAYER_KEY, pName).catch(() => {});
    }
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(uiPulse, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(uiPulse, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ]),
    ).start();
  }, [uiPulse]);

  // ── TUTORIAL ANIMATIONS ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showTutorial) return;
    tutCardFade.setValue(0);
    tutCardSlide.setValue(40);
    Animated.parallel([
      Animated.timing(tutCardFade, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(tutCardSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 10,
      }),
    ]).start();
  }, [tutorialStep, showTutorial, tutCardFade, tutCardSlide]);

  useEffect(() => {
    if (!showTutorial || tutorialStep !== 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fingerScale, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(fingerX, {
            toValue: width * 0.6,
            duration: 900,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.quad),
          }),
          Animated.timing(fingerY, {
            toValue: height * 0.45,
            duration: 900,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.quad),
          }),
        ]),
        Animated.delay(200),
        Animated.timing(fingerScale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(fingerX, {
            toValue: width * 0.35,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(fingerY, {
            toValue: height * 0.55,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showTutorial, tutorialStep, fingerScale, fingerX, fingerY]);

  // ── SCREEN SHAKE ─────────────────────────────────────────────────────────────
  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(shakeX, {
          toValue: 18,
          duration: 55,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
        Animated.timing(shakeY, {
          toValue: -10,
          duration: 55,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
      ]),
      Animated.parallel([
        Animated.timing(shakeX, {
          toValue: -18,
          duration: 55,
          useNativeDriver: true,
        }),
        Animated.timing(shakeY, {
          toValue: 10,
          duration: 55,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(shakeX, {
          toValue: 10,
          duration: 45,
          useNativeDriver: true,
        }),
        Animated.timing(shakeY, {
          toValue: -6,
          duration: 45,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(shakeX, {
          toValue: -10,
          duration: 45,
          useNativeDriver: true,
        }),
        Animated.timing(shakeY, {
          toValue: 6,
          duration: 45,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(shakeX, {
          toValue: 0,
          duration: 40,
          useNativeDriver: true,
        }),
        Animated.timing(shakeY, {
          toValue: 0,
          duration: 40,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [shakeX, shakeY]);

  // ── WAVE FLASH ───────────────────────────────────────────────────────────────
  const triggerWaveFlash = useCallback(
    (customLabel?: string) => {
      if (customLabel) {
        waveFlashLabel.current = customLabel;
      }
      waveFlashOpacity.setValue(0);
      waveFlashScale.setValue(0.7);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(waveFlashOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.spring(waveFlashScale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 200,
            friction: 8,
          }),
        ]),
        Animated.delay(600),
        Animated.timing(waveFlashOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [waveFlashOpacity, waveFlashScale],
  );

  // ── TUTORIAL ─────────────────────────────────────────────────────────────────
  const openTutorial = () => {
    Haptics.selectionAsync();
    setTutorialStep(0);
    setShowTutorial(true);
  };
  const closeTutorial = () => {
    _tutorialSeenThisSession = true;
    AsyncStorage.setItem(TUT_KEY, "true").catch(() => {});
    Animated.timing(tutCardFade, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setShowTutorial(false);
      if (pendingStart.current) {
        pendingStart.current = false;
        _doStartGame();
      }
    });
  };
  const nextTutorialStep = () => {
    Haptics.selectionAsync();
    if (tutorialStep < TUTORIAL_STEPS.length - 1) {
      setTutorialStep((s) => s + 1);
    } else {
      closeTutorial();
    }
  };

  // ── COUNTDOWN ─────────────────────────────────────────────────────────────────
  const animateCountdownTick = useCallback(
    (value: number) => {
      cdScale.setValue(1.4);
      cdOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(cdScale, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(cdOpacity, {
          toValue: value === 0 ? 1 : 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [cdScale, cdOpacity],
  );

  // ── COUNTDOWN EFFECT ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (gameState !== "countdown") return;

    const runTick = () => {
      setCountdown((prev) => {
        const next = prev - 1;
        if (next > 0) {
          animateCountdownTick(next);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Removed playSfx call here to prevent repetition (Sound file contains full 3-2-1-GO sequence)
          countdownRef.current = setTimeout(runTick, 1000);
          return next;
        } else if (next === 0) {
          // "GO!" state
          animateCountdownTick(0);
          cdScale.setValue(0.6);
          cdOpacity.setValue(1);
          Animated.spring(cdScale, {
            toValue: 1.1,
            useNativeDriver: true,
            tension: 200,
            friction: 6,
          }).start();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          countdownRef.current = setTimeout(runTick, 550);
          return 0;
        } else {
          // End of countdown
          countdownRef.current = null;
          // Reset game world
          playerPos.current = { x: width / 2, y: height / 2 };
          enemies.current = [];
          powerups.current = [];
          nextId.current = 0;
          currentScore.current = 0;
          lastWave.current = 0; // ← CRITICAL: reset between games so wave detection starts from 0
          
          // Side-effects outside of render loop
          setTimeout(() => {
            // UI shield indicator is ref-driven for performance
            hasShieldRef.current = false;
            setScore(0);
            setWaveNumber(1);
            playerAnimX.setValue(width / 2 - PLAYER_SIZE / 2);
            playerAnimY.setValue(height / 2 - PLAYER_SIZE / 2);
            setGameState("playing");
            setIsStarting(false);
            
            // --- WAVE 1 START SIGNAL: always plays, bypasses sound toggle ---
            if (levelUpPlayer) { levelUpPlayer.currentTime > 0 && levelUpPlayer.seekTo(0); levelUpPlayer.play(); }
          }, 0);
          
          return 0;
        }
      });
    };

    countdownRef.current = setTimeout(runTick, 1000);

    return () => {
      if (countdownRef.current) {
        clearTimeout(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [
    gameState,
    animateCountdownTick,
    cdScale,
    cdOpacity,
    playerAnimX,
    playerAnimY,
  ]);

  // ──────────────────────────────────────────────────────────────────────────────

  const _doStartGame = () => {
    if (isStarting) {
      console.log("[Audio] Game start BLOCKED by isStarting guard. Safety resetting in 5s.");
      setTimeout(() => setIsStarting(false), 5000);
      return;
    }
    setIsStarting(true);
    
    menuFade.setValue(0);
    setCountdown(3);
    setGameState("countdown");
    setIsBgmEnabled(false);
    setIsGameOverBgmEnabled(false);
    setIsPlayingLobbyBgmEnabled(false);

    // Play countdown sound
    playSfx(countdownPlayer, 0.4);

    animateCountdownTick(3);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // --- RESET ALL GAME STATE (PROPER NEW SESSION) ---
    thunderPulse.setValue(0);
    lastPowerupSpawn.current = Date.now();
    
    // Reset Wave Flash UI
    waveFlashOpacity.setValue(0);
    waveFlashScale.setValue(0.7);
    waveFlashLabel.current = "WAVE 1";
    
    // Reset Multiplier
    multiplierRef.current = 1;
    multiplierPulse.setValue(1);
    
    // Reset Advanced Power State
    dodgeCountRef.current = 0;
    isInvulnerableRef.current = false;
    isSloMoRef.current = false;
    lastVoidPulseRef.current = 0;
    lastDodgeTime.current = 0;
    
    // Reset Protection
    const currentSkin = (profiles[currentPlayer]?.currentSkin || "default");
    if (currentSkin === "prism") {
      hasShieldRef.current = true;
      thunderChargeRef.current = 3;
    } else {
      hasShieldRef.current = false;
      thunderChargeRef.current = 0;
    }
    // ------------------------------------------------
  };

  const startGame = () => {
    Haptics.selectionAsync();
    if (!_tutorialSeenThisSession) {
      pendingStart.current = true;
      setTutorialStep(0);
      setShowTutorial(true);
    } else {
      _doStartGame();
    }
  };

  // ── MAIN GAME LOOP ────────────────────────────────────────────────────────────
  const update = useCallback(() => {
    if (stateRef.current !== "playing") return;
    const now = Date.now();

    if (now - lastScoreTick.current > SCORE_TICK_MS) {
      const currentSkin = currentSkinRef.current;
      // OMEGA: No multiplier reset
      if (multiplierRef.current > 1 && now - lastDodgeTime.current > 3000 && currentSkin !== "prism") {
        multiplierRef.current = 1;
      }
      
      // VOID PULSE: Screen clear every 500 pts (Fixed Phase 55 threshold logic)
      if (currentSkin === "obsidian" && currentScore.current >= lastVoidPulseRef.current + 500) {
         lastVoidPulseRef.current += 500;
         // lastVoidPulse is ref-driven; no UI state update needed
         enemies.current = [];
         Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
         triggerWaveFlash("VOID PULSE");
      }

      currentScore.current += 1 * multiplierRef.current;
      lastScoreTick.current = now;
      const newWaveIdx = Math.floor(currentScore.current / WAVE_SIZE);
      if (newWaveIdx > lastWave.current) {
        lastWave.current = newWaveIdx;
        if (levelUpPlayer) { if (levelUpPlayer.currentTime > 0) levelUpPlayer.seekTo(0); levelUpPlayer.play(); }
        const displayWave = newWaveIdx + 1;
        setWaveNumber(displayWave);
        triggerWaveFlash(`WAVE ${displayWave}`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setScore(currentScore.current);
    }

    const spawnRate = getSpawnRate(currentScore.current);
    const waveIdx = Math.floor(currentScore.current / WAVE_SIZE) + 1;
    const isBossWave = waveIdx % 5 === 0;

    if (now - lastSpawnTime.current > (isBossWave ? spawnRate / 2 : spawnRate)) {
      const side = Math.floor(Math.random() * 4);
      let x = 0, y = 0;
      if (isBossWave) {
        for (let i = 0; i < 3; i++) {
          enemies.current.push({ id: nextId.current++, x: Math.random() * width, y: -ENEMY_SIZE, nearMissTriggered: false });
        }
      } else {
        // --- SNIPER SPAWN LOGIC (Phase 46) ---
        // Snipers (Yellow dots) move 1.5x faster. 
        // Start appearing from Wave 6 with increasing probability.
        const isSniper = waveIdx >= 6 && Math.random() < Math.min(0.1 + (waveIdx - 6) * 0.05, 0.4);
        
        if (side === 0) { x = Math.random() * width; y = -ENEMY_SIZE; }
        else if (side === 1) { x = width + ENEMY_SIZE; y = Math.random() * height; }
        else if (side === 2) { x = Math.random() * width; y = height + ENEMY_SIZE; }
        else { x = -ENEMY_SIZE; y = Math.random() * height; }
        
        enemies.current.push({ id: nextId.current++, x, y, nearMissTriggered: false, isSniper });
      }
      if (enemies.current.length > MAX_ENEMIES) enemies.current.shift();
      lastSpawnTime.current = now;
    }

    if (now - lastPowerupSpawn.current > 15000 && Math.random() < 0.2) {
      powerups.current.push({ 
        id: nextId.current++, 
        x: Math.random() * (width - 60) + 30, 
        y: Math.random() * (height - 60) + 30,
        type: "shield" as const
      });
      lastPowerupSpawn.current = now;
    }

    const speed = getEnemySpeed(currentScore.current);
    let collision = false;
    let closestDistSq = 99999999;
    const skinId = currentSkinRef.current;
    const px = playerPos.current.x, py = playerPos.current.y;
    
    // NEON PRECISION: Smaller hitbox (22px) + Wider Dodge Margin (+70px)
    const effectivePlayerSize = skinId === "neon" ? 22 : PLAYER_SIZE;
    const collisionRadiusSq = Math.pow((effectivePlayerSize + ENEMY_SIZE) / 2, 2);
    const dodgeMarginSq = Math.pow(((effectivePlayerSize + ENEMY_SIZE) / 2 + (skinId === "neon" ? 70 : 50)), 2); 

    for (let i = 0; i < enemies.current.length; i++) {
      const e = enemies.current[i];
      const dx = px - e.x, dy = py - e.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < closestDistSq) closestDistSq = dSq;
      
      // Optimization: use dSq directly for collision/dodge margin to avoid redundant Math.sqrt
      if (dSq < dodgeMarginSq && !collision && !e.nearMissTriggered) {
        
        // PHASE SHIFT: Invulnerability every 20 dodges (Fixed Phase 55 Ref Logic)
        if (skinId === "emerald") {
          dodgeCountRef.current += 1;
          if (dodgeCountRef.current % 20 === 0) {
            isInvulnerableRef.current = true;
            setTimeout(() => {
              isInvulnerableRef.current = false;
            }, 500);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
        }

        // SLO-MO: Reflex Dilation (Fixed Phase 55 Ref Logic)
        if (skinId === "carbon") {
           isSloMoRef.current = true;
           setTimeout(() => {
             isSloMoRef.current = false;
           }, 400);
        }

        // --- PRIORITY DODGE SFX (Single Player Test) ---
        if (dodgePool && dodgePool.length > 0) {
          const p = dodgePool[dodgeIndex.current];
          if (p) {
            playSfx(p, 1.0, true); // Force play even if sound is off
          }
          dodgeIndex.current = (dodgeIndex.current + 1) % dodgePool.length;
        }
        
        e.nearMissTriggered = true;
        lastDodgeTime.current = Date.now();
        
        // RAGE ENGINE: 12x Cap
        const maxMult = skinId === "ruby" ? 12 : 10;
        multiplierRef.current = Math.min(multiplierRef.current + 1, maxMult);
        
        multiplierPulse.setValue(1.5);
        Animated.spring(multiplierPulse, { toValue: 1, friction: 4, useNativeDriver: true }).start();
        
        // VISUAL FEEDBACK (Ripple)
        dodgeShockPos.current = { x: px, y: py };
        dodgeShockwave.setValue(0);
        Animated.timing(dodgeShockwave, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start();
      }

      // Optimization: Only use Math.sqrt when absolutely needed for normalization
      let d = 0;
      let enemySpeed = e.isSniper ? speed * 1.5 : speed;
      
      // SLO-MO Logic (Fixed Phase 55 Ref Accuracy)
      if (isSloMoRef.current) enemySpeed *= 0.4;

      if (dSq > 1) {
        d = Math.sqrt(dSq);
        e.x += (dx / d) * enemySpeed;
        e.y += (dy / d) * enemySpeed;
      }
      
      // SONIC TRAIL: Chrome Kill zone (within 45px while moving fast)
      // dSq < Math.pow(45, 2) => dSq < 2025
      if (skinId === "chrome" && dSq < 2025) {
         enemies.current.splice(i, 1);
         i--;
         continue;
      }

      if (dSq < collisionRadiusSq - 5) {
        // Fixed Phase 55 Ref Accuracy
        if (isInvulnerableRef.current) {
          enemies.current.splice(i, 1);
          i--;
          continue;
        }

        if (thunderChargeRef.current >= 5) {
          // --- THUNDER STRIKE! (Full Screen Clear) ---
          enemies.current = [];
          
          // STORM CELL: Double Clear
          if (skinId === "amethyst") {
             setTimeout(() => {
                enemies.current = [];
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
             }, 300);
          }
          
          thunderChargeRef.current = 0;
            hasShieldRef.current = false;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          // Flicker Strobe Effect (Lightning)
          thunderPulse.setValue(0);
          Animated.sequence([
            Animated.timing(thunderPulse, { toValue: 1, duration: 40, useNativeDriver: true }),
            Animated.timing(thunderPulse, { toValue: 0.2, duration: 40, useNativeDriver: true }),
            Animated.timing(thunderPulse, { toValue: 0.8, duration: 50, useNativeDriver: true }),
            Animated.timing(thunderPulse, { toValue: 0.1, duration: 50, useNativeDriver: true }),
            Animated.timing(thunderPulse, { toValue: 1, duration: 60, useNativeDriver: true }),
            Animated.timing(thunderPulse, { toValue: 0, duration: 800, useNativeDriver: true }),
          ]).start();
          
          shakeX.setValue(30);
          Animated.spring(shakeX, { toValue: 0, friction: 3, useNativeDriver: true }).start();
          
          // Thunder Strike sound — respects sound toggle via live ref
          if (isSoundEnabledRef.current && thunderStrikePlayer) {
            if (thunderStrikePlayer.currentTime > 0) thunderStrikePlayer.seekTo(0);
            thunderStrikePlayer.play();
          }
          
          continue;
        }
        
        if (hasShieldRef.current) {
          // --- FORGIVABLE SHIELD SYSTEM (Phase 45) ---
          const nextCharge = Math.max(0, thunderChargeRef.current - 1);
          thunderChargeRef.current = nextCharge;
          if (nextCharge === 0) {
            hasShieldRef.current = false;
          }
          
          enemies.current.splice(i, 1);
          i--;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          continue;
        }
        collision = true;
        break;
      }
    }
    minDist.current = Math.sqrt(closestDistSq);

    for (let i = 0; i < powerups.current.length; i++) {
        const p = powerups.current[i];
        const dx = px - p.x, dy = py - p.y;
        const dSq = dx*dx + dy*dy;
        const currentSkin = currentSkinRef.current;

        // NOVA MAGNETAR: Pull powerups within 200px
        if (currentSkin === "nova" && dSq < 40000) {
           const dist = Math.sqrt(dSq);
           if (dist > 5) {
             p.x += (dx / dist) * 3;
             p.y += (dy / dist) * 3;
           }
        }

        const pickupRadiusSq = Math.pow((PLAYER_SIZE + 20) / 2, 2);
        if (dSq < pickupRadiusSq) {
          const pType = (p as any).type;
          if (pType === "shield") {
            hasShieldRef.current = true;
            thunderChargeRef.current = Math.min(thunderChargeRef.current + 1, 5);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          powerups.current = powerups.current.filter((item) => item.id !== p.id);
        }
    }

    if (collision) {
      // play death sound
      playSfx(gameOverPlayer, 1.0, true);
      setIsGameOverBgmEnabled(true);
      setIsPlayingLobbyBgmEnabled(false);
      
      triggerShake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      pendingScore.current = currentScore.current;
      pendingWave.current = lastWave.current + 1;
      commitScore(currentPlayerRef.current, currentScore.current, lastWave.current + 1, false);
      lastCommittedName.current = currentPlayerRef.current;
      setGameState("gameover");
      setIsStarting(false);
    } else {
      const enemyCount = enemies.current.length;
      // Adaptive render throttle:
      // More enemies => fewer React re-renders => physics loop stays responsive.
      // Player layer is separate — updates at full touch rate (120fps) regardless.
      const desiredFps = enemyCount >= 26 ? 30 : enemyCount >= 18 ? 40 : 60;
      const intervalMs = 1000 / desiredFps;
      if (now - lastRenderMsRef.current >= intervalMs) {
        lastRenderMsRef.current = now;
        setFrame((f) => f + 1);
      }
      requestRef.current = requestAnimationFrame(update);
    }
  }, [
    triggerWaveFlash,
    triggerShake,
    dodgePool,
    levelUpPlayer,
    gameOverPlayer,
    commitScore,
    dodgeShockwave,
    thunderPulse,
    multiplierPulse,
    currentPlayer,
  ]);

  useEffect(() => {
    if (gameState === "playing") {
      lastSpawnTime.current = Date.now();
      lastScoreTick.current = Date.now();
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
      requestRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
      if (countdownRef.current) {
        clearTimeout(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [gameState, update]);

  // ── PLAYING LOBBY BGM: trigger at Wave 2, reset on gameover/menu ─────────────
  useEffect(() => {
    if (waveNumber >= 2 && gameState === "playing") {
      setIsPlayingLobbyBgmEnabled(true);
    } else {
      setIsPlayingLobbyBgmEnabled(false);
    }
  }, [waveNumber, gameState, setIsPlayingLobbyBgmEnabled]);

  // ── SCORE SHARING ─────────────────────────────────────────────────────────────
  const shareScore = async () => {
    Haptics.selectionAsync();
    try {
      await Share.share({
        message:
          `🕹️ ARENA - CHALLENGE ACCEPTED!\n\n` +
          `I just dominated Sector ${waveNumber} and secured a score of ${score} pts! 🏆\n\n` +
          `Total Score: ${score}\n` +
          `Peak Wave: W${waveNumber}\n\n` +
          `Can you survive the Arena? Download & Play now:\n` +
          `🔗 ${DOWNLOAD_URL}\n\n` +
          `#ArenaGame #Cyberpunk #HighScore`,
      });
    } catch {
      /* silently ignore share cancel */
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => stateRef.current === "playing",
      onMoveShouldSetPanResponder: () => stateRef.current === "playing",
      onPanResponderGrant: () => {
        panResponderStart.current = { ...playerPos.current };
      },
      onPanResponderMove: (_, gestureState) => {
        const nx = Math.max(
          PLAYER_SIZE / 2,
          Math.min(width - PLAYER_SIZE / 2, panResponderStart.current.x + gestureState.dx),
        );
        const ny = Math.max(
          PLAYER_SIZE / 2,
          Math.min(height - PLAYER_SIZE / 2, panResponderStart.current.y + gestureState.dy),
        );
        playerPos.current = { x: nx, y: ny };
        playerAnimX.setValue(nx - PLAYER_SIZE / 2);
        playerAnimY.setValue(ny - PLAYER_SIZE / 2);
      },
      onPanResponderRelease: () => {},
    }),
  ).current;

  const step = TUTORIAL_STEPS[tutorialStep];
  const isLastStep = tutorialStep === TUTORIAL_STEPS.length - 1;

  const recentNames = React.useMemo(
    () =>
      Object.values(profiles)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10)
        .map((p) => p.name),
    [profiles],
  );

  const topProfile = React.useMemo(
    () => Object.values(profiles).sort((a, b) => b.bestScore - a.bestScore)[0],
    [profiles],
  );

  const isChampion = topProfile && topProfile.bestScore > 0;

  const playerSkinColor = React.useMemo(() => {
    const skinId = profiles[currentPlayer]?.currentSkin || "default";
    const skin = SKINS.find((s) => s.id === skinId) || SKINS[0];
    const totalXp = profiles[currentPlayer]?.totalXp || 0;
    const isUnlocked = totalXp >= (skin.xpRequired || 0);
    return isUnlocked ? skin.color : SKINS[0].color;
  }, [profiles, currentPlayer]);

  if (!fontsLoaded) return null;

  // Read ref-driven gameplay HUD values once per render.
  const multiplierVal = multiplierRef.current;
  const hasShieldVal = hasShieldRef.current;
  const thunderChargeVal = thunderChargeRef.current;

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateX: shakeX }, { translateY: shakeY }] },
      ]}
      {...panResponder.panHandlers}
    >
      <StatusBar hidden />

      {/* Thunder Strike Flash (Lightning Strobe) */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: "#00E5FF", // Electric Cyan
            opacity: thunderPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.95],
            }),
            zIndex: 9999,
          },
        ]}
      />
      
      {/* Expanding Lightning Rings */}
      <Animated.View
         pointerEvents="none"
         style={[
           StyleSheet.absoluteFill,
           {
             alignItems: 'center',
             justifyContent: 'center',
             zIndex: 9998,
           }
         ]}
      >
        <Animated.View style={{
          width: 200,
          height: 200,
          borderRadius: 100,
          borderWidth: 10,
          borderColor: '#00E5FF',
          opacity: thunderPulse,
          transform: [{ scale: thunderPulse.interpolate({ inputRange: [0, 1], outputRange: [8, 1] }) }]
        }} />
      </Animated.View>

      {/* AMBIENT HUD RING */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.hudCircle,
          {
            opacity: Animated.multiply(uiPulse, 0.07),
            transform: [
              { scale: Animated.add(0.9, Animated.multiply(uiPulse, 0.15)) },
            ],
          },
        ]}
      />

      {/* ── PLAYING (enemies, powerups, HUD — throttled by setFrame) ── */}
      {gameState === "playing" && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {enemies.current.map((enemy) => (
            <View
              key={enemy.id}
              renderToHardwareTextureAndroid={true}
              shouldRasterizeIOS={true}
              style={[
                styles.enemy,
                {
                  backgroundColor: enemy.isSniper ? "#FFD700" : "#FF0042",
                  shadowColor: enemy.isSniper ? "#FFD700" : "#FF0042",
                  transform: [
                    { translateX: enemy.x - ENEMY_SIZE / 2 },
                    { translateY: enemy.y - ENEMY_SIZE / 2 },
                  ],
                },
              ]}
            />
          ))}
          {powerups.current.map((p) => (
            <View
              key={p.id}
              style={[
                styles.powerup,
                { left: p.x - 10, top: p.y - 10 }
              ]}
            >
              <Ionicons name="shield-checkmark" size={16} color="#FFF" />
            </View>
          ))}
          {hasShieldVal && (
            <View style={[styles.playerShield, { left: playerPos.current.x - PLAYER_SIZE/2 - 5, top: playerPos.current.y - PLAYER_SIZE/2 - 5 }]} />
          )}
          <View style={styles.playingHUD}>
            <View style={styles.hudTop}>
              <View>
                <Text style={styles.hudLabel}>SESSION SCORE</Text>
                <Text style={styles.hudValue}>
                  {score.toString().padStart(5, "0")}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.hudLabel}>SECTOR WAVE</Text>
                <Text style={styles.hudValue}>0{waveNumber}</Text>
              </View>
            </View>
            
            {multiplierVal > 1 && (
              <Animated.View style={[styles.multiplierBadge, { transform: [{ scale: multiplierPulse }] }]}>
                <Text style={styles.multiplierText}>{multiplierVal}x</Text>
                <Text style={styles.multiplierLabel}>REFLEX BOOST</Text>
              </Animated.View>
            )}

            {/* Thunder Charge Indicator */}
            <Animated.View style={{ 
              flexDirection: "row", 
              gap: 4, 
              marginTop: 4, 
              justifyContent: "center",
              transform: [{ 
                scale: (thunderChargeVal >= 5) ? thunderPulse.interpolate({ 
                  inputRange: [0, 1], 
                  outputRange: [1, 1.3] 
                }) : 1 
              }]
            }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View 
                  key={i} 
                  style={{ 
                    width: 8, 
                    height: 4, 
                    backgroundColor: thunderChargeVal >= i ? "#00E5FF" : "rgba(255,255,255,0.2)",
                    borderRadius: 2,
                    shadowColor: "#00E5FF",
                    shadowRadius: thunderChargeVal >= i ? 4 : 0,
                    shadowOpacity: 0.8
                  }} 
                />
              ))}
            </Animated.View>
          </View>

          {/* DODGE SHOCKWAVE */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shockwave,
              {
                left: dodgeShockPos.current.x - 50,
                top: dodgeShockPos.current.y - 50,
                opacity: Animated.subtract(1, dodgeShockwave),
                transform: [{ scale: Animated.multiply(dodgeShockwave, 2.5) }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.waveFlashContainer,
              {
                opacity: waveFlashOpacity,
                transform: [{ scale: waveFlashScale }],
              },
            ]}
          >
            <Text 
              style={[
                styles.waveFlashText, 
                waveFlashLabel.current === "THUNDER STRIKE!" && { color: "#00F2FF", textShadowColor: "rgba(0, 242, 255, 0.8)" }
              ]}
            >
              {waveFlashLabel.current}
            </Text>
            <View style={styles.waveFlashBar} />
            <Text style={styles.waveFlashSub}>
              {waveFlashLabel.current === "THUNDER STRIKE!" ? "SYSTEM OVERLOAD: HYPER-CHARGE" : "SYSTEM THROTTLE RESET"}
            </Text>
          </Animated.View>
        </View>
      )}

      {/* ── PLAYER LAYER (120fps — independent of enemy re-renders) ── */}
      {gameState === "playing" && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.player,
            {
              backgroundColor: playerSkinColor,
              shadowColor: playerSkinColor,
              transform: [
                { translateX: playerAnimX },
                { translateY: playerAnimY },
              ],
            },
          ]}
        />
      )}

      {/* ── COUNTDOWN ── */}
      {gameState === "countdown" && (
        <View style={styles.countdownOverlay}>
          <Animated.Text
            style={[
              styles.countdownNumber,
              { opacity: cdOpacity, transform: [{ scale: cdScale }] },
            ]}
          >
            {countdown === 0 ? "GO" : countdown}
          </Animated.Text>
          <Text style={styles.countdownSub}>
            {countdown === 0 ? "EVADE DETECTION" : "GET READY"}
          </Text>
        </View>
      )}

      {/* ── MENU (HOME) ── */}
      {gameState === "menu" && (
        <Animated.View style={[styles.overlay, { opacity: menuFade, padding: 0 }]}>
          <ImageBackground source={require("../../assets/images/background.png")} style={styles.bgImage} resizeMode="cover">
            <View style={[styles.contentWrapper, { paddingTop: height * 0.15 }]}>
              {/* Header Section */}
              <View style={[styles.homeHeader, { marginBottom: moderateScale(40) }]}>
                <Text style={styles.neonSub}>READY TO PLAY</Text>
                <Text style={styles.titleMain}>ARENA</Text>
              </View>

              {/* THE CHAMPION'S THRONE */}
              {isChampion && (
                <View style={styles.championBanner}>
                  <View style={styles.championHeader}>
                    <Ionicons name="trophy" size={14} color="#FFD700" />
                    <Animated.Text style={[styles.championLabel, { opacity: uiPulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]}>
                      CURRENT ARENA CHAMPION
                    </Animated.Text>
                    <Ionicons name="trophy" size={14} color="#FFD700" />
                  </View>
                  <Text style={styles.championName}>{topProfile.name}</Text>
                  <View style={styles.championScoreBox}>
                    <Text style={styles.championScore}>{topProfile.bestScore} PTS</Text>
                    <Text style={styles.championWave}>WAVE {topProfile.bestWave}</Text>
                  </View>
                  <View style={styles.championGlow} />
                </View>
              )}

              {/* Advanced Sound Toggle */}
              <TouchableOpacity
                style={[styles.glassToggle, { position: 'absolute', top: moderateScale(40), right: moderateScale(20) }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setIsSoundEnabled(!isSoundEnabled);
                }}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={isSoundEnabled ? "volume-high" : "volume-mute"} 
                  size={moderateScale(22)} 
                  color={isSoundEnabled ? "#D3B07A" : "rgba(255,255,255,0.3)"} 
                />
                <Animated.View style={[
                  styles.toggleGlow, 
                  { opacity: isSoundEnabled ? 0.4 : 0 }
                ]} />
              </TouchableOpacity>

              {/* Stats Overview card */}
              <View style={styles.proCard}>
                <View style={[styles.cardHeader, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                  <View>
                    <Text style={styles.cardTitle}>PILOT LOGS</Text>
                    <Text style={{ color: "rgba(211,176,122,0.6)", fontSize: moderateScale(9), fontFamily: "Orbitron", marginTop: 2 }}>
                      XP: {profiles[currentPlayer]?.totalXp || 0}
                    </Text>
                  </View>

                  
                  <View pointerEvents="box-none" style={{ position: "relative" }}>
                    <TouchableOpacity 
                      style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(211,176,122,0.1)", paddingHorizontal: moderateScale(10), paddingVertical: moderateScale(6), borderRadius: moderateScale(4) }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setPendingName(currentPlayer);
                        setShowNameEntry(true);
                        if (showNameHint) {
                          setShowNameHint(false);
                          AsyncStorage.setItem(NAME_HINT_KEY, "seen").catch(() => {});
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="person" size={12} color="#D3B07A" style={{marginRight: 6}} />
                      <Text style={{ color: "#FFF", fontSize: moderateScale(11), fontFamily: "Orbitron" }}>
                        {currentPlayer}
                      </Text>
                      <Ionicons name="pencil" size={10} color="#D3B07A" style={{ opacity: 0.6, marginLeft: 6 }} />
                    </TouchableOpacity>

                    {showNameHint && (
                      <Animated.View 
                        pointerEvents="none"
                        style={{ 
                          position: "absolute", 
                          bottom: moderateScale(38), 
                          right: moderateScale(-10), 
                          alignItems: "flex-end",
                          opacity: nameHintAnim,
                        }}
                      >
                        <View style={{ 
                          backgroundColor: "#E4C79F", 
                          paddingHorizontal: moderateScale(20), 
                          paddingVertical: moderateScale(6), 
                          borderRadius: moderateScale(30),
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.3,
                          shadowRadius: 8,
                          elevation: 10,
                          minWidth: moderateScale(180),
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: "rgba(0,0,0,0.05)"
                        }}>
                          <Text 
                            numberOfLines={1}
                            style={{ 
                              fontFamily: "Centralwell", 
                              fontSize: moderateScale(26), 
                              color: "#000000",
                              lineHeight: moderateScale(30),
                              textAlign: "center"
                            }}
                          >
                            Change your name
                          </Text>
                        </View>
                        {/* Triangle for Speech Bubble */}
                        <View style={{
                          width: 0,
                          height: 0,
                          backgroundColor: "transparent",
                          borderStyle: "solid",
                          borderLeftWidth: 8,
                          borderRightWidth: 8,
                          borderTopWidth: 10,
                          borderLeftColor: "transparent",
                          borderRightColor: "transparent",
                          borderTopColor: "#E4C79F",
                          marginTop: -1,
                          marginRight: moderateScale(25)
                        }} />
                      </Animated.View>
                    )}
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardStatRow}>
                    <View style={styles.cardStatItem}>
                      <Text style={styles.statLabel}>BEST SCORE</Text>
                      <Text style={styles.statValue}>{highScore}</Text>
                      <View style={styles.scoreUnderline} />
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.cardStatItem}>
                      <Text style={styles.statLabel}>BEST SECTOR</Text>
                      <View style={styles.rankContainer}>
                        {(profiles[currentPlayer]?.bestWave || 1) >= 1 && (
                          <Image
                            source={require("../../assets/images/leaves.png")}
                            style={[styles.wreathBadge, { position: "absolute", top: moderateScale(-20) }]}
                            resizeMode="contain"
                          />
                        )}
                        <Text style={styles.statValue}>W{profiles[currentPlayer]?.bestWave || 1}</Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* INTEGRATED HANGAR LINK */}
                  <TouchableOpacity 
                    style={{ 
                      marginTop: moderateScale(26), 
                      paddingTop: moderateScale(12), 
                      borderTopWidth: 1, 
                      borderTopColor: "rgba(211,176,122,0.1)",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowHangar(true);
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons name="rocket" size={12} color="#D3B07A" style={{ marginRight: 8 }} />
                      <Text style={{ color: "rgba(211,176,122,0.8)", fontSize: moderateScale(10), fontFamily: "Orbitron" }}>CONFIGURE FLEET</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={12} color="#D3B07A" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Actions Grid */}
              <View style={[styles.homeActions, { marginTop: moderateScale(0), gap: moderateScale(10) }]}>
                <TouchableOpacity
                  style={[styles.primaryBtn, { width: "100%", height: moderateScale(64) }]}
                  onPress={startGame}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>START MISSION</Text>
                </TouchableOpacity>

                {/* <TouchableOpacity
                  style={[styles.outlineBtn, { width: "100%", height: moderateScale(54), backgroundColor: "rgba(211,176,122,0.1)", borderColor: "#D3B07A" }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowHangar(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="rocket-outline" size={18} color="#D3B07A" style={{ marginRight: 8 }} />
                  <Text style={[styles.outlineBtnText, { color: "#D3B07A" }]}>PILOT HANGAR</Text>
                </TouchableOpacity> */}

                <View style={[styles.secondaryRow, { marginTop: 0 }]}>
                  <TouchableOpacity
                    style={styles.outlineBtn}
                    onPress={openTutorial}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="book-outline" size={18} color="#E4C79F" style={{ marginRight: 8 }} />
                    <Text style={styles.outlineBtnText}>HOW TO PLAY</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.outlineBtnGold}
                    onPress={() => setShowLeaderboard(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trophy" size={18} color="#2A1B10" style={{ marginRight: 8 }} />
                    <Text style={styles.outlineBtnTextGold}>BEST SCORES</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.copyright}>© 2026 ARENA by ( Himanshu Kumar )</Text>
            </View>
          </ImageBackground>
        </Animated.View>
      )}

      {/* ── GAME OVER (SCORE) ── */}
      {gameState === "gameover" && (
        <View style={[styles.overlay, { backgroundColor: "#0f0f0f", padding: 0 }]}>
          <View style={[styles.contentWrapper, { paddingTop: height * 0.15 }]}>
            <View style={styles.homeHeader}>
              <Text style={styles.dangerSub}>YOU DIED</Text>
              <Text style={styles.dangerTitle}>GAME OVER</Text>
              <View style={styles.versionContainer}>
                <View style={styles.versionLine} />
                <Text style={styles.versionTag}>SESSION LOG</Text>
                <View style={styles.versionLine} />
              </View>
            </View>

            <View style={styles.proCard}>
              <View style={[styles.cardHeader, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                <Text style={styles.cardTitle}>RESULTS FOR PILOT</Text>
                <Ionicons name="skull" size={20} color="#D3B07A" />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.gridRow}>
                  <View style={styles.gridItem}>
                    <Text style={styles.statLabel}>SCORE</Text>
                    <Text style={styles.statValue}>{score}</Text>
              
                    <View style={styles.scoreUnderline} />
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.statLabel}>WAVE</Text>
                    <Text style={styles.statValue}>{waveNumber}</Text>
                    <View style={{ height: 2, marginTop: moderateScale(8) }} />
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.statLabel}>BEST</Text>
                    <Text style={[styles.statValue, { color: "#D3B07A" }]}>
                      {highScore}
                    </Text>
                    <View style={{ height: 2, marginTop: moderateScale(8) }} />
                  </View>
                </View>
              </View>
            </View>

        {/* HUD Overlay */}
            <View style={styles.homeActions}>
              <TouchableOpacity
                style={styles.primaryBtnRed}
                onPress={startGame}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnTextRed}>PLAY AGAIN</Text>
              </TouchableOpacity>

              {/* HANGAR ACCESS FROM GAMEOVER */}
              <TouchableOpacity
                style={[styles.outlineBtn, { flex: 0, height: moderateScale(54), backgroundColor: "rgba(0,0,0,0.5)", borderColor: "rgba(211,176,122,0.4)" }]}
                onPress={() => {
                   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                   setShowHangar(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="rocket-outline" size={18} color="#D3B07A" style={{ marginRight: 8 }} />
                <Text style={styles.outlineBtnText}>UPGRADE SHIP</Text>
              </TouchableOpacity>

              <View style={styles.secondaryRow}>
                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={() => {
                    setGameState("menu");
                    setIsStarting(false);
                    menuFade.setValue(1);
                    setIsBgmEnabled(true); // Restore menu BGM
                    setIsGameOverBgmEnabled(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="home-outline" size={18} color="#E4C79F" style={{ marginRight: 8 }} />
                  <Text style={styles.outlineBtnText}>HOME</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={shareScore}
                  activeOpacity={0.7}
                >
                  <Ionicons name="share-social" size={18} color="#E4C79F" style={{ marginRight: 8 }} />
                  <Text style={styles.outlineBtnText}>SHARE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ══ TUTORIAL OVERLAY ══════════════════════════════════════════════════════ */}
      {showTutorial && (
        <View style={styles.tutOverlay}>
          <TouchableOpacity style={styles.tutSkip} onPress={closeTutorial}>
            <Text style={styles.tutSkipText}>SKIP</Text>
          </TouchableOpacity>
          <Animated.View
            style={[
              styles.tutCard,
              {
                opacity: tutCardFade,
                transform: [{ translateY: tutCardSlide }],
              },
            ]}
          >
            <Text style={[styles.tutIcon, { color: step.iconColor }]}>
              {step.icon}
            </Text>
            <Text style={styles.tutTag}>{step.tag}</Text>
            <Text style={styles.tutTitle}>{step.title}</Text>
            <View
              style={[styles.tutTitleBar, { backgroundColor: step.iconColor }]}
            />
            <Text style={styles.tutBody}>{step.body}</Text>
            {tutorialStep === 0 && (
              <View style={styles.tutDemoBox}>
                <View style={styles.tutDemoPlayer} />
                <Animated.View
                  style={[
                    styles.tutFinger,
                    {
                      transform: [
                        {
                          translateX: Animated.subtract(
                            fingerX,
                            width * 0.35 + 50,
                          ),
                        },
                        {
                          translateY: Animated.subtract(
                            fingerY,
                            height * 0.55 - 80,
                          ),
                        },
                        { scale: fingerScale },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.tutFingerIcon}>☉</Text>
                </Animated.View>
              </View>
            )}
            {tutorialStep === 1 && (
              <View style={styles.tutEnemyRow}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={[styles.tutEnemyDot, { opacity: 0.6 + i * 0.2 }]}
                  />
                ))}
                <Text style={styles.tutArrow}>→</Text>
                <View style={styles.tutPlayerDot} />
              </View>
            )}
            {tutorialStep === 2 && (
              <View style={styles.tutWaveRow}>
                {[1, 2, 3].map((w) => (
                  <View key={w} style={styles.tutWaveChip}>
                    <Text style={styles.tutWaveChipLabel}>W{w}</Text>
                    <Text style={styles.tutWaveChipSpeed}>
                      peak {4 + w * 2}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.tutHint}>{step.hint}</Text>
            <View style={styles.tutDots}>
              {TUTORIAL_STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.tutDot,
                    i === tutorialStep && styles.tutDotActive,
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity
              style={[styles.tutBtn, { borderColor: step.iconColor }]}
              onPress={nextTutorialStep}
            >
              <Text style={[styles.tutBtnText, { color: step.iconColor }]}>
                {isLastStep
                  ? "UNDERSTOOD  ✓"
                  : `NEXT  [${tutorialStep + 2}/${TUTORIAL_STEPS.length}]`}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}


      {/* ══ SKINS HANGAR MODAL ══════════════════════════════════════════════════ */}
      <Modal
        visible={showHangar}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHangar(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={() => setShowHangar(false)} 
          />
          <View style={[styles.proCardModalLarge, { height: "85%", width: "95%", marginTop: moderateScale(40) }]}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>PILOT HANGAR</Text>
                <Text style={{ color: "rgba(211,176,122,0.4)", fontSize: moderateScale(9), fontFamily: "Orbitron" }}>
                   TOTAL XP: {profiles[currentPlayer]?.totalXp || 0}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowHangar(false)} style={{ padding: 4 }}>
                <Ionicons name="close-circle-outline" size={28} color="#D3B07A" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: moderateScale(20), paddingBottom: moderateScale(40) }}
              showsVerticalScrollIndicator={true}
            >
              {SKINS.map((skin) => {
                const isUnlocked = (profiles[currentPlayer]?.totalXp || 0) >= (skin.xpRequired || 0);
                const isSelected = (profiles[currentPlayer]?.currentSkin || "default") === skin.id;
                
                return (
                  <TouchableOpacity
                    key={skin.id}
                    disabled={!isUnlocked}
                    onPress={() => {
                       Haptics.selectionAsync();
                       setProfiles(prev => ({ 
                         ...prev, 
                         [currentPlayer]: { ...prev[currentPlayer], currentSkin: skin.id } 
                       }));
                    }}
                    style={{
                      marginBottom: moderateScale(16),
                      backgroundColor: isSelected ? "rgba(211,176,122,0.1)" : "rgba(255,255,255,0.03)",
                      borderRadius: moderateScale(12),
                      borderWidth: 1,
                      borderColor: isSelected ? "#D3B07A" : isUnlocked ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                      overflow: "hidden"
                    }}
                  >
                    <View style={{ flexDirection: "row", padding: moderateScale(16), alignItems: "center" }}>
                      <View style={{ 
                        width: moderateScale(50), 
                        height: moderateScale(50), 
                        borderRadius: 6, 
                        backgroundColor: skin.color,
                        justifyContent: "center",
                        alignItems: "center",
                        shadowColor: skin.color,
                        shadowOpacity: isUnlocked ? 0.6 : 0,
                        shadowRadius: 10
                      }}>
                        {!isUnlocked && <Ionicons name="lock-closed" size={20} color="rgba(0,0,0,0.5)" />}
                      </View>
                      
                    <View style={{ flex: 1, marginLeft: moderateScale(16) }}>
                      <Text style={{ 
                        color: isUnlocked ? "#FFF" : "rgba(255,255,255,0.4)", 
                        fontFamily: "Orbitron", 
                        fontSize: moderateScale(14),
                        letterSpacing: 2
                      }}>
                        {skin.name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                        <Text style={{ 
                          color: isUnlocked ? "#D3B07A" : "rgba(211,176,122,0.3)", 
                          fontSize: moderateScale(10), 
                          fontWeight: "bold",
                          letterSpacing: 1
                        }}>
                          {skin.power.toUpperCase()}
                        </Text>
                        {!isUnlocked && (
                          <Text style={{ color: "#FF4444", fontSize: moderateScale(10), marginLeft: 10, fontWeight: "bold" }}>
                            REQ: {(skin.xpRequired || 0).toLocaleString()} XP
                          </Text>
                        )}
                      </View>
                      
                      {/* TACTICAL DESCRIPTION */}
                      <Text style={{ 
                        color: isUnlocked ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)", 
                        fontSize: moderateScale(11), 
                        marginTop: moderateScale(8),
                        lineHeight: moderateScale(14)
                      }}>
                        {skin.desc}
                      </Text>
                      
                      {isUnlocked && (
                        <View style={{ 
                          marginTop: moderateScale(8), 
                          backgroundColor: isSelected ? "#D3B07A" : "rgba(211,176,122,0.1)", 
                          paddingVertical: 4, 
                          paddingHorizontal: 8, 
                          borderRadius: 4,
                          alignSelf: "flex-start"
                        }}>
                          <Text style={{ color: isSelected ? "#000" : "#D3B07A", fontSize: moderateScale(8), fontWeight: "bold" }}>
                            {isSelected ? "ACTIVE CONFIG" : "SELECT POWER"}
                          </Text>
                        </View>
                      )}
                    </View>
                      
                      {isSelected && <Ionicons name="checkmark-circle" size={24} color="#D3B07A" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══ NAME ENTRY MODAL ════════════════════════════════════════════════════ */}
      <Modal
        visible={showNameEntry}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameEntry(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalBackdrop} 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={{
            width: width * 0.85,
            backgroundColor: "rgba(10,10,10,0.95)",
            borderRadius: moderateScale(16),
            padding: moderateScale(24),
            borderWidth: 1,
            borderColor: "rgba(211,176,122,0.2)",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.8,
            shadowRadius: 20,
            alignItems: "center"
          }}>
            <Text style={{ fontFamily: "Orbitron", fontSize: moderateScale(14), color: "rgba(211,176,122,0.6)", letterSpacing: 2, marginBottom: moderateScale(20) }}>
              IDENTIFY PILOT
            </Text>
            
            <View style={{ width: "100%", backgroundColor: "rgba(0,0,0,0.4)", borderRadius: moderateScale(8), borderWidth: 1, borderColor: "rgba(211,176,122,0.3)" }}>
              <TextInput
                style={{ color: "#FFF", fontSize: moderateScale(20), fontFamily: "Orbitron", textAlign: "center", letterSpacing: 4, height: moderateScale(60) }}
                placeholder="ENTER NAME"
                placeholderTextColor="rgba(211,176,122,0.2)"
                value={pendingName}
                onChangeText={setPendingName}
                maxLength={10}
                autoCapitalize="characters"
                autoFocus
                selectionColor="#5A0D1F"
                returnKeyType="done"
                onSubmitEditing={() => {
                  const finalName = pendingName.trim().toUpperCase() || "PLAYER1";
                  setCurrentPlayer(finalName);
                  // Only rewrite history if we are currently looking at a gameover screen
                  // for the run we just finished.
                  if (gameState === "gameover" && finalName !== lastCommittedName.current) {
                      commitScore(finalName, pendingScore.current, pendingWave.current, true);
                      lastCommittedName.current = finalName;
                  } else {
                      // Just an active profile change at the menu
                      AsyncStorage.setItem(LAST_PLAYER_KEY, finalName).catch(() => {});
                  }
                  setShowNameEntry(false);
                }}
              />
            </View>

            {recentNames.length > 0 && (
              <View style={{ width: "100%", marginTop: moderateScale(16) }}>
                <Text style={{ fontFamily: "Orbitron", fontSize: moderateScale(9), color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: moderateScale(8), textAlign: "center" }}>
                  RECENT RECORDS
                </Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: moderateScale(8), paddingHorizontal: 4 }}
                >
                  {recentNames.map((name, i) => (
                    <TouchableOpacity
                      key={i}
                      style={{
                        paddingHorizontal: moderateScale(12),
                        paddingVertical: moderateScale(6),
                        borderRadius: moderateScale(20),
                        backgroundColor: "rgba(211,176,122,0.1)",
                        borderWidth: 1,
                        borderColor: name === pendingName.trim().toUpperCase() ? "#D3B07A" : "rgba(211,176,122,0.2)",
                      }}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPendingName(name);
                      }}
                    >
                      <Text style={{ fontFamily: "Orbitron", fontSize: moderateScale(10), color: name === pendingName.trim().toUpperCase() ? "#D3B07A" : "rgba(211,176,122,0.6)" }}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={{ flexDirection: "row", marginTop: moderateScale(24), width: "100%", gap: moderateScale(12) }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: moderateScale(14), backgroundColor: "rgba(255,255,255,0.05)", borderRadius: moderateScale(8), alignItems: "center" }}
                onPress={() => setShowNameEntry(false)}
              >
                <Text style={{ fontFamily: "Orbitron", fontSize: moderateScale(12), color: "rgba(255,255,255,0.5)" }}>CANCEL</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: moderateScale(14), backgroundColor: "#D3B07A", borderRadius: moderateScale(8), alignItems: "center", shadowColor: "#D3B07A", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: {width: 0, height: 4} }}
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    const finalName = pendingName.trim().toUpperCase() || "PLAYER1";
                    setCurrentPlayer(finalName);
                    if (gameState === "gameover" && finalName !== lastCommittedName.current) {
                        commitScore(finalName, pendingScore.current, pendingWave.current, true);
                        lastCommittedName.current = finalName;
                    } else {
                        AsyncStorage.setItem(LAST_PLAYER_KEY, finalName).catch(() => {});
                    }
                    setShowNameEntry(false);
                }}
              >
                <Text style={{ fontFamily: "Orbitron", fontSize: moderateScale(12), color: "#000", fontWeight: "bold" }}>CONFIRM</Text>
              </TouchableOpacity>
            </View>

            {/* HANGAR ACCESS */}
            <TouchableOpacity 
              style={{ 
                width: "100%", 
                marginTop: moderateScale(24), 
                backgroundColor: "rgba(211,176,122,0.1)", 
                borderRadius: moderateScale(8), 
                borderWidth: 1, 
                borderColor: "#D3B07A", 
                padding: moderateScale(16),
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between"
              }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowHangar(true);
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 32, height: 32, borderRadius: 4, backgroundColor: SKINS.find(s => s.id === (profiles[currentPlayer]?.currentSkin || "default"))?.color || "#D3B07A", marginRight: 12 }} />
                <View>
                  <Text style={{ color: "#FFF", fontFamily: "Orbitron", fontSize: moderateScale(11) }}>PILOT HANGAR</Text>
                  <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: moderateScale(9) }}>CONFIGURE SHIP POWERS</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#D3B07A" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══ BEST SCORES MODAL ══════════════════════════════════════════════════ */}
      <Modal
        visible={showLeaderboard}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLeaderboard(false)}
      >
        {/* Background & Core Layer */}
        <View
          style={[
            styles.modalBackdrop,
            { backgroundColor: "rgba(0,0,0,0.85)" },
          ]}
        >
          <View
            style={[
              styles.proCardModalLarge,
              {
                height: height * 0.65,
                borderColor: "rgba(255,215,0,0.3)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
              },
            ]}
          >
            {/* Advanced Header / Tabs */}
            <View style={[styles.cardHeader, { borderBottomWidth: 0, paddingBottom: 0 }]}>
              <View style={{
                  flexDirection: "row",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderRadius: moderateScale(8),
              }}>
                <View style={{ flex: 1, flexDirection: "row", position: "relative" }}>
                    <Animated.View style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      height: "100%",
                      left: tabSlideAnim.interpolate({
                         inputRange: [0, 1],
                         outputRange: ["0%", "50%"]
                      }),
                      width: "50%",
                      backgroundColor: "rgba(227,176,7,0.15)",
                      borderRadius: moderateScale(6),
                      borderWidth: 1,
                      borderColor: "rgba(227,176,7,0.5)"
                    }} />

                    <TouchableOpacity
                        style={{ flex: 1, paddingVertical: moderateScale(10), alignItems: "center" }}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setLbTab("top");
                        }}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.cardTitleGold, { fontSize: moderateScale(11) }, lbTab !== "top" && { color: "rgba(255,255,255,0.4)" }]}>🏆 TOP PILOTS</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={{ flex: 1, paddingVertical: moderateScale(10), alignItems: "center" }}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setLbTab("recent");
                        }}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.cardTitleGold, { fontSize: moderateScale(11) }, lbTab !== "recent" && { color: "rgba(255,255,255,0.4)" }]}>⏱ RECENT DROPS</Text>
                    </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* List */}
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ padding: 20 }}
              showsVerticalScrollIndicator={true}
              indicatorStyle="white"
            >
              {lbTab === "top" ? (
                Object.keys(profiles).length === 0 ? (
                  <Text style={styles.lbEmpty}>NO LOGS YET{"\n"}STEP INTO THE ARENA</Text>
                ) : (
                  Object.values(profiles)
                    .sort((a,b) => b.bestScore - a.bestScore)
                    .slice(0, 30)
                    .map((entry, i) => {
                    const isTop = i < 3;
                    return (
                      <View key={i} style={[styles.proLbRow, i === 0 && styles.rowGold]}>
                        <Text style={[styles.proLbRank, isTop && { color: "#e3b007" }]}>{i + 1}</Text>
                        <View style={{ flex: 1, marginLeft: 16 }}>
                          <Text style={[styles.proLbName, i === 0 && { color: "#e3b007" }]}>{entry.name}</Text>
                          <Text style={styles.proLbMeta}>WAVE-{entry.bestWave} • {new Date(entry.timestamp).toLocaleDateString()}</Text>
                        </View>
                        <Text style={[styles.proLbScore, i === 0 && { color: "#e3b007" }]}>{entry.bestScore}</Text>
                      </View>
                    );
                  })
                )
              ) : (
                history.length === 0 ? (
                  <Text style={styles.lbEmpty}>NO RECENT GAMES</Text>
                ) : (
                  history.map((entry, i) => (
                    <View key={i} style={styles.proLbRow}>
                      <Text style={styles.proLbRank}>{i + 1}</Text>
                      <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={styles.proLbName}>{entry.name}</Text>
                        <Text style={styles.proLbMeta}>WAVE-{entry.wave} • {new Date(entry.timestamp).toLocaleTimeString()}</Text>
                      </View>
                      <Text style={styles.proLbScore}>{entry.score}</Text>
                    </View>
                  ))
                )
              )}
            </ScrollView>

            {/* Footer / Close Button */}
            <View
              style={{
                padding: 15,
                borderTopWidth: 1,
                borderTopColor: "rgba(255,255,255,0.1)",
                backgroundColor: "#0a0a0a",
              }}
            >
              <TouchableOpacity
                style={[styles.primaryBtn, { height: 50, width: "100%" }]}
                onPress={() => setShowLeaderboard(false)}
              >
                <Text style={styles.primaryBtnText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020202" },
  glassToggle: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(211,176,122,0.2)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    zIndex: 100,
  },
  toggleGlow: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: moderateScale(24),
    backgroundColor: "#D3B07A",
    shadowColor: "#D3B07A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
  },
  hudCircle: {
    position: "absolute",
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: width * 0.75,
    borderWidth: moderateScale(2),
    borderColor: "#D3B07A",
    top: height / 2 - width * 0.75,
    left: width / 2 - width * 0.75,
  },
  player: {
    position: "absolute",
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    borderRadius: moderateScale(4),
    backgroundColor: "#D3B07A",
    borderWidth: moderateScale(2),
    borderColor: "#FFF",
    shadowColor: "#D3B07A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: moderateScale(10),
    elevation: moderateScale(15),
  },
  enemy: {
    position: "absolute",
    width: ENEMY_SIZE,
    height: ENEMY_SIZE,
    borderRadius: moderateScale(2),
    backgroundColor: "#FF0042",
    // Optimization: simplify shadow for high-density rendering (prevents Wave 5 GPU lag)
    shadowColor: "#FF0042",
    shadowOpacity: 0.6,
    shadowRadius: moderateScale(2),
  },
  playingHUD: { position: "absolute", top: moderateScale(50), left: moderateScale(20), right: moderateScale(20) },
  hudTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(211,176,122,0.2)",
    paddingBottom: moderateScale(10),
  },
  hudLabel: {
    color: "rgba(211,176,122,0.5)",
    fontSize: moderateScale(10),
    letterSpacing: 2,
    fontWeight: "700",
  },
  hudValue: {
    color: "#D3B07A",
    fontSize: moderateScale(24),
    fontFamily: "Orbitron",
    letterSpacing: 1,
  },
  multiplierBadge: {
    position: "absolute",
    top: moderateScale(60),
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: "rgba(211,176,122,0.15)",
    paddingHorizontal: moderateScale(20),
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(4),
    borderWidth: 1,
    borderColor: "rgba(211,176,122,0.4)",
  },
  multiplierText: {
    color: "#FFF",
    fontSize: moderateScale(32),
    fontFamily: "Orbitron",
    textShadowColor: "#D3B07A",
    textShadowRadius: 10,
  },
  multiplierLabel: {
    color: "#D3B07A",
    fontSize: moderateScale(8),
    letterSpacing: 3,
    fontWeight: "bold",
    marginTop: 2,
  },
  shockwave: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "#D3B07A",
  },
  powerup: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#00E5FF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#00E5FF",
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  playerShield: {
    position: "absolute",
    width: PLAYER_SIZE + 10,
    height: PLAYER_SIZE + 10,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#00E5FF",
    backgroundColor: "rgba(0, 229, 255, 0.1)",
  },

  // countdown
  countdownOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#020202",
  },
  countdownNumber: {
    color: "#FFF",
    fontSize: moderateScale(120),
    fontFamily: "Orbitron",
    letterSpacing: -4,
    textShadowColor: "#D3B07A",
    textShadowRadius: moderateScale(30),
  },
  countdownSub: {
    color: "rgba(211,176,122,0.4)",
    fontSize: moderateScale(12),
    letterSpacing: 5,
    marginTop: moderateScale(10),
  },

  overlay: {
    flex: 1,
    padding: moderateScale(30),
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#020202",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  footer: { position: "absolute", bottom: moderateScale(30), width: "100%", alignItems: "center" },
  copyright: {
    color: "rgba(211,176,122,0.4)",
    fontSize: moderateScale(9),
    letterSpacing: 5,
    fontWeight: "600",
    textAlign: "center",
  },

  waveFlashContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  waveFlashText: {
    color: "#FFF",
    fontSize: moderateScale(44),
    fontFamily: "Orbitron",
    letterSpacing: 10,
  },
  waveFlashBar: {
    width: moderateScale(200),
    height: moderateScale(2),
    backgroundColor: "#D3B07A",
    marginVertical: moderateScale(10),
  },
  waveFlashSub: {
    color: "#D3B07A",
    fontSize: moderateScale(10),
    fontWeight: "600",
    letterSpacing: 5,
  },

  // tutorial
  tutOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.96)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  tutSkip: {
    position: "absolute",
    top: moderateScale(55),
    right: moderateScale(28),
    padding: moderateScale(10),
    borderWidth: moderateScale(1),
    borderColor: "rgba(211,176,122,0.3)",
    borderRadius: moderateScale(4),
  },
  tutSkipText: {
    color: "#D3B07A",
    fontSize: moderateScale(11),
    letterSpacing: 3,
    fontFamily: "Orbitron",
  },
  tutCard: {
    width: width - moderateScale(48),
    backgroundColor: "#0a0a0a",
    borderWidth: moderateScale(1),
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: moderateScale(4),
    padding: moderateScale(32),
    alignItems: "center",
  },
  tutIcon: { fontSize: moderateScale(52), marginBottom: moderateScale(16) },
  tutTag: {
    color: "rgba(255,255,255,0.25)",
    fontSize: moderateScale(10),
    letterSpacing: 4,
    marginBottom: moderateScale(6),
  },
  tutTitle: {
    color: "#FFF",
    fontSize: moderateScale(22),
    fontFamily: "Orbitron",
    letterSpacing: 4,
  },
  tutTitleBar: { width: moderateScale(60), height: moderateScale(3), marginTop: moderateScale(10), marginBottom: moderateScale(20) },
  tutBody: {
    color: "rgba(255,255,255,0.65)",
    fontSize: moderateScale(14),
    lineHeight: moderateScale(22),
    textAlign: "center",
    letterSpacing: 0.5,
  },
  tutDemoBox: {
    marginTop: moderateScale(20),
    width: moderateScale(200),
    height: moderateScale(90),
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: moderateScale(4),
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  tutDemoPlayer: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(4),
    backgroundColor: "#D3B07A",
    borderWidth: moderateScale(2),
    borderColor: "#FFF",
  },
  tutFinger: { position: "absolute", top: moderateScale(15), left: moderateScale(25) },
  tutFingerIcon: { fontSize: moderateScale(32), color: "rgba(255,255,255,0.7)" },
  tutEnemyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: moderateScale(20),
    gap: moderateScale(8),
  },
  tutEnemyDot: {
    width: moderateScale(16),
    height: moderateScale(16),
    borderRadius: moderateScale(2),
    backgroundColor: "#FF0042",
  },
  tutArrow: {
    color: "#FF0042",
    fontSize: moderateScale(22),
    fontFamily: "Orbitron",
    marginHorizontal: moderateScale(4),
  },
  tutPlayerDot: {
    width: moderateScale(22),
    height: moderateScale(22),
    borderRadius: moderateScale(3),
    backgroundColor: "#D3B07A",
    borderWidth: moderateScale(2),
    borderColor: "#FFF",
  },
  tutWaveRow: { flexDirection: "row", gap: moderateScale(10), marginTop: moderateScale(20) },
  tutWaveChip: {
    paddingVertical: moderateScale(8),
    paddingHorizontal: moderateScale(14),
    borderWidth: moderateScale(1),
    borderColor: "rgba(211,176,122,0.3)",
    borderRadius: moderateScale(3),
    alignItems: "center",
  },
  tutWaveChipLabel: { color: "#D3B07A", fontSize: moderateScale(14), fontFamily: "Orbitron" },
  tutWaveChipSpeed: {
    color: "rgba(255,255,255,0.35)",
    fontSize: moderateScale(9),
    letterSpacing: 1,
    marginTop: moderateScale(2),
  },
  tutHint: {
    color: "rgba(255,255,255,0.25)",
    fontSize: moderateScale(11),
    letterSpacing: 2,
    marginTop: moderateScale(20),
    textAlign: "center",
  },
  tutDots: { flexDirection: "row", gap: moderateScale(8), marginTop: moderateScale(24) },
  tutDot: {
    width: moderateScale(6),
    height: moderateScale(6),
    borderRadius: moderateScale(3),
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tutDotActive: { backgroundColor: "#D3B07A", width: moderateScale(20) },
  tutBtn: {
    marginTop: moderateScale(20),
    paddingHorizontal: moderateScale(40),
    paddingVertical: moderateScale(16),
    borderWidth: moderateScale(2),
    width: "100%",
    alignItems: "center",
  },
  tutBtnText: { fontSize: moderateScale(14), fontWeight: "700", letterSpacing: 3 },

  // PROFESSIONAL BRAIN STYLES
  bgImage: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
  },
  contentWrapper: {
    width: "100%",
    paddingHorizontal: moderateScale(24),
    alignItems: "center",
    flex: 1,
  },
  homeHeader: { alignItems: "center", marginBottom: moderateScale(80) },
  neonSub: {
    color: "#D3B07A",
    fontSize: moderateScale(11),
    letterSpacing: 5,
    marginBottom: moderateScale(8),
    fontFamily: "Orbitron",
  },
  titleMain: {
    color: "#FDF8E7",
    fontSize: moderateScale(48),
    fontFamily: "Orbitron",
    letterSpacing: 14,
    textShadowColor: "rgba(253,248,231,0.5)",
    textShadowRadius: moderateScale(15),
  },
  versionContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: moderateScale(10),
    gap: moderateScale(12),
  },
  versionLine: {
    width: moderateScale(40),
    height: 1,
    backgroundColor: "rgba(211,176,122,0.3)",
  },
  versionTag: {
    color: "rgba(211,176,122,0.6)",
    fontSize: moderateScale(10),
    letterSpacing: 4,
    fontWeight: "600",
  },
  championBanner: {
    width: "100%",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    borderRadius: moderateScale(12),
    padding: moderateScale(16),
    alignItems: "center",
    marginBottom: moderateScale(30),
    overflow: "hidden",
  },
  championHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(8),
    marginBottom: moderateScale(4),
  },
  championLabel: {
    color: "#FFD700",
    fontSize: moderateScale(9),
    fontFamily: "Orbitron",
    letterSpacing: 3,
  },
  championName: {
    color: "#FFF",
    fontSize: moderateScale(22),
    fontFamily: "Orbitron",
    letterSpacing: 6,
    marginVertical: moderateScale(4),
  },
  championScoreBox: {
    flexDirection: "row",
    gap: moderateScale(15),
    alignItems: "baseline",
  },
  championScore: {
    color: "rgba(255,255,255,0.6)",
    fontSize: moderateScale(12),
    fontFamily: "Orbitron",
  },
  championWave: {
    color: "#FFD700",
    fontSize: moderateScale(10),
    fontFamily: "Orbitron",
    opacity: 0.8,
  },
  championGlow: {
    position: "absolute",
    top: -50,
    width: "120%",
    height: 100,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    transform: [{ rotate: "-15deg" }],
    zIndex: -1,
  },

  dangerSub: {
    color: "#FF4444",
    fontSize: moderateScale(11),
    letterSpacing: 5,
    marginBottom: moderateScale(8),
    fontFamily: "Orbitron",
  },
  dangerTitle: {
    color: "#FDF8E7",
    fontSize: moderateScale(32),
    fontFamily: "Orbitron",
    letterSpacing: 8,
    textShadowColor: "rgba(255,0,66,0.6)",
    textShadowRadius: moderateScale(20),
  },

  proCard: {
    width: "100%",
    backgroundColor: "#0D0506",
    borderWidth: moderateScale(1),
    borderColor: "rgba(255,100,100,0.1)",
    borderRadius: moderateScale(16),
    marginBottom: moderateScale(32),
  },
  proCardModal: {
    width: "90%",
    backgroundColor: "#080808",
    borderWidth: moderateScale(1),
    borderColor: "rgba(211,176,122,0.2)",
    borderRadius: moderateScale(8),
    overflow: "hidden",
  },
  proCardModalLarge: {
    width: "95%",
    maxHeight: height * 0.8,
    backgroundColor: "#080808",
    borderWidth: moderateScale(1),
    borderColor: "rgba(255,215,0,0.2)",
    borderRadius: moderateScale(12),
    overflow: "hidden",
    padding: moderateScale(10),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: moderateScale(16),
    paddingHorizontal: moderateScale(20),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,100,100,0.05)",
  },
  cardTitle: {
    color: "#D3B07A",
    fontSize: moderateScale(10),
    letterSpacing: 3,
    fontWeight: "700",
  },
  chartBtn: {
    backgroundColor: "rgba(255,100,100,0.1)",
    padding: moderateScale(8),
    borderRadius: moderateScale(6),
  },
  cardTitleGold: {
    color: "#e3b007",
    fontSize: moderateScale(11),
    letterSpacing: 4,
    fontFamily: "Orbitron",
    textAlign: "center",
  },
  cardBody: { padding: moderateScale(24) },

  cardStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  cardStatItem: { alignItems: "center", flex: 1 },
  statDivider: {
    width: 1,
    height: moderateScale(50),
    backgroundColor: "rgba(255,100,100,0.1)",
  },
  statLabel: {
    color: "rgba(211,176,122,0.6)",
    fontSize: moderateScale(9),
    letterSpacing: 2,
    marginBottom: moderateScale(10),
    fontWeight: "600",
  },
  statValue: { color: "#FFF", fontSize: moderateScale(36), fontFamily: "Orbitron" },
  scoreUnderline: {
    width: moderateScale(30),
    height: 2,
    backgroundColor: "#D3B07A",
    marginTop: moderateScale(8),
  },
  rankContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  wreathBadge: {
    width: moderateScale(200),
    height: moderateScale(100),
    justifyContent: "center",
    alignItems: "center",
  },

  gridRow: { flexDirection: "row", justifyContent: "space-between" },
  gridItem: { alignItems: "center" },

  homeActions: { width: "100%", gap: moderateScale(16) },
  secondaryRow: { flexDirection: "row", gap: moderateScale(12) },

  primaryBtn: {
    height: moderateScale(64),
    width: "100%",
    backgroundColor: "#3A0815",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: "rgba(255,100,100,0.2)",
    shadowColor: "#FF0042",
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(20),
    elevation: moderateScale(8),
  },
  primaryBtnText: {
    color: "#FFF",
    fontSize: moderateScale(18),
    fontFamily: "Orbitron",
    letterSpacing: 4,
  },

  primaryBtnRed: {
    height: moderateScale(64),
    width: "100%",
    backgroundColor: "#5A0D1F",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: "rgba(255,100,100,0.3)",
  },
  primaryBtnTextRed: {
    color: "#FFF",
    fontSize: moderateScale(18),
    fontFamily: "Orbitron",
    letterSpacing: 4,
  },

  primaryBtnGold: {
    height: moderateScale(64),
    width: "100%",
    backgroundColor: "#D3B07A",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: moderateScale(16),
  },
  primaryBtnTextGold: {
    color: "#1A0A0A",
    fontSize: moderateScale(16),
    fontFamily: "Orbitron",
    letterSpacing: 3,
  },

  outlineBtn: {
    height: moderateScale(54),
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(211,176,122,0.2)",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    borderRadius: moderateScale(12),
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  outlineBtnText: {
    color: "#E4C79F",
    fontSize: moderateScale(11),
    fontFamily: "Orbitron",
    letterSpacing: 2,
  },

  outlineBtnGold: {
    height: moderateScale(54),
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    borderRadius: moderateScale(12),
    backgroundColor: "#E4C79F",
  },
  outlineBtnTextGold: {
    color: "#2A1B10",
    fontSize: moderateScale(11),
    fontFamily: "Orbitron",
    letterSpacing: 2,
  },

  inputContainer: {
    width: "100%",
    borderBottomWidth: 2,
    borderBottomColor: "#D3B07A",
    marginTop: moderateScale(20),
  },
  lbInput: {
    color: "#D3B07A",
    fontSize: moderateScale(24),
    fontFamily: "Orbitron",
    letterSpacing: 6,
    textAlign: "center",
    paddingVertical: moderateScale(12),
  },
  modalSub: { color: "rgba(255,255,255,0.4)", fontSize: moderateScale(12), letterSpacing: 2 },
  dimBtnText: {
    color: "#444",
    fontSize: moderateScale(12),
    letterSpacing: 2,
    fontWeight: "700",
  },
  cyan: { color: "#D3B07A", fontWeight: "bold" },

  proLbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: moderateScale(14),
    paddingHorizontal: moderateScale(16),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  rowGold: { backgroundColor: "rgba(255,215,0,0.03)" },
  proLbRank: {
    fontSize: moderateScale(18),
    width: moderateScale(30),
    fontFamily: "Orbitron",
    color: "rgba(255,255,255,0.2)",
  },
  proLbName: {
    color: "#FFF",
    fontSize: moderateScale(15),
    fontWeight: "700",
    letterSpacing: 2,
  },
  proLbMeta: {
    color: "rgba(255,255,255,0.2)",
    fontSize: moderateScale(10),
    letterSpacing: 2,
    marginTop: moderateScale(2),
  },
  proLbScore: { color: "#D3B07A", fontSize: moderateScale(22), fontWeight: "900", fontFamily: "Orbitron" },
  hudScore: {
    color: "#FFF",
    fontSize: moderateScale(22),
    fontFamily: "Orbitron",
    textShadowColor: "rgba(211, 176, 122, 0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  lbEmpty: {
    color: "#333",
    fontSize: moderateScale(14),
    letterSpacing: 2,
    textAlign: "center",
    marginVertical: moderateScale(40),
    lineHeight: moderateScale(22),
  },
});
