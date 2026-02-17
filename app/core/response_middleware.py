"""
响应中间件
Response Middleware

用于记录请求日志、生成 TraceID 和计算请求耗时
"""

import time
import uuid
import json
from typing import Any
from urllib.parse import parse_qs
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.logger import logger


SENSITIVE_KEYS = {
    "authorization",
    "api_key",
    "app_key",
    "public_key",
    "token",
    "tokens",
    "password",
    "cookie",
}


def _short_text(value: Any, max_len: int = 240) -> Any:
    if not isinstance(value, str):
        return value
    text = value.strip()
    if len(text) <= max_len:
        return text
    return f"{text[:max_len]}...(len={len(text)})"


def _sanitize_payload(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return "..."
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            k = str(key)
            if k.lower() in SENSITIVE_KEYS:
                result[k] = "<redacted>"
            else:
                result[k] = _sanitize_payload(item, depth + 1)
        return result
    if isinstance(value, list):
        if len(value) > 20:
            return [_sanitize_payload(v, depth + 1) for v in value[:20]] + [f"...(len={len(value)})"]
        return [_sanitize_payload(v, depth + 1) for v in value]
    if isinstance(value, str):
        return _short_text(value)
    return value


async def _extract_request_payload(request: Request) -> dict[str, Any]:
    query_data = {k: v if len(v) > 1 else v[0] for k, v in parse_qs(request.url.query, keep_blank_values=True).items()}
    payload: dict[str, Any] = {"query": _sanitize_payload(query_data)}

    if request.method in ("GET", "HEAD", "OPTIONS"):
        return payload

    content_type = (request.headers.get("content-type") or "").lower()
    raw = await request.body()
    if not raw:
        payload["body"] = None
        return payload

    if "application/json" in content_type:
        try:
            payload["body"] = _sanitize_payload(json.loads(raw.decode("utf-8", errors="ignore")))
            return payload
        except Exception:
            payload["body"] = _short_text(raw.decode("utf-8", errors="ignore"))
            return payload

    if "application/x-www-form-urlencoded" in content_type:
        form = parse_qs(raw.decode("utf-8", errors="ignore"), keep_blank_values=True)
        payload["body"] = _sanitize_payload({k: v if len(v) > 1 else v[0] for k, v in form.items()})
        return payload

    if "multipart/form-data" in content_type:
        payload["body"] = {
            "_type": "multipart/form-data",
            "_size": len(raw),
            "_preview": _short_text(raw[:400].decode("utf-8", errors="ignore")),
        }
        return payload

    payload["body"] = {
        "_type": content_type or "unknown",
        "_size": len(raw),
        "_preview": _short_text(raw[:400].decode("utf-8", errors="ignore")),
    }
    return payload


class ResponseLoggerMiddleware(BaseHTTPMiddleware):
    """
    请求日志/响应追踪中间件
    Request Logging and Response Tracking Middleware
    """

    async def dispatch(self, request: Request, call_next):
        # 生成请求 ID
        trace_id = str(uuid.uuid4())
        request.state.trace_id = trace_id

        start_time = time.time()
        path = request.url.path

        if path.startswith("/static/") or path in (
            "/",
            "/login",
            "/imagine",
            "/voice",
            "/admin",
            "/admin/login",
            "/admin/config",
            "/admin/cache",
            "/admin/token",
        ):
            return await call_next(request)

        # 记录请求信息
        req_payload = await _extract_request_payload(request)
        logger.info(
            "Request: {} {} payload={}",
            request.method,
            request.url.path,
            req_payload,
            extra={
                "traceID": trace_id,
                "method": request.method,
                "path": request.url.path,
                "payload": req_payload,
            },
        )

        try:
            response = await call_next(request)

            # 计算耗时
            duration = (time.time() - start_time) * 1000

            # 记录响应信息
            logger.info(
                f"Response: {request.method} {request.url.path} - {response.status_code} ({duration:.2f}ms)",
                extra={
                    "traceID": trace_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": round(duration, 2),
                },
            )

            return response

        except Exception as e:
            duration = (time.time() - start_time) * 1000
            logger.error(
                f"Response Error: {request.method} {request.url.path} - {str(e)} ({duration:.2f}ms)",
                extra={
                    "traceID": trace_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round(duration, 2),
                    "error": str(e),
                },
            )
            raise e
