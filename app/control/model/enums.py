"""Control-plane model enumerations."""

from enum import IntEnum, IntFlag


class ModeId(IntEnum):
    """Upstream ``modeId`` parameter values.

    Integer values are stable — used as array indices in the hot path.
    """

    AUTO   = 0  # modeId="auto"
    FAST   = 1  # modeId="fast"
    EXPERT = 2  # modeId="expert"
    HEAVY  = 3  # modeId="heavy"  — only available on heavy-pool accounts

    def to_api_str(self) -> str:
        return self.name.lower()


class Tier(IntEnum):
    """Account tier — determines which pool is selected."""

    BASIC = 0  # pool="basic"
    SUPER = 1  # pool="super"
    HEAVY = 2  # pool="heavy"


class Capability(IntFlag):
    """Bitmask of features a model supports."""

    CHAT       = 1
    IMAGE      = 2
    IMAGE_EDIT = 4
    VIDEO      = 8
    VOICE      = 16
    ASSET      = 32


# Human-readable mode strings in API order.
MODE_STRINGS: dict[ModeId, str] = {
    ModeId.AUTO:   "auto",
    ModeId.FAST:   "fast",
    ModeId.EXPERT: "expert",
    ModeId.HEAVY:  "heavy",
}

ALL_MODES:          tuple[ModeId, ...] = (ModeId.AUTO, ModeId.FAST, ModeId.EXPERT)
ALL_MODES_WITH_HEAVY: tuple[ModeId, ...] = (ModeId.AUTO, ModeId.FAST, ModeId.EXPERT, ModeId.HEAVY)

__all__ = ["ModeId", "Tier", "Capability", "MODE_STRINGS", "ALL_MODES", "ALL_MODES_WITH_HEAVY"]
