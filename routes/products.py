from flask import Blueprint

from routes.crud import register_crud
from utils import to_int, to_price

bp = Blueprint("products", __name__, url_prefix="/products")

SELECT = """
SELECT p.id, p.sku, p.name, p.category_id, c.name AS category_name,
       p.price::float AS price, p.min_stock, p.is_active
FROM products p LEFT JOIN categories c ON c.id = p.category_id
"""


def clean(data, partial):
    out = {}
    if "sku" in data:
        sku = str(data["sku"]).strip().upper()   # ELE-001 and ele-001 are the same SKU (rule 12)
        if not sku:
            return None, "SKU cannot be empty"
        out["sku"] = sku
    if "name" in data:
        name = str(data["name"]).strip()
        if not name:
            return None, "Name cannot be empty"
        out["name"] = name
    if "price" in data:
        price = to_price(data["price"])
        if price is None:
            return None, "Price must be a number >= 0"
        out["price"] = price
    if "min_stock" in data:
        ms = to_int(data["min_stock"])
        if ms is None:
            return None, "min_stock must be a whole number >= 0"
        out["min_stock"] = ms
    if "category_id" in data:
        out["category_id"] = data["category_id"] or None
    if partial and "is_active" in data:
        out["is_active"] = bool(data["is_active"])
    return out, None


register_crud(bp, table="products", alias="p", select_sql=SELECT, clean=clean,
              required=["sku", "name", "price"],
              read_roles=("admin", "manager", "staff"),
              unique_msg="A product with this SKU already exists",
              check_msg="Price and min_stock must be >= 0")
