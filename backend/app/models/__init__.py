"""Import every model here so SQLAlchemy knows about all tables."""

from app.models.product import Product

__all__ = ["Product"]
