'use client';

export type AudioDspPreset = 'normal' | 'vocal' | 'bass' | 'treble' | 'night';

export interface PlayerAudioGraph {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  bassFilter: BiquadFilterNode;
  voiceFilter: BiquadFilterNode;
  highPass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  gainNode: GainNode;
  activePreset: AudioDspPreset;
}

/**
 * Initializes real Web Audio API DSP chain on an HTML5 video/audio element.
 */
export function createAudioGraph(mediaElement: HTMLMediaElement): PlayerAudioGraph | null {
  if (typeof window === 'undefined') return null;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const source = ctx.createMediaElementSource(mediaElement);

    // 1. Highpass filter to eliminate sub-audible rumble
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 20;

    // 2. Lowshelf filter for Bass Boost (100Hz)
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 100;
    bassFilter.gain.value = 0;

    // 3. Peaking filter for Vocal Clarity (2.5kHz)
    const voiceFilter = ctx.createBiquadFilter();
    voiceFilter.type = 'peaking';
    voiceFilter.frequency.value = 2500;
    voiceFilter.Q.value = 1.0;
    voiceFilter.gain.value = 0;

    // 4. Dynamics Compressor for Night Mode (prevent sudden ear-piercing peaks)
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = 0; // inactive by default
    compressor.knee.value = 30;
    compressor.ratio.value = 1;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    // 5. Master Gain
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;

    // Audio Pipeline: source -> highPass -> bassFilter -> voiceFilter -> compressor -> gainNode -> destination
    source.connect(highPass);
    highPass.connect(bassFilter);
    bassFilter.connect(voiceFilter);
    voiceFilter.connect(compressor);
    compressor.connect(gainNode);
    gainNode.connect(ctx.destination);

    return {
      ctx,
      source,
      bassFilter,
      voiceFilter,
      highPass,
      compressor,
      gainNode,
      activePreset: 'normal',
    };
  } catch (err) {
    console.warn('Web Audio API attachment notice (CORS stream or browser restriction):', err);
    return null;
  }
}

/**
 * Applies real DSP filter adjustments to the audio pipeline.
 */
export function applyDspPreset(graph: PlayerAudioGraph | null, preset: AudioDspPreset): void {
  if (!graph) return;
  const { ctx, bassFilter, voiceFilter, highPass, compressor } = graph;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;

  switch (preset) {
    case 'bass':
      // +7.5dB boost at 100Hz, neutral vocal, compressor off
      bassFilter.gain.setTargetAtTime(7.5, now, 0.05);
      voiceFilter.gain.setTargetAtTime(0, now, 0.05);
      highPass.frequency.setTargetAtTime(20, now, 0.05);
      compressor.threshold.setTargetAtTime(0, now, 0.05);
      compressor.ratio.setTargetAtTime(1, now, 0.05);
      break;

    case 'vocal':
      // Cut low-end rumble (120Hz highpass), boost voice presence (+6dB at 2.5kHz)
      bassFilter.gain.setTargetAtTime(-3.0, now, 0.05);
      voiceFilter.gain.setTargetAtTime(6.0, now, 0.05);
      highPass.frequency.setTargetAtTime(120, now, 0.05);
      compressor.threshold.setTargetAtTime(0, now, 0.05);
      compressor.ratio.setTargetAtTime(1, now, 0.05);
      break;

    case 'treble':
    case 'night':
      // Night Mode / Treble: Level peaks using compressor (-24dB threshold, 12:1 ratio)
      bassFilter.gain.setTargetAtTime(-3.5, now, 0.05);
      voiceFilter.gain.setTargetAtTime(3.0, now, 0.05);
      highPass.frequency.setTargetAtTime(80, now, 0.05);
      compressor.threshold.setTargetAtTime(-24, now, 0.05);
      compressor.ratio.setTargetAtTime(12, now, 0.05);
      break;

    case 'normal':
    default:
      // Flat studio response
      bassFilter.gain.setTargetAtTime(0, now, 0.05);
      voiceFilter.gain.setTargetAtTime(0, now, 0.05);
      highPass.frequency.setTargetAtTime(20, now, 0.05);
      compressor.threshold.setTargetAtTime(0, now, 0.05);
      compressor.ratio.setTargetAtTime(1, now, 0.05);
      break;
  }

  graph.activePreset = preset;
}

/**
 * Builds an inline WebVTT data URI with sample synchronized subtitles for demo & testing.
 */
export function buildDemoVttSubtitle(title: string, duration: number): string {
  const safeDur = duration > 0 ? duration : 300;
  const vttLines = [
    'WEBVTT',
    '',
    '1',
    '00:00:01.000 --> 00:00:05.000',
    `Playing: ${title}`,
    '',
    '2',
    '00:00:06.000 --> 00:00:12.000',
    'High fidelity audio and ultra responsive playback active.',
    '',
    '3',
    '00:00:15.000 --> 00:00:22.000',
    'Private vault media protection with instant hardware decoding.',
  ];

  if (safeDur > 60) {
    vttLines.push(
      '',
      '4',
      '00:00:30.000 --> 00:00:40.000',
      'Bookmarks, chapter navigation, and A-B loop repeat available.'
    );
  }

  return `data:text/vtt;charset=utf-8,${encodeURIComponent(vttLines.join('\n'))}`;
}
