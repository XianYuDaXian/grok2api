"""Apply feedback to the runtime table columns (in-place, lock-free inner ops).

The caller (AccountDirectory) is responsible for holding the state lock
before calling these functions.
"""

from ..shared.enums import ALL_MODE_IDS, StatusId
from .table import AccountRuntimeTable

# Health adjustment constants.
_SUCCESS_STEP = 0.12
_AUTH_FACTOR = 0.55
_FORBIDDEN_FACTOR = 0.25
_RATE_LIMIT_FACTOR = 0.45
_SERVER_ERROR_FACTOR = 0.75
_MIN_HEALTH = 0.05
_MAX_HEALTH = 1.0


def apply_success(table: AccountRuntimeTable, idx: int, mode_id: int) -> None:
    """Record a successful call: decrement quota, improve health."""
    quota_col = table._quota_col(mode_id)
    new_q = max(0, int(quota_col[idx]) - 1)
    quota_col[idx] = new_q

    # Recover health.
    h = min(_MAX_HEALTH, float(table.health_by_idx[idx]) + _SUCCESS_STEP)
    table.health_by_idx[idx] = h

    # Remove from availability index if quota exhausted.
    if new_q == 0:
        pool_id = int(table.pool_by_idx[idx])
        bucket = table.mode_available.get((pool_id, mode_id))
        if bucket:
            bucket.discard(idx)


def apply_rate_limited(table: AccountRuntimeTable, idx: int, mode_id: int) -> None:
    """Zero the mode quota and reduce health."""
    table._quota_col(mode_id)[idx] = 0
    _adjust_health(table, idx, _RATE_LIMIT_FACTOR)
    pool_id = int(table.pool_by_idx[idx])
    bucket = table.mode_available.get((pool_id, mode_id))
    if bucket:
        bucket.discard(idx)


def apply_auth_failure(table: AccountRuntimeTable, idx: int) -> None:
    """Reduce health on 401; caller may mark account expired."""
    _adjust_health(table, idx, _AUTH_FACTOR)


def apply_forbidden(table: AccountRuntimeTable, idx: int) -> None:
    """Reduce health heavily on 403."""
    _adjust_health(table, idx, _FORBIDDEN_FACTOR)


def apply_server_error(table: AccountRuntimeTable, idx: int) -> None:
    """Mildly reduce health on 5xx / transport errors."""
    _adjust_health(table, idx, _SERVER_ERROR_FACTOR)


def apply_status_change(
    table: AccountRuntimeTable, idx: int, new_status_id: int
) -> None:
    """Update status column and refresh availability indexes."""
    pool_id = int(table.pool_by_idx[idx])
    old_status = int(table.status_by_idx[idx])

    if old_status == new_status_id:
        return

    table.status_by_idx[idx] = new_status_id

    if new_status_id != int(StatusId.ACTIVE):
        # Remove from all mode availability buckets.
        for mode_id in ALL_MODE_IDS:
            bucket = table.mode_available.get((pool_id, mode_id))
            if bucket:
                bucket.discard(idx)
    else:
        # Re-add to mode buckets where quota > 0.
        for mode_id in ALL_MODE_IDS:
            if int(table._quota_col(mode_id)[idx]) > 0:
                table.mode_available.setdefault((pool_id, mode_id), set()).add(idx)


def apply_quota_update(
    table: AccountRuntimeTable,
    idx: int,
    mode_id: int,
    remaining: int,
    reset_s: int,
) -> None:
    """Update quota and reset timestamp from upstream API data."""
    quota_col = table._quota_col(mode_id)
    reset_col = table._reset_col(mode_id)
    quota_col[idx] = max(0, min(remaining, 32767))
    reset_col[idx] = reset_s

    pool_id = int(table.pool_by_idx[idx])
    if int(table.status_by_idx[idx]) == int(StatusId.ACTIVE):
        bucket = table.mode_available.setdefault((pool_id, mode_id), set())
        if remaining > 0:
            bucket.add(idx)
        else:
            bucket.discard(idx)


def increment_inflight(table: AccountRuntimeTable, idx: int) -> None:
    table.inflight_by_idx[idx] = min(int(table.inflight_by_idx[idx]) + 1, 65535)


def decrement_inflight(table: AccountRuntimeTable, idx: int) -> None:
    table.inflight_by_idx[idx] = max(0, int(table.inflight_by_idx[idx]) - 1)


def update_last_use(table: AccountRuntimeTable, idx: int, now_s: int) -> None:
    table.last_use_at_by_idx[idx] = now_s


def update_last_fail(table: AccountRuntimeTable, idx: int, now_s: int) -> None:
    table.last_fail_at_by_idx[idx] = now_s
    table.fail_count_by_idx[idx] = min(int(table.fail_count_by_idx[idx]) + 1, 65535)


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------


def _adjust_health(table: AccountRuntimeTable, idx: int, factor: float) -> None:
    h = max(_MIN_HEALTH, float(table.health_by_idx[idx]) * factor)
    table.health_by_idx[idx] = h


__all__ = [
    "apply_success",
    "apply_rate_limited",
    "apply_auth_failure",
    "apply_forbidden",
    "apply_server_error",
    "apply_status_change",
    "apply_quota_update",
    "increment_inflight",
    "decrement_inflight",
    "update_last_use",
    "update_last_fail",
]
