import hashlib
import json

from requests import Session

from app.models import Engagement, EngagementContext, EngagementHeatmap
from app.services.llm import llm_call
from app.services.transcripts_service import get_transcripts_for_engagement


def hash_transcripts(transcripts: list) -> str:
    payload = json.dumps(transcripts, sort_keys=True)
    return hashlib.md5(payload.encode("utf-8")).hexdigest()

HEATMAP_SYSTEM_PROMPT = """
You generate a Change Impact Heatmap using a list of impacted groups and
stakeholder interview transcripts.

Your task: Score HOW MUCH each group is affected across four dimensions:
People, Process, Technology, Organization (each scored 0–3).

============================================================
REQUIRED OUTPUT
============================================================
• Output MUST be a JSON ARRAY.  
• Include ALL impacted groups (no omissions, no new groups).  
• If there is no evidence for a group, assign zeroes.  

Format:
[
  {
    "function": "<group name>",
    "People": 0-3,
    "Process": 0-3,
    "Technology": 0-3,
    "Organization": 0-3
  }
]

============================================================
SCORING RULES
============================================================
0 = No mention or no reasonable link  
1 = Low impact (minor or indirect effects)  
2 = Medium impact (clear or noticeable change)  
3 = High impact (major change, repeated emphasis)

Score based on DIRECT or INDIRECT evidence in transcripts.

============================================================
HOW TO MAP TRANSCRIPT SIGNALS
============================================================
Use keywords, responsibilities, and logical inference even when
the transcript does not name groups explicitly.

Examples:
• HR/roles/training → People Managers, Frontline Users, Change Champions  
• New tools/automation → IT Teams, Support Functions  
• Process redesign → All operational groups (Process impact)  
• Governance/alignment → Executive Leadership  

============================================================
GROUP‑SPECIFIC HINTS
============================================================
1. Executive Leadership  
   – Governance, sponsorship, strategic alignment

2. Middle Management / People Managers  
   – Coordination, training needs, communication, behavior change

3. Frontline Business Users  
   – New tools, workflow changes, reduction of manual work

4. Support Functions  
   – Reporting, approvals, data/process changes

5. Technology & IT  
   – New systems, integrations, automation, migration

6. Change Champions / Super Users  
   – Enablement, adoption support, feedback loops

7. External / Third‑Party  
   – SLAs, integrations, data exchange

============================================================
IF THE GROUP IS NOT EXPLICITLY MENTIONED
============================================================
Infer impact logically:
• Process changes → affect Frontline + Managers  
• Tool automation → affects IT + Support  
• Approval changes → affects Support + Leadership  
• Change sentiment → affects Managers + Champions  

Assign 0 ONLY if there is truly no reasonable connection.

Return ONLY the JSON output.
"""

def generate_heatmap_with_llm(groups, transcripts):
    system = HEATMAP_SYSTEM_PROMPT

    user = f"""
    IMPACTED_GROUPS (ALL must appear in the output exactly as listed):
    {json.dumps(groups, indent=2)}

    TRANSCRIPTS (Use these to infer impact levels):
    {json.dumps(transcripts, indent=2)}

    You MUST return EXACTLY {len(groups)} objects in the JSON array — one per group.
    Never return a single object. Never omit any group.

    YOUR TASK:
    Using the provided impacted groups and transcripts, generate a Change Impact Heatmap.
    For each impacted group, assign impact scores (0–3) across four dimensions:
    - People
    - Process
    - Technology
    - Organization

    SCORING RULES:
    0 = No mention or no reasonable connection  
    1 = Low impact (minor/indirect effects)  
    2 = Medium impact (clear or noticeable change)  
    3 = High impact (major change, repeated or strong signals)

    IMPORTANT REQUIREMENTS:
    • Output MUST include every impacted group exactly once.  
    • Do NOT create or infer new groups.  
    • If a group has no supporting evidence, assign zeros.  
    • Use both direct and indirect clues from transcripts to infer impact.  
    • Return ONLY the JSON output in the format below.

    OUTPUT FORMAT (STRICT):
    [
        {{
            "function": "Group A",
            "People": 0,
            "Process": 0,
            "Technology": 0,
            "Organization": 0
        }},
        {{
            "function": "Group B",
            "People": 0,
            "Process": 0,
            "Technology": 0,
            "Organization": 0
        }}
    ]
    """
    
    raw = llm_call(
        system_prompt=system,
        user_prompt=user,
        json_mode=True,
        temperature=0,
    )

    try:
        return json.loads(raw)
    except Exception as e:
        raise RuntimeError(f"LLM returned invalid JSON: {raw[:500]}")
    
    
def ensure_all_groups_present(groups, heatmap_result):
    # Convert list -> dict
    existing = {row["function"]: row for row in heatmap_result}

    final = []
    for g in groups:
        name = g["name"]
        if name in existing:
            final.append(existing[name])
        else:
            # Insert default zero row
            final.append({
                "function": name,
                "People": 0,
                "Process": 0,
                "Technology": 0,
                "Organization": 0,
            })
    return final


def normalize_heatmap_output(raw_output):
    """
    Ensures the LLM result is ALWAYS a list of dicts.
    Models sometimes return a single dict instead of a list.
    """
    if raw_output is None:
        return []

    # If a single object was returned → wrap in list
    if isinstance(raw_output, dict):
        return [raw_output]

    # If it is already a list → return as is
    if isinstance(raw_output, list):
        return raw_output

    raise ValueError("Heatmap LLM output must be a JSON array or object.")


def get_engagement_heatmap(db: Session, engagement_id: str):
    # ✅ Validate engagement
    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise ValueError("Engagement not found")

    # ✅ Load impacted groups
    ctx = db.query(EngagementContext).filter_by(engagement_id=engagement_id).first()
    if not ctx:
        raise ValueError("Context not available. Run /context first.")

    impacted_groups = ctx.impacted_groups_json or []
    groups = impacted_groups  # full objects, not just names

    # ✅ Load completed transcripts
    tx = get_transcripts_for_engagement(db, engagement_id)
    completed = tx["completed_interviews"]

    # ✅ Compute hash
    new_hash = hash_transcripts(completed)

    # ✅ Check cache
    cached = db.query(EngagementHeatmap).filter_by(engagement_id=engagement_id).first()
    # if cached and cached.transcript_hash == new_hash:
    #     return {
    #         "engagement_id": engagement_id,
    #         "heatmap": json.loads(cached.data_json),
    #         "cached": True
    #     }

    # ✅ Build LLM request
    transcripts_flat = [
        {
            "stakeholder": iv["stakeholder_name"],
            "answers": iv["transcript"]
        }
        for iv in completed
    ]

    heatmap = generate_heatmap_with_llm(groups, transcripts_flat)
    print(heatmap)
    heatmap = normalize_heatmap_output(heatmap)
    heatmap = ensure_all_groups_present(groups, heatmap)

    # ✅ Upsert DB
    if not cached:
        cached = EngagementHeatmap(engagement_id=engagement_id)

    cached.data_json = json.dumps(heatmap)
    cached.transcript_hash = new_hash
    db.add(cached)
    db.commit()

    return {
        "engagement_id": engagement_id,
        "heatmap": heatmap,
        "cached": False
    }