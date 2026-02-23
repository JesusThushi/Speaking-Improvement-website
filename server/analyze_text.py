import os, json, sys, re
import spacy
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# Load spaCy model
try:
    nlp = spacy.load("en_core_web_sm")
except:
    import subprocess
    subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"])
    nlp = spacy.load("en_core_web_sm")

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def analyze_text(text):
    """Analyze text and return confidence score and vocabulary breakdown"""
    
    if not text or not text.strip():
        return {
            "score": 0,
            "vocabulary": {
                "nouns": 0,
                "verbs": 0,
                "adjectives": 0
            }
        }
    
    try:
        r = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a strict speech confidence analyzer. "
                        "Analyze the speech for: filler words (um, uh, like, you know), "
                        "hesitation patterns, sentence structure, vocabulary richness, "
                        "clarity, and fluency. "
                        "Score 0-40: very low confidence (many fillers, incomplete sentences, heavy hesitation). "
                        "Score 41-60: moderate confidence (some fillers, decent structure). "
                        "Score 61-80: good confidence (few fillers, clear structure). "
                        "Score 81-100: excellent confidence (no fillers, rich vocabulary, very fluent). "
                        "Return ONLY a single integer. No explanation, no punctuation, just the number."
                    )
                },
                {
                    "role": "user",
                    "content": (
                        f"Analyze this speech and return a confidence score (0-100) as a single integer only.\n\n"
                        f"Speech:\n{text}"
                    )
                }
            ],
            max_tokens=10,
            temperature=0.3
        )
        
        score_text = (r.choices[0].message.content or "").strip()
        print(f"DEBUG raw score from OpenAI: '{score_text}'", file=sys.stderr)

        # Robust number extraction
        match = re.search(r'\b(\d{1,3}(?:\.\d+)?)\b', score_text)
        if match:
            score = float(match.group(1))
            score = max(0, min(100, score))
        else:
            score = 50
            
    except Exception as e:
        print(f"OpenAI API error: {e}", file=sys.stderr)
        score = 50

    # Analyze vocabulary with spaCy
    doc = nlp(text)
    noun_count = verb_count = adj_count = total_words = 0

    for token in doc:
        if token.is_alpha and not token.is_stop:
            total_words += 1
            if token.pos_ == "NOUN":
                noun_count += 1
            elif token.pos_ == "VERB":
                verb_count += 1
            elif token.pos_ == "ADJ":
                adj_count += 1

    total_words = total_words or 1

    # Count filler words for extra context (not used in score but useful for debugging)
    filler_words = {"um", "uh", "like", "you know", "basically", "literally", "actually", "so", "well"}
    filler_count = sum(1 for token in doc if token.text.lower() in filler_words)
    print(f"DEBUG filler words found: {filler_count}", file=sys.stderr)

    vocab_percentage = {
        "nouns": round((noun_count / total_words) * 100, 2),
        "verbs": round((verb_count / total_words) * 100, 2),
        "adjectives": round((adj_count / total_words) * 100, 2),
    }

    return {
        "score": round(score),
        "vocabulary": vocab_percentage,
        "filler_count": filler_count
    }

def main():
    text = sys.stdin.read().strip()
    
    if not text and len(sys.argv) > 1:
        text = sys.argv[1]
    
    result = analyze_text(text)
    print(json.dumps(result))

if __name__ == "__main__":
    main()