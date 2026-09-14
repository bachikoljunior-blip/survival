"""Measure the complete private r3 reading input with the official frozen tokenizer."""
from pathlib import Path
import hashlib
import importlib.metadata
import json
import os
import signal
import time
import urllib.error
import urllib.request
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parent.parent
PRIVATE = Path(os.environ["RUNNER_TEMP"]) / "survival-e9-reader-recovery-r2"
READERS = PRIVATE / "readable-r3"
REPORT = ROOT / "test-results/e9-readable-r3/token-count.json"
URL = "https://huggingface.co/Qwen/Qwen3.5-9B/resolve/21eca8a083a2121a92fba681f4a7c72cf20ff1a7/tokenizer.json"
TOKENIZER_SHA = "5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42"
TOKENIZER_BYTES = 12807982
PINS = {
    "A-readable.txt": "bebdfe880669679599547699b3a0cc93bbcd2caa8abf348a556a8988c6d18cb9",
    "B-readable.txt": "83efef2038209b724f4c4ec555f0904882a125690253c069c42b69fe5eecb048",
}
started = time.monotonic()
report = {
    "schema_version": 1, "status": "started", "checks": [], "files": [],
    "tokenizer_url": URL, "tokenizer_sha256": TOKENIZER_SHA,
    "scope": "Actual raw text token counts using the pinned official Qwen tokenizer, with no truncation. GGUF runtime and final chat-template token equality remain to be verified before comparison.",
    "not_claimed": ["comparison performed", "model understood the input", "GGUF prompt count measured", "E9 satisfied"],
}
def check(name, value):
    report["checks"].append({"name": name, "passed": bool(value)})
    if not value:
        raise RuntimeError(name)
def timeout(signum, frame):
    raise TimeoutError("Token count probe exceeded 300 seconds")
signal.signal(signal.SIGALRM, timeout)
signal.alarm(300)
try:
    report["tokenizers_version"] = importlib.metadata.version("tokenizers")
    check("tokenizers version fixed", report["tokenizers_version"] == "0.22.2")
    raw = b""
    with urllib.request.urlopen(URL, timeout=60) as response:
        check("official file returned HTTP 200", response.status == 200)
        raw = response.read(TOKENIZER_BYTES + 1)
    check("official tokenizer size and hash match", len(raw) == TOKENIZER_BYTES and hashlib.sha256(raw).hexdigest() == TOKENIZER_SHA)
    path = PRIVATE / "official-qwen35-tokenizer.json"
    path.write_bytes(raw)
    tokenizer = Tokenizer.from_file(str(path))
    tokenizer.no_truncation()
    tokenizer.no_padding()
    check("truncation and padding disabled", tokenizer.truncation is None and tokenizer.padding is None)
    texts = []
    for filename, expected in PINS.items():
        data = (READERS / filename).read_bytes()
        check(filename + " equals frozen r3 output", hashlib.sha256(data).hexdigest() == expected)
        text = data.decode("utf-8")
        encoding = tokenizer.encode(text, add_special_tokens=False)
        restored = tokenizer.decode(encoding.ids, skip_special_tokens=False)
        check(filename + " survives encode/decode without changing authored bytes", restored.encode("utf-8") == data)
        report["files"].append({"file": filename, "bytes": len(data), "sha256": expected, "tokens": len(encoding.ids), "decoded_bytes_identical": True})
        texts.append(text)
    complete = "\n\n".join(texts)
    encoded = tokenizer.encode(complete, add_special_tokens=False)
    check("complete pair round-trips", tokenizer.decode(encoded.ids, skip_special_tokens=False) == complete)
    report["pair"] = {"bytes": len(complete.encode("utf-8")), "sha256": hashlib.sha256(complete.encode("utf-8")).hexdigest(), "tokens": len(encoded.ids)}
    # This is a planning reserve, not a claim about the unmeasured native template.
    report["budget_planning"] = {
        "raw_pair_tokens": len(encoded.ids),
        "question_template_reserve_tokens": 4096,
        "generation_reserve_tokens": 8192,
        "required_total_with_reserves": len(encoded.ids) + 4096 + 8192,
        "fits_65536_with_these_reserves": len(encoded.ids) + 4096 + 8192 <= 65536,
        "qualification": "The native runtime must count the actual completed chat prompt before generating; these reserves do not permit silently dropping either reader.",
    }
    report["status"] = "raw input measured without truncation; native prompt and comparison pending"
except Exception as error:
    report["status"] = "token probe failed; no comparison"
    report["error_class"] = type(error).__name__
    if isinstance(error, urllib.error.HTTPError):
        report["http_status"] = error.code
    raise SystemExit(1)
finally:
    signal.alarm(0)
    report["elapsed_seconds"] = time.monotonic() - started
    try:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("[e9-token-count] " + json.dumps(report, ensure_ascii=False), flush=True)
    except Exception:
        raise SystemExit(1) from None
