# ARENA - Technical Overview & Game Description

## Project Identity
- **Name:** ARENA (arena-2)
- **Version:** 1.0.0
- **Copyright:** © 2026 ARENA. All Rights Reserved.

---

## Game Description
**ARENA** is a minimalist, high-speed survival arcade game. It is designed with a "less is more" philosophy, focusing on pure mechanical skill and visual rhythm.

### Gameplay
- **Player:** A glowing cyan sphere (`#00D1FF`) controlled via direct touch input.
- **Enemies:** Aggressive red nodes (`#FF0042`) that spawn from screen boundaries and home in on the player.
- **Objective:** Survive. The longer you live, the more enemies spawn, increasing the pressure.
- **Scoring:** Points are awarded for survival duration and enemy spawn triggers.
- **Visuals:** Deep black background (`#050505`) with high-contrast neon elements, enhanced by glow effects and subtle micro-animations.

---

## Technology Stack

### Core Framework
- **Expo SDK 54:** leveraging the latest Expo ecosystem for rapid development and stable Android/iOS deployments.
- **React Native 0.81.5:** Using the modern New Architecture for improved responsiveness.
- **TypeScript:** Fully typed codebase for stability and developer efficiency.

### Engineering & Performance
- **Native Animation Driver:** Logic is built using the React Native `Animated` API with `useNativeDriver: true` where possible, offloading animation calculations to the native thread to keep the JavaScript thread free.
- **High-Frequency Logic:** The main game loop uses `requestAnimationFrame` and `useRef` for state management instead of traditional React state updates. This prevents unnecessary re-renders and keeps CPU usage extremely low (ideal for mobile benchmarks).
- **Control System:** Utilizes `PanResponder` for latency-free touch tracking, ensuring the player feels "connected" to the movement.
- **Navigation:** Powered by **Expo Router**, enabling a modern, file-based routing system.

### Build Infrastructure
- **EAS (Expo Application Services):** Configured for managed cloud builds to produce optimized APKs and integration with the Expo ecosystem for distribution.
- **Android Gradle Architecture:** Optimized builds targeting modern Android API levels.

---

## Technical Highlights
- **Engineered for Low CPU:** The game is architected to run smoothly even on entry-level hardware without overheating or draining battery.
- **Premium Aesthetics:** Uses customized HSL-based color palettes and shadow elevations to create a "glassmorphism" look on mobile.
- **Responsive Layout:** Dynamically adjusts to all screen sizes using `Dimensions` and `Flexbox`.
