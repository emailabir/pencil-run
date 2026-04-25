import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';

type WebAudioEnabledSoundManager = Phaser.Sound.BaseSoundManager & {
  context?: AudioContext;
  locked?: boolean;
  unlock?: () => void;
};

type BrowserAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type RateCapableSound = Phaser.Sound.BaseSound & {
  setRate?: (value: number) => Phaser.Sound.BaseSound;
  rate?: number;
};

const LEAD_PATTERN: Array<number | null> = [
  659.25, null, 783.99, null, 987.77, null, 1174.66, null,
  1046.5, null, 987.77, null, 783.99, null, 659.25, 587.33,
  659.25, null, 783.99, null, 987.77, null, 1318.51, null,
  1174.66, null, 1046.5, null, 987.77, 783.99, 659.25, 523.25,
];

const BASS_PATTERN: Array<number | null> = [
  164.81, null, null, null, 164.81, null, null, null,
  196.0, null, null, null, 246.94, null, null, null,
  174.61, null, null, null, 174.61, null, null, null,
  220.0, null, null, null, 246.94, null, 220.0, null,
];

const CHORD_ROOTS = [329.63, 392.0, 440.0, 493.88];

export class BackgroundMusicSystem {
  private assetMusic?: RateCapableSound;

  private currentPlaybackRate = Number(GAME_CONFIG.audio.music.basePlaybackRate);

  private targetPlaybackRate = Number(GAME_CONFIG.audio.music.basePlaybackRate);

  private audioContext?: AudioContext;

  private ownAudioContext = false;

  private masterGain?: GainNode;

  private toneBus?: BiquadFilterNode;

  private compressor?: DynamicsCompressorNode;

  private schedulerId?: number;

  private cleanupId?: number;

  private nextStepTime = 0;

  private stepIndex = 0;

  private waitingForUnlock = false;

  constructor(private readonly scene: Phaser.Scene) {}

  start(): void {
    this.resetPlaybackRate();
    void this.startInternal();
  }

  updateRunProgress(distanceMeters: number, deltaSeconds: number): void {
    const baseRate = Number(GAME_CONFIG.audio.music.basePlaybackRate);
    const maxRate = Number(GAME_CONFIG.audio.music.maxPlaybackRate);
    const rampDistanceMeters = Math.max(1, Number(GAME_CONFIG.audio.music.playbackRateRampDistanceMeters));
    const progressionRatio = 1 - Math.exp(-Math.max(0, distanceMeters) / rampDistanceMeters);
    const nextTargetPlaybackRate = Phaser.Math.Clamp(
      baseRate + ((maxRate - baseRate) * progressionRatio),
      baseRate,
      maxRate,
    );
    this.targetPlaybackRate = Math.max(this.targetPlaybackRate, nextTargetPlaybackRate);

    const smoothingPerSecond = Number(GAME_CONFIG.audio.music.playbackRateSmoothingPerSecond);
    const interpolation = Phaser.Math.Clamp(1 - Math.exp(-smoothingPerSecond * Math.max(deltaSeconds, 0)), 0, 1);
    const nextPlaybackRate = Phaser.Math.Linear(this.currentPlaybackRate, this.targetPlaybackRate, interpolation);
    this.currentPlaybackRate = Math.max(
      this.currentPlaybackRate,
      Phaser.Math.Clamp(nextPlaybackRate, baseRate, maxRate),
    );

    this.applyPlaybackRate();
  }

  stop(): void {
    this.unregisterUnlockListeners();
    this.stopAssetMusic();
    this.stopSynthMusic();
    this.resetPlaybackRate();
  }

  private async startInternal(): Promise<void> {
    const musicConfig = GAME_CONFIG.audio.music;

    if (this.scene.cache.audio.exists(musicConfig.key)) {
      this.startAssetMusic();
      return;
    }

    await this.startSynthMusic();
  }

  private startAssetMusic(): void {
    const musicConfig = GAME_CONFIG.audio.music;

    if (!this.assetMusic) {
      this.assetMusic = this.scene.sound.add(musicConfig.key, {
        loop: musicConfig.loop,
        volume: musicConfig.volume,
      });
    }

    this.applyPlaybackRate();

    const soundManager = this.scene.sound as WebAudioEnabledSoundManager;
    if (soundManager.locked) {
      this.registerUnlockListeners();
      soundManager.once(Phaser.Sound.Events.UNLOCKED, this.handleUnlock);
      soundManager.unlock?.();
      return;
    }

    this.unregisterUnlockListeners();

    if (!this.assetMusic.isPlaying) {
      this.assetMusic.play();
    }
  }

  private stopAssetMusic(): void {
    if (!this.assetMusic) {
      return;
    }

    const soundManager = this.scene.sound as WebAudioEnabledSoundManager;
    soundManager.off(Phaser.Sound.Events.UNLOCKED, this.handleUnlock);
    this.assetMusic.stop();
    this.assetMusic.destroy();
    this.assetMusic = undefined;
  }

  private async startSynthMusic(): Promise<void> {
    const context = this.getAudioContext();

    if (!context) {
      return;
    }

    if (context.state !== 'running') {
      this.registerUnlockListeners();

      try {
        await context.resume();
      } catch {
        return;
      }
    }

    if (context.state !== 'running' || this.schedulerId !== undefined) {
      return;
    }

    this.unregisterUnlockListeners();
    this.audioContext = context;
    this.stepIndex = 0;
    this.nextStepTime = context.currentTime + 0.06;

    this.masterGain = context.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, context.currentTime);
    this.masterGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, musicVolumeToSynthGain()), context.currentTime + 0.12);

    this.toneBus = context.createBiquadFilter();
    this.toneBus.type = 'lowpass';
    this.toneBus.frequency.setValueAtTime(2200, context.currentTime);
    this.toneBus.Q.setValueAtTime(0.8, context.currentTime);

    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-18, context.currentTime);
    this.compressor.knee.setValueAtTime(16, context.currentTime);
    this.compressor.ratio.setValueAtTime(3, context.currentTime);

    this.masterGain.connect(this.toneBus);
    this.toneBus.connect(this.compressor);
    this.compressor.connect(context.destination);

    this.schedulerId = window.setInterval(() => {
      this.scheduleSynthLoop();
    }, 50);
  }

  private stopSynthMusic(): void {
    if (this.schedulerId !== undefined) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = undefined;
    }

    if (this.cleanupId !== undefined) {
      window.clearTimeout(this.cleanupId);
      this.cleanupId = undefined;
    }

    if (this.audioContext && this.masterGain) {
      const now = this.audioContext.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(Math.max(this.masterGain.gain.value, 0.0001), now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    }

    const toneBus = this.toneBus;
    const compressor = this.compressor;
    const masterGain = this.masterGain;
    const ownedContext = this.ownAudioContext ? this.audioContext : undefined;

    this.toneBus = undefined;
    this.compressor = undefined;
    this.masterGain = undefined;
    this.audioContext = undefined;
    this.ownAudioContext = false;

    this.cleanupId = window.setTimeout(() => {
      masterGain?.disconnect();
      toneBus?.disconnect();
      compressor?.disconnect();

      if (ownedContext && ownedContext.state !== 'closed') {
        void ownedContext.close();
      }
    }, 140);
  }

  private scheduleSynthLoop(): void {
    if (!this.audioContext || !this.masterGain) {
      return;
    }

    const sixteenthNoteSeconds = 60 / 150 / 4;
    const scheduleAheadSeconds = 0.18;
    const playbackRate = Phaser.Math.Clamp(
      this.currentPlaybackRate,
      Number(GAME_CONFIG.audio.music.basePlaybackRate),
      Number(GAME_CONFIG.audio.music.maxPlaybackRate),
    );
    const scaledSixteenthNoteSeconds = sixteenthNoteSeconds / playbackRate;

    while (this.nextStepTime < this.audioContext.currentTime + scheduleAheadSeconds) {
      this.scheduleStep(this.stepIndex, this.nextStepTime, scaledSixteenthNoteSeconds);
      this.nextStepTime += scaledSixteenthNoteSeconds;
      this.stepIndex = (this.stepIndex + 1) % LEAD_PATTERN.length;
    }
  }

  private scheduleStep(step: number, time: number, sixteenthNoteSeconds: number): void {
    const leadFrequency = LEAD_PATTERN[step];
    if (leadFrequency !== null) {
      this.playTone(leadFrequency, time, sixteenthNoteSeconds * 0.92, 'square', 0.055, 6);
    }

    const bassFrequency = BASS_PATTERN[step];
    if (bassFrequency !== null) {
      this.playTone(bassFrequency, time, sixteenthNoteSeconds * 2.7, 'triangle', 0.06, 0);
    }

    if (step % 8 === 0) {
      const chordRoot = CHORD_ROOTS[Math.floor(step / 8) % CHORD_ROOTS.length];
      this.playPowerChord(chordRoot, time, sixteenthNoteSeconds * 2.6);
    }

    if (step % 4 === 0) {
      this.playKick(time, sixteenthNoteSeconds * 1.8);
    }
  }

  private playPowerChord(rootFrequency: number, time: number, duration: number): void {
    this.playTone(rootFrequency, time, duration, 'sawtooth', 0.018, -3);
    this.playTone(rootFrequency * 1.5, time, duration, 'sawtooth', 0.015, 2);
    this.playTone(rootFrequency * 2, time, duration * 0.86, 'triangle', 0.012, 0);
  }

  private playKick(time: number, duration: number): void {
    if (!this.audioContext || !this.masterGain) {
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(132, time);
    oscillator.frequency.exponentialRampToValueAtTime(46, time + duration);

    gainNode.gain.setValueAtTime(0.0001, time);
    gainNode.gain.linearRampToValueAtTime(0.05, time + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private playTone(
    frequency: number,
    time: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    detune: number,
  ): void {
    if (!this.audioContext || !this.masterGain) {
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.detune.setValueAtTime(detune, time);

    gainNode.gain.setValueAtTime(0.0001, time);
    gainNode.gain.linearRampToValueAtTime(volume, time + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private getAudioContext(): AudioContext | null {
    const soundManager = this.scene.sound as WebAudioEnabledSoundManager;

    if (soundManager.context) {
      this.ownAudioContext = false;
      return soundManager.context;
    }

    if (this.audioContext) {
      return this.audioContext;
    }

    const AudioContextConstructor = window.AudioContext ?? (window as BrowserAudioWindow).webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    this.ownAudioContext = true;
    this.audioContext = new AudioContextConstructor();
    return this.audioContext;
  }

  private registerUnlockListeners(): void {
    if (this.waitingForUnlock) {
      return;
    }

    this.waitingForUnlock = true;
    this.scene.input.on('pointerdown', this.handleUnlockInput);
    this.scene.input.keyboard?.on('keydown', this.handleUnlockInput);
  }

  private unregisterUnlockListeners(): void {
    if (!this.waitingForUnlock) {
      return;
    }

    this.waitingForUnlock = false;
    this.scene.input.off('pointerdown', this.handleUnlockInput);
    this.scene.input.keyboard?.off('keydown', this.handleUnlockInput);
  }

  private readonly handleUnlock = (): void => {
    void this.startInternal();
  };

  private readonly handleUnlockInput = (): void => {
    void this.startInternal();
  };

  private applyPlaybackRate(): void {
    if (!this.assetMusic) {
      return;
    }

    if (typeof this.assetMusic.setRate === 'function') {
      this.assetMusic.setRate(this.currentPlaybackRate);
      return;
    }

    if (typeof this.assetMusic.rate === 'number') {
      this.assetMusic.rate = this.currentPlaybackRate;
    }
  }

  private resetPlaybackRate(): void {
    const baseRate = Number(GAME_CONFIG.audio.music.basePlaybackRate);
    this.currentPlaybackRate = baseRate;
    this.targetPlaybackRate = baseRate;
  }
}

function musicVolumeToSynthGain(): number {
  return GAME_CONFIG.audio.music.volume * 2.4;
}