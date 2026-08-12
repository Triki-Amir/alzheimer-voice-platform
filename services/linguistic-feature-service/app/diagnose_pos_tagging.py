import os
import sys

MODEL_PATH = os.getenv("POS_MODEL_PATH", "./xlmr-tunisian-pos-final")
if len(sys.argv) > 1:
    MODEL_PATH = sys.argv[1]

print("=" * 60)
print("XLM-R POS TAGGING DIAGNOSTIC")
print("=" * 60)

print(f"\n1. Checking path: {MODEL_PATH}")
if not os.path.exists(MODEL_PATH):
    print(f"   ❌ Path does not exist. This is your problem -- fix the mount/path first.")
    sys.exit(1)
print(f"   ✅ Path exists")
print(f"   Contents: {os.listdir(MODEL_PATH)}")

has_tokenizer_json = os.path.exists(os.path.join(MODEL_PATH, "tokenizer.json"))
print(f"   tokenizer.json present: {has_tokenizer_json} "
      f"{'✅' if has_tokenizer_json else '⚠️  missing -- fast tokenizer may fail to load'}")

print(f"\n2. Loading tokenizer...")
from transformers import AutoTokenizer, AutoModelForTokenClassification

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, use_fast=True)
print(f"   is_fast: {tokenizer.is_fast} {'✅' if tokenizer.is_fast else '❌ THIS IS THE PROBLEM'}")
print(f"   Type: {type(tokenizer).__name__}")

print(f"\n3. Loading model...")
model = AutoModelForTokenClassification.from_pretrained(MODEL_PATH)
print(f"   id2label: {model.config.id2label}")
generic_labels = all(v.startswith("LABEL_") for v in model.config.id2label.values())
if generic_labels:
    print(f"   ❌ THIS IS THE PROBLEM -- generic LABEL_0/LABEL_1/etc, not real POS tags.")
    print(f"      Model config wasn't loaded with your trained label mapping.")
else:
    print(f"   ✅ Real label names present")

print(f"\n4. Running a real tag test...")
test_words = ["لا", "لا", "لا", "هو", "بيدو", "معناها"]

import torch
encoding = tokenizer(test_words, is_split_into_words=True, return_tensors="pt", truncation=True)
word_ids = encoding.word_ids(batch_index=0)
print(f"   word_ids: {word_ids}")
if all(w is None for w in word_ids):
    print(f"   ❌ THIS IS THE PROBLEM -- word_ids() returns all None, "
          f"meaning tag alignment can never work regardless of model quality.")
else:
    with torch.no_grad():
        outputs = model(**encoding)
        preds = torch.argmax(outputs.logits, dim=-1)[0].tolist()
    seen = set()
    print(f"   Predicted tags per word:")
    for token_idx, word_idx in enumerate(word_ids):
        if word_idx is not None and word_idx not in seen:
            seen.add(word_idx)
            label = model.config.id2label[preds[token_idx]]
            print(f"     {test_words[word_idx]:<15} -> {label}")
    print(f"\n   ✅ If real tags (not null/None) appear above, the model+tokenizer "
          f"pipeline works correctly in isolation -- the bug is elsewhere "
          f"(e.g. how POSTaggingService wraps this, or the model_path env var "
          f"not reaching the running service).")

print("\n" + "=" * 60)
print("DONE")
print("=" * 60)