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
- Invent facts or details not present in the corpus
- Use external or domain knowledge
- Add operational, technical, or process detail that is not stated
- Assume intent, benefits, or outcomes beyond what is written

--------------------------------
ALLOWED LIMITED INFERENCE (VERY IMPORTANT)
--------------------------------
You MAY perform HIGH‑LEVEL labeling of CURRENT or FUTURE state ONLY when:
- The corpus uses explicit directional or contrast language such as:
  "modernise", "transform", "new platform", "replace", "move to", "future state"
- The inference is LIMITED to naming the state (label only)
- NO operational, functional, or technical detail is added

If this condition is NOT met:
- Use "Unknown"
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
      Medium → clearly implied but not detailed
      Low    → weak or minimal reference

type_of_change:
- current:
    Describe the CURRENT state ONLY if:
    - explicitly stated, OR
    - clearly implied at a HIGH LEVEL by contrast language
- future:
    Describe the FUTURE state ONLY if:
    - explicitly stated, OR
    - clearly described as a planned or target state
- description:
    Neutral comparison ONLY if both current and future states are identified
- confidence:
    High   → both states explicitly stated
    Medium → one or both states implied but clear
    Low    → unclear or missing state information
"""


USER_TPL = """
CORPUS (verbatim, concatenated from uploaded documents):
{corpus}

IMPORTANT:
- Extract ONLY what is stated or clearly implied at a HIGH LEVEL
- Do NOT add operational or technical detail
- Do NOT infer benefits unless explicitly written
- If certainty is not possible, use "Unknown"

CURRENT vs FUTURE STATE RULE:
- "current" = present state if explicitly stated OR clearly implied by contrast language
- "future"  = target or planned state if explicitly described
- If unclear, mark as "Unknown"

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