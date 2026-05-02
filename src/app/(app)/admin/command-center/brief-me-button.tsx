"use client";

import { useState } from "react";
import { Volume2 } from "lucide-react";

export function BriefMeButton({ briefing }: { briefing: string }) {
  const [speaking, setSpeaking] = useState(false);

  function handleBriefing() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(briefing);
    utterance.rate = 0.94;
    utterance.pitch = 0.82;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button
      type="button"
      onClick={handleBriefing}
      className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.16)] transition hover:border-cyan-100/45 hover:bg-cyan-200/16 focus:outline-none focus:ring-2 focus:ring-cyan-200/50"
    >
      <Volume2 className="size-4" />
      {speaking ? "Briefing..." : "Brief me"}
    </button>
  );
}
