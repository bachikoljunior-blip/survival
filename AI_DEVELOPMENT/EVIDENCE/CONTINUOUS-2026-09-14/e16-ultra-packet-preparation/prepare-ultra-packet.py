#!/usr/bin/env python3
"""Offline packet and raw-result preservation. Never starts an evaluator/model.
All writes remain below this script directory; original inputs are read-only.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import secrets
import struct
import sys
import time
import zlib

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[1]
PROJECTION_SHA256 = "8becdc0644fc43339a0a6a23b4f82e80d2dab3800f32916b61ee7ec2cdce1d72"
HISTORY_LOCK_SHA256 = "0e00b46d8badb902ba78bc56236e3cd26c2a116618b78f04a066b3983c27a93e"
PRE_GRAIN_BUNDLE = "6b887bc1cf6ebc0b7fae6c146e46c05d067ad5ba51544fd218d17e8483ea338b"
OLD_BUNDLE = "14ea69b0d7bf581c25deeca6bdcf8f3c9ecd4bc895384c216902efe01c1eab28"
LABELS = [side + str(i).zfill(2) for side in "AB" for i in range(1, 9)]
AXES = ["lighting", "palette", "grounding", "material_scale"]
CHOICES = ["A", "B", "equal", "insufficient"]
OBS_KEYS = ["image", "lighting", "palette", "contact_depth", "material_scale"]
AXIS_KEYS = ["axis", "choice", "evidence", "reason", "limitations"]
FINAL_KEYS = ["choice", "evidence", "reason", "limitations"]
ANSWER_KEYS = ["packet_id", "manifest_sha256", "recognition", "recognition_basis",
               "viewed_images", "observations", "axes", "final", "limitations", "complete", "end_marker"]
PUBLIC_NAMES = [x + ".png" for x in LABELS] + ["manifest.json", "images.csv", "question.txt", "answer-format.json"]
PNG_CHUNKS = {"IHDR", "IDAT", "IEND", "PLTE", "tRNS", "sBIT", "sRGB", "gAMA", "cHRM", "pHYs"}

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()

def write_new(path, raw):
    path = Path(path)
    path.resolve().relative_to(ROOT.resolve())
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(raw)

def write_json(path, value):
    write_new(path, encoded(value))

def read_path(value):
    path = Path(value).resolve()
    path.relative_to(WORKSPACE.resolve())
    if not path.is_file():
        raise ValueError("A pinned workspace file is missing")
    return path

def directory(value):
    path = Path(value).resolve()
    path.relative_to(WORKSPACE.resolve())
    if not path.is_dir():
        raise ValueError("A workspace directory is missing")
    return path

def verified(spec):
    path = read_path(spec["path"])
    raw = path.read_bytes()
    if len(raw) != spec["bytes"] or sha(raw) != spec["sha256"]:
        raise ValueError("Pinned input size/hash mismatch")
    return path, raw

def png_info(raw):
    # Inspect without decoding, rewriting, cropping, resizing or metadata removal.
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Expected original PNG")
    pos, tags, size = 8, [], None
    while pos < len(raw):
        if pos + 12 > len(raw):
            raise ValueError("Truncated PNG chunk")
        length = int.from_bytes(raw[pos:pos + 4], "big")
        tag = raw[pos + 4:pos + 8]
        end = pos + 12 + length
        if end > len(raw) or zlib.crc32(raw[pos + 4:end - 4]) != int.from_bytes(raw[end - 4:end], "big"):
            raise ValueError("PNG chunk bounds/CRC mismatch")
        if not tags:
            if tag != b"IHDR" or length != 13:
                raise ValueError("PNG must begin with IHDR")
            size = struct.unpack(">II", raw[pos + 8:pos + 16])
            if not all(size):
                raise ValueError("Invalid PNG dimensions")
        name = tag.decode("ascii")
        if name not in PNG_CHUNKS:
            raise ValueError("PNG has unapproved metadata/chunk; preserve original and stop")
        tags.append(name)
        pos = end
        if tag == b"IEND":
            if length != 0 or pos != len(raw) or "IDAT" not in tags:
                raise ValueError("PNG terminal structure mismatch")
            return {"width": size[0], "height": size[1], "chunks": tags}
    raise ValueError("PNG has no IEND")

def projection(spec):
    path, raw = verified(spec)
    if sha(raw) != PROJECTION_SHA256:
        raise ValueError("Frozen projection helper differs")
    mod_spec = importlib.util.spec_from_file_location("frozen_conformance_projection", path)
    module = importlib.util.module_from_spec(mod_spec)
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        mod_spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module

def validate_selection(config_path):
    config = json.loads(read_path(config_path).read_bytes())
    if config.get("state") != "frozen":
        raise ValueError("Post-grain build selection is pending; packet/evaluation count remains zero")
    h = projection(config["projection_helper"])
    authority = directory(config["authority_root"])
    h.ROOT = authority
    authority_specs = []
    for name, expected in h.CONFORMANCE_SPECS.items():
        path = read_path(authority / name)
        raw = path.read_bytes()
        if sha(raw) != expected:
            raise ValueError("Frozen criterion/concept authority changed")
        authority_specs.append({"path": str(path), "sha256": expected, "bytes": len(raw)})
    elements = h.elements_conformance()
    lock = json.loads((authority / "AI_DEVELOPMENT/BENCHMARKS/criteria.lock.json").read_bytes())
    rows = [x for x in (authority / "docs/benchmarks.md").read_text().splitlines()
            if re.match(r"\| BM-VIS-0[1-4] \|", x)]
    if len(lock["digests"]) != 71 or len(rows) != 4:
        raise ValueError("All original criteria and four visual-art rows are required")
    candidate = config["candidate"]
    _, bundle = verified(candidate["bundle"])
    build = sha(bundle)
    if build in (PRE_GRAIN_BUNDLE, OLD_BUNDLE) or candidate["supersedes_bundle_sha256"] != PRE_GRAIN_BUNDLE:
        raise ValueError("A changed post-grain product build is required")
    if not re.fullmatch(r"[0-9a-f]{40}", candidate["commit"]):
        raise ValueError("Capture commit must be frozen")
    _, capture_raw = verified(candidate["capture_provenance"])
    capture = json.loads(capture_raw)
    if capture["commit"] != candidate["commit"] or capture["bundle"]["sha256"] != build:
        raise ValueError("Capture/build binding mismatch")
    if [x["file"] for x in candidate["files"]] != [x["file"] for x in h.LEGACY_CANDIDATE]:
        raise ValueError("Exactly the same eight predeclared views, in order, are required")
    if sorted(x["sha256"] for x in candidate["files"]) == sorted(x["sha256"] for x in h.LEGACY_CANDIDATE):
        raise ValueError("Historical candidate PNGs cannot be compared again")
    source_sets = {"candidate": [], "reference": []}
    for role, folder, specs in [
        ("candidate", directory(candidate["directory"]), candidate["files"]),
        ("reference", directory(config["reference_directory"]), h.REFERENCE["files"]),
    ]:
        for item in specs:
            path, raw = verified(dict(item, path=str(folder / item["file"])))
            info = png_info(raw)
            if any(info[k] != item[k] for k in ("width", "height")):
                raise ValueError("Original PNG dimensions changed")
            if role == "candidate":
                matches = [x for x in capture["recovered_webkit_originals"] if x["file"] == item["file"]]
                if (len(matches) != 1 or any(matches[0][k] != item[k] for k in ("bytes", "sha256"))
                        or matches[0]["original_commit"] != candidate["commit"]
                        or matches[0]["offsets_complete"] is not True
                        or matches[0]["meta_end_size_hash_match"] is not True):
                    raise ValueError("Capture does not attest every original PNG byte")
            source_sets[role].append({"path": str(path), "file": item["file"], "bytes": len(raw),
                                      "sha256": sha(raw), **info})
    if len(source_sets["reference"]) != 8:
        raise ValueError("All eight frozen reference frames are required")
    # Existing failed attempts are preserved by reference, never copied over.
    history_raw = (ROOT / "operator/historical-records.lock.json").read_bytes()
    if sha(history_raw) != HISTORY_LOCK_SHA256 or config["historical_records"] != json.loads(history_raw):
        raise ValueError("Frozen historical failure/raw inventory changed")
    for item in config["historical_records"]:
        verified(item)
        if Path(item["path"]).name == "inputs.json":
            old_inputs = json.loads(read_path(item["path"]).read_bytes())
            current_hashes = sorted(x["sha256"] for items in source_sets.values() for x in items)
            if current_hashes == sorted(x["sha256"] for x in old_inputs):
                raise ValueError("Historical complete image set cannot be compared again")
    return config, source_sets, {"authorities": authority_specs, "elements": elements,
                                "criteria_count": 71, "original_e16_rows_verbatim": rows,
                                "conformance_limit": "Neutral comparison does not certify the source-specific palette, numeric requirements, or BM-VIS-04 measurement command. Keep their separate conformance evidence and all goals unchanged; no E16 pass follows automatically.",
                                "axis_mapping": dict(zip(AXES, ["BM-VIS-01", "BM-VIS-02", "BM-VIS-03", "BM-VIS-04"]))}

def answer_format():
    return {"required_root_keys": ANSWER_KEYS, "recognition": ["yes", "no", "uncertain"],
            "viewed_images": "Neutral labels in viewing order; stop early if recognition occurs.",
            "observation_keys": OBS_KEYS, "observations": "One object per image; all four observations must be nonempty.",
            "axis_order": AXES, "axis_keys": AXIS_KEYS, "final_keys": FINAL_KEYS,
            "choice_values": CHOICES, "evidence": "Array of actually viewed image labels.",
            "invalid_recognition": "Keep observations/axes empty and final null if stopping for recognition.",
            "complete": "Boolean true only when the answer is complete under these rules.",
            "end_marker": "COMPARISON_END", "format": "One JSON object, no code fences, no prefilling a winner."}

def spawn_arguments(token, review, manifest_hash):
    template = (ROOT / "spawn-message.template.txt").read_text()
    message = template.replace("__PACKET_ROOT__", str(review)).replace("__PACKET_ID__", token).replace("__MANIFEST_SHA256__", manifest_hash)
    return {"task_name": "visual_review_" + token, "fork_turns": "none",
            "reasoning_effort": "ultra", "message": message}

def prepare_packet(config_path):
    config, sets, conformance = validate_selection(config_path)
    token = secrets.token_hex(12)
    candidate_side = secrets.choice(["A", "B"])
    build = config["candidate"]["bundle"]["sha256"]
    private = ROOT / "operator/records" / token
    review = ROOT / "packets" / token
    material = sha(encoded(sorted(x["sha256"] for items in sets.values() for x in items)))
    reservations = [ROOT / "operator/used-builds" / (build + ".json"),
                    ROOT / "operator/used-materials" / (material + ".json")]
    # Atomic, append-only reservation. Failure is preserved, never auto-retried.
    try:
        for reservation in reservations:
            write_json(reservation, {"packet_id": token, "bundle_sha256": build, "material_sha256": material,
                                     "candidate_side": candidate_side, "evaluation_count": 0,
                                     "reserved_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        mapping, public_images = [], []
        for label in LABELS:
            role = "candidate" if label[0] == candidate_side else "reference"
            item = sets[role][int(label[1:]) - 1]
            _, raw = verified(item)
            write_new(review / (label + ".png"), raw)
            public_images.append({"label": label, "file": label + ".png", **{k: item[k] for k in ("bytes", "sha256", "width", "height")}})
            mapping.append({"label": label, "role": role, "source": item})
        question = (ROOT / "question.txt").read_bytes()
        write_new(review / "question.txt", question)
        write_new(review / "images.csv", (",".join(x + ".png" for x in LABELS) + "\n").encode())
        write_json(review / "answer-format.json", answer_format())
        manifest = {"schema_version": 1, "packet_id": token, "images": public_images,
                    "question_sha256": sha(question), "images_csv_sha256": sha((review / "images.csv").read_bytes()),
                    "answer_format_sha256": sha((review / "answer-format.json").read_bytes()),
                    "pixel_processing": "none; each PNG is copied byte for byte"}
        write_json(review / "manifest.json", manifest)
        args = spawn_arguments(token, review, sha((review / "manifest.json").read_bytes()))
        # Source-specific text exists only in the operator record, never review files.
        write_json(private / "source-manifest.json", {"packet_id": token, "config": config, "mapping": mapping,
                   "conformance": conformance, "source_commit_for_preparation": "a6d420f40995d33fb12c54b2338aee8f6211768a",
                   "material_sha256": material,
                   "generator_sha256": sha(Path(__file__).read_bytes()),
                   "spawn_template_sha256": sha((ROOT / "spawn-message.template.txt").read_bytes()),
                   "started_at": "2026-09-13T20:56:49+09:00", "deadline_at": "2026-09-20T20:56:49+09:00",
                   "candidate_side": candidate_side, "evaluation_count": 0,
                   "blind_validity": "not measured", "quality_verdict": "not measured",
                   "privacy_limit": "Logical task/input separation in a shared workspace; not an OS isolation boundary."})
        write_json(private / "spawn-arguments.json", args)
        specs = [{"file": name, "bytes": (review / name).stat().st_size, "sha256": sha((review / name).read_bytes())} for name in PUBLIC_NAMES]
        write_json(private / "seal.json", {"packet_id": token, "files": specs,
                   "source_manifest_sha256": sha((private / "source-manifest.json").read_bytes()),
                   "spawn_arguments_sha256": sha((private / "spawn-arguments.json").read_bytes())})
        verify_packet(token)
    except Exception as error:
        write_json(private / "preparation-failure.json", {"type": type(error).__name__, "error": str(error), "evaluation_count": 0})
        raise
    return {"packet_id": token, "review_directory": str(review), "operator_record": str(private), "evaluation_count": 0}

def packet_paths(token):
    if not re.fullmatch(r"[0-9a-f]{24}", token):
        raise ValueError("Invalid opaque packet ID")
    return ROOT / "operator/records" / token, ROOT / "packets" / token

def verify_packet(token):
    private, review = packet_paths(token)
    seal = json.loads((private / "seal.json").read_bytes())
    if sorted(x.name for x in review.iterdir()) != sorted(PUBLIC_NAMES):
        raise ValueError("Unexpected/missing reviewer files")
    for item in seal["files"]:
        verified(dict(item, path=str(review / item["file"])))
    for name, key in [("source-manifest.json", "source_manifest_sha256"), ("spawn-arguments.json", "spawn_arguments_sha256")]:
        if sha((private / name).read_bytes()) != seal[key]:
            raise ValueError("Operator seal mismatch")
    manifest = json.loads((review / "manifest.json").read_bytes())
    if [x["label"] for x in manifest["images"]] != LABELS:
        raise ValueError("Neutral image order mismatch")
    if (review / "images.csv").read_text() != ",".join(x + ".png" for x in LABELS) + "\n":
        raise ValueError("CSV order mismatch")
    source = json.loads((private / "source-manifest.json").read_bytes())
    for neutral, original in zip(manifest["images"], source["mapping"]):
        if neutral["sha256"] != original["source"]["sha256"]:
            raise ValueError("Original/output PNG mismatch")
    return manifest

def assess_structure(raw, token, manifest_hash):
    def unique_object(pairs):
        obj = {}
        for key, value in pairs:
            if key in obj:
                raise ValueError("Duplicate JSON key")
            obj[key] = value
        return obj
    try:
        value = json.loads(raw, object_pairs_hook=unique_object)
    except (UnicodeDecodeError, ValueError):
        return {"status": "incomplete", "reason": "Raw answer is not one complete JSON object", "eligible_for_independent_audit": False}
    if not isinstance(value, dict):
        return {"status": "incomplete", "reason": "Answer must be an object", "eligible_for_independent_audit": False}
    if value.get("recognition") in ("yes", "uncertain"):
        return {"status": "invalid_recognition", "eligible_for_independent_audit": False}
    def nonempty(x): return isinstance(x, str) and bool(x.strip())
    def choice(x, keys):
        return (isinstance(x, dict) and set(x) == set(keys) and x["choice"] in CHOICES
                and isinstance(x["evidence"], list) and bool(x["evidence"])
                and all(y in LABELS for y in x["evidence"])
                and nonempty(x["reason"]) and nonempty(x["limitations"]))
    try:
        complete = (set(value) == set(ANSWER_KEYS) and value["packet_id"] == token
                    and value["manifest_sha256"] == manifest_hash and value["recognition"] == "no"
                    and nonempty(value["recognition_basis"]) and value["viewed_images"] == LABELS
                    and len(value["observations"]) == 16
                    and [x["image"] for x in value["observations"]] == LABELS
                    and all(set(x) == set(OBS_KEYS) and all(nonempty(x[k]) for k in OBS_KEYS) for x in value["observations"])
                    and len(value["axes"]) == 4 and [x["axis"] for x in value["axes"]] == AXES
                    and all(choice(x, AXIS_KEYS) for x in value["axes"])
                    and choice(value["final"], FINAL_KEYS) and nonempty(value["limitations"])
                    and value["complete"] is True and value["end_marker"] == "COMPARISON_END")
    except (TypeError, KeyError):
        complete = False
    return {"status": "awaiting_independent_audit" if complete else "incomplete",
            "eligible_for_independent_audit": bool(complete),
            "neutral_final_choice": value["final"]["choice"] if complete else None}

def record_result(token, raw_file, receipt_file, trace_file=None):
    private, review = packet_paths(token)
    raw = read_path(raw_file).read_bytes()
    receipt_raw = read_path(receipt_file).read_bytes()
    trace_raw = read_path(trace_file).read_bytes() if trace_file else b""
    result_dir = private / "result"
    result_dir.mkdir()  # No replacement or selection among repeated results.
    write_new(result_dir / "response.raw.txt", raw)
    write_new(result_dir / "spawn-receipt.raw.json", receipt_raw)
    write_new(result_dir / "evaluator-trace.raw.txt", trace_raw)
    manifest_hash, packet_error = None, None
    try:
        verify_packet(token)
        manifest_hash = sha((review / "manifest.json").read_bytes())
    except Exception as error:
        packet_error = {"type": type(error).__name__, "error": str(error)}
    assessment = assess_structure(raw, token, manifest_hash)
    try:
        receipt = json.loads(receipt_raw)
        expected = json.loads((private / "spawn-arguments.json").read_bytes())
        valid_receipt = (receipt["spawn_arguments"] == expected and bool(receipt["accepted_agent_id"])
                         and bool(receipt["spawn_result"]) and "model" not in expected
                         and expected["fork_turns"] == "none" and expected["reasoning_effort"] == "ultra")
    except (OSError, ValueError, TypeError, KeyError):
        valid_receipt = False
    assessment.update({"packet_id": token, "manifest_sha256": manifest_hash,
                       "raw_answer_bytes": len(raw), "raw_answer_sha256": sha(raw),
                       "receipt_sha256": sha(receipt_raw), "receipt_matches_exact_arguments": valid_receipt,
                       "trace_bytes": len(trace_raw), "trace_sha256": sha(trace_raw),
                       "receipt_and_full_raw_audit_required": True, "raw_response_records": 1,
                       "actual_spawn_acceptance_and_image_views_verified": False,
                       "trace_policy": "Independent audit must match accepted spawn and every original image view/forwarding, all intermediate messages and final answer; self-reports do not prove viewing or blindness.",
                       "backend_effective_reasoning_independently_verified": False,
                       "blind_validity": "not measured", "quality_verdict": "not measured"})
    if packet_error:
        assessment.update(status="invalid_packet", eligible_for_independent_audit=False, packet_error=packet_error)
    if not trace_raw.strip():
        assessment.update(eligible_for_independent_audit=False, trace_status="missing")
    if not valid_receipt:
        assessment["eligible_for_independent_audit"] = False
        assessment["receipt_status"] = "unverified_or_mismatched"
    write_json(result_dir / "assessment.json", assessment)
    return assessment

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    for name in ("validate", "prepare"):
        action = sub.add_parser(name)
        action.add_argument("--config", default=str(ROOT / "operator/source-selection.json"))
    action = sub.add_parser("verify"); action.add_argument("packet_id")
    action = sub.add_parser("record"); action.add_argument("packet_id"); action.add_argument("--raw", required=True); action.add_argument("--receipt", required=True); action.add_argument("--trace")
    args = parser.parse_args()
    if args.action == "validate":
        validate_selection(args.config)
        result = {"inputs_and_authorities_verified": True, "evaluation_count": 0}
    elif args.action == "prepare":
        result = prepare_packet(args.config)
    elif args.action == "verify":
        result = {"packet_id": verify_packet(args.packet_id)["packet_id"], "evaluation_started_by_this_tool": False}
    else:
        result = record_result(args.packet_id, args.raw, args.receipt, args.trace)
    print(json.dumps(result, ensure_ascii=False, indent=2))
