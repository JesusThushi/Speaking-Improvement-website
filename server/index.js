// server/index.js
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

// ✅ Flexible filler detection (um/umm/ummm, uh/uhh, er/err, erm/ermm)
const FILLER_PATTERNS = [
  { key: "um", re: /\bum+\b/gi },
  { key: "uh", re: /\buh+\b/gi },
  { key: "erm", re: /\berm+\b/gi },
  { key: "er", re: /\ber+\b/gi },
  { key: "ah", re: /\bah+\b/gi },
  { key: "like", re: /\blike\b/gi },
  { key: "you know", re: /\byou\s+know\b/gi },
  { key: "i mean", re: /\bi\s+mean\b/gi },
  { key: "actually", re: /\bactually\b/gi },
  { key: "basically", re: /\bbasically\b/gi },
  { key: "literally", re: /\bliterally\b/gi },
  { key: "okay", re: /\bokay\b/gi },
  { key: "well", re: /\bwell\b/gi },
  { key: "right", re: /\bright\b/gi },
];

function countFillers(text) {
  const t = (text || "").toLowerCase();
  const counts = {};
  let total = 0;

  for (const p of FILLER_PATTERNS) {
    const m = t.match(p.re);
    const c = m ? m.length : 0;
    counts[p.key] = c;
    total += c;
  }
  return { total, counts };
}

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Whisper backend running" });
});

app.post("/api/transcribe", upload.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const audioPath = path.resolve(req.file.path);
  const scriptPath = path.resolve(__dirname, "transcribe.py");
  const PYTHON_CMD = "python";

  execFile(
    PYTHON_CMD,
    [scriptPath, audioPath],
    { maxBuffer: 20 * 1024 * 1024 },
    (error, stdout, stderr) => {
      try { fs.unlinkSync(audioPath); } catch {}

      if (error) {
        console.error("TRANSCRIBE ERROR:", error);
        console.error("STDERR:", stderr);
        return res.status(500).json({
          error: "Python transcribe failed",
          details: (stderr || "").toString().slice(0, 2000) || String(error),
        });
      }

      const text = (stdout || "").trim();
      const fillers = countFillers(text);

      return res.json({ text, fillers });
    }
  );
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

app.listen(5000, () => console.log("✅ Server running on http://localhost:5000"));