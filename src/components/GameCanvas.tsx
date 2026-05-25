import { useRef, useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

// --- Sound Effects Utility ---
class SoundManager {
  private ctx: AudioContext | null = null;
  private sfxGainNode: GainNode | null = null;
  private ambientGainNode: GainNode | null = null;
  
  private ambientStarted = false;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;

  private _sfxVolume: number = Number(localStorage.getItem('sfxVolume') ?? 1.0);
  private _musicVolume: number = Number(localStorage.getItem('musicVolume') ?? 1.0);

  get sfxVolume() { return this._sfxVolume; }
  set sfxVolume(val: number) {
    this._sfxVolume = val;
    localStorage.setItem('sfxVolume', val.toString());
    if (this.sfxGainNode && this.ctx) {
      this.sfxGainNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }
  }

  get musicVolume() { return this._musicVolume; }
  set musicVolume(val: number) {
    this._musicVolume = val;
    localStorage.setItem('musicVolume', val.toString());
    if (this.ambientGainNode && this.ctx) {
      this.ambientGainNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }
  }

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.sfxGainNode = this.ctx.createGain();
        this.ambientGainNode = this.ctx.createGain();
        this.sfxGainNode.connect(this.ctx.destination);
        this.ambientGainNode.connect(this.ctx.destination);
        this.sfxGainNode.gain.value = this._sfxVolume;
        this.ambientGainNode.gain.value = this._musicVolume;
      } catch (e) {
        console.error('Web Audio API not supported', e);
      }
    }
  }

  startAmbient() {
    this.init();
    if (!this.ctx || !this.ambientGainNode || this.ambientStarted) return;
    this.ambientStarted = true;
    
    // Wind noise
    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.value = 400;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;

      noise.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.ambientGainNode);
      noise.start();

      // Subtle Synth Drone
      this.droneOsc1 = this.ctx.createOscillator();
      this.droneOsc2 = this.ctx.createOscillator();
      this.droneOsc1.type = 'sine';
      this.droneOsc2.type = 'sine';
      this.droneOsc1.frequency.value = 220;
      this.droneOsc2.frequency.value = 329.63;

      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0;

      this.droneOsc1.connect(this.droneGain);
      this.droneOsc2.connect(this.droneGain);
      this.droneGain.connect(this.ambientGainNode);

      this.droneOsc1.start();
      this.droneOsc2.start();
    } catch (e) {
      console.warn('Failed to start ambient audio', e);
    }
  }

  updateAmbientAudio(height: number, intensity: number) {
    if (!this.ctx || !this.ambientStarted || !this.windGain || !this.windFilter || !this.droneGain || !this.droneOsc1 || !this.droneOsc2) return;

    try {
      const heightProgress = Math.min(1, Math.max(0, height / 20000));
      const normalizedIntensity = Math.min(1, Math.max(0, intensity / 10));

      const targetWindFreq = 400 + (heightProgress * 1500) + (normalizedIntensity * 500);
      const targetWindGain = (0.01 + (heightProgress * 0.04) + (normalizedIntensity * 0.02)) * 0.5;

      const baseFreq = 220 - (heightProgress * 100);
      const targetDroneGain = (0.005 + (heightProgress * 0.015)) * 0.5;

      this.windFilter.frequency.setTargetAtTime(targetWindFreq, this.ctx.currentTime, 0.5);
      this.windGain.gain.setTargetAtTime(targetWindGain, this.ctx.currentTime, 0.5);
      
      this.droneOsc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 1.0);
      this.droneOsc2.frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 1.0);
      this.droneGain.gain.setTargetAtTime(targetDroneGain, this.ctx.currentTime, 1.0);
    } catch (e) {
      // Ignore errors if context is in a weird state
    }
  }

  stopAmbient() {
    if (!this.ctx || !this.ambientStarted || !this.windGain || !this.droneGain) return;
    try {
      this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      this.droneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    } catch (e) {}
  }

  playJump() {
    this.init();
    if (!this.ctx || !this.sfxGainNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playSpring() {
    this.init();
    if (!this.ctx || !this.sfxGainNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playPowerup() {
    this.init();
    if (!this.ctx || !this.sfxGainNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.setValueAtTime(880, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playJetpack() {
    this.init();
    if (!this.ctx || !this.sfxGainNode) return;
    const osc = this.ctx.createOscillator();
    const noise = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    
    // Low frequency rumble
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(60, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.5);
    
    // Noise for a whoosh effect
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

    osc.connect(gain);
    noise.connect(gain);
    gain.connect(this.sfxGainNode);
    
    osc.start();
    noise.start();
    osc.stop(this.ctx.currentTime + 0.5);
    noise.stop(this.ctx.currentTime + 0.5);
  }

  playEnemyAttack() {
    this.init();
    if (!this.ctx || !this.sfxGainNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playEnemyPop() {
    this.init();
    if (!this.ctx || !this.sfxGainNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playBreak() {
    this.init();
    if (!this.ctx || !this.sfxGainNode) return;
    try {
      const bufferSize = this.ctx.sampleRate * 0.1;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
      noise.connect(gain);
      gain.connect(this.sfxGainNode);
      noise.start();
    } catch (e) {
      // Ignore buffer errors if context is in a weird state
    }
  }

  playDive() {
    this.init();
    if (!this.ctx || !this.sfxGainNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

export const sounds = new SoundManager();

export interface ScoreEntry {
  userId: string;
  displayName: string;
  score: number;
  maxHeight: number;
}

const CONSTANTS = {
  GRAVITY: 0.25,
  JUMP_FORCE: 9,
  SPRING_FORCE: 15,
  JETPACK_FORCE: 20,
  MOVE_SPEED: 5,
  DIVE_FORCE: 22,
  DIVE_DURATION: 12,
  DIVE_COOLDOWN: 40,
  GAME_WIDTH: 420,
  GAME_HEIGHT: 680,
  PLAYER_WIDTH: 48,
  PLAYER_HEIGHT: 56,
  PLATFORM_WIDTH: 80,
  PLATFORM_HEIGHT: 16,
  ENEMY_SIZE: 40,
  POWERUP_SIZE: 24,
  MAX_JETPACK_FUEL: 180, // 3 seconds
};

type PlatformType = 'normal' | 'moving' | 'breaking';

interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: PlatformType;
  moveDirection?: number; // 1 or -1
  broken?: boolean;
  breakingProgress?: number; // 1.0 down to 0
}

type EnemyExpression = 'angry' | 'surprised' | 'sneaky' | 'focused' | 'grinning' | 'smirk';
type EnemyType = 'lunger' | 'shooter' | 'sweeper' | 'circler' | 'mine-dropper' | 'bubble-weaver';

interface Enemy {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: EnemyType;
  expression: EnemyExpression;
  lungeTimer?: number; // Frames remaining in lunge animation
  attackCooldown?: number;
  moveDirection?: number;
  swingTimer?: number;
  angle?: number;
  radius?: number;
  pivotX?: number;
  pivotY?: number;
}

interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type?: 'normal' | 'mine' | 'trap-bubble';
}

interface Powerup {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'spring' | 'jetpack';
  collected?: boolean;
}

interface Player {
  x: number;
  y: number;
  vy: number;
  vx: number;
  width: number;
  height: number;
  jetpackFuel: number;
  invincibleTimer: number;
  walkCycle: number;
  squashFactor: number; // 1.0 is normal, < 1.0 is squashed, > 1.0 is stretched
  isDiving: boolean;
  diveTimer: number;
  diveCooldown: number;
  bubbleEncasedTimer: number;
}

interface BackgroundElement {
  id: string;
  x: number;
  y: number;
  size: number;
  parallaxSpeed: number; 
  type: 'bubbles' | 'plankton' | 'glow-speck' | 'geometry' | 'star' | 'nebula' | 'ancient-ruin' | 'mini-jelly' | 'mini-coral' | 'whale' | 'shark' | 'castle' | 'sunken-ship' | 'underwater-flower';
  geometryShape?: 'diamond' | 'circle' | 'triangle' | 'octagon';
  rot?: number;
  rotSpeed?: number;
  alpha?: number;
  color?: string;
  vx?: number;
  baseY?: number;
}

interface DustParticle {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  color: string;
}

interface SceneryElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parallaxSpeed: number;
  type: 'coral' | 'jellyfish' | 'large-kelp' | 'distant-mountain' | 'fish-school' | 'light-ray' | 'shadow-beast' | 'octopus' | 'anemone' | 'sea-star' | 'bubbles-vent' | 'sea-turtle' | 'kelp';
  color?: string;
  pulseOffset: number;
  mountainPoints?: {x: number, y: number}[];
  beastType?: 'whale' | 'serpent';
}

interface VisualEffect {
  id: string;
  x: number;
  y: number;
  type: 'poof' | 'spring-boost' | 'jetpack-ignite' | 'sparkle' | 'ring-expand' | 'burst';
  timer: number; // Duration in frames
  maxTimer: number;
  color?: string;
  vx?: number;
  vy?: number;
  size?: number;
}

let platforms: Platform[] = [];
let backgroundElements: BackgroundElement[] = [];
let sceneryElements: SceneryElement[] = [];
let foregroundElements: SceneryElement[] = [];
let dustParticles: DustParticle[] = [];
let visualEffects: VisualEffect[] = [];
let projectiles: Projectile[] = [];
let enemies: Enemy[] = [];
let powerups: Powerup[] = [];
let player: Player = { 
  x: 200, 
  y: 500, 
  vy: 0, 
  vx: 0, 
  width: CONSTANTS.PLAYER_WIDTH, 
  height: CONSTANTS.PLAYER_HEIGHT, 
  jetpackFuel: 0, 
  invincibleTimer: 0,
  walkCycle: 0, 
  squashFactor: 1,
  isDiving: false,
  diveTimer: 0,
  diveCooldown: 0,
  bubbleEncasedTimer: 0
};
let score = 0;
let highestY = 500;
let cameraY = 0;
let isGameOver = false;
let isGameStarted = false;
let isPaused = false;
let springGlowTimer = 0;
let enemiesDefeatedThisRun = 0;
let globalBeat = 0;
let shockPulse = 0;
let screenShakeFrames = 0;
let screenShakeIntensity = 0;

// Keys
const keys = {
  left: false,
  right: false,
  dive: false,
  tiltX: 0,
  gamepadX: 0,
  gamepadDive: false,
};

window.addEventListener('deviceorientation', (e) => {
  if (e.gamma !== null) {
    // gamma is left-to-right tilt in degrees [-90, 90]
    // Normalize: -25 to 25 degrees covers most natural tilt ranges
    // We use a deadzone of roughly 2 degrees
    if (Math.abs(e.gamma) > 2) {
      keys.tiltX = Math.max(-1, Math.min(1, e.gamma / 25));
    } else {
      keys.tiltX = 0;
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') keys.dive = true;
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') keys.dive = false;
});

window.addEventListener('touchstart', (e) => {
  // Only dive on tap if it's a mobile-like touch interaction
  keys.dive = true;
}, { passive: false });

window.addEventListener('touchend', (e) => {
  keys.dive = false;
}, { passive: false });

function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function initGame() {
  platforms = [];
  enemies = [];
  powerups = [];
  backgroundElements = [];
  sceneryElements = [];
  foregroundElements = [];
  dustParticles = [];
  projectiles = [];
  visualEffects = [];
  player = { 
    x: isGameStarted ? (CONSTANTS.GAME_WIDTH / 2 - CONSTANTS.PLAYER_WIDTH / 2) : (CONSTANTS.GAME_WIDTH * 0.75 - CONSTANTS.PLAYER_WIDTH / 2), 
    y: CONSTANTS.GAME_HEIGHT - 120, 
    vy: 0, 
    vx: 0, 
    width: CONSTANTS.PLAYER_WIDTH, 
    height: CONSTANTS.PLAYER_HEIGHT, 
    jetpackFuel: 0,
    invincibleTimer: 0,
    walkCycle: 0,
    squashFactor: 1,
    isDiving: false,
    diveTimer: 0,
    diveCooldown: 0,
    bubbleEncasedTimer: 0
  };
  score = 0;
  highestY = player.y;
  cameraY = 0;
  isGameOver = false;
  isPaused = false;
  springGlowTimer = 0;
  enemiesDefeatedThisRun = 0;
  screenShakeFrames = 0;
  screenShakeIntensity = 0;

  // Initialize Sea Dust (Glowing Sand)
  for (let i = 0; i < 40; i++) {
    const r = Math.random();
    dustParticles.push({
      x: random(0, CONSTANTS.GAME_WIDTH),
      y: random(0, CONSTANTS.GAME_HEIGHT),
      size: random(1, 3),
      vx: random(-0.1, 0.1),
      vy: random(-0.05, 0.05),
      color: r > 0.7 ? '#86efac' : (r > 0.4 ? '#93c5fd' : '#c084fc') // light neon tones
    });
  }

  // Base platform
  platforms.push({
    id: Math.random().toString(),
    x: player.x - 26,
    y: player.y + CONSTANTS.PLAYER_HEIGHT,
    width: 100,
    height: CONSTANTS.PLATFORM_HEIGHT,
    type: 'normal',
  });

  generatePlatforms(CONSTANTS.GAME_HEIGHT, -1000);
  generateBackground(CONSTANTS.GAME_HEIGHT, -1000);
  generateScenery(CONSTANTS.GAME_HEIGHT, -1000);
}

function generateScenery(startY: number, endY: number) {
  let currY = startY;
  while (currY > endY) {
    const depthProgress = Math.min(1, Math.max(0, -currY / 20000));
    let type: 'coral' | 'jellyfish' | 'large-kelp' | 'distant-mountain' | 'fish-school' | 'light-ray' | 'shadow-beast' | 'octopus' | 'anemone' | 'sea-star' | 'bubbles-vent' | 'sea-turtle' | 'kelp' = 'large-kelp';
    let width = random(100, 250);
    let height = random(120, 300);
    let color: string | undefined = undefined;
    let mountainPoints: {x: number, y: number}[] | undefined = undefined;

    let beastType: 'whale' | 'serpent' | undefined = undefined;

    const r = Math.random();
    if (r > 0.95) {
      type = 'light-ray';
      width = random(80, 200);
      height = random(1200, 2000);
      color = `rgba(255, 255, 255, ${0.12 * (1 - depthProgress)})`;
    } else if (r > 0.92) {
      type = 'sea-turtle';
      width = random(80, 150);
      height = width * 0.7;
      color = 'rgba(20, 83, 45, 0.4)';
    } else if (r > 0.88) {
      type = 'bubbles-vent';
      width = 40;
      height = 100;
    } else if (r > 0.82) {
      type = 'shadow-beast';
      width = random(400, 800);
      height = width * 0.3;
      beastType = Math.random() > 0.3 ? 'whale' : 'serpent';
      color = 'rgba(15, 23, 42, 0.12)';
    } else if (r > 0.76) {
      type = 'octopus';
      width = random(120, 240);
      height = width * 1.6;
      const colors = [
        'rgba(239, 68, 68, 0.2)', 
        'rgba(168, 85, 247, 0.2)',
        'rgba(59, 130, 246, 0.2)'
      ];
      color = colors[Math.floor(Math.random() * colors.length)];
    } else if (r > 0.70) {
      type = 'fish-school';
      width = random(120, 250);
      height = random(60, 120);
      color = `rgba(${random(150, 255)}, ${random(150, 255)}, ${random(150, 255)}, 0.35)`;
    } else if (r > 0.62) {
      type = 'distant-mountain';
      width = random(400, 800);
      height = random(200, 500);
      const mColors = ['rgba(15, 23, 42, 0.3)', 'rgba(30, 41, 59, 0.2)', 'rgba(51, 65, 85, 0.15)'];
      color = mColors[Math.floor(Math.random() * mColors.length)];
      
      mountainPoints = [];
      const segments = 6;
      for (let i = 0; i <= segments; i++) {
        mountainPoints.push({
          x: (i / segments) * width,
          y: i === 0 || i === segments ? height : height - random(height * 0.4, height)
        });
      }
    } else if (r > 0.52) {
      type = 'jellyfish';
      width = random(100, 250);
      height = width * 1.4;
      const jColors = [
        'rgba(192, 132, 252, 0.25)',
        'rgba(34, 211, 238, 0.25)', 
        'rgba(244, 114, 182, 0.25)',
      ];
      color = jColors[Math.floor(Math.random() * jColors.length)];
    } else if (r > 0.42) {
      type = 'anemone';
      width = random(40, 100);
      height = width * 0.8;
      const aColors = ['rgba(248, 113, 113, 0.4)', 'rgba(236, 72, 153, 0.4)', 'rgba(168, 85, 247, 0.4)'];
      color = aColors[Math.floor(Math.random() * aColors.length)];
    } else if (r > 0.32) {
      type = 'sea-star';
      width = random(30, 60);
      height = width;
      const sColors = ['rgba(251, 191, 36, 0.5)', 'rgba(248, 113, 113, 0.5)', 'rgba(251, 146, 60, 0.5)'];
      color = sColors[Math.floor(Math.random() * sColors.length)];
    } else if (r > 0.2) {
      type = 'kelp';
      width = random(20, 50);
      height = random(150, 400);
      color = `rgba(16, 185, 129, ${0.15 + depthProgress * 0.1})`;
    } else if (r > 0.1) {
      type = 'large-kelp';
    } else {
      type = 'coral';
      width = random(200, 400);
      height = random(120, 300);
      const cColors = ['rgba(248, 113, 113, 0.2)', 'rgba(52, 211, 153, 0.2)', 'rgba(251, 191, 36, 0.2)', 'rgba(251, 146, 60, 0.2)'];
      color = cColors[Math.floor(Math.random() * cColors.length)];
    }

    // Diverse parallax speeds - Distant to Mid
    const parallaxSpeed = type === 'shadow-beast' ? random(0.02, 0.05) :
                         (type === 'octopus' ? random(0.1, 0.2) :
                         (type === 'light-ray' ? random(0.04, 0.08) :
                         (type === 'bubbles-vent' ? random(0.2, 0.4) :
                         (type === 'distant-mountain' ? random(0.02, 0.06) : 
                         (type === 'coral' || type === 'anemone' ? random(0.2, 0.4) :
                         (type === 'sea-turtle' ? random(0.08, 0.15) :
                         (type === 'sea-star' ? random(0.25, 0.45) :
                         (type === 'large-kelp' || type === 'kelp' ? random(0.15, 0.3) : random(0.1, 0.5)))))))));

    // Foreground blur effect for high parallax
    const isForeground = Math.random() < 0.12 && (type === 'coral' || type === 'large-kelp' || type === 'anemone' || type === 'fish-school' || type === 'kelp');
    const finalParallax = isForeground ? random(1.2, 1.8) : parallaxSpeed;

    const element = {
      id: Math.random().toString(),
      x: random(-200, CONSTANTS.GAME_WIDTH),
      y: currY,
      width,
      height,
      parallaxSpeed: finalParallax,
      type,
      color,
      pulseOffset: Math.random() * Math.PI * 2,
      mountainPoints,
      beastType
    };

    if (finalParallax > 1) {
      foregroundElements.push(element);
    } else {
      sceneryElements.push(element);
    }
    
    currY -= random(150, 400); // Increased density
  }
}

function generateBackground(startY: number, endY: number) {
  let currY = startY;
  if (startY > -48666 && endY <= -48666) {
    backgroundElements.push({
      id: Math.random().toString(),
      x: random(100, CONSTANTS.GAME_WIDTH - 300),
      y: -48666,
      size: random(500, 800),
      parallaxSpeed: 0.3,
      type: 'castle' as any,
    } as any);
  }
  
  if (startY > -98666 && endY <= -98666) {
    backgroundElements.push({
      id: Math.random().toString(),
      x: random(100, CONSTANTS.GAME_WIDTH - 400),
      y: -98666,
      size: random(600, 900),
      parallaxSpeed: 0.3,
      type: 'sunken-ship' as any,
    } as any);
  }

  while (currY > endY) {
    const rand = Math.random();
    let type: string = 'plankton';
    
    // Deeper ocean has higher chance of interesting elements
    const midOcean = currY < -5000;
    const deepOcean = currY < -15000;
    const flowerZone = currY < -25000; // 250,000 score
    const abyss = currY < -50000; // Corresponds to Score: 500,000
    const millions = currY < -100000; // 1,000,000 score

    if (flowerZone && rand > 0.94) type = 'underwater-flower';
    else if (deepOcean && rand > 0.92) type = 'whale'; 
    else if (deepOcean && rand > 0.90) type = 'ancient-ruin';
    else if (rand > 0.88) type = 'whale'; 
    else if (rand > 0.84) type = 'shark';
    else if (rand > 0.82) type = 'ancient-ruin';
    else if (rand > 0.80) type = 'mini-coral';
    else if (rand > 0.75) type = 'mini-jelly';
    else if (rand > 0.70) type = 'nebula';
    else if (rand > 0.65) type = 'star';
    else if (rand > 0.55) type = 'geometry';
    else if (rand > 0.35) type = 'bubbles';
    else if (rand > 0.15) type = 'glow-speck';

    const shapes: ('diamond' | 'circle' | 'triangle' | 'octagon')[] = ['diamond', 'circle', 'triangle', 'octagon'];
    
    const size = type === 'sunken-ship' ? random(800, 1500) :
                type === 'castle' ? random(400, 800) :
                type === 'underwater-flower' ? random(30, 80) :
                (type === 'whale' ? random(200, 500) :
                (type === 'shark' ? random(80, 150) :
                (type === 'ancient-ruin' ? random(60, 120) :
                (type === 'mini-coral' ? random(40, 80) :
                (type === 'mini-jelly' ? random(15, 30) :
                (type === 'nebula' ? random(150, 400) : 
                (type === 'star' ? random(1, 2) : 
                (type === 'geometry' ? random(20, 80) : 
                (type === 'bubbles' ? random(4, 12) : random(1, 4))))))))));

    const pSpeed = type === 'sunken-ship' ? random(0.001, 0.003) :
                  type === 'castle' ? random(0.001, 0.005) :
                  type === 'underwater-flower' ? random(0.05, 0.1) :
                  (type === 'whale' ? random(0.002, 0.008) :
                  (type === 'shark' ? random(0.01, 0.05) :
                  (type === 'ancient-ruin' ? random(0.05, 0.15) :
                  (type === 'mini-coral' ? random(0.05, 0.1) :
                  (type === 'mini-jelly' ? random(0.05, 0.15) :
                  (type === 'nebula' ? random(0.005, 0.015) :
                  (type === 'star' ? random(0.01, 0.05) : 
                  (type === 'geometry' ? random(0.1, 0.25) : 
                  (type === 'bubbles' ? random(0.4, 0.8) : random(0.1, 0.4))))))))));;

    const nebColors = ['rgba(168, 85, 247, 0.05)', 'rgba(34, 211, 238, 0.05)', 'rgba(236, 72, 153, 0.05)'];
    const coralColors = ['rgba(248, 113, 113, 0.1)', 'rgba(52, 211, 153, 0.1)', 'rgba(251, 191, 36, 0.1)'];
    const flowerColors = ['rgba(236, 72, 153, 0.3)', 'rgba(168, 85, 247, 0.3)', 'rgba(56, 189, 248, 0.3)', 'rgba(250, 204, 21, 0.3)', 'rgba(248, 113, 113, 0.3)'];

    backgroundElements.push({
      id: Math.random().toString(),
      x: random(-100, CONSTANTS.GAME_WIDTH),
      y: currY,
      size,
      parallaxSpeed: pSpeed,
      type,
      geometryShape: shapes[Math.floor(Math.random() * shapes.length)],
      rot: Math.random() * Math.PI * 2,
      rotSpeed: random(-0.01, 0.01),
      alpha: type === 'star' ? random(0.2, 0.8) : (type === 'nebula' ? 1.0 : undefined),
      color: type === 'nebula' ? nebColors[Math.floor(Math.random() * nebColors.length)] : 
             (type === 'mini-coral' ? coralColors[Math.floor(Math.random() * coralColors.length)] : 
             (type === 'underwater-flower' ? flowerColors[Math.floor(Math.random() * flowerColors.length)] : undefined)),
      vx: type === 'whale' ? random(0.2, 0.5) * (Math.random() > 0.5 ? 1 : -1) : (type === 'shark' ? random(0.8, 1.5) * (Math.random() > 0.5 ? 1 : -1) : 0),
      baseY: currY,
    } as any);
    
    currY -= random(80, 250);
  }
}

function generatePlatforms(startY: number, endY: number) {
  let currY = startY - 80;
  while (currY > endY) {
    const isMoving = Math.random() < (score > 10000 ? 0.3 : 0.1);
    const isBreaking = !isMoving && Math.random() < 0.2;
    const type: PlatformType = isMoving ? 'moving' : isBreaking ? 'breaking' : 'normal';
    
    const p: Platform = {
      id: Math.random().toString(),
      x: random(0, CONSTANTS.GAME_WIDTH - CONSTANTS.PLATFORM_WIDTH),
      y: currY,
      width: CONSTANTS.PLATFORM_WIDTH,
      height: CONSTANTS.PLATFORM_HEIGHT,
      type,
      moveDirection: isMoving ? (Math.random() > 0.5 ? 1 : -1) : 0
    };
    platforms.push(p);

    // Add powerup?
    if (type === 'normal' && Math.random() < 0.1) {
      const isJetpack = Math.random() < 0.2;
      powerups.push({
        id: Math.random().toString(),
        x: p.x + p.width / 2 - CONSTANTS.POWERUP_SIZE / 2,
        y: p.y - CONSTANTS.POWERUP_SIZE,
        width: CONSTANTS.POWERUP_SIZE,
        height: CONSTANTS.POWERUP_SIZE,
        type: isJetpack ? 'jetpack' : 'spring',
      });
    }

    // Add enemy?
    if (type === 'normal' && Math.random() < 0.05 && score > 5000) {
      const expressions: EnemyExpression[] = ['angry', 'surprised', 'sneaky', 'focused', 'grinning', 'smirk'];
      const enemyTypes: EnemyType[] = ['lunger', 'shooter', 'sweeper', 'circler', 'mine-dropper'];
      const enemyType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
      
      const spawnX = random(0, CONSTANTS.GAME_WIDTH - CONSTANTS.ENEMY_SIZE);
      const spawnY = currY - CONSTANTS.ENEMY_SIZE - random(20, 100);

      const width = CONSTANTS.ENEMY_SIZE;
      const height = CONSTANTS.ENEMY_SIZE;

      enemies.push({
        id: Math.random().toString(),
        x: spawnX,
        y: spawnY,
        width,
        height,
        type: enemyType,
        expression: enemyType === 'shooter' ? 'focused' : (enemyType === 'sweeper' || enemyType === 'mine-dropper' ? 'grinning' : (enemyType === 'circler' ? 'smirk' : expressions[Math.floor(Math.random() * 3)])),
        attackCooldown: 0,
        moveDirection: enemyType === 'sweeper' || enemyType === 'mine-dropper' ? (Math.random() > 0.5 ? 1 : -1) : 0,
        angle: enemyType === 'circler' ? Math.random() * Math.PI * 2 : 0,
        radius: enemyType === 'circler' ? random(40, 70) : 0,
        pivotX: spawnX,
        pivotY: spawnY
      });
    }

    currY -= random(50, 120);
  }
}

export type HatType = 'none' | 'tophat' | 'cap' | 'crown' | 'astronaut' | 'ninja' | 'pirate' | 'alien';

export function useGameLoop(onGameOver: (finalScore: number, finalHeight: number, enemiesDefeated: number) => void, onScoreUpdate: (score: number, maxHeight: number) => void, hatType: HatType = 'none') {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const update = () => {
      globalBeat += 1;
      shockPulse = 0; // Shaking and pulsing disabled by user request

      const depthProgress = Math.min(1, Math.max(0, -cameraY / 20000));
      const currentX = Math.sin(Date.now() / 4000) * (0.5 + depthProgress * 2);
      const currentY = Math.cos(Date.now() / 5000) * (0.1 + depthProgress * 0.5);

      // Update background and scenery movement even in menu
      for (const bg of backgroundElements) {
        if (bg.type !== 'castle' && bg.type !== 'sunken-ship' && bg.type !== 'geometry' && bg.type !== 'ancient-ruin') {
           bg.x += currentX * bg.parallaxSpeed * 0.5;
        }

        if (bg.type === 'bubbles') {
          bg.y -= 1.2; // Rise up
          if (bg.y < cameraY - 200) bg.y = cameraY + CONSTANTS.GAME_HEIGHT + 200;
        } else if (bg.type === 'castle') {
          // Castle is solid and doesn't move much
          bg.x += Math.sin(globalBeat * 0.002 + bg.y) * 0.1;
        } else if (bg.type === 'geometry') {
          bg.rot = (bg.rot || 0) + (bg.rotSpeed || 0) * (1 + shockPulse * 2);
          bg.y -= 0.5 + shockPulse * 2;
          if (bg.y < cameraY - 500) bg.y = cameraY + CONSTANTS.GAME_HEIGHT + 500;
        } else if (bg.type === 'star' || bg.type === 'nebula') {
          // Vast and distant
        } else if (bg.type === 'whale' || bg.type === 'shark') {
          if (bg.vx) bg.x += bg.vx;
          if (bg.baseY !== undefined) {
             const bobSpeed = bg.type === 'whale' ? 0.01 : 0.05;
             const bobAmount = bg.type === 'whale' ? 40 : 20;
             bg.y = bg.baseY + Math.sin(globalBeat * bobSpeed) * bobAmount;
          }
          if (bg.x < -1000) bg.x = CONSTANTS.GAME_WIDTH + 1000;
          if (bg.x > CONSTANTS.GAME_WIDTH + 1000) bg.x = -1000;
        } else if (bg.type === 'mini-jelly') {
          bg.y -= 0.3; // Distant jellies swim up
          bg.x += Math.sin(globalBeat * 0.008 + bg.y) * 0.15;
          if (bg.y < cameraY - 800) bg.y = cameraY + CONSTANTS.GAME_HEIGHT + 800;
        } else if (bg.type === 'mini-coral' || bg.type === 'underwater-flower') {
          // Static but sway slightly
          bg.x += Math.sin(globalBeat * 0.005 + bg.y) * 0.05;
        } else {
          bg.x += Math.sin(globalBeat * 0.01 + bg.y) * 0.3; // Side drift
          bg.y += 0.2; // Plankton sinks slowly
          if (bg.y > cameraY + CONSTANTS.GAME_HEIGHT + 400) bg.y = cameraY - 400;
        }
      }

      for (const s of sceneryElements) {
        if (s.type === 'jellyfish') {
          s.y -= 0.5; // Jellyfish swim up slowly
          s.x += Math.sin(globalBeat * 0.005 + s.y) * 0.2;
          if (s.y < cameraY - 800) s.y = cameraY + CONSTANTS.GAME_HEIGHT + 800;
        }
      }

      // Dust Particles Logic
      for (const d of dustParticles) {
        d.x += d.vx + currentX;
        d.y += d.vy + currentY;
        if (d.x < 0) d.x = CONSTANTS.GAME_WIDTH;
        if (d.x > CONSTANTS.GAME_WIDTH) d.x = 0;
        if (d.y > cameraY + CONSTANTS.GAME_HEIGHT) d.y = cameraY - 20;
      }

      if (!isGameStarted) {
        player.y += player.vy;
        player.vy += CONSTANTS.GRAVITY;
        
        // update squash factor visually like in normal play
        player.squashFactor += (1 - player.squashFactor) * 0.1;
        
        const startPlatform = platforms[0];
        if (startPlatform && player.vy > 0 && player.y + player.height >= startPlatform.y && player.y + player.height <= startPlatform.y + startPlatform.height + player.vy) {
          player.vy = -CONSTANTS.JUMP_FORCE;
          player.y = startPlatform.y - player.height;
          player.squashFactor = 0.5;
          sounds.playJump();
          
          for (let i = 0; i < 5; i++) {
             visualEffects.push({
               id: Math.random().toString(),
               x: player.x + player.width/2,
               y: player.y + player.height,
               vx: random(-2, 2),
               vy: random(-2, 0),
               timer: 20,
               maxTimer: 20,
               color: '#fff',
               type: 'sparkle'
             });
          }
        }
        
        // visual effects update
        for (let i = visualEffects.length - 1; i >= 0; i--) {
          const v = visualEffects[i];
          if (v.vx) v.x += v.vx;
          if (v.vy) v.y += v.vy;
          v.timer--;
          if (v.timer <= 0) visualEffects.splice(i, 1);
        }
        
        return;
      }

      if (isGameOver) return;

      // Player Movement
      if (player.bubbleEncasedTimer > 0) {
        player.vx = Math.sin(player.bubbleEncasedTimer * 0.1) * 2; // Wobble only
        player.x += player.vx;
      } else {
        if (keys.left || keys.gamepadX < -0.1) {
          player.vx = -CONSTANTS.MOVE_SPEED;
        } else if (keys.right || keys.gamepadX > 0.1) {
          player.vx = CONSTANTS.MOVE_SPEED;
        } else if (Math.abs(keys.tiltX) > 0.05) {
          player.vx = keys.tiltX * CONSTANTS.MOVE_SPEED;
        } else if (Math.abs(keys.gamepadX) > 0.1) {
          player.vx = keys.gamepadX * CONSTANTS.MOVE_SPEED;
        } else {
          player.vx = 0;
        }
        player.x += player.vx;
      }

      // Screen wrap
      if (player.x + player.width < 0) player.x = CONSTANTS.GAME_WIDTH;
      else if (player.x > CONSTANTS.GAME_WIDTH) player.x = -player.width;

      // Jetpack / Gravity
      if (player.bubbleEncasedTimer > 0) {
        player.bubbleEncasedTimer--;
        if (player.bubbleEncasedTimer === 0) {
           // Bubble pops
           sounds.playBreak();
           for (let k = 0; k < 5; k++) {
             visualEffects.push({
               id: Math.random().toString(),
               x: player.x + player.width / 2 + random(-20, 20),
               y: player.y + player.height / 2 + random(-20, 20),
               type: 'poof',
               timer: 15,
               maxTimer: 15
             });
           }
        }
        player.vy = -3.5; // Floats up
        player.isDiving = false;
      } else if (player.diveTimer > 0) {
        player.vy = CONSTANTS.DIVE_FORCE;
        player.diveTimer--;
        player.isDiving = true;

        // Subtle magnet effect towards nearest platform below
        const platformBelow = platforms
          .filter(p => !p.broken && p.y > player.y + player.height / 2)
          .sort((a, b) => a.y - b.y)[0];
        
        if (platformBelow) {
          const targetX = platformBelow.x + platformBelow.width / 2 - player.width / 2;
          const dx = targetX - player.x;
          player.vx += dx * 0.06; // Magnet pull
        }
        
        // Spawn dive bubbles
        if (globalBeat % 2 === 0) {
          visualEffects.push({
            id: Math.random().toString(),
            x: player.x + player.width / 2 + random(-10, 10),
            y: player.y + random(0, player.height),
            type: 'sparkle',
            timer: 15,
            maxTimer: 15,
            vx: -player.vx * 0.2 + random(-1, 1),
            vy: -player.vy * 0.5 + random(-1, 1),
            color: '#7dd3fc'
          });
        }
      } else {
        player.isDiving = false;
        if (player.diveCooldown > 0) player.diveCooldown--;

        if ((keys.dive || keys.gamepadDive) && player.diveCooldown === 0 && player.bubbleEncasedTimer <= 0) {
          player.diveTimer = CONSTANTS.DIVE_DURATION;
          player.diveCooldown = CONSTANTS.DIVE_COOLDOWN;
          player.vy = CONSTANTS.DIVE_FORCE;
          player.squashFactor = 1.4; // Stretch while diving
          sounds.playDive();
        }

        if (player.jetpackFuel > 0) {
          player.vy = -CONSTANTS.JETPACK_FORCE;
          player.jetpackFuel--;
          if (player.jetpackFuel <= 0) {
            player.invincibleTimer = 180; // 3 seconds at 60fps
          }
        } else {
          player.vy += CONSTANTS.GRAVITY;
        }

        if (player.invincibleTimer > 0) {
          player.invincibleTimer--;
        }
      }
      player.y += player.vy;

      // Update Squash and Stretch
      if (player.vy < -2) {
        // Stretching up
        player.squashFactor = Math.min(1.3, player.squashFactor + (1.3 - player.squashFactor) * 0.1);
      } else if (player.vy > 0) {
        // Returning to normal while falling
        player.squashFactor = player.squashFactor + (1.0 - player.squashFactor) * 0.1;
      } else {
        // Settling
        player.squashFactor = player.squashFactor + (1.0 - player.squashFactor) * 0.15;
      }

      // Update Walk Cycle
      if (Math.abs(player.vx) > 0) {
        player.walkCycle += 0.15;
      } else {
        player.walkCycle = 0;
      }

      // Camera logic (scroll up when player moves high)
      if (player.y < cameraY + CONSTANTS.GAME_HEIGHT / 2) {
        const diff = (cameraY + CONSTANTS.GAME_HEIGHT / 2) - player.y;
        cameraY -= diff;
        score = Math.floor(Math.max(score, -cameraY * 10));
        highestY = Math.min(highestY, player.y);
        
        // Generate new platforms
        const minPlatformY = platforms.length > 0 ? Math.min(...platforms.map(p => p.y)) : player.y;
        if (minPlatformY > cameraY - 500) {
           generatePlatforms(minPlatformY, cameraY - 1500);
        }

        const minBgY = backgroundElements.length > 0 ? Math.min(...backgroundElements.map(b => b.y)) : cameraY;
        if (minBgY > cameraY - 500) {
           generateBackground(minBgY, cameraY - 1500);
        }

        const minSceneryY = sceneryElements.length > 0 ? Math.min(...sceneryElements.map(s => s.y)) : cameraY;
        if (minSceneryY > cameraY - 500) {
           generateScenery(minSceneryY, cameraY - 1500);
        }
      }

      onScoreUpdate(score, Math.floor(Math.max(0, -highestY + 500))); // Just some height metric

      // Check game over
      if (player.y > cameraY + CONSTANTS.GAME_HEIGHT) {
        isGameOver = true;
        onGameOver(score, Math.floor(Math.max(0, -highestY + 500)), enemiesDefeatedThisRun);
      }

      // Collisions
      // Platforms (only on falling)
      if (player.vy > 0) {
        for (let i = 0; i < platforms.length; i++) {
          const p = platforms[i];
          if (p.broken) continue;

          // Check overlap
          const collisionMargin = player.isDiving ? player.vy + 10 : 15;
          if (
            player.x + player.width - 10 > p.x &&
            player.x + 10 < p.x + p.width &&
            player.y + player.height >= p.y &&
            player.y + player.height - player.vy <= p.y + collisionMargin
          ) {
            if (p.type === 'breaking' && p.breakingProgress === undefined) {
              p.breakingProgress = 1.0;
              sounds.playBreak();
            }
            player.vy = -CONSTANTS.JUMP_FORCE;
            player.squashFactor = 0.6; // Squash on impact
            player.diveTimer = 0;
            player.isDiving = false;
            sounds.playJump();
          }
        }
      }

      // Projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Collision with player
        const dx = (player.x + player.width / 2) - p.x;
        const dy = (player.y + player.height / 2) - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < p.radius + 15) {
          if (player.jetpackFuel > 0 || player.isDiving || player.invincibleTimer > 0) {
             projectiles.splice(i, 1);
          } else if (p.type === 'trap-bubble') {
             player.bubbleEncasedTimer = 120;
             projectiles.splice(i, 1);
          } else {
            isGameOver = true;
            onGameOver(score, Math.floor(Math.max(0, -highestY + 500)), enemiesDefeatedThisRun);
          }
          continue;
        }

        // Remove if off screen
        if (p.y > cameraY + CONSTANTS.GAME_HEIGHT + 100 || p.y < cameraY - 500) {
          projectiles.splice(i, 1);
        }
      }

      // Enemies
      for (const e of enemies) {
        // Attack logic
        const dx = (player.x + player.width / 2) - (e.x + e.width / 2);
        const dy = (player.y + player.height / 2) - (e.y + e.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (e.type === 'lunger' && e.expression === 'angry') {
          if (e.attackCooldown && e.attackCooldown > 0) {
            e.attackCooldown--;
          } else if (!e.lungeTimer && dist < 120) {
            e.lungeTimer = 30; // Start a 30-frame lunge animation
            e.attackCooldown = 60; // Cooldown after lunge
            sounds.playEnemyAttack();
          }
        } else if (e.type === 'shooter') {
          if (e.attackCooldown && e.attackCooldown > 0) {
            e.attackCooldown--;
          } else if (dist < 300 && player.y < e.y + 100) {
            // Shoot at player
            const angle = Math.atan2(dy, dx);
            projectiles.push({
              id: Math.random().toString(),
              x: e.x + e.width / 2,
              y: e.y + e.height / 2,
              vx: Math.cos(angle) * 4,
              vy: Math.sin(angle) * 4,
              radius: 6
            });
            e.attackCooldown = 90; // 1.5 seconds at 60fps
            sounds.playEnemyAttack();
          }
        } else if (e.type === 'sweeper') {
           // Move horizontally
           e.x += (e.moveDirection || 1) * 2.5;
           if (e.x <= 0) e.moveDirection = 1;
           if (e.x + e.width >= CONSTANTS.GAME_WIDTH) e.moveDirection = -1;

           // Swing logic
           if (!e.swingTimer && dist < 100) {
             e.swingTimer = 20;
             sounds.playEnemyAttack();
           }
        } else if (e.type === 'mine-dropper') {
           // Move horizontally
           e.x += (e.moveDirection || 1) * 2.0;
           if (e.x <= 0) e.moveDirection = 1;
           if (e.x + e.width >= CONSTANTS.GAME_WIDTH) e.moveDirection = -1;

           if (e.attackCooldown && e.attackCooldown > 0) {
             e.attackCooldown--;
           } else if (dist < 400 && player.y > e.y) {
             projectiles.push({
               id: Math.random().toString(),
               x: e.x + e.width / 2,
               y: e.y + e.height,
               vx: 0,
               vy: 2.5,
               radius: 12,
               type: 'mine'
             });
             e.attackCooldown = 150;
             sounds.playEnemyAttack();
           }
        } else if (e.type === 'bubble-weaver') {
           e.x += Math.sin((globalBeat + (e.pivotX || 0)) * 0.02) * 1.5;
           e.y += Math.sin((globalBeat + (e.pivotY || 0)) * 0.05) * 1.5;

           if (e.attackCooldown && e.attackCooldown > 0) {
             e.attackCooldown--;
           } else if (dist < 400 && player.y < e.y + 100) { // Same range as shooter
             const angle = Math.atan2(dy, dx);
             projectiles.push({
               id: Math.random().toString(),
               x: e.x + e.width / 2,
               y: e.y + e.height / 2,
               vx: Math.cos(angle) * 3, // Slower than regular bullet
               vy: Math.sin(angle) * 3,
               radius: 10,
               type: 'trap-bubble'
             });
             e.attackCooldown = 120; // 2 seconds at 60fps
             sounds.playEnemyAttack();
           }
        } else if (e.type === 'circler') {
           // Circular movement
           e.angle = (e.angle || 0) + 0.04;
           const radius = e.radius || 50;
           const px = e.pivotX || e.x;
           const py = e.pivotY || e.y;
           
           e.x = px + Math.cos(e.angle) * radius;
           e.y = py + Math.sin(e.angle) * radius;
        }

        if (e.swingTimer && e.swingTimer > 0) {
          e.swingTimer--;
        }

        if (e.lungeTimer && e.lungeTimer > 0) {
          e.lungeTimer--;
          
          // Physical lunge effect
          if (e.expression === 'angry') {
            const lungeSpeed = 0.5;
            const dx = (player.x + player.width / 2) - (e.x + e.width / 2);
            const dy = (player.y + player.height / 2) - (e.y + e.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
              e.x += (dx / dist) * lungeSpeed * (e.lungeTimer / 30);
              e.y += (dy / dist) * lungeSpeed * (e.lungeTimer / 30);
            }
          }
        }

        if (
          player.x < e.x + e.width &&
          player.x + player.width > e.x &&
          player.y < e.y + e.height &&
          player.y + player.height > e.y
        ) {
          if (player.jetpackFuel > 0 || player.isDiving || player.invincibleTimer > 0) {
            // Invincible while jetpacking or diving or after jetpack vanishes - kill enemy or pass through
            enemies = enemies.filter(en => en !== e);
            enemiesDefeatedThisRun++;
            screenShakeFrames = 8;
            screenShakeIntensity = 6;
            visualEffects.push({
              id: Math.random().toString(),
              x: e.x + e.width / 2,
              y: e.y + e.height / 2,
              type: 'poof',
              timer: 15,
              maxTimer: 15
            });
            for (let k = 0; k < 5; k++) {
              visualEffects.push({
                id: Math.random().toString(),
                x: e.x + e.width / 2,
                y: e.y + e.height / 2,
                type: 'sparkle',
                timer: 20 + Math.random() * 10,
                maxTimer: 30,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                color: '#f87171'
              });
            }
            sounds.playEnemyPop();
          } else if (player.vy > 0 && player.y + player.height < e.y + e.height / 2) {
            // Kill enemy by jumping on top
            player.vy = -CONSTANTS.JUMP_FORCE * 1.5; // Bigger bounce off enemies
            enemies = enemies.filter(en => en !== e);
            enemiesDefeatedThisRun++;
            screenShakeFrames = 10;
            screenShakeIntensity = 8;
            visualEffects.push({
              id: Math.random().toString(),
              x: e.x + e.width / 2,
              y: e.y + e.height / 2,
              type: 'poof',
              timer: 15,
              maxTimer: 15
            });
            for (let k = 0; k < 5; k++) {
              visualEffects.push({
                id: Math.random().toString(),
                x: e.x + e.width / 2,
                y: e.y + e.height / 2,
                type: 'sparkle',
                timer: 20 + Math.random() * 10,
                maxTimer: 30,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                color: '#f87171'
              });
            }
            sounds.playEnemyPop();
            sounds.playJump();
          } else {
             // Hit enemy
             isGameOver = true;
             onGameOver(score, Math.floor(Math.max(0, -highestY + 500)), enemiesDefeatedThisRun);
          }
        }
      }

      // Powerups
      for (let i = 0; i < powerups.length; i++) {
        const pup = powerups[i];
        if (pup.collected) continue;
        if (
          player.x < pup.x + pup.width &&
          player.x + player.width > pup.x &&
          player.y < pup.y + pup.height &&
          player.y + player.height > pup.y
        ) {
          pup.collected = true;
          
          visualEffects.push({
            id: Math.random().toString(),
            x: pup.x + pup.width / 2,
            y: pup.y + pup.height / 2,
            type: 'ring-expand',
            timer: 25,
            maxTimer: 25,
            size: 150,
            color: pup.type === 'jetpack' ? '#f97316' : '#a855f7'
          });

          if (pup.type === 'spring') {
            visualEffects.push({
              id: Math.random().toString(),
              x: player.x + player.width / 2,
              y: player.y + player.height,
              type: 'spring-boost',
              timer: 40,
              maxTimer: 40
            });
            // Add purple ring
            visualEffects.push({
              id: Math.random().toString(),
              x: pup.x + pup.width / 2,
              y: pup.y + pup.height / 2,
              type: 'ring-expand',
              timer: 30,
              maxTimer: 30,
              size: 200,
              color: '#a855f7'
            });
          } else {
            visualEffects.push({
              id: Math.random().toString(),
              x: player.x + player.width / 2,
              y: player.y + player.height,
              type: 'jetpack-ignite',
              timer: 30,
              maxTimer: 30
            });
            // Add orange ring
            visualEffects.push({
              id: Math.random().toString(),
              x: pup.x + pup.width / 2,
              y: pup.y + pup.height / 2,
              type: 'ring-expand',
              timer: 35,
              maxTimer: 35,
              size: 250,
              color: '#f97316'
            });
          }
          
          const particleCount = pup.type === 'jetpack' ? 25 : 15;
          for (let k = 0; k < particleCount; k++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 8;
            visualEffects.push({
              id: Math.random().toString(),
              x: pup.x + pup.width / 2,
              y: pup.y + pup.height / 2,
              type: 'sparkle',
              timer: 30 + Math.random() * 25,
              maxTimer: 55,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 2,
              color: pup.type === 'jetpack' ? (Math.random() > 0.5 ? '#f97316' : '#fdba74') : (Math.random() > 0.5 ? '#a855f7' : '#e879f9')
            });
          }

          visualEffects.push({
            id: Math.random().toString(),
            x: pup.x + pup.width / 2,
            y: pup.y + pup.height / 2,
            type: 'burst',
            timer: 20,
            maxTimer: 20,
            color: '#fff'
          });

          if (pup.type === 'spring') {
            player.vy = -CONSTANTS.SPRING_FORCE;
            screenShakeFrames = 6;
            screenShakeIntensity = 4;
            sounds.playSpring();
          } else if (pup.type === 'jetpack') {
             // Refill fuel to maximum
             player.jetpackFuel = CONSTANTS.MAX_JETPACK_FUEL;
             screenShakeFrames = 5;
             screenShakeIntensity = 3;
             sounds.playJetpack();
          }
        }
      }

      // Move platforms
      for (let p of platforms) {
        if (p.type === 'moving' && p.moveDirection) {
          p.x += p.moveDirection * 2;
          if (p.x <= 0) p.moveDirection = 1;
          if (p.x + p.width >= CONSTANTS.GAME_WIDTH) p.moveDirection = -1;
        }
        if (p.breakingProgress !== undefined) {
          p.breakingProgress -= 0.05;
          if (p.breakingProgress <= 0) {
            p.broken = true;
          }
        }
      }

      // Visual Effects Logic
      for (let i = visualEffects.length - 1; i >= 0; i--) {
        const eff = visualEffects[i];
        if (eff.vx !== undefined) eff.x += eff.vx;
        if (eff.vy !== undefined) eff.y += eff.vy;
        eff.timer--;
        if (eff.timer <= 0) {
          visualEffects.splice(i, 1);
        }
      }

      // --- Draw Atmospheric Effects ---
      
      // Spawn Bioluminescent Trails
      if (Math.abs(player.vx) + Math.abs(player.vy) > 5) {
        if (Math.random() > 0.5) {
          dustParticles.push({
            x: player.x + player.width / 2 + random(-10, 10),
            y: player.y + player.height / 2 + random(-10, 10),
            size: random(1, 3),
            vx: -player.vx * 0.1 + random(-0.5, 0.5),
            vy: -player.vy * 0.1 + random(-0.5, 0.5),
            color: Math.random() > 0.5 ? '#22d3ee' : '#a855f7' // cyan or purple
          });
        }
      }

      // Limit particle count
      if (dustParticles.length > 300) {
        dustParticles.splice(0, dustParticles.length - 300);
      }

      // Performance: Filter out distant elements
      if (platforms.length > 80) platforms = platforms.filter(p => p.y < cameraY + CONSTANTS.GAME_HEIGHT + 500 && p.y > cameraY - 2000);
      if (enemies.length > 30) enemies = enemies.filter(e => e.y < cameraY + CONSTANTS.GAME_HEIGHT + 500 && e.y > cameraY - 2000);
      if (powerups.length > 30) powerups = powerups.filter(p => p.y < cameraY + CONSTANTS.GAME_HEIGHT + 500 && p.y > cameraY - 2000);

      // Performance: Filter out distant elements, accounting for parallax speed
      if (backgroundElements.length > 200) {
        // Keep elements whose visualY is on screen or somewhat above/below
        backgroundElements = backgroundElements.filter(b => {
          const visualY = (b.y - cameraY) * b.parallaxSpeed;
          return visualY > -2000 && visualY < CONSTANTS.GAME_HEIGHT + 2000;
        });
        // Hard cap
        if (backgroundElements.length > 150) {
           backgroundElements.splice(0, backgroundElements.length - 150);
        }
      }
      if (sceneryElements.length > 100) {
        sceneryElements = sceneryElements.filter(s => {
          const visualY = (s.y - cameraY) * s.parallaxSpeed;
          return visualY > -2000 && visualY < CONSTANTS.GAME_HEIGHT + 2000;
        });
        // Hard cap
        if (sceneryElements.length > 80) {
           sceneryElements.splice(0, sceneryElements.length - 80);
        }
      }

      for (const f of foregroundElements) {
        if (f.type === 'jellyfish') {
          f.y -= 0.8; // Foreground jellyfish swim faster
          f.x += Math.sin(globalBeat * 0.01 + f.y) * 0.5;
          if (f.y < cameraY - 1000) f.y = cameraY + CONSTANTS.GAME_HEIGHT + 1000;
        }
      }

      if (foregroundElements.length > 50) {
        foregroundElements = foregroundElements.filter(f => {
          const visualY = (f.y - cameraY) * f.parallaxSpeed;
          return visualY < CONSTANTS.GAME_HEIGHT + 2000;
        });
      }
    };

    const draw = () => {
      let shakeX = 0;
      let shakeY = 0;
      if (screenShakeFrames > 0) {
        shakeX = (Math.random() - 0.5) * screenShakeIntensity;
        shakeY = (Math.random() - 0.5) * screenShakeIntensity;
        screenShakeFrames--;
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Atmosphere Gradient
      const skyProgress = Math.min(1, Math.max(0, -cameraY / 20000)); // Fully black by 20k height
      
      // Interpolate colors: Sky Blue (#7dd3fc) to Space Indigo (#020617)
      // Sky blue: 125, 211, 252
      // Space indigo: 2, 6, 23
      // Ocean Depth Gradient
      const depthProgress = Math.min(1, Math.max(0, -cameraY / 25000));
      
      const gradient = ctx.createLinearGradient(0, 0, 0, CONSTANTS.GAME_HEIGHT);
      
      // Transitions from shallow cyan to deep abyssal purple/blue
      const shallowColor = '#0891b2'; // cyan-600
      const midColor = '#1e1b4b';     // indigo-950
      const deepColor = '#020617';    // slate-950
      
      if (depthProgress < 0.5) {
        gradient.addColorStop(0, shallowColor);
        gradient.addColorStop(1, midColor);
      } else {
        gradient.addColorStop(0, midColor);
        gradient.addColorStop(1, deepColor);
      }
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CONSTANTS.GAME_WIDTH, CONSTANTS.GAME_HEIGHT);

      // --- Tetris Effect: Pulsing Grid ---
      const drawAtmosphericGrid = () => {
        ctx.save();
        const gridSize = 50;
        const scrollSpeed = 0.2;
        const yOffset = (cameraY * scrollSpeed) % gridSize;
        
        const opacity = 0.03 + (shockPulse * 0.1);
        ctx.strokeStyle = `rgba(34, 211, 238, ${opacity})`;
        ctx.lineWidth = 1;

        for (let x = 0; x <= CONSTANTS.GAME_WIDTH; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, CONSTANTS.GAME_HEIGHT);
          ctx.stroke();
        }

        for (let y = -yOffset; y <= CONSTANTS.GAME_HEIGHT; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(CONSTANTS.GAME_WIDTH, y);
          ctx.stroke();
        }
        ctx.restore();
      };

      const drawDataLines = () => {
         ctx.save();
         const opacity = 0.05 + (shockPulse * 0.15);
         ctx.strokeStyle = `rgba(168, 85, 247, ${opacity})`;
         ctx.setLineDash([20, 10]);
         const time = Date.now() / 2000;
         for (let i = 0; i < 4; i++) {
           const y = ((time * 150 + i * 250) % (CONSTANTS.GAME_HEIGHT + 400)) - 200;
           ctx.beginPath();
           ctx.moveTo(0, y);
           ctx.lineTo(CONSTANTS.GAME_WIDTH, y);
           ctx.stroke();
         }
         ctx.restore();
      };

      drawAtmosphericGrid();
      drawDataLines();

      const timeGlobal = Date.now() / 2000;

      // --- Animated Light Rays ---
      const drawDynamicLightRays = () => {
        ctx.save();
        const rayCount = 4 + Math.floor(depthProgress * 4);
        for(let i=0; i<rayCount; i++) {
            const startX = CONSTANTS.GAME_WIDTH * 0.5 + Math.sin(timeGlobal * 0.5 + i * 123) * CONSTANTS.GAME_WIDTH * 1.5;
            const endX = startX + Math.sin(timeGlobal * 0.3 + i * 456) * 600 - 300;
            const gradient = ctx.createLinearGradient(startX, 0, endX, CONSTANTS.GAME_HEIGHT);
            // More defined but darker in deep, bright and wide in shallow
            const rayAlpha = (0.02 + depthProgress * 0.06) * (Math.sin(timeGlobal * 1.5 + i * 789) * 0.5 + 0.5);
            gradient.addColorStop(0, `rgba(224, 242, 254, ${rayAlpha * 1.5})`);
            gradient.addColorStop(1, 'rgba(224, 242, 254, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(startX - 80 + i * 10, 0);
            ctx.lineTo(startX + 80 - i * 10, 0);
            ctx.lineTo(endX + 200, CONSTANTS.GAME_HEIGHT);
            ctx.lineTo(endX - 200, CONSTANTS.GAME_HEIGHT);
            ctx.fill();
        }
        ctx.restore();
      };
      drawDynamicLightRays();

      // --- Shimmering Water Caustics ---
      const drawWaterCaustics = () => {
        ctx.save();
        // Deep areas have more pronounced/weird caustic patterns
        const causticOpacity = 0.03 + depthProgress * 0.05; 
        ctx.globalAlpha = causticOpacity;
        ctx.strokeStyle = depthProgress > 0.6 ? '#67e8f9' : '#fff'; // cyan tint deep down
        ctx.lineWidth = 1 + depthProgress * 1;
        const cTime = Date.now() / 3000;
        for (let i = 0; i < 5; i++) {
           ctx.beginPath();
           const yBase = (i * 180 + cTime * 80 + cameraY * 0.05) % (CONSTANTS.GAME_HEIGHT + 200) - 100;
           for (let x = -50; x < CONSTANTS.GAME_WIDTH + 50; x += 30) {
             const dx = x;
             const dy = yBase + Math.sin(x * 0.01 + cTime * 2 + i) * (20 + depthProgress * 20) + Math.cos(x * 0.015 - cTime) * 15;
             if (x === -50) ctx.moveTo(dx, dy);
             else ctx.lineTo(dx, dy);
           }
           ctx.stroke();
        }
        ctx.restore();
      };
      drawWaterCaustics();



      const rOffset = (mag: number) => {
        return (Math.random() - 0.5) * mag * shockPulse;
      };

      // --- Draw BackgroundSpecks (Bubbles/Plankton) Far & Mid ---
      // Distant ones drawn first
      const sortedBG = [...backgroundElements].sort((a,b) => a.parallaxSpeed - b.parallaxSpeed);
      for (const bg of sortedBG) {
        const finalY = (bg.y - cameraY) * bg.parallaxSpeed;
        if (finalY < -800 || finalY > CONSTANTS.GAME_HEIGHT + 800) continue;
        
        ctx.save();
        ctx.translate(0, bg.y * (bg.parallaxSpeed - 1) - cameraY * bg.parallaxSpeed);
        
        let depthAlpha = Math.min(1.0, bg.parallaxSpeed * 2);
        if (bg.type === 'whale') depthAlpha = 0.2;
        if (bg.type === 'shark') depthAlpha = 0.4;
        
        ctx.globalAlpha = depthAlpha;

        if (bg.type === 'bubbles') {
           ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + depthProgress * 0.2})`;
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.arc(bg.x, bg.y, bg.size, 0, Math.PI * 2);
           ctx.stroke();
           // Highlight
           ctx.beginPath();
           ctx.arc(bg.x - bg.size/3, bg.y - bg.size/3, 1, 0, Math.PI * 2);
           ctx.fillStyle = 'white';
           ctx.fill();
        } else if (bg.type === 'star') {
           const twinkle = 0.5 + Math.sin(globalBeat * 0.02 + bg.x) * 0.5 + shockPulse * 3;
           ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1.0, (bg.alpha || 0.5) * twinkle)})`;
           ctx.beginPath();
           ctx.arc(bg.x, bg.y, bg.size * (1 + shockPulse), 0, Math.PI * 2);
           ctx.fill();
        } else if (bg.type === 'nebula') {
           const pulse = 1 + Math.sin(globalBeat * 0.01 + bg.x) * 0.1;
           ctx.fillStyle = bg.color || 'rgba(168, 85, 247, 0.05)';
           ctx.beginPath();
           ctx.ellipse(bg.x, bg.y, bg.size * pulse, bg.size * 0.6 * pulse, bg.rot || 0, 0, Math.PI * 2);
           ctx.fill();
           // Add a second layer for depth
           ctx.fillStyle = (bg.color || 'rgba(168, 85, 247, 0.02)').replace('0.05', '0.02');
           ctx.beginPath();
           ctx.ellipse(bg.x + 20, bg.y + 10, bg.size * 1.2 * pulse, bg.size * 0.8 * pulse, (bg.rot || 0) + 0.5, 0, Math.PI * 2);
           ctx.fill();
        } else if (bg.type === 'castle') {
           ctx.save();
           ctx.translate(bg.x, bg.y);
           const cWidth = bg.size;
           const cHeight = bg.size * 0.8;
           const baseColor = `rgba(100, 116, 139, ${0.4 + depthProgress * 0.4})`;
           ctx.fillStyle = baseColor;
           ctx.fillRect(-cWidth/10, -cHeight/2, cWidth/5, cHeight);
           ctx.beginPath();
           ctx.moveTo(-cWidth/8, -cHeight/2);
           ctx.lineTo(cWidth/8, -cHeight/2);
           ctx.lineTo(0, -cHeight/1.5);
           ctx.closePath();
           ctx.fill();
           ctx.fillRect(-cWidth/3, -cHeight/3, cWidth/8, cHeight * 0.8);
           ctx.fillRect(cWidth/3 - cWidth/8, -cHeight/3, cWidth/8, cHeight * 0.8);
           ctx.beginPath();
           ctx.moveTo(-cWidth/3 - cWidth/20, -cHeight/3);
           ctx.lineTo(-cWidth/3 + cWidth/8 + cWidth/20, -cHeight/3);
           ctx.lineTo(-cWidth/3 + cWidth/16, -cHeight/2);
           ctx.closePath();
           ctx.fill();
           ctx.beginPath();
           ctx.moveTo(cWidth/3 - cWidth/8 - cWidth/20, -cHeight/3);
           ctx.lineTo(cWidth/3 + cWidth/20, -cHeight/3);
           ctx.lineTo(cWidth/3 - cWidth/16, -cHeight/2);
           ctx.closePath();
           ctx.fill();
           
           // Added Glowing Windows
           ctx.fillStyle = `rgba(250, 204, 21, ${0.5 + shockPulse})`; // Glowing yellow
           ctx.shadowColor = '#facc15';
           ctx.shadowBlur = 15;
           for(let i=0; i<3; i++) {
              ctx.fillRect(-cWidth/40, -cHeight*0.4 + i*cHeight*0.15, cWidth/20, cHeight/15);
           }
           for(let i=0; i<2; i++) {
              ctx.fillRect(-cWidth/3 + cWidth/25, -cHeight*0.25 + i*cHeight*0.15, cWidth/25, cHeight/20);
           }
           for(let i=0; i<2; i++) {
              ctx.fillRect(cWidth/3 - cWidth/8 + cWidth/25, -cHeight*0.25 + i*cHeight*0.15, cWidth/25, cHeight/20);
           }
           ctx.shadowBlur = 0;

           ctx.restore();
        } else if (bg.type === 'sunken-ship') {
           ctx.save();
           ctx.translate(bg.x, bg.y);
           ctx.rotate(bg.rot || 0); // Maybe a slight list
           ctx.fillStyle = `rgba(71, 85, 105, ${0.4 + depthProgress * 0.4})`; // Slate gray
           const wSize = bg.size;
           const hSize = wSize * 0.3;
           
           // Main hull
           ctx.beginPath();
           ctx.moveTo(-wSize/2, -hSize/4); // Stern
           ctx.lineTo(wSize/2, -hSize/4); // Bow top
           ctx.bezierCurveTo(wSize/2.2, hSize/2, -wSize/3, hSize/2, -wSize/2, hSize/2);
           ctx.fill();
           
           // Broken masts
           ctx.strokeStyle = `rgba(71, 85, 105, ${0.4 + depthProgress * 0.4})`;
           ctx.lineWidth = wSize / 40;
           ctx.lineCap = 'round';
           ctx.beginPath();
           ctx.moveTo(-wSize/6, -hSize/3);
           ctx.lineTo(-wSize/4, -hSize * 1.5);
           ctx.stroke();
           
           ctx.beginPath();
           ctx.moveTo(wSize/6, -hSize/2.5);
           ctx.lineTo(wSize/5, -hSize * 1.2);
           ctx.stroke();

           // Cross beams
           ctx.lineWidth = wSize / 60;
           ctx.beginPath();
           ctx.moveTo(-wSize/3.5, -hSize * 0.8);
           ctx.lineTo(-wSize/6, -hSize * 0.7);
           ctx.stroke();
           ctx.beginPath();
           ctx.moveTo(wSize/8, -hSize * 0.7);
           ctx.lineTo(wSize/3, -hSize * 0.6);
           ctx.stroke();

           // Haunted Green Glow Portholes
           ctx.fillStyle = `rgba(52, 211, 153, ${0.5 + shockPulse})`; // Emerald glow
           ctx.shadowColor = '#34d399';
           ctx.shadowBlur = 15;
           for (let i = 0; i < 5; i++) {
             ctx.beginPath();
             ctx.arc(-wSize/3 + i * (wSize/5), hSize/6, hSize/10, 0, Math.PI * 2);
             ctx.fill();
           }
           ctx.shadowBlur = 0;
           
           // Eerie Glow Ambient
           const eerieGlow = Math.abs(Math.sin(globalBeat * 0.05));
           const glowAlpha = 0.2 + eerieGlow * 0.3;
           ctx.fillStyle = `rgba(52, 211, 153, ${glowAlpha})`; // Emerald ambient
           for (let i = 0; i < 3; i++) {
             ctx.beginPath();
             ctx.arc(-wSize/4 + i * (wSize/4), -hSize/8, hSize/5, 0, Math.PI * 2);
             ctx.fill();
           }

           ctx.restore();
        } else if (bg.type === 'ancient-ruin') {
           ctx.save();
           ctx.translate(bg.x, bg.y);
           ctx.rotate(bg.rot || 0);
           ctx.fillStyle = 'rgba(71, 85, 105, 0.2)';
           // Main block
           ctx.fillRect(-bg.size/2, -bg.size/2, bg.size, bg.size);
           // Cracked detail
           ctx.strokeStyle = 'rgba(30, 41, 59, 0.1)';
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.moveTo(-bg.size/4, -bg.size/2);
           ctx.lineTo(0, 0);
           ctx.lineTo(bg.size/3, bg.size/2);
           ctx.stroke();
           ctx.restore();
        } else if (bg.type === 'whale') {
           ctx.save();
           ctx.translate(bg.x, bg.y);
           if (bg.vx && bg.vx < 0) ctx.scale(-1, 1); // Flip if moving left
           ctx.fillStyle = '#0f172a'; // solid slate-900
           const wSize = bg.size;
           const hSize = wSize * 0.4;
           // Body
           ctx.beginPath();
           ctx.ellipse(0, 0, wSize/2, hSize/2, 0, 0, Math.PI * 2);
           ctx.fill();
           // Tail
           ctx.beginPath();
           ctx.moveTo(-wSize/2.5, 0);
           ctx.lineTo(-wSize/1.8, -hSize/1.5);
           ctx.lineTo(-wSize/1.8, hSize/1.5);
           ctx.closePath();
           ctx.fill();
           ctx.restore();
        } else if (bg.type === 'shark') {
           ctx.save();
           ctx.translate(bg.x, bg.y);
           if (bg.vx && bg.vx > 0) ctx.scale(-1, 1); // Flip if moving right
           ctx.fillStyle = '#475569'; // solid slate-600
           const wSize = bg.size;
           const hSize = wSize * 0.25; // More streamlined
           
           // Body - Shark Silhouette (facing left)
           ctx.beginPath();
           ctx.moveTo(-wSize/2, 0); // Pointed snout
           // Top curve
           ctx.bezierCurveTo(-wSize/4, -hSize/1.2, wSize/6, -hSize/1.1, wSize/2, -hSize/6);
           // Lower lobe of tail connection
           ctx.lineTo(wSize/2.2, hSize/8);
           // Bottom curve
           ctx.bezierCurveTo(wSize/6, hSize/1.5, -wSize/4, hSize/1.8, -wSize/2, 0);
           ctx.fill();
           
           // Iconic Dorsal Fin (The classic "shark fin")
           ctx.beginPath();
           ctx.moveTo(-wSize/10, -hSize/2.5);
           ctx.quadraticCurveTo(0, -hSize * 1.4, wSize/6, -hSize/2.5); // Curved back edge
           ctx.lineTo(-wSize/10, -hSize/2.5);
           ctx.fill();
           
           // Tail Fin (Heterocercal tail - upper lobe larger)
           ctx.beginPath();
           ctx.moveTo(wSize/2.2, -hSize/8);
           ctx.lineTo(wSize/1.4, -hSize * 1.1); // Long upper lobe
           ctx.lineTo(wSize/1.7, 0);
           ctx.lineTo(wSize/1.5, hSize * 0.6); // Shorter lower lobe
           ctx.lineTo(wSize/2.2, hSize/8);
           ctx.fill();
           
           // Pectoral Fin (Lateral side fin)
           ctx.beginPath();
           ctx.moveTo(-wSize/8, hSize/4);
           ctx.lineTo(wSize/12, hSize * 1.1); // Points down and back
           ctx.lineTo(wSize/10, hSize/4);
           ctx.fill();
           
           // Faint details for character
           ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
           // Eye
           ctx.beginPath();
           ctx.arc(-wSize/2.8, -hSize/10, 1.5, 0, Math.PI * 2);
           ctx.fill();
           
           // Gills (three faint lines)
           ctx.strokeStyle = 'rgba(15, 23, 42, 0.2)';
           ctx.lineWidth = 1;
           for (let i = 0; i < 3; i++) {
             ctx.beginPath();
             ctx.moveTo(-wSize/4 + i*4, -hSize/4);
             ctx.lineTo(-wSize/4 + i*4, hSize/4);
             ctx.stroke();
           }
           ctx.restore();
        } else if (bg.type === 'geometry') {
           ctx.translate(bg.x, bg.y);
           ctx.rotate(bg.rot || 0);
           
           // Pulse size and alpha with shock effect
           const effectScale = 1 + shockPulse * 0.3;
           const currentSize = bg.size * effectScale;
           
           ctx.strokeStyle = `rgba(168, 85, 247, ${0.05 + 0.1 * shockPulse})`; // purple-ish
           ctx.lineWidth = 1;
           if (shockPulse > 0.1) {
              ctx.shadowColor = 'rgba(168, 85, 247, 0.5)';
              ctx.shadowBlur = 10 * shockPulse;
           }

           ctx.beginPath();
           if (bg.geometryShape === 'circle') {
             ctx.arc(0, 0, currentSize, 0, Math.PI * 2);
             ctx.moveTo(currentSize * 0.6, 0);
             ctx.arc(0, 0, currentSize * 0.6, 0, Math.PI * 2); // inner ring
           } else if (bg.geometryShape === 'triangle') {
             ctx.moveTo(0, -currentSize);
             ctx.lineTo(currentSize * 0.866, currentSize * 0.5);
             ctx.lineTo(-currentSize * 0.866, currentSize * 0.5);
             ctx.closePath();
             // Inner triangle
             const innerSize = currentSize * 0.5;
             ctx.moveTo(0, -innerSize);
             ctx.lineTo(innerSize * 0.866, innerSize * 0.5);
             ctx.lineTo(-innerSize * 0.866, innerSize * 0.5);
             ctx.closePath();
           } else if (bg.geometryShape === 'octagon') {
             const r = currentSize;
             for (let i = 0; i < 8; i++) {
               const angle = (i * Math.PI) / 4 + Math.PI/8;
               if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
               else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
             }
             ctx.closePath();
           } else {
             // Diamond
             ctx.moveTo(0, -currentSize);
             ctx.lineTo(currentSize * 0.7, 0);
             ctx.lineTo(0, currentSize);
             ctx.lineTo(-currentSize * 0.7, 0);
             ctx.closePath();
             // Cross lines
             ctx.moveTo(0, -currentSize);
             ctx.lineTo(0, currentSize);
             ctx.moveTo(-currentSize * 0.7, 0);
             ctx.lineTo(currentSize * 0.7, 0);
           }
           ctx.stroke();
           ctx.shadowBlur = 0;
        } else if (bg.type === 'mini-jelly') {
           const pulse = Math.sin(globalBeat * 0.03 + bg.x) * 0.1 + 1;
           ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
           ctx.beginPath();
           ctx.ellipse(bg.x, bg.y, bg.size * pulse, (bg.size * 0.7) * pulse, 0, Math.PI, 0);
           ctx.fill();
           // Tiny tentacles
           ctx.strokeStyle = 'rgba(168, 85, 247, 0.1)';
           ctx.lineWidth = 1;
           for (let i = -1; i <= 1; i++) {
             ctx.beginPath();
             ctx.moveTo(bg.x + (i * bg.size * 0.4), bg.y);
             const tx = bg.x + (i * bg.size * 0.6);
             const ty = bg.y + bg.size * 1.5 * pulse;
             ctx.quadraticCurveTo(bg.x + i * bg.size, bg.y + bg.size * 0.7, tx, ty);
             ctx.stroke();
           }
        } else if (bg.type === 'mini-coral') {
           ctx.fillStyle = bg.color || 'rgba(248, 113, 113, 0.1)';
           const segments = 4;
           for(let i = 0; i < segments; i++) {
             const angle = (i / segments) * Math.PI - Math.PI / 2;
             const length = bg.size * (0.8 + Math.sin(globalBeat * 0.01 + i) * 0.2);
             ctx.beginPath();
             ctx.save();
             ctx.translate(bg.x, bg.y);
             ctx.rotate(angle + Math.sin(globalBeat * 0.01 + bg.x) * 0.1);
             ctx.roundRect(-2, -length, 4, length, 2);
             ctx.fill();
             ctx.restore();
           }
        } else if (bg.type === 'underwater-flower') {
           ctx.save();
           ctx.translate(bg.x, bg.y);
           // Stem
           ctx.strokeStyle = 'rgba(20, 83, 45, 0.5)'; // Dark green
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.moveTo(0, 0);
           const sway = Math.sin(globalBeat * 0.01 + bg.x) * (bg.size * 0.2);
           ctx.quadraticCurveTo(sway, bg.size * 0.5, sway * 0.5, bg.size);
           ctx.stroke();

           // Petals
           ctx.translate(0, 0); // Base of flower
           const petalSway = Math.sin(globalBeat * 0.02 + bg.y) * 0.1;
           ctx.rotate(petalSway);
           ctx.fillStyle = bg.color || 'rgba(236, 72, 153, 0.3)'; // Pinkish by default
           const petalCount = 6;
           for (let i = 0; i < petalCount; i++) {
               ctx.save();
               ctx.rotate((i * Math.PI * 2) / petalCount);
               ctx.beginPath();
               ctx.ellipse(0, -bg.size * 0.3, bg.size * 0.1, bg.size * 0.3, 0, 0, Math.PI * 2);
               ctx.fill();
               ctx.restore();
           }
           // Center
           ctx.fillStyle = 'rgba(253, 224, 71, 0.6)'; // Yellow center
           ctx.beginPath();
           ctx.arc(0, 0, bg.size * 0.15, 0, Math.PI * 2);
           ctx.fill();
           
           // Slight glowing effect around it
           const glow = 0.5 + Math.sin(globalBeat * 0.05 + bg.x) * 0.5;
           ctx.fillStyle = `rgba(236, 72, 153, ${glow * 0.1})`;
           ctx.beginPath();
           ctx.arc(0, 0, bg.size * 0.6, 0, Math.PI * 2);
           ctx.fill();
           ctx.restore();
        } else if (bg.type === 'plankton' || bg.type === 'glow-speck') {
           const twinkle = 0.5 + Math.sin(globalBeat * 0.05 + bg.x) * 0.5;
           ctx.fillStyle = bg.type === 'glow-speck' ? `rgba(134, 239, 172, ${0.2 + twinkle * 0.4})` : `rgba(255, 255, 255, ${0.1 + twinkle * 0.2})`;
           ctx.beginPath();
           ctx.arc(bg.x, bg.y, bg.size, 0, Math.PI * 2);
           ctx.fill();
           if (bg.type === 'glow-speck') {
             ctx.fillStyle = `rgba(134, 239, 172, ${0.1 * twinkle})`;
             ctx.beginPath();
             ctx.arc(bg.x, bg.y, bg.size * 3, 0, Math.PI * 2);
             ctx.fill();
           }
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1.0;

      // --- Draw Scenery (Deep Ocean Entities) Sorted for Depth ---
      const renderSceneryElement = (s: SceneryElement, isForeground: boolean) => {
        const finalY = (s.y - cameraY) * s.parallaxSpeed;
        if (finalY < -800 || finalY > CONSTANTS.GAME_HEIGHT + 800) return;

        ctx.save();
        ctx.translate(0, s.y * (s.parallaxSpeed - 1) - cameraY * s.parallaxSpeed);
        
        // Depth-based filtering and effects
        const depthDim = isForeground ? 1.0 : Math.max(0.3, s.parallaxSpeed * 5);
        ctx.globalAlpha = depthDim;
        
        if (isForeground) {
          ctx.filter = `blur(${Math.min(10, (s.parallaxSpeed - 1) * 15)}px)`;
        }

        const pulse = Math.sin(globalBeat * 0.03 + s.pulseOffset) * 0.15 + 1;
        
        if (s.type === 'large-kelp') {
          // Draw a small rocky base
          ctx.beginPath();
          ctx.fillStyle = isForeground ? 'rgba(15, 23, 42, 0.9)' : 'rgba(15, 23, 42, 0.4)';
          const baseW = (25 + (s.pulseOffset % 1) * 15) * (isForeground ? 1.5 : 1);
          const baseH = (12 + ((s.pulseOffset * 1.3) % 1) * 8) * (isForeground ? 1.5 : 1);
          ctx.ellipse(s.x, s.y, baseW, baseH, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = `rgba(16, 185, 129, ${0.1 + depthProgress * 0.1})`; 
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          
          // React to player distance and movement
          const screenPlayerY_kelp = player.y - cameraY;
          const screenKelpY = (s.y - cameraY) * s.parallaxSpeed;
          const distToPlayer = Math.sqrt(Math.pow(player.x - s.x, 2) + Math.pow(screenPlayerY_kelp - screenKelpY, 2));
          const proximityEffect = Math.max(0, 1 - distToPlayer / 300);
          const swayFactor = 1 + proximityEffect * 2 + Math.abs(player.vx) * 0.2;
          
          // Wavy kelp
          for (let i = 0; i < 5; i++) {
            const wx = Math.sin(globalBeat * 0.01 * swayFactor + i + s.pulseOffset) * (20 * swayFactor);
            ctx.quadraticCurveTo(s.x + wx, s.y - (i + 0.5) * (s.height / 5), s.x, s.y - (i + 1) * (s.height / 5));
          }
          ctx.stroke();
        } else if (s.type === 'fish-school') {
          ctx.fillStyle = s.color || 'rgba(255, 255, 255, 0.4)';
          
          // Calculate scatter effect
          const screenPlayerY = player.y - cameraY;
          const screenSchoolY = (s.y - cameraY) * s.parallaxSpeed;
          const distToPlayer = Math.sqrt(Math.pow(player.x - s.x, 2) + Math.pow(screenPlayerY - screenSchoolY, 2));
          const scatter = Math.max(0, 1 - distToPlayer / 150);
          
          const schoolX = s.x + Math.sin(globalBeat * 0.02 + s.pulseOffset) * 50;
          const schoolY = s.y + Math.cos(globalBeat * 0.01 + s.pulseOffset) * 20;
          
          for (let i = 0; i < 5; i++) {
            const scatterOffset = scatter * 150 * (i + 1) * 0.2;
            const fx = schoolX + Math.sin(i + globalBeat * 0.05) * 30 + (schoolX > player.x ? scatterOffset : -scatterOffset);
            const fy = schoolY + Math.cos(i + globalBeat * 0.03) * 20 + (schoolY > player.y ? scatterOffset : -scatterOffset);
            
            ctx.beginPath();
            ctx.ellipse(fx, fy, 8, 4, Math.sin(globalBeat * 0.1 + i) * 0.2 + (schoolX > player.x ? 0.5 : -0.5) * scatter, 0, Math.PI * 2);
            ctx.fill();
            // Tail
            ctx.beginPath();
            ctx.moveTo(fx - (schoolX > player.x ? 6 : -6), fy);
            ctx.lineTo(fx - (schoolX > player.x ? 12 : -12), fy - 4);
            ctx.lineTo(fx - (schoolX > player.x ? 12 : -12), fy + 4);
            ctx.closePath();
            ctx.fill();
          }
        } else if (s.type === 'jellyfish') {
          const glowColor = s.color || 'rgba(192, 132, 252, 0.3)';
          ctx.fillStyle = glowColor;
          ctx.shadowBlur = 20 * pulse;
          ctx.shadowColor = glowColor;
          
          // Bell
          ctx.beginPath();
          ctx.ellipse(s.x + s.width/2, s.y, (s.width/2) * pulse, (s.width/3) * pulse, 0, Math.PI, 0);
          ctx.fill();
          
          // Tentacles with bioluminescent glow
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 2;
          for (let i = 0; i < 7; i++) {
            ctx.beginPath();
            const tx = s.x + (s.width / 8) * (i + 1);
            ctx.moveTo(tx, s.y);
            const ty = s.y + s.height * pulse * 0.8;
            const wave = Math.sin(globalBeat * 0.04 + i + s.pulseOffset) * 15;
            ctx.quadraticCurveTo(tx + wave, s.y + s.height/2, tx + wave * 0.5, ty);
            ctx.stroke();
            
            // Biolum dots on tentacles
            if (i % 2 === 0) {
              ctx.fillStyle = '#fff';
              ctx.globalAlpha = 0.5 * depthDim;
              ctx.beginPath();
              ctx.arc(tx + wave * 0.5, ty - 10, 2, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1.0 * depthDim;
            }
          }
          ctx.shadowBlur = 0;
        } else if (s.type === 'coral') {
          // Draw a small rocky base
          ctx.beginPath();
          ctx.fillStyle = isForeground ? 'rgba(30, 41, 59, 0.95)' : 'rgba(30, 41, 59, 0.45)';
          const baseW = (35 + (s.pulseOffset % 1) * 20) * (isForeground ? 1.5 : 1);
          const baseH = (18 + ((s.pulseOffset * 1.3) % 1) * 12) * (isForeground ? 1.5 : 1);
          ctx.ellipse(s.x + s.width/2, s.y, baseW, baseH, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = s.color || 'rgba(248, 113, 113, 0.2)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          // Abstract fractal-like coral
          ctx.moveTo(s.x + s.width/2, s.y);
          ctx.lineTo(s.x + s.width/2, s.y - s.height/2);
          ctx.lineTo(s.x + s.width/3, s.y - s.height * 0.8);
          ctx.moveTo(s.x + s.width/2, s.y - s.height/3);
          ctx.lineTo(s.x + s.width * 0.7, s.y - s.height * 0.6);
          ctx.stroke();
        } else if (s.type === 'light-ray') {
           const sway = Math.sin(globalBeat * 0.005 + s.pulseOffset) * 0.1;
           const flicker = Math.sin(globalBeat * 0.02 + s.pulseOffset * 10) * 0.05;
           ctx.save();
           ctx.translate(s.x, s.y);
           ctx.rotate(sway);
           
           const gradient = ctx.createLinearGradient(0, -s.height, 0, 0);
           gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
           // Scale visually with player depth, becoming more pronounced in deeper areas
           const rayAlpha = (0.05 + flicker) * (1 + depthProgress * 2);
           gradient.addColorStop(0.5, `rgba(224, 242, 254, ${(rayAlpha).toFixed(3)})`);
           gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
           
           ctx.fillStyle = gradient;
           ctx.beginPath();
           ctx.moveTo(-s.width/2, -s.height);
           ctx.lineTo(s.width/2, -s.height);
           ctx.lineTo(s.width, 0);
           ctx.lineTo(-s.width, 0);
           ctx.closePath();
           ctx.fill();
           ctx.restore();
        } else if (s.type === 'shadow-beast') {
           ctx.fillStyle = s.color || 'rgba(15, 23, 42, 0.1)';
           const moveX = (globalBeat * 0.2 + s.pulseOffset * 100) % (CONSTANTS.GAME_WIDTH + s.width * 2) - s.width;
           
           ctx.save();
           ctx.translate(moveX, s.y);
           
           if (s.beastType === 'whale') {
             // More majestic whale silhouette
             ctx.beginPath();
             ctx.ellipse(0, 0, s.width/2, s.height/2, 0, 0, Math.PI * 2);
             ctx.fill();
             // Fin
             ctx.beginPath();
             ctx.ellipse(s.width/10, s.height/4, s.width/10, s.height/5, 0.5, 0, Math.PI * 2);
             ctx.fill();
             // Eye (slightly brighter point)
             ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
             ctx.beginPath();
             ctx.arc(s.width/3, -s.height/10, 3, 0, Math.PI * 2);
             ctx.fill();
             ctx.fillStyle = s.color || 'rgba(15, 23, 42, 0.15)';
             // Tail
             ctx.beginPath();
             const tailWave = Math.sin(globalBeat * 0.02 + s.pulseOffset) * 10;
             ctx.moveTo(-s.width/2.5, 0);
             ctx.quadraticCurveTo(-s.width/2, tailWave, -s.width/1.6, -s.height/2 + tailWave);
             ctx.lineTo(-s.width/1.6, s.height/2 + tailWave);
             ctx.quadraticCurveTo(-s.width/2, tailWave, -s.width/2.5, 0);
             ctx.closePath();
             ctx.fill();
           } else {
             // Serpent silhouette
             ctx.beginPath();
             ctx.lineWidth = s.height;
             ctx.lineCap = 'round';
             ctx.moveTo(-s.width/2, 0);
             for(let i = 0; i < 5; i++) {
               const sx = -s.width/2 + (i + 0.5) * (s.width/5);
               const sy = Math.sin(globalBeat * 0.02 + i) * 20;
               ctx.quadraticCurveTo(sx, sy, sx + s.width/10, 0);
             }
             ctx.stroke();
           }
           ctx.restore();
        } else if (s.type === 'distant-mountain') {
          ctx.fillStyle = s.color || 'rgba(15, 23, 42, 0.4)';
          if (s.mountainPoints) {
            ctx.beginPath();
            ctx.moveTo(s.x + s.mountainPoints[0].x, s.y);
            for (let i = 1; i < s.mountainPoints.length; i++) {
              ctx.lineTo(s.x + s.mountainPoints[i].x, s.y - (s.height - s.mountainPoints[i].y));
            }
            ctx.lineTo(s.x + s.width, s.y);
            ctx.lineTo(s.x, s.y);
            ctx.closePath();
            ctx.fill();
          }
        } else if (s.type === 'octopus') {
          const ox = s.x + s.width / 2;
          const oy = s.y;
          
          // Glow effect
          ctx.shadowBlur = 15 * pulse;
          ctx.shadowColor = s.color || 'rgba(168, 85, 247, 0.4)';

          // 1. Draw bulbous mantle (head)
          ctx.beginPath();
          ctx.ellipse(ox, oy - s.height * 0.35, (s.width * 0.28) * pulse, (s.height * 0.22) * pulse, 0, 0, Math.PI * 2);
          ctx.fillStyle = s.color || 'rgba(168, 85, 247, 0.2)';
          ctx.fill();

          // 2. Head-to-tentacles transition bulb (lower body)
          ctx.beginPath();
          ctx.ellipse(ox, oy - s.height * 0.15, (s.width * 0.22) * pulse, (s.height * 0.1) * pulse, 0, 0, Math.PI * 2);
          ctx.fill();

          // 3. Eyes (glowing & blinking)
          const isBlinking = Math.sin(globalBeat * 0.04 + s.pulseOffset * 10) > 0.90;
          const eyeHeight = isBlinking ? 1 : 5 * pulse;
          
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#60a5fa'; // vibrant blue glow
          ctx.shadowBlur = 12;

          // Left Eye
          ctx.beginPath();
          ctx.ellipse(ox - s.width * 0.08, oy - s.height * 0.18, 5, eyeHeight, 0, 0, Math.PI * 2);
          ctx.fill();
          
          // Right Eye
          ctx.beginPath();
          ctx.ellipse(ox + s.width * 0.08, oy - s.height * 0.18, 5, eyeHeight, 0, 0, Math.PI * 2);
          ctx.fill();

          // Pupil/Glint detail
          if (!isBlinking) {
            ctx.fillStyle = '#0f172a';
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(ox - s.width * 0.08, oy - s.height * 0.18, 2, 0, Math.PI * 2);
            ctx.arc(ox + s.width * 0.08, oy - s.height * 0.18, 2, 0, Math.PI * 2);
            ctx.fill();
          }

          // 4. Tentacles (8 trailing legs with beautiful sine curves)
          ctx.strokeStyle = s.color || 'rgba(168, 85, 247, 0.3)';
          ctx.lineWidth = 4 * pulse;
          ctx.lineCap = 'round';
          ctx.shadowColor = s.color || 'rgba(168, 85, 247, 0.4)';
          ctx.shadowBlur = 8 * pulse;

          for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            // Spread starting points across bottom body
            const startX = ox + (i - 3.5) * (s.width * 0.05);
            const startY = oy - s.height * 0.12;
            ctx.moveTo(startX, startY);

            const delay = i * 0.5 + s.pulseOffset;
            // Sine-based sway that intensifies towards tips
            const wave1 = Math.sin(globalBeat * 0.03 + delay) * (15 + i * 3);
            const wave2 = Math.cos(globalBeat * 0.02 + delay) * (20 + i * 5);

            const cp1x = startX + wave1;
            const cp1y = startY + s.height * 0.25;
            const cp2x = startX + wave2;
            const cp2y = startY + s.height * 0.55;

            const endX = startX + wave2 * 1.3;
            const endY = startY + s.height * 0.75;

            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
            ctx.stroke();

            // Add little bioluminescent suction cups along each tentacle
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.shadowBlur = 4;
            ctx.shadowColor = '#fff';

            // Midway dot
            ctx.beginPath();
            const midX = (startX + cp1x + cp2x + endX) / 4;
            const midY = (startY + cp1y + cp2y + endY) / 4;
            ctx.arc(midX, midY, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Near tip dot
            ctx.beginPath();
            ctx.arc(endX, endY, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        } else if (s.type === 'anemone') {
          ctx.save();
          ctx.translate(s.x, s.y);
          // Base
          ctx.beginPath();
          ctx.fillStyle = 'rgba(30, 41, 59, 0.4)';
          ctx.ellipse(0, 0, s.width/2, s.height/4, 0, 0, Math.PI * 2);
          ctx.fill();

          // Tentacles
          ctx.strokeStyle = s.color || 'rgba(236, 72, 153, 0.4)';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          const tentacleCount = 12;
          for (let i = 0; i < tentacleCount; i++) {
            ctx.beginPath();
            const angle = (i / tentacleCount) * Math.PI - Math.PI;
            const len = s.height * (0.8 + Math.sin(globalBeat * 0.05 + i) * 0.2);
            const sway = Math.sin(globalBeat * 0.02 + i + s.pulseOffset) * 15;
            ctx.moveTo(Math.cos(angle) * (s.width/4), 0);
            ctx.quadraticCurveTo(Math.cos(angle) * (s.width/2) + sway, -len/2, Math.cos(angle) * (s.width/3) + sway, -len);
            ctx.stroke();
            // Bio-tip
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.4 * depthDim;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * (s.width/3) + sway, -len, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0 * depthDim;
          }
          ctx.restore();
        } else if (s.type === 'kelp') {
          ctx.strokeStyle = s.color || 'rgba(16, 185, 129, 0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          const sway = Math.sin(globalBeat * 0.01 + s.pulseOffset) * 20;
          ctx.quadraticCurveTo(s.x + sway, s.y - s.height/2, s.x, s.y - s.height);
          ctx.stroke();
        } else if (s.type === 'sea-turtle') {
           ctx.save();
           const turtleX = (globalBeat * 0.15 + s.pulseOffset * 100) % (CONSTANTS.GAME_WIDTH + s.width * 2) - s.width;
           ctx.translate(turtleX, s.y);
           ctx.fillStyle = s.color || 'rgba(20, 83, 45, 0.4)';
           
           // Shell
           ctx.beginPath();
           ctx.ellipse(0, 0, s.width/2, s.height/2, 0, 0, Math.PI * 2);
           ctx.fill();
           
           // Fins
           const finWave = Math.sin(globalBeat * 0.05 + s.pulseOffset) * 0.4;
           ctx.beginPath();
           ctx.ellipse(-s.width/4, -s.height/2, s.width/4, s.width/8, 0.5 + finWave, 0, Math.PI * 2);
           ctx.ellipse(s.width/4, -s.height/2, s.width/4, s.width/8, -0.5 - finWave, 0, Math.PI * 2);
           ctx.fill();
           
           // Head
           ctx.beginPath();
           ctx.arc(s.width/2 + 5, 0, s.width/6, 0, Math.PI * 2);
           ctx.fill();
           ctx.restore();
        } else if (s.type === 'sea-star') {
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.pulseOffset);
          ctx.fillStyle = s.color || 'rgba(251, 191, 36, 0.5)';
          ctx.shadowBlur = 10;
          ctx.shadowColor = s.color || 'orange';
          
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
            const innerAngle = angle + Math.PI / 5;
            ctx.lineTo(Math.cos(angle) * s.width, Math.sin(angle) * s.width);
            ctx.lineTo(Math.cos(innerAngle) * (s.width * 0.4), Math.sin(innerAngle) * (s.width * 0.4));
          }
          ctx.closePath();
          ctx.fill();
          // Texture
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          for (let i = 0; i < 5; i++) {
             ctx.beginPath();
             ctx.arc(0, 0, 2, 0, Math.PI * 2);
             const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
             ctx.arc(Math.cos(angle) * (s.width * 0.6), Math.sin(angle) * (s.width * 0.6), 3, 0, Math.PI * 2);
             ctx.fill();
          }
          ctx.restore();
        } else if (s.type === 'bubbles-vent') {
          // Vent rock
          ctx.beginPath();
          ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
          ctx.moveTo(s.x - 20, s.y);
          ctx.lineTo(s.x, s.y - 30);
          ctx.lineTo(s.x + 20, s.y);
          ctx.fill();
          
          // Bubbles rising
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 5; i++) {
            const bOffset = (globalBeat * 2 + i * 40 + s.pulseOffset * 100) % 200;
            const bx = s.x + Math.sin(globalBeat * 0.05 + i) * 10;
            const by = s.y - 30 - bOffset;
            const bSize = 2 + (bOffset / 40);
            ctx.beginPath();
            ctx.arc(bx, by, bSize, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        
        ctx.restore();
      };

      const sortedScenery = [...sceneryElements].sort((a,b) => a.parallaxSpeed - b.parallaxSpeed);
      for (const s of sortedScenery) {
        renderSceneryElement(s, false);
      }
      ctx.globalAlpha = 1.0;

      ctx.save();
      ctx.translate(0, -cameraY);

      // --- Draw Sea Dust (Glowing Sand Particles) ---
      for (const d of dustParticles) {
        ctx.save();
        ctx.fillStyle = d.color;
        ctx.globalAlpha = 0.4 + Math.sin(Date.now() / 1000 + d.x) * 0.2;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw Visual Effects
      for (const eff of visualEffects) {
        if (eff.type === 'poof') {
          const progress = 1 - (eff.timer / eff.maxTimer);
          const size = progress * 60;
          
          ctx.save();
          ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
          ctx.lineWidth = 3;
          ctx.shadowBlur = 10 + (shockPulse * 20);
          ctx.shadowColor = '#fff';
          
          for (let k = 0; k < 12; k++) {
            const angle = (k / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(eff.x + Math.cos(angle) * (size * 0.3), eff.y + Math.sin(angle) * (size * 0.3));
            ctx.lineTo(eff.x + Math.cos(angle) * size, eff.y + Math.sin(angle) * size);
            ctx.stroke();
          }
          ctx.restore();
        } else if (eff.type === 'ring-expand') {
          const progress = 1 - (eff.timer / eff.maxTimer);
          const size = progress * (eff.size || 100);
          ctx.save();
          ctx.strokeStyle = eff.color || '#fff';
          ctx.globalAlpha = (1 - progress) * 0.8;
          ctx.lineWidth = 4 * (1 - progress);
          ctx.beginPath();
          ctx.arc(eff.x, eff.y, size, 0, Math.PI * 2);
          ctx.stroke();

          // Second thinner ring
          if (progress > 0.2) {
             const progress2 = (progress - 0.2) / 0.8;
             ctx.beginPath();
             ctx.arc(eff.x, eff.y, size * 0.7, 0, Math.PI * 2);
             ctx.lineWidth = 2 * (1 - progress2);
             ctx.stroke();
          }
          ctx.restore();
        } else if (eff.type === 'spring-boost') {
          const progress = 1 - (eff.timer / eff.maxTimer);
          ctx.save();
          ctx.strokeStyle = '#a855f7'; // Purple-ish
          ctx.lineWidth = 3;
          ctx.globalAlpha = 1 - progress;
          
          for (let k = 0; k < 8; k++) {
            const offsetX = (k - 3.5) * 10;
            const length = (1 - progress) * 100;
            ctx.beginPath();
            ctx.moveTo(eff.x + offsetX, eff.y);
            ctx.lineTo(eff.x + offsetX, eff.y + length);
            ctx.stroke();
          }
          ctx.restore();
        } else if (eff.type === 'jetpack-ignite') {
          const progress = 1 - (eff.timer / eff.maxTimer);
          ctx.save();
          ctx.fillStyle = progress < 0.5 ? '#f97316' : '#ea580c'; // Orange to dark orange
          ctx.globalAlpha = (1 - progress) * 0.6;
          const size = (1 - progress) * 50;
          
          ctx.beginPath();
          ctx.arc(eff.x, eff.y, size, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(eff.x, eff.y, size * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = '#fde047'; // Yellow
          ctx.fill();
          ctx.restore();
        } else if (eff.type === 'sparkle') {
          const progress = 1 - (eff.timer / eff.maxTimer);
          ctx.save();
          ctx.fillStyle = eff.color || '#fff';
          ctx.globalAlpha = (1 - progress);
          ctx.beginPath();
          ctx.arc(eff.x, eff.y, 5 * (1 - progress), 0, Math.PI * 2);
          ctx.fill();
          
          // Outer glow
          ctx.globalAlpha = (1 - progress) * 0.3;
          ctx.beginPath();
          ctx.arc(eff.x, eff.y, 10 * (1 - progress), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (eff.type === 'burst') {
          const progress = 1 - (eff.timer / eff.maxTimer);
          ctx.save();
          ctx.strokeStyle = eff.color || '#fff';
          ctx.lineWidth = 2 * (1 - progress);
          ctx.globalAlpha = 1 - progress;
          const outerSize = progress * 80;
          const innerSize = progress * 40;
          const lineCount = 8;
          ctx.beginPath();
          for (let k = 0; k < lineCount; k++) {
            const angle = (k / lineCount) * Math.PI * 2;
            ctx.moveTo(eff.x + Math.cos(angle) * innerSize, eff.y + Math.sin(angle) * innerSize);
            ctx.lineTo(eff.x + Math.cos(angle) * outerSize, eff.y + Math.sin(angle) * outerSize);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw Projectiles
      for (const p of projectiles) {
        if (p.type === 'mine') {
          ctx.fillStyle = '#334155'; // slate-700
          ctx.strokeStyle = '#0f172a'; // slate-900
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Spikes
          ctx.fillStyle = '#64748b'; // slate-500
          for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8 + (globalBeat * 0.02);
            ctx.beginPath();
            ctx.moveTo(p.x + Math.cos(angle - 0.2) * p.radius, p.y + Math.sin(angle - 0.2) * p.radius);
            ctx.lineTo(p.x + Math.cos(angle + 0.2) * p.radius, p.y + Math.sin(angle + 0.2) * p.radius);
            ctx.lineTo(p.x + Math.cos(angle) * (p.radius + 6), p.y + Math.sin(angle) * (p.radius + 6));
            ctx.fill();
            ctx.stroke();
          }

          // Blinking light
          const blink = (globalBeat % 60) < 15;
          ctx.fillStyle = blink ? '#ef4444' : '#7f1d1d';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'trap-bubble') {
          ctx.fillStyle = 'rgba(252, 211, 77, 0.3)'; // translucent amber
          ctx.strokeStyle = '#fbbf24'; // amber-400
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * (1 + Math.sin(globalBeat * 0.1) * 0.1), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Bubble reflection
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.beginPath();
          ctx.arc(p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          // A glowing or fiery bullet effect
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = '#fef08a'; // yellow-200
          ctx.fill();
        }
      }

      // Draw Platforms
      for (const p of platforms) {
        if (p.broken) continue;
        if (p.y > cameraY + CONSTANTS.GAME_HEIGHT + 100 || p.y < cameraY - 100) continue;

        ctx.globalAlpha = p.breakingProgress !== undefined ? p.breakingProgress : 1.0;
        let visualX = p.x;
        let visualY = p.breakingProgress !== undefined ? p.y + (1 - p.breakingProgress) * 20 : p.y;

        // Add shake effect
        if (p.breakingProgress !== undefined && p.breakingProgress > 0) {
          visualX += Math.sin(p.breakingProgress * 40) * 3;
        }

        if (p.type === 'normal') {
          ctx.fillStyle = '#22c55e'; // lime-500
          ctx.shadowColor = '#22c55e';
        } else if (p.type === 'moving') {
          ctx.fillStyle = '#60a5fa'; // blue-400
          ctx.shadowColor = '#60a5fa';
        } else if (p.type === 'breaking') {
          ctx.fillStyle = '#fcd34d'; // yellow-300 / orange-ish
          ctx.shadowColor = '#fcd34d';
        }
        ctx.strokeStyle = '#fff'; 
        ctx.lineWidth = 2;
        ctx.shadowBlur = 5 + (shockPulse * 15);
        
        for (let j = 0; j < 2; j++) {
           ctx.beginPath();
           ctx.moveTo(visualX + rOffset(4), visualY + rOffset(4));
           ctx.lineTo(visualX + p.width + rOffset(4), visualY + rOffset(4));
           ctx.lineTo(visualX + p.width + rOffset(4), visualY + p.height + rOffset(4));
           ctx.lineTo(visualX + rOffset(4), visualY + p.height + rOffset(4));
           ctx.closePath();
           if (j === 0) ctx.fill();
           ctx.stroke();
        }

        // Breaking details (cracks)
        if (p.type === 'breaking') {
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.moveTo(visualX + p.width/2 - 10 + rOffset(4), visualY + rOffset(4));
          ctx.lineTo(visualX + p.width/2 + 10 + rOffset(4), visualY + p.height + rOffset(4));
          
          // Add more cracks if breaking
          if (p.breakingProgress !== undefined) {
            ctx.moveTo(visualX + 20 + rOffset(4), visualY + rOffset(4));
            ctx.lineTo(visualX + 10 + rOffset(4), visualY + p.height + rOffset(4));
            ctx.moveTo(visualX + p.width - 20 + rOffset(4), visualY + rOffset(4));
            ctx.lineTo(visualX + p.width - 10 + rOffset(4), visualY + p.height + rOffset(4));
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }
      ctx.shadowBlur = 0;

      // Draw Powerups
      for (const pup of powerups) {
        if (pup.collected) continue;
        if (pup.y > cameraY + CONSTANTS.GAME_HEIGHT + 100 || pup.y < cameraY - 100) continue;
        ctx.lineWidth = 2;
        if (pup.type === 'spring') {
          ctx.strokeStyle = '#94a3b8'; // slate-400 (medium gray)
          for (let j = 0; j < 2; j++) {
             ctx.beginPath();
             // Draw a coiled spring shape
             ctx.moveTo(pup.x + 4 + rOffset(1), pup.y + pup.height - 4 + rOffset(1));
             ctx.lineTo(pup.x + pup.width - 4 + rOffset(1), pup.y + pup.height - 4 + rOffset(1));
             
             ctx.lineTo(pup.x + 4 + rOffset(1), pup.y + pup.height - 10 + rOffset(1));
             ctx.lineTo(pup.x + pup.width - 4 + rOffset(1), pup.y + pup.height - 10 + rOffset(1));
             
             ctx.lineTo(pup.x + 4 + rOffset(1), pup.y + 10 + rOffset(1));
             ctx.lineTo(pup.x + pup.width - 4 + rOffset(1), pup.y + 10 + rOffset(1));
             
             ctx.lineTo(pup.x + 4 + rOffset(1), pup.y + 4 + rOffset(1));
             ctx.lineTo(pup.x + pup.width - 4 + rOffset(1), pup.y + 4 + rOffset(1));
             
             ctx.stroke();
          }
        } else if (pup.type === 'jetpack') {
          ctx.fillStyle = '#f97316'; // orange-500
          ctx.strokeStyle = '#0f172a'; // slate-900
          for (let j = 0; j < 2; j++) {
             // Left Tank
             ctx.beginPath();
             ctx.moveTo(pup.x + 2 + rOffset(1), pup.y + 4 + rOffset(1));
             ctx.lineTo(pup.x + 10 + rOffset(1), pup.y + 4 + rOffset(1));
             ctx.lineTo(pup.x + 10 + rOffset(1), pup.y + pup.height - 4 + rOffset(1));
             ctx.lineTo(pup.x + 2 + rOffset(1), pup.y + pup.height - 4 + rOffset(1));
             ctx.closePath();
             if (j === 0) ctx.fill();
             ctx.stroke();
             
             // Right Tank
             ctx.beginPath();
             ctx.moveTo(pup.x + pup.width - 10 + rOffset(1), pup.y + 4 + rOffset(1));
             ctx.lineTo(pup.x + pup.width - 2 + rOffset(1), pup.y + 4 + rOffset(1));
             ctx.lineTo(pup.x + pup.width - 2 + rOffset(1), pup.y + pup.height - 4 + rOffset(1));
             ctx.lineTo(pup.x + pup.width - 10 + rOffset(1), pup.y + pup.height - 4 + rOffset(1));
             ctx.closePath();
             if (j === 0) ctx.fill();
             ctx.stroke();

             // Connector
             ctx.beginPath();
             ctx.moveTo(pup.x + 10 + rOffset(1), pup.y + 8 + rOffset(1));
             ctx.lineTo(pup.x + pup.width - 10 + rOffset(1), pup.y + 8 + rOffset(1));
             ctx.stroke();
          }
        }
      }

      // Draw Enemies
      for (const e of enemies) {
        if (e.y > cameraY + CONSTANTS.GAME_HEIGHT + 150 || e.y < cameraY - 150) continue;

        // Reset state for each enemy to prevent style leaks
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#0f172a'; // slate-900 outline
        ctx.lineWidth = 2;
        
        // Shooter warning glow (purple pulses when ready)
        if (e.type === 'shooter' && (!e.attackCooldown || e.attackCooldown < 30)) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#a855f7';
        }

        if (e.type === 'shooter') ctx.fillStyle = '#a855f7'; // purple-500
        else if (e.type === 'sweeper') ctx.fillStyle = '#06b6d4'; // cyan-500
        else if (e.type === 'circler') ctx.fillStyle = '#10b981'; // emerald-500
        else if (e.type === 'mine-dropper') ctx.fillStyle = '#f97316'; // orange-500
        else if (e.type === 'bubble-weaver') ctx.fillStyle = '#db2777'; // pink-600
        else ctx.fillStyle = '#ef4444'; // lunger red-500
        
        for (let j = 0; j < 2; j++) {
           ctx.beginPath();
           ctx.arc(e.x + e.width/2 + rOffset(4), e.y + e.height/2 + rOffset(4), e.width/2 + rOffset(4), 0, Math.PI * 2);
           if (j === 0) ctx.fill();
           ctx.stroke();
        }
        
        // Spike/Antenna/Side Blades
        for (let j = 0; j < 2; j++) {
           ctx.beginPath();
           if (e.type === 'shooter') {
             // Antenna for shooter
             ctx.moveTo(e.x + e.width/2 + rOffset(4), e.y + rOffset(4));
             ctx.lineTo(e.x + e.width/2 + rOffset(4), e.y - 15 + rOffset(4));
           } else if (e.type === 'sweeper') {
             // Side blades for sweeper
             ctx.moveTo(e.x + rOffset(4), e.y + e.height/2 + rOffset(4));
             ctx.lineTo(e.x - 10 + rOffset(4), e.y + e.height/2 + rOffset(4));
             ctx.moveTo(e.x + e.width + rOffset(4), e.y + e.height/2 + rOffset(4));
             ctx.lineTo(e.x + e.width + 10 + rOffset(4), e.y + e.height/2 + rOffset(4));
            } else if (e.type === 'circler') {
              // Side wings for circler
              ctx.moveTo(e.x - 5, e.y + e.height * 0.3);
              ctx.lineTo(e.x + 5, e.y + e.height * 0.5);
              ctx.moveTo(e.x + e.width + 5, e.y + e.height * 0.3);
              ctx.lineTo(e.x + e.width - 5, e.y + e.height * 0.5);
            } else if (e.type === 'mine-dropper') {
              // Top hatch
              ctx.moveTo(e.x + e.width * 0.3, e.y);
              ctx.lineTo(e.x + e.width * 0.7, e.y);
              ctx.lineTo(e.x + e.width * 0.8, e.y - 8);
              ctx.lineTo(e.x + e.width * 0.2, e.y - 8);
              ctx.closePath();
            } else if (e.type === 'bubble-weaver') {
              // Bubble wand stick on head
              ctx.moveTo(e.x + e.width * 0.5, e.y);
              ctx.lineTo(e.x + e.width * 0.5, e.y - 12);
              ctx.arc(e.x + e.width * 0.5, e.y - 16, 4, Math.PI * 0.5, Math.PI * 2.5);
            } else if (false) { // Disabled boss spikes
             // Crown spikes
             ctx.moveTo(e.x + e.width * 0.2 + rOffset(4), e.y + rOffset(4));
             ctx.lineTo(e.x + e.width * 0.2 + rOffset(4), e.y - 20 + rOffset(4));
             ctx.moveTo(e.x + e.width * 0.5 + rOffset(4), e.y - e.height * 0.1 + rOffset(4));
             ctx.lineTo(e.x + e.width * 0.5 + rOffset(4), e.y - 30 + rOffset(4));
             ctx.moveTo(e.x + e.width * 0.8 + rOffset(4), e.y + rOffset(4));
             ctx.lineTo(e.x + e.width * 0.8 + rOffset(4), e.y - 20 + rOffset(4));
           } else {
             // Spike for lunger
             ctx.moveTo(e.x - 10 + rOffset(4), e.y + e.height/2 + rOffset(4));
             ctx.lineTo(e.x + e.width + 10 + rOffset(4), e.y + e.height/2 + rOffset(4));
           }
           ctx.stroke();
        }

        // Enemy Face
        ctx.fillStyle = '#0f172a';
        ctx.lineWidth = 2;

        // Draw different expressions
        if (false) { // Disabled boss_mad
           // Glowing angry eyes
           ctx.fillStyle = '#fff';
           ctx.shadowColor = '#fff';
           ctx.shadowBlur = 10;
           ctx.beginPath();
           ctx.moveTo(e.x + e.width * 0.2 + rOffset(2), e.y + e.height * 0.3 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.4 + rOffset(2), e.y + e.height * 0.4 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.3 + rOffset(2), e.y + e.height * 0.45 + rOffset(2));
           ctx.fill();
           ctx.beginPath();
           ctx.moveTo(e.x + e.width * 0.8 + rOffset(2), e.y + e.height * 0.3 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.6 + rOffset(2), e.y + e.height * 0.4 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.7 + rOffset(2), e.y + e.height * 0.45 + rOffset(2));
           ctx.fill();
           ctx.shadowBlur = 0;
           
           // Jagged mouth
           ctx.lineWidth = 4;
           ctx.strokeStyle = '#0f172a';
           ctx.beginPath();
           ctx.moveTo(e.x + e.width * 0.2, e.y + e.height * 0.7);
           ctx.lineTo(e.x + e.width * 0.35, e.y + e.height * 0.6);
           ctx.lineTo(e.x + e.width * 0.5, e.y + e.height * 0.8);
           ctx.lineTo(e.x + e.width * 0.65, e.y + e.height * 0.6);
           ctx.lineTo(e.x + e.width * 0.8, e.y + e.height * 0.7);
           ctx.stroke();
           ctx.lineWidth = 2;
           ctx.fillStyle = '#0f172a'; // reset
        } else if (e.expression === 'angry') {
          const isLunging = e.lungeTimer && e.lungeTimer > 0;
          const lungeIntensity = isLunging ? Math.sin((e.lungeTimer! / 30) * Math.PI) : 0;

          // Angry eyes (slanting downwards) - squint more when lunging
          const eyeOffset = lungeIntensity * 3;
          ctx.beginPath();
          ctx.moveTo(e.x + e.width * 0.2 + rOffset(2), e.y + e.height * (0.3 + eyeOffset * 0.01) + rOffset(2));
          ctx.lineTo(e.x + e.width * 0.4 + rOffset(2), e.y + e.height * (0.45 + eyeOffset * 0.01) + rOffset(2));
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(e.x + e.width * 0.8 + rOffset(2), e.y + e.height * (0.3 + eyeOffset * 0.01) + rOffset(2));
          ctx.lineTo(e.x + e.width * 0.6 + rOffset(2), e.y + e.height * (0.45 + eyeOffset * 0.01) + rOffset(2));
          ctx.stroke();

          // Angry mouth (V shape) - wider when lunging
          ctx.beginPath();
          const mouthY = 0.75 + lungeIntensity * 0.05;
          ctx.moveTo(e.x + e.width * (0.35 - lungeIntensity * 0.05) + rOffset(2), e.y + e.height * mouthY + rOffset(2));
          ctx.lineTo(e.x + e.width * 0.5 + rOffset(2), e.y + e.height * (0.6 + lungeIntensity * 0.1) + rOffset(2));
          ctx.lineTo(e.x + e.width * (0.65 + lungeIntensity * 0.05) + rOffset(2), e.y + e.height * mouthY + rOffset(2));
          ctx.stroke();

          // Action lines (swipe)
          if (isLunging) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            for (let k = 0; k < 3; k++) {
              ctx.beginPath();
              const sx = e.x + (k * 10) - 10;
              const sy = e.y + e.height + 5 + (lungeIntensity * 20);
              ctx.moveTo(sx, sy);
              ctx.lineTo(sx + 15, sy + 10);
              ctx.stroke();
            }
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2;
          }
        } else if (e.expression === 'smirk') {
          // Relaxed eyes
          ctx.beginPath();
          ctx.moveTo(e.x + e.width * 0.25, e.y + e.height * 0.35);
          ctx.lineTo(e.x + e.width * 0.4, e.y + e.height * 0.35);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(e.x + e.width * 0.6, e.y + e.height * 0.35);
          ctx.lineTo(e.x + e.width * 0.75, e.y + e.height * 0.35);
          ctx.stroke();

          // Smirking mouth (one side higher)
          ctx.beginPath();
          ctx.moveTo(e.x + e.width * 0.3, e.y + e.height * 0.7);
          ctx.quadraticCurveTo(e.x + e.width * 0.5, e.y + e.height * 0.8, e.x + e.width * 0.75, e.y + e.height * 0.6);
          ctx.stroke();
        } else if (e.expression === 'surprised') {
          // Surprised eyes (Dots)
          ctx.beginPath();
          ctx.arc(e.x + e.width * 0.3 + rOffset(2), e.y + e.height * 0.4 + rOffset(2), 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(e.x + e.width * 0.7 + rOffset(2), e.y + e.height * 0.4 + rOffset(2), 3, 0, Math.PI * 2);
          ctx.fill();

          // Surprised mouth (O shape)
          ctx.beginPath();
          ctx.arc(e.x + e.width * 0.5 + rOffset(2), e.y + e.height * 0.7 + rOffset(2), 5, 0, Math.PI * 2);
          ctx.stroke();
        } else if (e.expression === 'sneaky') {
          // Sneaky squinting eyes
          ctx.beginPath();
          ctx.moveTo(e.x + e.width * 0.2 + rOffset(2), e.y + e.height * 0.4 + rOffset(2));
          ctx.lineTo(e.x + e.width * 0.4 + rOffset(2), e.y + e.height * 0.4 + rOffset(2));
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(e.x + e.width * 0.6 + rOffset(2), e.y + e.height * 0.4 + rOffset(2));
          ctx.lineTo(e.x + e.width * 0.8 + rOffset(2), e.y + e.height * 0.4 + rOffset(2));
          ctx.stroke();

          // Sneaky smirk
          ctx.beginPath();
          ctx.arc(e.x + e.width * 0.5 + rOffset(2), e.y + e.height * 0.65 + rOffset(2), 8, 0, Math.PI, false);
          ctx.stroke();
        } else if (e.expression === 'focused') {
           // Focused shooter eyes
           ctx.beginPath();
           ctx.arc(e.x + e.width * 0.3 + rOffset(2), e.y + e.height * 0.45 + rOffset(2), 4, 0, Math.PI * 2);
           ctx.fill();
           ctx.beginPath();
           ctx.arc(e.x + e.width * 0.7 + rOffset(2), e.y + e.height * 0.45 + rOffset(2), 4, 0, Math.PI * 2);
           ctx.fill();
           
           // Small vertical mouth/beak
           ctx.beginPath();
           ctx.moveTo(e.x + e.width * 0.45 + rOffset(2), e.y + e.height * 0.7 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.5 + rOffset(2), e.y + e.height * 0.8 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.55 + rOffset(2), e.y + e.height * 0.7 + rOffset(2));
           ctx.stroke();
        } else if (e.expression === 'grinning') {
           // Grinning eyes
           ctx.beginPath();
           ctx.moveTo(e.x + e.width * 0.2 + rOffset(2), e.y + e.height * 0.35 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.4 + rOffset(2), e.y + e.height * 0.35 + rOffset(2));
           ctx.stroke();
           ctx.beginPath();
           ctx.moveTo(e.x + e.width * 0.6 + rOffset(2), e.y + e.height * 0.35 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.8 + rOffset(2), e.y + e.height * 0.35 + rOffset(2));
           ctx.stroke();

           // Sharp wide grin
           ctx.beginPath();
           ctx.moveTo(e.x + e.width * 0.2 + rOffset(2), e.y + e.height * 0.6 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.8 + rOffset(2), e.y + e.height * 0.6 + rOffset(2));
           ctx.lineTo(e.x + e.width * 0.5 + rOffset(2), e.y + e.height * 0.85 + rOffset(2));
           ctx.closePath();
           ctx.stroke();
        }
        
        // Sweeper attack animation (horizontal swipe)
        if (e.type === 'sweeper' && e.swingTimer && e.swingTimer > 0) {
           const swingProg = 1 - (e.swingTimer / 20);
           const swingWidth = swingProg * 80;
           ctx.strokeStyle = '#fff';
           ctx.lineWidth = 3;
           ctx.beginPath();
           ctx.moveTo(e.x + e.width/2 - swingWidth/2, e.y + e.height/2 + 10);
           ctx.lineTo(e.x + e.width/2 + swingWidth/2, e.y + e.height/2 + 10);
           ctx.stroke();
           ctx.strokeStyle = '#0f172a';
        }

        ctx.shadowBlur = 0;
      }

      // Draw Player
      const originalAlpha = ctx.globalAlpha;
      if (player.invincibleTimer > 0) {
        ctx.globalAlpha = (Math.floor(Date.now() / 100) % 2 === 0) ? 0.5 : 1.0;
      }
      ctx.shadowBlur = 0;

      ctx.lineWidth = 3;
      ctx.fillStyle = '#a3e635'; // lime-400
      
      const centerX = player.x + player.width / 2;
      const centerY = player.y + player.height / 2;
      const baseRadius = player.width / 2;
      
      // Calculate draw dimensions for squash/stretch
      const drawWidth = baseRadius * (1 / player.squashFactor);
      const drawHeight = baseRadius * player.squashFactor;

      // Dive effect trail
      if (player.isDiving) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#7dd3fc';
        for (let i = 1; i <= 4; i++) {
          const trailY = player.y - player.vy * (i * 0.15);
          ctx.beginPath();
          ctx.ellipse(centerX + rOffset(4), trailY + player.height / 2 + rOffset(4), drawWidth * (1 - i * 0.1), drawHeight * (1 - i * 0.1), 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Draw Legs
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      const legOffset = Math.sin(player.walkCycle) * 8;
      const legY = player.y + player.height - 5;
      
      // Left Leg
      ctx.beginPath();
      ctx.moveTo(centerX - 10 + rOffset(2), legY + rOffset(2));
      ctx.lineTo(centerX - 12 + rOffset(2), legY + 8 + (player.vx < 0 ? legOffset : -legOffset) + rOffset(2));
      ctx.stroke();

      // Right Leg
      ctx.beginPath();
      ctx.moveTo(centerX + 10 + rOffset(2), legY + rOffset(2));
      ctx.lineTo(centerX + 12 + rOffset(2), legY + 8 + (player.vx > 0 ? legOffset : -legOffset) + rOffset(2));
      ctx.stroke();

      ctx.lineWidth = 3;
      for (let j = 0; j < 2; j++) {
         ctx.beginPath();
         // Completely Round Shape (Oval for squash/stretch)
         ctx.ellipse(centerX + rOffset(2), centerY + (baseRadius - drawHeight) + rOffset(2), drawWidth, drawHeight, 0, 0, Math.PI * 2);
         
         if (j === 0) ctx.fill();
         ctx.stroke();
      }

      // Eyes
      ctx.fillStyle = '#0f172a';
      const eyeY = centerY - drawHeight * 0.3 + (baseRadius - drawHeight);
      ctx.beginPath();
      ctx.arc(centerX - 12 + rOffset(2), eyeY + rOffset(2), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX + 12 + rOffset(2), eyeY + rOffset(2), 4, 0, Math.PI * 2);
      ctx.fill();

      // Cute little nose
      ctx.fillStyle = '#bef264'; // lime-300
      ctx.beginPath();
      ctx.arc(centerX + rOffset(2), eyeY + 8 + rOffset(2), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw Hat
      ctx.lineWidth = 2;
      const hx = player.x;
      const hy = player.y;
      const hw = player.width;
      
      const draw2x = (fn: () => void) => { fn(); fn(); };
      
      if (hatType === 'tophat') {
        ctx.fillStyle = '#000000';
        for (let j=0; j<2; j++) {
           ctx.beginPath(); ctx.rect(hx + 4 + rOffset(2), hy - 4 + rOffset(2), hw - 8, 4); if (j===0) ctx.fill(); ctx.stroke();
           ctx.beginPath(); ctx.rect(hx + 10 + rOffset(2), hy - 20 + rOffset(2), hw - 20, 16); if (j===0) ctx.fill(); ctx.stroke();
        }
      } else if (hatType === 'cap') {
        ctx.fillStyle = '#f87171';
        for (let j=0; j<2; j++) {
           ctx.beginPath(); ctx.arc(hx + hw / 2 + rOffset(2), hy + 12 + rOffset(2), hw / 2, Math.PI, 0); if (j===0) ctx.fill(); ctx.stroke();
           ctx.fillStyle = '#ef4444';
           ctx.beginPath(); ctx.rect(hx + hw / 2 + rOffset(2), hy + 8 + rOffset(2), hw / 2 + 10, 4); if (j===0) ctx.fill(); ctx.stroke();
        }
      } else if (hatType === 'crown') {
        ctx.fillStyle = '#fbbf24';
        for (let j=0; j<2; j++) {
           ctx.beginPath();
           ctx.moveTo(hx + 5 + rOffset(2), hy + rOffset(2));
           ctx.lineTo(hx + 5 + rOffset(2), hy - 15 + rOffset(2));
           ctx.lineTo(hx + 15 + rOffset(2), hy - 5 + rOffset(2));
           ctx.lineTo(hx + 24 + rOffset(2), hy - 15 + rOffset(2));
           ctx.lineTo(hx + 33 + rOffset(2), hy - 5 + rOffset(2));
           ctx.lineTo(hx + 43 + rOffset(2), hy - 15 + rOffset(2));
           ctx.lineTo(hx + 43 + rOffset(2), hy + rOffset(2));
           ctx.closePath();
           if (j===0) ctx.fill(); ctx.stroke();
        }
      } else if (hatType === 'astronaut') {
        // Astronaut helmet bubble
        ctx.strokeStyle = '#cbd5e1'; // slate-300
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let j=0; j<2; j++) {
           ctx.beginPath();
           ctx.arc(centerX + rOffset(2), centerY - 5 + rOffset(2), baseRadius + 4, 0, Math.PI * 2);
           if (j===0) ctx.fill(); 
           ctx.lineWidth = 2;
           ctx.stroke();
        }
        // Glare
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(centerX + rOffset(2), centerY - 5 + rOffset(2), baseRadius, -Math.PI, -Math.PI / 2);
        ctx.stroke();
      } else if (hatType === 'ninja') {
        // Ninja headband
        ctx.fillStyle = '#ef4444'; // red-500
        for (let j=0; j<2; j++) {
           ctx.beginPath(); 
           ctx.rect(hx - 2 + rOffset(2), eyeY - 8 + rOffset(2), hw + 4, 6); 
           if (j===0) ctx.fill(); 
           ctx.stroke();
        }
        // Back tie
        ctx.beginPath();
        ctx.moveTo(hx + hw + rOffset(2), eyeY - 5 + rOffset(2));
        ctx.lineTo(hx + hw + 15 + rOffset(2), eyeY - 10 + rOffset(2));
        ctx.lineTo(hx + hw + 12 + rOffset(2), eyeY - 2 + rOffset(2));
        ctx.lineTo(hx + hw + 20 + rOffset(2), eyeY + 5 + rOffset(2));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (hatType === 'pirate') {
        // Pirate bicorne hat
        ctx.fillStyle = '#1e293b'; // slate-800
        for (let j=0; j<2; j++) {
           ctx.beginPath();
           ctx.moveTo(hx - 10 + rOffset(2), hy + 5 + rOffset(2));
           ctx.quadraticCurveTo(hx + hw / 2 + rOffset(2), hy - 20 + rOffset(2), hx + hw + 10 + rOffset(2), hy + 5 + rOffset(2));
           ctx.quadraticCurveTo(hx + hw / 2 + rOffset(2), hy - 5 + rOffset(2), hx - 10 + rOffset(2), hy + 5 + rOffset(2));
           if (j===0) ctx.fill(); 
           ctx.stroke();
        }
        // Eye patch over right eye (which is left eye visually)
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(centerX - 12 + rOffset(2), eyeY + rOffset(2), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(hx + rOffset(2), eyeY - 5 + rOffset(2));
        ctx.lineTo(centerX - 12 + rOffset(2), eyeY + rOffset(2));
        ctx.stroke();
      } else if (hatType === 'alien') {
        // Alien antennas
        ctx.strokeStyle = '#84cc16'; // lime-500
        ctx.lineWidth = 3;
        for (let j=0; j<2; j++) {
           ctx.beginPath();
           ctx.moveTo(centerX - 8 + rOffset(2), hy + 5 + rOffset(2));
           ctx.lineTo(centerX - 15 + rOffset(2), hy - 10 + rOffset(2));
           ctx.stroke();
           ctx.beginPath();
           ctx.moveTo(centerX + 8 + rOffset(2), hy + 5 + rOffset(2));
           ctx.lineTo(centerX + 15 + rOffset(2), hy - 10 + rOffset(2));
           ctx.stroke();
        }
        ctx.fillStyle = '#ef4444'; // Red antenna balls
        ctx.beginPath(); ctx.arc(centerX - 15 + rOffset(2), hy - 10 + rOffset(2), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(centerX + 15 + rOffset(2), hy - 10 + rOffset(2), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      // Jetpack effect
      if (player.jetpackFuel > 0) {
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(hx + 10, hy + player.height);
        ctx.lineTo(hx + 20, hy + player.height + 20 + Math.random() * 15);
        ctx.lineTo(hx + 30, hy + player.height);
        ctx.fill();
      }

      // Encased Bubble effect
      if (player.bubbleEncasedTimer > 0) {
        ctx.save();
        const pulse = 1 + Math.sin(globalBeat * 0.1) * 0.05;
        const bRadius = baseRadius * 2.5 * pulse;
        
        // Main bubble
        ctx.fillStyle = 'rgba(125, 211, 252, 0.2)'; // sky-300 very translucent
        ctx.strokeStyle = `rgba(186, 230, 253, ${0.6 + Math.sin(globalBeat * 0.2) * 0.4})`; // shimmering border
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, bRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Inner shimmer
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + Math.sin(globalBeat * 0.3) * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, bRadius - 4, 0, Math.PI * 2);
        ctx.stroke();

        // Main reflection
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(centerX - baseRadius * 1.0, centerY - baseRadius * 1.0, baseRadius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Secondary smaller reflection
        ctx.beginPath();
        ctx.arc(centerX - baseRadius * 0.4, centerY - baseRadius * 1.4, baseRadius * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      ctx.globalAlpha = originalAlpha;

      ctx.restore();

      // Draw Boss Health Bar disabled/removed
      // --- Draw Foreground Effects (Vignette) ---
      const drawVignette = () => {
        const vignetteGrad = ctx.createRadialGradient(
          CONSTANTS.GAME_WIDTH/2, CONSTANTS.GAME_HEIGHT/2, CONSTANTS.GAME_WIDTH/4,
          CONSTANTS.GAME_WIDTH/2, CONSTANTS.GAME_HEIGHT/2, CONSTANTS.GAME_WIDTH/1.2
        );
        const vignetteOpacity = 0.3 + shockPulse * 0.4;
        vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vignetteGrad.addColorStop(1, `rgba(2, 6, 23, ${vignetteOpacity})`);
        
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, CONSTANTS.GAME_WIDTH, CONSTANTS.GAME_HEIGHT);
      };
      
      // --- Ocean Currents Logic ---
      const drawOceanCurrents = () => {
        ctx.save();
        const currentOpacity = (0.02 + depthProgress * 0.04) + shockPulse * 0.05;
        ctx.strokeStyle = `rgba(34, 211, 238, ${currentOpacity})`;
        ctx.lineWidth = 15;
        ctx.lineCap = 'round';
        const time = Date.now() / 10000;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          const startY = (i * 300 + time * 150) % (CONSTANTS.GAME_HEIGHT + 400) - 200;
          ctx.moveTo(-100, startY);
          for (let x = 0; x < CONSTANTS.GAME_WIDTH + 200; x += 50) {
            const dx = x - 100;
            const dy = startY + Math.sin(x * 0.005 + time * 5 + i) * 100;
            ctx.lineTo(dx, dy);
          }
          ctx.stroke();
        }
        ctx.restore();
      };
      
      const sortedForeground = [...foregroundElements].sort((a,b) => a.parallaxSpeed - b.parallaxSpeed);
      for (const f of sortedForeground) {
        renderSceneryElement(f, true);
      }
      ctx.globalAlpha = 1.0;
      ctx.filter = 'none';

      drawOceanCurrents();
      drawVignette();

      // Draw Dive Cooldown HUD
      if (isGameStarted && !isGameOver) {
        ctx.save();
        const hudX = 20;
        const hudY = CONSTANTS.GAME_HEIGHT - 30;
        const width = 100;
        const height = 8;
        
        // Background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.beginPath();
        ctx.roundRect(hudX, hudY, width, height, 4);
        ctx.fill();
        
        // Progress
        const progress = player.diveCooldown > 0 ? 1 - (player.diveCooldown / CONSTANTS.DIVE_COOLDOWN) : 1;
        const barColor = player.diveCooldown > 0 ? '#94a3b8' : '#22d3ee';
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(hudX, hudY, width * progress, height, 4);
        ctx.fill();
        
        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(hudX, hudY, width, height, 4);
        ctx.stroke();
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(player.diveCooldown > 0 ? 'DIVE (RECHARGING)' : 'DIVE READY (SHIFT/TAP)', hudX, hudY - 6);
        ctx.restore();
      }

      ctx.restore();
    };

    let lastGamepadPause = false;

    const loop = () => {
      // Gamepad Polling
      if (navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        let currentPause = false;
        keys.gamepadX = 0;
        keys.gamepadDive = false;
        
        for (const gp of gamepads) {
          if (gp) {
            // Movement (Left Stick X)
            if (gp.axes.length >= 1 && Math.abs(gp.axes[0]) > 0.1) keys.gamepadX = gp.axes[0];
            // Movement (D-pad)
            if (gp.buttons[14]?.pressed) keys.gamepadX = -1;
            if (gp.buttons[15]?.pressed) keys.gamepadX = 1;
            
            // Dive (A/B/X/Y or Bumpers/Triggers)
            if (
              gp.buttons[0]?.pressed || gp.buttons[1]?.pressed || 
              gp.buttons[2]?.pressed || gp.buttons[3]?.pressed || 
              gp.buttons[4]?.pressed || gp.buttons[5]?.pressed || 
              gp.buttons[6]?.pressed || gp.buttons[7]?.pressed
            ) {
              keys.gamepadDive = true;
            }
            
            // Pause (Start / Options / Menu)
            if (gp.buttons[9]?.pressed || gp.buttons[8]?.pressed) {
              currentPause = true;
            }
          }
        }

        if (currentPause && !lastGamepadPause) {
          if (isGameStarted && !isGameOver) {
            isPaused = !isPaused;
            setPaused(isPaused);
            if (isPaused) {
              sounds.stopAmbient();
            } else {
              sounds.updateAmbientAudio(Math.max(0, -cameraY), screenShakeIntensity);
            }
          }
        }
        lastGamepadPause = currentPause;
      }

      if (!isPaused) {
        update();
        if (!isGameOver && isGameStarted) {
          sounds.updateAmbientAudio(Math.max(0, -cameraY), screenShakeIntensity);
        } else {
          sounds.stopAmbient();
        }
      } else {
        sounds.stopAmbient();
      }
      draw();
      animationId = requestAnimationFrame(loop);
    };

    if (!isGameStarted) {
       initGame();
    }
    animationId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationId);
  }, [onGameOver, onScoreUpdate, hatType]);

  return {
    canvasRef,
    isPaused: paused,
    togglePause: () => {
      if (isGameStarted && !isGameOver) {
        isPaused = !isPaused;
        setPaused(isPaused);
        if (isPaused) {
          sounds.stopAmbient();
        }
      }
    },
    startGame: async () => {
      // Request device orientation permission if needed (iOS 13+)
      if (typeof DeviceOrientationEvent !== 'undefined' && (DeviceOrientationEvent as any).requestPermission) {
        try {
          await (DeviceOrientationEvent as any).requestPermission();
        } catch (e) {
          console.warn('DeviceOrientation permission denied or error:', e);
        }
      }
      sounds.resume();
      sounds.startAmbient();
      isGameStarted = true;
      isGameOver = false;
      initGame();
      setPaused(false);
    },
    quitGame: () => {
      isGameStarted = false;
      isGameOver = false;
      isPaused = false;
      setPaused(false);
      sounds.stopAmbient();
      initGame();
    }
  };
}
