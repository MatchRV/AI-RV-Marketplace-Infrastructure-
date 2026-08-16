import { useState, useRef, useCallback } from "react";

interface UseSpeechToTextOptions {
  onResult: (transcript: string) => void;
}

export type SpeechStatus = "idle" | "listening" | "unsupported";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognitionAPI: any =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;

export function useSpeechToText({ onResult }: UseSpeechToTextOptions) {
  const [status, setStatus] = useState<SpeechStatus>(
    SpeechRecognitionAPI ? "idle" : "unsupported"
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI || status === "listening") return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => setStatus("listening");

    recognition.onresult = (event: any) => {
      const transcript: string = event.results[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) {
        onResult(transcript.trim());
      }
    };

    recognition.onerror = () => setStatus("idle");
    recognition.onend = () => setStatus("idle");

    recognitionRef.current = recognition;
    recognition.start();
  }, [status, onResult]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setStatus("idle");
  }, []);

  const toggle = useCallback(() => {
    if (status === "listening") {
      stopListening();
    } else {
      startListening();
    }
  }, [status, startListening, stopListening]);

  return { status, toggle };
}
