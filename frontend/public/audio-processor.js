class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      const pcm16 = new Int16Array(channelData.length);
      // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
      for (let i = 0; i < channelData.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.floor(channelData[i] * 32768)));
      }
      // Send the PCM buffer back to the main thread
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
