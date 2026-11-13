"""Import every model here so SQLAlchemy knows about all tables."""

from app.models.category import Category
from app.models.product import Product
from app.models.specification import ProductSpecification
from app.models.user import User
from app.models.user_data import Favourite, SavedComparison, SearchHistoryEntry

__all__ = ["Category", "Favourite", "Product", "ProductSpecification", "SavedComparison", "SearchHistoryEntry", "User"]
