"""Bounded-concurrency batch processing utility."""

import asyncio
from collections.abc import Awaitable, Callable, Iterable
from typing import Any, TypeVar

T = TypeVar("T")
R = TypeVar("R")


async def run_batch(
    items: Iterable[T],
    handler: Callable[[T], Awaitable[R]],
    *,
    concurrency: int = 10,
    pause_sec: float = 0.0,
    batch_size: int = 0,
) -> list[R]:
    """Process *items* with bounded concurrency.

    Args:
        items: Input sequence.
        handler: Async callable applied to each item.
        concurrency: Maximum simultaneous tasks.
        pause_sec: Sleep between batches (only when *batch_size* > 0).
        batch_size: Group size for inter-batch pauses; 0 = no grouping.

    Returns:
        Results in the same order as *items*.
    """
    item_list = list(items)
    if not item_list:
        return []

    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def _guarded(item: T) -> R:
        async with semaphore:
            return await handler(item)

    if not batch_size or batch_size >= len(item_list):
        return list(await asyncio.gather(*[_guarded(i) for i in item_list]))

    results: list[Any] = []
    for start in range(0, len(item_list), batch_size):
        chunk = item_list[start : start + batch_size]
        chunk_results = await asyncio.gather(*[_guarded(i) for i in chunk])
        results.extend(chunk_results)
        if pause_sec > 0 and start + batch_size < len(item_list):
            await asyncio.sleep(pause_sec)
    return results
