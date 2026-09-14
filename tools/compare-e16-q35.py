#!/usr/bin/env python3
"""One optional frozen E16 attempt on the existing CI runner.
Raw output needs an independent audit; this helper never grants a quality pass.
Reference images and weights stay outside the game distribution.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile

ATTEMPT = "e16-q35-a8409cc-r1"
PRODUCT_COMMIT = "a8409cc0de04a503f50395487478fe0cfb2a98e7"
PRODUCT_BUNDLE = "14ea69b0d7bf581c25deeca6bdcf8f3c9ecd4bc895384c216902efe01c1eab28"
ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get("RUNNER_TEMP", str(ROOT / "test-results"))) / ATTEMPT
OUT = ROOT / "test-results" / ATTEMPT
EVIDENCE = ROOT / "AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14"
RUNTIME = {
    "url": "https://github.com/ggml-org/llama.cpp/releases/download/b10809/llama-b10809-bin-ubuntu-x64.tar.gz",
    "bytes": 16734586,
    "sha256": "5e34434ddc6d03cd1584f403201aff0d4bd1a5793a72ff7e286532dfd1e4b941",
    "file": "runtime.tar.gz",
}
MODEL_BASE = "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/"
WEIGHTS = [
    {"file": "Qwen3.5-9B-Q8_0.gguf", "bytes": 9527502048,
     "sha256": "809626574d0cb43d4becfa56169980da2bb448f2299270f7be443cb89d0a6ae4"},
    {"file": "mmproj-F16.gguf", "bytes": 918166080,
     "sha256": "f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f"},
]
REFERENCE = {
    "url": "https://playdead.com/press/INSIDE/INSIDE_screenshots.zip",
    "file": "reference.zip", "bytes": 22376901,
    "sha256": "ae2a37d2e5ce6712184eae7b923ca71e222220818de7939c4dd1b2947912e411",
}
CANDIDATE = [
    {
        "file": "visual-south-frame.png",
        "bytes": 1329117,
        "sha256": "537f7fcf23d17581458a0ff05d427b1eb085f75f9d36a39c1abbfb6454c55bce"
    },
    {
        "file": "visual-cinder-frame.png",
        "bytes": 1337651,
        "sha256": "5dd9c498f77bc713d24b967bf8abb818e39eee2c35480878e8a1aa59fea9507b"
    },
    {
        "file": "visual-arcade-frame.png",
        "bytes": 1344498,
        "sha256": "5484424a4fcfc8614e9a3746fc20a2bccedaa86839223ca6e465c6759341bd3c"
    },
    {
        "file": "visual-marrow-frame.png",
        "bytes": 1346435,
        "sha256": "26406617dcf8e3f3cbffa91eecb7e4879efe6a53d36400a9b61187cca37a3624"
    },
    {
        "file": "visual-stacks-frame.png",
        "bytes": 1379664,
        "sha256": "ee04fb4a3e946136aed8ce46ac9b37de4deb62631fa276275b1004259fb8a947"
    },
    {
        "file": "visual-plant-frame.png",
        "bytes": 1389518,
        "sha256": "c8fd39a56926bac0082aacabc5638c48e832732ba98a101c8d8630896958922f"
    },
    {
        "file": "visual-survey-frame.png",
        "bytes": 1319434,
        "sha256": "cdcb0e06db16d690850c71ab5f86d2dd5717fcf53ed43e5a2d1684f6852b485d"
    },
    {
        "file": "visual-ventfield-frame.png",
        "bytes": 1251154,
        "sha256": "59de6218f2f393c9c191359549f368debc1ef79f774633f961327ebe6608639b"
    }
]
REFERENCE_HASHES = [
    "f5448456ba69dbb8f3e7746a5612faa52a21f5bd0363348965594eada6573131",
    "b6630e55d04c6db891ec8e2aa09923979f698f0514a54893b99682bbe8807e51",
    "35a01057415396ffa17e8629ac465707de672d4aef57ccb24df55a244c748d14",
    "0635c6e29ae93cdf0dfde62e75eded1d2d7975a59bbc85b3d0215cf283712642",
    "ae09efeecb6b5e3ac7f30e4aca2f3127634ed01dc23d7864cee8a53ac4858a5f",
    "5007958e4e4797e5da62ac95b0e0ba00671e9f503c48bc90ee9f8bc6cc6584c2",
    "efec73fb352ac39a85d6c4bd3d890b4810f3421a1fb9323b6d15ea006a07d431",
    "ada7f6977d2557b561e58a5c561947b6d06312c160d23155c2a95ce097a57e1e"
]
# Fixed before the first attempt. Only A/B labels and original pixels enter the prompt.
CANDIDATE_SIDE = "B"
CONTEXT = 65536
OUTPUT_TOKENS = 8192
INFERENCE_SECONDS = 7200
CONTROL_SECONDS = 300
PREPARE_SECONDS = 1800
HEADROOM_BYTES = 1500 * 1024 * 1024

QUESTION = """Evaluate only the visual art of the two anonymous works shown.
You receive 16 original screenshots: A01..A08, then B01..B08. Do not assume
the numbering pairs show the same place. Judge each work across all eight views.

First, disclose whether you recognize either source, can name either work, or
can infer which work is the benchmark and which is in development. If you
recognize something, say exactly what and how certain you are. Do not conceal
recognition to make the comparison blind. If you do not know, say unknown;
do not invent identities.

Then give a concise, concrete observation about EACH of A01 through B08:
the visible lighting, dominant palette, depth/contact, and material scale.
Ground every observation in that image, not in a remembered game's reputation.

Compare the two sets on these four axes:
1. A dominant directional light and its shadow hierarchy organize ALL 8 views.
2. A controlled charcoal/ash/rust warm palette and cool sky whenever sky appears.
3. Contact shadows and ambient occlusion ground every visible solid, without
   floating-looking breaks.
4. Texture density and scale remain coherent across the whole set, without breaks.

For each axis identify the stronger set or equality and cite specific image
labels and visible reasons. Do not reward complexity, photo-realism, minimalism,
number of pixels, or famous style by themselves. Compare how well the artwork
solves these four visual problems. Differences in camera genre are not scores.

Finally choose A, B, or equal for this visual-art element alone and explain the
decisive evidence. If the images are insufficient to judge, explicitly say
insufficient instead of inventing a tie or a winner. Include limitations.
End your complete answer with COMPARISON_END. Aim for at most 1800 words.
"""

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def write_json(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def verify(path, spec):
    if path.stat().st_size != spec["bytes"] or digest(path) != spec["sha256"]:
        raise ValueError("Size/hash mismatch: " + path.name)

def fetch(spec):
    target = WORK / spec["file"]
    if target.exists():
        verify(target, spec)
        return target
    partial = target.with_suffix(target.suffix + ".part")
    if partial.exists():
        raise RuntimeError("Existing partial acquisition; inspect instead of retrying unchanged")
    start = time.monotonic()
    seen = 0
    with urllib.request.urlopen(spec["url"], timeout=60) as response, partial.open("xb") as f:
        if getattr(response, "status", None) != 200:
            raise RuntimeError("Unexpected public-download status")
        while True:
            block = response.read(4 * 1024 * 1024)
            if not block:
                break
            seen += len(block)
            if seen > spec["bytes"]:
                raise RuntimeError("Download exceeded pinned size")
            if time.monotonic() - start > 1200:
                raise TimeoutError("Public download exceeded fixed 1200-second budget")
            f.write(block)
    verify(partial, spec)
    partial.replace(target)
    print(json.dumps({"stage": "acquired", "file": spec["file"], "bytes": seen,
                      "sha256": spec["sha256"], "seconds": time.monotonic() - start}), flush=True)
    return target

def clean_env(binary):
    # No credentials, tools, repository context or browser is exposed to the model.
    return {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
            "LD_LIBRARY_PATH": str(binary.parent)}

def preparation_timeout(_signal, _frame):
    raise TimeoutError("Preparation exceeded fixed 1800-second total budget")

def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    if (OUT / "prepared.json").exists():
        raise RuntimeError("Attempt already prepared; do not silently rerun")
    WORK.mkdir(parents=True, exist_ok=True)
    write_json("attempt.json", {
        "attempt": ATTEMPT, "product_commit": PRODUCT_COMMIT, "bundle_sha256": PRODUCT_BUNDLE,
        "ci_commit": os.environ.get("GITHUB_SHA"), "runtime": RUNTIME, "weights": WEIGHTS,
        "reference": REFERENCE, "reference_image_hashes": REFERENCE_HASHES,
        "candidate": CANDIDATE, "candidate_side": CANDIDATE_SIDE,
        "input_policy": "All 16 original PNG bytes; no crop, resize, modified pixels or synthetic proxy.",
        "context": CONTEXT, "output_tokens": OUTPUT_TOKENS, "inference_seconds": INFERENCE_SECONDS,
        "preparation_seconds": PREPARE_SECONDS, "control_seconds": CONTROL_SECONDS,
        "sampling": {"temperature": 1.0, "top_p": 0.95, "top_k": 20, "min_p": 0,
                     "presence_penalty": 1.5, "repeat_penalty": 1.0, "seed": 917},
        "source_visibility": "Only neutral labels, question and pixels; the model has no tool access.",
        "blind_validity": "not measured", "quality_verdict": "not measured",
        "limitations": [
            "Recognition must be audited from raw answer; source recognition invalidates blindness.",
            "Synthetic input control does not establish artistic judgement or benchmark success.",
            "Source-known agent diagnosis is separate from this attempted comparison.",
            "No successful throughput prediction for this new model/runner has been measured."
        ],
    })
    disk = shutil.disk_usage(WORK)
    memory = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    required = sum(x["bytes"] for x in WEIGHTS) + RUNTIME["bytes"] + REFERENCE["bytes"] + HEADROOM_BYTES
    write_json("resources.json", {"free_bytes": disk.free, "required_free_bytes": required,
                                 "physical_memory_bytes": memory, "cpu_count": os.cpu_count(),
                                 "headroom_bytes": HEADROOM_BYTES})
    if disk.free < required:
        raise RuntimeError("Runner disk budget insufficient; no installed-software deletion attempted")
    if memory < 14 * 1024 ** 3:
        raise RuntimeError("Runner memory below predeclared 14 GiB minimum")
    for item in CANDIDATE:
        verify(EVIDENCE / "webkit-a8409cc" / item["file"], item)
    control = EVIDENCE / "visual-evaluator-control-r1/control.png"
    verify(control, {"bytes": 2338, "sha256": "8df9cbefd5fa3ca296eed9dfa1170f074db932738d323d7c3a77e047a78a60b2"})
    # Frames are frozen actual inputs; the live checkout bundle is not substituted.
    runtime = fetch(RUNTIME)
    runtime_dir = WORK / "runtime"
    runtime_dir.mkdir()
    with tarfile.open(runtime) as archive:
        archive.extractall(runtime_dir, filter="data")
    bins = list(runtime_dir.rglob("llama-mtmd-cli"))
    if len(bins) != 1:
        raise RuntimeError("Pinned archive did not contain exactly one mtmd CLI")
    binary = bins[0]
    help_result = subprocess.run([str(binary), "--help"], cwd=binary.parent,
                                env=clean_env(binary), capture_output=True, timeout=60)
    (OUT / "runtime-help.stdout.txt").write_bytes(help_result.stdout)
    (OUT / "runtime-help.stderr.txt").write_bytes(help_result.stderr)
    help_text = (help_result.stdout + help_result.stderr).decode("utf-8", errors="replace")
    for flag in ["--image", "--image-min-tokens", "--image-max-tokens", "--ctx-size", "--jinja", "--offline"]:
        if flag not in help_text:
            raise RuntimeError("Pinned runtime does not advertise " + flag)
    if help_result.returncode:
        raise RuntimeError("Runtime --help failed before model acquisition")
    reference_zip = fetch(REFERENCE)
    reference_images = {}
    with zipfile.ZipFile(reference_zip) as archive:
        for name in archive.namelist():
            if not name.lower().endswith(".png") or "__MACOSX/" in name:
                continue
            data = archive.read(name)
            sha = hashlib.sha256(data).hexdigest()
            if sha in REFERENCE_HASHES:
                if sha in reference_images:
                    raise RuntimeError("Duplicate pinned reference image")
                reference_images[sha] = data
    if set(reference_images) != set(REFERENCE_HASHES):
        raise RuntimeError("Reference archive missing original pinned images")
    neutral = WORK / "neutral"
    neutral.mkdir()
    inputs = []
    for side in ["A", "B"]:
        for i in range(8):
            label = side + str(i + 1).zfill(2)
            data = ((EVIDENCE / "webkit-a8409cc" / CANDIDATE[i]["file"]).read_bytes()
                    if side == CANDIDATE_SIDE else reference_images[REFERENCE_HASHES[i]])
            if data[:8] != b"\x89PNG\r\n\x1a\n":
                raise RuntimeError("Non-PNG comparison input")
            (neutral / (label + ".png")).write_bytes(data)
            inputs.append({"label": label, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    shutil.copyfile(control, neutral / "control.png")
    prompt = QUESTION + "\n" + "\n".join(x["label"] + ": <__media__>" for x in inputs)
    (neutral / "prompt.txt").write_text(prompt, encoding="utf-8")
    (OUT / "prompt.txt").write_text(prompt, encoding="utf-8")
    write_json("inputs.json", inputs)
    for item in WEIGHTS:
        fetch(dict(item, url=MODEL_BASE + item["file"]))
    write_json("prepared.json", {"binary": str(binary), "neutral_directory": str(neutral),
                                 "finished_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})

def run_model(kind):
    prepared = json.loads((OUT / "prepared.json").read_text(encoding="utf-8"))
    binary = Path(prepared["binary"])
    neutral = Path(prepared["neutral_directory"])
    if (OUT / (kind + "-run.json")).exists() or (OUT / (kind + ".stdout.txt")).exists():
        raise RuntimeError("This inference attempt already has output; no blind retry")
    is_control = kind == "control"
    images = ["control.png"] if is_control else [x["label"] + ".png" for x in json.loads((OUT / "inputs.json").read_text())]
    if is_control:
        prompt = (EVIDENCE / "visual-evaluator-control-r1/prompt.txt").read_text(encoding="utf-8")
        (neutral / "control-prompt.txt").write_text(prompt + "\n<__media__>\n", encoding="utf-8")
    args = [str(binary), "-m", str(WORK / WEIGHTS[0]["file"]), "--mmproj", str(WORK / WEIGHTS[1]["file"]),
            "--offline", "-ngl", "0", "--no-mmproj-offload", "--fit", "off",
            "-t", str(min(4, os.cpu_count() or 1)), "-c", str(4096 if is_control else CONTEXT),
            "-b", "512", "-ub", "128", "-n", str(512 if is_control else OUTPUT_TOKENS),
            "--image-min-tokens", "1024", "--image-max-tokens", "4096", "--jinja",
            "--temp", "1.0", "--top-p", "0.95", "--top-k", "20", "--min-p", "0",
            "--presence-penalty", "1.5", "--repeat-penalty", "1.0", "--seed", "917",
            "-f", str(neutral / ("control-prompt.txt" if is_control else "prompt.txt"))]
    for img in images:
        args += ["--image", str(neutral / img)]
    seconds = CONTROL_SECONDS if is_control else INFERENCE_SECONDS
    record = {"kind": kind, "args": args, "timeout_seconds": seconds, "cwd": str(binary.parent),
              "started_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "status": "started", "blind_validity": "not measured", "quality_verdict": "not measured"}
    write_json(kind + "-run.json", record)
    started = time.monotonic()
    with (OUT / (kind + ".stdout.txt")).open("xb") as stdout, (OUT / (kind + ".stderr.txt")).open("xb") as stderr:
        process = subprocess.Popen(args, cwd=binary.parent, env=clean_env(binary),
                                   stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr)
        try:
            record["exit_code"] = process.wait(timeout=seconds)
            record["status"] = "process_finished"
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            record["exit_code"] = None
            record["status"] = "timeout"
    record["seconds"] = time.monotonic() - started
    record["files"] = [{"file": f.name, "bytes": f.stat().st_size, "sha256": digest(f)}
                       for f in [OUT / (kind + ".stdout.txt"), OUT / (kind + ".stderr.txt")]]
    write_json(kind + "-run.json", record)
    print(json.dumps(record), flush=True)
    if record["status"] == "timeout" or record["exit_code"] != 0:
        raise RuntimeError(kind + " did not complete; no valid comparison claimed")

def export():
    # Lossless text-only job-log route. No reference PNGs or weights are exported.
    if not OUT.exists():
        return
    for path in sorted(OUT.iterdir()):
        if not path.is_file() or path.suffix not in [".json", ".txt", ".py"]:
            continue
        spec = {"file": path.name, "bytes": path.stat().st_size, "sha256": digest(path)}
        print("[comparison-material-meta] " + json.dumps(spec), flush=True)
        with path.open("rb") as f:
            offset = 0
            for block in iter(lambda: f.read(3000), b""):
                print("[comparison-material-chunk] " + json.dumps({
                    "file": path.name, "offset": offset, "base64": base64.b64encode(block).decode("ascii")
                }), flush=True)
                offset += len(block)
        print("[comparison-material-end] " + json.dumps(spec), flush=True)

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) == 2 else ""
    try:
        if action == "prepare":
            # CI is Linux. Bound the complete stage, including hashing and blocking I/O.
            signal.signal(signal.SIGALRM, preparation_timeout)
            signal.alarm(PREPARE_SECONDS)
            try:
                prepare()
            finally:
                signal.alarm(0)
        elif action in ["control", "compare"]:
            run_model(action)
        elif action == "export":
            export()
        else:
            raise ValueError("Expected prepare, control, compare, or export")
    except Exception as error:
        write_json(action + "-error.json", {"type": type(error).__name__, "error": str(error),
                   "at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "blind_validity": "not measured", "quality_verdict": "not measured"})
        print(type(error).__name__ + ": " + str(error), file=sys.stderr)
        sys.exit(1)
