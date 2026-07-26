#!/usr/bin/env python3
"""Fail-closed filesystem operations for GSC zero-click reconciliation."""

from __future__ import annotations

import ctypes
import errno
import hashlib
import os
import platform
import re
import stat
import sys
from pathlib import Path


CANONICAL_URL = re.compile(
    r"^https://venturedex\.co/"
    r"(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)$"
)
TIMESTAMP = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$"
)
FILENAME = re.compile(
    r"^[0-9]{8}-[0-9]{6}-pre_request_success_unverified-"
    r"(.+--sha256-[0-9a-f]{12})\.txt$"
)
RECONCILIATION_STATUSES = (
    "ledger_write_failed_after_request",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
    "pre_request_success_unverified",
)
REQUEST_ACTIONS = {
    "REQUEST INDEXING",
    "REQUEST AGAIN",
    "请求编入索引",
    "请求再次编入索引",
}
DIRECTORY_FLAGS = (
    os.O_RDONLY
    | getattr(os, "O_DIRECTORY", 0)
    | getattr(os, "O_NOFOLLOW", 0)
)
FILE_FLAGS = (
    os.O_RDONLY
    | getattr(os, "O_NONBLOCK", 0)
    | getattr(os, "O_NOFOLLOW", 0)
)
IDENTITY = re.compile(r"^[0-9]+:[0-9]+$")
DIGEST = re.compile(r"^[0-9a-f]{64}$")


def fail(message: str) -> "NoReturn":
    raise SystemExit(message)


def identity(value: os.stat_result) -> str:
    return f"{value.st_dev}:{value.st_ino}"


def target_key(url: str) -> str:
    readable = re.sub(r"^https?://", "", url.lower())
    readable = re.sub(r"[^a-z0-9]+", "-", readable).strip("-")
    readable = readable[:90] or "unknown"
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
    return f"{readable}--sha256-{digest}"


def exact_directory(raw: str) -> tuple[Path, int, os.stat_result]:
    directory = Path(os.path.abspath(os.path.expanduser(raw)))
    try:
        path_stat = os.lstat(directory)
    except OSError as error:
        fail(f"Could not inspect GSC artifact directory {directory}: {error}")
    if not stat.S_ISDIR(path_stat.st_mode) or directory.is_symlink():
        fail(
            "GSC artifact authority must be a real, non-symlink directory: "
            f"{directory}"
        )
    if directory.resolve(strict=True) != directory:
        fail(
            "GSC artifact authority must resolve to its exact canonical path: "
            f"{directory}"
        )
    directory_fd = os.open(directory, DIRECTORY_FLAGS)
    opened_stat = os.fstat(directory_fd)
    if (
        not stat.S_ISDIR(opened_stat.st_mode)
        or opened_stat.st_dev != path_stat.st_dev
        or opened_stat.st_ino != path_stat.st_ino
    ):
        os.close(directory_fd)
        fail(f"GSC artifact authority changed while being opened: {directory}")
    return directory, directory_fd, opened_stat


def normalize_directory(raw: str) -> None:
    if not raw or any(character in raw for character in ("\t", "\r", "\n", "\0")):
        fail("GSC artifact directory contains an invalid control character.")
    directory = Path(os.path.abspath(os.path.expanduser(raw)))
    try:
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    except OSError as error:
        fail(f"Could not establish GSC artifact directory {directory}: {error}")
    directory, directory_fd, directory_stat = exact_directory(str(directory))
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    print(f"{directory}\t{identity(directory_stat)}")


def scan_unresolved(
    directory_raw: str,
    expected_directory_identity: str,
    target: str,
) -> None:
    target = target.strip().rstrip("/")
    if (
        not IDENTITY.fullmatch(expected_directory_identity)
        or not CANONICAL_URL.fullmatch(target)
    ):
        fail("Invalid frozen GSC artifact scan arguments.")
    directory, directory_fd, directory_stat = exact_directory(directory_raw)
    try:
        if identity(directory_stat) != expected_directory_identity:
            fail("GSC artifact authority changed before unresolved scan.")
        initial_directory_stat = os.fstat(directory_fd)
        try:
            names = sorted(os.listdir(directory_fd))
        except OSError as error:
            fail(f"Could not scan GSC artifact authority: {error}")
        expected_key = target_key(target)
        hashed_key = re.compile(r"^.+--sha256-[0-9a-f]{12}$")
        for name in names:
            if not name.endswith(".txt"):
                continue
            status_value = next(
                (
                    candidate
                    for candidate in RECONCILIATION_STATUSES
                    if f"-{candidate}-" in name
                ),
                None,
            )
            if status_value is None:
                continue
            marker = f"-{status_value}-"
            artifact_key = name.split(marker, 1)[1][:-len(".txt")]
            file_stat = optional_stat(directory_fd, name)
            if (
                file_stat is None
                or not stat.S_ISREG(file_stat.st_mode)
                or file_stat.st_nlink != 1
            ):
                print(directory / name)
                return
            is_hashed = bool(hashed_key.fullmatch(artifact_key))
            if is_hashed and artifact_key == expected_key:
                print(directory / name)
                return

            file_fd = os.open(name, FILE_FLAGS, dir_fd=directory_fd)
            try:
                opened_stat = os.fstat(file_fd)
                if (
                    not stat.S_ISREG(opened_stat.st_mode)
                    or opened_stat.st_nlink != 1
                    or identity(opened_stat) != identity(file_stat)
                ):
                    print(directory / name)
                    return
                chunks: list[bytes] = []
                while True:
                    chunk = os.read(file_fd, 65536)
                    if not chunk:
                        break
                    chunks.append(chunk)
                payload = b"".join(chunks)
                os.lseek(file_fd, 0, os.SEEK_SET)
                stable_chunks: list[bytes] = []
                while True:
                    chunk = os.read(file_fd, 65536)
                    if not chunk:
                        break
                    stable_chunks.append(chunk)
                final_opened_stat = os.fstat(file_fd)
                final_stat = os.stat(
                    name,
                    dir_fd=directory_fd,
                    follow_symlinks=False,
                )
                if (
                    not stat.S_ISREG(final_stat.st_mode)
                    or final_stat.st_nlink != 1
                    or identity(final_stat) != identity(opened_stat)
                    or final_stat.st_size != opened_stat.st_size
                    or final_stat.st_mtime_ns != opened_stat.st_mtime_ns
                    or final_stat.st_ctime_ns != opened_stat.st_ctime_ns
                    or final_opened_stat.st_size != opened_stat.st_size
                    or final_opened_stat.st_mtime_ns != opened_stat.st_mtime_ns
                    or final_opened_stat.st_ctime_ns != opened_stat.st_ctime_ns
                    or b"".join(stable_chunks) != payload
                ):
                    print(directory / name)
                    return
            finally:
                os.close(file_fd)
            try:
                text = payload.decode("utf-8")
            except UnicodeDecodeError:
                print(directory / name)
                return
            fields: dict[str, str] = {}
            for line in text.splitlines():
                if not line.strip():
                    break
                field, separator, value = line.partition(":")
                if separator and field.strip():
                    fields[field.strip()] = value.strip()
            artifact_url = fields.get("url", "").rstrip("/")
            header_status = fields.get("status", "")

            if is_hashed:
                if header_status and header_status != status_value:
                    print(directory / name)
                    return
                if artifact_url and (
                    not CANONICAL_URL.fullmatch(artifact_url)
                    or target_key(artifact_url) != artifact_key
                ):
                    print(directory / name)
                    return
                continue

            # Legacy names are accepted only when readable metadata binds the
            # exact canonical target. Ambiguous evidence blocks globally.
            legacy_readable = re.sub(r"^https?://", "", artifact_url.lower())
            legacy_readable = re.sub(
                r"[^a-z0-9]+",
                "-",
                legacy_readable,
            ).strip("-")
            legacy_readable = legacy_readable[:90] or "unknown"
            if (
                not CANONICAL_URL.fullmatch(artifact_url)
                or legacy_readable != artifact_key
                or (header_status and header_status != status_value)
            ):
                print(directory / name)
                return
            if artifact_url == target:
                print(directory / name)
                return
        final_names = sorted(os.listdir(directory_fd))
        final_directory_stat = os.fstat(directory_fd)
        if (
            final_names != names
            or identity(final_directory_stat) != identity(initial_directory_stat)
            or final_directory_stat.st_mtime_ns
            != initial_directory_stat.st_mtime_ns
            or final_directory_stat.st_ctime_ns
            != initial_directory_stat.st_ctime_ns
        ):
            fail("GSC artifact authority changed during unresolved scan.")
        verify_directory_path(
            directory,
            directory_stat,
            "GSC artifact authority changed during unresolved scan.",
        )
        post_verify_names = sorted(os.listdir(directory_fd))
        post_verify_stat = os.fstat(directory_fd)
        if (
            post_verify_names != names
            or post_verify_stat.st_mtime_ns
            != initial_directory_stat.st_mtime_ns
            or post_verify_stat.st_ctime_ns
            != initial_directory_stat.st_ctime_ns
        ):
            fail("GSC artifact authority changed during unresolved scan.")
    finally:
        os.close(directory_fd)
    raise SystemExit(3)


def verify_directory_path(
    directory: Path,
    expected_stat: os.stat_result,
    failure_message: str,
) -> None:
    try:
        path_stat = os.lstat(directory)
    except OSError as error:
        fail(f"{failure_message}: {error}")
    if (
        not stat.S_ISDIR(path_stat.st_mode)
        or stat.S_ISLNK(path_stat.st_mode)
        or path_stat.st_dev != expected_stat.st_dev
        or path_stat.st_ino != expected_stat.st_ino
    ):
        fail(failure_message)
    verification_fd = os.open(directory, DIRECTORY_FLAGS)
    try:
        opened_stat = os.fstat(verification_fd)
        if (
            not stat.S_ISDIR(opened_stat.st_mode)
            or opened_stat.st_dev != expected_stat.st_dev
            or opened_stat.st_ino != expected_stat.st_ino
        ):
            fail(failure_message)
    finally:
        os.close(verification_fd)
    if directory.resolve(strict=True) != directory:
        fail(failure_message)


def open_resolved(
    directory_fd: int,
    *,
    create: bool,
) -> tuple[int | None, os.stat_result | None]:
    if create:
        try:
            os.mkdir("resolved", mode=0o700, dir_fd=directory_fd)
        except FileExistsError:
            pass
    try:
        path_stat = os.stat(
            "resolved",
            dir_fd=directory_fd,
            follow_symlinks=False,
        )
    except FileNotFoundError:
        return None, None
    if not stat.S_ISDIR(path_stat.st_mode):
        fail("GSC reconciliation archive must be a real, non-symlink directory.")
    resolved_fd = os.open("resolved", DIRECTORY_FLAGS, dir_fd=directory_fd)
    opened_stat = os.fstat(resolved_fd)
    if (
        not stat.S_ISDIR(opened_stat.st_mode)
        or opened_stat.st_dev != path_stat.st_dev
        or opened_stat.st_ino != path_stat.st_ino
    ):
        os.close(resolved_fd)
        fail("GSC reconciliation archive authority changed while being opened.")
    return resolved_fd, opened_stat


def optional_stat(directory_fd: int, name: str) -> os.stat_result | None:
    try:
        return os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        return None


def read_exact_evidence(
    directory_fd: int,
    name: str,
    expected_stat: os.stat_result,
) -> tuple[bytes, os.stat_result]:
    if (
        not stat.S_ISREG(expected_stat.st_mode)
        or expected_stat.st_nlink != 1
    ):
        fail(
            "Reconciliation artifact must be a single-link regular file: "
            f"{name}"
        )
    file_fd = os.open(name, FILE_FLAGS, dir_fd=directory_fd)
    try:
        opened_stat = os.fstat(file_fd)
        if (
            not stat.S_ISREG(opened_stat.st_mode)
            or opened_stat.st_nlink != 1
            or opened_stat.st_dev != expected_stat.st_dev
            or opened_stat.st_ino != expected_stat.st_ino
        ):
            fail(f"Reconciliation artifact changed while being opened: {name}")
        chunks: list[bytes] = []
        while True:
            chunk = os.read(file_fd, 65536)
            if not chunk:
                break
            chunks.append(chunk)
        current_stat = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(current_stat.st_mode)
            or current_stat.st_nlink != 1
            or current_stat.st_dev != opened_stat.st_dev
            or current_stat.st_ino != opened_stat.st_ino
        ):
            fail(f"Reconciliation artifact changed while being read: {name}")
        return b"".join(chunks), opened_stat
    finally:
        os.close(file_fd)


def read_open_file(file_fd: int) -> bytes:
    os.lseek(file_fd, 0, os.SEEK_SET)
    chunks: list[bytes] = []
    while True:
        chunk = os.read(file_fd, 65536)
        if not chunk:
            return b"".join(chunks)
        chunks.append(chunk)


def validate_payload(payload: bytes, name: str) -> tuple[str, str]:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as error:
        fail(f"Reconciliation artifact is not valid UTF-8: {name}: {error}")
    if "\r" in text or "\0" in text:
        fail(f"Reconciliation artifact contains an invalid separator: {name}")
    lines = text.split("\n")
    if len(lines) < 8 or lines[5] != "" or lines[6] != "--- page text ---":
        fail(f"Reconciliation artifact has an invalid structure: {name}")
    expected_fields = ("timestamp", "status", "url", "message", "page_state")
    values: dict[str, str] = {}
    for index, field in enumerate(expected_fields):
        prefix = f"{field}: "
        if not lines[index].startswith(prefix):
            fail(
                f"Reconciliation artifact is missing exact {field} metadata: {name}"
            )
        values[field] = lines[index][len(prefix) :]
    if not TIMESTAMP.fullmatch(values["timestamp"]):
        fail(f"Reconciliation artifact timestamp is invalid: {name}")
    if values["status"] != "pre_request_success_unverified":
        fail(
            "Only pre_request_success_unverified evidence can be reconciled "
            f"for retry: {name}"
        )
    target = values["url"].rstrip("/")
    if not CANONICAL_URL.fullmatch(target):
        fail(f"Reconciliation artifact URL is not canonical: {name}")
    if not values["message"].strip():
        fail(f"Reconciliation artifact message is empty: {name}")
    if values["page_state"] not in {"success", "conflict"}:
        fail(f"Reconciliation artifact page_state is not pre-click terminal: {name}")
    match = FILENAME.fullmatch(name)
    if not match or match.group(1) != target_key(target):
        fail(f"Reconciliation artifact filename does not bind the exact URL: {name}")

    page_lines = [line.strip() for line in lines[7:] if line.strip()]
    visible_urls = {
        line.rstrip("/")
        for line in page_lines
        if CANONICAL_URL.fullmatch(line.rstrip("/"))
    }
    if target not in visible_urls:
        fail(
            "Reconciliation artifact does not contain the exact route-bound "
            f"target as a visible URL line: {name}"
        )
    if not any(line.upper() in REQUEST_ACTIONS for line in page_lines):
        fail(
            "Reconciliation artifact does not preserve an exact visible "
            f"request action: {name}"
        )
    return target, hashlib.sha256(payload).hexdigest()


def prepare(
    directory_raw: str,
    expected_directory_identity: str,
    artifact_raw: str,
) -> None:
    artifact = Path(os.path.abspath(os.path.expanduser(artifact_raw)))
    if any(character in str(artifact) for character in ("\t", "\r", "\n", "\0")):
        fail("Reconciliation artifact path contains a control character.")
    directory, directory_fd, directory_stat = exact_directory(directory_raw)
    try:
        if (
            not IDENTITY.fullmatch(expected_directory_identity)
            or identity(directory_stat) != expected_directory_identity
        ):
            fail(
                "GSC artifact authority changed before reconciliation "
                "preparation."
            )
        if artifact.parent != directory:
            fail(
                "The reconciliation artifact must be an exact direct child of "
                f"{directory}: {artifact}"
            )
        resolved_fd, resolved_stat = open_resolved(directory_fd, create=True)
        if resolved_fd is None or resolved_stat is None:
            fail("Could not establish the GSC reconciliation archive authority.")
        try:
            os.fsync(resolved_fd)
            os.fsync(directory_fd)
            resolved_path_stat = os.stat(
                "resolved",
                dir_fd=directory_fd,
                follow_symlinks=False,
            )
            if (
                identity(resolved_path_stat) != identity(resolved_stat)
                or identity(os.fstat(directory_fd)) != identity(directory_stat)
            ):
                fail(
                    "GSC reconciliation archive authority changed during "
                    "preparation."
                )
            verify_directory_path(
                directory,
                directory_stat,
                "GSC artifact authority path changed during reconciliation "
                "preparation.",
            )
            source_stat = optional_stat(directory_fd, artifact.name)
            archive_stat = (
                optional_stat(resolved_fd, artifact.name)
                if resolved_fd is not None
                else None
            )
            if (source_stat is None) == (archive_stat is None):
                fail(
                    "Expected the exact reconciliation artifact in either the "
                    f"active or resolved authority, but not both: {artifact}"
                )
            state = "active" if source_stat is not None else "archived"
            evidence_fd = directory_fd if source_stat is not None else resolved_fd
            evidence_stat = source_stat if source_stat is not None else archive_stat
            if evidence_fd is None or evidence_stat is None:
                fail(f"Reconciliation artifact evidence is unavailable: {artifact}")
            payload, opened_stat = read_exact_evidence(
                evidence_fd,
                artifact.name,
                evidence_stat,
            )
            target, digest = validate_payload(payload, artifact.name)

            expected_key = target_key(target)
            active_matches = sorted(
                name
                for name in os.listdir(directory_fd)
                if name.endswith(f"-{expected_key}.txt")
                and any(
                    f"-{status}-" in name
                    for status in RECONCILIATION_STATUSES
                )
            )
            expected_matches = [artifact.name] if state == "active" else []
            if active_matches != expected_matches:
                fail(
                    "Expected one exact active reconciliation artifact or one "
                    f"exact resolved recovery artifact for {target}; found "
                    f"{active_matches!r}"
                )
        finally:
            if resolved_fd is not None:
                os.close(resolved_fd)
    finally:
        os.close(directory_fd)

    print(
        "\t".join(
            (
                target,
                artifact.name,
                identity(opened_stat),
                str(artifact),
                digest,
                identity(directory_stat),
                state,
                identity(resolved_stat),
            )
        )
    )


def rename_no_replace(
    source_fd: int,
    source_name: str,
    destination_fd: int,
    destination_name: str,
) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    source = os.fsencode(source_name)
    destination = os.fsencode(destination_name)
    if platform.system() == "Darwin" and hasattr(libc, "renameatx_np"):
        rename = libc.renameatx_np
        rename.argtypes = [
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_uint,
        ]
        rename.restype = ctypes.c_int
        result = rename(
            source_fd,
            source,
            destination_fd,
            destination,
            0x00000004 | 0x00000010,
        )
    elif platform.system() == "Linux" and hasattr(libc, "renameat2"):
        rename = libc.renameat2
        rename.argtypes = [
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_uint,
        ]
        rename.restype = ctypes.c_int
        result = rename(source_fd, source, destination_fd, destination, 1)
    else:
        fail(
            "Atomic no-replace reconciliation archival is unavailable on "
            f"{platform.system()}."
        )
    if result == 0:
        return
    error_number = ctypes.get_errno()
    if error_number == errno.EEXIST:
        fail(
            "Reconciliation archive destination already exists: "
            f"resolved/{destination_name}"
        )
    fail(f"Atomic reconciliation archival failed: {os.strerror(error_number)}")


def archive(
    directory_raw: str,
    name: str,
    expected_identity: str,
    expected_directory_identity: str,
    expected_resolved_identity: str,
    expected_digest: str,
) -> None:
    if (
        not name
        or name != os.path.basename(name)
        or not IDENTITY.fullmatch(expected_identity)
        or not IDENTITY.fullmatch(expected_directory_identity)
        or not IDENTITY.fullmatch(expected_resolved_identity)
    ):
        fail("Invalid reconciliation archival arguments.")
    if not DIGEST.fullmatch(expected_digest):
        fail("Invalid reconciliation artifact digest.")
    directory, directory_fd, directory_stat = exact_directory(directory_raw)
    try:
        if identity(directory_stat) != expected_directory_identity:
            fail("GSC artifact authority changed before reconciliation archival.")
        resolved_fd, resolved_stat = open_resolved(directory_fd, create=False)
        if resolved_fd is None or resolved_stat is None:
            fail("The frozen GSC reconciliation archive authority is unavailable.")
        if identity(resolved_stat) != expected_resolved_identity:
            fail(
                "GSC reconciliation archive authority identity changed before "
                "archival."
            )
        try:
            source_stat = optional_stat(directory_fd, name)
            archive_stat = optional_stat(resolved_fd, name)
            if source_stat is not None and archive_stat is not None:
                fail(
                    "Reconciliation evidence exists in both active and resolved "
                    f"authorities: {name}"
                )
            if source_stat is None and archive_stat is None:
                fail(f"Reconciliation artifact disappeared before archival: {name}")
            observed_stat = source_stat if source_stat is not None else archive_stat
            if (
                observed_stat is None
                or not stat.S_ISREG(observed_stat.st_mode)
                or observed_stat.st_nlink != 1
                or identity(observed_stat) != expected_identity
            ):
                fail("Reconciliation artifact identity changed before archival.")
            if source_stat is not None:
                source_payload, _source_opened_stat = read_exact_evidence(
                    directory_fd,
                    name,
                    source_stat,
                )
                _source_target, source_digest = validate_payload(
                    source_payload,
                    name,
                )
                if source_digest != expected_digest:
                    fail(
                        "Reconciliation artifact digest changed before archival."
                    )
                rename_no_replace(directory_fd, name, resolved_fd, name)

            if optional_stat(directory_fd, name) is not None:
                fail("Active reconciliation artifact remained after archival.")
            final_stat = optional_stat(resolved_fd, name)
            if (
                final_stat is None
                or not stat.S_ISREG(final_stat.st_mode)
                or final_stat.st_nlink != 1
                or identity(final_stat) != expected_identity
            ):
                fail("Resolved reconciliation artifact identity is not exact.")
            final_payload, _final_opened_stat = read_exact_evidence(
                resolved_fd,
                name,
                final_stat,
            )
            _final_target, final_digest = validate_payload(final_payload, name)
            if final_digest != expected_digest:
                fail("Resolved reconciliation artifact digest is not exact.")
            os.fsync(resolved_fd)
            os.fsync(directory_fd)
            resolved_path_stat = os.stat(
                "resolved",
                dir_fd=directory_fd,
                follow_symlinks=False,
            )
            final_directory_stat = os.fstat(directory_fd)
            if (
                resolved_path_stat.st_dev != resolved_stat.st_dev
                or resolved_path_stat.st_ino != resolved_stat.st_ino
                or final_directory_stat.st_dev != directory_stat.st_dev
                or final_directory_stat.st_ino != directory_stat.st_ino
            ):
                fail(
                    "GSC reconciliation archive authority changed during "
                    "archival; the durable ledger transaction remains blocked."
                )
            verify_directory_path(
                directory,
                directory_stat,
                "GSC artifact authority path changed during reconciliation archival; "
                "the durable ledger transaction remains blocked.",
            )
        finally:
            os.close(resolved_fd)
    finally:
        os.close(directory_fd)
    print(
        "\t".join(
            (
                str(directory / "resolved" / name),
                identity(resolved_stat),
            )
        )
    )


class HeldResolvedEvidence:
    def __init__(
        self,
        *,
        directory: Path,
        directory_fd: int,
        directory_stat: os.stat_result,
        resolved_fd: int,
        resolved_stat: os.stat_result,
        file_fd: int,
        file_stat: os.stat_result,
        name: str,
        expected_file_identity: str,
        expected_directory_identity: str,
        expected_resolved_identity: str,
        expected_digest: str,
        expected_target: str,
    ) -> None:
        self.directory = directory
        self.directory_fd = directory_fd
        self.directory_stat = directory_stat
        self.resolved_fd = resolved_fd
        self.resolved_stat = resolved_stat
        self.file_fd = file_fd
        self.file_stat = file_stat
        self.name = name
        self.expected_file_identity = expected_file_identity
        self.expected_directory_identity = expected_directory_identity
        self.expected_resolved_identity = expected_resolved_identity
        self.expected_digest = expected_digest
        self.expected_target = expected_target

    def close(self) -> None:
        os.close(self.file_fd)
        os.close(self.resolved_fd)
        os.close(self.directory_fd)


def verify_held_resolved_evidence(evidence: HeldResolvedEvidence) -> str:
    directory_stat = os.fstat(evidence.directory_fd)
    resolved_stat = os.fstat(evidence.resolved_fd)
    file_stat_before = os.fstat(evidence.file_fd)
    if (
        not stat.S_ISDIR(directory_stat.st_mode)
        or identity(directory_stat) != evidence.expected_directory_identity
        or not stat.S_ISDIR(resolved_stat.st_mode)
        or identity(resolved_stat) != evidence.expected_resolved_identity
        or not stat.S_ISREG(file_stat_before.st_mode)
        or file_stat_before.st_nlink != 1
        or identity(file_stat_before) != evidence.expected_file_identity
    ):
        fail(
            "Resolved reconciliation evidence authority changed while held; "
            "the durable ledger transaction remains blocked."
        )

    verify_directory_path(
        evidence.directory,
        evidence.directory_stat,
        "GSC artifact authority path changed during final reconciliation; "
        "the durable ledger transaction remains blocked.",
    )
    resolved_path_stat = os.stat(
        "resolved",
        dir_fd=evidence.directory_fd,
        follow_symlinks=False,
    )
    source_stat = optional_stat(evidence.directory_fd, evidence.name)
    file_path_stat = optional_stat(evidence.resolved_fd, evidence.name)
    if (
        source_stat is not None
        or not stat.S_ISDIR(resolved_path_stat.st_mode)
        or identity(resolved_path_stat) != evidence.expected_resolved_identity
        or file_path_stat is None
        or not stat.S_ISREG(file_path_stat.st_mode)
        or file_path_stat.st_nlink != 1
        or identity(file_path_stat) != evidence.expected_file_identity
    ):
        fail(
            "Resolved reconciliation evidence path changed during final "
            "reconciliation; the durable ledger transaction remains blocked."
        )

    payload = read_open_file(evidence.file_fd)
    file_stat_after = os.fstat(evidence.file_fd)
    if (
        identity(file_stat_after) != evidence.expected_file_identity
        or file_stat_after.st_nlink != 1
        or file_stat_after.st_size != file_stat_before.st_size
        or file_stat_after.st_mtime_ns != file_stat_before.st_mtime_ns
        or file_stat_after.st_ctime_ns != file_stat_before.st_ctime_ns
    ):
        fail(
            "Resolved reconciliation evidence changed while being read; "
            "the durable ledger transaction remains blocked."
        )
    target, digest = validate_payload(payload, evidence.name)
    if target != evidence.expected_target or digest != evidence.expected_digest:
        fail(
            "Resolved reconciliation evidence payload is not exact; "
            "the durable ledger transaction remains blocked."
        )

    final_resolved_path_stat = os.stat(
        "resolved",
        dir_fd=evidence.directory_fd,
        follow_symlinks=False,
    )
    final_file_path_stat = optional_stat(evidence.resolved_fd, evidence.name)
    final_file_stat = os.fstat(evidence.file_fd)
    if (
        identity(os.fstat(evidence.directory_fd))
        != evidence.expected_directory_identity
        or identity(os.fstat(evidence.resolved_fd))
        != evidence.expected_resolved_identity
        or identity(final_resolved_path_stat)
        != evidence.expected_resolved_identity
        or final_file_path_stat is None
        or identity(final_file_path_stat) != evidence.expected_file_identity
        or identity(final_file_stat) != evidence.expected_file_identity
        or final_file_stat.st_nlink != 1
        or optional_stat(evidence.directory_fd, evidence.name) is not None
    ):
        fail(
            "Resolved reconciliation evidence authority changed during final "
            "verification; the durable ledger transaction remains blocked."
        )
    verify_directory_path(
        evidence.directory,
        evidence.directory_stat,
        "GSC artifact authority path changed during final reconciliation; "
        "the durable ledger transaction remains blocked.",
    )
    return str(evidence.directory / "resolved" / evidence.name)


def open_verified_resolved_evidence(
    directory_raw: str,
    name: str,
    expected_file_identity: str,
    expected_directory_identity: str,
    expected_resolved_identity: str,
    expected_digest: str,
    expected_target: str,
) -> HeldResolvedEvidence:
    if (
        not name
        or name != os.path.basename(name)
        or not IDENTITY.fullmatch(expected_file_identity)
        or not IDENTITY.fullmatch(expected_directory_identity)
        or not IDENTITY.fullmatch(expected_resolved_identity)
        or not DIGEST.fullmatch(expected_digest)
        or not CANONICAL_URL.fullmatch(expected_target)
    ):
        fail("Invalid final reconciliation evidence arguments.")

    directory, directory_fd, directory_stat = exact_directory(directory_raw)
    resolved_fd = -1
    file_fd = -1
    try:
        if identity(directory_stat) != expected_directory_identity:
            fail(
                "GSC artifact authority changed before final reconciliation; "
                "the durable ledger transaction remains blocked."
            )
        resolved_fd, resolved_stat = open_resolved(directory_fd, create=False)
        if resolved_fd is None or resolved_stat is None:
            fail(
                "Resolved reconciliation authority is unavailable; "
                "the durable ledger transaction remains blocked."
            )
        if identity(resolved_stat) != expected_resolved_identity:
            fail(
                "Resolved reconciliation authority identity changed; "
                "the durable ledger transaction remains blocked."
            )
        if optional_stat(directory_fd, name) is not None:
            fail(
                "Active reconciliation evidence reappeared; "
                "the durable ledger transaction remains blocked."
            )
        file_stat = optional_stat(resolved_fd, name)
        if (
            file_stat is None
            or not stat.S_ISREG(file_stat.st_mode)
            or file_stat.st_nlink != 1
            or identity(file_stat) != expected_file_identity
        ):
            fail(
                "Resolved reconciliation evidence identity changed; "
                "the durable ledger transaction remains blocked."
            )
        file_fd = os.open(name, FILE_FLAGS, dir_fd=resolved_fd)
        opened_file_stat = os.fstat(file_fd)
        if (
            not stat.S_ISREG(opened_file_stat.st_mode)
            or opened_file_stat.st_nlink != 1
            or identity(opened_file_stat) != expected_file_identity
        ):
            fail(
                "Resolved reconciliation evidence changed while being opened; "
                "the durable ledger transaction remains blocked."
            )
        evidence = HeldResolvedEvidence(
            directory=directory,
            directory_fd=directory_fd,
            directory_stat=directory_stat,
            resolved_fd=resolved_fd,
            resolved_stat=resolved_stat,
            file_fd=file_fd,
            file_stat=opened_file_stat,
            name=name,
            expected_file_identity=expected_file_identity,
            expected_directory_identity=expected_directory_identity,
            expected_resolved_identity=expected_resolved_identity,
            expected_digest=expected_digest,
            expected_target=expected_target,
        )
        verify_held_resolved_evidence(evidence)
        return evidence
    except BaseException:
        if file_fd >= 0:
            os.close(file_fd)
        if resolved_fd >= 0:
            os.close(resolved_fd)
        os.close(directory_fd)
        raise


def verify_resolved(
    directory_raw: str,
    name: str,
    expected_file_identity: str,
    expected_directory_identity: str,
    expected_resolved_identity: str,
    expected_digest: str,
    expected_target: str,
) -> None:
    evidence = open_verified_resolved_evidence(
        directory_raw,
        name,
        expected_file_identity,
        expected_directory_identity,
        expected_resolved_identity,
        expected_digest,
        expected_target,
    )
    try:
        print(verify_held_resolved_evidence(evidence))
    finally:
        evidence.close()


def write_artifact(
    directory_raw: str,
    expected_directory_identity: str,
    name: str,
    timestamp: str,
    status_value: str,
    url: str,
    message: str,
    page_state: str,
    page_text: str,
) -> None:
    directory_path = Path(os.path.abspath(os.path.expanduser(directory_raw)))
    if not IDENTITY.fullmatch(expected_directory_identity):
        fail("Invalid frozen GSC artifact authority identity.")
    if (
        not name
        or name != os.path.basename(name)
        or any(character in name for character in "\t\r\n\0")
        or not re.fullmatch(r"[0-9]{8}-[0-9]{6}-[a-z0-9_]+-.+\.txt", name)
    ):
        fail("Invalid GSC diagnostic artifact basename.")
    if (
        not TIMESTAMP.fullmatch(timestamp)
        or not re.fullmatch(r"[a-z0-9_]+", status_value)
        or not CANONICAL_URL.fullmatch(url)
        or any(character in message + page_state for character in "\t\r\n\0")
    ):
        fail("Invalid GSC diagnostic artifact metadata.")
    payload = (
        f"timestamp: {timestamp}\n"
        f"status: {status_value}\n"
        f"url: {url}\n"
        f"message: {message}\n"
        f"page_state: {page_state}\n"
        "\n--- page text ---\n"
        f"{page_text}\n"
    ).encode("utf-8")

    directory, directory_fd, directory_stat = exact_directory(str(directory_path))
    file_fd = -1
    try:
        if identity(directory_stat) != expected_directory_identity:
            fail("GSC diagnostic artifact authority changed before durable write.")
        flags = (
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_NONBLOCK", 0)
            | getattr(os, "O_NOFOLLOW", 0)
        )
        file_fd = os.open(name, flags, 0o600, dir_fd=directory_fd)
        opened_stat = os.fstat(file_fd)
        if not stat.S_ISREG(opened_stat.st_mode) or opened_stat.st_nlink != 1:
            fail("GSC diagnostic artifact is not a single-link regular file.")
        offset = 0
        while offset < len(payload):
            written = os.write(file_fd, payload[offset:])
            if written <= 0:
                fail("Zero-byte GSC diagnostic artifact write.")
            offset += written
        os.fsync(file_fd)
        path_stat = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        final_directory_stat = os.fstat(directory_fd)
        if (
            not stat.S_ISREG(path_stat.st_mode)
            or path_stat.st_nlink != 1
            or path_stat.st_dev != opened_stat.st_dev
            or path_stat.st_ino != opened_stat.st_ino
            or final_directory_stat.st_dev != directory_stat.st_dev
            or final_directory_stat.st_ino != directory_stat.st_ino
        ):
            fail("GSC diagnostic artifact authority changed during durable write.")
        os.fsync(directory_fd)
        verify_directory_path(
            directory,
            directory_stat,
            "GSC diagnostic artifact authority path changed during durable write.",
        )
    finally:
        if file_fd >= 0:
            os.close(file_fd)
        os.close(directory_fd)
    print(directory / name)


def main() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == "normalize":
        normalize_directory(sys.argv[2])
        return
    if len(sys.argv) == 5 and sys.argv[1] == "prepare":
        prepare(sys.argv[2], sys.argv[3], sys.argv[4])
        return
    if len(sys.argv) == 5 and sys.argv[1] == "scan":
        scan_unresolved(sys.argv[2], sys.argv[3], sys.argv[4])
        return
    if len(sys.argv) == 8 and sys.argv[1] == "archive":
        archive(
            sys.argv[2],
            sys.argv[3],
            sys.argv[4],
            sys.argv[5],
            sys.argv[6],
            sys.argv[7],
        )
        return
    if len(sys.argv) == 9 and sys.argv[1] == "verify":
        verify_resolved(
            sys.argv[2],
            sys.argv[3],
            sys.argv[4],
            sys.argv[5],
            sys.argv[6],
            sys.argv[7],
            sys.argv[8],
        )
        return
    if len(sys.argv) == 11 and sys.argv[1] == "write":
        write_artifact(
            sys.argv[2],
            sys.argv[3],
            sys.argv[4],
            sys.argv[5],
            sys.argv[6],
            sys.argv[7],
            sys.argv[8],
            sys.argv[9],
            sys.argv[10],
        )
        return
    fail(
        "Usage: gsc-reconciliation.py normalize <artifact-dir> | "
        "scan <artifact-dir> <dir-dev:ino> <url> | "
        "prepare <artifact-dir> <dir-dev:ino> <artifact> | "
        "archive <artifact-dir> <name> <file-dev:ino> <dir-dev:ino> "
        "<resolved-dev:ino> <sha256> | "
        "verify <artifact-dir> <name> <file-dev:ino> <dir-dev:ino> "
        "<resolved-dev:ino> <sha256> <url> | "
        "write <artifact-dir> <dir-dev:ino> <name> <timestamp> <status> "
        "<url> <message> "
        "<page-state> <page-text>"
    )


if __name__ == "__main__":
    main()
