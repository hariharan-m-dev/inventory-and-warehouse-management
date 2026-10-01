"""Database helper. Plain SQL via psycopg2, rows come back as dicts."""
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

from config import Config


def get_connection():
    return psycopg2.connect(
        Config.DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor
    )


@contextmanager
def transaction():
    """One transaction per `with` block.
    Commits if the block succeeds, rolls back if anything raises.
    Every stock change (in/out/transfer/PO receive) will use this.

        with transaction() as cur:
            cur.execute("UPDATE ...")
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
