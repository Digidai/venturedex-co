#!/usr/bin/env python3
"""GSC ledger bridge for the Codex in-app browser (never controls a browser).

The agent observes CUA, persists a minimal evidence excerpt, calls begin BEFORE
one request click, then finish after a fresh observation. Evidence is an operator
receipt, not a claim of cryptographic browser attestation. See the runbook.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
AUTHORITY = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))) / "automations/venturedex-daily-curator"
HEADER = "timestamp\tstatus\turl\tmessage\n"
URL = re.compile(r"https://venturedex\.co/(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)")
STATUSES = {"requested", "dry_run", "retry_pending", "stopped_mismatch", "live_check_failed", "quota_exceeded", "request_click_pending", "pre_request_success_unverified", "reconciliation_archive_pending", "post_request_target_unverified", "post_request_confirmation_unknown"}
RETRYABLE = {"", "retry_pending", "live_check_failed", "quota_exceeded"}
UTC = dt.timezone.utc


def fail(message):
    raise ValueError(message)


def now():
    return dt.datetime.now(UTC)


def instant(value):
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        fail("Timestamp requires a timezone")
    return parsed


def stamp():
    # Preserve the existing ledger's local-time convention; receipts use UTC.
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def canonical(value):
    if not isinstance(value, str) or not URL.fullmatch(value):
        fail("Only exact canonical VentureDex startup/weekly URLs are allowed")
    return value


def exact_parent(path, create=False):
    if not path.is_absolute():
        fail("Authority paths must be absolute")
    if create:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.parent.resolve(strict=True) != path.parent:
        fail("Symlink or non-canonical authority directory")


def read_regular(path):
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            fail("Authority/evidence must be a singly-linked regular file")
        data = b""
        while chunk := os.read(fd, 65536):
            data += chunk
            if len(data) > 32 * 1024 * 1024:
                fail("Authority/evidence exceeds size limit")
        after = os.fstat(fd)
        current = os.stat(path, follow_symlinks=False)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) or (current.st_dev, current.st_ino) != (before.st_dev, before.st_ino):
            fail("Authority/evidence changed while reading")
        return data
    finally:
        os.close(fd)


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def exclusive_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        sync_dir(path.parent)


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode()


def rows_from(data):
    text = data.decode("utf-8")
    if not text.startswith(HEADER) or not text.endswith("\n"):
        fail("Malformed or incomplete authoritative ledger")
    rows = []
    for line in text.splitlines()[1:]:
        fields = line.split("\t")
        if len(fields) != 4 or fields[1] not in STATUSES:
            fail("Malformed authoritative ledger row")
        dt.datetime.strptime(fields[0], "%Y-%m-%d %H:%M:%S")
        canonical(fields[2])
        rows.append(dict(zip(("timestamp", "status", "url", "message"), fields)))
    return rows


def latest(rows, url):
    return next((row for row in reversed(rows) if row["url"] == url and row["status"] != "dry_run"), {"status": "", "message": ""})


@contextlib.contextmanager
def authority(args):
    history, artifacts = args.history, args.artifact_dir
    exact_parent(history, True)
    exact_parent(artifacts / "placeholder", True)
    parent_identity = (history.parent.stat().st_dev, history.parent.stat().st_ino)
    lock = Path(str(history) + ".lock")
    # Same lock pathname as the retired submitter. Never steal a stale lock.
    token = uuid.uuid4().hex
    exclusive_write(lock, json_bytes({"backend": "codex-iab", "token": token, "pid": os.getpid()}))
    fd = None
    try:
        if not history.exists():
            exclusive_write(history, HEADER.encode())
        fd = os.open(history, os.O_RDWR | os.O_APPEND | os.O_NONBLOCK | os.O_NOFOLLOW)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1:
            fail("Ledger must be a singly-linked regular file")
        data = read_regular(history)
        current = os.stat(history, follow_symlinks=False)
        if (opened.st_dev, opened.st_ino) != (current.st_dev, current.st_ino):
            fail("Ledger identity changed")
        rows = rows_from(data)

        def verify_identity():
            exact_parent(history)
            parent = history.parent.stat()
            current = os.stat(history, follow_symlinks=False)
            held = os.fstat(fd)
            if (parent.st_dev, parent.st_ino) != parent_identity or (current.st_dev, current.st_ino) != (opened.st_dev, opened.st_ino) or current.st_nlink != 1 or held.st_nlink != 1:
                fail("Ledger path or directory identity changed")

        def append(status, url, message):
            verify_identity()
            if read_regular(history) != data:
                fail("Ledger changed; no transition committed")
            line = f"{stamp()}\t{status}\t{url}\t{message}\n".encode()
            offset = 0
            while offset < len(line):
                written = os.write(fd, line[offset:])
                if written <= 0:
                    fail("Ledger append made no progress")
                offset += written
            os.fsync(fd)
            sync_dir(history.parent)
            verify_identity()
            if read_regular(history) != data + line:
                fail("Authoritative ledger readback failed")

        yield rows, append
    finally:
        if fd is not None:
            os.close(fd)
        if json.loads(read_regular(lock)).get("token") == token:
            lock.unlink()
            sync_dir(lock.parent)


def legacy_blocker(artifacts, url):
    if not artifacts.exists():
        return ""
    spec = importlib.util.spec_from_file_location("gsc_reconciliation", ROOT / "scripts/gsc-reconciliation.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        try:
            module.scan_unresolved(str(artifacts), module.identity(os.stat(artifacts)), url)
        except SystemExit as result:
            if result.code != 3:  # scanner's documented no-unresolved exit
                fail(str(result))
    return output.getvalue().strip()


def eligibility(rows, artifacts, url):
    current = latest(rows, url)
    if current["status"] == "requested":
        return "already_requested"
    if current["status"] not in RETRYABLE:
        return "unresolved_ledger:" + current["status"]
    if current["status"] == "retry_pending" and re.search(r"manual pre-click reconciliation|(?:artifact|sha256|file_identity|artifact_dir_identity|resolved_dir_identity)=", current["message"]):
        return "legacy_reconciliation_requires_review"
    blocker = legacy_blocker(artifacts, url)
    if blocker:
        return "unresolved_legacy_artifact:" + Path(blocker).name
    if artifacts.exists():
        for path in sorted(artifacts.glob("codex-*-intent.json")):
            intent = json.loads(read_regular(path))
            if intent.get("url") == url:
                receipt_path = artifacts / f"codex-{intent['attempt']}-receipt.json"
                if receipt_path.exists():
                    receipt = json.loads(read_regular(receipt_path))
                    if receipt.get("status") == "quota_exceeded" and receipt.get("url") == url and receipt.get("attempt") == intent["attempt"] and any(row["url"] == url and row["status"] == "quota_exceeded" and f"attempt={intent['attempt']};" in row["message"] for row in rows):
                        # Explicit quota denial is a known terminal result.
                        # The property-wide cooldown below still applies.
                        continue
                # Even an orphan intent blocks: a crash may have happened at
                # any point between durable intent and result observation.
                return "unresolved_codex_intent:" + intent["attempt"]
    for row in reversed(rows):
        if row["status"] == "quota_exceeded":
            elapsed = dt.datetime.now() - dt.datetime.strptime(row["timestamp"], "%Y-%m-%d %H:%M:%S")
            if elapsed.total_seconds() < 24 * 3600:
                return "quota_cooldown_24h"
            break
    return "ready"


def targets(args, rows):
    values = list(args.url or [])
    if args.latest_daily or args.daily_date:
        times = json.loads((ROOT / "content/timestamps.json").read_text())
        entries = {slug: value["published_at"][:10] for slug, value in times.items() if isinstance(value, dict) and "published_at" in value and (ROOT / "content/startups" / f"{slug}.json").is_file()}
        date = args.daily_date or max(entries.values())
        values += [f"https://venturedex.co/startups/{slug}" for slug, published in entries.items() if published == date]
    if args.latest_weekly or args.weekly_issue:
        issues = [json.loads(path.read_text()) for path in (ROOT / "content/weekly").glob("[0-9]*.json")]
        issues = [issue for issue in issues if issue.get("status") == "published" and issue.get("published_at", "9999")[:10] <= now().date().isoformat()]
        number = args.weekly_issue or max((issue["issue_number"] for issue in issues), default=0)
        if not any(issue["issue_number"] == number for issue in issues):
            fail("No matching published weekly issue")
        values.append(f"https://venturedex.co/weekly/{number}")
    if args.retry_pending:
        values += [row["url"] for row in rows if latest(rows, row["url"])["status"] == "retry_pending"]
    values = sorted(set(canonical(value) for value in values))
    if not values or not 1 <= args.max_urls <= 10 or len(values) > args.max_urls:
        fail("Select 1–10 exact targets; the cap never silently truncates")
    if args.expect_url and values != [canonical(args.expect_url)]:
        fail("Expected URL does not match the sole target")
    return values


def validate_evidence(proof, expected_url, states, allow_stale=False):
    if not isinstance(proof, dict):
        fail("Evidence must be an object")
    if proof.get("browser") != "iab" or proof.get("inspected_url") != expected_url or proof.get("state") not in states:
        fail("Evidence browser/target/state mismatch")
    if not str(proof.get("tab_id", "")) or not isinstance(proof.get("excerpt"), str) or len(proof["excerpt"]) > 8000:
        fail("Evidence requires tab_id and a minimal observed excerpt")
    parsed = urllib.parse.urlparse(proof.get("page_url", ""))
    query = urllib.parse.parse_qs(parsed.query)
    if parsed.scheme != "https" or parsed.netloc != "search.google.com" or parsed.path != "/search-console/inspect" or query.get("resource_id") != ["sc-domain:venturedex.co"] or len(query.get("id", [])) != 1 or not re.fullmatch(r"[A-Za-z0-9_-]{1,255}", query["id"][0]):
        fail("Evidence is not bound to the exact GSC property/inspection route")
    observed = instant(proof.get("observed_at", ""))
    elapsed = (now() - observed).total_seconds()
    if elapsed < -5 or (not allow_stale and elapsed > 300):
        fail("Evidence must be a fresh timestamped observation (within 5 minutes)")
    excerpt = proof["excerpt"]
    visible_urls = re.findall(r"https?://[^\s<>\"']+", excerpt)
    for value in visible_urls:
        parsed_visible = urllib.parse.urlparse(value)
        if parsed_visible.hostname == "venturedex.co" and re.match(r"/(?:startups|weekly)(?:/|$)", parsed_visible.path) and value != expected_url:
            fail("Excerpt contains a conflicting VentureDex detail URL")
    # GSC modal AX trees may expose only the result dialog. Never synthesize a
    # URL into that observation: validate_result binds it to the prior exact
    # URL using the same tab and inspection route instead.
    if proof["state"] == "request_ready" and expected_url not in visible_urls:
        fail("Excerpt must include the visibly inspected exact URL")
    if proof["state"] == "request_ready" and not re.search(r"(?:button[^\n]*(?:request indexing|请求编入索引))", excerpt, re.IGNORECASE):
        fail("Ready evidence must show the visible request action")
    if proof["state"] == "request_ready" and re.search(r"Indexing requested|已请求编入索引|REQUEST AGAIN", excerpt):
        fail("Existing success state is not a new-click authorization")
    if proof["state"] == "requested" and not re.search(r"(?:text|heading|dialog)[^\n]*(?:Indexing requested|已请求编入索引)", excerpt):
        fail("Requested needs an explicit observed success confirmation")
    if proof["state"] == "quota_exceeded" and not re.search(r"(?i)quota exceeded|daily limit|配额|超出.*限额", excerpt):
        fail("Quota evidence lacks an explicit quota result")
    return proof


def evidence(path, expected_url, states):
    return validate_evidence(json.loads(read_regular(path)), expected_url, states)


def validate_result(proof, intent, attempt, allow_stale=False):
    if not isinstance(intent, dict) or intent.get("version") != 1 or intent.get("attempt") != attempt:
        fail("Intent version or attempt mismatch")
    url = canonical(intent["url"])
    before = validate_evidence(intent["evidence"], url, {"request_ready"}, allow_stale=True)
    proof = validate_evidence(proof, url, {"requested", "quota_exceeded", "unknown"}, allow_stale=allow_stale)
    if proof["page_url"] != before["page_url"] or str(proof["tab_id"]) != str(before["tab_id"]) or instant(proof["observed_at"]) <= instant(intent["created_at"]):
        fail("Post-click evidence must match the same tab/route and follow intent")
    status = "post_request_confirmation_unknown" if proof["state"] == "unknown" else proof["state"]
    return url, proof, status


def live_check(url):
    request = urllib.request.Request(url, headers={"User-Agent": "VentureDex-GSC-Codex/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200 or response.url != url:
            fail("Live check must return HTTP 200 at the exact target without redirect")


def defer_reason(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 500 or re.search(r"[\x00-\x1f\x7f]", value) or len(value.splitlines()) != 1:
        fail("Defer reason must be one nonempty line, at most 500 characters, without control characters")
    if re.search(r"(?i)https?://|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:password|token|api[_-]?key|cookie|authorization|secret)\s*[:=]|\bbearer\s+\S+", value):
        fail("Defer reason must be redacted: omit URLs, account addresses, and credentials")
    return value.strip()


def run(args):
    if args.command == "plan":
        exact_parent(args.history)
        if args.artifact_dir.exists():
            exact_parent(args.artifact_dir / "placeholder")
        rows = rows_from(read_regular(args.history)) if args.history.exists() else []
        selected = targets(args, rows)
        return {"backend": "codex-iab", "read_only": True, "targets": [{"url": url, "status": eligibility(rows, args.artifact_dir, url)} for url in selected], "next": "Use CUA native iab; observe exact inspection; begin before ONE click; finish from fresh confirmation. See docs/automation/gsc-codex-browser.md"}
    if args.command == "defer":
        url = canonical(args.url)
        reason = defer_reason(args.reason)
        with authority(args) as (rows, append):
            state = eligibility(rows, args.artifact_dir, url)
            if state not in {"ready", "quota_cooldown_24h"}:
                fail("Cannot defer a blocked or already-requested target: " + state)
            # Even a completed quota-denied attempt must keep its existing
            # history. This command queues only URLs never clicked or begun.
            if any(row["url"] == url and row["status"] not in {"dry_run", "retry_pending", "live_check_failed"} for row in rows):
                fail("Cannot defer a target with prior click or reconciliation history")
            append("retry_pending", url, f"codex-iab deferred before any click; {reason}")
            return {"url": url, "status": "retry_pending", "click_authorized_once": False, "actual_indexing_verified": False}
    if args.command == "begin":
        url = canonical(args.url)
        proof = evidence(args.evidence, url, {"request_ready"})
        live_check(url)
        with authority(args) as (rows, append):
            state = eligibility(rows, args.artifact_dir, url)
            if state != "ready":
                fail("No click allowed: " + state)
            attempt = uuid.uuid4().hex
            intent = {"version": 1, "attempt": attempt, "url": url, "created_at": now().isoformat(), "evidence": proof, "ledger_sha256": hashlib.sha256(read_regular(args.history)).hexdigest()}
            exclusive_write(args.artifact_dir / f"codex-{attempt}-intent.json", json_bytes(intent))
            append("request_click_pending", url, f"codex-iab attempt={attempt}; durable intent before one native browser click")
            return {"attempt": attempt, "url": url, "click_authorized_once": True, "expires_in_seconds": 60, "instruction": "Click only in this observed tab/route now. Never replay this authorization, including after interruption."}
    if not re.fullmatch(r"[0-9a-f]{32}", args.attempt):
        fail("Invalid attempt identifier")
    with authority(args) as (rows, append):
        intent = json.loads(read_regular(args.artifact_dir / f"codex-{args.attempt}-intent.json"))
        receipt_path = args.artifact_dir / f"codex-{args.attempt}-receipt.json"
        if args.command == "recover":
            # Recovery consumes only the exact durable terminal receipt from
            # this authority. It never observes a browser or accepts new proof.
            payload = read_regular(receipt_path)
            receipt_identity = receipt_path.stat(follow_symlinks=False)
            receipt = json.loads(payload)
            if not isinstance(receipt, dict) or receipt.get("version") != 1 or receipt.get("attempt") != args.attempt or receipt.get("url") != intent["url"]:
                fail("Immutable receipt version, attempt, or URL mismatch")
            url, proof, status = validate_result(receipt["evidence"], intent, args.attempt, allow_stale=True)
            if receipt.get("status") != status:
                fail("Immutable receipt status does not match its terminal evidence")
        else:
            url, proof, status = validate_result(json.loads(read_regular(args.evidence)), intent, args.attempt)
            receipt = {"version": 1, "attempt": args.attempt, "url": url, "status": status, "evidence": proof}
            payload = json_bytes(receipt)
        current = latest(rows, url)
        message = f"codex-iab attempt={args.attempt}; receipt={receipt_path.name}; requested is not indexed"
        if args.command == "recover" and current["status"] == status and current["message"] == message:
            return {"attempt": args.attempt, "url": url, "status": status, "already_recorded": True, "click_authorized_once": False, "actual_indexing_verified": False}
        if current["status"] != "request_click_pending" or f"attempt={args.attempt};" not in current["message"]:
            fail("Attempt is no longer the authoritative pending transition")
        if receipt_path.exists():
            if read_regular(receipt_path) != payload:
                fail("Immutable receipt already exists; use the original evidence to recover")
            if args.command == "recover":
                current_receipt = receipt_path.stat(follow_symlinks=False)
                if (current_receipt.st_dev, current_receipt.st_ino) != (receipt_identity.st_dev, receipt_identity.st_ino):
                    fail("Immutable receipt identity changed before recovery")
        else:
            if args.command == "recover":
                fail("Immutable receipt disappeared before recovery")
            exclusive_write(receipt_path, payload)
        append(status, url, message)
        return {"attempt": args.attempt, "url": url, "status": status, "click_authorized_once": False, "actual_indexing_verified": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("plan", "begin", "finish", "recover", "defer"):
        sub = commands.add_parser(command)
        sub.add_argument("--history", type=Path, default=Path(os.environ.get("GSC_HISTORY_FILE", AUTHORITY / "gsc_submission_history.tsv")))
        sub.add_argument("--artifact-dir", type=Path, default=Path(os.environ.get("GSC_ARTIFACT_DIR", AUTHORITY / "gsc-artifacts")))
        if command == "plan":
            sub.add_argument("--url", action="append")
            for flag in ("latest-daily", "latest-weekly", "retry-pending"):
                sub.add_argument("--" + flag, action="store_true")
            sub.add_argument("--daily-date")
            sub.add_argument("--weekly-issue", type=int)
            sub.add_argument("--expect-url")
            sub.add_argument("--max-urls", type=int, default=10)
        elif command == "defer":
            sub.add_argument("--url", required=True)
            sub.add_argument("--reason", required=True)
        else:
            sub.add_argument("--url" if command == "begin" else "--attempt", required=True)
            if command != "recover":
                sub.add_argument("--evidence", type=Path, required=True)
    try:
        print(json.dumps(run(parser.parse_args()), ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"BLOCKED: {error}", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
