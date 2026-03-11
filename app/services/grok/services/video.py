"""
Grok video generation service.
"""

import asyncio
import uuid
import re
import time
from typing import Any, AsyncGenerator, AsyncIterable, Optional

import orjson
from app.services.reverse.utils.session import ResettableSession
from curl_cffi.requests.errors import RequestsError

from app.core.logger import logger
from app.core.config import get_config
from app.core.exceptions import (
    UpstreamException,
    AppException,
    ValidationException,
    ErrorType,
    StreamIdleTimeoutError,
)
from app.services.grok.services.model import ModelService
from app.services.token import get_token_manager, EffortType
from app.services.grok.utils.stream import wrap_stream_with_usage
from app.services.grok.utils.process import (
    BaseProcessor,
    _with_idle_timeout,
    _normalize_line,
    _is_http2_error,
)
from app.services.grok.utils.retry import rate_limited
from app.services.reverse.app_chat import AppChatReverse
from app.services.reverse.media_post import MediaPostReverse
from app.services.reverse.video_upscale import VideoUpscaleReverse
from app.services.reverse.assets_list import AssetsListReverse

_VIDEO_SEMAPHORE = None
_VIDEO_SEM_VALUE = 0


def _get_video_semaphore() -> asyncio.Semaphore:
    """Reverse 接口并发控制（video 服务）。"""
    global _VIDEO_SEMAPHORE, _VIDEO_SEM_VALUE
    value = max(1, int(get_config("video.concurrent")))
    if value != _VIDEO_SEM_VALUE:
        _VIDEO_SEM_VALUE = value
        _VIDEO_SEMAPHORE = asyncio.Semaphore(value)
    return _VIDEO_SEMAPHORE


def _token_tag(token: str) -> str:
    raw = token[4:] if token.startswith("sso=") else token
    if not raw:
        return "empty"
    if len(raw) <= 14:
        return raw
    return f"{raw[:6]}...{raw[-6:]}"


def _classify_video_error(exc: Exception) -> tuple[str, str, int]:
    """将底层异常归一化为用户可读错误。"""
    text = str(exc or "").lower()
    details = getattr(exc, "details", None)
    body = ""
    if isinstance(details, dict):
        body = str(details.get("body") or "").lower()
    merged = f"{text}\n{body}"

    if (
        "blocked by moderation" in merged
        or "content moderated" in merged
        or "content-moderated" in merged
        or '"code":3' in merged
        or "'code': 3" in merged
    ):
        return ("视频生成被拒绝，请调整提示词或素材后重试", "video_rejected", 400)

    if (
        "tls connect error" in merged
        or "could not establish signal connection" in merged
        or "timed out" in merged
        or "timeout" in merged
        or "connection closed" in merged
        or "http/2" in merged
        or "curl: (35)" in merged
        or "network" in merged
        or "proxy" in merged
    ):
        return ("视频生成失败：网络连接异常，请稍后重试", "video_network_error", 502)

    return ("视频生成失败，请稍后重试", "video_failed", 502)


class VideoService:
    """Video generation service."""

    def __init__(self):
        self.timeout = None

    @staticmethod
    def is_meaningful_video_prompt(prompt: str) -> bool:
        """判断提示词是否属于“有效自定义视频提示词”。

        以下场景视为非自定义（返回 False）：
        - 空提示词
        - 仅“让它动起来/生成视频/animate this”等泛化短提示
        """
        text = (prompt or "").strip().lower()
        if not text:
            return False

        # 统一空白与常见收尾标点
        text = re.sub(r"\s+", " ", text).strip(
            " \t\r\n.,!?;:，。！？；：'\"`~()[]{}<>《》「」【】"
        )
        key = re.sub(r"\s+", "", text)
        if not text:
            return False

        generic_en = {
            "animate",
            "animate this",
            "animate this image",
            "make it move",
            "make this move",
            "generate video",
            "make video",
            "make a video",
            "create video",
            "turn this into a video",
            "turn it into a video",
            "video",
        }
        generic_zh = {
            "动起来",
            "让它动起来",
            "让图片动起来",
            "让这张图动起来",
            "生成视频",
            "生成一个视频",
            "生成一段视频",
            "做成视频",
            "做个视频",
            "制作视频",
            "变成视频",
            "变成一个视频",
            "视频",
        }
        if text in generic_en or key in generic_zh:
            return False

        # 英文泛化短句：please animate this / please generate a video
        if re.fullmatch(r"(please\s+)?animate(\s+this(\s+image)?)?", text):
            return False
        if re.fullmatch(r"(please\s+)?(make|create|generate)\s+(a\s+)?video", text):
            return False

        # 中文泛化短句：请让它动起来 / 帮我生成视频 / 把这张图做成视频
        if re.fullmatch(
            r"(请|请你|帮我|麻烦你)?(把)?(它|图片|这张图)?"
            r"(动起来|生成视频|做成视频|制作视频)(吧|一下|下)?",
            key,
        ):
            return False

        return True

    @staticmethod
    def _map_preset_to_mode(preset: str) -> str:
        """将前端预设名映射为 Grok 官方 mode 参数。"""
        mapping = {
            "spicy": "extremely-spicy-or-crazy",
            "fun": "extremely-crazy",
            "normal": "normal",
        }
        # 如果预设没发送，默认 --mode=extremely-spicy-or-crazy (即 spicy)
        return mapping.get(preset, "extremely-spicy-or-crazy")

    @staticmethod
    def _build_video_message(
        prompt: str,
        preset: str = "normal",
        source_image_url: str = "",
    ) -> str:
        """构造视频请求 message：
        - 有提示词：统一走 custom，并发送 image_url + prompt + mode
        - 无提示词：根据所选 preset 转换 mode
        """
        prompt_text = (prompt or "").strip()
        if not VideoService.is_meaningful_video_prompt(prompt_text):
            prompt_text = ""

        image_core = (source_image_url or "").strip()
        if prompt_text:
            mode_flag = "--mode=custom"
            if image_core:
                return f"{image_core}  {prompt_text} {mode_flag}"
            return f"{prompt_text} {mode_flag}"

        # 无提示词（或泛化指令）
        official_mode = VideoService._map_preset_to_mode(preset)
        mode_flag = f"--mode={official_mode}"
        if image_core:
            return f"{image_core}  {mode_flag}"
        return mode_flag

    @staticmethod
    def _build_imagine_public_url(parent_post_id: str) -> str:
        return f"https://imagine-public.x.ai/imagine-public/images/{parent_post_id}.jpg"

    @staticmethod
    def _is_moderated_line(line: bytes) -> bool:
        text = _normalize_line(line)
        if not text:
            return False
        try:
            data = orjson.loads(text)
        except Exception:
            return False
        resp = data.get("result", {}).get("response", {})
        video_resp = resp.get("streamingVideoGenerationResponse", {})
        return bool(video_resp.get("moderated") is True)

    async def create_post(
        self,
        token: str,
        prompt: str,
        media_type: str = "MEDIA_POST_TYPE_VIDEO",
        media_url: str = None,
    ) -> str:
        """Create media post and return post ID."""
        try:
            if media_type == "MEDIA_POST_TYPE_IMAGE" and not media_url:
                raise ValidationException("media_url is required for image posts")

            prompt_value = prompt if media_type == "MEDIA_POST_TYPE_VIDEO" else ""
            media_value = media_url or ""

            async with ResettableSession() as session:
                async with _get_video_semaphore():
                    response = await MediaPostReverse.request(
                        session,
                        token,
                        media_type,
                        media_value,
                        prompt=prompt_value,
                    )

            post_id = response.json().get("post", {}).get("id", "")
            if not post_id:
                raise UpstreamException("No post ID in response")

            logger.info(f"Media post created: {post_id} (type={media_type})")
            return post_id

        except AppException:
            raise
        except Exception as e:
            logger.error(f"Create post error: {e}")
            msg, code, status = _classify_video_error(e)
            raise AppException(
                message=msg,
                error_type=ErrorType.SERVER.value
                if status >= 500
                else ErrorType.INVALID_REQUEST.value,
                code=code,
                status_code=status,
            )

    async def create_image_post(self, token: str, image_url: str) -> str:
        """Create image post and return post ID."""
        return await self.create_post(
            token, prompt="", media_type="MEDIA_POST_TYPE_IMAGE", media_url=image_url
        )

    async def generate(
        self,
        token: str,
        prompt: str,
        aspect_ratio: str = "3:2",
        video_length: int = 6,
        resolution_name: str = "480p",
        preset: str = "normal",
    ) -> AsyncGenerator[bytes, None]:
        """Generate video."""
        token_tag = _token_tag(token)
        # 确定逻辑上的 mode
        is_custom = VideoService.is_meaningful_video_prompt(prompt)
        official_mode = (
            "custom" if is_custom else VideoService._map_preset_to_mode(preset)
        )

        logger.info(
            f"Video generation: token={token_tag}, prompt='{prompt[:50]}...', ratio={aspect_ratio}, length={video_length}s, mode={official_mode}"
        )
        post_id = await self.create_post(token, prompt)
        message = self._build_video_message(prompt=prompt, preset=preset)
        model_config_override = {
            "modelMap": {
                "videoGenModelConfig": {
                    "aspectRatio": aspect_ratio,
                    "parentPostId": post_id,
                    "resolutionName": resolution_name,
                    "videoLength": video_length,
                    "isVideoEdit": False,
                }
            }
        }
        moderated_max_retry = max(1, int(get_config("video.moderated_max_retry", 5)))

        async def _stream():
            for attempt in range(1, moderated_max_retry + 1):
                session = ResettableSession()
                moderated_hit = False
                try:
                    async with _get_video_semaphore():
                        stream_response = await AppChatReverse.request(
                            session,
                            token,
                            message=message,
                            model="grok-3",
                            mode=official_mode,
                            tool_overrides={"videoGen": True},
                            model_config_override=model_config_override,
                        )
                        logger.info(
                            f"Video generation started: token={token_tag}, post_id={post_id}, attempt={attempt}/{moderated_max_retry}"
                        )
                        async for line in stream_response:
                            if self._is_moderated_line(line):
                                moderated_hit = True
                                logger.warning(
                                    f"Video generation moderated: token={token_tag}, retry {attempt}/{moderated_max_retry}"
                                )
                                break
                            yield line

                    if not moderated_hit:
                        return
                    if attempt < moderated_max_retry:
                        await asyncio.sleep(1.2)
                        continue
                    raise UpstreamException(
                        "Video blocked by moderation",
                        status_code=400,
                        details={"moderated": True, "attempts": moderated_max_retry},
                    )
                except Exception as e:
                    logger.error(f"Video generation error: {e}")
                    if isinstance(e, AppException):
                        raise
                    msg, code, status = _classify_video_error(e)
                    raise AppException(
                        message=msg,
                        error_type=ErrorType.SERVER.value
                        if status >= 500
                        else ErrorType.INVALID_REQUEST.value,
                        code=code,
                        status_code=status,
                    )
                finally:
                    try:
                        await session.close()
                    except Exception:
                        pass

        return _stream()

    async def generate_from_image(
        self,
        token: str,
        prompt: str,
        image_url: str,
        aspect_ratio: str = "3:2",
        video_length: int = 6,
        resolution: str = "480p",
        preset: str = "normal",
    ) -> AsyncGenerator[bytes, None]:
        """Generate video from image."""
        token_tag = _token_tag(token)
        # 确定逻辑上的 mode
        is_custom = VideoService.is_meaningful_video_prompt(prompt)
        official_mode = (
            "custom" if is_custom else VideoService._map_preset_to_mode(preset)
        )

        logger.info(
            f"Image to video: token={token_tag}, prompt='{prompt[:50]}...', image={image_url[:80]}, mode={official_mode}"
        )
        post_id = await self.create_image_post(token, image_url)
        message = self._build_video_message(
            prompt=prompt,
            preset=preset,
            source_image_url=image_url,
        )
        model_config_override = {
            "modelMap": {
                "videoGenModelConfig": {
                    "aspectRatio": aspect_ratio,
                    "parentPostId": post_id,
                    "resolutionName": resolution,
                    "videoLength": video_length,
                    "isVideoEdit": False,
                }
            }
        }
        moderated_max_retry = max(1, int(get_config("video.moderated_max_retry", 5)))

        async def _stream():
            for attempt in range(1, moderated_max_retry + 1):
                session = ResettableSession()
                moderated_hit = False
                try:
                    async with _get_video_semaphore():
                        stream_response = await AppChatReverse.request(
                            session,
                            token,
                            message=message,
                            model="grok-3",
                            mode=official_mode,
                            tool_overrides={"videoGen": True},
                            model_config_override=model_config_override,
                        )
                        logger.info(
                            f"Video generation started: token={token_tag}, post_id={post_id}, attempt={attempt}/{moderated_max_retry}"
                        )
                        async for line in stream_response:
                            if self._is_moderated_line(line):
                                moderated_hit = True
                                logger.warning(
                                    f"Video generation moderated: token={token_tag}, retry {attempt}/{moderated_max_retry}"
                                )
                                break
                            yield line

                    if not moderated_hit:
                        return
                    if attempt < moderated_max_retry:
                        await asyncio.sleep(1.2)
                        continue
                    raise UpstreamException(
                        "Video blocked by moderation",
                        status_code=400,
                        details={"moderated": True, "attempts": moderated_max_retry},
                    )
                except Exception as e:
                    logger.error(f"Video generation error: {e}")
                    if isinstance(e, AppException):
                        raise
                    msg, code, status = _classify_video_error(e)
                    raise AppException(
                        message=msg,
                        error_type=ErrorType.SERVER.value
                        if status >= 500
                        else ErrorType.INVALID_REQUEST.value,
                        code=code,
                        status_code=status,
                    )
                finally:
                    try:
                        await session.close()
                    except Exception:
                        pass

        return _stream()

    async def generate_from_parent_post(
        self,
        token: str,
        prompt: str,
        parent_post_id: str,
        source_image_url: str = "",
        aspect_ratio: str = "3:2",
        video_length: int = 6,
        resolution: str = "480p",
        preset: str = "normal",
    ) -> AsyncGenerator[bytes, None]:
        """Generate video by existing parent post ID (preferred path)."""
        token_tag = _token_tag(token)
        is_custom = VideoService.is_meaningful_video_prompt(prompt)
        logger.info(
            f"ParentPost to video: token={token_tag}, prompt='{prompt[:50]}...', parent_post_id={parent_post_id}"
        )
        raw_source_image_url = (source_image_url or "").strip()
        source_image_url = self._build_imagine_public_url(parent_post_id)
        if raw_source_image_url and raw_source_image_url != source_image_url:
            logger.info(
                "ParentPost source image normalized to imagine-public: "
                f"token={token_tag}, parent_post_id={parent_post_id}, "
                f"raw_source_image_url={raw_source_image_url}, normalized_source_image_url={source_image_url}"
            )

        # 对齐官网全链路：先创建 IMAGE 类型 media post，再触发 conversations/new。
        # 注意：videoGenModelConfig.parentPostId 仍使用 imagine 的 image_id。
        try:
            created_image_post_id = await self.create_image_post(
                token, source_image_url
            )
            logger.info(
                "ParentPost pre-create media post done: "
                f"parent_post_id={parent_post_id}, image_post_id={created_image_post_id}, "
                f"media_url={source_image_url}"
            )
        except Exception as e:
            logger.warning(
                "ParentPost pre-create media post failed, continue anyway: "
                f"parent_post_id={parent_post_id}, media_url={source_image_url}, error={e}"
            )

        message = self._build_video_message(
            prompt=prompt,
            preset=preset,
            source_image_url=source_image_url,
        )
        model_config_override = {
            "modelMap": {
                "videoGenModelConfig": {
                    "aspectRatio": aspect_ratio,
                    "parentPostId": parent_post_id,
                    "resolutionName": resolution,
                    "videoLength": video_length,
                    "isVideoEdit": False,
                }
            }
        }
        moderated_max_retry = max(1, int(get_config("video.moderated_max_retry", 5)))

        # 确定逻辑上的 mode
        is_custom = VideoService.is_meaningful_video_prompt(prompt)
        official_mode = (
            "custom" if is_custom else VideoService._map_preset_to_mode(preset)
        )

        logger.info(
            "ParentPost video request prepared: "
            f"token={token_tag}, parent_post_id={parent_post_id}, "
            f"message_len={len(message)}, has_prompt={is_custom}, "
            f"resolution={resolution}, video_length={video_length}, ratio={aspect_ratio}, mode={official_mode}"
        )

        async def _stream():
            for attempt in range(1, moderated_max_retry + 1):
                session = ResettableSession()
                moderated_hit = False
                try:
                    async with _get_video_semaphore():
                        stream_response = await AppChatReverse.request(
                            session,
                            token,
                            message=message,
                            model="grok-3",
                            mode=official_mode,
                            tool_overrides={"videoGen": True},
                            model_config_override=model_config_override,
                        )
                        logger.info(
                            "Video generation started by parentPostId: "
                            f"token={token_tag}, parent_post_id={parent_post_id}, attempt={attempt}/{moderated_max_retry}"
                        )
                        async for line in stream_response:
                            if self._is_moderated_line(line):
                                moderated_hit = True
                                logger.warning(
                                    f"Video generation moderated: token={token_tag}, retry {attempt}/{moderated_max_retry}"
                                )
                                break
                            yield line

                    if not moderated_hit:
                        return
                    if attempt < moderated_max_retry:
                        await asyncio.sleep(1.2)
                        continue
                    raise UpstreamException(
                        "Video blocked by moderation",
                        status_code=400,
                        details={"moderated": True, "attempts": moderated_max_retry},
                    )
                except Exception as e:
                    logger.error(f"Video generation error: {e}")
                    if isinstance(e, AppException):
                        raise
                    msg, code, status = _classify_video_error(e)
                    raise AppException(
                        message=msg,
                        error_type=ErrorType.SERVER.value
                        if status >= 500
                        else ErrorType.INVALID_REQUEST.value,
                        code=code,
                        status_code=status,
                    )
                finally:
                    try:
                        await session.close()
                    except Exception:
                        pass

        return _stream()

    async def generate_extend_video(
        self,
        token: str,
        prompt: str,
        extend_post_id: str,
        video_extension_start_time: float,
        original_post_id: str = "",
        file_attachment_id: str = "",
        aspect_ratio: str = "16:9",
        video_length: int = 6,
        resolution: str = "480p",
        preset: str = "normal",
        stitch_with_extend: bool = True,
    ) -> AsyncGenerator[bytes, None]:
        """通过 Grok 官方视频延长 API 延长视频。"""
        token_tag = _token_tag(token)
        # 确定 mode
        prompt_text = (prompt or "").strip()
        is_custom = VideoService.is_meaningful_video_prompt(prompt_text)
        if is_custom:
            mode = "custom"
        else:
            mode = VideoService._map_preset_to_mode(preset)
            prompt_text = ""

        effective_original = (original_post_id or "").strip() or extend_post_id
        effective_file_attachment = (
            file_attachment_id or ""
        ).strip() or effective_original

        logger.info(
            "Video extension request: "
            f"token={token_tag}, extend_post_id={extend_post_id}, "
            f"start_time={video_extension_start_time}, original_post_id={effective_original}, "
            f"prompt='{(prompt_text or '')[:50]}', mode={mode}"
        )

        # 构造 message
        if prompt_text:
            message = f"{prompt_text} --mode={mode}"
        else:
            message = f"--mode={mode}"

        # 构造 videoGenModelConfig —— 对齐官网抓包格式
        video_gen_config = {
            "isVideoExtension": True,
            "videoExtensionStartTime": video_extension_start_time,
            "extendPostId": extend_post_id,
            "stitchWithExtendPostId": stitch_with_extend,
            "originalPostId": effective_original,
            "originalRefType": "ORIGINAL_REF_TYPE_VIDEO_EXTENSION",
            "mode": mode,
            "aspectRatio": aspect_ratio,
            "videoLength": video_length,
            "resolutionName": resolution,
            "parentPostId": extend_post_id,
            "isVideoEdit": False,
        }
        if prompt_text:
            video_gen_config["originalPrompt"] = prompt_text

        model_config_override = {
            "modelMap": {
                "videoGenModelConfig": video_gen_config,
            }
        }

        # fileAttachments 对齐官网：始终传最初图转视频时的 parentPostId
        file_attachments = [effective_file_attachment]

        moderated_max_retry = max(1, int(get_config("video.moderated_max_retry", 5)))

        logger.info(
            "Video extension request prepared: "
            f"token={token_tag}, extend_post_id={extend_post_id}, "
            f"file_attachments={file_attachments}, "
            f"start_time={video_extension_start_time}, mode={mode}, "
            f"resolution={resolution}, video_length={video_length}, ratio={aspect_ratio}"
        )

        async def _stream():
            for attempt in range(1, moderated_max_retry + 1):
                session = ResettableSession()
                moderated_hit = False
                try:
                    async with _get_video_semaphore():
                        stream_response = await AppChatReverse.request(
                            session,
                            token,
                            message=message,
                            model="grok-3",
                            mode=mode,
                            file_attachments=file_attachments,
                            tool_overrides={"videoGen": True},
                            model_config_override=model_config_override,
                        )
                        logger.info(
                            "Video extension started: "
                            f"token={token_tag}, extend_post_id={extend_post_id}, "
                            f"attempt={attempt}/{moderated_max_retry}"
                        )
                        async for line in stream_response:
                            if self._is_moderated_line(line):
                                moderated_hit = True
                                logger.warning(
                                    f"Video extension moderated: token={token_tag}, "
                                    f"retry {attempt}/{moderated_max_retry}"
                                )
                                break
                            yield line

                    if not moderated_hit:
                        return
                    if attempt < moderated_max_retry:
                        await asyncio.sleep(1.2)
                        continue
                    raise UpstreamException(
                        "Video extension blocked by moderation",
                        status_code=400,
                        details={"moderated": True, "attempts": moderated_max_retry},
                    )
                except Exception as e:
                    logger.error(f"Video extension error: {e}")
                    if isinstance(e, AppException):
                        raise
                    msg, code, status = _classify_video_error(e)
                    raise AppException(
                        message=msg,
                        error_type=ErrorType.SERVER.value
                        if status >= 500
                        else ErrorType.INVALID_REQUEST.value,
                        code=code,
                        status_code=status,
                    )
                finally:
                    try:
                        await session.close()
                    except Exception:
                        pass

        return _stream()

    @staticmethod
    async def completions(
        model: str,
        messages: list,
        stream: bool = None,
        reasoning_effort: str | None = None,
        aspect_ratio: str = "3:2",
        video_length: int = 6,
        resolution: str = "480p",
        preset: str = "normal",
        parent_post_id: str | None = None,
        extend_post_id: str | None = None,
        video_extension_start_time: float | None = None,
        original_post_id: str | None = None,
        file_attachment_id: str | None = None,
        stitch_with_extend: bool = True,
        source_image_url: str | None = None,
        preferred_token: str | None = None,
    ):
        """Video generation entrypoint."""
        # Get token via intelligent routing.
        token_mgr = await get_token_manager()
        await token_mgr.reload_if_stale()

        max_token_retries = int(get_config("retry.max_retry"))
        last_error: Exception | None = None

        if reasoning_effort is None:
            show_think = get_config("app.thinking")
        else:
            show_think = reasoning_effort != "none"
        is_stream = stream if stream is not None else get_config("app.stream")

        # Extract content.
        from app.services.grok.services.chat import MessageExtractor
        from app.services.grok.utils.upload import UploadService

        prompt, file_attachments, image_attachments = MessageExtractor.extract(messages)
        parent_post_id = (parent_post_id or "").strip() or None
        source_image_url = (source_image_url or "").strip()
        preferred_token = (preferred_token or "").strip()

        # [NEW] 尝试通过 extend_post_id 或者 parent_post_id 获取强绑定的 token
        from app.services.grok.utils.asset_token_map import AssetTokenMap

        token_map = await AssetTokenMap.get_instance()
        bound_token = None
        if extend_post_id:
            bound_token = await token_map.get_token(extend_post_id)
        elif parent_post_id:
            bound_token = await token_map.get_token(parent_post_id)

        if bound_token:
            preferred_token = bound_token

        if preferred_token.startswith("sso="):
            preferred_token = preferred_token[4:]
        used_tokens: set[str] = set()

        for attempt in range(max_token_retries):
            token = ""
            if preferred_token and preferred_token not in used_tokens:
                if token_mgr.get_pool_name_for_token(preferred_token):
                    token = preferred_token
                    logger.info(
                        f"Video token routing: preferred bound token -> "
                        f"token={_token_tag(token)}"
                    )
                else:
                    used_tokens.add(preferred_token)
                    logger.warning(
                        f"Video token routing: preferred bound token not in pool, fallback to normal routing "
                        f"(token={_token_tag(preferred_token)})"
                    )

            if not token:
                # Select token based on video requirements and pool candidates.
                pool_candidates = ModelService.pool_candidates_for_model(model)
                token_info = token_mgr.get_token_for_video(
                    resolution=resolution,
                    video_length=video_length,
                    pool_candidates=pool_candidates,
                    exclude=used_tokens,
                )

                if not token_info:
                    if last_error:
                        raise last_error
                    raise AppException(
                        message="No available tokens. Please try again later.",
                        error_type=ErrorType.RATE_LIMIT.value,
                        code="rate_limit_exceeded",
                        status_code=429,
                    )

                token = token_info.token
                if token.startswith("sso="):
                    token = token[4:]

            used_tokens.add(token)
            should_upscale = bool(get_config("video.auto_upscale", True))

            try:
                # Handle image attachments.
                image_url = None
                if (not parent_post_id) and image_attachments:
                    upload_service = UploadService()
                    try:
                        for attach_data in image_attachments:
                            _, file_uri = await upload_service.upload_file(
                                attach_data, token
                            )
                            image_url = f"https://assets.grok.com/{file_uri}"
                            logger.info(f"Image uploaded for video: {image_url}")
                            break
                    finally:
                        await upload_service.close()

                # Generate video.
                service = VideoService()
                if extend_post_id and video_extension_start_time is not None:
                    # 视频延长路径
                    response = await service.generate_extend_video(
                        token=token,
                        prompt=prompt,
                        extend_post_id=extend_post_id,
                        video_extension_start_time=video_extension_start_time,
                        original_post_id=original_post_id or "",
                        file_attachment_id=file_attachment_id or "",
                        aspect_ratio=aspect_ratio,
                        video_length=video_length,
                        resolution=resolution,
                        preset=preset,
                        stitch_with_extend=stitch_with_extend,
                    )
                elif parent_post_id:
                    response = await service.generate_from_parent_post(
                        token=token,
                        prompt=prompt,
                        parent_post_id=parent_post_id,
                        source_image_url=source_image_url,
                        aspect_ratio=aspect_ratio,
                        video_length=video_length,
                        resolution=resolution,
                        preset=preset,
                    )
                elif image_url:
                    response = await service.generate_from_image(
                        token,
                        prompt,
                        image_url,
                        aspect_ratio,
                        video_length,
                        resolution,
                        preset,
                    )
                else:
                    response = await service.generate(
                        token,
                        prompt,
                        aspect_ratio,
                        video_length,
                        resolution,
                        preset,
                    )

                # Process response.
                if is_stream:
                    processor = VideoStreamProcessor(
                        model,
                        token,
                        show_think,
                        upscale_on_finish=should_upscale,
                    )
                    return wrap_stream_with_usage(
                        processor.process(response), token_mgr, token, model
                    )

                result = await VideoCollectProcessor(
                    model, token, upscale_on_finish=should_upscale
                ).process(response)
                try:
                    model_info = ModelService.get(model)
                    effort = (
                        EffortType.HIGH
                        if (model_info and model_info.cost.value == "high")
                        else EffortType.LOW
                    )
                    await token_mgr.consume(token, effort)
                    logger.debug(
                        f"Video completed, recorded usage (effort={effort.value})"
                    )
                except Exception as e:
                    logger.warning(f"Failed to record video usage: {e}")
                return result

            except UpstreamException as e:
                last_error = e
                if rate_limited(e):
                    await token_mgr.mark_rate_limited(token)
                    logger.warning(
                        f"Token {_token_tag(token)} rate limited (429), "
                        f"trying next token (attempt {attempt + 1}/{max_token_retries})"
                    )
                    continue
                msg, code, status = _classify_video_error(e)
                raise AppException(
                    message=msg,
                    error_type=ErrorType.SERVER.value
                    if status >= 500
                    else ErrorType.INVALID_REQUEST.value,
                    code=code,
                    status_code=status,
                )

        if last_error:
            raise last_error
        raise AppException(
            message="No available tokens. Please try again later.",
            error_type=ErrorType.RATE_LIMIT.value,
            code="rate_limit_exceeded",
            status_code=429,
        )


class VideoStreamProcessor(BaseProcessor):
    """Video stream response processor."""

    def __init__(
        self,
        model: str,
        token: str = "",
        show_think: bool = None,
        upscale_on_finish: bool = False,
    ):
        super().__init__(model, token)
        self.response_id: Optional[str] = None
        self.think_opened: bool = False
        self.role_sent: bool = False

        self.show_think = bool(show_think)
        self.upscale_on_finish = bool(upscale_on_finish)

    @staticmethod
    def _extract_video_id(video_url: str) -> str:
        if not video_url:
            return ""
        match = re.search(r"/generated/([0-9a-fA-F-]{32,36})/", video_url)
        if match:
            return match.group(1)
        match = re.search(r"/([0-9a-fA-F-]{32,36})/generated_video", video_url)
        if match:
            return match.group(1)
        return ""

    async def _upscale_video_url(self, video_url: str) -> str:
        if not video_url or not self.upscale_on_finish:
            return video_url
        video_id = self._extract_video_id(video_url)
        if not video_id:
            logger.warning("Video upscale skipped: unable to extract video id")
            return video_url
        try:
            async with ResettableSession() as session:
                response = await VideoUpscaleReverse.request(
                    session, self.token, video_id
                )
            payload = response.json() if response is not None else {}
            hd_url = payload.get("hdMediaUrl") if isinstance(payload, dict) else None
            if hd_url:
                logger.info(f"Video upscale completed: {hd_url}")
                return hd_url
        except Exception as e:
            logger.warning(f"Video upscale failed: {e}")
        return video_url

    def _sse(self, content: str = "", role: str = None, finish: str = None) -> str:
        """Build SSE response."""
        delta = {}
        if role:
            delta["role"] = role
            delta["content"] = ""
        elif content:
            delta["content"] = content

        chunk = {
            "id": self.response_id or f"chatcmpl-{uuid.uuid4().hex[:24]}",
            "object": "chat.completion.chunk",
            "created": self.created,
            "model": self.model,
            "choices": [
                {"index": 0, "delta": delta, "logprobs": None, "finish_reason": finish}
            ],
        }
        return f"data: {orjson.dumps(chunk).decode()}\n\n"

    async def process(
        self, response: AsyncIterable[bytes]
    ) -> AsyncGenerator[str, None]:
        """Process video stream response."""
        idle_timeout = get_config("video.stream_timeout")

        try:
            async for line in _with_idle_timeout(response, idle_timeout, self.model):
                line = _normalize_line(line)
                if not line:
                    continue
                try:
                    data = orjson.loads(line)
                except orjson.JSONDecodeError:
                    continue

                resp = data.get("result", {}).get("response", {})
                is_thinking = bool(resp.get("isThinking"))

                if rid := resp.get("responseId"):
                    self.response_id = rid

                if not self.role_sent:
                    yield self._sse(role="assistant")
                    self.role_sent = True

                if token := resp.get("token"):
                    if is_thinking:
                        if not self.show_think:
                            continue
                        if not self.think_opened:
                            yield self._sse("<think>\n")
                            self.think_opened = True
                    else:
                        if self.think_opened:
                            yield self._sse("\n</think>\n")
                            self.think_opened = False
                    yield self._sse(token)
                    continue

                if video_resp := resp.get("streamingVideoGenerationResponse"):
                    progress = video_resp.get("progress", 0)

                    if is_thinking:
                        if not self.show_think:
                            continue
                        if not self.think_opened:
                            yield self._sse("<think>\n")
                            self.think_opened = True
                    else:
                        if self.think_opened:
                            yield self._sse("\n</think>\n")
                            self.think_opened = False
                    if self.show_think:
                        yield self._sse(f"正在生成视频中，当前进度{progress}%\n")

                    if progress == 100:
                        video_url = video_resp.get("videoUrl", "")
                        thumbnail_url = video_resp.get("thumbnailImageUrl", "")

                        # [NEW] 记录生成的视频对应的 postId 与 token 以备延长
                        video_post_id = video_resp.get(
                            "videoPostId"
                        ) or self._extract_video_id(video_url)
                        if video_post_id and self.token:
                            from app.services.grok.utils.asset_token_map import (
                                AssetTokenMap,
                            )

                            token_map = await AssetTokenMap.get_instance()
                            await token_map.save_mapping(video_post_id, self.token)

                        if self.think_opened:
                            yield self._sse("\n</think>\n")
                            self.think_opened = False

                        if video_url:
                            if self.upscale_on_finish:
                                yield self._sse("正在对视频进行超分辨率\n")
                                video_url = await self._upscale_video_url(video_url)
                            render_started_at = time.perf_counter()
                            logger.info(
                                f"Video render pipeline started: video_url={video_url}, "
                                f"thumbnail_url={thumbnail_url or '-'}, post_id={video_post_id or '-'}"
                            )
                            dl_service = self._get_dl()
                            rendered = await dl_service.render_video(
                                video_url, self.token, thumbnail_url
                            )
                            render_duration_ms = (
                                time.perf_counter() - render_started_at
                            ) * 1000
                            logger.info(
                                f"Video render pipeline completed: rendered={rendered}, "
                                f"post_id={video_post_id or '-'}, duration_ms={render_duration_ms:.2f}"
                            )
                            yield self._sse(rendered)

                            logger.info(
                                f"Video generated: {video_url} (post_id={video_post_id})"
                            )
                    continue

            if self.think_opened:
                yield self._sse("</think>\n")
            yield self._sse(finish="stop")
            yield "data: [DONE]\n\n"
        except asyncio.CancelledError:
            logger.debug(
                "Video stream cancelled by client", extra={"model": self.model}
            )
        except StreamIdleTimeoutError:
            raise AppException(
                message="视频生成失败：网络连接异常，请稍后重试",
                error_type=ErrorType.SERVER.value,
                code="video_network_error",
                status_code=504,
            )
        except RequestsError as e:
            if _is_http2_error(e):
                logger.warning(
                    f"HTTP/2 stream error in video: {e}", extra={"model": self.model}
                )
                raise AppException(
                    message="视频生成失败：网络连接异常，请稍后重试",
                    error_type=ErrorType.SERVER.value,
                    code="video_network_error",
                    status_code=502,
                )
            logger.error(
                f"Video stream request error: {e}", extra={"model": self.model}
            )
            raise AppException(
                message="视频生成失败：网络连接异常，请稍后重试",
                error_type=ErrorType.SERVER.value,
                code="video_network_error",
                status_code=502,
            )
        except Exception as e:
            logger.error(
                f"Video stream processing error: {e}",
                extra={"model": self.model, "error_type": type(e).__name__},
            )
            msg, code, status = _classify_video_error(e)
            raise AppException(
                message=msg,
                error_type=ErrorType.SERVER.value
                if status >= 500
                else ErrorType.INVALID_REQUEST.value,
                code=code,
                status_code=status,
            )
        finally:
            await self.close()


class VideoCollectProcessor(BaseProcessor):
    """Video non-stream response processor."""

    def __init__(self, model: str, token: str = "", upscale_on_finish: bool = False):
        super().__init__(model, token)
        self.upscale_on_finish = bool(upscale_on_finish)

    @staticmethod
    def _extract_video_id(video_url: str) -> str:
        if not video_url:
            return ""
        match = re.search(r"/generated/([0-9a-fA-F-]{32,36})/", video_url)
        if match:
            return match.group(1)
        match = re.search(r"/([0-9a-fA-F-]{32,36})/generated_video", video_url)
        if match:
            return match.group(1)
        return ""

    async def _upscale_video_url(self, video_url: str) -> str:
        if not video_url or not self.upscale_on_finish:
            return video_url
        video_id = self._extract_video_id(video_url)
        if not video_id:
            logger.warning("Video upscale skipped: unable to extract video id")
            return video_url
        try:
            async with ResettableSession() as session:
                response = await VideoUpscaleReverse.request(
                    session, self.token, video_id
                )
            payload = response.json() if response is not None else {}
            hd_url = payload.get("hdMediaUrl") if isinstance(payload, dict) else None
            if hd_url:
                logger.info(f"Video upscale completed: {hd_url}")
                return hd_url
        except Exception as e:
            logger.warning(f"Video upscale failed: {e}")
        return video_url

    async def _resolve_video_asset_path(self, asset_id: str) -> tuple[str, str]:
        """当流里未返回 videoUrl 时，尝试从 assets 接口反查 key。"""
        if not asset_id or not self.token:
            return "", ""

        retries = 3
        delay = 1.5
        page_size = 50
        max_pages = 20
        marker = f"/{asset_id}/"

        async with ResettableSession() as session:
            for attempt in range(1, retries + 1):
                params = {
                    "pageSize": page_size,
                    "orderBy": "ORDER_BY_LAST_USE_TIME",
                    "source": "SOURCE_ANY",
                    "isLatest": "true",
                }
                page_token = ""
                page_count = 0
                try:
                    while True:
                        if page_token:
                            params["pageToken"] = page_token
                        else:
                            params.pop("pageToken", None)

                        response = await AssetsListReverse.request(
                            session, self.token, params
                        )
                        data = response.json() if response is not None else {}
                        assets = (
                            data.get("assets", []) if isinstance(data, dict) else []
                        )

                        for asset in assets:
                            if not isinstance(asset, dict):
                                continue
                            current_asset_id = str(asset.get("assetId", "")).strip()
                            key = str(asset.get("key", "")).strip()
                            mime_type = str(asset.get("mimeType", "")).lower()
                            if (
                                current_asset_id == asset_id
                                or marker in key
                                or key.endswith(f"{asset_id}/content")
                            ):
                                if (
                                    mime_type.startswith("video/")
                                    or "generated_video" in key
                                ):
                                    preview_key = str(
                                        asset.get("previewImageKey", "")
                                    ).strip()
                                    if not preview_key:
                                        aux = asset.get("auxKeys") or {}
                                        if isinstance(aux, dict):
                                            preview_key = str(
                                                aux.get("preview-image", "")
                                            ).strip()
                                    logger.info(
                                        "Video asset resolved by assets list: "
                                        f"asset_id={asset_id}, key={key}, preview={preview_key}"
                                    )
                                    return key, preview_key

                        page_token = str(data.get("nextPageToken", "")).strip()
                        page_count += 1
                        if not page_token or page_count >= max_pages:
                            break
                except Exception as e:
                    logger.warning(
                        f"Video asset resolve failed (attempt={attempt}/{retries}): {e}"
                    )

                if attempt < retries:
                    await asyncio.sleep(delay)

        return "", ""

    async def process(self, response: AsyncIterable[bytes]) -> dict[str, Any]:
        """Process and collect video response."""
        response_id = ""
        content = ""
        fallback_video_id = ""
        fallback_thumb = ""
        idle_timeout = get_config("video.stream_timeout")

        try:
            async for line in _with_idle_timeout(response, idle_timeout, self.model):
                line = _normalize_line(line)
                if not line:
                    continue
                try:
                    data = orjson.loads(line)
                except orjson.JSONDecodeError:
                    continue

                resp = data.get("result", {}).get("response", {})

                if video_resp := resp.get("streamingVideoGenerationResponse"):
                    fallback_video_id = (
                        str(video_resp.get("videoPostId", "")).strip()
                        or str(video_resp.get("assetId", "")).strip()
                        or str(video_resp.get("videoId", "")).strip()
                        or fallback_video_id
                    )
                    thumb_from_stream = str(
                        video_resp.get("thumbnailImageUrl", "")
                    ).strip()
                    if thumb_from_stream:
                        fallback_thumb = thumb_from_stream

                    if video_resp.get("progress") == 100:
                        response_id = resp.get("responseId", "")
                        video_url = video_resp.get("videoUrl", "")
                        thumbnail_url = video_resp.get("thumbnailImageUrl", "")

                        # [NEW] 记录生成的视频对应的 postId 与 token 以备延长
                        if fallback_video_id and self.token:
                            from app.services.grok.utils.asset_token_map import (
                                AssetTokenMap,
                            )

                            token_map = await AssetTokenMap.get_instance()
                            await token_map.save_mapping(fallback_video_id, self.token)

                        if video_url:
                            if self.upscale_on_finish:
                                video_url = await self._upscale_video_url(video_url)
                            render_started_at = time.perf_counter()
                            logger.info(
                                f"Video collect render started: video_url={video_url}, "
                                f"thumbnail_url={thumbnail_url or '-'}, post_id={fallback_video_id or '-'}"
                            )
                            dl_service = self._get_dl()
                            content = await dl_service.render_video(
                                video_url, self.token, thumbnail_url
                            )
                            render_duration_ms = (
                                time.perf_counter() - render_started_at
                            ) * 1000
                            logger.info(
                                f"Video collect render completed: content={content}, "
                                f"post_id={fallback_video_id or '-'}, duration_ms={render_duration_ms:.2f}"
                            )
                            self.video_post_id = fallback_video_id
                            logger.info(
                                f"Video generated: {video_url} (post_id={fallback_video_id})"
                            )
                elif model_resp := resp.get("modelResponse"):
                    file_attachments = model_resp.get("fileAttachments", [])
                    if isinstance(file_attachments, list):
                        for fid in file_attachments:
                            fid = str(fid).strip()
                            if fid:
                                fallback_video_id = fid
                                break

        except asyncio.CancelledError:
            logger.debug(
                "Video collect cancelled by client", extra={"model": self.model}
            )
        except StreamIdleTimeoutError as e:
            logger.warning(
                f"Video collect idle timeout: {e}", extra={"model": self.model}
            )
        except RequestsError as e:
            if _is_http2_error(e):
                logger.warning(
                    f"HTTP/2 stream error in video collect: {e}",
                    extra={"model": self.model},
                )
            else:
                logger.error(
                    f"Video collect request error: {e}", extra={"model": self.model}
                )
        except UpstreamException as e:
            # 对于上游明确返回的业务终止错误（如 moderation 封禁），
            # 不应吞掉并伪装成“空结果”，否则上层会误判为 parentPost 空结果继续下一轮。
            details = getattr(e, "details", {}) or {}
            is_moderated_block = bool(details.get("moderated")) or (
                "blocked by moderation" in str(e).lower()
            )
            if is_moderated_block:
                logger.error(
                    f"Video collect got terminal moderation error: {e}",
                    extra={"model": self.model},
                )
                raise
            logger.error(
                f"Video collect upstream error: {e}",
                extra={"model": self.model, "error_type": type(e).__name__},
            )
        except Exception as e:
            logger.error(
                f"Video collect processing error: {e}",
                extra={"model": self.model, "error_type": type(e).__name__},
            )
        finally:
            await self.close()

        if not content and fallback_video_id:
            asset_video_path, asset_thumb_path = await self._resolve_video_asset_path(
                fallback_video_id
            )
            if asset_video_path:
                if self.upscale_on_finish:
                    asset_video_path = await self._upscale_video_url(asset_video_path)
                render_started_at = time.perf_counter()
                logger.info(
                    f"Video assets fallback render started: video_url={asset_video_path}, "
                    f"thumbnail_url={(asset_thumb_path or fallback_thumb or '-')}, post_id={fallback_video_id}"
                )
                dl_service = self._get_dl()
                content = await dl_service.render_video(
                    asset_video_path, self.token, asset_thumb_path or fallback_thumb
                )
                render_duration_ms = (time.perf_counter() - render_started_at) * 1000
                logger.info(
                    f"Video assets fallback render completed: content={content}, "
                    f"post_id={fallback_video_id}, duration_ms={render_duration_ms:.2f}"
                )
                response_id = response_id or f"chatcmpl-{uuid.uuid4().hex[:24]}"
                logger.info(
                    "Video generated via assets fallback: "
                    f"video_id={fallback_video_id}, key={asset_video_path}"
                )

        return {
            "id": response_id,
            "object": "chat.completion",
            "created": self.created,
            "model": self.model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": content,
                        "refusal": None,
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }


__all__ = ["VideoService"]
