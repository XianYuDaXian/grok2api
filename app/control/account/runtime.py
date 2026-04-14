"""Account runtime singletons exposed without importing app.main."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .refresh import AccountRefreshService

_refresh_service: "AccountRefreshService | None" = None


def set_refresh_service(service: "AccountRefreshService | None") -> None:
    """Register the process-global account refresh service."""
    global _refresh_service
    _refresh_service = service


def get_refresh_service() -> "AccountRefreshService | None":
    """Return the registered account refresh service, if any."""
    return _refresh_service


__all__ = ["get_refresh_service", "set_refresh_service"]
