/**
 * MediaHandler — audio capture + PCM playback.
 * Ported from example-codes/.../media-handler.js
 *
 * Audio in:  browser mic → PCM Int16 @ 16kHz → ArrayBuffer → onAudioData callback
 * Audio out: ArrayBuffer (PCM Int16 @ 24kHz) → scheduled Web Audio playback
 */
export class MediaHandler {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private nextStartTime = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];

  isRecording = false;

  async initializeAudio(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      // pcm-processor.js must be in /public/
      await this.audioContext.audioWorklet.addModule("/pcm-processor.js");
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  async startAudio(onAudioData: (data: ArrayBufferLike) => void): Promise<void> {
    await this.initializeAudio();

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioContext!.createMediaStreamSource(this.mediaStream);
    this.audioWorkletNode = new AudioWorkletNode(this.audioContext!, "pcm-processor");

    this.audioWorkletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!this.isRecording) return;
      const downsampled = this.downsampleBuffer(
        event.data,
        this.audioContext!.sampleRate,
        16000
      );
      const pcm16 = this.convertFloat32ToInt16(downsampled);
      onAudioData(pcm16);
    };

    source.connect(this.audioWorkletNode);
    // Mute local feedback
    const muteGain = this.audioContext!.createGain();
    muteGain.gain.value = 0;
    this.audioWorkletNode.connect(muteGain);
    muteGain.connect(this.audioContext!.destination);

    this.isRecording = true;
  }

  stopAudio(): void {
    this.isRecording = false;
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    this.audioWorkletNode?.disconnect();
    this.audioWorkletNode = null;
  }

  playAudio(arrayBuffer: ArrayBuffer): void {
    if (!this.audioContext) return;
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    const pcmData = new Int16Array(arrayBuffer);
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 32768.0;
    }

    const buffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    this.nextStartTime = Math.max(now, this.nextStartTime);
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.scheduledSources.push(source);
    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx > -1) this.scheduledSources.splice(idx, 1);
    };
  }

  stopAudioPlayback(): void {
    this.scheduledSources.forEach((s) => {
      try { s.stop(); } catch { /* already stopped */ }
    });
    this.scheduledSources = [];
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  private downsampleBuffer(buffer: Float32Array, sampleRate: number, outSampleRate: number): Float32Array {
    if (outSampleRate === sampleRate) return buffer;
    const ratio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = accum / count;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  private convertFloat32ToInt16(buffer: Float32Array): ArrayBuffer {
    const buf = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      buf[i] = Math.min(1, Math.max(-1, buffer[i])) * 0x7fff;
    }
    return buf.buffer;
  }
}
