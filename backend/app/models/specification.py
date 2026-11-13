"""The `product_specifications` table — technical specs, one row per product."""

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.product import Product


class ProductSpecification(Base):
    __tablename__ = "product_specifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), unique=True)

    processor: Mapped[str | None] = mapped_column(String(200))
    ram: Mapped[str | None] = mapped_column(String(100))
    storage: Mapped[str | None] = mapped_column(String(100))
    battery: Mapped[str | None] = mapped_column(String(100))
    display: Mapped[str | None] = mapped_column(String(200))
    graphics: Mapped[str | None] = mapped_column(String(200))  # optional — mostly for laptops

    product: Mapped["Product"] = relationship(back_populates="specifications")
