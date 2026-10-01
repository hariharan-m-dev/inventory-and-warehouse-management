from flask import Flask, jsonify

from config import Config
from db import transaction
from utils import error
from routes.auth_routes import bp as auth_bp
from routes.categories import bp as categories_bp
from routes.products import bp as products_bp
from routes.purchase_orders import bp as purchase_orders_bp
from routes.stock import bp as stock_bp
from routes.suppliers import bp as suppliers_bp
from routes.users import bp as users_bp
from routes.warehouses import bp as warehouses_bp


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = Config.JWT_SECRET

    @app.route("/health")
    def health():
        # Proves Flask is up AND the database connection works
        with transaction() as cur:
            cur.execute("SELECT 1 AS ok")
            db_ok = cur.fetchone()["ok"] == 1
        return jsonify({"status": "ok", "database": "connected" if db_ok else "error"})

    for bp in (auth_bp, categories_bp, products_bp, purchase_orders_bp,
               stock_bp, suppliers_bp, users_bp, warehouses_bp):
        app.register_blueprint(bp)

    @app.errorhandler(404)
    def not_found(e):
        return error("Not found", 404)

    @app.errorhandler(405)
    def bad_method(e):
        return error("Method not allowed", 405)

    return app


if __name__ == "__main__":
    create_app().run(debug=True, port=5000)
