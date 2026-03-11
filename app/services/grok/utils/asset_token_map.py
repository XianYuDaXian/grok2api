import json
import asyncio
from typing import Optional, Dict

from app.core.logger import logger
from app.core.storage import DATA_DIR
from app.services.grok.utils.locks import _file_lock


class AssetTokenMap:
    """管理 postId 与生成时使用 token 的映射关系"""

    _instance: Optional["AssetTokenMap"] = None
    _lock = asyncio.Lock()
    _file_path = DATA_DIR / "asset_tokens.json"

    def __init__(self):
        self._cache: Dict[str, str] = {}
        self._initialized = False

    @classmethod
    async def get_instance(cls) -> "AssetTokenMap":
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
                    await cls._instance._load()
        return cls._instance

    async def _load(self):
        """从本地加载映射关系"""
        if self._initialized:
            return

        try:
            if self._file_path.exists():
                async with _file_lock("asset_token_map", timeout=5):
                    content = self._file_path.read_text(encoding="utf-8").strip()
                    if content:
                        self._cache = json.loads(content)
            self._initialized = True
            logger.info(f"Loaded {len(self._cache)} asset-token mappings from file.")
        except Exception as e:
            logger.error(f"Failed to load asset tokens: {e}")
            self._cache = {}

    async def _save(self):
        """持久化映射关系"""
        try:
            async with _file_lock("asset_token_map", timeout=5):
                self._file_path.write_text(
                    json.dumps(self._cache, ensure_ascii=False), encoding="utf-8"
                )
        except Exception as e:
            logger.error(f"Failed to save asset tokens: {e}")

    async def save_mapping(self, post_id: str, token: str) -> None:
        """保存 postId -> token 的映射"""
        if not post_id or not token:
            return

        # 标准化 token 格式
        raw_token = token[4:] if token.startswith("sso=") else token

        # 只保存需要的键值，防止频繁修改
        if self._cache.get(post_id) != raw_token:
            self._cache[post_id] = raw_token
            asyncio.create_task(self._save())
            logger.debug(f"Saved token mapping for post_id: {post_id}")

    async def get_token(self, post_id: str) -> Optional[str]:
        """找回当时生成该 post_id 的 token"""
        if not post_id:
            return None

        token = self._cache.get(post_id)
        if token:
            logger.info(f"Retrieved mapped token for extension post_id: {post_id}")
            return token
        return None
