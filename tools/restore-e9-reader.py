"""Reproduce the previously verified E9 reader without publishing game prose."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import urllib.error

REPOSITORY = Path(__file__).resolve().parent.parent
RECOVERY = REPOSITORY / "AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/disco-e9-method-r2/reader-recovery.json"
EXTRACTOR_SHA256 = "6fd09d2d7d1b3e006b48c224e9065b6cfe6e4e4462c73e518c8c357bdb2edcaa"
DATABASE_BYTES = 40517632
DATABASE_SHA256 = "ae364f994f1afbe6024a8c7e3f8402a73de329d2866a543a81eb42ebceeb4ae5"
DATABASE_URL = "https://raw.githubusercontent.com/msyavuz/disco-api/70adf5c3e2d254e364cd92bdc09d927bf1fa9553/disco.db"
EXPECTED = {
    "reader.json": (563486, "d2991116649fee9756aae5aa7a9f13d78cef7ff9b1519c9f7f2cc6babf293b0e"),
    "field-pins.json": (316159, "b74bfed4b94d198d9869f6fffd5a3708ddd963bdd90079e535010f2bd1bd1a81"),
    "private-source-audit.json": (670263, "645bea55392946c918d52acc0c34100a91aaddf3bc1c0e55dbc9825f7f27ee3c"),
}
REPORT = REPOSITORY / "test-results/e9-reader-recovery-r2/report.json"
PRIVATE_ROOT = Path(os.environ["RUNNER_TEMP"]) / "survival-e9-reader-recovery-r2"
started = time.monotonic()
report = {
    "schema_version": 1,
    "status": "started",
    "claim": "Exact restoration of a previously checked authored graph only; not gameplay, comparison readiness, blind comparison, or an element judgment.",
    "reference_source": {
        "url": DATABASE_URL, "bytes": DATABASE_BYTES, "sha256": DATABASE_SHA256,
        "qualification": "Third-party extraction with limited prior displayed-text corroboration; no new official edition authentication.",
    },
    "extractor_sha256": EXTRACTOR_SHA256,
    "private_output_policy": "Database, original prose, raw source audit, and reader stay only under RUNNER_TEMP. Logs and uploaded report contain pins and structural checks only.",
    "stage": "validate restored extractor",
    "checks": [],
}
def check(name, value):
    report["checks"].append({"name": name, "passed": bool(value)})
    if not value:
        raise RuntimeError("Check failed: " + name)

def total_timeout(signum, frame):
    raise TimeoutError("Current recovery stage exceeded its fixed wall budget")

def arm_timer(maximum=None):
    remaining = 1000 - (time.monotonic() - started)
    if remaining <= 0:
        raise TimeoutError("Recovery exhausted its total wall budget")
    signal.setitimer(signal.ITIMER_REAL, min(maximum, remaining) if maximum is not None else remaining)

signal.signal(signal.SIGALRM, total_timeout)
signal.alarm(1000)
try:
    recovery = json.loads(RECOVERY.read_text(encoding="utf-8"))
    extractor = recovery["extraction"]["r2_reconstructed"]["source"].encode("utf-8")
    check("reconstructed extractor matches pinned reviewed bytes", hashlib.sha256(extractor).hexdigest() == EXTRACTOR_SHA256)
    compile(extractor, "restored-extract.py", "exec")
    PRIVATE_ROOT.mkdir(parents=True, exist_ok=False)
    check("workspace has one GiB free for bounded recovery", shutil.disk_usage(PRIVATE_ROOT).free > 1024 ** 3)
    dbpath = PRIVATE_ROOT / "reference-materials/disco/public-dialogue-db/disco.db"
    dbpath.parent.mkdir(parents=True)
    partial = dbpath.with_suffix(".partial")
    downloaded = 0
    digest = hashlib.sha256()
    download_started = time.monotonic()
    report["stage"] = "pinned database download"
    arm_timer(300)
    # One ordinary public request; no retry, credential, alternate host, or header workaround.
    with urllib.request.urlopen(DATABASE_URL, timeout=60) as response, partial.open("xb") as target:
        check("source returned HTTP 200", response.status == 200)
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            downloaded += len(block)
            if downloaded > DATABASE_BYTES:
                raise RuntimeError("Pinned database size exceeded")
            digest.update(block)
            target.write(block)
            if time.monotonic() - download_started > 300:
                raise TimeoutError("Pinned source download exceeded 300 seconds")
    arm_timer()
    report["download"] = {"bytes": downloaded, "sha256": digest.hexdigest(), "seconds": time.monotonic() - download_started}
    check("database bytes and SHA match original private source", downloaded == DATABASE_BYTES and digest.hexdigest() == DATABASE_SHA256)
    partial.rename(dbpath)
    reader_dir = PRIVATE_ROOT / "disco-e9-reader-r2"
    reader_dir.mkdir()
    extractor_path = reader_dir / "extract.py"
    extractor_path.write_bytes(extractor)
    report["stage"] = "restored extractor"
    result = subprocess.run(
        [sys.executable, str(extractor_path)], cwd=PRIVATE_ROOT,
        env={"PATH": os.environ.get("PATH", ""), "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"},
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600,
    )
    # Do not echo raw output: even an unexpected failure must not publish long source prose.
    report["extraction_process"] = {
        "returncode": result.returncode,
        "stdout_bytes": len(result.stdout), "stdout_sha256": hashlib.sha256(result.stdout).hexdigest(),
        "stderr_bytes": len(result.stderr), "stderr_sha256": hashlib.sha256(result.stderr).hexdigest(),
    }
    check("recovered extractor completed", result.returncode == 0)
    report["stage"] = "byte and structure verification"
    report["outputs"] = []
    for filename, (expected_bytes, expected_sha) in EXPECTED.items():
        raw = (reader_dir / filename).read_bytes()
        actual = hashlib.sha256(raw).hexdigest()
        report["outputs"].append({"file": filename, "bytes": len(raw), "sha256": actual, "expected_bytes": expected_bytes, "expected_sha256": expected_sha})
        check("original " + filename + " is byte-identical", len(raw) == expected_bytes and actual == expected_sha)
    manifest = json.loads((reader_dir / "manifest.json").read_text(encoding="utf-8"))
    check("all original manifest values retained", manifest == recovery["r2_manifest"]["content"])
    reader = json.loads((reader_dir / "reader.json").read_text(encoding="utf-8"))
    groups = reader["subjects"]
    units = [unit for group in groups for unit in group["units"]]
    nodes = [node for unit in units for node in unit["nodes"]]
    alternates = [alt for node in nodes for alt in node["alternates"]]
    counts = {"subjects": len(groups), "units": len(units), "nodes": len(nodes), "alternates": len(alternates)}
    report["structural_counts"] = counts
    check("fixed six subjects seven units 1337 nodes and 40 alternatives retained", counts == {"subjects": 6, "units": 7, "nodes": 1337, "alternates": 40})
    check("every internal link resolves inside its original unit", all(
        target == "outside selected unit" or target in {node["id"] for node in unit["nodes"]}
        for unit in units for node in unit["nodes"] for target in node["continuations"]
    ))
    report["status"] = "original raw reader and audit restored byte-for-byte"
    report["stage"] = "completed"
    report["next_action"] = "Recover or reconstruct the later readable formatter, verify every field/alternative/boundary, then prepare an adequate source-blind comparison. Do not call these hashes a quality judgment."
except Exception as error:
    report["status"] = "recovery failed; no comparison performed"
    # Exception class and check names are safe; network bodies / game prose are not logged.
    report["error_class"] = type(error).__name__
    report["failed_stage"] = report["stage"]
    if isinstance(error, urllib.error.HTTPError):
        report["http_status"] = error.code
    if isinstance(error, subprocess.TimeoutExpired):
        for name, raw in [("stdout", error.stdout), ("stderr", error.stderr)]:
            data = raw or b""
            report[name + "_at_timeout"] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    raise SystemExit(1)
finally:
    signal.setitimer(signal.ITIMER_REAL, 0)
    report["elapsed_seconds"] = time.monotonic() - started
    try:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("[e9-reader-recovery-report] " + json.dumps(report, ensure_ascii=False), flush=True)
    except Exception:
        # A report I/O error must not expose chained source or network exceptions.
        raise SystemExit(1) from None
