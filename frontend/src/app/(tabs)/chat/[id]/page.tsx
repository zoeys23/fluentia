"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, ArrowUp, Bot, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanContent,
  PlanFooter,
  PlanAction,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { nanoid } from "nanoid";
import { getSessionId } from "@/lib/session";
import { sendOnboardingMessage, type LearningPlan } from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

export default function ChatSessionPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>("");
  const [isTyping, setIsTyping] = useState(false);
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [isTweaking, setIsTweaking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nanoid(),
      role: "assistant",
      content:
        "¡Hola! I'm Fluencia. I'm here to help you master a new language through real conversation. What language are you trying to learn, and why?",
    },
  ]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const handleSend = useCallback(
    async (submittedText: string) => {
      if (!submittedText.trim() || !sessionId) return;

      setMessages((prev) => [
        ...prev,
        { id: nanoid(), role: "user", content: submittedText },
      ]);
      setIsTyping(true);

      try {
        const response = await sendOnboardingMessage(sessionId, submittedText);
        setMessages((prev) => [
          ...prev,
          { id: nanoid(), role: "assistant", content: response.reply },
        ]);
        if (response.plan_ready && response.plan) {
          setPlan(response.plan);
        }
      } catch (err) {
        console.error("Chat error:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: nanoid(),
            role: "assistant",
            content: "Sorry, I had a connection issue. Could you try again?",
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [sessionId],
  );

  const handleTweak = useCallback(
    async (suggestion: string) => {
      if (!suggestion.trim() || !sessionId) return;

      setMessages((prev) => [
        ...prev,
        { id: nanoid(), role: "user", content: suggestion },
      ]);
      setIsTyping(true);
      setIsTweaking(false);

      try {
        const response = await sendOnboardingMessage(sessionId, suggestion);
        setMessages((prev) => [
          ...prev,
          { id: nanoid(), role: "assistant", content: response.reply },
        ]);
        if (response.plan_ready && response.plan) {
          setPlan(response.plan);
        }
      } catch (err) {
        console.error("Tweak error:", err);
      } finally {
        setIsTyping(false);
      }
    },
    [sessionId],
  );

  const showInput = !plan || isTweaking;

  return (
    <>
      <header className="flex items-center px-4 py-3 bg-background/50 backdrop-blur-md z-20 shrink-0">
        <button
          onClick={() => router.push("/chat")}
          className="inline-flex items-center justify-center rounded-2xl hover:bg-secondary group h-10 w-10 transition-all hover:scale-105 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5 group-hover:text-primary transition-colors" />
        </button>
      </header>

      <Conversation>
        <ConversationContent className="max-w-2xl mx-auto w-full">
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary">
              <Bot className="size-5" />
            </div>
          </div>

          {messages.map((msg) => (
            <Message key={msg.id} from={msg.role}>
              <MessageContent>{msg.content}</MessageContent>
            </Message>
          ))}

          {isTyping && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer className="text-sm">Thinking...</Shimmer>
              </MessageContent>
            </Message>
          )}

          {plan && (
            <Message from="assistant">
              <Plan defaultOpen className="w-full max-w-sm">
                <PlanHeader>
                  <div>
                    <PlanTitle>{`Your ${plan.language} Plan`}</PlanTitle>
                    <PlanDescription>{`By ${plan.tutor_name} · ${plan.level}`}</PlanDescription>
                  </div>
                  <PlanAction>
                    <PlanTrigger />
                  </PlanAction>
                </PlanHeader>
                <PlanContent>
                  <p className="text-sm text-muted-foreground mb-3">{plan.summary}</p>
                  <ul className="space-y-2">
                    {plan.weeks.map((week) => (
                      <li key={week.week} className="flex items-start gap-3">
                        <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                        <span className="text-sm font-medium">
                          Week {week.week}: {week.theme}
                        </span>
                      </li>
                    ))}
                  </ul>
                </PlanContent>
                <PlanFooter className="flex-col gap-2 border-t pt-4">
                  <Button
                    className="w-full font-bold gap-2"
                    onClick={() => router.push("/plan")}
                  >
                    Looks good <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground text-xs font-bold uppercase tracking-[0.2em]"
                    onClick={() => setIsTweaking(true)}
                  >
                    Tweak it
                  </Button>
                </PlanFooter>
              </Plan>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {showInput && (
        <div className="p-4 w-full max-w-2xl mx-auto shrink-0">
          <PromptInput
            onSubmit={(msg) => (plan ? handleTweak(msg.text) : handleSend(msg.text))}
            className={cn(
              "w-full [&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:bg-secondary/80 [&_[data-slot=input-group]]:dark:bg-secondary/80",
            )}
          >
            <PromptInputTextarea
              ref={inputRef}
              placeholder={isTweaking ? "What would you like to change?" : "Type your message..."}
              className="px-4 py-3 text-sm bg-transparent border-none focus-visible:ring-0 shadow-none focus-visible:outline-none"
            />
            <PromptInputFooter className="px-3 pb-2">
              <PromptInputSubmit className="rounded-full h-9 w-9 shrink-0">
                <ArrowUp className="h-4 w-4" />
              </PromptInputSubmit>
            </PromptInputFooter>
          </PromptInput>
        </div>
      )}
    </>
  );
}
