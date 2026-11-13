"""The logged-in user's saved comparisons, favourites and search history."""

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.user_data import ComparisonCreate, ComparisonRead, ComparisonUpdate, FavouriteRead, HistoryCreate, HistoryRead
from app.services import user_data_service as svc

router = APIRouter(prefix="/api/me", tags=["My data"])
NOT_FOUND = {404: {"description": "Not found (or it belongs to another account)"}}


# --- Saved comparisons -------------------------------------------------------
@router.get("/comparisons", response_model=list[ComparisonRead], summary="List my saved comparisons")
def list_comparisons(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.list_comparisons(db, user)


@router.post("/comparisons", response_model=ComparisonRead, status_code=status.HTTP_201_CREATED, summary="Save a comparison")
def create_comparison(body: ComparisonCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.create_comparison(db, user, body)


@router.get("/comparisons/{comparison_id}", response_model=ComparisonRead, responses=NOT_FOUND, summary="Get one saved comparison")
def get_comparison(comparison_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.get_comparison(db, user, comparison_id)


@router.patch("/comparisons/{comparison_id}", response_model=ComparisonRead, responses=NOT_FOUND, summary="Rename or edit a saved comparison")
def update_comparison(comparison_id: int, body: ComparisonUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.update_comparison(db, user, comparison_id, body)


@router.delete("/comparisons/{comparison_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND, summary="Delete a saved comparison")
def delete_comparison(comparison_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    svc.delete_comparison(db, user, comparison_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Favourites --------------------------------------------------------------
@router.get("/favourites", response_model=list[FavouriteRead], summary="List my favourite products")
def list_favourites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.list_favourites(db, user)


@router.put("/favourites/{slug}", response_model=FavouriteRead, summary="Add a product to my favourites (idempotent)")
def add_favourite(slug: str, response: Response, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    fav, created = svc.add_favourite(db, user, slug)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return fav


@router.delete("/favourites/{slug}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND, summary="Remove a favourite")
def remove_favourite(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    svc.remove_favourite(db, user, slug)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Search history ----------------------------------------------------------
@router.get("/history", response_model=list[HistoryRead], summary="My recent searches")
def list_history(limit: int = Query(default=50, ge=1, le=200), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.list_history(db, user, limit)


@router.post("/history", response_model=HistoryRead, status_code=status.HTTP_201_CREATED, summary="Record a search")
def add_history(body: HistoryCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.add_history(db, user, body)


@router.delete("/history/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND, summary="Delete one search")
def delete_history_entry(entry_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    svc.delete_history_entry(db, user, entry_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT, summary="Clear my search history")
def clear_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    svc.clear_history(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
