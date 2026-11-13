"""The `products` table — one row per product in the catalogue."""

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.specification import ProductSpecification


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    brand: Mapped[str] = mapped_column(String(100), index=True)
    model: Mapped[str] = mapped_column(String(100))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"), index=True)
    price_inr: Mapped[Decimal] = mapped_column(Numeric(12, 2), index=True)
    image_url: Mapped[str | None] = mapped_column(String(500))
    source_url: Mapped[str | None] = mapped_column(String(500))
    last_verified_date: Mapped[date | None] = mapped_column(Date)

    # True for sample/demo records. Demo data is never shown as verified.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # lazy="joined" loads the category and specs in the same query as the product
    category: Mapped["Category"] = relationship(back_populates="products", lazy="joined")
    specifications: Mapped["ProductSpecification"] = relationship(
        back_populates="product", lazy="joined", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def verification_status(self) -> str:
        """
        - demo:       sample data, not real-world information
        - verified:   has a source URL and a last-verified date
        - unverified: real product, but not yet checked against a source
        """
        if self.is_demo:
            return "demo"
        if self.source_url and self.last_verified_date:
            return "verified"
        return "unverified"

    def __repr__(self) -> str:
        return f"<Product {self.slug}>"
