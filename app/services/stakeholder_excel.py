import os
import re
from typing import List, Dict, Optional
import pandas as pd

SUPPORTED_EXCEL = {".xlsx", ".xls"}

CANDIDATE_COLS = {
    "name": ["name", "stakeholder", "stakeholder name", "full name"],
    "email": ["email", "e-mail", "mail"],
    "role": ["role", "title", "position"],
    "department": ["dept", "department", "function", "team"],
    "engagement": ["engagement", "engagement level", "raci", "consulted", "engaged", "stakeholder type"],
}

def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()

def _map_cols(df: pd.DataFrame) -> Dict[str, str]:
    cols = {c: _norm(c) for c in df.columns}
    mapping = {}
    for key, names in CANDIDATE_COLS.items():
        found = None
        for c, cnorm in cols.items():
            if any(n in cnorm for n in names):
                found = c; break
        if found:
            mapping[key] = found
    return mapping

def _normalize_engagement_level(raw: Optional[str]) -> Optional[str]:
    if not raw: return None
    s = _norm(raw)
    if "accountable" in s or s == "a": return "Accountable"
    if "responsible" in s or s == "r": return "Responsible"
    if "consulted" in s or s == "c": return "Consulted"
    if "informed"  in s or s == "i": return "Informed"
    if "engage" in s or "engaged" in s: return "Engaged"
    return raw.strip()

def parse_stakeholders_from_excels(excel_docs: List[Dict]) -> List[Dict]:
    """
    excel_docs: [{id, filename, path, size_bytes, category}]
    Returns a list[dict] normalized stakeholders.
    """
    stakeholders: List[Dict] = []
    for d in excel_docs:
        ext = os.path.splitext(d["filename"])[1].lower()
        if ext not in SUPPORTED_EXCEL: 
            continue
        try:
            if ext == ".xlsx":
                df = pd.read_excel(d["path"], engine="openpyxl")
            else:
                df = pd.read_excel(d["path"], engine="xlrd")
        except Exception:
            continue

        mapping = _map_cols(df)
        if "name" not in mapping:
            # cannot process this sheet
            continue

        for _, row in df.iterrows():
            name = str(row.get(mapping["name"], "") or "").strip()
            if not name: 
                continue

            email = str(row.get(mapping.get("email", ""), "") or "").strip() or None
            role = str(row.get(mapping.get("role", ""), "") or "").strip() or None
            dept = str(row.get(mapping.get("department",""), "") or "").strip() or None
            englvl_raw = str(row.get(mapping.get("engagement",""), "") or "").strip() or None
            englvl = _normalize_engagement_level(englvl_raw)

            stakeholders.append({
                "name": name,
                "email": email,
                "role": role,
                "department": dept,
                "engagement_level": englvl,
                "source_document_id": d["id"],
            })
    return stakeholders