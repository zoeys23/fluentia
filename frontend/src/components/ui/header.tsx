"use client";

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();

  // Hide global header on specific session pages (they have their own header)
  if (/^\/sessions\/.+/.test(pathname)) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto flex h-16 items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="bg-primary/10 p-2 rounded-xl">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <span className="font-heading font-bold text-xl tracking-tight">Fluencia</span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none">Streak</span>
            <span className="text-sm font-bold text-primary">7 Days 🔥</span>
          </div>
          <div className="h-10 w-10 rounded-full bg-secondary border-2 border-primary/10 flex items-center justify-center font-bold text-primary">
            JD
          </div>
        </div>
      </div>
    </header>
  );
}
