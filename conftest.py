import pytest

import db


@pytest.fixture(autouse=True)
async def fresh_db(tmp_path):
    db.DB_PATH = tmp_path / "test.db"
    await db.init_db()
    yield
