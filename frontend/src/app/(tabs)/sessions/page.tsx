"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSessionId } from "@/lib/session";
import { getSessions, type SessionListItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getSessionId();
    if (!userId) return;
    getSessions(userId)
      .then(setSessions)
      .catch((err) => console.error("Failed to load sessions:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 bg-background pb-24">
      <div className="max-w-5xl mx-auto p-6 md:p-12 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-heading font-bold">Sessions</h2>
            <p className="text-muted-foreground text-sm mt-0.5">Your conversation history with Fluencia</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => router.push(`/sessions/${getSessionId()}`)}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">No sessions yet — start your first one!</p>
        ) : (
          <div className="rounded-lg border divide-y overflow-hidden">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => router.push(`/sessions/${session.id}`)}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  session.status === "in-progress" && "bg-primary/5"
                )}
              >
                <MessageSquare className={cn(
                  "h-4 w-4 shrink-0",
                  session.status === "in-progress" ? "text-primary" : "text-muted-foreground/40"
                )} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm text-foreground truncate">{session.topic}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                  {session.status === "in-progress" && (
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-none rounded-full font-bold uppercase tracking-widest">
                      In Progress
                    </Badge>
                  )}
                  <span>{session.duration_min} min</span>
                  <span className="hidden sm:inline">{formatDate(session.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
