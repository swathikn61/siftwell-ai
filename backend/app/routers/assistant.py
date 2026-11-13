"""AI Decision Assistant endpoint. The logic lives in app/ai/assistant.py."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.assistant import DecisionAssistant
from app.ai.gemini_client import GeminiClient
from app.database import get_db
from app.routers.ai import get_ai_client
from app.schemas.assistant import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/assistant", tags=["Assistant"])

ERRORS = {
    404: {"description": "None of the products exist"},
    429: {"description": "Gemini rate limit reached"},
    502: {"description": "Gemini returned an unusable answer"},
    503: {"description": "Gemini isn’t configured or available"},
    504: {"description": "Gemini didn’t answer in time"},
}


@router.post("/chat", response_model=ChatResponse, responses=ERRORS, summary="Ask the Decision Assistant about the current results")
def chat(body: ChatRequest, db: Session = Depends(get_db), client: GeminiClient = Depends(get_ai_client)) -> ChatResponse:
    """
    Answers questions such as *“Why is this ranked first?”* or *“Which has the
    best battery?”* using only product data from PostgreSQL and the scores from
    Siftwell's rule-based engine. Send earlier messages in `history` for
    follow-up questions. Gemini explains; it never calculates scores.
    """
    return DecisionAssistant(client).answer(db, body)
