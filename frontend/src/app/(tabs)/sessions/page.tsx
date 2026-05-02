"use client";

import React from "react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSessionId } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Session {
  id: string;
  topic: string;
  date: string;
  duration: string;
  messages: number;
  status: "completed" | "in-progress";
}

const pastSessions: Session[] = [
  { id: nanoid(), topic: "Subjunctive Mood", date: "Today", duration: "14 min", messages: 22, status: "in-progress" },
  { id: nanoid(), topic: "At the Market", date: "Yesterday", duration: "18 min", messages: 31, status: "completed" },
  { id: nanoid(), topic: "Basic Greetings", date: "Apr 9", duration: "12 min", messages: 19, status: "completed" },
  { id: nanoid(), topic: "Basic Greetings", date: "Apr 8", duration: "10 min", messages: 15, status: "completed" },
];

export default function SessionsPage() {
  const router = useRouter();

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

        <div className="rounded-lg border divide-y overflow-hidden">
          {pastSessions.map((session) => (
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
                <span>{session.duration}</span>
                <span className="hidden sm:inline">{session.date}</span>
              </div>
            </button>
          ))}
        </div>

        {pastSessions.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-12">No sessions yet — start your first one!</p>
        )}
      </div>
    </div>
  );
}
