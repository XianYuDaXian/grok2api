"""AccountDirectory — high-concurrency hot-path account store.

Wraps the columnar AccountRuntimeTable with lock-minimal coordination.
Bootstrap loads a full snapshot; incremental sync applies revision-based
changesets without holding the selection lock.
"""

import asyncio
from typing import TYPE_CHECKING

from app.platform.logging.logger import logger
from app.platform.runtime.clock import now_s
from app.control.account.repository import AccountRepository
from app.control.account.enums import FeedbackKind
from .table import AccountRuntimeTable
from .lease import AccountLease, new_lease
from .selector import select
from .sync import bootstrap as _bootstrap, apply_changes
from . import feedback as fb
from ..shared.enums import StatusId

if TYPE_CHECKING:
    pass


class AccountDirectory:
    """High-concurrency, lock-minimal account store for the hot path.

    Design:
      - ``_table`` is replaced atomically; readers never see partial state.
      - ``_lock`` guards all table mutations (feedback, sync, status updates).
      - Selection (``reserve``) copies the candidate set under lock, then
        scores outside the lock — lock is re-acquired only to increment
        inflight.
    """

    def __init__(self, repository: AccountRepository) -> None:
        self._repo = repository
        self._table: AccountRuntimeTable | None = None
        self._lock = asyncio.Lock()
        self._sync_lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def bootstrap(self) -> None:
        """Load initial snapshot from the repository."""
        table = await _bootstrap(self._repo)
        async with self._lock:
            self._table = table
        logger.info("account directory ready: size={}", table.size)

    async def sync_if_changed(self) -> bool:
        """Apply incremental changes since last revision.

        Returns True if any changes were applied.
        Uses a dedicated sync lock so only one sync runs at a time,
        without blocking the selection lock.
        """
        if self._table is None:
            return False

        async with self._sync_lock:
            async with self._lock:
                table = self._table
            changed = await apply_changes(table, self._repo)
            if changed:
                logger.debug(
                    "account directory synced: revision={} size={}",
                    table.revision,
                    table.size,
                )
            return changed

    # ------------------------------------------------------------------
    # Selection (hot path)
    # ------------------------------------------------------------------

    async def reserve(
        self,
        pool_candidates: tuple[int, ...] | int,
        mode_id: int,
        *,
        exclude_tokens: list[str] | None = None,
        prefer_tags: list[str] | None = None,
        now_s_override: int | None = None,
    ) -> AccountLease | None:
        """Select and reserve the best available account slot.

        ``pool_candidates`` is tried in order; the first pool with an available
        account wins. A plain ``int`` is accepted and wrapped into a tuple.

        Returns an AccountLease, or None if no account is available.
        """
        table = self._table
        if table is None:
            return None

        pools: tuple[int, ...] = (
            (pool_candidates,) if isinstance(pool_candidates, int) else pool_candidates
        )
        ts = now_s_override if now_s_override is not None else now_s()

        # Resolve exclude set (O(n) once, before lock).
        exclude_idxs: frozenset[int] | None = None
        if exclude_tokens:
            idxs = [
                table.idx_by_token[t] for t in exclude_tokens if t in table.idx_by_token
            ]
            if idxs:
                exclude_idxs = frozenset(idxs)

        # Resolve tag preference set.
        prefer_tag_idxs: set[int] | None = None
        if prefer_tags:
            sets = [
                table.tag_idx.get(tag) for tag in prefer_tags if tag in table.tag_idx
            ]
            if sets:
                prefer_tag_idxs = set().union(*sets)

        async with self._lock:
            idx: int | None = None
            for pool_id in pools:
                idx = select(
                    table,
                    pool_id,
                    mode_id,
                    exclude_idxs=exclude_idxs,
                    prefer_tag_idxs=prefer_tag_idxs,
                    now_s=ts,
                )
                if idx is not None:
                    break

            if idx is None:
                return None

            fb.increment_inflight(table, idx)
            fb.update_last_use(table, idx, ts)
            token = table.get_token(idx)
            actual_pool = table.get_pool_id(idx)

        return new_lease(
            idx=idx,
            token=token,
            pool_id=actual_pool,
            mode_id=mode_id,
            selected_at=ts,
        )

    async def release(self, lease: AccountLease) -> None:
        """Decrement inflight counter for a finished request."""
        table = self._table
        if table is None:
            return
        async with self._lock:
            fb.decrement_inflight(table, lease.idx)

    # ------------------------------------------------------------------
    # Feedback (hot path)
    # ------------------------------------------------------------------

    async def feedback(
        self,
        token: str,
        kind: FeedbackKind,
        mode_id: int,
        *,
        remaining: int | None = None,
        reset_at_ms: int | None = None,
        now_s_val: int | None = None,
    ) -> None:
        """Apply upstream response feedback to the account slot."""
        table = self._table
        if table is None:
            return

        idx = table.idx_by_token.get(token)
        if idx is None:
            return

        ts = now_s_val if now_s_val is not None else now_s()

        async with self._lock:
            if kind == FeedbackKind.SUCCESS:
                fb.apply_success(table, idx, mode_id)

            elif kind == FeedbackKind.RATE_LIMITED:
                fb.apply_rate_limited(table, idx, mode_id)
                fb.update_last_fail(table, idx, ts)

            elif kind == FeedbackKind.UNAUTHORIZED:
                fb.apply_auth_failure(table, idx)
                fb.update_last_fail(table, idx, ts)
                fb.apply_status_change(table, idx, int(StatusId.EXPIRED))

            elif kind == FeedbackKind.FORBIDDEN:
                fb.apply_forbidden(table, idx)
                fb.update_last_fail(table, idx, ts)

            elif kind == FeedbackKind.SERVER_ERROR:
                fb.apply_server_error(table, idx)
                fb.update_last_fail(table, idx, ts)

            # Apply authoritative quota data from upstream response headers.
            if remaining is not None and reset_at_ms is not None:
                reset_s = int(reset_at_ms // 1000)
                fb.apply_quota_update(table, idx, mode_id, remaining, reset_s)

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------

    @property
    def size(self) -> int:
        return self._table.size if self._table else 0

    @property
    def revision(self) -> int:
        return self._table.revision if self._table else 0


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_directory: AccountDirectory | None = None


async def get_account_directory(
    repository: AccountRepository | None = None,
) -> AccountDirectory:
    """Return the module-level AccountDirectory, bootstrapping on first call.

    After first initialization, ``repository`` may be omitted.
    """
    global _directory
    if _directory is None:
        if repository is None:
            raise RuntimeError(
                "AccountDirectory not bootstrapped — repository required on first call"
            )
        _directory = AccountDirectory(repository)
        await _directory.bootstrap()
    return _directory


__all__ = ["AccountDirectory", "get_account_directory"]
