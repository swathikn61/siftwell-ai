"""
Add a few DEMO products to the database so there is data to try in Swagger.
All products are fictional sample data (the same ones the frontend shows).

Run from the `backend/` folder:
    python -m app.seed
"""

from sqlalchemy import select

from app.database import SessionLocal, create_tables
from app.models.product import Product

DEMO_PRODUCTS = [
    dict(slug="lp-aurora-14", name="Aurora Book Pro 14", brand="Northwind", category="laptops", price=1299, rating=4.7, review_count=2184,
         tagline="Balanced performance with an all-day battery", specs={"Memory": "16 GB", "Storage": "512 GB SSD", "Battery": "18 hours"},
         pros=["18-hour battery life", "Excellent 2.8K OLED display"], cons=["Only two USB-C ports"], tags=["coding", "student", "portable"]),
    dict(slug="lp-slate-13", name="Slate Air 13", brand="Kestrel", category="laptops", price=849, rating=4.4, review_count=3412,
         tagline="Featherweight everyday laptop", specs={"Memory": "8 GB", "Storage": "256 GB SSD", "Battery": "14 hours"},
         pros=["Only 1.05 kg", "Fanless and silent"], cons=["8 GB base memory"], tags=["student", "budget"]),
    dict(slug="hp-quiet-900", name="QuietForm 900", brand="Sonara", category="headphones", price=349, rating=4.8, review_count=6740,
         tagline="Industry-leading noise cancellation", specs={"Type": "Over-ear", "Battery": "30 hours"},
         pros=["Exceptional ANC", "Very comfortable"], cons=["Does not fold flat"], tags=["noise", "travel"]),
    dict(slug="sp-nova-a5", name="Nova A5", brand="Brightline", category="smartphones", price=449, rating=4.5, review_count=4381,
         tagline="Flagship features at a mid-range price", specs={"Display": "6.4\" OLED 120 Hz", "Battery": "5,500 mAh"},
         pros=["Two-day battery", "Clean software"], cons=["No wireless charging"], tags=["budget", "battery"]),
]


def seed() -> None:
    create_tables()
    with SessionLocal() as db:
        existing = set(db.scalars(select(Product.slug)).all())
        new = [Product(**p) for p in DEMO_PRODUCTS if p["slug"] not in existing]
        db.add_all(new)
        db.commit()
        print(f"Added {len(new)} demo products ({len(existing)} already existed).")


if __name__ == "__main__":
    seed()
