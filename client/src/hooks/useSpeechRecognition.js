import { useEffect, useRef, useState } from "react";

export function useSpeechRecognition({ lang = "en-US" } = {}) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Tap mic to start");

  const recognitionRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SR) {
      setSupported(false);
      setStatus("Speech recognition not supported (use Chrome/Edge)");
      return;
    }

    const recognition = new SR();

    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListening(true);
      setStatus("Listening...");
    };

    recognition.onend = () => {
      setListening(false);
      setStatus("Stopped");
    };

    recognition.onerror = (e) => {
      setListening(false);
      setStatus("Error: " + e.error);
    };

    // IMPORTANT PART — RAW STREAM (no filtering)
    recognition.onresult = (event) => {
      let fullText = "";

      for (let i = 0; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript + " ";
      }

      // Shows EVERYTHING including filler words
      setText(fullText.trim());
    };

    recognitionRef.current = recognition;
  }, [lang]);

  const start = async () => {
    if (!recognitionRef.current) return;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("Mic permission denied");
      return;
    }

    setText("");
    setStatus("Starting...");

    try {
      recognitionRef.current.start();
    } catch {}
  };

  const stop = () => {
    try {
      recognitionRef.current.stop();
    } catch {}
  };

  const toggle = () => {
    listening ? stop() : start();
  };

  const clear = () => {
    setText("");
    setStatus("Cleared");
  };

  return {
    supported,
    listening,
    text,
    status,
    toggle,
    clear
  };
}
