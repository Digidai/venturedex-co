#!/usr/bin/env python3
"""Atomic lease and checkpoint helper for scheduled VentureDex runs."""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time
import unicodedata
from typing import Any, Iterator


DEFAULT_AUTOMATION_ID = "venturedex-daily-curator"
DEFAULT_STALE_AFTER_SECONDS = 6 * 60 * 60
CONFLICT_EXIT = 73
DATA_EXIT = 65
CONFIG_EXIT = 78
AUTOMATION_ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$")
CHECKPOINT_RE = re.compile(r"```json\s*\n(?P<payload>\{.*?\})\s*\n```", re.DOTALL)
PHASES = (
    "preflight",
    "discovery",
    "content_prepared",
    "local_gates_passed",
    "pushed",
    "deployed",
    "gsc",
    "closeout",
)


class RunStateError(Exception):
    def __init__(self, message: str, exit_code: int = DATA_EXIT) -> None:
        super().__init__(message)
        self.exit_code = exit_code


def utc_iso(timestamp: float | None = None) -> str:
    instant = dt.datetime.fromtimestamp(
        time.time() if timestamp is None else timestamp,
        tz=dt.timezone.utc,
    )
    return instant.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def nonnegative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be a non-negative integer")
    return parsed


def validate_identifier(label: str, value: str, *, maximum: int = 200) -> str:
    if (
        not value
        or len(value) > maximum
        or any(
            unicodedata.category(char) in {"Cc", "Cf", "Cs", "Zl", "Zp"}
            for char in value
        )
        or "```" in value
    ):
        raise RunStateError(
            f"{label} must be non-empty, at most {maximum} characters, and contain no controls or Markdown fences."
        )
    return value


def validate_checkpoint_text(
    label: str,
    value: str,
    *,
    maximum: int,
    allow_empty: bool = True,
) -> str:
    if not value and allow_empty:
        return value
    return validate_identifier(label, value, maximum=maximum)


def owner_identity(explicit_owner: str | None) -> str:
    thread_id = os.environ.get("CODEX_THREAD_ID", "").strip()
    if thread_id:
        return validate_identifier("CODEX_THREAD_ID", thread_id)
    if explicit_owner:
        return validate_identifier("--owner", explicit_owner)
    raise RunStateError(
        "CODEX_THREAD_ID is unavailable; pass an explicit --owner identity instead.",
        CONFIG_EXIT,
    )


def owner_fingerprint(automation_id: str, owner: str) -> str:
    digest = hashlib.sha256()
    digest.update(b"venturedex-run-owner-v1\0")
    digest.update(automation_id.encode("utf-8"))
    digest.update(b"\0")
    digest.update(owner.encode("utf-8"))
    return digest.hexdigest()


def automation_dir(args: argparse.Namespace) -> Path:
    if args.automation_dir:
        target = Path(args.automation_dir).expanduser()
    else:
        codex_home = os.environ.get("CODEX_HOME", "").strip()
        if not codex_home:
            raise RunStateError(
                "CODEX_HOME is unavailable; pass --automation-dir explicitly.",
                CONFIG_EXIT,
            )
        target = Path(codex_home).expanduser() / "automations" / args.automation_id

    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    if target.is_symlink() or not target.is_dir():
        raise RunStateError(f"Automation directory must be a real directory: {target}")
    return target


def assert_regular_file(path: Path) -> None:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise RunStateError(f"Refusing non-regular or multiply linked authority file: {path}")


def fsync_directory(path: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    descriptor = os.open(path, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_write(path: Path, text: str) -> None:
    assert_regular_file(path)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        fsync_directory(path.parent)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            temporary_path.unlink()
        raise


@contextlib.contextmanager
def operation_lock(directory: Path) -> Iterator[None]:
    lock_path = directory / ".run-state.lock"
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(lock_path, flags, 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise RunStateError(f"Refusing unsafe operation lock: {lock_path}")
        os.fchmod(descriptor, 0o600)
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        with contextlib.suppress(OSError):
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def read_json(path: Path) -> dict[str, Any] | None:
    assert_regular_file(path)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise RunStateError(f"Malformed authority file {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise RunStateError(f"Authority file must contain a JSON object: {path}")
    return payload


def legacy_field(text: str, field: str) -> str | None:
    match = re.search(rf"^- {re.escape(field)}:\s*(.*?)\s*$", text, re.MULTILINE)
    return match.group(1) if match else None


def read_checkpoint(path: Path) -> dict[str, Any] | None:
    assert_regular_file(path)
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise RunStateError(f"Could not read checkpoint {path}: {exc}") from exc

    match = CHECKPOINT_RE.search(text)
    if match:
        try:
            payload = json.loads(match.group("payload"))
        except json.JSONDecodeError as exc:
            raise RunStateError(f"Malformed checkpoint JSON in {path}: {exc}") from exc
        if not isinstance(payload, dict):
            raise RunStateError(f"Checkpoint JSON must be an object: {path}")
        revision = payload.get("checkpoint_revision")
        if not isinstance(revision, int) or isinstance(revision, bool) or revision <= 0:
            raise RunStateError(f"Checkpoint has an invalid revision: {path}")
        return payload

    # Existing hand-written checkpoints are migration input only. Treat them as
    # revision zero, and never silently supersede an active or blocked legacy run.
    return {
        "schema_version": 0,
        "checkpoint_revision": 0,
        "automation_id": legacy_field(text, "automation_id"),
        "run_id": legacy_field(text, "run_id"),
        "status": legacy_field(text, "status"),
        "phase": legacy_field(text, "phase"),
    }


def checkpoint_revision(checkpoint: dict[str, Any] | None) -> int:
    if checkpoint is None:
        return 0
    revision = checkpoint.get("checkpoint_revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise RunStateError("Checkpoint revision is invalid.")
    return revision


def checkpoint_matches_lease(
    checkpoint: dict[str, Any] | None,
    lease: dict[str, Any],
) -> bool:
    if checkpoint is None:
        return False
    return (
        checkpoint.get("schema_version") == 1
        and checkpoint.get("automation_id") == lease.get("automation_id")
        and checkpoint.get("run_id") == lease.get("run_id")
        and checkpoint.get("lease_epoch") == lease.get("epoch")
    )


def render_checkpoint(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    return (
        "# VentureDex Daily Run State\n\n"
        "<!-- Managed atomically by scripts/automation-run-state.py. -->\n\n"
        "```json\n"
        f"{encoded}\n"
        "```\n\n"
        "This checkpoint is routing evidence only. Cross-check it against Git, CI, deploy, "
        "GSC, and worktree evidence before resuming.\n"
    )


def validate_lease(
    lease: dict[str, Any] | None,
    *,
    automation_id: str,
    run_id: str,
    fingerprint: str,
    epoch: int,
) -> dict[str, Any]:
    if lease is None:
        raise RunStateError("No run lease exists.", CONFLICT_EXIT)
    expected = {
        "schema_version": 1,
        "automation_id": automation_id,
        "run_id": run_id,
        "owner_fingerprint": fingerprint,
        "epoch": epoch,
        "status": "active",
    }
    for key, value in expected.items():
        if lease.get(key) != value:
            raise RunStateError(
                f"Lease CAS failed at {key}; the active run owner or epoch changed.",
                CONFLICT_EXIT,
            )
    return lease


def lease_is_stale(lease: dict[str, Any], now: float) -> bool:
    heartbeat = lease.get("heartbeat_unix")
    stale_after = lease.get("stale_after_seconds")
    if (
        not isinstance(heartbeat, (int, float))
        or isinstance(heartbeat, bool)
        or not isinstance(stale_after, int)
        or isinstance(stale_after, bool)
        or stale_after <= 0
    ):
        raise RunStateError("Active lease has invalid stale-timing metadata.")
    return now - float(heartbeat) > stale_after


def command_acquire(args: argparse.Namespace) -> dict[str, Any]:
    directory = automation_dir(args)
    lease_path = directory / "run-state.lease.json"
    state_path = directory / "run-state.md"
    owner = owner_identity(args.owner)
    fingerprint = owner_fingerprint(args.automation_id, owner)
    now = time.time()

    with operation_lock(directory):
        lease = read_json(lease_path)
        checkpoint = read_checkpoint(state_path)
        revision = checkpoint_revision(checkpoint)

        if lease is None:
            if (
                checkpoint
                and checkpoint.get("automation_id")
                and checkpoint.get("automation_id") != args.automation_id
            ):
                raise RunStateError("Existing checkpoint belongs to another automation.", CONFLICT_EXIT)
            if checkpoint and checkpoint.get("status") in {"active", "blocked"}:
                raise RunStateError(
                    "A legacy active/blocked checkpoint has no lease; reconcile it manually before acquisition.",
                    CONFLICT_EXIT,
                )
            previous_epoch = 0
            action = "acquired"
        else:
            if lease.get("schema_version") != 1 or lease.get("automation_id") != args.automation_id:
                raise RunStateError("Existing lease has incompatible identity or schema.")
            existing_epoch = lease.get("epoch")
            if not isinstance(existing_epoch, int) or isinstance(existing_epoch, bool) or existing_epoch <= 0:
                raise RunStateError("Existing lease epoch is invalid.")

            if lease.get("status") == "active":
                same_owner = lease.get("owner_fingerprint") == fingerprint
                same_run = lease.get("run_id") == args.run_id
                if same_owner and same_run:
                    lease["heartbeat_at"] = utc_iso(now)
                    lease["heartbeat_unix"] = now
                    atomic_write(lease_path, json.dumps(lease, indent=2, sort_keys=True) + "\n")
                    return {
                        "action": "renewed",
                        "automation_id": args.automation_id,
                        "run_id": args.run_id,
                        "epoch": existing_epoch,
                        "checkpoint_revision": revision,
                    }

                stale = lease_is_stale(lease, now)
                if not same_run:
                    if not stale:
                        raise RunStateError(
                            f"Active run lease conflict at epoch {existing_epoch}; it belongs to a different run.",
                            CONFLICT_EXIT,
                        )
                    raise RunStateError(
                        f"Run lease epoch {existing_epoch} belongs to {lease.get('run_id')}; stale takeover cannot start a different run.",
                        CONFLICT_EXIT,
                    )
                if not stale:
                    raise RunStateError(
                        f"Active run lease conflict at epoch {existing_epoch}; a different thread still owns it.",
                        CONFLICT_EXIT,
                    )
                if args.expected_epoch != existing_epoch:
                    raise RunStateError(
                        f"Stale lease takeover requires --expected-epoch {existing_epoch}.",
                        CONFLICT_EXIT,
                    )
                previous_epoch = existing_epoch
                action = "stale_takeover"
            elif lease.get("status") == "released":
                if (
                    not checkpoint_matches_lease(checkpoint, lease)
                    or checkpoint.get("status") not in {"blocked", "complete"}
                ):
                    found = None if checkpoint is None else checkpoint.get("status")
                    raise RunStateError(
                        f"Released lease is inconsistent with checkpoint identity/status {found}; reconcile manually.",
                        CONFLICT_EXIT,
                    )
                previous_epoch = existing_epoch
                action = "acquired"
            else:
                raise RunStateError("Existing lease status is invalid.")

        epoch = previous_epoch + 1
        acquired_at = utc_iso(now)
        new_lease = {
            "schema_version": 1,
            "automation_id": args.automation_id,
            "run_id": args.run_id,
            "owner_fingerprint": fingerprint,
            "epoch": epoch,
            "status": "active",
            "acquired_at": acquired_at,
            "heartbeat_at": acquired_at,
            "heartbeat_unix": now,
            "stale_after_seconds": args.stale_after_seconds,
        }
        atomic_write(lease_path, json.dumps(new_lease, indent=2, sort_keys=True) + "\n")
        return {
            "action": action,
            "automation_id": args.automation_id,
            "run_id": args.run_id,
            "epoch": epoch,
            "checkpoint_revision": revision,
        }


def command_checkpoint(args: argparse.Namespace) -> dict[str, Any]:
    directory = automation_dir(args)
    lease_path = directory / "run-state.lease.json"
    state_path = directory / "run-state.md"
    fingerprint = owner_fingerprint(args.automation_id, owner_identity(args.owner))
    now = time.time()
    run_worktree = validate_checkpoint_text("--run-worktree", args.run_worktree, maximum=4096)
    base_sha = validate_checkpoint_text("--base-sha", args.base_sha, maximum=128)
    current_sha = validate_checkpoint_text("--current-sha", args.current_sha, maximum=128)
    pushed_sha = validate_checkpoint_text("--pushed-sha", args.pushed_sha, maximum=128)
    blocker = validate_checkpoint_text("--blocker", args.blocker, maximum=4000)
    started_at = (
        validate_checkpoint_text("--started-at", args.started_at, maximum=64, allow_empty=False)
        if args.started_at is not None
        else None
    )
    accepted_slugs = [slug.strip() for slug in args.accepted_slugs.split(",") if slug.strip()]
    for slug in accepted_slugs:
        if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?", slug):
            raise RunStateError(f"Invalid accepted slug: {slug}")

    with operation_lock(directory):
        lease = validate_lease(
            read_json(lease_path),
            automation_id=args.automation_id,
            run_id=args.run_id,
            fingerprint=fingerprint,
            epoch=args.epoch,
        )
        existing = read_checkpoint(state_path)
        revision = checkpoint_revision(existing)
        if revision != args.expected_revision:
            raise RunStateError(
                f"Checkpoint CAS failed: expected revision {args.expected_revision}, found {revision}.",
                CONFLICT_EXIT,
            )

        next_revision = revision + 1
        existing_started_at = (
            existing.get("started_at")
            if existing is not None and existing.get("run_id") == args.run_id
            else None
        )
        payload = {
            "schema_version": 1,
            "automation_id": args.automation_id,
            "run_id": args.run_id,
            "status": args.status,
            "started_at": started_at
            or existing_started_at
            or lease.get("acquired_at"),
            "updated_at": utc_iso(now),
            "run_worktree": run_worktree,
            "base_sha": base_sha,
            "current_sha": current_sha,
            "pushed_sha": pushed_sha,
            "phase": args.phase,
            "accepted_slugs": accepted_slugs,
            "latest_blocker": blocker,
            "lease_epoch": args.epoch,
            "checkpoint_revision": next_revision,
        }
        atomic_write(state_path, render_checkpoint(payload))

        lease["heartbeat_at"] = utc_iso(now)
        lease["heartbeat_unix"] = now
        atomic_write(lease_path, json.dumps(lease, indent=2, sort_keys=True) + "\n")
        return {
            "action": "checkpointed",
            "automation_id": args.automation_id,
            "run_id": args.run_id,
            "epoch": args.epoch,
            "checkpoint_revision": next_revision,
            "status": args.status,
            "phase": args.phase,
        }


def command_release(args: argparse.Namespace) -> dict[str, Any]:
    directory = automation_dir(args)
    lease_path = directory / "run-state.lease.json"
    state_path = directory / "run-state.md"
    fingerprint = owner_fingerprint(args.automation_id, owner_identity(args.owner))
    now = time.time()

    with operation_lock(directory):
        lease = validate_lease(
            read_json(lease_path),
            automation_id=args.automation_id,
            run_id=args.run_id,
            fingerprint=fingerprint,
            epoch=args.epoch,
        )
        checkpoint = read_checkpoint(state_path)
        revision = checkpoint_revision(checkpoint)
        if revision != args.expected_revision:
            raise RunStateError(
                f"Release CAS failed: expected revision {args.expected_revision}, found {revision}.",
                CONFLICT_EXIT,
            )
        if not checkpoint_matches_lease(checkpoint, lease):
            raise RunStateError(
                "Release checkpoint identity does not match the active run lease.",
                CONFLICT_EXIT,
            )
        if checkpoint is None or checkpoint.get("status") != args.expected_status:
            found = None if checkpoint is None else checkpoint.get("status")
            raise RunStateError(
                f"Release state mismatch: expected {args.expected_status}, found {found}.",
                CONFLICT_EXIT,
            )

        lease["status"] = "released"
        lease["released_at"] = utc_iso(now)
        lease["heartbeat_at"] = utc_iso(now)
        lease["heartbeat_unix"] = now
        atomic_write(lease_path, json.dumps(lease, indent=2, sort_keys=True) + "\n")
        return {
            "action": "released",
            "automation_id": args.automation_id,
            "run_id": args.run_id,
            "epoch": args.epoch,
            "checkpoint_revision": revision,
            "status": args.expected_status,
        }


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--automation-id", default=DEFAULT_AUTOMATION_ID)
    parser.add_argument("--automation-dir")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--owner", help="Fallback identity only when CODEX_THREAD_ID is unavailable.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    acquire = commands.add_parser("acquire", help="Acquire or renew the run lease.")
    add_common_arguments(acquire)
    acquire.add_argument(
        "--stale-after-seconds",
        type=positive_int,
        default=DEFAULT_STALE_AFTER_SECONDS,
    )
    acquire.add_argument("--expected-epoch", type=positive_int)
    acquire.set_defaults(handler=command_acquire)

    checkpoint = commands.add_parser("checkpoint", help="Atomically replace the run checkpoint.")
    add_common_arguments(checkpoint)
    checkpoint.add_argument("--epoch", type=positive_int, required=True)
    checkpoint.add_argument("--expected-revision", type=nonnegative_int, required=True)
    checkpoint.add_argument("--status", choices=("active", "blocked", "complete"), required=True)
    checkpoint.add_argument("--phase", choices=PHASES, required=True)
    checkpoint.add_argument("--run-worktree", default="")
    checkpoint.add_argument("--base-sha", default="")
    checkpoint.add_argument("--current-sha", default="")
    checkpoint.add_argument("--pushed-sha", default="")
    checkpoint.add_argument("--accepted-slugs", default="")
    checkpoint.add_argument("--blocker", default="")
    checkpoint.add_argument("--started-at")
    checkpoint.set_defaults(handler=command_checkpoint)

    release = commands.add_parser("release", help="Release a terminal run lease.")
    add_common_arguments(release)
    release.add_argument("--epoch", type=positive_int, required=True)
    release.add_argument("--expected-revision", type=positive_int, required=True)
    release.add_argument("--expected-status", choices=("blocked", "complete"), required=True)
    release.set_defaults(handler=command_release)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if not AUTOMATION_ID_RE.fullmatch(args.automation_id):
        parser.error("--automation-id must contain only lowercase letters, digits, and internal hyphens")
    try:
        validate_identifier("--run-id", args.run_id)
        result = args.handler(args)
    except RunStateError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return exc.exit_code
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
