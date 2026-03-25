# app/services/agent4_template.py
from sqlalchemy.orm import Session
from ..models import CIATemplateRow

def populate_cia_template_rows(db: Session, scope: str, sid: int, insights_json):
    """
    Take insights_json from Agent 3 and materialize CIATemplateRow entries.
    Expect insights_json to be structured; transform to rows.
    """
    # Pseudocode parse
    # for item in insights_json["insights_list"]:
    #   row = CIATemplateRow(...)
    #   db.add(row)
    # db.commit()
    pass