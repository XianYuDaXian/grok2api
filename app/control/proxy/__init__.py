"""ProxyDirectory — control-plane proxy pool coordinator.

Maintains the list of EgressNodes and ClearanceBundles.
Selection delegates to the dataplane ProxyTable; this module owns
configuration loading and clearance refresh lifecycle.
"""

import asyncio
from typing import Sequence

from app.platform.logging.logger import logger
from app.platform.config.snapshot import get_config
from app.platform.runtime.clock import now_ms
from app.platform.runtime.ids import next_hex
from .models import (
    EgressMode, ClearanceMode,
    EgressNode, ClearanceBundle, ProxyLease, ProxyFeedback,
    ProxyFeedbackKind, EgressNodeState, RequestKind, ProxyScope,
)
from .providers.manual import ManualClearanceProvider
from .providers.flaresolverr import FlareSolverrClearanceProvider


class ProxyDirectory:
    """Owns egress nodes and clearance bundles.

    Thread-safety: all mutations are protected by ``_lock``.
    """

    def __init__(self) -> None:
        self._nodes:          list[EgressNode]          = []
        self._resource_nodes: list[EgressNode]          = []  # for media downloads
        self._bundles:        dict[str, ClearanceBundle] = {}
        self._lock            = asyncio.Lock()
        # Single-flight guard: at most one FlareSolverr call per affinity key.
        # Other coroutines wait on the Event until the active refresh completes.
        self._refresh_events: dict[str, asyncio.Event]  = {}
        self._manual          = ManualClearanceProvider()
        self._flare           = FlareSolverrClearanceProvider()
        self._egress_mode:    EgressMode    = EgressMode.DIRECT
        self._clearance_mode: ClearanceMode = ClearanceMode.NONE
        self._config_sig:     tuple | None  = None
        # Pool cursor for PROXY_POOL mode: sticky routing with failure-driven rotate.
        # Incremented on node failure; all callers see the same cursor under _lock.
        self._pool_cursor:    int           = 0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def load(self) -> None:
        """Load proxy configuration from the current config snapshot."""
        cfg = get_config()
        egress_mode = EgressMode(cfg.get_str("proxy.egress.mode", "direct"))
        clearance_mode = ClearanceMode.parse(cfg.get_str("proxy.clearance.mode", "none"))
        base_url = cfg.get_str("proxy.egress.proxy_url", "")
        res_url = cfg.get_str("proxy.egress.resource_proxy_url", "")
        base_pool = tuple(cfg.get_list("proxy.egress.proxy_pool", []))
        res_pool = tuple(cfg.get_list("proxy.egress.resource_proxy_pool", []))
        config_sig = (
            egress_mode.value,
            clearance_mode.value,
            base_url,
            res_url,
            base_pool,
            res_pool,
            cfg.get_str("proxy.clearance.flaresolverr_url", ""),
            cfg.get_str("proxy.clearance.cf_cookies", ""),
            cfg.get_str("proxy.clearance.user_agent", ""),
            cfg.get_int("proxy.clearance.timeout_sec", 60),
        )

        nodes: list[EgressNode]          = []
        resource_nodes: list[EgressNode] = []

        if egress_mode == EgressMode.SINGLE_PROXY:
            if base_url:
                nodes.append(EgressNode(node_id="single", proxy_url=base_url))
            if res_url:
                resource_nodes.append(EgressNode(node_id="res-single", proxy_url=res_url))

        elif egress_mode == EgressMode.PROXY_POOL:
            for i, url in enumerate(base_pool):
                nodes.append(EgressNode(node_id=f"pool-{i}", proxy_url=url))
            for i, url in enumerate(res_pool):
                resource_nodes.append(EgressNode(node_id=f"res-pool-{i}", proxy_url=url))

        valid_affinities = {
            n.proxy_url or "direct"
            for n in [*nodes, *resource_nodes]
        }
        if not valid_affinities:
            valid_affinities = {"direct"}

        async with self._lock:
            if self._config_sig == config_sig:
                return
            from .models import ClearanceBundleState

            self._egress_mode    = egress_mode
            self._clearance_mode = clearance_mode
            self._nodes          = nodes
            self._resource_nodes = resource_nodes
            self._pool_cursor    = 0
            self._bundles = {
                key: bundle.model_copy(update={"state": ClearanceBundleState.INVALID})
                for key, bundle in self._bundles.items()
                if key in valid_affinities
            }
            self._refresh_events = {
                key: event
                for key, event in self._refresh_events.items()
                if key in valid_affinities
            }
            self._config_sig = config_sig

        logger.info(
            "proxy directory loaded: egress_mode={} clearance_mode={} node_count={} resource_node_count={}",
            egress_mode,
            clearance_mode,
            len(nodes),
            len(resource_nodes),
        )

    # ------------------------------------------------------------------
    # Acquisition
    # ------------------------------------------------------------------

    async def acquire(
        self,
        *,
        scope:    ProxyScope  = ProxyScope.APP,
        kind:     RequestKind = RequestKind.HTTP,
        resource: bool        = False,
    ) -> ProxyLease:
        """Return a ProxyLease for the next request.

        For DIRECT mode, returns a lease with no proxy or clearance.
        """
        proxy_url = await self._pick_proxy_url(resource=resource)
        affinity  = proxy_url or "direct"

        bundle = await self._get_or_build_bundle(affinity_key=affinity, proxy_url=proxy_url or "")

        return ProxyLease(
            lease_id    = next_hex(),
            proxy_url   = proxy_url,
            cf_cookies  = bundle.cf_cookies if bundle else "",
            user_agent  = bundle.user_agent if bundle else "",
            scope       = scope,
            kind        = kind,
            acquired_at = now_ms(),
        )

    async def feedback(self, lease: ProxyLease, result: ProxyFeedback) -> None:
        """Apply upstream feedback to the appropriate egress node."""
        if result.kind in (
            ProxyFeedbackKind.CHALLENGE,
            ProxyFeedbackKind.UNAUTHORIZED,
        ):
            # Invalidate associated clearance bundle.
            affinity = lease.proxy_url or "direct"
            async with self._lock:
                bundle = self._bundles.get(affinity)
                if bundle:
                    from .models import ClearanceBundleState
                    self._bundles[affinity] = bundle.model_copy(
                        update={"state": ClearanceBundleState.INVALID}
                    )

        # In PROXY_POOL mode, rotate to the next node on any failure so the
        # next acquire() prefers a different egress rather than hammering the
        # same broken node.
        if (
            self._egress_mode == EgressMode.PROXY_POOL
            and lease.proxy_url
            and result.kind in (
                ProxyFeedbackKind.CHALLENGE,
                ProxyFeedbackKind.UNAUTHORIZED,
                ProxyFeedbackKind.FORBIDDEN,
                ProxyFeedbackKind.TRANSPORT_ERROR,
            )
        ):
            async with self._lock:
                self._pool_cursor += 1
                logger.debug(
                    "proxy pool cursor advanced: proxy={} kind={} cursor={}",
                    lease.proxy_url, result.kind, self._pool_cursor,
                )

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _pick_proxy_url(self, resource: bool = False) -> str | None:
        if self._egress_mode == EgressMode.DIRECT:
            return None
        async with self._lock:
            # Prefer resource-specific nodes when available; fall back to base nodes.
            nodes = (self._resource_nodes if resource and self._resource_nodes
                     else self._nodes)
            if not nodes:
                return None
            if self._egress_mode == EgressMode.SINGLE_PROXY:
                return nodes[0].proxy_url
            # PROXY_POOL: sticky routing — use current cursor, rotate on failure.
            idx = self._pool_cursor % len(nodes)
            return nodes[idx].proxy_url

    async def _get_or_build_bundle(
        self,
        *,
        affinity_key: str,
        proxy_url:    str,
    ) -> ClearanceBundle | None:
        if self._clearance_mode == ClearanceMode.NONE:
            return None

        # Single-flight: only one coroutine fetches clearance per affinity key.
        # Concurrent callers wait on the Event and retry once it fires.
        while True:
            async with self._lock:
                bundle = self._bundles.get(affinity_key)
                if bundle and bundle.state.value == 0:   # VALID
                    return bundle
                event = self._refresh_events.get(affinity_key)
                if event is None:
                    # This coroutine wins the right to refresh.
                    event = asyncio.Event()
                    self._refresh_events[affinity_key] = event
                    break
            # Another coroutine is already refreshing — wait for it, then retry.
            await event.wait()

        try:
            if self._clearance_mode == ClearanceMode.MANUAL:
                bundle = self._manual.build_bundle(affinity_key=affinity_key)
            else:
                bundle = await self._flare.refresh_bundle(
                    affinity_key = affinity_key,
                    proxy_url    = proxy_url,
                )
            if bundle:
                async with self._lock:
                    self._bundles[affinity_key] = bundle
            return bundle
        finally:
            async with self._lock:
                self._refresh_events.pop(affinity_key, None)
            event.set()  # Wake all waiters so they retry with the new bundle.

    # ------------------------------------------------------------------
    # Clearance lifecycle helpers (used by ProxyClearanceScheduler)
    # ------------------------------------------------------------------

    async def invalidate_clearance(self) -> None:
        """Mark all cached clearance bundles as invalid.

        The next ``acquire()`` call for each affinity key will trigger a fresh
        FlareSolverr fetch (serialised by the single-flight guard).
        """
        from .models import ClearanceBundleState
        async with self._lock:
            self._bundles = {
                k: b.model_copy(update={"state": ClearanceBundleState.INVALID})
                for k, b in self._bundles.items()
            }
        logger.debug("clearance bundles invalidated: count={}", len(self._bundles))

    async def warm_up(self) -> None:
        """Pre-fetch clearance bundles for all configured affinity keys.

        Called once at startup so the first real request does not have to wait
        for FlareSolverr.  Does NOT invalidate existing bundles first.
        """
        if self._clearance_mode == ClearanceMode.NONE:
            return
        async with self._lock:
            nodes = list(self._nodes)
        affinity_keys = (
            [(n.proxy_url or "direct", n.proxy_url or "") for n in nodes]
            if nodes
            else [("direct", "")]
        )
        for affinity, proxy_url in affinity_keys:
            await self._get_or_build_bundle(
                affinity_key = affinity,
                proxy_url    = proxy_url,
            )

    async def refresh_clearance_safe(self) -> None:
        """Scheduled clearance refresh: build new bundles then swap atomically.

        Unlike ``invalidate_clearance() + warm_up()``, this never discards a
        working bundle before a replacement is ready.  If FlareSolverr is
        temporarily unavailable the old bundle remains valid and continues to
        serve requests.
        """
        if self._clearance_mode == ClearanceMode.NONE:
            return
        async with self._lock:
            nodes    = list(self._nodes)
            existing = set(self._bundles.keys())

        affinity_items = (
            [(n.proxy_url or "direct", n.proxy_url or "") for n in nodes]
            if nodes
            else [("direct", "")]
        )
        # Also refresh bundles for keys that no longer have a matching node
        # (e.g. pool was reconfigured) so stale entries get cleaned up.
        all_keys = {a for a, _ in affinity_items} | existing

        for affinity in all_keys:
            proxy_url = "" if affinity == "direct" else affinity
            if self._clearance_mode == ClearanceMode.MANUAL:
                new_bundle = self._manual.build_bundle(affinity_key=affinity)
            else:
                new_bundle = await self._flare.refresh_bundle(
                    affinity_key = affinity,
                    proxy_url    = proxy_url,
                )
            if new_bundle:
                async with self._lock:
                    self._bundles[affinity] = new_bundle
                logger.debug("clearance bundle refreshed: affinity={}", affinity)
            else:
                logger.warning(
                    "clearance refresh failed, keeping old bundle: affinity={}", affinity
                )

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def egress_mode(self) -> EgressMode:
        return self._egress_mode

    @property
    def clearance_mode(self) -> ClearanceMode:
        return self._clearance_mode

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def nodes(self) -> list[EgressNode]:
        """Read-only snapshot of the current egress node list."""
        return list(self._nodes)

    @property
    def bundles(self) -> dict[str, ClearanceBundle]:
        """Read-only snapshot of the current clearance bundles."""
        return dict(self._bundles)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_directory: ProxyDirectory | None = None


async def get_proxy_directory() -> ProxyDirectory:
    """Return the module-level ProxyDirectory, reloading config if it changed."""
    global _directory
    if _directory is None:
        _directory = ProxyDirectory()
    await _directory.load()
    return _directory


__all__ = ["ProxyDirectory", "get_proxy_directory"]
