"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, Loader2, PhoneOff, Mic2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { SpeedSlider } from "@/components/ui/speed-slider";
import { Persona } from "@/components/ai-elements/persona";
import type { PersonaState } from "@/components/ai-elements/persona";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GeminiWsClient } from "@/lib/gemini-ws";
import { MediaHandler } from "@/lib/media-handler";
import { endSession } from "@/lib/api";
import { advanceDay, getUserId, createSessionId } from "@/lib/session";

interface Message {
  id: number;
  role: "tutor" | "user";
  content: string;
}

type ViewMode = "voice" | "transcript";

export default function SessionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const userId = getUserId();
  const [sessionId] = useState(() => createSessionId());
  const week = parseInt(searchParams.get("week") ?? "1", 10);
  const day = parseInt(searchParams.get("day") ?? "1", 10);

  const [view, setView] = useState<ViewMode>("voice");
  const [speed, setSpeed] = useState(0.8);
  const [timer, setTimer] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isEnding, setIsEnding] = useState(false);

  const wsRef = useRef<GeminiWsClient | null>(null);
  const mediaRef = useRef<MediaHandler | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isConnected]);

  useEffect(() => {
    return () => {
      wsRef.current?.disconnect();
      mediaRef.current?.stopAudio();
    };
  }, []);

  const appendMessage = useCallback((role: "tutor" | "user", text: string) => {
    setMessages((prev) => {
      if (role === "tutor") {
        const last = prev[prev.length - 1];
        if (last?.role === "tutor") {
          return [...prev.slice(0, -1), { ...last, content: last.content + text }];
        }
      }
      return [...prev, { id: Date.now() + Math.random(), role, content: text }];
    });
  }, []);

  const startSession = useCallback(async () => {
    const media = new MediaHandler();
    mediaRef.current = media;

    const ws = new GeminiWsClient({
      sessionId,
      userId,
      week,
      day,
      onOpen: async () => {
        setIsConnected(true);
        setTimer(0);
        try {
          await media.startAudio((chunk) => ws.sendAudio(chunk));
        } catch (err) {
          console.error("Mic access error:", err);
        }
      },
      onAudio: (buf) => {
        setIsSpeaking(true);
        media.playAudio(buf);
      },
      onEvent: (event) => {
        if (event.type === "user") {
          appendMessage("user", event.text);
        } else if (event.type === "gemini") {
          appendMessage("tutor", event.text);
        } else if (event.type === "turn_complete") {
          setIsSpeaking(false);
        } else if (event.type === "interrupted") {
          media.stopAudioPlayback();
          setIsSpeaking(false);
        } else if (event.type === "error") {
          console.error("Session error:", event.error);
        }
      },
      onClose: () => {
        setIsConnected(false);
        setIsSpeaking(false);
        media.stopAudio();
      },
    });

    wsRef.current = ws;
    await ws.connect();
  }, [sessionId, userId, week, day, appendMessage]);

  const stopSession = useCallback(() => {
    wsRef.current?.disconnect();
    mediaRef.current?.stopAudio();
    wsRef.current = null;
    mediaRef.current = null;
    setIsConnected(false);
    setIsSpeaking(false);
  }, []);

  const handleMicClick = useCallback(async () => {
    if (isConnected) {
      stopSession();
    } else {
      await startSession();
    }
  }, [isConnected, startSession, stopSession]);

  const handleEndSession = useCallback(async () => {
    if (isEnding) return;
    setIsEnding(true);
    stopSession();
    try {
      const summary = await endSession(sessionId, week, day);
      localStorage.setItem("last_summary", JSON.stringify(summary));
      localStorage.setItem("last_session_id", sessionId);
      advanceDay(2, 7);
    } catch (err) {
      console.error("End session error:", err);
    }
    router.push("/summary");
  }, [isEnding, stopSession, sessionId, week, day, router]);

  const getPersonaState = (): PersonaState => {
    if (isConnected) return isSpeaking ? "speaking" : "listening";
    return "asleep";
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const lastTutorMessage = [...messages].reverse().find((m) => m.role === "tutor");

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-background/50 backdrop-blur-md z-20">
        <Link
          href="/sessions"
          className="inline-flex items-center justify-center rounded-2xl hover:bg-secondary group h-10 w-10 transition-all hover:scale-105 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5 group-hover:text-primary transition-colors" />
        </Link>

        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-2">
            <span className={cn(
              "h-2 w-2 rounded-full transition-colors duration-500",
              isConnected ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-muted-foreground/30"
            )} />
            <h2 className="font-heading font-bold text-lg">Week {week} · Day {day}</h2>
            <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary px-2 py-0 border-none rounded-full font-bold uppercase tracking-widest">
              Live
            </Badge>
          </div>
          <span className="text-xs font-mono text-muted-foreground">{formatTime(timer)}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={cn("rounded-2xl h-10 w-10", isEnding && "opacity-50 pointer-events-none")}
          onClick={handleEndSession}
          disabled={isEnding}
          title="End session"
        >
          {isEnding ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4 text-destructive" />}
        </Button>
      </header>

      {/* View toggle */}
      <div className="flex justify-center pt-2 pb-1 shrink-0">
        <div className="inline-flex rounded-full bg-secondary p-1 gap-0.5">
          {(["voice", "transcript"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-4 py-1 rounded-full text-sm font-medium capitalize transition-all",
                view === v
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center overflow-hidden">

        {view === "voice" && (
          <div className="flex flex-col items-center justify-center gap-8 w-full max-w-sm px-6 h-full">
            {/* Persona */}
            <Persona
              state={getPersonaState()}
              variant="opal"
              className="size-48 md:size-56 transition-all duration-500"
            />

            {/* Status */}
            <div className="text-center min-h-[80px] flex flex-col justify-center">
              {isEnding ? (
                <div className="flex flex-col items-center gap-2 animate-in fade-in">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Writing your summary…</p>
                </div>
              ) : isSpeaking && lastTutorMessage ? (
                <p className="text-xl font-heading font-medium leading-snug text-foreground animate-in fade-in slide-in-from-bottom-2">
                  {lastTutorMessage.content}
                </p>
              ) : isConnected ? (
                <p className="text-muted-foreground/50 text-sm animate-pulse">Go ahead, I'm listening</p>
              ) : (
                <p className="text-muted-foreground text-sm">Tap the mic to start</p>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-6">
              {/* Mic */}
              <button
                onClick={handleMicClick}
                className={cn(
                  "relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-all duration-300 hover:scale-105 active:scale-95",
                  isConnected
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "bg-secondary text-foreground"
                )}
                aria-label={isConnected ? "Stop" : "Start"}
              >
                {isConnected && (
                  <>
                    <div className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
                    <div className="absolute inset-0 animate-pulse rounded-full bg-primary/15 scale-125" />
                  </>
                )}
                <Mic2 className="h-7 w-7" />
              </button>

              {/* End */}
              <button
                onClick={handleEndSession}
                disabled={isEnding}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                aria-label="End session"
              >
                <PhoneOff className="h-5 w-5" />
              </button>
            </div>

            {/* Speed */}
            <div className="w-full">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-center mb-2">Speed</p>
              <SpeedSlider value={speed} onChange={setSpeed} />
            </div>
          </div>
        )}

        {view === "transcript" && (
          <ScrollArea className="flex-1 w-full h-full">
            <div className="max-w-2xl mx-auto px-6 py-6">
              {messages.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-16">No transcript yet — start the session.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                        msg.role === "tutor"
                          ? "self-start bg-secondary text-foreground rounded-tl-sm"
                          : "self-end bg-primary/10 text-foreground rounded-tr-sm"
                      )}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

      </main>
    </div>
  );
}
