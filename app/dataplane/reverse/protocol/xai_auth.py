"""XAI auth protocol — accept ToS, NSFW controls, birth date.

Each public function handles proxy acquisition, the upstream call, and
proxy feedback, returning a simple result or raising ``UpstreamError``.
"""

import datetime
import random
from typing import TYPE_CHECKING

from app.platform.logging.logger import logger
from app.platform.config.snapshot import get_config
from app.platform.errors import UpstreamError
from app.platform.net.grpc import GrpcClient, GrpcStatus
from app.control.proxy.models import ProxyFeedback, ProxyFeedbackKind, ProxyScope, RequestKind
from app.dataplane.proxy import get_proxy_runtime
from app.dataplane.proxy.adapters.session import ResettableSession, build_session_kwargs
from app.dataplane.reverse.transport.grpc_web import post_grpc_web
from app.dataplane.reverse.transport.http import post_json

if TYPE_CHECKING:
    pass

# ------------------------------------------------------------------
# Endpoint URLs
# ------------------------------------------------------------------

ACCEPT_TOS_URL = "https://accounts.x.ai/auth_mgmt.AuthManagement/SetTosAcceptedVersion"
NSFW_MGMT_URL  = "https://grok.com/auth_mgmt.AuthManagement/UpdateUserFeatureControls"
SET_BIRTH_URL  = "https://grok.com/rest/auth/set-birth-date"

# ------------------------------------------------------------------
# Payload builders
# ------------------------------------------------------------------

def build_accept_tos_payload() -> bytes:
    """gRPC-Web payload for SetTosAcceptedVersion (proto field 2 = true)."""
    return GrpcClient.encode_payload(b"\x10\x01")


def build_nsfw_mgmt_payload(enabled: bool = True) -> bytes:
    """gRPC-Web payload that sets always_show_nsfw_content to *enabled*."""
    name     = b"always_show_nsfw_content"
    inner    = b"\x0a" + bytes([len(name)]) + name
    protobuf = b"\x0a\x02\x10" + (b"\x01" if enabled else b"\x00") + b"\x12" + bytes([len(inner)]) + inner
    return GrpcClient.encode_payload(protobuf)


def build_set_birth_payload() -> dict:
    """JSON payload for /rest/auth/set-birth-date with a random adult birth date."""
    today         = datetime.date.today()
    birth_year    = today.year - random.randint(20, 48)
    birth_month   = random.randint(1, 12)
    birth_day     = random.randint(1, 28)
    hour          = random.randint(0, 23)
    minute        = random.randint(0, 59)
    second        = random.randint(0, 59)
    microsecond   = random.randint(0, 999)
    return {
        "birthDate": (
            f"{birth_year:04d}-{birth_month:02d}-{birth_day:02d}"
            f"T{hour:02d}:{minute:02d}:{second:02d}.{microsecond:03d}Z"
        )
    }

# ------------------------------------------------------------------
# Transport helpers (manage proxy lifecycle internally)
# ------------------------------------------------------------------

async def _grpc_call(
    url:     str,
    token:   str,
    payload: bytes,
    *,
    label:   str,
    origin:  str = "https://grok.com",
    referer: str = "https://grok.com/",
    session: ResettableSession | None = None,
    lease=None,
) -> GrpcStatus:
    """POST a gRPC-Web frame and parse the status.

    When *session* and *lease* are both provided the caller manages the proxy
    lifecycle (no acquire / feedback is done here).  This allows multiple calls
    to share one TCP connection and one proxy lease, avoiding repeated TLS
    handshakes.

    When called without *session* / *lease* (the default) the function acquires
    its own lease and manages proxy feedback, preserving the original behaviour.
    """
    cfg       = get_config()
    timeout_s = cfg.get_float("nsfw.timeout", 30.0)
    shared    = session is not None and lease is not None

    if not shared:
        proxy = await get_proxy_runtime()
        lease = await proxy.acquire(scope=ProxyScope.APP, kind=RequestKind.HTTP)

    try:
        _, trailers = await post_grpc_web(
            url, token, payload,
            lease=lease, timeout_s=timeout_s, origin=origin, referer=referer,
            session=session,
        )
    except UpstreamError as exc:
        if not shared:
            await proxy.feedback(lease, ProxyFeedback(
                kind=ProxyFeedbackKind.UPSTREAM_5XX if (exc.status or 0) >= 500
                     else ProxyFeedbackKind.FORBIDDEN,
                status_code=exc.status or 502,
            ))
        raise
    except Exception as exc:
        if not shared:
            await proxy.feedback(lease, ProxyFeedback(kind=ProxyFeedbackKind.TRANSPORT_ERROR))
        raise UpstreamError(f"{label}: transport error: {exc}") from exc

    status = GrpcClient.get_status(trailers)
    if status.ok or status.code == -1:
        if not shared:
            await proxy.feedback(lease, ProxyFeedback(kind=ProxyFeedbackKind.SUCCESS, status_code=200))
        logger.debug("auth grpc call completed: label={} grpc_code={}", label, status.code)
    else:
        if not shared:
            await proxy.feedback(lease, ProxyFeedback(kind=ProxyFeedbackKind.UPSTREAM_5XX, status_code=status.http_equiv))
        raise UpstreamError(
            f"{label}: gRPC error code={status.code} message={status.message!r}",
            status=status.http_equiv,
        )

    return status


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------

async def accept_tos(token: str) -> GrpcStatus:
    """Accept the ToS for *token* via gRPC-Web."""
    return await _grpc_call(
        ACCEPT_TOS_URL,
        token,
        build_accept_tos_payload(),
        label   = "accept_tos",
        origin  = "https://accounts.x.ai",
        referer = "https://accounts.x.ai/accept-tos",
    )


async def set_nsfw(token: str, enabled: bool) -> GrpcStatus:
    """Set always_show_nsfw_content for *token* via gRPC-Web."""
    return await _grpc_call(
        NSFW_MGMT_URL,
        token,
        build_nsfw_mgmt_payload(enabled),
        label   = "enable_nsfw" if enabled else "disable_nsfw",
        origin  = "https://grok.com",
        referer = "https://grok.com/?_s=data",
    )


async def enable_nsfw(token: str) -> GrpcStatus:
    """Enable always_show_nsfw_content for *token* via gRPC-Web."""
    return await set_nsfw(token, True)


async def disable_nsfw(token: str) -> GrpcStatus:
    """Disable always_show_nsfw_content for *token* via gRPC-Web."""
    return await set_nsfw(token, False)


async def set_birth_date(
    token:   str,
    session: ResettableSession | None = None,
    lease=None,
) -> dict:
    """Post a random adult birth date for *token* via REST.

    Accepts optional *session* / *lease* for connection reuse (see ``_grpc_call``).
    """
    import orjson

    cfg       = get_config()
    timeout_s = cfg.get_float("nsfw.timeout", 30.0)
    shared    = session is not None and lease is not None

    if not shared:
        proxy = await get_proxy_runtime()
        lease = await proxy.acquire(scope=ProxyScope.APP, kind=RequestKind.HTTP)

    payload = orjson.dumps(build_set_birth_payload())
    try:
        result = await post_json(
            SET_BIRTH_URL, token, payload,
            lease=lease, timeout_s=timeout_s,
            origin="https://grok.com", referer="https://grok.com/?_s=data",
            session=session,
        )
    except UpstreamError as exc:
        if not shared:
            await proxy.feedback(lease, ProxyFeedback(
                kind=ProxyFeedbackKind.UPSTREAM_5XX if (exc.status or 0) >= 500
                     else ProxyFeedbackKind.FORBIDDEN,
                status_code=exc.status or 502,
            ))
        raise
    except Exception as exc:
        if not shared:
            await proxy.feedback(lease, ProxyFeedback(kind=ProxyFeedbackKind.TRANSPORT_ERROR))
        raise UpstreamError(f"set_birth_date: transport error: {exc}") from exc

    if not shared:
        await proxy.feedback(lease, ProxyFeedback(kind=ProxyFeedbackKind.SUCCESS, status_code=200))
    logger.debug("auth birth date update completed")
    return result


async def nsfw_sequence(token: str) -> None:
    """Run set_birth_date → enable_nsfw sharing one session + lease.

    Compared to calling the two functions individually this saves one TCP+TLS
    handshake per token, which matters in high-concurrency batch scenarios.
    """
    cfg       = get_config()
    timeout_s = cfg.get_float("nsfw.timeout", 30.0)

    proxy = await get_proxy_runtime()
    lease = await proxy.acquire(scope=ProxyScope.APP, kind=RequestKind.HTTP)

    kwargs = build_session_kwargs(lease=lease)
    try:
        async with ResettableSession(**kwargs) as session:
            await set_birth_date(token, session=session, lease=lease)
            await _grpc_call(
                NSFW_MGMT_URL, token, build_nsfw_mgmt_payload(),
                label="enable_nsfw", origin="https://grok.com", referer="https://grok.com/?_s=data",
                session=session, lease=lease,
            )
        await proxy.feedback(lease, ProxyFeedback(kind=ProxyFeedbackKind.SUCCESS, status_code=200))
        logger.debug("auth nsfw sequence completed: token={}...", token[:8])
    except UpstreamError as exc:
        await proxy.feedback(lease, ProxyFeedback(
            kind=ProxyFeedbackKind.UPSTREAM_5XX if (exc.status or 0) >= 500
                 else ProxyFeedbackKind.FORBIDDEN,
            status_code=exc.status or 502,
        ))
        raise
    except Exception as exc:
        await proxy.feedback(lease, ProxyFeedback(kind=ProxyFeedbackKind.TRANSPORT_ERROR))
        raise UpstreamError(f"nsfw_sequence: transport error: {exc}") from exc


__all__ = [
    "ACCEPT_TOS_URL", "NSFW_MGMT_URL", "SET_BIRTH_URL",
    "build_accept_tos_payload", "build_nsfw_mgmt_payload", "build_set_birth_payload",
    "accept_tos", "set_nsfw", "enable_nsfw", "disable_nsfw", "set_birth_date", "nsfw_sequence",
]
