"""
Add DEMO laptops and smartphones to the database.

⚠️  Every product below is FICTIONAL sample data (invented brands, models,
specifications and prices). Each record is saved with `is_demo = true`, no
source URL and no verified date, so the API reports it as
`verification_status: "demo"` and it can never appear as verified information.

Run from the `backend/` folder:
    python -m app.seed            # add demo products that don't exist yet
    python -m app.seed --reset    # DROP all catalogue tables, recreate them, then seed
"""

import sys

from sqlalchemy import select

from app.database import Base, SessionLocal, create_tables, engine
from app.models.category import Category
from app.models.product import Product
from app.models.specification import ProductSpecification
from app.services.category_service import ensure_default_categories
from app.services.product_service import make_slug


def demo(name, brand, model, category, price_inr, processor, ram, storage, battery, display, graphics=None):
    return {
        "name": name, "brand": brand, "model": model, "category": category, "price_inr": price_inr,
        "specs": {"processor": processor, "ram": ram, "storage": storage, "battery": battery, "display": display, "graphics": graphics},
    }


DEMO_PRODUCTS = [
    # ---- Laptops (fictional) ----
    demo("Aurora Book Pro 14", "Northwind", "AB14P-26", "laptops", 124990,
         "10-core CPU, up to 4.8 GHz", "16 GB LPDDR5", "512 GB NVMe SSD", "72 Wh", '14" 2880×1800 OLED, 120 Hz', "Integrated"),
    demo("Aurora Book 14", "Northwind", "AB14-26", "laptops", 79990,
         "8-core CPU, up to 4.4 GHz", "16 GB LPDDR5", "512 GB NVMe SSD", "60 Wh", '14" 1920×1200 IPS, 60 Hz', "Integrated"),
    demo("Slate Air 13", "Kestrel", "SA13-26", "laptops", 62990,
         "8-core CPU, up to 4.2 GHz", "8 GB LPDDR5", "256 GB NVMe SSD", "54 Wh", '13.3" 1920×1200 IPS', "Integrated"),
    demo("Slate Book 15", "Kestrel", "SB15-26", "laptops", 45990,
         "6-core CPU, up to 4.0 GHz", "8 GB DDR4", "512 GB SSD", "45 Wh", '15.6" 1920×1080 IPS', "Integrated"),
    demo("Vertex Studio 16", "Halcyon", "VS16-26", "laptops", 189990,
         "16-core CPU, up to 5.2 GHz", "32 GB DDR5", "1 TB NVMe SSD", "90 Wh", '16" 3200×2000 mini-LED, 165 Hz', "Dedicated GPU, 8 GB"),
    demo("Forge 15 Gaming", "Ironpeak", "FG15-26", "laptops", 109990,
         "14-core CPU, up to 5.0 GHz", "16 GB DDR5", "1 TB NVMe SSD", "80 Wh", '15.6" 2560×1440 IPS, 240 Hz', "Dedicated GPU, 8 GB"),
    # ---- Smartphones (fictional) ----
    demo("Lumen X Pro", "Orbis", "LXP-26", "smartphones", 109999,
         "Octa-core 3 nm flagship chip", "12 GB", "256 GB", "5,000 mAh", '6.7" LTPO OLED, 120 Hz'),
    demo("Pico Mini", "Orbis", "PM-26", "smartphones", 64999,
         "Octa-core 3 nm flagship chip", "8 GB", "128 GB", "4,200 mAh", '5.9" OLED, 120 Hz'),
    demo("Nova A5", "Brightline", "NA5-26", "smartphones", 27999,
         "Octa-core 4 nm mid-range chip", "8 GB", "128 GB", "5,500 mAh", '6.4" OLED, 120 Hz'),
    demo("Nova A5 Lite", "Brightline", "NA5L-26", "smartphones", 15999,
         "Octa-core 6 nm chip", "6 GB", "128 GB", "5,000 mAh", '6.5" LCD, 90 Hz'),
    demo("Pulse 9", "Tempo", "P9-26", "smartphones", 42999,
         "Octa-core 4 nm chip", "12 GB", "256 GB", "4,800 mAh", '6.6" AMOLED, 144 Hz'),
    demo("Edge Fold", "Halcyon", "EF-26", "smartphones", 149999,
         "Octa-core 3 nm flagship chip", "12 GB", "512 GB", "4,600 mAh", '7.6" foldable OLED + 6.2" cover OLED'),
]


def seed(reset: bool = False) -> None:
    if reset:
        from app import models  # noqa: F401  (register all tables)

        Base.metadata.drop_all(bind=engine)
        print("Dropped catalogue tables.")
    create_tables()

    with SessionLocal() as db:
        ensure_default_categories(db)
        categories = {c.slug: c for c in db.scalars(select(Category)).all()}
        existing = set(db.scalars(select(Product.slug)).all())

        added = 0
        for item in DEMO_PRODUCTS:
            slug = make_slug(item["brand"], item["model"])
            if slug in existing:
                continue
            product = Product(
                slug=slug,
                name=item["name"],
                brand=item["brand"],
                model=item["model"],
                category=categories[item["category"]],
                price_inr=item["price_inr"],
                image_url=None,           # no real images for demo data
                source_url=None,          # demo data has no real source
                last_verified_date=None,  # demo data is never verified
                is_demo=True,
            )
            product.specifications = ProductSpecification(**item["specs"])
            db.add(product)
            added += 1
        db.commit()

    print(f"Added {added} DEMO products ({len(DEMO_PRODUCTS) - added} already existed).")
    print("Reminder: these are fictional sample records, labelled is_demo=true.")


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
