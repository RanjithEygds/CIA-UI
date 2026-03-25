# app/services/agent1_context_extract.py
import json
from typing import Dict, Any, List, Tuple
from .llm import llm_call

SYSTEM = """
You are Agent-1 (Context). Extract a crisp change brief, a structured change summary
(as a list of bullet points), impacted groups, and the type of change.

DO NOT invent; if unknown, say "Unknown". Output JSON only.

Rules:
- change_brief: a single 60–100 word paragraph, executive level.
- change_summary: 4–8 bullet points (array of strings). Each bullet:
    * concise (8–20 words)
    * grounded ONLY in corpus evidence
    * high signal: scope, drivers, goals, phased approach, risks, dependencies
- impacted_groups: list of 3–10 items: {"name","description","confidence"}
- type_of_change:
    {"current": "...", "future": "...", "description":"...", "confidence":"High|Medium|Low"}

- If evidence is weak, still output fields with "Unknown" and Low confidence.
"""


USER_TPL = """
CORPUS (concatenated from uploaded docs):
{corpus}

REQUIRED JSON SHAPE:
{{
  "change_brief": "string",

  "change_summary": [
    "bullet point 1",
    "bullet point 2",
    "bullet point 3"
  ],

  "impacted_groups": [
    {{
      "name": "...",
      "description": "...",
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
    raw = llm_call(SYSTEM, user, temperature=0.1, json_mode=True)

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

    # defensive normalization
    if not isinstance(data.get("change_summary"), list):
        # model accidentally returned a string — split into bullets
        txt = data.get("change_summary") or ""
        bullets = [b.strip() for b in txt.split("\n") if b.strip()]
        data["change_summary"] = bullets or ["Unknown"]

    data["impacted_groups"] = data.get("impacted_groups") or []
    data["type_of_change"] = data.get("type_of_change") or {
        "current": "Unknown",
        "future": "Unknown",
        "description": "Unknown",
        "confidence": "Low"
    }

    return data
