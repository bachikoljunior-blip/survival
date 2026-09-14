#!/usr/bin/env python3
"""CPU controls only. Synthetic PNG copies are never evaluation material."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import tempfile
import urllib.request
import zlib

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("packet_candidate", BASE / "prepare-ultra-packet.py")
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
code = (BASE / "prepare-ultra-packet.py").read_bytes()
compile(code, str(BASE / "prepare-ultra-packet.py"), "exec")
start = time.monotonic()
checks = []

def check(name, action):
    action()
    checks.append({"name": name, "passed": True})

def reject(action, fragment):
    try:
        action()
    except Exception as error:
        assert fragment in str(error), (fragment, str(error))
    else:
        raise AssertionError("Expected rejection: " + fragment)

def forbidden(*args, **kwargs):
    raise AssertionError("Network/process/model execution forbidden in CPU controls")

socket.socket = forbidden
socket.create_connection = forbidden
subprocess.Popen = forbidden
subprocess.run = forbidden
fixture = Path(tempfile.mkdtemp(prefix="cpu-controls-", dir=BASE / "evidence"))
original_root = p.ROOT
default_config = json.loads((BASE / "operator/source-selection.json").read_text())
check("pending real selection rejects before packet", lambda: reject(lambda: p.validate_selection(BASE / "operator/source-selection.json"), "pending"))
h = p.projection(default_config["projection_helper"])
frozen_helper_before = p.sha(Path(default_config["projection_helper"]["path"]).read_bytes())
history_before = {x["path"]: p.sha(Path(x["path"]).read_bytes()) for x in default_config["historical_records"]}
source = BASE.parent / "source-original"
authority = fixture / "authority"
for target, src in {
    "AI_DEVELOPMENT/BENCHMARKS/criteria.lock.json": "criteria.lock.json",
    "AI_DEVELOPMENT/BENCHMARKS/elements.json": "c28-elements.json",
    "docs/benchmarks.md": "benchmarks.md", "docs/bible.md": "bible.md", "docs/directive.md": "directive.md",
}.items():
    path = authority / target
    path.parent.mkdir(parents=True, exist_ok=True)
    path.symlink_to(source / src)

# Only the reference-image pins are replaced in memory for tiny CPU fixtures.
# Frozen goal projection, canonical documents, original eight view names,
# history pins, input CRC/hash checks and production code paths remain active.
raw = (p.WORKSPACE / "e16-q35-a840-r3-result/control.png").read_bytes()
info = p.png_info(raw)
input_dir = fixture / "synthetic-originals"
input_dir.mkdir()
candidate_specs, reference_specs = [], []
for filenames, destination in [([x["file"] for x in h.LEGACY_CANDIDATE], candidate_specs),
                               (["control-reference-%02d.png" % i for i in range(1, 9)], reference_specs)]:
    for name in filenames:
        path = input_dir / name
        path.write_bytes(raw)
        destination.append({"file": name, "bytes": len(raw), "sha256": p.sha(raw), "width": info["width"], "height": info["height"]})
h.REFERENCE = dict(h.REFERENCE, files=reference_specs)
p.projection = lambda unused: h
p.ROOT = fixture
(fixture / "operator").mkdir()
for name in ["question.txt", "spawn-message.template.txt", "operator/historical-records.lock.json"]:
    shutil.copyfile(BASE / name, fixture / name)
bundle = fixture / "synthetic-bundle.js"
bundle.write_bytes(b"CPU FIXTURE ONLY, never product capture\n")
capture = fixture / "synthetic-capture.json"
capture_value = {"commit": "c" * 40, "bundle": {"sha256": p.sha(bundle.read_bytes())},
                 "recovered_webkit_originals": [dict(x, original_commit="c" * 40, offsets_complete=True,
                                                    meta_end_size_hash_match=True) for x in candidate_specs]}
capture.write_bytes(p.encoded(capture_value))
def pinned(path):
    data = path.read_bytes()
    return {"path": str(path), "bytes": len(data), "sha256": p.sha(data)}

config = copy.deepcopy(default_config)
config.update(state="frozen", authority_root=str(authority), reference_directory=str(input_dir))
config["candidate"].update(commit="c" * 40, directory=str(input_dir), bundle=pinned(bundle),
                           capture_provenance=pinned(capture), files=candidate_specs)
config_path = fixture / "synthetic-selection.json"
config_path.write_bytes(p.encoded(config))
check("real 19/71 C28 conformance passes with synthetic image pins", lambda: p.validate_selection(config_path))

def changed_authority(relative, change, fragment):
    target = authority / relative
    linked = target.readlink()
    original = target.read_bytes()
    target.unlink()
    try:
        target.write_bytes(change(original))
        reject(lambda: p.validate_selection(config_path), fragment)
    finally:
        target.unlink()
        target.symlink_to(linked)
check("canonical criteria byte change rejects", lambda: changed_authority("docs/benchmarks.md", lambda raw: raw + b"\n", "criterion/concept authority"))
def changed_reference(raw):
    value = json.loads(raw)
    value["elements"][0]["reference_work"] += " CHANGED CPU FIXTURE"
    return p.encoded(value)
check("element reference change rejects", lambda: changed_authority("AI_DEVELOPMENT/BENCHMARKS/elements.json", changed_reference, "Frozen element goals"))

def mutated(mutator, fragment):
    value = copy.deepcopy(config)
    mutator(value)
    path = fixture / ("negative-selection-%02d.json" % len(checks))
    path.write_bytes(p.encoded(value))
    reject(lambda: p.validate_selection(path), fragment)

check("missing view rejects", lambda: mutated(lambda x: x["candidate"]["files"].pop(), "eight predeclared"))
check("view order change rejects", lambda: mutated(lambda x: x["candidate"]["files"].reverse(), "eight predeclared"))
check("original byte hash mismatch rejects", lambda: mutated(lambda x: x["candidate"]["files"][0].update(sha256="0" * 64), "size/hash"))
check("old original candidate list rejects", lambda: mutated(lambda x: x["candidate"].update(files=h.LEGACY_CANDIDATE), "Historical candidate"))
check("history omission rejects", lambda: mutated(lambda x: x.update(historical_records=[]), "historical failure/raw"))
check("capture commit mismatch rejects", lambda: mutated(lambda x: x["candidate"].update(commit="d" * 40), "Capture/build binding"))
check("outside workspace source rejects", lambda: reject(lambda: p.read_path("/etc/passwd"), "is not in the subpath"))

# Nonpixel metadata insertion only into an in-memory CPU test fixture.
def chunk(tag, data):
    body = tag + data
    return len(data).to_bytes(4, "big") + body + zlib.crc32(body).to_bytes(4, "big")
for tag in (b"tEXt", b"iTXt", b"eXIf"):
    check("%s source metadata rejects unchanged" % tag.decode(),
          lambda tag=tag: reject(lambda: p.png_info(raw[:33] + chunk(tag, b"fixture-source-hint") + raw[33:]), "unapproved metadata"))

packet = p.prepare_packet(config_path)
token = packet["packet_id"]
manifest = p.verify_packet(token)
review = Path(packet["review_directory"])
private = Path(packet["operator_record"])
def source_separation():
    assert sorted(x.name for x in review.iterdir()) == sorted(p.PUBLIC_NAMES)
    public_text = b"\n".join((review / name).read_bytes() for name in p.PUBLIC_NAMES if not name.endswith(".png"))
    for secret in [b"survival", b"candidate_side", b"reference_work", b"visual-south-frame", b"charcoal", str(input_dir).encode()]:
        assert secret not in public_text
    assert "model" not in json.loads((private / "spawn-arguments.json").read_bytes())
check("public allowlist and source text separated", source_separation)
check("16 raw PNG bytes and CSV order exact", lambda: (
    [(_ for _ in ()).throw(AssertionError("byte change")) for x in p.LABELS if (review / (x + ".png")).read_bytes() != raw],
    (_ for _ in ()).throw(AssertionError("CSV change")) if (review / "images.csv").read_text() != ",".join(x + ".png" for x in p.LABELS) + "\n" else None))
check("same build refuses second reservation", lambda: reject(lambda: p.prepare_packet(config_path), "File exists"))

bundle2 = fixture / "synthetic-different-bundle.js"
bundle2.write_bytes(b"Another CPU fixture bundle with the identical original PNGs\n")
capture2 = fixture / "synthetic-different-capture.json"
capture_value["bundle"]["sha256"] = p.sha(bundle2.read_bytes())
capture2.write_bytes(p.encoded(capture_value))
config2 = copy.deepcopy(config)
config2["candidate"].update(bundle=pinned(bundle2), capture_provenance=pinned(capture2))
config2_path = fixture / "synthetic-second-selection.json"
config2_path.write_bytes(p.encoded(config2))
check("same images under different build refuse reservation", lambda: reject(lambda: p.prepare_packet(config2_path), "File exists"))

answer = {"packet_id": token, "manifest_sha256": p.sha((review / "manifest.json").read_bytes()),
          "recognition": "no", "recognition_basis": "CPU STRUCTURE FIXTURE, not an observation",
          "viewed_images": p.LABELS, "observations": [{k: label if k == "image" else "CPU fixture" for k in p.OBS_KEYS} for label in p.LABELS],
          "axes": [dict(axis=axis, choice="insufficient", evidence=["A01", "B01"], reason="CPU fixture", limitations="No image evaluation") for axis in p.AXES],
          "final": dict(choice="insufficient", evidence=["A01", "B01"], reason="CPU fixture", limitations="No image evaluation"),
          "limitations": "CPU fixture only", "complete": True, "end_marker": "COMPARISON_END"}
def result_status(value):
    return p.assess_structure(p.encoded(value), token, answer["manifest_sha256"])
def expect_status(value, status):
    assert result_status(value)["status"] == status
check("complete JSON remains awaiting independent audit", lambda: expect_status(answer, "awaiting_independent_audit"))
for recognized in ("yes", "uncertain"):
    check("recognition %s invalidates" % recognized, lambda recognized=recognized: expect_status(dict(answer, recognition=recognized), "invalid_recognition"))
check("missing image observation incomplete", lambda: expect_status(dict(answer, observations=answer["observations"][:-1]), "incomplete"))
check("missing axis incomplete", lambda: expect_status(dict(answer, axes=answer["axes"][:-1]), "incomplete"))
check("duplicate JSON key incomplete", lambda: (_ for _ in ()).throw(AssertionError()) if p.assess_structure(b'{"recognition":"yes","recognition":"no"}', token, answer["manifest_sha256"])["status"] != "incomplete" else None)
raw_path = fixture / "synthetic-response.raw.txt"
raw_path.write_bytes(p.encoded(answer))
receipt_path = fixture / "synthetic-receipt.raw.json"
receipt_path.write_bytes(p.encoded({"spawn_arguments": json.loads((private / "spawn-arguments.json").read_bytes()),
                                  "accepted_agent_id": "CPU FIXTURE, not an actual agent", "spawn_result": {"fixture": True}}))
# A corrupt packet must not cause the raw response or receipt to disappear.
(review / "question.txt").write_bytes(b"CPU tamper fixture\n")
result = p.record_result(token, raw_path, receipt_path)
def preserved_invalid():
    assert result["status"] == "invalid_packet" and not result["eligible_for_independent_audit"]
    assert result["trace_status"] == "missing"
    assert (private / "result/response.raw.txt").read_bytes() == raw_path.read_bytes()
    assert (private / "result/spawn-receipt.raw.json").read_bytes() == receipt_path.read_bytes()
    assert result["blind_validity"] == result["quality_verdict"] == "not measured"
check("tampered packet and absent trace preserve raw and invalidate", preserved_invalid)
check("existing result cannot be overwritten", lambda: reject(lambda: p.record_result(token, raw_path, receipt_path), "File exists"))
def unchanged():
    assert p.sha(Path(default_config["projection_helper"]["path"]).read_bytes()) == frozen_helper_before
    assert all(p.sha(Path(path).read_bytes()) == digest for path, digest in history_before.items())
    assert json.loads((BASE / "operator/source-selection.json").read_text())["state"] == "pending_parent_post_grain_build_selection"
    assert not (BASE / "packets").exists()
check("frozen helper historical raw and real pending selection unchanged", unchanged)
report = {"schema_version": 1, "purpose": "CPU controls only, no evaluation or actual post-grain selection",
          "generator_sha256": p.sha(code), "test_script_sha256": p.sha(Path(__file__).read_bytes()),
          "checks": checks, "passed": len(checks), "elapsed_seconds": time.monotonic() - start,
          "network_process_execution_denied_in_test": True, "synthetic_packet_count": 1,
          "real_packet_count": 0, "evaluation_count": 0, "fixture_reference_pins_replaced_in_memory": True,
          "real_conformance": "All 19 goal identities/references and 71 criteria checked against frozen helper, actual C28 elements and exact canonical docs",
          "helper_sha256_before_after": frozen_helper_before, "historical_raw_file_count_unchanged": len(history_before)}
(BASE / "evidence/offline-controls.json").write_bytes(p.encoded(report))
print(json.dumps({k: v for k, v in report.items() if k != "checks"}, indent=2))
