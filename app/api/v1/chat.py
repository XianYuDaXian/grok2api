"""
Chat Completions API 路由
"""

import base64
import binascii
import asyncio
import time
from typing import Any, Dict, List, Optional, Union

import orjson
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from app.services.grok.services.chat import ChatService
from app.services.grok.services.image import ImageGenerationService
from app.services.grok.services.image_edit import ImageEditService
from app.services.grok.services.model import ModelService
from app.services.grok.services.video import VideoService
from app.services.token import get_token_manager
from app.core.config import get_config
from app.core.exceptions import ValidationException, AppException, ErrorType
from app.core.logger import logger
from app.services.grok.utils.response import (
    make_chat_chunk,
    make_chat_response,
    wrap_image_content,
)

class MessageItem(BaseModel):
    """消息项"""

    role: str
    content: Optional[Union[str, Dict[str, Any], List[Dict[str, Any]]]]
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None


class VideoConfig(BaseModel):
    """视频生成配置"""

    aspect_ratio: Optional[str] = Field("3:2", description="视频比例: 1280x720(16:9), 720x1280(9:16), 1792x1024(3:2), 1024x1792(2:3), 1024x1024(1:1)")
    video_length: Optional[int] = Field(6, description="视频时长(秒): 6 / 10 / 15")
    resolution_name: Optional[str] = Field("480p", description="视频分辨率: 480p, 720p")
    preset: Optional[str] = Field("custom", description="风格预设: fun, normal, spicy")
    single_image_mode: Optional[str] = Field("frame", description="单图模式: frame=作为首帧, reference=作为参考图")
    n: Optional[int] = Field(None, ge=1, le=4, description="生成数量 (1-4，仅非流式)")
    concurrent: Optional[int] = Field(1, ge=1, le=4, description="并发视频数 (1-4，仅非流式)")

class ImageConfig(BaseModel):
    """图片生成配置"""

    n: Optional[int] = Field(1, ge=1, le=10, description="生成数量 (1-10)")
    size: Optional[str] = Field("1024x1024", description="图片尺寸")
    response_format: Optional[str] = Field(None, description="响应格式")


class ChatCompletionRequest(BaseModel):
    """Chat Completions 请求"""

    model: str = Field(..., description="模型名称")
    messages: List[MessageItem] = Field(..., description="消息数组")
    stream: Optional[bool] = Field(None, description="是否流式输出")
    reasoning_effort: Optional[str] = Field(None, description="推理强度: none/minimal/low/medium/high/xhigh")
    temperature: Optional[float] = Field(0.8, description="采样温度: 0-2")
    top_p: Optional[float] = Field(0.95, description="nucleus 采样: 0-1")
    n: Optional[int] = Field(None, ge=1, le=10, description="通用生成数量（视频可作为并发回退）")
    # 视频生成配置
    video_config: Optional[VideoConfig] = Field(None, description="视频生成参数")
    # 图片生成配置
    image_config: Optional[ImageConfig] = Field(None, description="图片生成参数")
    # Tool calling
    tools: Optional[List[Dict[str, Any]]] = Field(None, description="Tool definitions")
    tool_choice: Optional[Union[str, Dict[str, Any]]] = Field(None, description="Tool choice: auto/required/none/specific")
    parallel_tool_calls: Optional[bool] = Field(True, description="Allow parallel tool calls")
    # 兼容 Vercel AI SDK 等 provider-specific 扩展参数
    provider_options: Optional[Dict[str, Any]] = Field(None, description="Provider-specific options")
    providerOptions: Optional[Dict[str, Any]] = Field(None, description="Provider-specific options (camelCase)")


VALID_ROLES = {"developer", "system", "user", "assistant", "tool"}
USER_CONTENT_TYPES = {"text", "image_url", "input_audio", "file"}
ALLOWED_IMAGE_SIZES = {
    "1280x720",
    "720x1280",
    "1792x1024",
    "1024x1792",
    "1024x1024",
}
DEFAULT_VIDEO_PROMPT = (
    "Animate this."
)

_ALLOWED_REASONING_EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}


def _resolve_reasoning_effort_from_provider_options(
    provider_options: Optional[Dict[str, Any]],
) -> Optional[str]:
    if not isinstance(provider_options, dict):
        return None

    # 优先读取通用层字段
    for key in ("reasoning_effort", "reasoningEffort"):
        value = provider_options.get(key)
        if isinstance(value, str):
            effort = value.strip().lower()
            if effort in _ALLOWED_REASONING_EFFORTS:
                return effort

    # 再读取各 provider 命名空间（如 xai/openai/anthropic）
    for _, conf in provider_options.items():
        if not isinstance(conf, dict):
            continue
        for key in ("reasoning_effort", "reasoningEffort"):
            value = conf.get(key)
            if isinstance(value, str):
                effort = value.strip().lower()
                if effort in _ALLOWED_REASONING_EFFORTS:
                    return effort
    return None


def _validate_media_input(value: str, field_name: str, param: str):
    """Verify media input is a valid URL or data URI"""
    if not isinstance(value, str) or not value.strip():
        raise ValidationException(
            message=f"{field_name} cannot be empty",
            param=param,
            code="empty_media",
        )
    value = value.strip()
    if value.startswith("data:"):
        return
    if value.startswith("http://") or value.startswith("https://"):
        return
    candidate = "".join(value.split())
    if len(candidate) >= 32 and len(candidate) % 4 == 0:
        try:
            base64.b64decode(candidate, validate=True)
            raise ValidationException(
                message=f"{field_name} base64 must be provided as a data URI (data:<mime>;base64,...)",
                param=param,
                code="invalid_media",
            )
        except binascii.Error:
            pass
    raise ValidationException(
        message=f"{field_name} must be a URL or data URI",
        param=param,
        code="invalid_media",
    )


def _extract_prompt_images(messages: List[MessageItem]) -> tuple[str, List[str]]:
    """Extract prompt text and image URLs from messages"""
    last_text = ""
    image_urls: List[str] = []

    for msg in messages:
        role = msg.role or "user"
        content = msg.content
        if isinstance(content, str):
            text = content.strip()
            if text:
                last_text = text
            continue
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            block_type = block.get("type")
            if block_type == "text":
                text = block.get("text", "")
                if isinstance(text, str) and text.strip():
                    last_text = text.strip()
            elif block_type == "image_url" and role == "user":
                image = block.get("image_url") or {}
                url = image.get("url", "")
                if isinstance(url, str) and url.strip():
                    image_urls.append(url.strip())

    return last_text, image_urls


def _ensure_video_default_prompt(messages: List[MessageItem]) -> None:
    has_image = False
    has_text = False
    first_empty_text_block: Optional[Dict[str, Any]] = None
    first_empty_str_msg: Optional[MessageItem] = None
    last_user_list_msg: Optional[MessageItem] = None

    for msg in messages:
        if (msg.role or "") != "user":
            continue
        content = msg.content
        if isinstance(content, str):
            if content.strip():
                has_text = True
            elif first_empty_str_msg is None:
                first_empty_str_msg = msg
            continue
        if not isinstance(content, list):
            continue
        last_user_list_msg = msg
        for block in content:
            if not isinstance(block, dict):
                continue
            block_type = block.get("type")
            if block_type == "image_url":
                image = block.get("image_url") or {}
                if isinstance(image.get("url"), str) and image.get("url", "").strip():
                    has_image = True
            elif block_type == "text":
                text = block.get("text", "")
                if isinstance(text, str) and text.strip():
                    has_text = True
                elif first_empty_text_block is None:
                    first_empty_text_block = block

    if (not has_image) or has_text:
        return

    if first_empty_text_block is not None:
        first_empty_text_block["text"] = DEFAULT_VIDEO_PROMPT
        return

    if first_empty_str_msg is not None:
        first_empty_str_msg.content = DEFAULT_VIDEO_PROMPT
        return

    if last_user_list_msg is not None and isinstance(last_user_list_msg.content, list):
        last_user_list_msg.content.append({"type": "text", "text": DEFAULT_VIDEO_PROMPT})
        return

    messages.append(MessageItem(role="user", content=DEFAULT_VIDEO_PROMPT))


def _resolve_image_format(value: Optional[str]) -> str:
    fmt = value or get_config("app.image_format") or "url"
    if isinstance(fmt, str):
        fmt = fmt.lower()
    if fmt == "base64":
        return "b64_json"
    if fmt in ("b64_json", "url"):
        return fmt
    raise ValidationException(
        message="image_format must be one of url, base64, b64_json",
        param="image_format",
        code="invalid_image_format",
    )


def _image_field(response_format: str) -> str:
    if response_format == "url":
        return "url"
    return "b64_json"


def _chat_error_as_success_response(model: str, message: str) -> JSONResponse:
    """将业务错误包装为 200 ChatCompletion，避免工具层只看到 HTTP 异常。"""
    return JSONResponse(
        status_code=200,
        content={
            "id": f"chatcmpl-{int(time.time() * 1000)}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": message},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        },
    )


def _build_chat_image_content(images: List[str], response_format: str) -> str:
    """将图片结果包装为 chat.completions 可消费的 markdown 内容。"""
    items = [
        wrap_image_content(str(item or "").strip(), response_format)
        for item in (images or [])
        if str(item or "").strip()
    ]
    return "\n".join(items)


def _build_chat_image_stream(
    model: str,
    content: str,
    usage: Optional[dict] = None,
):
    """将最终图片结果包装为 OpenAI 标准 chat chunk 流。"""
    async def _stream():
        response_id = f"chatcmpl-{int(time.time() * 1000)}"
        if content:
            yield f"data: {orjson.dumps(make_chat_chunk(response_id, model, content)).decode()}\n\n"
        final_chunk = make_chat_chunk(
            response_id=response_id,
            model=model,
            content="",
            is_final=True,
        )
        if usage is not None:
            final_chunk["usage"] = usage
        yield f"data: {orjson.dumps(final_chunk).decode()}\n\n"
        yield "data: [DONE]\n\n"

    return _stream()


def _video_error_message(exc: Exception) -> str:
    """统一视频错误文案，避免工具层只看到底层 HTTP 错误。"""
    if isinstance(exc, AppException):
        return exc.message
    text = str(exc or "").lower()
    if (
        "blocked by moderation" in text
        or "content moderated" in text
        or "content-moderated" in text
        or '"code":3' in text
        or "'code': 3" in text
    ):
        return "视频生成被拒绝，请调整提示词或素材后重试"
    if (
        "tls connect error" in text
        or "timed out" in text
        or "timeout" in text
        or "connection closed" in text
        or "http/2" in text
        or "curl: (35)" in text
        or "network" in text
        or "proxy" in text
    ):
        return "视频生成失败：网络连接异常，请稍后重试"
    return "视频生成失败，请稍后重试"


def _validate_image_config(image_conf: ImageConfig, *, stream: bool):
    n = image_conf.n or 1
    if n < 1 or n > 10:
        raise ValidationException(
            message="n must be between 1 and 10",
            param="image_config.n",
            code="invalid_n",
        )
    if stream and n not in (1, 2):
        raise ValidationException(
            message="Streaming is only supported when n=1 or n=2",
            param="image_config.n",
            code="invalid_stream_n",
        )
    if image_conf.response_format:
        allowed_formats = {"b64_json", "base64", "url"}
        if image_conf.response_format not in allowed_formats:
            raise ValidationException(
                message="response_format must be one of b64_json, base64, url",
                param="image_config.response_format",
                code="invalid_response_format",
            )
    if image_conf.size and image_conf.size not in ALLOWED_IMAGE_SIZES:
        raise ValidationException(
            message=f"size must be one of {sorted(ALLOWED_IMAGE_SIZES)}",
            param="image_config.size",
            code="invalid_size",
        )
def validate_request(request: ChatCompletionRequest):
    """验证请求参数"""
    # 验证模型
    if not ModelService.valid(request.model):
        raise ValidationException(
            message=f"The model `{request.model}` does not exist or you do not have access to it.",
            param="model",
            code="model_not_found",
        )

    # 验证消息
    for idx, msg in enumerate(request.messages):
        if not isinstance(msg.role, str) or msg.role not in VALID_ROLES:
            raise ValidationException(
                message=f"role must be one of {sorted(VALID_ROLES)}",
                param=f"messages.{idx}.role",
                code="invalid_role",
            )
        content = msg.content

        # 字符串内容
        if isinstance(content, str):
            if not content.strip() and msg.role != "assistant":
                raise ValidationException(
                    message="Message content cannot be empty",
                    param=f"messages.{idx}.content",
                    code="empty_content",
                )

        elif isinstance(content, dict):
            msg.content = [content]
            content = msg.content

        # 列表内容
        elif isinstance(content, list):
            if not content:
                raise ValidationException(
                    message="Message content cannot be an empty array",
                    param=f"messages.{idx}.content",
                    code="empty_content",
                )

            for block_idx, block in enumerate(content):
                # 检查空对象
                if not isinstance(block, dict):
                    raise ValidationException(
                        message="Content block must be an object",
                        param=f"messages.{idx}.content.{block_idx}",
                        code="invalid_block",
                    )
                if not block:
                    raise ValidationException(
                        message="Content block cannot be empty",
                        param=f"messages.{idx}.content.{block_idx}",
                        code="empty_block",
                    )

                # 检查 type 字段
                if "type" not in block:
                    raise ValidationException(
                        message="Content block must have a 'type' field",
                        param=f"messages.{idx}.content.{block_idx}",
                        code="missing_type",
                    )

                block_type = block.get("type")

                # 检查 type 空值
                if (
                    not block_type
                    or not isinstance(block_type, str)
                    or not block_type.strip()
                ):
                    raise ValidationException(
                        message="Content block 'type' cannot be empty",
                        param=f"messages.{idx}.content.{block_idx}.type",
                        code="empty_type",
                    )

                # 验证 type 有效性
                if msg.role == "user":
                    if block_type not in USER_CONTENT_TYPES:
                        raise ValidationException(
                            message=f"Invalid content block type: '{block_type}'",
                            param=f"messages.{idx}.content.{block_idx}.type",
                            code="invalid_type",
                        )
                else:
                    if block_type != "text":
                        raise ValidationException(
                            message=f"The `{msg.role}` role only supports 'text' type, got '{block_type}'",
                            param=f"messages.{idx}.content.{block_idx}.type",
                            code="invalid_type",
                        )

                # 验证字段是否存在 & 非空
                if block_type == "text":
                    text = block.get("text", "")
                    if not isinstance(text, str) or not text.strip():
                        raise ValidationException(
                            message="Text content cannot be empty",
                            param=f"messages.{idx}.content.{block_idx}.text",
                            code="empty_text",
                        )
                elif block_type == "image_url":
                    image_url = block.get("image_url")
                    if not image_url or not isinstance(image_url, dict):
                        raise ValidationException(
                            message="image_url must have a 'url' field",
                            param=f"messages.{idx}.content.{block_idx}.image_url",
                            code="missing_url",
                        )
                    _validate_media_input(
                        image_url.get("url", ""),
                        "image_url.url",
                        f"messages.{idx}.content.{block_idx}.image_url.url",
                    )
                elif block_type == "input_audio":
                    audio = block.get("input_audio")
                    if not audio or not isinstance(audio, dict):
                        raise ValidationException(
                            message="input_audio must have a 'data' field",
                            param=f"messages.{idx}.content.{block_idx}.input_audio",
                            code="missing_audio",
                        )
                    _validate_media_input(
                        audio.get("data", ""),
                        "input_audio.data",
                        f"messages.{idx}.content.{block_idx}.input_audio.data",
                    )
                elif block_type == "file":
                    file_data = block.get("file")
                    if not file_data or not isinstance(file_data, dict):
                        raise ValidationException(
                            message="file must have a 'file_data' field",
                            param=f"messages.{idx}.content.{block_idx}.file",
                            code="missing_file",
                        )
                    _validate_media_input(
                        file_data.get("file_data", ""),
                        "file.file_data",
                        f"messages.{idx}.content.{block_idx}.file.file_data",
                    )
        elif content is None and (msg.role == "tool" or msg.tool_calls):
            pass
        elif not isinstance(content, list):
            raise ValidationException(
                message="Message content must be a string, object, or array",
                param=f"messages.{idx}.content",
                code="invalid_content",
            )

    # 默认验证
    if request.stream is not None:
        if isinstance(request.stream, bool):
            pass
        elif isinstance(request.stream, str):
            if request.stream.lower() in ("true", "1", "yes"):
                request.stream = True
            elif request.stream.lower() in ("false", "0", "no"):
                request.stream = False
            else:
                raise ValidationException(
                    message="stream must be a boolean",
                    param="stream",
                    code="invalid_stream",
                )
        else:
            raise ValidationException(
                message="stream must be a boolean",
                param="stream",
                code="invalid_stream",
            )

    allowed_efforts = {"none", "minimal", "low", "medium", "high", "xhigh"}
    if request.reasoning_effort is not None:
        if not isinstance(request.reasoning_effort, str) or (
            request.reasoning_effort not in allowed_efforts
        ):
            raise ValidationException(
                message=f"reasoning_effort must be one of {sorted(allowed_efforts)}",
                param="reasoning_effort",
                code="invalid_reasoning_effort",
            )

    if request.temperature is None:
        request.temperature = 0.8
    else:
        try:
            request.temperature = float(request.temperature)
        except Exception:
            raise ValidationException(
                message="temperature must be a float",
                param="temperature",
                code="invalid_temperature",
            )
        if not (0 <= request.temperature <= 2):
            raise ValidationException(
                message="temperature must be between 0 and 2",
                param="temperature",
                code="invalid_temperature",
            )

    if request.top_p is None:
        request.top_p = 0.95
    else:
        try:
            request.top_p = float(request.top_p)
        except Exception:
            raise ValidationException(
                message="top_p must be a float",
                param="top_p",
                code="invalid_top_p",
            )
        if not (0 <= request.top_p <= 1):
            raise ValidationException(
                message="top_p must be between 0 and 1",
                param="top_p",
                code="invalid_top_p",
            )

    model_info = ModelService.get(request.model)
    # image 验证
    if model_info and (model_info.is_image or model_info.is_image_edit):
        prompt, image_urls = _extract_prompt_images(request.messages)
        if not prompt:
            raise ValidationException(
                message="Prompt cannot be empty",
                param="messages",
                code="empty_prompt",
            )
        image_conf = request.image_config or ImageConfig()
        n = image_conf.n or 1
        if not (1 <= n <= 10):
            raise ValidationException(
                message="n must be between 1 and 10",
                param="image_config.n",
                code="invalid_n",
            )
        if request.stream and n not in (1, 2):
            raise ValidationException(
                message="Streaming is only supported when n=1 or n=2",
                param="stream",
                code="invalid_stream_n",
            )

        response_format = _resolve_image_format(image_conf.response_format)
        image_conf.n = n
        image_conf.response_format = response_format
        if not image_conf.size:
            image_conf.size = "1024x1024"
        allowed_sizes = {
            "1280x720",
            "720x1280",
            "1792x1024",
            "1024x1792",
            "1024x1024",
        }
        if image_conf.size not in allowed_sizes:
            raise ValidationException(
                message=f"size must be one of {sorted(allowed_sizes)}",
                param="image_config.size",
                code="invalid_size",
            )
        request.image_config = image_conf

    # image edit 验证
    if model_info and model_info.is_image_edit:
        _, image_urls = _extract_prompt_images(request.messages)
        if not image_urls:
            raise ValidationException(
                message="image_url is required for image edits",
                param="messages",
                code="missing_image",
            )
        if len(image_urls) > 3:
            raise ValidationException(
                message="Too many image_url references. Maximum is 3.",
                param="messages",
                code="invalid_image_count",
            )
        image_conf = request.image_config or ImageConfig()
        n = image_conf.n or 1
        if n != 1:
            raise ValidationException(
                message="For image edits, image_config.n must be 1.",
                param="image_config.n",
                code="invalid_n",
            )
        image_conf.n = 1
        request.image_config = image_conf

    # video 验证
    if model_info and model_info.is_video:
        config = request.video_config or VideoConfig()
        _, image_urls = _extract_prompt_images(request.messages)
        if len(image_urls) > 7:
            raise ValidationException(
                message="Too many image_url references for video. Maximum is 7.",
                param="messages",
                code="invalid_image_count",
            )
        effective_stream = (
            request.stream if request.stream is not None else get_config("app.stream")
        )
        config_fields_set = set(getattr(config, "model_fields_set", set()))
        ratio_map = {
            "1280x720": "16:9",
            "720x1280": "9:16",
            "1792x1024": "3:2",
            "1024x1792": "2:3",
            "1024x1024": "1:1",
            "16:9": "16:9",
            "9:16": "9:16",
            "3:2": "3:2",
            "2:3": "2:3",
            "1:1": "1:1",
        }
        if config.aspect_ratio is None:
            config.aspect_ratio = "3:2"
        if config.aspect_ratio not in ratio_map:
            raise ValidationException(
                message=f"aspect_ratio must be one of {list(ratio_map.keys())}",
                param="video_config.aspect_ratio",
                code="invalid_aspect_ratio",
            )
        config.aspect_ratio = ratio_map[config.aspect_ratio]

        if config.video_length not in (6, 10, 15):
            raise ValidationException(
                message="video_length must be 6, 10, or 15 seconds",
                param="video_config.video_length",
                code="invalid_video_length",
            )
        if config.resolution_name not in ("480p", "720p"):
            raise ValidationException(
                message="resolution_name must be one of ['480p', '720p']",
                param="video_config.resolution_name",
                code="invalid_resolution",
            )
        if config.preset not in ("fun", "normal", "spicy", "custom"):
            raise ValidationException(
                message="preset must be one of ['fun', 'normal', 'spicy', 'custom']",
                param="video_config.preset",
                code="invalid_preset",
            )
        if config.single_image_mode not in ("frame", "reference"):
            raise ValidationException(
                message="single_image_mode must be one of ['frame', 'reference']",
                param="video_config.single_image_mode",
                code="invalid_single_image_mode",
            )
        resolved_video_n = None
        if config.n is not None:
            resolved_video_n = config.n
        elif request.n is not None:
            resolved_video_n = request.n
        elif "concurrent" in config_fields_set and config.concurrent is not None:
            resolved_video_n = config.concurrent
        if resolved_video_n is None:
            resolved_video_n = 1
        if resolved_video_n < 1 or resolved_video_n > 4:
            raise ValidationException(
                message="video n must be between 1 and 4",
                param="video_config.n",
                code="invalid_concurrent",
            )
        if bool(effective_stream) and resolved_video_n > 1:
            raise ValidationException(
                message="Streaming is only supported when video_config.n=1",
                param="video_config.n",
                code="invalid_stream_concurrent",
            )
        config.n = int(resolved_video_n)
        config.concurrent = int(resolved_video_n)
        request.video_config = config


router = APIRouter(tags=["Chat"])


async def _close_async_stream(stream_obj: Any):
    """Try to close async stream to release upstream resources."""
    if not stream_obj:
        return
    aclose = getattr(stream_obj, "aclose", None)
    if callable(aclose):
        try:
            await aclose()
        except Exception:
            pass


async def _stream_with_disconnect_guard(stream_obj: Any, req: Request, model: str):
    """Stop upstream stream early when client disconnects."""
    try:
        async for chunk in stream_obj:
            if req is not None and await req.is_disconnected():
                logger.info(f"Client disconnected, stop streaming: model={model}")
                break
            yield chunk
    except asyncio.CancelledError:
        logger.info(f"Streaming cancelled by client: model={model}")
        raise
    finally:
        await _close_async_stream(stream_obj)


def _build_streaming_response(stream_obj: Any, req: Request, model: str) -> StreamingResponse:
    guarded_stream = _stream_with_disconnect_guard(stream_obj, req, model)
    return StreamingResponse(
        guarded_stream,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest, raw_request: Request):
    """Chat Completions API - 兼容 OpenAI"""
    # OpenAI 兼容：未显式传 stream 时默认非流式（false）
    if request.stream is None:
        request.stream = False

    # 兼容 provider-specific options 中的推理强度配置
    if request.reasoning_effort is None:
        provider_opts = request.provider_options or request.providerOptions
        request.reasoning_effort = _resolve_reasoning_effort_from_provider_options(provider_opts)

    model_info = ModelService.get(request.model)
    if model_info and model_info.is_video:
        _ensure_video_default_prompt(request.messages)

    # 参数验证
    try:
        validate_request(request)
    except AppException as exc:
        if model_info and model_info.is_video:
            return _chat_error_as_success_response(request.model, exc.message)
        raise

    logger.debug(f"Chat request: model={request.model}, stream={request.stream}")

    # 检测模型类型
    if model_info and model_info.is_image_edit:
        prompt, image_urls = _extract_prompt_images(request.messages)
        if not image_urls:
            raise ValidationException(
                message="Image is required",
                param="image",
                code="missing_image",
            )
        # image edit 支持最多 3 张参考图
        image_refs = image_urls[:3]

        requested_stream = (
            request.stream if request.stream is not None else get_config("app.stream")
        )
        image_conf = request.image_config or ImageConfig()
        _validate_image_config(image_conf, stream=bool(requested_stream))
        response_format = _resolve_image_format(image_conf.response_format)
        n = 1

        token_mgr = await get_token_manager()
        await token_mgr.reload_if_stale()

        token = None
        for pool_name in ModelService.pool_candidates_for_model(request.model):
            token = token_mgr.get_token(pool_name)
            if token:
                break

        if not token:
            raise AppException(
                message="No available tokens. Please try again later.",
                error_type=ErrorType.RATE_LIMIT.value,
                code="rate_limit_exceeded",
                status_code=429,
            )

        result = await ImageEditService().edit(
            token_mgr=token_mgr,
            token=token,
            model_info=model_info,
            prompt=prompt,
            images=image_refs,
            n=n,
            response_format=response_format,
            stream=False,
        )

        usage = {
            "total_tokens": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "input_tokens_details": {"text_tokens": 0, "image_tokens": 0},
        }
        content = _build_chat_image_content(result.data, response_format)
        if bool(requested_stream):
            return _build_streaming_response(
                _build_chat_image_stream(request.model, content, usage),
                raw_request,
                request.model,
            )
        return JSONResponse(
            content=make_chat_response(
                model=request.model,
                content=content,
                usage=usage,
            )
        )

    if model_info and model_info.is_image:
        prompt, _ = _extract_prompt_images(request.messages)

        requested_stream = (
            request.stream if request.stream is not None else get_config("app.stream")
        )
        image_conf = request.image_config or ImageConfig()
        _validate_image_config(image_conf, stream=bool(requested_stream))
        response_format = _resolve_image_format(image_conf.response_format)
        n = image_conf.n or 1
        size = image_conf.size or "1024x1024"
        aspect_ratio_map = {
            "1280x720": "16:9",
            "720x1280": "9:16",
            "1792x1024": "3:2",
            "1024x1792": "2:3",
            "1024x1024": "1:1",
        }
        aspect_ratio = aspect_ratio_map.get(size, "2:3")

        token_mgr = await get_token_manager()
        await token_mgr.reload_if_stale()

        token = None
        for pool_name in ModelService.pool_candidates_for_model(request.model):
            token = token_mgr.get_token(pool_name)
            if token:
                break

        if not token:
            raise AppException(
                message="No available tokens. Please try again later.",
                error_type=ErrorType.RATE_LIMIT.value,
                code="rate_limit_exceeded",
                status_code=429,
            )

        result = await ImageGenerationService().generate(
            token_mgr=token_mgr,
            token=token,
            model_info=model_info,
            prompt=prompt,
            n=n,
            response_format=response_format,
            size=size,
            aspect_ratio=aspect_ratio,
            stream=False,
        )

        usage = result.usage_override or {
            "total_tokens": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "input_tokens_details": {"text_tokens": 0, "image_tokens": 0},
        }
        content = _build_chat_image_content(result.data, response_format)
        if bool(requested_stream):
            return _build_streaming_response(
                _build_chat_image_stream(request.model, content, usage),
                raw_request,
                request.model,
            )
        return JSONResponse(
            content=make_chat_response(
                model=request.model,
                content=content,
                usage=usage,
            )
        )

    if model_info and model_info.is_video:
        try:
            # 提取视频配置 (默认值在 Pydantic 模型中处理)
            v_conf = request.video_config or VideoConfig()
            video_concurrent = int(v_conf.n or request.n or v_conf.concurrent or 1)
            if video_concurrent <= 1:
                result = await VideoService.completions(
                    model=request.model,
                    messages=[msg.model_dump() for msg in request.messages],
                    stream=request.stream,
                    reasoning_effort=request.reasoning_effort,
                    aspect_ratio=v_conf.aspect_ratio,
                    video_length=v_conf.video_length,
                    resolution=v_conf.resolution_name,
                    preset=v_conf.preset,
                    single_image_mode=v_conf.single_image_mode or "frame",
                )
            else:
                messages_dump = [msg.model_dump() for msg in request.messages]

                async def _run_single() -> Dict[str, Any]:
                    single = await VideoService.completions(
                        model=request.model,
                        messages=messages_dump,
                        stream=False,
                        reasoning_effort=request.reasoning_effort,
                        aspect_ratio=v_conf.aspect_ratio,
                        video_length=v_conf.video_length,
                        resolution=v_conf.resolution_name,
                        preset=v_conf.preset,
                        single_image_mode=v_conf.single_image_mode or "frame",
                    )
                    if not isinstance(single, dict):
                        raise ValidationException(
                            message="video concurrent mode only supports non-stream result",
                            param="video_config.concurrent",
                            code="invalid_stream_concurrent",
                        )
                    return single

                results = await asyncio.gather(*[_run_single() for _ in range(video_concurrent)])
                merged = dict(results[0]) if results else {
                    "id": "",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": request.model,
                    "choices": [],
                    "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                }

                choices: List[Dict[str, Any]] = []
                usage_prompt = 0
                usage_completion = 0
                usage_total = 0
                for idx, item in enumerate(results):
                    raw_choice = (
                        item.get("choices", [{}])[0]
                        if isinstance(item.get("choices"), list) and item.get("choices")
                        else {}
                    )
                    choice = dict(raw_choice)
                    choice["index"] = idx
                    choices.append(choice)
                    usage = item.get("usage") or {}
                    usage_prompt += int(usage.get("prompt_tokens") or 0)
                    usage_completion += int(usage.get("completion_tokens") or 0)
                    usage_total += int(usage.get("total_tokens") or 0)

                merged["created"] = int(time.time())
                merged["choices"] = choices
                merged["usage"] = {
                    "prompt_tokens": usage_prompt,
                    "completion_tokens": usage_completion,
                    "total_tokens": usage_total,
                }
                
                result = merged

        except Exception as e:
            return _chat_error_as_success_response(request.model, _video_error_message(e))
    else:
        result = await ChatService.completions(
            model=request.model,
            messages=[msg.model_dump() for msg in request.messages],
            stream=request.stream,
            reasoning_effort=request.reasoning_effort,
            temperature=request.temperature,
            top_p=request.top_p,
            tools=request.tools,
            tool_choice=request.tool_choice,
            parallel_tool_calls=(
                True if request.parallel_tool_calls is None else request.parallel_tool_calls
            ),
        )

    if isinstance(result, dict):
        return JSONResponse(content=result)
    else:
        return _build_streaming_response(result, raw_request, request.model)


__all__ = ["router"]
