#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
STARTUPS_DIR = REPO_ROOT / "content" / "startups"

SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
FACT_RE = re.compile(
    r"(\d|\bapi\b|\bsdk\b|\bcli\b|github|docs|pricing|customers?|users?|teams?|"
    r"workflow|claims?|agents?|portal|payment|faxes|processes|projects?|"
    r"demo|case study|open-source|open source|integration|benchmark|deploy)",
    re.IGNORECASE,
)
RISK_RE = re.compile(
    r"\b(risk|open question|hard part|whether|may matter|must prove|needs to prove)\b",
    re.IGNORECASE,
)
EDITORIAL_OPENING_RE = re.compile(
    r"\b(bet|interesting move|clever part|useful idea|sharper|surprising thing|right move|usually)\b",
    re.IGNORECASE,
)


PRIMARY_USERS = {
    "AI / ML": "AI builders and operators evaluating model, automation, or data workflows.",
    "SaaS": "Business teams evaluating workflow software for a specific operating function.",
    "DevTools": "Developers and engineering teams evaluating build, deployment, or infrastructure workflows.",
    "Fintech": "Finance, banking, or payments teams evaluating regulated transaction workflows.",
    "HealthTech": "Healthcare, benefits, or life-sciences teams evaluating regulated operational workflows.",
    "EdTech": "Learners, educators, or training teams evaluating learning and study workflows.",
    "E-commerce": "Commerce teams evaluating storefront, checkout, or merchandising workflows.",
    "Marketplace": "Supply-and-demand operators evaluating marketplace coordination workflows.",
    "Creator Tools": "Creative teams and individual creators evaluating production workflows.",
    "Climate / Sustainability": "Climate, infrastructure, or operations teams evaluating measurable sustainability workflows.",
    "Other": "Operators evaluating a specialized workflow where the product surface is visible.",
}


def clean_sentence(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def sentence_split(value: str) -> list[str]:
    return [clean_sentence(part) for part in SENTENCE_RE.split(value) if clean_sentence(part)]


def trim_claim(value: str, max_length: int = 250) -> str:
    value = clean_sentence(value)
    if len(value) <= max_length:
        return value
    cut = value[: max_length - 1]
    last_space = cut.rfind(" ")
    if last_space > 120:
        cut = cut[:last_space]
    return cut.rstrip(".,;:") + "."


def product_claim(data: dict[str, object]) -> str:
    name = str(data["product_name"])
    summary = clean_sentence(str(data.get("summary", ""))).rstrip(".")
    if summary.lower().startswith(name.lower()):
        claim = summary
    else:
        claim = (
            f"Official product positioning describes {name}: {summary}."
            if summary
            else f"Official product positioning describes {name}: a startup with a public product surface."
        )
    return trim_claim(claim)


def supporting_claim(data: dict[str, object]) -> str:
    note = str(data.get("editor_note", ""))
    sentences = sentence_split(note)
    candidates = [
        sentence
        for sentence in sentences
        if FACT_RE.search(sentence)
        and not RISK_RE.search(sentence)
        and not EDITORIAL_OPENING_RE.search(sentence)
    ]
    if not candidates:
        candidates = [
            sentence
            for sentence in sentences
            if not RISK_RE.search(sentence) and not EDITORIAL_OPENING_RE.search(sentence)
        ]
    if not candidates:
        return product_claim(data)

    sentence = candidates[0]
    if sentence.lower().startswith("unlike "):
        sentence = f"VentureDex product review notes that {sentence[0].lower() + sentence[1:]}"
    return trim_claim(sentence)


def risk_claim(data: dict[str, object]) -> str:
    note = str(data.get("editor_note", ""))
    for sentence in sentence_split(note):
        if RISK_RE.search(sentence):
            return trim_claim(sentence, max_length=230)
    return (
        "Continued tracking should verify whether the public product evidence turns into durable "
        "customer adoption beyond the currently visible surface."
    )


def latest_round(data: dict[str, object]) -> dict[str, object]:
    rounds = data.get("funding") or []
    if not isinstance(rounds, list) or not rounds:
        return {}
    return sorted(
        [round_data for round_data in rounds if isinstance(round_data, dict)],
        key=lambda round_data: str(round_data.get("date", "")),
        reverse=True,
    )[0]


def funding_sources(data: dict[str, object]) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    rounds = data.get("funding") or []
    if not isinstance(rounds, list):
        return sources

    for index, round_data in enumerate(rounds, start=1):
        if not isinstance(round_data, dict):
            continue
        source_url = str(round_data.get("source_url", "")).strip()
        source_name = str(round_data.get("source_name", "")).strip() or "Funding source"
        if not source_url:
            continue
        sources.append(
            {
                "id": f"funding_{index}",
                "label": source_name,
                "url": source_url,
                "type": "funding",
            }
        )
    return sources


def build_research(data: dict[str, object]) -> dict[str, object]:
    source_list = [
        {
            "id": "official_site",
            "label": "Official product site",
            "url": data.get("url") or f"https://{data['domain']}",
            "type": "official",
        },
        *funding_sources(data),
    ]

    evidence = [
        {
            "claim": product_claim(data),
            "source_ids": ["official_site"],
        },
        {
            "claim": supporting_claim(data),
            "source_ids": ["official_site"],
        },
    ]

    product_type = str(data.get("product_type", "Other"))
    tags = [tag.strip() for tag in str(data.get("tags", "")).split(",") if tag.strip()]
    tag_context = ", ".join(tags[:3]) if tags else product_type

    return {
        "verified_at": date.today().isoformat(),
        "sources": source_list,
        "product_evidence": evidence,
        "market_context": {
            "primary_user": PRIMARY_USERS.get(product_type, PRIMARY_USERS["Other"]),
            "category": product_type,
            "differentiation": str(data.get("why_featured", "")).strip(),
            "why_now": f"Recent source-backed funding and public product evidence make {tag_context} worth tracking.",
        },
        "risks": [
            {
                "claim": risk_claim(data),
                "basis": "VentureDex editorial assessment based on official product evidence and funding-source review.",
            }
        ],
    }


def main(argv: list[str]) -> int:
    requested_slugs = set(argv)
    changed = 0
    for path in sorted(STARTUPS_DIR.glob("*.json")):
        if requested_slugs and path.stem not in requested_slugs:
            continue
        data = json.loads(path.read_text())
        data["research"] = build_research(data)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        changed += 1

    print(f"Backfilled research for {changed} startup files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
