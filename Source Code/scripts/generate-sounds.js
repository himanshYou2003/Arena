/**
 * ARENA Sound Generator
 * Generates all 3 game sounds as WAV files using pure PCM math.
 * Run: node scripts/generate-sounds.js
 */
const fs   = require('fs');
const path = require('path');

const SR = 44100; // sample rate

function writeWav(filePath, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);       // PCM
  buf.writeUInt16LE(1, 22);       // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);  // byte rate
  buf.writeUInt16LE(2, 32);       // block align
  buf.writeUInt16LE(16, 34);      // 16-bit
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
  console.log('✓ ' + path.basename(filePath));
}

// ── crack.wav ── sharp buzz + noise burst on death ───────────────────────────
function makeCrack() {
  const dur = 0.38, n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env   = Math.pow(1 - t / dur, 2.5);
    const noise = (Math.random() * 2 - 1);
    const buzz  = Math.sin(2 * Math.PI * 90 * Math.exp(-t * 10) * t);
    let sample = env * (noise * 0.65 + buzz * 0.35) * 0.9;
    
    // 2ms linear fade-in to prevent initial pop
    if (i < SR * 0.002) sample *= (i / (SR * 0.002));
    s[i] = sample;
  }
  writeWav('./assets/sounds/crack.wav', s);
}

// ── heartbeat.wav ── clean lub-dub single beat (JS controls repeat rate) ─────
function makeHeartbeat() {
  const dur = 0.55, n = Math.floor(SR * dur);
  const s = new Float32Array(n);

  function addThump(offset, amp, f0) {
    const len = Math.floor(SR * 0.075);
    for (let i = 0; i < len && (offset + i) < n; i++) {
      const t = i / SR;
      const env  = Math.exp(-t * 55) * amp;
      const freq = f0 * Math.exp(-t * 12);
      let sampleValue = env * Math.sin(2 * Math.PI * freq * t);
      
      // 2ms linear fade-in for each thump
      if (i < SR * 0.002) sampleValue *= (i / (SR * 0.002));
      s[offset + i] += sampleValue;
    }
  }

  addThump(Math.floor(0.00 * SR), 0.95, 82); // Lub  (stronger)
  addThump(Math.floor(0.14 * SR), 0.72, 66); // Dub  (softer)
  writeWav('./assets/sounds/heartbeat.wav', s);
}

// ── hit.wav ── synth C-major chord swell on wave reset ───────────────────────
function makeHit() {
  const dur = 0.65, n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  const notes = [261.63, 329.63, 392.00, 523.25]; // C4 E4 G4 C5

  for (let i = 0; i < n; i++) {
    const t   = i / SR;
    const env = (1 - Math.exp(-t * 30)) * Math.exp(-t * 3.5);
    let sum   = 0;
    notes.forEach((f, idx) => {
      sum += Math.sin(2 * Math.PI * f * t)          * (1 - idx * 0.08);
      sum += Math.sin(2 * Math.PI * f * 1.003 * t)  * 0.25; // slight detune shimmer
    });
    let sample = env * sum / (notes.length * 1.4) * 0.88;
    
    // 2ms linear fade-in
    if (i < SR * 0.002) sample *= (i / (SR * 0.002));
    s[i] = sample;
  }
  writeWav('./assets/sounds/hit.wav', s);
}

// ── tick.wav ── short electronic click for countdown ─────────────────────────
function makeTick() {
  const dur = 0.08, n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 80);
    let sample = env * Math.sin(2 * Math.PI * 800 * t);
    
    // 1ms linear fade-in (shorter for click)
    if (i < SR * 0.001) sample *= (i / (SR * 0.001));
    s[i] = sample;
  }
  writeWav('./assets/sounds/tick.wav', s);
}

fs.mkdirSync('./assets/sounds', { recursive: true });
makeCrack();
makeHeartbeat();
makeHit();
makeTick();
console.log('\nAll 4 sounds ready in assets/sounds/');
