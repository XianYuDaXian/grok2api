"""
视频操作专用 API 路由
"""

import asyncio
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.services.grok.services.video import VideoService
from app.core.auth import verify_api_key
from app.core.logger import logger
from app.core.exceptions import ValidationException
from app.api.v1.chat import _build_streaming_response, _chat_error_as_success_response, _video_error_message

router = APIRouter(tags=["Video"])

class VideoExtendRequest(BaseModel):
    """视频延长请求"""
    model: str = Field("grok-imagine-1.0-video", description="模型名称")
    post_id: str = Field(..., description="原始视频的 post_id")
    prompt: Optional[str] = Field(None, description="延长描述词")
    video_length: Optional[int] = Field(6, description="延长时长 (6/10/15)")
    aspect_ratio: Optional[str] = Field("16:9", description="视频比例")
    resolution: Optional[str] = Field("480p", description="分辨率 (480p/720p)")
    stream: Optional[bool] = Field(True, description="是否流式返回")
    n: Optional[int] = Field(None, ge=1, le=4, description="生成数量 (1-4，仅非流式)")
    concurrent: Optional[int] = Field(None, ge=1, le=4, description="并发视频数 (1-4，仅非流式)")
    video_extension_start_time: Optional[float] = Field(None, description="延长开始时间点")
    stitch_with_extend: Optional[bool] = Field(True, description="是否拼接之前的视频")

@router.post("/video/extend", dependencies=[Depends(verify_api_key)])
async def extend_video(request: VideoExtendRequest, raw_request: Request):
    """专用视频延长接口"""
    logger.info(f"Video extension requested via dedicated API: post_id={request.post_id}")
    
    # 自动偏移并限制 30s 逻辑
    # Grok 延长时长固定为 6s 或 10s，总长上限 30s
    extension_start = request.video_extension_start_time or 0.0
    requested_length = request.video_length or 6

    # 如果用户请求的长超过 30s 剩余空间，则我们将开始时间“往前回拨”以容纳该长度，
    # 但最高不能超过 30s。若回拨到 0 还是放不下，则由底层处理。
    if extension_start + requested_length > 30.0:
        new_start = max(0.0, 30.0 - requested_length)
        logger.info(
            f"Optimizing extension start time: {extension_start}s -> {new_start}s "
            f"to fit {requested_length}s extension (total capped at 30s)"
        )
        extension_start = new_start
    
    video_length = requested_length

    # 构造兼容 VideoService.completions 的参数
    # 如果没有传 prompt，传入 None 或空，VideoService 会处理为默认 animate 指令
    messages = []
    if request.prompt:
        messages.append({"role": "user", "content": request.prompt})
    else:
        # 即使留空，VideoService 也会处理，这里确保至少有一个 user 消息体以便提取
        messages.append({"role": "user", "content": ""})

    video_concurrent = int(request.n or request.concurrent or 1)
    if request.stream and video_concurrent > 1:
        raise ValidationException(
            message="Streaming is only supported when n=1",
            param="n",
            code="invalid_stream_concurrent",
        )

    try:
        async def _run_single(single_stream: bool):
            return await VideoService.completions(
                model=request.model,
                messages=messages,
                stream=single_stream,
                aspect_ratio=request.aspect_ratio or "16:9",
                video_length=video_length,
                resolution=request.resolution or "480p",
                extend_post_id=request.post_id,
                video_extension_start_time=extension_start,
                stitch_with_extend=request.stitch_with_extend,
            )

        if video_concurrent <= 1:
            result = await _run_single(bool(request.stream))
        else:
            results = await asyncio.gather(*[_run_single(False) for _ in range(video_concurrent)])
            merged = dict(results[0]) if results else {
                "id": "",
                "object": "chat.completion",
                "created": 0,
                "model": request.model,
                "choices": [],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            }

            choices = []
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

                usage = item.get("usage", {}) if isinstance(item, dict) else {}
                usage_prompt += int(usage.get("prompt_tokens", 0) or 0)
                usage_completion += int(usage.get("completion_tokens", 0) or 0)
                usage_total += int(usage.get("total_tokens", 0) or 0)

            merged["choices"] = choices
            merged["usage"] = {
                "prompt_tokens": usage_prompt,
                "completion_tokens": usage_completion,
                "total_tokens": usage_total,
            }
            result = merged
        
        if request.stream:
            return _build_streaming_response(result, raw_request, request.model)
        else:
            return result
            
    except Exception as e:
        logger.error(f"Video extension API error: {e}")
        return _chat_error_as_success_response(request.model, _video_error_message(e))
