"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Loader2, Star, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { applyRecommendations, type SessionSummary } from "@/lib/api";
import { getSessionId } from "@/lib/session";

function RatingDots({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 w-2 rounded-full",
            i < value ? "bg-primary" : "bg-muted-foreground/20",
          )}
        />
      ))}
    </div>
  );
}

const TAG_LABELS: Record<string, string> = {
  first_use: "First use",
  dialect_specific: "Dialect",
  improving: "Improving",
};

export default function SummaryPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("last_summary");
    if (raw) {
      try {
        const parsed: SessionSummary = JSON.parse(raw);
        setSummary(parsed);
        // Accumulate key phrases into persistent learnings store
        if (parsed.key_phrases?.length) {
          const existing = JSON.parse(localStorage.getItem("learned_phrases") ?? "[]");
          const merged = [
            ...existing,
            ...parsed.key_phrases.map((kp) => ({
              phrase: kp.target,
              translation: kp.native,
              topic: parsed.session_meta.day_title || "Session",
            })),
          ];
          localStorage.setItem("learned_phrases", JSON.stringify(merged));
        }
      } catch {
        router.replace("/plan");
      }
    } else {
      router.replace("/plan");
    }
  }, [router]);

  const handleApply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      await applyRecommendations(getSessionId());
      localStorage.removeItem("last_summary");
      router.push("/plan");
    } catch (err) {
      console.error("Apply recommendations error:", err);
      setApplying(false);
    }
  };

  const handleSkip = () => {
    localStorage.removeItem("last_summary");
    router.push("/plan");
  };

  if (!summary) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { session_meta, tutor_note, key_phrases, performance, plan_recommendation } = summary;

  return (
    <div className="flex-1 bg-background pb-24">
      <div className="max-w-2xl mx-auto p-6 md:p-12 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">
            Week {session_meta.week} · Day {session_meta.day}
          </p>
          <h1 className="text-2xl font-heading font-bold">{session_meta.day_title}</h1>
          <p className="text-sm text-muted-foreground">
            Topics: {session_meta.planned_topics.join(", ")}
          </p>
        </div>

        {/* Tutor note */}
        <Card className="bg-primary/5 border-primary/20 shadow-none">
          <CardContent className="p-5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              From your tutor
            </p>
            <p className="text-sm leading-relaxed text-foreground">{tutor_note}</p>
          </CardContent>
        </Card>

        {/* Ratings */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-secondary shadow-none border-none">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Fluency
              </p>
              <RatingDots value={performance.fluency_rating} />
              <p className="text-xl font-bold">{performance.fluency_rating}/5</p>
            </CardContent>
          </Card>
          <Card className="bg-secondary shadow-none border-none">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Confidence
              </p>
              <RatingDots value={performance.confidence_rating} />
              <p className="text-xl font-bold">{performance.confidence_rating}/5</p>
            </CardContent>
          </Card>
        </div>

        {/* Strengths & Struggles */}
        {(performance.strengths.length > 0 || performance.struggles.length > 0) && (
          <div className="space-y-3">
            {performance.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <TrendingUp className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <span className="text-foreground">{s}</span>
              </div>
            ))}
            {performance.struggles.map((s, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <TrendingDown className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* Key Phrases */}
        {key_phrases.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm uppercase tracking-[0.2em] font-bold text-muted-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Key Phrases
            </h3>
            {key_phrases.map((kp, i) => (
              <Card key={i} className="bg-secondary/50 shadow-none border-transparent">
                <CardContent className="p-4 flex items-start justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-heading font-bold text-base text-foreground">
                      {kp.target}
                    </p>
                    <p className="text-sm text-muted-foreground">{kp.native}</p>
                    <p className="text-xs text-muted-foreground/70 italic">{kp.context}</p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 text-[10px] font-bold uppercase tracking-widest border-none rounded-full"
                  >
                    {TAG_LABELS[kp.tag] ?? kp.tag}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {/* Recommendation note */}
        {!plan_recommendation.ready_for_next && plan_recommendation.reinforce.length > 0 && (
          <Card className="bg-amber-500/10 border-amber-500/20 shadow-none">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
                Worth revisiting
              </p>
              <p className="text-sm text-muted-foreground">
                {plan_recommendation.reinforce.join(", ")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <Button
            className="w-full font-bold gap-2"
            onClick={handleApply}
            disabled={applying}
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating your plan...
              </>
            ) : (
              <>
                Update my plan <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground text-xs font-bold uppercase tracking-[0.2em]"
            onClick={handleSkip}
            disabled={applying}
          >
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
