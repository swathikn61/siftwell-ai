from pydantic import BaseModel, ConfigDict


class CategoryRead(BaseModel):
    slug: str
    name: str

    model_config = ConfigDict(from_attributes=True)


class CategoryWithCount(CategoryRead):
    description: str
    product_count: int
