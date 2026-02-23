import { useEffect, useRef, useState } from "react";
import "../styles/voiceTyping.css";

export default function VoiceTyping() {
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);

  const [text, setText] = useState("");
  const [status, setStatus] = useState("Tap mic");
  const [seconds, setSeconds] = useState(0);

  //Analyze
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);


  // ✅ Grammar popup states
  const [showGrammarPopup, setShowGrammarPopup] = useState(false);
  const [grammarOriginal, setGrammarOriginal] = useState("");
  const [grammarCorrected, setGrammarCorrected] = useState("");
  const [grammarLoading, setGrammarLoading] = useState(false);
  

  // Live speech recognition (instant preview)
  const recognitionRef = useRef(null);

  // Audio recording for Whisper (accurate final text)
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // ✅ Clean speech text before grammar correction (remove duplicate sentences etc.)
  const cleanSpeechText = (input) => {
    if (!input) return "";
    let t = input;

    // Normalize spaces
    t = t.replace(/\s+/g, " ").trim();

    // Remove immediate duplicate sentences
    const parts = t
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const cleaned = [];
    for (const s of parts) {
      if (cleaned.length === 0) {
        cleaned.push(s);
        continue;
      }

      const prev = cleaned[cleaned.length - 1].toLowerCase();
      const cur = s.toLowerCase();

      if (prev === cur) continue; // drop exact duplicate sentence
      cleaned.push(s);
    }

    return cleaned.join(" ");
  };

  // --- Setup SpeechRecognition (live preview) ---
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatus("Use Chrome/Edge for live typing");
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    // LIVE text (may be messy / duplicated by browser)
    recognition.onresult = (event) => {
      let liveText = "";
      for (let i = 0; i < event.results.length; i++) {
        liveText += event.results[i][0].transcript + " ";
      }
      setText(liveText.trim());
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  //Analyze

  const analyzeText = async () => {
  if (!text.trim()) return;

  setAnalysisLoading(true);
  try {
    const res = await fetch("http://localhost:5000/api/analyze-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    setAnalysis(data);
  } catch (e) {
    setAnalysis(null);
  } finally {
    setAnalysisLoading(false);
  }
};


  // ✅ Grammar check using YOUR local LanguageTool via Node backend
  const checkGrammarAndShowPopup = async (finalText) => {
    const cleaned = (finalText || "").trim();
    if (!cleaned) return;

    setGrammarLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/grammar-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleaned }),
      });

      const data = await res.json();

      // no issues → no popup
      if (!data?.hasErrors) return;

      setGrammarOriginal(cleaned);
      setGrammarCorrected(data.corrected || cleaned);
      setShowGrammarPopup(true);
    } catch (e) {
      // ignore silently
    } finally {
      setGrammarLoading(false);
    }
  };

  // --- Start both: live preview + audio recording ---
  const start = async () => {
    setStatus("Recording...");
    setSeconds(0);
    setText("");

    // close popup if open
    setShowGrammarPopup(false);
    setGrammarOriginal("");
    setGrammarCorrected("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setStatus("Transcribing...");

        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", audioBlob, "speech.webm");

        try {
          const res = await fetch("http://localhost:5000/api/transcribe", {
            method: "POST",
            body: form,
          });

          const data = await res.json();

          if (data?.text) {
            // ✅ clean transcript first (removes repeats), then show it
            const cleanedTranscript = cleanSpeechText(data.text);

            setText(cleanedTranscript);
            setStatus("Done");

            // ✅ grammar popup uses cleaned transcript
            checkGrammarAndShowPopup(cleanedTranscript);
          } else {
            setStatus("No text returned from server");
          }
        } catch (e) {
          setStatus("Server error (transcribe failed)");
        } finally {
          // release mic
          try {
            stream.getTracks().forEach((t) => t.stop());
          } catch {}
        }
      };

      mediaRecorder.start();
      setRecording(true);

      // Start live recognition (instant preview)
      try {
        recognitionRef.current?.start();
      } catch {}

      // 60s timer auto-stop
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= 59) {
            stop();
            return 60;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setStatus("Microphone permission denied");
    }
  };

  // --- Stop both ---
  const stop = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}

    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    setRecording(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const toggle = () => {
    recording ? stop() : start();
  };

  const clearText = () => {
    setText("");
    setSeconds(0);
    setStatus("Tap mic");

    setShowGrammarPopup(false);
    setGrammarOriginal("");
    //setGrammarCorrected("");
  };

  // ✅ Popup actions
  /*const applyCorrected = () => {
    if (grammarCorrected) {
      setText(grammarCorrected);
      setStatus("Corrected");
    }
    setShowGrammarPopup(false);
  };
*/
  const keepOriginal = () => {
    setShowGrammarPopup(false);
  };

  return (
    <div className="vt-screen">
      <div className="vt-mid vt-mid-noheader">

        {/* PAGE HEADING */}
      <div className="vt-heading-wrap">
        <h1 className="vt-heading">Confidence Progress Meter</h1>
        <div className="vt-heading-line"></div>
      </div>

        {/* TEXT AREA */}
        <div className="vt-textbar vt-textbar-multiline">
          <span className="vt-text vt-text-full">
            {text || "Your words will appear here..."}
          </span>

          <button className="vt-iconbtn" onClick={clearText}>
            🗑️
          </button>
        </div>

        {/* PLAY / STOP BUTTONS */}
        <div className="vt-mini-controls">
          <button className="vt-mini-btn" onClick={start} disabled={recording} title="Start">
            ▶
          </button>

          <button className="vt-mini-btn" onClick={stop} disabled={!recording} title="Stop">
            ⏹
          </button>
        </div>

              {/* TIMER + STATUS */}
      <div className="timer-status">
        {seconds}s / 60s — {status}
        {grammarLoading ? " (Checking grammar...)" : ""}
      </div>

      {/*Analyze*/}
      <button className="vt-mini-btn" onClick={analyzeText} disabled={!text.trim() || analysisLoading}>
        {analysisLoading ? "..." : "Analyze"}
      </button>

      {analysis && (
      <div style={{ marginTop: 12, color: "white", textAlign: "center" }}>
        <div>Confidence: {analysis.score}</div>
        <div>
          Nouns: {analysis.vocabulary.nouns}% | Verbs: {analysis.vocabulary.verbs}% | Adjectives: {analysis.vocabulary.adjectives}%
        </div>
      </div>
      )}


        {/* MIC AREA */}
        <div className="vt-mic-area">
          <div className={`vt-ring vt-r1 ${recording ? "vt-pulse" : ""}`} />
          <div className={`vt-ring vt-r2 ${recording ? "vt-pulse" : ""}`} />
          <div className={`vt-ring vt-r3 ${recording ? "vt-pulse" : ""}`} />

          <button
            className={`vt-mic-btn ${recording ? "vt-mic-live" : ""}`}
            onClick={toggle}
            title={recording ? "Stop" : "Start"}
          >
            🎙️
          </button>
        </div>

        {/* TAP MIC TEXT */}
        <div className="vt-bottom">
          <div className="vt-speak">{recording ? "Recording..." : ""}</div>
          <div className="vt-helper">{listening ? "Live preview…" : ""}</div>
        </div>
      </div>

      {/* ✅ GRAMMAR POPUP */}
      {showGrammarPopup && (
        <div className="vt-popup-backdrop" onClick={keepOriginal}>
          <div className="vt-popup" onClick={(e) => e.stopPropagation()}>
            <div className="vt-popup-title">You have some mistakes</div>

            <div className="vt-popup-sub">This is the corrected one:</div>

            <div className="vt-popup-box">{grammarCorrected}</div>
            
            {/* <div className="vt-popup-actions">
              <button className="vt-popup-btn vt-apply" onClick={applyCorrected}>
                Apply corrected
              </button>
              <button className="vt-popup-btn vt-keep" onClick={keepOriginal}>
                Keep my text
              </button>
            </div> */}

            <div className="vt-popup-actions">
              <button className="vt-popup-btn vt-keep" onClick={keepOriginal}>
                Keep my text
              </button>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
