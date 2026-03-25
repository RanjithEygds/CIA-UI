# app/services/agent1_context_extract.py

import json
from typing import Dict, Any
from .llm import llm_call


SYSTEM = """
You are Agent‑1 (Context Extractor).

Your ONLY responsibility is to extract information that is EXPLICITLY
and DIRECTLY stated in the provided corpus.

HALLUCINATION IS STRICTLY PROHIBITED.

You MUST NOT:
- Infer, assume, interpret, generalize, or synthesize information
- Use external or domain knowledge
- Fill gaps using common sense or industry patterns
- Rephrase implied meaning as factual statements

If information is NOT clearly stated in the corpus:
- Output "Unknown"
- Set confidence to "Low"

Prefer omission over invention.

--------------------------------
OUTPUT RULES
--------------------------------
- Output VALID JSON only
- Follow the REQUIRED JSON SHAPE exactly
- Do NOT include explanations or commentary

--------------------------------
FIELD‑LEVEL INSTRUCTIONS
--------------------------------

change_brief:
- Single paragraph (60–100 words)
- Executive‑level summary
- MUST be supported by explicit corpus statements
- If insufficient evidence exists, output "Unknown"

change_summary:
- 4–8 bullet points (array of strings)
- Each bullet:
  - 8–20 words
  - Based ONLY on explicit statements in the corpus
  - Focus on factual scope, drivers, objectives, phases, dependencies
- If fewer than 4 valid bullets exist, pad remaining bullets with "Unknown"

impacted_groups:
- 3–10 items ONLY if explicitly mentioned in the corpus
- Each item must contain:
  - name: exact or near‑exact wording from corpus
  - description: strictly derived from corpus text
  - confidence:
      High   → clearly and explicitly stated
      Medium → indirectly but clearly referenced
      Low    → weak or minimal reference

type_of_change:
- current:
    Describe the CURRENT state ONLY if explicitly stated
- future:
    Describe the FUTURE state ONLY if explicitly stated
- description:
    Neutral comparison ONLY if both states are explicitly described
- confidence:
    High ONLY if both current and future states are clearly documented

If either current or future state is missing or unclear:
- Use "Unknown"
- Set confidence to "Low"
"""


USER_TPL = """
CORPUS (verbatim, concatenated from uploaded documents):
{corpus}

IMPORTANT:
- Extract ONLY what is explicitly stated in the corpus
- Do NOT infer intent, benefits, impact, or outcomes
- Do NOT convert implied meaning into facts
- If certainty is not possible, use "Unknown"

CURRENT vs FUTURE STATE RULE:
- "current" = how things operate today, as explicitly described
- "future"  = how things will operate later, as explicitly described
- If the corpus does not clearly distinguish them, mark as "Unknown"

REQUIRED JSON SHAPE (STRICT — NO EXTRA FIELDS):
{{
  "change_brief": "string",

  "change_summary": [
    "bullet point 1",
    "bullet point 2",
    "bullet point 3"
  ],

  "impacted_groups": [
    {{
      "name": "string",
      "description": "string",
      "confidence": "High|Medium|Low"
    }}
  ],

  "type_of_change": {{
    "current": "string",
    "future": "string",
    "description": "string",
    "confidence": "High|Medium|Low"
  }}
}}
"""


def extract_context_from_corpus(corpus: str) -> Dict[str, Any]:
    user = USER_TPL.format(corpus=corpus[:100000])

    raw = llm_call(
        SYSTEM,
        user,
        temperature=0.1,
        json_mode=True
    )

    try:
        data = json.loads(raw)
    except Exception:
        data = {
            "change_brief": "Unknown",
            "change_summary": ["Unknown"],
            "impacted_groups": [],
            "type_of_change": {
                "current": "Unknown",
                "future": "Unknown",
                "description": "Unknown",
                "confidence": "Low",
            }
        }

    # ----------------------------
    # Defensive normalization
    # ----------------------------

    # change_summary must be a list
    if not isinstance(data.get("change_summary"), list):
        txt = data.get("change_summary") or ""
        bullets = [b.strip() for b in txt.split("\n") if b.strip()]
        data["change_summary"] = bullets or ["Unknown"]

    # Ensure minimum bullets
    while len(data["change_summary"]) < 4:
        data["change_summary"].append("Unknown")

    # impacted_groups must be a list
    if not isinstance(data.get("impacted_groups"), list):
        data["impacted_groups"] = []

    # type_of_change must exist and be well‑formed
    toc = data.get("type_of_change")
    if not isinstance(toc, dict):
        toc = {}

    data["type_of_change"] = {
        "current": toc.get("current") or "Unknown",
        "future": toc.get("future") or "Unknown",
        "description": toc.get("description") or "Unknown",
        "confidence": toc.get("confidence") or "Low",
    }

    # Final sanity check: short or empty change brief
    if not data.get("change_brief") or len(data["change_brief"].split()) < 30:
        data["change_brief"] = "Unknown"

    return data