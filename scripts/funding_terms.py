"""Source-preserving funding validation; no inferred stage, FX or allocation."""
from __future__ import annotations

import json
import math
import re
from datetime import date
from pathlib import Path

CURRENCIES = set(json.loads((Path(__file__).resolve().parents[1] / "src/lib/funding-currencies.json").read_text())["codes"])
INSTRUMENTS = {"equity", "debt", "mixed", "grant", "undisclosed"}
AMOUNT_RE = re.compile(r"^(\$|[A-Z]{3} )([0-9]+(?:\.[0-9]+)?)(?:[MBK])?\+?$")


def normalize_funding_stage(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    if re.fullmatch(r"pre[- ]seed", value, re.I):
        return "Pre-Seed"
    if re.fullmatch(r"pre[- ]series a", value, re.I):
        return "Pre-Series A"
    if re.fullmatch(r"seed(?:\+| extension)?", value, re.I):
        return "Seed"
    if re.fullmatch(r"unspecified", value, re.I):
        return "Unspecified"
    match = re.fullmatch(r"series ([a-z])(?:\+| extension)?", value, re.I)
    return f"Series {match.group(1).upper()}" if match else None


def validate_funding_terms(round_data):
    if not isinstance(round_data, dict):
        return ["round must be an object"]
    errors = []
    amount = round_data.get("amount")
    currency = round_data.get("currency")
    if currency is not None and (not isinstance(currency, str) or currency not in CURRENCIES):
        errors.append("currency must be a supported ISO 4217 code")
    if amount != "undisclosed":
        match = AMOUNT_RE.fullmatch(amount) if isinstance(amount, str) and len(amount) <= 50 else None
        if not match or not math.isfinite(float(match.group(2))) or float(match.group(2)) <= 0:
            errors.append("amount must be a positive source amount ($10M or EUR 10M), or undisclosed")
        else:
            stated_currency = "USD" if match.group(1) == "$" else match.group(1).strip()
            if stated_currency not in CURRENCIES:
                errors.append("amount contains an unsupported currency")
            if stated_currency != "USD" and currency is None:
                errors.append("native-currency amount requires an explicit currency field")
            if currency is not None and currency != stated_currency:
                errors.append("currency must match the amount; no automatic conversion")
    stage = round_data.get("stage")
    normalized = normalize_funding_stage(stage)
    if not normalized or normalized != stage:
        errors.append("stage must be canonical Pre-Seed, Seed, Pre-Series A, named Series A-Z or Unspecified; preserve extensions in stage_raw")
    if "stage_raw" in round_data:
        raw = round_data["stage_raw"]
        if stage == "Unspecified":
            errors.append("stage_raw is not allowed when the source does not name a stage")
        elif not isinstance(raw, str) or raw != raw.strip() or len(raw) > 60 or normalize_funding_stage(raw) != stage:
            errors.append("stage_raw must be a source-stated named stage consistent with stage")
    instrument = round_data.get("instrument")
    if instrument is not None and (not isinstance(instrument, str) or instrument not in INSTRUMENTS):
        errors.append("instrument must be equity, debt, mixed, grant or undisclosed")
    value = round_data.get("date")
    try:
        parsed = date.fromisoformat(value) if isinstance(value, str) else None
        valid_date = parsed is not None and parsed.isoformat() == value and parsed <= date.today()
    except ValueError:
        valid_date = False
    if not valid_date:
        errors.append("date must be a real non-future YYYY-MM-DD source date")
    return errors
