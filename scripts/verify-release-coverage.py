#!/usr/bin/env python3
"""Read-only Git proof that a successor preserves a task's exact changed paths.

This does not prove CI, deployment, or live health. Verify those separately for
release_sha. An ancestor check alone is insufficient: the successor may revert
or overwrite the task. Never use this receipt to deploy an unvalidated SHA.
"""
import argparse
import json
import re
import subprocess


def git(*args):
    return subprocess.check_output(["git", *args], stderr=subprocess.PIPE)


def commit(value):
    if not re.fullmatch(r"[a-f0-9]{40}", value):
        raise ValueError("Use full, exact 40-character commit SHAs")
    if git("rev-parse", "--verify", f"{value}^{{commit}}").decode().strip() != value:
        raise ValueError("Commit identity mismatch")
    return value


def ancestor(before, after):
    result = subprocess.run(["git", "merge-base", "--is-ancestor", before, after], capture_output=True)
    if result.returncode not in (0, 1):
        raise ValueError("Cannot verify ancestry; fetch complete history first")
    return result.returncode == 0


def paths(before, after):
    return set(git("diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", before, after, "--").split(b"\0")) - {b""}


def verify(base, source, release):
    base, source, release = (commit(value) for value in (base, source, release))
    if not ancestor(base, source) or not ancestor(source, release):
        raise ValueError("Require base -> source -> release ancestry")
    changed = paths(base, source)
    overwritten = changed & paths(source, release)
    if overwritten:
        raise ValueError("Successor changed task paths; inspect/revalidate the new versions: " + ", ".join(sorted(path.decode() for path in overwritten)))
    return {"read_only": True, "covered": True, "base_sha": base, "source_sha": source, "release_sha": release, "task_paths": sorted(path.decode() for path in changed), "ci_deploy_live_verified": False, "next": "Require successful Validate, Deploy and live evidence for this exact release_sha; this receipt proves Git coverage only."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("base", "source", "release"):
        parser.add_argument(f"--{name}-sha", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.base_sha, args.source_sha, args.release_sha), indent=2))
    except (ValueError, OSError, UnicodeError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"Release coverage unverified: {error}")


if __name__ == "__main__":
    main()
