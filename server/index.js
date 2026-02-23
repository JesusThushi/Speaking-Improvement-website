import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { exec } from "child_process";


const app = express();
app.use(cors());
app.use(express.json()); // ✅ for JSON body (grammar-check + rewrite)

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.send("Local Whisper backend running");
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.json({ text: "" });

  const audioPath = req.file.path;

  exec(`python transcribe.py ${audioPath}`, (error, stdout, stderr) => {
    // ✅ safe delete
    try { fs.unlinkSync(audioPath); } catch {}

    if (error) {
      console.error("Python error:", error);
      console.error("stderr:", stderr);
      return res.json({ text: "" });
    }

    res.json({
      text: stdout.trim(),
    });
  });
});

// ✅ Analyze API
app.post("/api/analyze-text", async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.json({
      score: "",
      vocabulary: { nouns: 0, verbs: 0, adjectives: 0 },
    });
  }

  const child = exec("python analyze_text.py", (error, stdout, stderr) => {
    if (error) {
      console.error("analyze_text.py error:", error);
      console.error("stderr:", stderr);
      return res.status(500).json({
        score: "",
        vocabulary: { nouns: 0, verbs: 0, adjectives: 0 },
      });
    }

    try {
      const data = JSON.parse(stdout.trim());
      return res.json(data);
    } catch (e) {
      console.error("Invalid JSON from python:", stdout);
      return res.status(500).json({
        score: "",
        vocabulary: { nouns: 0, verbs: 0, adjectives: 0 },
      });
    }
  });

  child.stdin.write(text.trim());
  child.stdin.end();
});

// ✅ Rewrite endpoint (Node → Ollama local AI)
app.post("/api/rewrite", async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.json({ rewritten: "" });
  }

  try {
    const prompt = `
Rewrite this spoken English into correct, natural written English.
Rules:
- Do NOT add new information.
- Do NOT change the meaning.
- Remove broken repeats like: "Ate. Ate."
- Keep it simple.
- Output ONLY the corrected text (no quotes, no explanation).

Text:
${text.trim()}
`.trim();

    const r = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2:1.5b",
        prompt,
        stream: false,
      }),
    });

    const data = await r.json();
    const rewritten = (data?.response || "").trim();

    res.json({ rewritten: rewritten || text.trim() });
  } catch (err) {
    console.error("Ollama rewrite error:", err);
    res.status(500).json({ rewritten: text.trim() });
  }
});

// ✅ Grammar check endpoint (Node → Java LanguageTool localhost:8010)
app.post("/api/grammar-check", async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.json({ corrected: text || "", hasErrors: false });
  }

  try {
    const params = new URLSearchParams();
    params.append("text", text.trim());
    params.append("language", "en-US");

    const ltRes = await fetch("http://localhost:8010/v2/check", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await ltRes.json();
    const matches = data?.matches || [];

    if (!matches.length) {
      return res.json({ corrected: text, hasErrors: false });
    }

    let corrected = text;
    const sorted = [...matches].sort((a, b) => b.offset - a.offset);

    for (const m of sorted) {
      const replacement = m.replacements?.[0]?.value;
      if (!replacement) continue;

      corrected =
        corrected.slice(0, m.offset) +
        replacement +
        corrected.slice(m.offset + m.length);
    }

    res.json({
      hasErrors: true,
      corrected,
      matches,
    });
  } catch (err) {
    console.error("LanguageTool error:", err);
    res.status(500).json({ corrected: text, hasErrors: false });
  }
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
