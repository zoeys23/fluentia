"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_ROUTES = [
  { value: "chat", label: "Chat", path: "/chat" },
  { value: "plan", label: "Plan", path: "/plan" },
  { value: "sessions", label: "Sessions", path: "/sessions" },
  { value: "learnings", label: "Learnings", path: "/learnings" },
] as const;

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isSessionDetail = /^\/sessions\/.+/.test(pathname);

  if (isSessionDetail) {
    return <>{children}</>;
  }

  const activeTab =
    TAB_ROUTES.find((t) => pathname.startsWith(t.path))?.value ?? "chat";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="pt-4 shrink-0">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const route = TAB_ROUTES.find((t) => t.value === value);
            if (route) router.push(route.path);
          }}
        >
          <TabsList className="h-10">
            {TAB_ROUTES.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="px-5 text-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        </div>
      </div>
      <div className="flex flex-col flex-1 min-h-0">{children}</div>
    </div>
  );
}
