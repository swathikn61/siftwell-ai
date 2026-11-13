"""The `products` table."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, DateTime, Float, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    brand: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(50), index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    rating: Mapped[float] = mapped_column(Float, default=0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    tagline: Mapped[str] = mapped_column(String(300), default="")

    # Flexible fields stored as JSON
    specs: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    pros: Mapped[list[str]] = mapped_column(JSON, default=list)
    cons: Mapped[list[str]] = mapped_column(JSON, default=list)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<Product id={self.id} slug={self.slug!r}>"
