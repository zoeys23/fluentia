"use client";

import React from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface VadMicButtonProps {
  isListening?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function VadMicButton({
  isListening = false,
  isActive = true,
  onClick,
  className,
}: VadMicButtonProps) {
  return (
    <div className={cn("flex items-center justify-center p-4", className)}>
      <button
        onClick={onClick}
        disabled={!isActive}
        className={cn(
          "relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-all duration-300",
          isActive
            ? "bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        )}
        aria-label={isListening ? "Stop listening" : "Start listening"}
      >
        {/* Pulsing rings when listening */}
        {isListening && (
          <>
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
            <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 scale-125" />
          </>
        )}
        
        <Mic className={cn("h-8 w-8", isListening && "animate-bounce")} />
      </button>
    </div>
  );
}
