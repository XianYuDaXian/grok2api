"""Manual clearance provider — uses operator-supplied cookies directly."""

from app.platform.config.snapshot import get_config
from ..models import ClearanceBundle, ClearanceMode


class ManualClearanceProvider:
    """Build a ClearanceBundle from static config values."""

    def build_bundle(self, *, affinity_key: str) -> ClearanceBundle | None:
        cfg = get_config()
        mode = ClearanceMode.parse(cfg.get_str("proxy.clearance.mode", "none"))
        if mode != ClearanceMode.MANUAL:
            return None
        return ClearanceBundle(
            bundle_id    = f"manual:{affinity_key}",
            cf_cookies   = cfg.get_str("proxy.clearance.cf_cookies", ""),
            user_agent   = cfg.get_str("proxy.clearance.user_agent", ""),
            affinity_key = affinity_key,
        )


__all__ = ["ManualClearanceProvider"]
