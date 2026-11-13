"""Import every model here so SQLAlchemy knows about all tables."""

from app.models.category import Category
from app.models.product import Product
from app.models.specification import ProductSpecification

__all__ = ["Category", "Product", "ProductSpecification"]
