import asyncio
import os
import ssl
import unittest
from unittest.mock import patch

from app.control.account.backends import sql as sql_backend
from app.platform.config.backends.sql import SqlConfigBackend


class _DummyEngine:
    def __init__(self) -> None:
        self.dispose_calls = 0

    async def dispose(self) -> None:
        self.dispose_calls += 1


class SqlEngineFactoryTests(unittest.TestCase):
    def setUp(self) -> None:
        sql_backend._ENGINE_CACHE.clear()
        sql_backend._ENGINE_KEYS_BY_ID.clear()

    def tearDown(self) -> None:
        sql_backend._ENGINE_CACHE.clear()
        sql_backend._ENGINE_KEYS_BY_ID.clear()

    def test_create_pgsql_engine_normalizes_ssl_and_pool_settings(self) -> None:
        sentinel = object()
        with patch.dict(
            os.environ,
            {
                "ACCOUNT_SQL_POOL_SIZE": "2",
                "ACCOUNT_SQL_MAX_OVERFLOW": "1",
                "ACCOUNT_SQL_POOL_TIMEOUT": "15",
                "ACCOUNT_SQL_POOL_RECYCLE": "600",
            },
            clear=False,
        ):
            with patch.object(sql_backend, "create_async_engine", return_value=sentinel) as create_engine:
                engine = sql_backend.create_pgsql_engine(
                    "postgres://user:pass@example.com:5432/defaultdb?sslmode=require&application_name=grok2api"
                )

        self.assertIs(engine, sentinel)
        create_engine.assert_called_once()
        args, kwargs = create_engine.call_args
        self.assertEqual(
            args[0],
            "postgresql+asyncpg://user:pass@example.com:5432/defaultdb?application_name=grok2api",
        )
        self.assertEqual(kwargs["connect_args"], {"ssl": "require"})
        self.assertEqual(kwargs["pool_size"], 2)
        self.assertEqual(kwargs["max_overflow"], 1)
        self.assertEqual(kwargs["pool_timeout"], 15)
        self.assertEqual(kwargs["pool_recycle"], 600)
        self.assertTrue(kwargs["pool_pre_ping"])
        self.assertTrue(kwargs["pool_use_lifo"])

    def test_create_mysql_engine_moves_ssl_mode_to_ssl_context(self) -> None:
        sentinel = object()
        with patch.object(sql_backend, "create_async_engine", return_value=sentinel) as create_engine:
            engine = sql_backend.create_mysql_engine(
                "mysql://user:pass@example.com:3306/defaultdb?ssl-mode=REQUIRED&charset=utf8mb4"
            )

        self.assertIs(engine, sentinel)
        create_engine.assert_called_once()
        args, kwargs = create_engine.call_args
        self.assertEqual(
            args[0],
            "mysql+aiomysql://user:pass@example.com:3306/defaultdb?charset=utf8mb4",
        )
        self.assertIsInstance(kwargs["connect_args"]["ssl"], ssl.SSLContext)
        self.assertFalse(kwargs["connect_args"]["ssl"].check_hostname)
        self.assertEqual(kwargs["connect_args"]["ssl"].verify_mode, ssl.CERT_NONE)

    def test_create_pgsql_engine_reuses_shared_engine_for_same_url(self) -> None:
        sentinel = object()
        with patch.object(sql_backend, "create_async_engine", return_value=sentinel) as create_engine:
            engine_a = sql_backend.create_pgsql_engine(
                "postgres://user:pass@example.com:5432/defaultdb?sslmode=require"
            )
            engine_b = sql_backend.create_pgsql_engine(
                "postgres://user:pass@example.com:5432/defaultdb?sslmode=require"
            )

        self.assertIs(engine_a, engine_b)
        create_engine.assert_called_once()

    def test_repository_close_disposes_and_evicts_cached_engine(self) -> None:
        engine = _DummyEngine()
        with patch.object(sql_backend, "create_async_engine", return_value=engine):
            shared = sql_backend.create_pgsql_engine(
                "postgres://user:pass@example.com:5432/defaultdb?sslmode=require"
            )

        repo = sql_backend.SqlAccountRepository(shared, dialect="postgresql", dispose_engine=True)
        asyncio.run(repo.close())

        self.assertEqual(engine.dispose_calls, 1)
        self.assertEqual(sql_backend._ENGINE_CACHE, {})
        self.assertEqual(sql_backend._ENGINE_KEYS_BY_ID, {})

    def test_sql_config_backend_can_skip_disposing_shared_engine(self) -> None:
        engine = _DummyEngine()
        backend = SqlConfigBackend(engine, dialect="postgresql", dispose_engine=False)

        asyncio.run(backend.close())

        self.assertEqual(engine.dispose_calls, 0)


if __name__ == "__main__":
    unittest.main()
