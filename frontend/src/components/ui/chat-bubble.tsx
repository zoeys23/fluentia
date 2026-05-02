import React from "react";
import { cn } from "@/lib/utils";

interface ChatBubbleProps {
  content: string;
  caption?: string;
  translation?: string;
  role: "tutor" | "user";
  tutorName?: string;
  className?: string;
}

export function ChatBubble({
  content,
  caption,
  translation,
  role,
  tutorName,
  className,
}: ChatBubbleProps) {
  const isTutor = role === "tutor";

  return (
    <div
      className={cn(
        "flex w-full flex-col mb-4",
        isTutor ? "items-start" : "items-end",
        className
      )}
    >
      {isTutor && tutorName && (
        <span className="mb-1 ml-1 text-xs font-semibold text-primary/80 uppercase tracking-wider">
          {tutorName}
        </span>
      )}
      
      <div
        className={cn(
          "max-w-[85%] rounded-2xl p-4 shadow-sm transition-all",
          isTutor
            ? "bg-secondary text-foreground rounded-bl-none"
            : "bg-primary text-primary-foreground rounded-br-none"
        )}
      >
        <p className="text-base leading-relaxed">{content}</p>
        
        {(caption || translation) && (
          <div className="mt-2 space-y-1 pt-2 border-t border-current/10">
            {caption && (
              <p className="text-sm italic opacity-80">{caption}</p>
            )}
            {translation && (
              <p className="text-sm opacity-60 font-medium">{translation}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
