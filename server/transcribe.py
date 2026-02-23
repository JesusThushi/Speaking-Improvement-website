import sys
from faster_whisper import WhisperModel

audio_path = sys.argv[1]

model = WhisperModel("base", device="cpu", compute_type="int8")

segments, info = model.transcribe(audio_path)

text = ""
for segment in segments:
    text += segment.text + " "

print(text.strip())
