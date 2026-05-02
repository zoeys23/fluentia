const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
const GEMINI_HOST = "generativelanguage.googleapis.com";

export type WsEvent =
  | { type: "user"; text: string }
  | { type: "gemini"; text: string }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "tool_call"; name: string; args: unknown; result: unknown }
  | { type: "error"; error: string };

interface GeminiWsConfig {
  sessionId: string;
  week?: number;
  day?: number;
  onOpen?: () => void;
  onAudio?: (data: ArrayBuffer) => void;
  onEvent?: (event: WsEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
}

interface TokenResponse {
  token: string;
  auth_type?: "key" | "token";
  system_prompt: string;
  model: string;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class GeminiWsClient {
  private ws: WebSocket | null = null;
  private config: GeminiWsConfig;

  constructor(config: GeminiWsConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const week = this.config.week ?? 1;
    const day = this.config.day ?? 1;

    // 1. Fetch ephemeral token + session config from backend
    let tokenData: TokenResponse;
    try {
      const res = await fetch(
        `${BACKEND}/api/token?session_id=${this.config.sessionId}&week=${week}&day=${day}`
      );
      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
      tokenData = await res.json();
    } catch (err) {
      this.config.onEvent?.({ type: "error", error: String(err) });
      return;
    }

    // 2. Open WebSocket directly to Gemini
    const authParam = tokenData.auth_type === "key"
      ? `key=${tokenData.token}`
      : `access_token=${tokenData.token}`;
    const wsUrl = `wss://${GEMINI_HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?${authParam}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // 3. Send setup message — Gemini WS wire protocol uses camelCase
      this.ws!.send(
        JSON.stringify({
          setup: {
            model: tokenData.model,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Puck" },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: tokenData.system_prompt }],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
            },
          },
        })
      );
    };

    this.ws.onmessage = async (event) => {
      // Gemini WS sends JSON as Blob in browsers
      let raw: string;
      if (event.data instanceof Blob) {
        raw = await event.data.text();
      } else {
        raw = event.data as string;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        console.error("Gemini WS parse error", raw);
        return;
      }

      // Setup complete — signal onOpen now (after handshake, not on WS open)
      if (data.setupComplete !== undefined) {
        this.config.onOpen?.();
        // Prompt the tutor to speak first
        this.sendText("Hello! Please greet me and start today's lesson.");
        return;
      }

      const serverContent = data.serverContent as Record<string, unknown> | undefined;
      if (!serverContent) return;

      // Audio chunks
      const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
      const parts = modelTurn?.parts as Array<Record<string, unknown>> | undefined;
      if (parts?.length) {
        for (const part of parts) {
          const inlineData = part.inlineData as Record<string, unknown> | undefined;
          if (inlineData?.data) {
            const mimeType = String(inlineData.mimeType ?? "");
            if (mimeType.startsWith("audio/")) {
              this.config.onAudio?.(base64ToArrayBuffer(String(inlineData.data)));
            }
          }
        }
      }

      // User transcription → emit event + forward to backend
      const inputTx = serverContent.inputTranscription as Record<string, unknown> | undefined;
      if (inputTx?.text) {
        const text = String(inputTx.text);
        this.config.onEvent?.({ type: "user", text });
        this.postUtterance("user", text);
      }

      // Tutor transcription → emit event + forward to backend
      const outputTx = serverContent.outputTranscription as Record<string, unknown> | undefined;
      if (outputTx?.text) {
        const text = String(outputTx.text);
        this.config.onEvent?.({ type: "gemini", text });
        this.postUtterance("tutor", text);
      }

      // Turn complete
      if (serverContent.turnComplete) {
        this.config.onEvent?.({ type: "turn_complete" });
      }

      // Interrupted (barge-in)
      if (serverContent.interrupted) {
        this.config.onEvent?.({ type: "interrupted" });
      }
    };

    this.ws.onclose = (event) => {
      console.warn("Gemini WS closed:", event.code, event.reason);
      this.config.onClose?.(event);
    };
    this.ws.onerror = (event) => {
      console.error("Gemini WS error:", event);
      this.config.onError?.(event);
    };
  }

  /** Send a PCM Int16 audio chunk to Gemini. */
  sendAudio(data: ArrayBufferLike): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: arrayBufferToBase64(data),
          },
        },
      })
    );
  }

  sendText(text: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true,
      },
    }));
  }

  sendImage(base64Data: string, mimeType = "image/jpeg"): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          video: { data: base64Data, mimeType },
        },
      })
    );
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Fire-and-forget: persist transcription utterance to backend. */
  private postUtterance(speaker: "user" | "tutor", text: string): void {
    fetch(`${BACKEND}/api/session/${this.config.sessionId}/utterances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speaker, text }),
    }).catch((err) => console.warn("utterance POST failed:", err));
  }
}
