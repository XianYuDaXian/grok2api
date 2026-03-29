"""
Retry helpers for token switching.
"""

from typing import Optional, Set

from app.core.config import get_config
from app.core.exceptions import UpstreamException
from app.services.grok.services.model import ModelService


TOKEN_CONFIRMED_INVALID_STATUS_CODES = {401}
TOKEN_PROBATIONARY_INVALID_STATUS_CODES = {400}
TOKEN_COOLING_STATUS_CODES = {429}


def configured_retry_status_codes() -> set[int]:
    raw = get_config("retry.retry_status_codes") or [401, 429, 403]
    if isinstance(raw, int):
        raw = [raw]
    result: set[int] = set()
    for code in raw or []:
        try:
            result.add(int(code))
        except Exception:
            continue
    return result


async def pick_token(
    token_mgr,
    model_id: str,
    tried: Set[str],
    preferred: Optional[str] = None,
) -> Optional[str]:
    if preferred and preferred not in tried:
        return preferred

    token = None
    for pool_name in ModelService.pool_candidates_for_model(model_id):
        token = token_mgr.get_token(pool_name, exclude=tried)
        if token:
            break

    if not token and not tried:
        result = await token_mgr.refresh_cooling_tokens()
        if result.get("recovered", 0) > 0:
            for pool_name in ModelService.pool_candidates_for_model(model_id):
                token = token_mgr.get_token(pool_name)
                if token:
                    break

    return token


def upstream_status(error: Exception) -> Optional[int]:
    if not isinstance(error, UpstreamException):
        return None
    status = error.details.get("status") if error.details else None
    if status is None:
        status = getattr(error, "status_code", None)
    try:
        return int(status) if status is not None else None
    except Exception:
        return None


def token_invalid(error: Exception) -> bool:
    return upstream_status(error) in TOKEN_CONFIRMED_INVALID_STATUS_CODES


def token_probationary_invalid(error: Exception) -> bool:
    return upstream_status(error) in TOKEN_PROBATIONARY_INVALID_STATUS_CODES


def rate_limited(error: Exception) -> bool:
    if not isinstance(error, UpstreamException):
        return False
    status = upstream_status(error)
    code = error.details.get("error_code") if error.details else None
    return status in TOKEN_COOLING_STATUS_CODES or code == "rate_limit_exceeded"


async def handle_token_retryable_error(token_mgr, token: str, error: Exception, reason: str) -> bool:
    status = upstream_status(error)
    retry_codes = configured_retry_status_codes()

    if status in TOKEN_CONFIRMED_INVALID_STATUS_CODES:
        await token_mgr.mark_invalid(token, reason)
        return status in retry_codes

    if status in TOKEN_PROBATIONARY_INVALID_STATUS_CODES:
        return status in retry_codes

    if status in TOKEN_COOLING_STATUS_CODES or rate_limited(error):
        await token_mgr.mark_rate_limited(token)
        return status in retry_codes if status is not None else 429 in retry_codes

    return status in retry_codes


async def confirm_token_invalid_after_fallback_success(
    token_mgr,
    token: str,
    error: Exception,
    reason: str,
) -> None:
    if token_probationary_invalid(error):
        await token_mgr.mark_invalid(token, reason)


__all__ = [
    "pick_token",
    "configured_retry_status_codes",
    "rate_limited",
    "token_invalid",
    "token_probationary_invalid",
    "upstream_status",
    "handle_token_retryable_error",
    "confirm_token_invalid_after_fallback_success",
    "TOKEN_CONFIRMED_INVALID_STATUS_CODES",
    "TOKEN_PROBATIONARY_INVALID_STATUS_CODES",
    "TOKEN_COOLING_STATUS_CODES",
]
