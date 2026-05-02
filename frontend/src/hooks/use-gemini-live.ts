import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioStreamer } from './use-audio-streamer';

export type MessageRole = 'user' | 'tutor';

export interface ChatMessage {
  id: number;
  role: MessageRole;
  content: string;
}

const HOST = "generativelanguage.googleapis.com";

export function useGeminiLive() {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  
  const { startRecording, stopRecording, playAudio, stopPlayback } = useAudioStreamer();

  const connect = useCallback((apiKey: string) => {
    if (!apiKey) {
      console.error("No API key provided for Gemini Live connection");
      return;
    }

    const wsUrl = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      // Send the initial setup configuration
      wsRef.current?.send(JSON.stringify({
        setup: {
          model: "models/gemini-2.0-flash-exp",
          systemInstruction: {
            parts: [{ text: "You are Fluencia, a Spanish tutor. Keep responses short and conversational." }]
          }
        }
      }));
    };

    wsRef.current.onmessage = async (event) => {
      let data;
      // Handle Blob responses (binary WSS messages are blobs in browser)
      if (event.data instanceof Blob) {
        const text = await event.data.text();
        data = JSON.parse(text);
      } else {
        data = JSON.parse(event.data);
      }

      const serverContent = data?.serverContent;
      const parts = serverContent?.modelTurn?.parts;

      // Handle Interruption
      if (serverContent?.interrupted) {
        stopPlayback(); // Instantly stop talking (barge-in)
      }

      // Handle Live Transcriptions (What Gemini thinks we said vs what it's saying)
      // Note: Live API doesn't always send transcripts back directly in this exact format unless tools/functions 
      // are built for it, but this is the structure for capturing model text if provided in parts.
      if (parts?.length) {
        for (const part of parts) {
          // Play incoming audio chunks
          if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
            playAudio(part.inlineData.data);
          }
          // Log/Show incoming text chunks
          if (part.text) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'tutor') {
                return [...prev.slice(0, -1), { ...last, content: last.content + part.text }];
              }
              return [...prev, { id: Date.now(), role: 'tutor', content: part.text }];
            });
          }
        }
      }
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
      stopRecording();
      stopPlayback();
    };

    wsRef.current.onerror = (err) => {
      console.error("Gemini WebSocket Error:", err);
    };
  }, [playAudio, stopPlayback, stopRecording]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  const startMic = useCallback(() => {
    startRecording((base64Audio) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              mimeType: "audio/pcm;rate=16000",
              data: base64Audio,
            }]
          }
        }));
      }
    });
  }, [startRecording]);

  const stopMic = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  return {
    connect,
    disconnect,
    isConnected,
    startMic,
    stopMic,
    messages
  };
}
