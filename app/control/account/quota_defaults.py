"""Default quota windows and pool inference logic.

Canonical quota totals per pool type (from upstream rate-limits API):

              auto    fast    expert    heavy
  basic         20      60       8        —      window: 72000 / 36000 s
  super         50     140      50        —      window: 7200 s
  heavy        150     400     150       20      window: 7200 s

Pool inference uses ``auto.total`` as the primary signal — the three values
(20 / 50 / 150) are mutually exclusive across pool types.
"""

from typing import TYPE_CHECKING

from .enums import QuotaSource
from .models import AccountQuotaSet, QuotaWindow

if TYPE_CHECKING:
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _w(remaining: int, total: int, window_seconds: int) -> QuotaWindow:
    return QuotaWindow(
        remaining      = remaining,
        total          = total,
        window_seconds = window_seconds,
        reset_at       = None,
        synced_at      = None,
        source         = QuotaSource.DEFAULT,
    )


# ---------------------------------------------------------------------------
# Per-pool default quota sets
# ---------------------------------------------------------------------------

BASIC_QUOTA_DEFAULTS = AccountQuotaSet(
    auto   = _w(20,  20,  72_000),   # 20  queries / 20 h
    fast   = _w(60,  60,  72_000),   # 60  queries / 20 h
    expert = _w(8,   8,   36_000),   # 8   queries / 10 h
)

SUPER_QUOTA_DEFAULTS = AccountQuotaSet(
    auto   = _w(50,  50,  7_200),    # 50  queries / 2 h
    fast   = _w(140, 140, 7_200),    # 140 queries / 2 h
    expert = _w(50,  50,  7_200),    # 50  queries / 2 h
)

HEAVY_QUOTA_DEFAULTS = AccountQuotaSet(
    auto   = _w(150, 150, 7_200),    # 150 queries / 2 h
    fast   = _w(400, 400, 7_200),    # 400 queries / 2 h
    expert = _w(150, 150, 7_200),    # 150 queries / 2 h
    heavy  = _w(20,  20,  7_200),    # 20  queries / 2 h
)

# Map pool name → defaults object (used by backends on upsert).
_POOL_DEFAULTS: dict[str, AccountQuotaSet] = {
    "basic": BASIC_QUOTA_DEFAULTS,
    "super": SUPER_QUOTA_DEFAULTS,
    "heavy": HEAVY_QUOTA_DEFAULTS,
}

_SUPPORTED_MODE_IDS_BY_POOL: dict[str, frozenset[int]] = {
    "basic": frozenset((0, 1, 2)),
    "super": frozenset((0, 1, 2)),
    "heavy": frozenset((0, 1, 2, 3)),
}

# ---------------------------------------------------------------------------
# Pool inference — keyed on auto.total (unique across pool types)
# ---------------------------------------------------------------------------

_AUTO_TOTAL_TO_POOL: dict[int, str] = {
    20:  "basic",
    50:  "super",
    150: "heavy",
}


def default_quota_set(pool: str) -> AccountQuotaSet:
    """Return a fresh copy of the default quota set for *pool*."""
    src = _POOL_DEFAULTS.get(pool, BASIC_QUOTA_DEFAULTS)
    qs = AccountQuotaSet(
        auto   = _w(src.auto.remaining,   src.auto.total,   src.auto.window_seconds),
        fast   = _w(src.fast.remaining,   src.fast.total,   src.fast.window_seconds),
        expert = _w(src.expert.remaining, src.expert.total, src.expert.window_seconds),
    )
    if src.heavy is not None:
        qs.heavy = _w(src.heavy.remaining, src.heavy.total, src.heavy.window_seconds)
    return qs


def supports_mode(pool: str, mode_id: int) -> bool:
    """Return whether *pool* has a default quota window for *mode_id*."""
    return mode_id in _SUPPORTED_MODE_IDS_BY_POOL.get(pool, _SUPPORTED_MODE_IDS_BY_POOL["basic"])


def supported_mode_ids(pool: str) -> tuple[int, ...]:
    """Return the supported mode IDs for *pool* in stable request order."""
    supported = _SUPPORTED_MODE_IDS_BY_POOL.get(pool, _SUPPORTED_MODE_IDS_BY_POOL["basic"])
    return tuple(mode_id for mode_id in (0, 1, 2, 3) if mode_id in supported)


def default_quota_window(pool: str, mode_id: int) -> QuotaWindow | None:
    """Return the default quota window for *(pool, mode_id)*, if supported."""
    if not supports_mode(pool, mode_id):
        return None
    return default_quota_set(pool).get(mode_id)


def infer_pool(windows: dict[int, QuotaWindow]) -> str:
    """Infer pool type from live quota windows returned by the rate-limits API.

    Uses ``auto.total`` (mode_id=0) as the discriminating signal.
    Falls back to ``"basic"`` when the value is absent or unrecognised.
    """
    auto_win = windows.get(0)
    if auto_win is None:
        return "basic"
    return _AUTO_TOTAL_TO_POOL.get(auto_win.total, "basic")


__all__ = [
    "BASIC_QUOTA_DEFAULTS",
    "SUPER_QUOTA_DEFAULTS",
    "HEAVY_QUOTA_DEFAULTS",
    "default_quota_set",
    "default_quota_window",
    "infer_pool",
    "supported_mode_ids",
    "supports_mode",
]
