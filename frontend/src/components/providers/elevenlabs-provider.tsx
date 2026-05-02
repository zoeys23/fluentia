"use client";

import { ConversationProvider } from "@elevenlabs/react";

export function ElevenLabsProvider({ children }: { children: React.ReactNode }) {
  return <ConversationProvider>{children}</ConversationProvider>;
}
