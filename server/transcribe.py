# transcribe.py
import sys
from faster_whisper import WhisperModel

audio_path = sys.argv[1]

# logs to stderr (so stdout stays clean for transcript)
print("Loading model...", file=sys.stderr)

model = WhisperModel("tiny", device="cpu", compute_type="int8")

print("Model loaded, transcribing...", file=sys.stderr)

segments, info = model.transcribe(
    audio_path,
    vad_filter=False,
    temperature=0.2,
    beam_size=1,
    condition_on_previous_text=False,
)

text = ""
for seg in segments:
    text += seg.text + " "

print(text.strip())