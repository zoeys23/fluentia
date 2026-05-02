"use client";

import React, { useState, useEffect } from "react";
import { BookOpen, Copy, Download, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type LearnedPhrase = { phrase: string; translation: string; topic: string; times_seen?: number };

function toMarkdown(items: LearnedPhrase[]) {
  const groups = items.reduce<Record<string, LearnedPhrase[]>>((acc, item) => {
    (acc[item.topic] ??= []).push(item);
    return acc;
  }, {});

  return [
    "# My Learnings\n",
    ...Object.entries(groups).map(([topic, phrases]) => [
      `## ${topic}`,
      ...phrases.map((p) => {
        const reinforced = (p.times_seen ?? 1) > 1 ? ` _(enhanced)_` : "";
        return `- **${p.phrase}** — ${p.translation}${reinforced}`;
      }),
    ].join("\n")),
  ].join("\n\n");
}

export default function LearningsPage() {
  const [copied, setCopied] = useState(false);
  const [learned, setLearned] = useState<LearnedPhrase[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("learned_phrases");
      if (raw) {
        const parsed: LearnedPhrase[] = JSON.parse(raw);
        parsed.sort((a, b) => (b.times_seen ?? 1) - (a.times_seen ?? 1));
        setLearned(parsed);
      }
    } catch {
      // ignore corrupt data
    }
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(toMarkdown(learned));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([toMarkdown(learned)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "learnings.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 bg-background pb-24">
      <div className="max-w-5xl mx-auto p-6 md:p-12 space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-heading font-bold">Learnings</h2>
            <p className="text-muted-foreground text-sm mt-1">Phrases and vocabulary from your sessions</p>
          </div>
          {learned.length > 0 && (
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="outline" size="icon" onClick={handleCopy}>
                      {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  }
                />
                <TooltipContent>Copy as Markdown</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="outline" size="icon" onClick={handleDownload}>
                      <Download className="h-4 w-4" />
                    </Button>
                  }
                />
                <TooltipContent>Download .md</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {learned.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">Nothing here yet — complete a session to start building your learnings.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {learned.map((item, idx) => (
              <Card key={`${item.phrase}-${idx}`} className="shadow-none border-transparent bg-secondary/50">
                <CardContent className="flex items-center justify-between p-5">
                  <div className="space-y-0.5">
                    <p className="font-heading font-bold text-lg text-foreground">{item.phrase}</p>
                    <p className="text-sm text-muted-foreground">{item.translation}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {(item.times_seen ?? 1) > 1 && (
                      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest rounded-full gap-1 text-green-600 border-green-600/30">
                        <Check className="h-3 w-3" />
                        Enhanced
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest border-none rounded-full">
                      {item.topic}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
