import { useEffect, useRef, useState } from "react";
import "../styles/voiceTyping.css";
import "../styles/hesitationPopup.css"; // ✅ NEW popup css
import { calculateHesitationScore } from "../utils/hesitationScore";

const FILLER_PHRASES = [
  { key: "like", re: /\blike\b/gi },
  { key: "you know", re: /\byou\s+know\b/gi },
  { key: "i mean", re: /\bi\s+mean\b/gi },
  { key: "actually", re: /\bactually\b/gi },
  { key: "basically", re: /\bbasically\b/gi },
  { key: "literally", re: /\bliterally\b/gi },
  { key: "so", re: /\bso\b/gi },
  { key: "well", re: /\bwell\b/gi },
  { key: "right", re: /\bright\b/gi },
  { key: "okay", re: /\bokay\b/gi },
];

const FILLER_SOUNDS = [
  { key: "um", re: /\bum+\b/gi },
  { key: "uh", re: /\buh+\b/gi },
  { key: "erm", re: /\berm+\b/gi },
  { key: "er", re: /\ber+\b/gi },
  { key: "ah", re: /\bah+\b/gi },
];

function countByPatterns(text, patterns) {
  const t = (text || "").toLowerCase();
  const counts = {};
  let total = 0;

  for (const p of patterns) {
    const m = t.match(p.re);
    const c = m ? m.length : 0;
    counts[p.key] = c;
    total += c;
  }

  return { total, counts };
}

export default function VoiceTyping() {
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);

  const [liveText, setLiveText] = useState("");
  const [finalText, setFinalText] = useState(""); // ✅ FIX: you were using setFinalText but state was commented

  const [status, setStatus] = useState("Tap mic");
  const [seconds, setSeconds] = useState(0);

  // Counters
  const [livePhraseFillers, setLivePhraseFillers] = useState({ total: 0, counts: {} });
  const [liveSoundFillers, setLiveSoundFillers] = useState({ total: 0, counts: {} });
  const [finalPhraseFillers, setFinalPhraseFillers] = useState({ total: 0, counts: {} });
  const [finalSoundFillers, setFinalSoundFillers] = useState({ total: 0, counts: {} });

  // ✅ Hesitations (count anytime, show only after talk)
  const [hesitations, setHesitations] = useState(0);
  const [showHesitations, setShowHesitations] = useState(false);
  const [hesitationScore, setHesitationScore] = useState(null);

  // ✅ refs to avoid stale state when calculating
  const hesitationsRef = useRef(0);
  const secondsRef = useRef(0);

  const lastResultTimeRef = useRef(0);
  const pauseTimerRef = useRef(null);

  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  // ✅ avoid showing popup multiple times in one session
  const popupShownRef = useRef(false);

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
      lastResultTimeRef.current = Date.now();
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.onresult = (event) => {
      lastResultTimeRef.current = Date.now();

      let t = "";
      for (let i = 0; i < event.results.length; i++) {
        t += event.results[i][0].transcript + " ";
      }

      const cleaned = t.trim();
      setLiveText(cleaned);

      // Live fillers
      setLivePhraseFillers(countByPatterns(cleaned, FILLER_PHRASES));
      setLiveSoundFillers(countByPatterns(cleaned, FILLER_SOUNDS));
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  }, []);

  // ✅ Pause-based hesitation detector (counts while recording)
  useEffect(() => {
    if (!recording) {
      if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
      pauseTimerRef.current = null;
      return;
    }

    pauseTimerRef.current = setInterval(() => {
      const now = Date.now();
      const delta = now - (lastResultTimeRef.current || now);

      const PAUSE_MS = 800; // ✅ your pause threshold

      // Count a hesitation once per pause event
      if (delta > PAUSE_MS) {
        lastResultTimeRef.current = now;
        setHesitations((h) => {
          const next = h + 1;
          hesitationsRef.current = next;
          return next;
        });
      }
    }, 250);

    return () => {
      if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
      pauseTimerRef.current = null;
    };
  }, [recording]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStreamTracks = () => {
    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
  };

  const computeAndShowHesitationScore = () => {
    if (popupShownRef.current) return; // ✅ prevent double popup
    popupShownRef.current = true;

    const scoreObj = calculateHesitationScore({
      hesitations: hesitationsRef.current,
      durationSeconds: secondsRef.current || 1,
    });

    setHesitationScore(scoreObj);
    setShowHesitations(true);
  };

  const stop = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    setRecording(false);
    stopTimer();

    // ✅ show popup immediately (after stopping)
    computeAndShowHesitationScore();
  };

  const start = async () => {
    setStatus("Recording...");
    setSeconds(0);
    secondsRef.current = 0;

    setLiveText("");
    setFinalText("");

    setLivePhraseFillers({ total: 0, counts: {} });
    setLiveSoundFillers({ total: 0, counts: {} });
    setFinalPhraseFillers({ total: 0, counts: {} });
    setFinalSoundFillers({ total: 0, counts: {} });

    // ✅ reset hesitation
    setHesitations(0);
    hesitationsRef.current = 0;
    setShowHesitations(false);
    setHesitationScore(null);

    popupShownRef.current = false; // ✅ reset for new session
    lastResultTimeRef.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setStatus("Transcribing (final)...");

        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", audioBlob, "speech.webm");

        try {
          const res = await fetch("http://localhost:5000/api/transcribe", {
            method: "POST",
            body: form,
          });

          const raw = await res.text();
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            setStatus("Backend returned non-JSON (check console)");
            // still show popup if not shown
            computeAndShowHesitationScore();
            return;
          }

          if (!res.ok) {
            setStatus(`Server error: ${data?.error || "HTTP " + res.status}`);
            console.log("Backend error details:", data);
            computeAndShowHesitationScore();
            return;
          }

          const txt = data?.text || "";
          setFinalText(txt);

          // Final fillers
          setFinalPhraseFillers(countByPatterns(txt, FILLER_PHRASES));
          setFinalSoundFillers(countByPatterns(txt, FILLER_SOUNDS));

          setStatus("Done ✅");

          // ✅ if user stopped early and popup wasn't shown, show safely
          computeAndShowHesitationScore();
        } catch (e) {
          console.log("Fetch failed:", e);
          setStatus("Server error (transcribe failed)");
          computeAndShowHesitationScore();
        } finally {
          stopStreamTracks();
        }
      };

      mediaRecorder.start();
      setRecording(true);

      try {
        recognitionRef.current?.start();
      } catch {}

      stopTimer();
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          secondsRef.current = next;

          if (s >= 59) {
            stop();
            return 60;
          }
          return next;
        });
      }, 1000);
    } catch {
      setStatus("Microphone permission denied");
    }
  };

  const toggle = () => (recording ? stop() : start());

  const clearText = () => {
    setLiveText("");
    setFinalText("");

    setHesitations(0);
    hesitationsRef.current = 0;

    setShowHesitations(false);
    setHesitationScore(null);

    popupShownRef.current = false;

    setSeconds(0);
    secondsRef.current = 0;

    setStatus("Tap mic");

    setLivePhraseFillers({ total: 0, counts: {} });
    setLiveSoundFillers({ total: 0, counts: {} });
    setFinalPhraseFillers({ total: 0, counts: {} });
    setFinalSoundFillers({ total: 0, counts: {} });
  };

  const closeHesitationPopup = () => setShowHesitations(false);

  return (
  <div className="vt-screen">
    <div className="vt-mid vt-mid-noheader">

      {/* ✅ PAGE HEADING (add this above the text box) */}
      <div className="vt-heading-wrap">
        <h1 className="vt-heading">Confidence Progress Meter</h1>
        <div className="vt-heading-line" />
      </div>

      <div className="vt-textbar vt-textbar-multiline">
          <div className="vt-text vt-text-full" style={{ whiteSpace: "pre-wrap" }}>
            <div style={{ opacity: 0.95, marginBottom: 6 }}>
              {liveText || "Your words will appear here..."}
            </div>

            {/* (optional) final text if you want later:
            <div style={{ opacity: 0.7, marginTop: 10 }}>
              {finalText ? `Final: ${finalText}` : ""}
            </div> */}
          </div>

          <button className="vt-iconbtn" onClick={clearText} title="Clear">
            🗑️
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 10, color: "white" }}>
          <div>
            {seconds}s / 60s — {status}
          </div>

          {/* ✅ Small badge while popup exists */}
          {hesitationScore && (
            <div className="hp-inlineBadge" style={{ marginTop: 8 }}>
              Confidence Score: <b>{hesitationScore.score}/100</b>
            </div>
          )}
        </div>

        <div className="vt-mini-controls">
          <button className="vt-mini-btn" onClick={start} disabled={recording} title="Start">
            ▶
          </button>
          <button className="vt-mini-btn" onClick={stop} disabled={!recording} title="Stop">
            ⏹
          </button>
        </div>

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

        <div className="vt-bottom">
          <div className="vt-speak">{recording ? "Recording..." : ""}</div>
          <div className="vt-helper">{listening ? "Live preview…" : ""}</div>
        </div>
      </div>

      {/* ✅ Hesitation Popup Modal */}
      {showHesitations && hesitationScore && (
        <div className="hp-overlay" onClick={closeHesitationPopup} role="presentation">
          <div className="hp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="hp-top">
              <div className="hp-title">
                <span className="hp-icon">⏸️</span>
                Confidence Scoring Report
              </div>
              <button className="hp-close" onClick={closeHesitationPopup} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="hp-scoreRow">
              <div className="hp-scoreBox">
                <div className="hp-scoreNum">{hesitationScore.score}</div>
                <div className="hp-scoreSub">Score / 100</div>
              </div>

              <div className="hp-meta">
                <div className="hp-pill">
                  <span className="hp-dot" />
                  Level: <b style={{ marginLeft: 6 }}>{hesitationScore.label}</b>
                </div>
                <div className="hp-pill">
                  Pauses / fillers: <b style={{ marginLeft: 6 }}>{hesitations}</b>
                </div>
                <div className="hp-pill">
                  Rate: <b style={{ marginLeft: 6 }}>{hesitationScore.ratePerMin}/min</b>
                </div>
                <div className="hp-pill">
                  Duration: <b style={{ marginLeft: 6 }}>{secondsRef.current}s</b>
                </div>
              </div>
            </div>

            <div className="hp-tips">
              <div className="hp-tipsTitle">Quick tips</div>
              <ul className="hp-tipsList">
                <li>Try a slow breath before starting your next sentence.</li>
                <li>Pause for meaning (1 short pause) instead of many tiny pauses.</li>
                <li>Practice with short sentences first, then increase length.</li>
              </ul>
            </div>

            <div className="hp-actions">
              <button className="hp-btn hp-btnGhost" onClick={closeHesitationPopup}>
                Keep text
              </button>
              <button
                className="hp-btn hp-btnPrimary"
                onClick={() => {
                  closeHesitationPopup();
                  // optional: restart quickly if you want:
                  // start();
                }}
              >
                Practice again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}