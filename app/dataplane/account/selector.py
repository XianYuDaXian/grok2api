"""Hot-path account selector — pure function, no object allocation.

All scoring operates on typed ``array.array`` columns; no attribute lookup
overhead.  The caller provides the frozen set of excluded indices and
pre-resolved tag index set.
"""

from ..shared.enums import PoolId, StatusId
from .table import AccountRuntimeTable

# Scoring weights — tuned for throughput/fairness balance.
_W_HEALTH  = 100.0
_W_QUOTA   = 25.0
_W_RECENT  = 15.0     # penalty for recently used accounts
_W_INFLIGHT = 20.0
_W_FAIL    = 4.0
_RECENT_WINDOW_S = 15  # seconds


def select(
    table: AccountRuntimeTable,
    pool_id: int,
    mode_id: int,
    *,
    exclude_idxs: frozenset[int] | None = None,
    prefer_tag_idxs: set[int] | None    = None,
    now_s: int,
) -> int | None:
    """Select the best available account slot index.

    Returns the slot index on success, ``None`` if no account is available.
    Does **not** mutate any table state — callers must increment inflight.
    """
    candidates: set[int] | None = table.mode_available.get((pool_id, mode_id))
    if not candidates:
        return None

    # Apply window-expiry resets for basic accounts inline.
    reset_col = table._reset_col(mode_id)
    quota_col = table._quota_col(mode_id)
    _maybe_reset_windows(table, candidates, mode_id, reset_col, quota_col, pool_id, now_s)

    working: set[int] = candidates.copy()
    if exclude_idxs:
        working -= exclude_idxs
    if not working:
        return None

    # Prefer tagged subset; fall back to full set if empty.
    if prefer_tag_idxs:
        preferred = working & prefer_tag_idxs
        working = preferred if preferred else working

    return _best(table, working, mode_id, quota_col, now_s)


def _maybe_reset_windows(
    table:     AccountRuntimeTable,
    candidates: set[int],
    mode_id:   int,
    reset_col: "array.array",
    quota_col: "array.array",
    pool_id:   int,
    now_s:     int,
) -> None:
    """Reset expired windows for basic-pool accounts (no API call required).

    Only applies to the basic pool — super/heavy quotas are managed exclusively
    by the periodic refresh service and must not be reset inline.
    """
    if pool_id != int(PoolId.BASIC):
        return

    from app.control.account.quota_defaults import default_quota_window

    defaults = default_quota_window("basic", mode_id)
    if defaults is None:
        return
    add_back: list[int] = []

    for idx in list(candidates):
        r = reset_col[idx]
        if r == 0 or now_s < r:
            continue
        if int(table.pool_by_idx[idx]) != pool_id:
            continue
        # Window expired — restore default quota.
        new_total = defaults.total
        quota_col[idx] = new_total
        reset_col[idx] = now_s + defaults.window_seconds
        add_back.append(idx)

    # Re-add to the availability index (may have been removed when quota hit 0).
    bucket = table.mode_available.get((pool_id, mode_id))
    if bucket is not None:
        bucket.update(add_back)


def _best(
    table:     AccountRuntimeTable,
    working:   set[int],
    mode_id:   int,
    quota_col: "array.array",
    now_s:     int,
) -> int:
    """Return the index of the highest-scoring candidate."""
    best_idx   = -1
    best_score = -1e18

    health_col   = table.health_by_idx
    inflight_col = table.inflight_by_idx
    fail_col     = table.fail_count_by_idx
    last_use_col = table.last_use_at_by_idx

    for idx in working:
        quota    = int(quota_col[idx])
        health   = float(health_col[idx])
        inflight = int(inflight_col[idx])
        fails    = min(int(fail_col[idx]), 10)
        last_use = int(last_use_col[idx])

        score = (
            health   * _W_HEALTH
            + quota  * _W_QUOTA
            - inflight * _W_INFLIGHT
            - fails  * _W_FAIL
        )
        if last_use > 0:
            age_s = now_s - last_use
            if age_s < _RECENT_WINDOW_S:
                score -= (1.0 - age_s / _RECENT_WINDOW_S) * _W_RECENT

        if score > best_score:
            best_score = score
            best_idx   = idx

    return best_idx


__all__ = ["select"]
