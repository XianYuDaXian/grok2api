"""
NSFW 全流程 API 路由
"""

import re
import asyncio
import math
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import get_config
from app.core.exceptions import AppException, ErrorType, ValidationException
from app.core.logger import logger
from app.services.grok.services.image import ImageGenerationService
from app.services.grok.services.model import ModelService
from app.services.grok.services.video import VideoService, VideoCollectProcessor
from app.services.token import get_token_manager


router = APIRouter(tags=["NSFW"])

RATIO_TO_SIZE = {
    "16:9": "1280x720",
    "9:16": "720x1280",
    "3:2": "1792x1024",
    "2:3": "1024x1792",
    "1:1": "1024x1024",
}


def _tool_error_response(exc: AppException) -> JSONResponse:
    """返回 200 业务错误，避免工具层只看到 HTTP 状态码。"""
    logger.warning(
        "NSFW API business error: "
        f"type={exc.error_type}, code={exc.code}, param={exc.param}, message={exc.message}"
    )
    return JSONResponse(
        status_code=200,
        content={
            "success": False,
            "result": exc.message,
            "error": {
                "message": exc.message,
                "type": exc.error_type,
                "param": exc.param,
                "code": exc.code,
            },
        },
    )

class NSFWRequest(BaseModel):
    """NSFW 全流程请求"""

    image_prompt: str = Field(..., description="图片提示词")
    video_prompt: Optional[str] = Field(None, description="视频提示词（可选）")
    aspect_ratio: Optional[str] = Field(
        None, description="比例: 16:9/9:16/3:2/2:3/1:1"
    )
    ratio: Optional[str] = Field(
        None, description="比例别名: 16:9/9:16/3:2/2:3/1:1"
    )
    size: Optional[str] = Field(
        None,
        description="尺寸别名: 1280x720/720x1280/1792x1024/1024x1792/1024x1024",
    )
    image_parallel: int = Field(4, ge=1, le=8, description="并发生图数")
    video_parallel: int = Field(4, ge=1, le=8, description="并发视频数")
    max_image_attempts: int = Field(20, ge=1, le=50, description="生图最大尝试次数")
    video_length: int = Field(6, ge=5, le=15, description="视频秒数")
    resolution: str = Field("480p", description="视频分辨率: 480p/720p")
    preset: str = Field("spicy", description="视频风格: fun/normal/spicy")
    pro: bool = Field(False, description="质量模式")
    upscale: bool = Field(True, description="视频完成后是否尝试超分")
    image_only: bool = Field(False, description="仅生图不生视频")
    parent_post_only: bool = Field(
        True, description="仅使用 parentPostId 路径，不回退上传图片路径"
    )
    text_video_fallback: bool = Field(
        True, description="parentPostId 空结果时，回退普通文字生视频"
    )
    parent_post_empty_retry: int = Field(
        3, ge=1, le=10, description="parentPostId 空结果重试次数"
    )
    parent_post_empty_retry_delay: float = Field(
        2.0, ge=0.0, le=30.0, description="parentPostId 空结果重试间隔（秒）"
    )


def _normalize_ratio(raw: str) -> str:
    ratio = (raw or "").strip()
    ratio = ratio.replace("：", ":").replace("/", ":").replace(" ", "")
    # 兼容把 16x9 误传成比例写法
    m = re.match(r"^(\d+)[xX](\d+)$", ratio)
    if m:
        ratio = f"{m.group(1)}:{m.group(2)}"
    if ratio not in RATIO_TO_SIZE:
        raise ValidationException(
            message="aspect_ratio must be one of 16:9/9:16/3:2/2:3/1:1",
            param="aspect_ratio",
            code="invalid_aspect_ratio",
        )
    return ratio


def _resolve_ratio(data: NSFWRequest) -> str:
    """兼容 aspect_ratio / ratio / size 三种输入方式。"""
    raw_ratio = (data.aspect_ratio or "").strip() or (data.ratio or "").strip()
    raw_ratio = raw_ratio.replace("：", ":").replace("/", ":")
    if not raw_ratio:
        # 兼容把 size 直接传成比例字符串（如 16:9）
        maybe_ratio_in_size = (data.size or "").strip()
        maybe_ratio_in_size = maybe_ratio_in_size.replace("：", ":").replace("/", ":")
        if ":" in maybe_ratio_in_size:
            raw_ratio = maybe_ratio_in_size
    if raw_ratio:
        return _normalize_ratio(raw_ratio)

    raw_size = (data.size or "").strip()
    raw_size = raw_size.replace("：", ":").replace("*", "x")
    if raw_size:
        # 先精确映射常见尺寸
        for ratio, size in RATIO_TO_SIZE.items():
            if size == raw_size:
                return ratio

        # 再兼容任意 WxH（如 1536x864）
        m = re.match(r"^\s*(\d+)\s*[xX]\s*(\d+)\s*$", raw_size)
        if m:
            w = int(m.group(1))
            h = int(m.group(2))
            if w > 0 and h > 0:
                v = w / h
                candidates = {
                    "16:9": 16 / 9,
                    "9:16": 9 / 16,
                    "3:2": 3 / 2,
                    "2:3": 2 / 3,
                    "1:1": 1.0,
                }
                # 选最近的合法比例
                return min(candidates.keys(), key=lambda k: math.fabs(candidates[k] - v))

    return "2:3"


def _normalize_image_url(url: str) -> str:
    app_url = (get_config("app.app_url") or "").strip().rstrip("/")
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if not url.startswith("/"):
        url = f"/{url}"
    if app_url:
        return f"{app_url}{url}"
    return url


def _extract_video_urls(content: str) -> tuple[str, str]:
    if not content:
        return "", ""
    src_match = re.search(r'<source[^>]+src="([^"]+)"', content, re.IGNORECASE)
    poster_match = re.search(r'poster="([^"]+)"', content, re.IGNORECASE)
    video_url = src_match.group(1) if src_match else ""
    poster_url = poster_match.group(1) if poster_match else ""
    if (not video_url) and content.startswith(("http://", "https://")):
        video_url = content.strip()
    return video_url, poster_url


def _clean_url(url: str) -> str:
    """清洗 URL 末尾脏字符，避免客户端误请求。"""
    value = (url or "").strip().strip('"').strip("'")
    value = value.rstrip("\\")
    return value


def _extract_parent_post_id(image_url: str) -> str:
    """从本地图片 URL 中提取 parentPostId 候选值。"""
    if not image_url:
        return ""
    # 形如: /v1/files/image/<uuid>-final.jpg
    m = re.search(
        r"/v1/files/image/([0-9a-fA-F-]{32,36})(?:-[a-z]+)?\.(?:jpg|jpeg|png|webp)$",
        image_url,
    )
    if m:
        return m.group(1)
    # 兜底: 任意位置的 uuid
    m = re.search(r"([0-9a-fA-F-]{32,36})", image_url)
    if m:
        return m.group(1)
    return ""


def _build_imagine_public_url(parent_post_id: str) -> str:
    """根据 image_id / parentPostId 生成 imagine-public 图片 URL。"""
    if not parent_post_id:
        return ""
    return f"https://imagine-public.x.ai/imagine-public/images/{parent_post_id}.jpg"


def _token_tag(token: str) -> str:
    raw = token[4:] if token.startswith("sso=") else token
    if not raw:
        return "empty"
    if len(raw) <= 14:
        return raw
    return f"{raw[:6]}...{raw[-6:]}"


async def _pick_image_token() -> tuple[Any, str]:
    token_mgr = await get_token_manager()
    await token_mgr.reload_if_stale()
    token = None
    for pool_name in ModelService.pool_candidates_for_model("grok-imagine-1.0"):
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
    return token_mgr, token


async def _generate_nsfw_inner(data: NSFWRequest) -> Dict[str, Any]:
    """
    NSFW 全流程：
    1) 并发生图（最多 max_image_attempts 轮）
    2) 选第一张图生视频（可关闭）
    3) 返回本地 URL 与汇总文本
    """
    if not data.image_prompt or not data.image_prompt.strip():
        raise ValidationException(
            message="image_prompt cannot be empty",
            param="image_prompt",
            code="empty_image_prompt",
        )

    ratio = _resolve_ratio(data)
    image_prompt = data.image_prompt.strip()
    raw_video_prompt = (data.video_prompt or "").strip()
    video_prompt_is_custom = VideoService.is_meaningful_video_prompt(raw_video_prompt)
    video_prompt = raw_video_prompt if video_prompt_is_custom else ""
    fields_set = set(getattr(data, "model_fields_set", set()))
    effective_resolution = data.resolution
    effective_video_length = data.video_length

    logger.info(
        f"NSFW start: ratio={ratio}, image_parallel={data.image_parallel}, "
        f"max_image_attempts={data.max_image_attempts}, image_only={data.image_only}, "
        f"parent_post_only={data.parent_post_only}, "
        f"text_video_fallback={data.text_video_fallback}, "
        f"parent_post_empty_retry={data.parent_post_empty_retry}, "
        f"parent_post_empty_retry_delay={data.parent_post_empty_retry_delay}"
    )
    logger.info(
        f"NSFW ratio input: aspect_ratio={data.aspect_ratio}, ratio={data.ratio}, size={data.size}"
    )
    logger.info(f"NSFW image prompt: {image_prompt[:120]}")
    logger.info(f"NSFW video prompt: {video_prompt[:120]}")
    logger.info(
        "NSFW video config: "
        f"resolution={effective_resolution}, video_length={effective_video_length}, "
        f"upscale={data.upscale}, fields_set={sorted(fields_set)}"
    )
    if raw_video_prompt and not video_prompt_is_custom:
        logger.info(
            "NSFW video prompt treated as generic, force spicy mode with image-url-only message"
        )
    if not video_prompt_is_custom:
        logger.info(
            "NSFW video prompt absent or generic, force spicy mode with image-url-only message"
        )

    token_mgr, token = await _pick_image_token()
    model_info = ModelService.get("grok-imagine-1.0")
    if not model_info:
        raise AppException(
            message="Model grok-imagine-1.0 not found",
            error_type=ErrorType.SERVER.value,
            code="model_not_found",
            status_code=500,
        )

    image_service = ImageGenerationService()
    images: List[str] = []
    seen = set()

    async def _generate_one() -> List[str]:
        result = await image_service.generate(
            token_mgr=token_mgr,
            token=token,
            model_info=model_info,
            prompt=image_prompt,
            n=1,
            response_format="url",
            size=RATIO_TO_SIZE[ratio],
            aspect_ratio=ratio,
            stream=False,
            enable_nsfw=True,
            enable_pro=data.pro,
        )
        images_batch: List[str] = []
        if isinstance(result.data, list) and result.data:
            for item in result.data:
                if item and item != "error":
                    images_batch.append(_normalize_image_url(item))
        return images_batch

    for attempt in range(1, data.max_image_attempts + 1):
        remain = max(1, data.image_parallel - len(images))
        tasks = [_generate_one() for _ in range(remain)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        new_count = 0
        for item in results:
            if isinstance(item, Exception):
                logger.warning(f"NSFW image attempt failed: {item}")
                continue
            batch_images = item if isinstance(item, list) else ([item] if item else [])
            for image_url in batch_images:
                if image_url and image_url not in seen:
                    seen.add(image_url)
                    images.append(image_url)
                    new_count += 1
        logger.info(
            f"NSFW image attempt {attempt}/{data.max_image_attempts}: +{new_count}, total={len(images)}"
        )
        if len(images) >= data.image_parallel:
            break

    if not images:
        raise AppException(
            message="NSFW image generation failed after retries",
            error_type=ErrorType.SERVER.value,
            code="nsfw_image_failed",
            status_code=502,
        )

    response_payload: Dict[str, Any] = {
        "image_prompt": image_prompt,
        "video_prompt": video_prompt,
        "aspect_ratio": ratio,
        "images": images,
        "videos": [],
    }

    if data.image_only:
        lines = [
            f"图片提示词: {image_prompt}",
            f"比例: {ratio}",
            "返回链接:",
        ]
        for idx, u in enumerate(images, 1):
            lines.append(f"{idx}. {u}")
        text = "\n".join(lines)
        response_payload["result"] = text
        return response_payload

    sem = asyncio.Semaphore(max(1, data.video_parallel))

    # 为并发视频任务预分配不同 token，避免并行任务争抢同一 token。
    video_pool_candidates = ModelService.pool_candidates_for_model("grok-imagine-1.0-video")
    used_video_tokens: set[str] = set()
    video_task_tokens: list[str] = []
    for idx in range(len(images)):
        token_info = token_mgr.get_token_for_video(
            resolution=effective_resolution,
            video_length=effective_video_length,
            pool_candidates=video_pool_candidates,
            exclude=used_video_tokens,
        )
        if not token_info:
            raise AppException(
                message=(
                    "No enough distinct tokens for parallel video generation. "
                    "Please reduce video_parallel or add more tokens."
                ),
                error_type=ErrorType.RATE_LIMIT.value,
                code="insufficient_distinct_video_tokens",
                status_code=429,
            )
        task_token = token_info.token[4:] if token_info.token.startswith("sso=") else token_info.token
        used_video_tokens.add(task_token)
        video_task_tokens.append(task_token)
        pool_name = token_mgr.get_pool_name_for_token(task_token) or "unknown"
        logger.info(
            f"NSFW video token assigned: task={idx + 1}, pool={pool_name}, token={_token_tag(task_token)}"
        )

    async def _gen_video(image_url: str, index: int, task_token: str) -> Dict[str, Any]:
        async with sem:
            task_tag = f"task={index}, token={_token_tag(task_token)}"
            logger.info(f"NSFW video start: {task_tag}, image={image_url[:120]}")
            parent_post_id = _extract_parent_post_id(image_url)
            # 对齐你的规则：
            # - 有视频提示词: mode=custom
            # - 无视频提示词: mode=extremely-spicy-or-crazy
            # 这里保留 task_preset 仅用于兼容旧调用链，不再作为最终 mode 决策依据。
            task_mode = "custom" if video_prompt_is_custom else "extremely-spicy-or-crazy"
            task_preset = "custom" if video_prompt_is_custom else "spicy"
            task_prompt = video_prompt if video_prompt_is_custom else ""
            logger.info(
                "NSFW video mode resolved: "
                f"{task_tag}, mode={task_mode}, "
                f"video_prompt_custom={video_prompt_is_custom}, "
                f"video_prompt_raw_provided={bool(raw_video_prompt)}"
            )
            try:
                raw_video_response: Dict[str, Any] = {}
                video_content = ""
                video_url = ""
                poster_url = ""

                # 优先直接用 parentPostId 生视频，避免额外上传图片。
                used_parent_post = False
                if parent_post_id:
                    source_image_url = _build_imagine_public_url(parent_post_id)
                    logger.info(
                        "NSFW video parentPostId path: "
                        f"{task_tag}, parent_post_id={parent_post_id}, source_image_url={source_image_url}"
                    )
                    used_parent_post = True
                    for p_attempt in range(1, data.parent_post_empty_retry + 1):
                        response_stream = await VideoService().generate_from_parent_post(
                            token=task_token,
                            prompt=task_prompt,
                            parent_post_id=parent_post_id,
                            source_image_url=source_image_url,
                            aspect_ratio=ratio,
                            video_length=effective_video_length,
                            resolution=effective_resolution,
                            preset=task_preset,
                        )
                        processor = VideoCollectProcessor(
                            "grok-imagine-1.0-video",
                            task_token,
                            upscale_on_finish=data.upscale,
                        )
                        raw_video_response = await processor.process(response_stream)
                        video_content = (
                            raw_video_response.get("choices", [{}])[0]
                            .get("message", {})
                            .get("content", "")
                        )
                        # [NEW] 优先从返回结果或处理器中提取 post_id
                        task_post_id = raw_video_response.get("post_id") or getattr(processor, "video_post_id", parent_post_id)
                        
                        video_url, poster_url = _extract_video_urls(video_content)
                        if video_url:
                            break
                        logger.warning(
                            "NSFW video parentPostId empty result, retrying parentPost mode: "
                            f"{task_tag}, attempt={p_attempt}/{data.parent_post_empty_retry}"
                        )
                        if p_attempt < data.parent_post_empty_retry:
                            await asyncio.sleep(data.parent_post_empty_retry_delay)
                else:
                    logger.warning(
                        f"NSFW video parentPostId unavailable, fallback upload path: {task_tag}"
                    )
                    response_stream = await VideoService().generate_from_image(
                        token=task_token,
                        prompt=task_prompt,
                        image_url=image_url,
                        aspect_ratio=ratio,
                        video_length=effective_video_length,
                        resolution=effective_resolution,
                        preset=task_preset,
                    )
                    processor = VideoCollectProcessor(
                        "grok-imagine-1.0-video",
                        task_token,
                        upscale_on_finish=data.upscale,
                    )
                    raw_video_response = await processor.process(response_stream)
                    video_content = (
                        raw_video_response.get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                    )
                    # [NEW] 提取 post_id
                    task_post_id = raw_video_response.get("post_id") or getattr(processor, "video_post_id", "")

                    video_url, poster_url = _extract_video_urls(video_content)

                # parentPostId 路径无产出时，自动降级到上传图片路径重试一次
                if used_parent_post and not video_url:
                    if data.text_video_fallback:
                        logger.warning(
                            "NSFW video parentPostId empty result, fallback text2video path: "
                            f"{task_tag}"
                        )
                        text_video_prompt = (
                            f"{_build_imagine_public_url(parent_post_id)} {task_prompt}".strip()
                        )
                        response_stream = await VideoService().generate(
                            token=task_token,
                            prompt=text_video_prompt,
                            aspect_ratio=ratio,
                            video_length=effective_video_length,
                            resolution_name=effective_resolution,
                            preset=task_preset,
                        )
                        processor = VideoCollectProcessor(
                            "grok-imagine-1.0-video",
                            task_token,
                            upscale_on_finish=data.upscale,
                        )
                        raw_video_response = await processor.process(response_stream)
                        video_content = (
                            raw_video_response.get("choices", [{}])[0]
                            .get("message", {})
                            .get("content", "")
                        )
                        # [NEW] 提取 post_id
                        task_post_id = raw_video_response.get("post_id") or getattr(processor, "video_post_id", task_post_id)

                        video_url, poster_url = _extract_video_urls(video_content)

                    if data.parent_post_only:
                        if not video_url:
                            logger.warning(
                                "NSFW video parentPostId empty result, keep parentPost-only mode: "
                                f"{task_tag}"
                            )
                    else:
                        if not video_url:
                            logger.warning(
                                f"NSFW video parentPostId empty result, fallback upload path: {task_tag}"
                            )
                            response_stream = await VideoService().generate_from_image(
                                token=task_token,
                                prompt=task_prompt,
                                image_url=image_url,
                                aspect_ratio=ratio,
                                video_length=effective_video_length,
                                resolution=effective_resolution,
                                preset=task_preset,
                            )
                            processor = VideoCollectProcessor(
                                "grok-imagine-1.0-video",
                                task_token,
                                upscale_on_finish=data.upscale,
                            )
                            raw_video_response = await processor.process(response_stream)
                            video_content = (
                                raw_video_response.get("choices", [{}])[0]
                                .get("message", {})
                                .get("content", "")
                            )
                            # [NEW] 提取 post_id
                            task_post_id = raw_video_response.get("post_id") or getattr(processor, "video_post_id", task_post_id)

                            video_url, poster_url = _extract_video_urls(video_content)
                if used_parent_post and data.parent_post_only and not video_url:
                    return {
                        "index": index,
                        "image_url": image_url,
                        "parent_post_id": parent_post_id,
                        "error": "parent_post_video_not_ready",
                        "url": "",
                        "poster_url": "",
                        "content": video_content,
                    }
                return {
                    "index": index,
                    "image_url": image_url,
                    "content": video_content,
                    "url": _clean_url(video_url),
                    "poster_url": _clean_url(poster_url),
                    "parent_post_id": parent_post_id,
                }
            except Exception as e:
                logger.warning(f"NSFW video failed: {task_tag}, error={e}")
                # 从 processor 中尝试挽救 post_id (内部记录用，不再返回)
                rescue_post_id = getattr(locals().get("processor"), "video_post_id", "") or task_post_id
                return {
                    "index": index,
                    "image_url": image_url,
                    "parent_post_id": parent_post_id,
                    "error": str(e),
                    "url": "",
                    "poster_url": "",
                    "content": "",
                }

    video_tasks = [
        _gen_video(image_url, idx + 1, video_task_tokens[idx])
        for idx, image_url in enumerate(images)
    ]
    video_results = await asyncio.gather(*video_tasks, return_exceptions=False)
    response_payload["videos"] = video_results

    # 只输出干净链接，避免原始 JSON 被客户端二次提取造成重复脏链接。
    clean_links: List[str] = []
    seen_links: set[str] = set()

    for u in images:
        cu = _clean_url(u)
        if cu and cu not in seen_links:
            seen_links.add(cu)
            clean_links.append(cu)

    for item in video_results:
        for k in ("url", "poster_url"):
            cu = _clean_url(item.get(k, ""))
            if cu and cu not in seen_links:
                seen_links.add(cu)
                clean_links.append(cu)

    lines = ["返回链接:"]
    for idx, u in enumerate(clean_links, 1):
        lines.append(f"{idx}. {u}")

    response_payload["result"] = "\n".join(lines)
    return response_payload


@router.post("/nsfw")
async def generate_nsfw(data: NSFWRequest, request: Request) -> Dict[str, Any]:
    task = asyncio.create_task(_generate_nsfw_inner(data))
    try:
        while True:
            done, _ = await asyncio.wait({task}, timeout=0.2)
            if done:
                break
            if await request.is_disconnected():
                logger.info(
                    "NSFW interrupted by client disconnect: "
                    f"aspect_ratio={data.aspect_ratio}, ratio={data.ratio}, size={data.size}, "
                    f"image_parallel={data.image_parallel}, "
                    f"video_parallel={data.video_parallel}"
                )
                task.cancel()
                raise HTTPException(status_code=499, detail="client_closed")
        return await task
    except AppException as exc:
        if not task.done():
            task.cancel()
        return _tool_error_response(exc)
    except asyncio.CancelledError:
        logger.info("NSFW task cancelled after disconnect")
        raise HTTPException(status_code=499, detail="client_closed")
    except Exception as exc:
        if not task.done():
            task.cancel()
        logger.exception(f"NSFW unexpected error: {exc}")
        return _tool_error_response(
            AppException(
                message="NSFW processing failed due to internal error",
                error_type=ErrorType.SERVER.value,
                code="nsfw_internal_error",
                status_code=500,
            )
        )
    finally:
        if not task.done():
            logger.info("NSFW force-cancel unfinished task")
            task.cancel()
