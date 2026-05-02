"use client";

import React, { useState, useEffect, useRef } from "react";
import { Play, CheckCircle2, Circle, Sparkles, MessageSquarePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nanoid } from "nanoid";
import { getSessionId, getCurrentDay, setCurrentDay } from "@/lib/session";
import { getPlan, suggestTopic, type LearningPlan, type PlanDay } from "@/lib/api";

interface FlatDay {
  week: number;
  day: number;
  title: string;
  topics: string[];
  index: number; // global order 0-based
}

function flattenPlan(plan: LearningPlan): FlatDay[] {
  return plan.weeks.flatMap((w) =>
    w.days.map((d) => ({
      week: w.week,
      day: d.day,
      title: d.title,
      topics: d.topics,
      index: (w.week - 1) * w.days.length + (d.day - 1),
    }))
  );
}

export default function PlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeekState] = useState(1);
  const [currentDay, setCurrentDayState] = useState(1);
  const [suggestion, setSuggestion] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const sessionId = useRef("");

  useEffect(() => {
    sessionId.current = getSessionId();
    const { week, day } = getCurrentDay();
    setCurrentWeekState(week);
    setCurrentDayState(day);

    getPlan(sessionId.current)
      .then((p) => { if (p) setPlan(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const handleSuggest = async () => {
    if (!suggestion.trim() || !plan) return;
    setSuggesting(true);
    try {
      const updated = await suggestTopic(sessionId.current, suggestion);
      setPlan(updated);
      setSuggestion("");
    } catch (err) {
      console.error("Suggest topic error:", err);
    } finally {
      setSuggesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-6">
        <p className="font-heading font-bold text-xl">No plan yet</p>
        <p className="text-muted-foreground text-sm max-w-xs">
          Start a planning chat and Fluencia will build your personalised learning plan.
        </p>
        <Button size="sm" onClick={() => router.push(`/chat/${nanoid()}`)}>
          Start a chat
        </Button>
      </div>
    );
  }

  const flatDays = flattenPlan(plan);
  const currentIndex = (currentWeek - 1) * (plan.weeks[0]?.days.length ?? 7) + (currentDay - 1);

  const getDayStatus = (idx: number): "done" | "active" | "upcoming" =>
    idx < currentIndex ? "done" : idx === currentIndex ? "active" : "upcoming";

  const activeDay = flatDays[currentIndex];

  return (
    <div className="flex-1 bg-background pb-24">
      <div className="max-w-5xl mx-auto p-6 md:p-12">
        <div className="md:grid md:grid-cols-12 md:gap-12 items-start">

          {/* Main Content */}
          <div className="md:col-span-8 space-y-12">

            {/* Plan header */}
            <div className="space-y-1">
              <h2 className="text-2xl font-heading font-bold">{plan.language}</h2>
              <p className="text-sm text-muted-foreground">{plan.goal}</p>
            </div>

            {/* Learning Path */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm uppercase tracking-[0.2em] font-bold text-muted-foreground">
                  Learning Path
                </h3>
                <span className="text-xs font-bold text-primary/60">
                  {currentIndex} day{currentIndex !== 1 ? "s" : ""} completed
                </span>
              </div>

              {plan.weeks.map((week) => (
                <div key={week.week} className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">
                    Week {week.week} — {week.theme}
                  </p>
                  <div className="space-y-2">
                    {week.days.map((planDay) => {
                      const idx =
                        (week.week - 1) * week.days.length + (planDay.day - 1);
                      const status = getDayStatus(idx);
                      return (
                        <Card
                          key={`${week.week}-${planDay.day}`}
                          className={cn(
                            "shadow-none border transition-colors",
                            status === "active"
                              ? "border-primary/30 bg-primary/5"
                              : "border-transparent bg-secondary/50 hover:bg-secondary/80",
                          )}
                        >
                          <CardContent className="flex items-center gap-4 py-3 px-4">
                            {status === "done" && (
                              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                            )}
                            {status === "active" && (
                              <Play className="h-5 w-5 text-primary fill-current shrink-0" />
                            )}
                            {status === "upcoming" && (
                              <Circle className="h-5 w-5 text-muted-foreground/30 shrink-0" />
                            )}

                            <div className="flex-1 min-w-0">
                              <span
                                className={cn(
                                  "font-bold block truncate",
                                  status === "upcoming"
                                    ? "text-muted-foreground/60"
                                    : "text-foreground",
                                )}
                              >
                                {planDay.title}
                              </span>
                              {status !== "upcoming" && (
                                <span className="text-xs text-muted-foreground truncate">
                                  {planDay.topics.slice(0, 2).join(" · ")}
                                  {planDay.topics.length > 2 ? " ···" : ""}
                                </span>
                              )}
                            </div>

                            <span className="text-xs text-muted-foreground font-medium tabular-nums shrink-0">
                              Day {planDay.day}
                            </span>

                            {status === "active" && (
                              <Button
                                size="sm"
                                className="hidden md:inline-flex shrink-0"
                                render={
                                  <Link
                                    href={`/sessions/${sessionId.current}?week=${week.week}&day=${planDay.day}`}
                                  />
                                }
                              >
                                Continue
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>

            {/* Suggest a Topic */}
            <Card className="bg-secondary/30 border border-dashed border-muted-foreground/20 shadow-none">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <MessageSquarePlus className="h-5 w-5 text-primary" />
                  <h4 className="font-heading font-bold text-lg">
                    Something else in mind?
                  </h4>
                </div>
                <p className="text-muted-foreground text-sm">
                  Tell {plan.tutor_name} what you'd like to talk about next, and
                  they'll update your plan.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder={`Suggest a topic to ${plan.tutor_name}...`}
                    value={suggestion}
                    onChange={(e) => setSuggestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSuggest()}
                    disabled={suggesting}
                  />
                  <Button
                    onClick={handleSuggest}
                    disabled={!suggestion.trim() || suggesting}
                    size="sm"
                  >
                    {suggesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Send"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <aside className="md:col-span-4 mt-12 md:mt-0 space-y-4 md:sticky md:top-12">

            {/* Start Session CTA */}
            {activeDay && (
              <Button
                size="lg"
                className="w-full flex flex-col h-auto py-6"
                render={
                  <Link
                    href={`/sessions/${sessionId.current}?week=${currentWeek}&day=${currentDay}`}
                  />
                }
              >
                <Play className="h-5 w-5 fill-current" />
                <span className="font-bold text-lg">Start Session</span>
                <span className="text-xs opacity-70 font-bold uppercase tracking-widest">
                  Today: {activeDay.title}
                </span>
              </Button>
            )}

            {/* Plan Meta */}
            <Card className="bg-secondary shadow-none border-none">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="bg-primary/10 p-2.5 rounded-xl">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="block text-xl font-bold leading-none capitalize">
                    {plan.level}
                  </span>
                  <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">
                    Level
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-secondary shadow-none border-none">
              <CardContent className="p-4">
                <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground block mb-1">
                  Tutor
                </span>
                <span className="font-bold">{plan.tutor_name}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {plan.dialect}
                </span>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
