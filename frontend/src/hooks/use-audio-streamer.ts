import { useRef, useCallback } from 'react';

// Converts ArrayBuffer to Base64 (needed for Gemini WS payload)
export function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Converts Base64 from Gemini back to AudioBuffer
export async function base64ToAudioBuffer(base64: string, audioCtx: AudioContext) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // The audio from Gemini is 24kHz raw PCM 16-bit
  const audioData = new Int16Array(bytes.buffer);
  const floatData = new Float32Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    floatData[i] = audioData[i] / 32768.0;
  }
  
  const audioBuffer = audioCtx.createBuffer(1, floatData.length, 24000);
  audioBuffer.getChannelData(0).set(floatData);
  return audioBuffer;
}

export function useAudioStreamer() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const startRecording = useCallback(async (onAudioData: (base64: string) => void) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000, // Gemini wants 16kHz
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      audioContextRef.current = audioCtx;

      // Load the processor we created in public/audio-processor.js
      await audioCtx.audioWorklet.addModule('/audio-processor.js');

      const source = audioCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor');
      workletRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        const pcmBuffer = event.data as ArrayBuffer;
        const base64 = arrayBufferToBase64(pcmBuffer);
        onAudioData(base64);
      };

      source.connect(workletNode);
      workletNode.connect(audioCtx.destination);
    } catch (err) {
      console.error("Error starting audio recording:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (workletRef.current) {
      workletRef.current.disconnect();
      workletRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  // --- Playback Logic ---
  const playAudio = useCallback(async (base64Audio: string) => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = playbackCtxRef.current;
    
    // Resume context if suspended (browser auto-play policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const audioBuffer = await base64ToAudioBuffer(base64Audio, ctx);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Queue audio to play sequentially without gaps
    const currentTime = ctx.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime;
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;
  }, []);

  const stopPlayback = useCallback(() => {
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close();
      playbackCtxRef.current = null;
      nextPlayTimeRef.current = 0;
    }
  }, []);

  return { startRecording, stopRecording, playAudio, stopPlayback };
}
