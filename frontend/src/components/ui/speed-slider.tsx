"use client";

import React from "react";
import { Turtle, Rabbit } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpeedSliderProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

export function SpeedSlider({ value, onChange, className }: SpeedSliderProps) {
  const steps = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];

  return (
    <div className={cn("flex items-center gap-4 w-full max-w-xs px-4", className)}>
      <Turtle className="h-5 w-5 text-muted-foreground" />
      <div className="relative flex-1 flex items-center h-8">
        <input
          type="range"
          min="0.5"
          max="1.5"
          step="0.1"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-primary">
          {value.toFixed(1)}x
        </div>
      </div>
      <Rabbit className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
