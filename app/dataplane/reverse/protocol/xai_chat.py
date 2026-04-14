"""XAI app-chat protocol — payload builder and SSE stream adapter."""

import re
from dataclasses import dataclass
from typing import Any

import orjson

from app.platform.logging.logger import logger
from app.platform.config.snapshot import get_config
from app.control.model.enums import ModeId, MODE_STRINGS
from app.dataplane.reverse.protocol.xai_chat_reasoning import ReasoningAggregator


def build_chat_payload(
    *,
    message:               str,
    mode_id:               ModeId,
    file_attachments:      list[str]        = (),
    tool_overrides:        dict[str, Any]   | None = None,
    model_config_override: dict[str, Any]   | None = None,
    request_overrides:     dict[str, Any]   | None = None,
) -> dict[str, Any]:
    """Build the JSON payload for POST /rest/app-chat/conversations/new."""
    cfg = get_config()

    payload: dict[str, Any] = {
        "collectionIds":               [],
        "connectors":                  [],
        "deviceEnvInfo": {
            "darkModeEnabled":  False,
            "devicePixelRatio": 2,
            "screenHeight":     1329,
            "screenWidth":      2056,
            "viewportHeight":   1083,
            "viewportWidth":    2056,
        },
        "disableMemory":               not cfg.get_bool("features.memory", False),
        "disableSearch":               False,
        "disableSelfHarmShortCircuit": False,
        "disableTextFollowUps":        False,
        "enableImageGeneration":       True,
        "enableImageStreaming":        True,
        "enableSideBySide":            True,
        "fileAttachments":             list(file_attachments),
        "forceConcise":                False,
        "forceSideBySide":             False,
        "imageAttachments":            [],
        "imageGenerationCount":        2,
        "isAsyncChat":                 False,
        "message":                     message,
        "modeId":                      MODE_STRINGS[mode_id],
        "responseMetadata":            {},
        "returnImageBytes":            False,
        "returnRawGrokInXaiRequest":   False,
        "searchAllConnectors":         False,
        "sendFinalMetadata":           True,
        "temporary":                   cfg.get_bool("features.temporary", True),
        "toolOverrides": tool_overrides or {
            "gmailSearch":           False,
            "googleCalendarSearch":  False,
            "outlookSearch":         False,
            "outlookCalendarSearch": False,
            "googleDriveSearch":     False,
        },
    }

    custom = cfg.get_str("features.custom_instruction", "").strip()
    if custom:
        payload["customPersonality"] = custom

    if model_config_override:
        payload["responseMetadata"]["modelConfigOverride"] = model_config_override

    if request_overrides:
        payload.update({k: v for k, v in request_overrides.items() if v is not None})

    logger.debug(
        "chat payload built: mode={} message_len={} file_count={}",
        MODE_STRINGS[mode_id], len(message), len(file_attachments),
    )
    return payload


# ---------------------------------------------------------------------------
# SSE line classification (unchanged)
# ---------------------------------------------------------------------------


def classify_line(line: str | bytes) -> tuple[str, str]:
    """Return (event_type, data) for a raw SSE line.

    event_type: 'data' | 'done' | 'skip'

    Handles both standard SSE ``data: {...}`` lines and raw JSON lines
    (upstream sometimes omits the ``data:`` prefix).
    """
    if isinstance(line, bytes):
        line = line.decode("utf-8", "replace")
    line = line.strip()
    if not line:
        return "skip", ""
    if line.startswith("data:"):
        data = line[5:].strip()
        if data == "[DONE]":
            return "done", ""
        return "data", data
    if line.startswith("event:"):
        return "skip", ""
    # Raw JSON line (no "data:" prefix) — treat as data.
    if line.startswith("{"):
        return "data", line
    return "skip", ""


# ---------------------------------------------------------------------------
# FrameEvent — single output event from StreamAdapter.feed()
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class FrameEvent:
    """One parsed event produced by StreamAdapter."""

    kind: str
    """Event kind:
    - ``text``      — cleaned final text token  (content = token string)
    - ``thinking``  — Grok main-model thinking   (content = raw token)
    - ``image``     — generated image final URL   (content = full URL, image_id = upstream UUID)
    - ``image_progress`` — generated image progress (content = percent string, image_id = upstream UUID)
    - ``soft_stop`` — stream end signal
    - ``skip``      — filtered frame, do nothing
    """
    content: str = ""
    image_id: str = ""
    rollout_id: str = ""
    message_tag: str = ""
    message_step_id: int | None = None


# ---------------------------------------------------------------------------
# StreamAdapter — stateful SSE frame parser
# ---------------------------------------------------------------------------

_GROK_RENDER_RE = re.compile(
    r'<grok:render\s+card_id="([^"]+)"\s+card_type="([^"]+)"\s+type="([^"]+)"'
    r'[^>]*>.*?</grok:render>',
    re.DOTALL,
)

_IMAGE_BASE = "https://assets.grok.com/"

# 工具使用卡片 → emoji 单行格式化映射（详细模式专用）
# 格式: tool_name → (emoji, (可展示的参数 key 列表))
_TOOL_FMT: dict[str, tuple[str, tuple[str, ...]]] = {
    "web_search":          ("🔍", ("query", "q")),
    "x_search":            ("🔍", ("query",)),
    "x_keyword_search":    ("🔍", ("query",)),
    "x_semantic_search":   ("🔍", ("query",)),
    "browse_page":         ("🌐", ("url",)),
    "search_images":       ("🖼️", ("image_description", "imageDescription")),
    "image_search":        ("🖼️", ("image_description", "imageDescription")),
    "chatroom_send":       ("📋", ("message",)),
    "code_execution":      ("💻", ()),
}


class StreamAdapter:
    """Parse upstream SSE frames and emit :class:`FrameEvent` objects.

    One instance per HTTP request.  Call :meth:`feed` for every ``data:``
    line; iterate over the returned list of events.
    """

    __slots__ = (
        "_card_cache",
        "_citation_order",
        "_citation_map",
        "_last_citation_index",
        "_emitted_reasoning_keys",
        "_reasoning",
        "_summary_mode",
        "_last_rollout",
        "_content_started",
        "thinking_buf",
        "text_buf",
        "image_urls",
    )

    def __init__(self) -> None:
        self._card_cache: dict[str, dict] = {}
        self._citation_order: list[str] = []
        self._citation_map: dict[str, int] = {}
        self._last_citation_index: int = -1
        self._emitted_reasoning_keys: set[str] = set()
        # 思维链模式：精简摘要 / 详细原始流
        self._summary_mode: bool = get_config().get_bool("features.thinking_summary", False)
        self._last_rollout: str = ""
        self._content_started: bool = False
        self._reasoning = ReasoningAggregator() if self._summary_mode else None
        self.thinking_buf: list[str] = []
        self.text_buf: list[str] = []
        self.image_urls: list[tuple[str, str]] = []   # [(url, imageUuid), ...]

    # 引用已内联为 [[N]](url) 格式，无需末尾附录
    def references_suffix(self) -> str:
        """No-op — citations are now inlined as ``[[N]](url)`` markdown links."""
        return ""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def feed(self, data: str) -> list[FrameEvent]:
        """Parse one JSON ``data:`` payload; return 0-N events."""
        try:
            obj = orjson.loads(data)
        except (orjson.JSONDecodeError, ValueError, TypeError):
            return []

        result = obj.get("result")
        if not result:
            return []
        resp = result.get("response")
        if not resp:
            return []

        events: list[FrameEvent] = []

        # ── cache every cardAttachment first ──────────────────────
        card_raw = resp.get("cardAttachment")
        if card_raw:
            events.extend(self._handle_card(card_raw))

        token   = resp.get("token")
        think   = resp.get("isThinking")
        tag     = resp.get("messageTag")
        rollout = resp.get("rolloutId")
        step_id = resp.get("messageStepId")

        if tag == "tool_usage_card":
            # 正文已开始后的迟到 tool card：静默丢弃
            if self._content_started:
                return events
            if self._summary_mode:
                # 精简模式：走 ReasoningAggregator 提炼摘要
                for line in self._summarize_tool_usage_summary(
                    resp, rollout=rollout, step_id=step_id,
                ):
                    self._append_reasoning(
                        events, line,
                        rollout=rollout, tag=tag, step_id=step_id,
                    )
            else:
                # 详细模式：格式化为 emoji 单行（含 Agent 身份）
                line = self._format_tool_card(resp, rollout=rollout)
                if line:
                    # 同步 Agent 标识，确保后续 Grok summary 能正确插前缀
                    if rollout:
                        self._last_rollout = rollout
                    self._append_reasoning(
                        events, line,
                        rollout=rollout, tag=tag, step_id=step_id,
                    )
            return events   # card events (if any) already added

        # ── raw_function_result ───────────────────────────────────
        if tag == "raw_function_result":
            return events

        # ── toolUsageCardId-only follow-up frame ──────────────────
        if resp.get("toolUsageCardId") and not resp.get("webSearchResults") and not resp.get("codeExecutionResult"):
            return events

        # ── 思维链 token 处理 ──────────────────────────────────────
        if token is not None and think is True:
            # 正文已开始后的迟到 thinking：写入 buf（非流式可用）但不发事件（流式不显示）
            if self._content_started:
                raw = str(token).strip()
                if raw:
                    formatted = raw if raw.endswith("\n") else raw + "\n"
                    self.thinking_buf.append(formatted)
                return events
            if self._summary_mode:
                # 精简模式：走 ReasoningAggregator 提炼摘要
                for line in self._reasoning.on_thinking(
                    str(token), tag=tag, rollout=rollout,
                    step_id=step_id if isinstance(step_id, int) else None,
                ):
                    self._append_reasoning(
                        events, line,
                        rollout=rollout, tag=tag, step_id=step_id,
                    )
            else:
                # 详细模式：Agent 切换时插入身份前缀，原始 token 直接透传
                raw = str(token)
                # 去掉 Grok summary 自带的 "- " 前缀，避免触发 markdown 列表缩进
                if raw.startswith("- "):
                    raw = raw[2:]
                if not raw:
                    return events
                agent = rollout or ""
                if agent and agent != self._last_rollout:
                    self._last_rollout = agent
                    # Agent 切换标识：绕过去重，直接写 buf + 发 event（同一 Agent 可多次出现）
                    header = f"\n[{agent}]\n"
                    self.thinking_buf.append(header)
                    events.append(FrameEvent(
                        "thinking", header, rollout_id=agent,
                    ))
                self._append_reasoning(
                    events, raw,
                    rollout=rollout, tag=tag, step_id=step_id,
                )
            return events

        # ── final text token (needs cleaning) ─────────────────────
        if token is not None and think is not True and tag == "final":
            self._content_started = True
            cleaned = self._clean_token(token)
            if cleaned:
                self.text_buf.append(cleaned)
                events.append(FrameEvent("text", cleaned))
            return events

        # ── end signals ───────────────────────────────────────────
        if resp.get("isSoftStop"):
            self._flush_pending_reasoning(events)
            events.append(FrameEvent("soft_stop"))
            return events

        if resp.get("finalMetadata"):
            self._flush_pending_reasoning(events)
            events.append(FrameEvent("soft_stop"))
            return events

        return events

    # ------------------------------------------------------------------
    # Card attachment handling
    # ------------------------------------------------------------------

    def _handle_card(self, card_raw: dict) -> list[FrameEvent]:
        """Cache card data; emit image event on progress=100."""
        try:
            jd = orjson.loads(card_raw["jsonData"])
        except (orjson.JSONDecodeError, ValueError, TypeError, KeyError):
            return []

        card_id = jd.get("id", "")
        self._card_cache[card_id] = jd

        chunk = jd.get("image_chunk")
        if chunk:
            progress = chunk.get("progress")
            uuid = chunk.get("imageUuid", "")
            events: list[FrameEvent] = []
            try:
                if progress is not None:
                    events.append(FrameEvent("image_progress", str(int(progress)), uuid))
            except (TypeError, ValueError):
                pass
            if chunk.get("progress") == 100 and not chunk.get("moderated"):
                url = _IMAGE_BASE + chunk["imageUrl"]
                self.image_urls.append((url, uuid))
                events.append(FrameEvent("image", url, uuid))
            return events

        return []

    # ------------------------------------------------------------------
    # Token cleaning — <grok:render> → markdown
    # ------------------------------------------------------------------

    def _clean_token(self, token: str) -> str:
        if "<grok:render" not in token:
            return token
        cleaned = _GROK_RENDER_RE.sub(self._render_replace, token)
        # 去除引用标签替换后残留的独占空白行（如 "\n [[1]](...)" → " [[1]](...)"）
        return cleaned.lstrip("\n") if cleaned.startswith("\n") and "[[" in cleaned else cleaned

    def _render_replace(self, m: re.Match) -> str:
        card_id     = m.group(1)
        render_type = m.group(3)
        card = self._card_cache.get(card_id)
        if not card:
            return ""

        if render_type == "render_searched_image":
            img   = card.get("image", {})
            title = img.get("title", "image")
            thumb = img.get("thumbnail") or img.get("original", "")
            link  = img.get("link", "")
            if link:
                return f"[![{title}]({thumb})]({link})"
            return f"![{title}]({thumb})"

        if render_type == "render_generated_image":
            return ""   # actual URL emitted by progress=100 card frame

        if render_type == "render_inline_citation":
            url = card.get("url", "")
            if not url:
                return ""
            index = self._citation_map.get(url)
            if index is None:
                self._citation_order.append(url)
                index = len(self._citation_order)
                self._citation_map[url] = index
            # 连续相同引用去重
            if index == self._last_citation_index:
                return ""
            self._last_citation_index = index
            return f" [[{index}]]({url})"

        return ""

    def _append_reasoning(
        self,
        events: list[FrameEvent],
        line: str,
        *,
        rollout: str | None,
        tag: str | None,
        step_id: Any,
    ) -> None:
        """将思维链文本追加到 thinking_buf 和事件列表（双模式去重）"""
        if self._summary_mode:
            # 精简模式：激进去重（移除标点/空格后比较）
            text = line.strip()
            if not text:
                return
            key = self._normalize_key(text)
        else:
            # 详细模式：精确去重（rollout + 原文）
            text = line
            if not text:
                return
            key = f"{rollout or ''}:{text}"

        if key in self._emitted_reasoning_keys:
            return
        self._emitted_reasoning_keys.add(key)

        # 统一用 \n 换行（去掉 "- " 前缀后不再有列表上下文，普通 \n 即可）
        formatted = text if text.endswith("\n") else text + "\n"
        self.thinking_buf.append(formatted)
        events.append(FrameEvent(
            "thinking",
            formatted,
            rollout_id=rollout or "",
            message_tag=tag or "",
            message_step_id=step_id if isinstance(step_id, int) else None,
        ))

    def _flush_pending_reasoning(self, events: list[FrameEvent]) -> None:
        """flush ReasoningAggregator 缓冲事件（仅精简模式有效）"""
        if self._summary_mode and self._reasoning is not None:
            for line in self._reasoning.finalize():
                self._append_reasoning(events, line, rollout="", tag="summary", step_id=None)

    @staticmethod
    def _extract_tool_info(resp: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        """从 toolUsageCard 提取工具名（snake_case）和参数"""
        card = resp.get("toolUsageCard")
        if not isinstance(card, dict):
            return "", {}
        for key, value in card.items():
            if key == "toolUsageCardId" or not isinstance(value, dict):
                continue
            # camelCase → snake_case
            tool_name = re.sub(r"(?<!^)([A-Z])", r"_\1", key).lower()
            raw_args = value.get("args")
            return tool_name, (raw_args if isinstance(raw_args, dict) else {})
        return "", {}

    # 精简模式：走 ReasoningAggregator 提炼摘要
    def _summarize_tool_usage_summary(self, resp: dict[str, Any], *, rollout: str | None, step_id: int | None) -> list[str]:
        tool_name, args = self._extract_tool_info(resp)
        if not tool_name:
            return []
        return self._reasoning.on_tool_usage(tool_name, args, rollout=rollout, step_id=step_id)

    # 详细模式：格式化为 emoji 单行（含 Agent 身份）
    def _format_tool_card(self, resp: dict[str, Any], *, rollout: str | None) -> str:
        tool_name, args = self._extract_tool_info(resp)
        if not tool_name:
            return ""
        emoji, arg_keys = _TOOL_FMT.get(tool_name, ("🔧", ()))
        # 提取要展示的参数值
        display_arg = ""
        for ak in arg_keys:
            val = args.get(ak)
            if val:
                display_arg = str(val).strip()
                break
        # 构造 Agent 前缀（不加前导 \n，由 _append_reasoning 统一处理换行）
        prefix = f"[{rollout}] " if rollout else ""
        if display_arg:
            return f"{prefix}{emoji} {tool_name}: {display_arg}"
        return f"{prefix}{emoji} {tool_name}"

    def _normalize_key(self, text: str) -> str:
        lowered = text.lower()
        lowered = re.sub(r"https?://\S+", "", lowered)
        lowered = re.sub(r"[^\w\u4e00-\u9fff]+", "", lowered)
        return lowered


__all__ = [
    "build_chat_payload",
    "classify_line",
    "FrameEvent",
    "StreamAdapter",
]
