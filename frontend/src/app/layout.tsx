import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { ElevenLabsProvider } from "@/components/providers/elevenlabs-provider";
import { Header } from "@/components/ui/header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Agentation } from "agentation";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fluencia",
  description: "Your friendly AI language tutor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body">
        <TooltipProvider>
          <ElevenLabsProvider>
            <Header />
            <main className="flex-1 flex flex-col">
              {children}
            </main>
            {process.env.NODE_ENV === "development" && <Agentation />}
          </ElevenLabsProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
