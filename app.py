from flask import Flask, jsonify

from config import Config
from db import transaction


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

    # Blueprints get registered here as modules are added, e.g.
    # from routes.auth_routes import auth_bp
    # app.register_blueprint(auth_bp)

    return app


if __name__ == "__main__":
    create_app().run(debug=True, port=5000)
