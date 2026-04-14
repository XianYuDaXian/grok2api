"""Dataplane-local integer enumerations for hot-path array indexing.

These mirror the control-plane enums but use IntEnum exclusively so they
can be used directly as array indices with zero overhead.
"""

from enum import IntEnum


class ModeId(IntEnum):
    AUTO   = 0
    FAST   = 1
    EXPERT = 2
    HEAVY  = 3


class PoolId(IntEnum):
    BASIC = 0
    SUPER = 1
    HEAVY = 2


class StatusId(IntEnum):
    ACTIVE   = 0
    COOLING  = 1
    EXPIRED  = 2
    DISABLED = 3
    DELETED  = 4


# Map pool string → PoolId integer (used during sync from control plane).
POOL_STR_TO_ID: dict[str, int] = {
    "basic": int(PoolId.BASIC),
    "super": int(PoolId.SUPER),
    "heavy": int(PoolId.HEAVY),
}

STATUS_STR_TO_ID: dict[str, int] = {
    "active":   int(StatusId.ACTIVE),
    "cooling":  int(StatusId.COOLING),
    "expired":  int(StatusId.EXPIRED),
    "disabled": int(StatusId.DISABLED),
}

ALL_MODE_IDS: tuple[int, ...] = (
    int(ModeId.AUTO),
    int(ModeId.FAST),
    int(ModeId.EXPERT),
    int(ModeId.HEAVY),
)

__all__ = [
    "ModeId", "PoolId", "StatusId",
    "POOL_STR_TO_ID", "STATUS_STR_TO_ID", "ALL_MODE_IDS",
]
