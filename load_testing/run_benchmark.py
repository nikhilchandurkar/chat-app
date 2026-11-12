"""
Progressive HTTP + WebSocket load benchmark orchestrator for ChitChat.
Runs Stage A -> D load steps from an external machine against https://chat-nikkiii.duckdns.org,
collects per-endpoint HTTP + WebSocket delivery histograms and server telemetry,
enforces automatic circuit-breaker safety limits, writes compressed JSON/CSV artifacts,
and persists aggregated metrics into the isolated `performance_test` MySQL schema.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import gzip
import json
import math
import ssl
import subprocess
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiohttp
import websockets

from db_manager import BenchmarkRecorder, apply_migrations, open_mysql_tunnel
from monitor import SafetyThresholds, ServerResourceMonitor


RESULTS_DIR = Path(__file__).resolve().parent / "results"
DEFAULT_TOKENS_FILE = RESULTS_DIR / "test_users.json"


def _percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return round(sorted_vals[0], 2)
    idx = (len(sorted_vals) - 1) * (p / 100.0)
    lo = int(math.floor(idx))
    hi = min(len(sorted_vals) - 1, lo + 1)
    frac = idx - lo
    val = sorted_vals[lo] * (1.0 - frac) + sorted_vals[hi] * frac
    return round(val, 2)


@dataclass
class EndpointStats:
    latencies_ms: list[float] = field(default_factory=list)
    total: int = 0
    success: int = 0
    failed: int = 0
    http_4xx: int = 0
    http_5xx: int = 0
    timeouts: int = 0
    errors: dict[str, int] = field(default_factory=lambda: defaultdict(int))

    def record(self, status_code: int | None, elapsed_ms: float, err_desc: str | None = None) -> None:
        self.total += 1
        self.latencies_ms.append(elapsed_ms)
        if status_code is None:
            self.failed += 1
            if err_desc and "timeout" in err_desc.lower():
                self.timeouts += 1
            self.errors[err_desc or "ConnectionError"] += 1
        elif 200 <= status_code < 400:
            self.success += 1
        else:
            self.failed += 1
            if 400 <= status_code < 500:
                self.http_4xx += 1
            elif status_code >= 500:
                self.http_5xx += 1
            self.errors[f"HTTP_{status_code}"] += 1

    def summary(self, elapsed_sec: float, endpoint_name: str) -> dict[str, Any]:
        vals = sorted(self.latencies_ms)
        avg = round(sum(vals) / len(vals), 2) if vals else 0.0
        rps = round(self.total / max(elapsed_sec, 0.001), 2)
        return {
            "endpoint": endpoint_name,
            "total_requests": self.total,
            "successful_requests": self.success,
            "failed_requests": self.failed,
            "http_4xx_count": self.http_4xx,
            "http_5xx_count": self.http_5xx,
            "timeout_count": self.timeouts,
            "requests_per_second": rps,
            "average_latency_ms": avg,
            "min_latency_ms": round(vals[0], 2) if vals else 0.0,
            "p50_ms": _percentile(vals, 50),
            "p75_ms": _percentile(vals, 75),
            "p90_ms": _percentile(vals, 90),
            "p95_ms": _percentile(vals, 95),
            "p99_ms": _percentile(vals, 99),
            "max_latency_ms": round(vals[-1], 2) if vals else 0.0,
        }


@dataclass
class WsAccumulator:
    attempted: int = 0
    succeeded: int = 0
    failed: int = 0
    current_active: int = 0
    peak_active: int = 0
    disconnects: int = 0
    reconnect_attempts: int = 0
    reconnect_successes: int = 0
    slow_consumers: int = 0
    unauthorized_leaks: int = 0
    connect_ms: list[float] = field(default_factory=list)
    ack_ms: list[float] = field(default_factory=list)
    delivery_ms: list[float] = field(default_factory=list)
    messages_sent: int = 0
    messages_received: int = 0
    pending_ack: dict[str, int] = field(default_factory=dict)
    pending_send_ns: dict[str, int] = field(default_factory=dict)
    errors: dict[str, int] = field(default_factory=lambda: defaultdict(int))


def _get_git_sha() -> str:
    try:
        res = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except Exception:
        return "unknown"


async def _do_http(
    session: aiohttp.ClientSession,
    stats_map: dict[str, EndpointStats],
    endpoint_label: str,
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    json_body: dict | None = None,
    data_body: Any = None,
) -> tuple[int | None, dict | None]:
    t0 = time.perf_counter()
    try:
        async with session.request(method, url, headers=headers, json=json_body, data=data_body) as resp:
            raw = await resp.read()
            dt = (time.perf_counter() - t0) * 1000.0
            stats_map[endpoint_label].record(resp.status, dt)
            try:
                parsed = json.loads(raw) if raw else None
            except Exception:
                parsed = None
            return resp.status, parsed
    except asyncio.TimeoutError:
        dt = (time.perf_counter() - t0) * 1000.0
        stats_map[endpoint_label].record(None, dt, "TimeoutError")
        return None, None
    except Exception as exc:
        dt = (time.perf_counter() - t0) * 1000.0
        stats_map[endpoint_label].record(None, dt, type(exc).__name__)
        return None, None


async def _ws_user_session(
    idx: int,
    user: dict,
    ws_base_url: str,
    ssl_ctx: ssl.SSLContext | None,
    acc: WsAccumulator,
    stop_event: asyncio.Event,
    start_delay: float,
    end_time: float,
    is_secondary_device: bool = False,
) -> None:
    if start_delay > 0:
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=start_delay)
            return
        except asyncio.TimeoutError:
            pass

    if stop_event.is_set() or time.monotonic() >= end_time:
        return

    token = user["access_token"]
    ws_url = f"{ws_base_url}/ws/chat/?token={token}"
    allowed_chats = {c for c in (user.get("direct_chat_id"), user.get("group_chat_id")) if c}
    direct_chat = user.get("direct_chat_id")
    group_chat = user.get("group_chat_id")

    acc.attempted += 1
    t_conn0 = time.perf_counter()
    ws = None
    try:
        ws = await websockets.connect(
            ws_url,
            ssl=ssl_ctx if ws_url.startswith("wss://") else None,
            open_timeout=20,
            close_timeout=4,
            ping_interval=None,
            max_queue=64,
        )
        acc.connect_ms.append((time.perf_counter() - t_conn0) * 1000.0)
        acc.succeeded += 1
        acc.current_active += 1
        if acc.current_active > acc.peak_active:
            acc.peak_active = acc.current_active
    except Exception as exc:
        acc.failed += 1
        acc.errors[f"ws_connect:{type(exc).__name__}"] += 1
        return

    async def _recv_loop() -> None:
        try:
            async for raw in ws:
                if stop_event.is_set():
                    break
                try:
                    pkt = json.loads(raw)
                except Exception:
                    continue
                ev = pkt.get("event") or pkt.get("type")
                data = pkt.get("data") if isinstance(pkt.get("data"), dict) else pkt

                if ev == "message.ack":
                    cmid = data.get("client_message_id")
                    if cmid and cmid in acc.pending_ack:
                        t_ack = time.perf_counter_ns()
                        acc.ack_ms.append((t_ack - acc.pending_ack.pop(cmid)) / 1e6)
                elif ev in ("message.created", "NEW_MESSAGE"):
                    acc.messages_received += 1
                    conv_id = str(data.get("chatId") or data.get("conversation_id") or "")
                    if conv_id and allowed_chats and conv_id not in allowed_chats:
                        acc.unauthorized_leaks += 1
                    cmid = data.get("client_message_id")
                    if not cmid and isinstance(data.get("message"), dict):
                        cmid = data["message"].get("client_message_id")
                    if cmid and cmid in acc.pending_send_ns:
                        acc.delivery_ms.append((time.perf_counter_ns() - acc.pending_send_ns[cmid]) / 1e6)
        except websockets.exceptions.ConnectionClosed:
            if not stop_event.is_set() and time.monotonic() < end_time:
                acc.disconnects += 1
        except Exception as exc:
            acc.errors[f"ws_recv:{type(exc).__name__}"] += 1

    recv_task = asyncio.create_task(_recv_loop())
    try:
        # Realistic cadence: keep presence alive, type/read/send messages periodically
        if not is_secondary_device and direct_chat and idx % 2 == 0:
            step = 0
            while not stop_event.is_set() and time.monotonic() < end_time:
                await asyncio.sleep(1.5 + (idx % 5) * 0.25)
                if stop_event.is_set() or time.monotonic() >= end_time:
                    break
                if step % 3 == 0:
                    await ws.send(json.dumps({"event": "typing.start", "data": {"chatId": direct_chat}}))
                    await asyncio.sleep(0.2)
                    await ws.send(json.dumps({"event": "typing.stop", "data": {"chatId": direct_chat}}))

                target_chat = group_chat if (group_chat and step % 4 == 3) else direct_chat
                cmid = f"lt_{idx}_{step}_{uuid.uuid4().hex[:8]}"
                now_ns = time.perf_counter_ns()
                acc.pending_ack[cmid] = now_ns
                acc.pending_send_ns[cmid] = now_ns
                acc.messages_sent += 1
                await ws.send(json.dumps({
                    "event": "message.create",
                    "data": {
                        "chatId": target_chat,
                        "message": f"LT msg {step}",
                        "client_message_id": cmid,
                    },
                }))
                step += 1
        else:
            # Receiver / passive presence + heartbeat ping
            while not stop_event.is_set() and time.monotonic() < end_time:
                await asyncio.sleep(5.0)
                if stop_event.is_set() or time.monotonic() >= end_time:
                    break
                await ws.send(json.dumps({"type": "ping"}))
    except Exception:
        if not stop_event.is_set() and time.monotonic() < end_time:
            acc.disconnects += 1
    finally:
        acc.current_active = max(0, acc.current_active - 1)
        try:
            await ws.close()
        except Exception:
            pass
        recv_task.cancel()
        try:
            await recv_task
        except asyncio.CancelledError:
            pass


async def _http_user_loop(
    idx: int,
    user: dict,
    base_url: str,
    session: aiohttp.ClientSession,
    stats_map: dict[str, EndpointStats],
    stop_event: asyncio.Event,
    start_delay: float,
    end_time: float,
    include_login_sample: bool,
) -> None:
    if start_delay > 0:
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=start_delay)
            return
        except asyncio.TimeoutError:
            pass

    headers = {"Authorization": f"Bearer {user['access_token']}"}
    direct_chat = user.get("direct_chat_id")
    peer_id = user.get("peer_id")
    cycle = 0

    # Dedicated login + token refresh test for a realistic login slice
    if include_login_sample and not stop_event.is_set() and time.monotonic() < end_time:
        status, data = await _do_http(
            session,
            stats_map,
            "POST /api/v1/auth/login",
            "POST",
            f"{base_url}/api/v1/auth/login",
            json_body={
                "username": user["username"],
                "password": user["password"],
                "device_id": f"lt-dev-{idx}",
                "platform": "web",
            },
        )
        if status == 200 and data and data.get("refreshToken"):
            await _do_http(
                session,
                stats_map,
                "POST /api/v1/auth/refresh",
                "POST",
                f"{base_url}/api/v1/auth/refresh",
                json_body={"refreshToken": data["refreshToken"]},
            )

    while not stop_event.is_set() and time.monotonic() < end_time:
        # Rotate through realistic chat user actions
        action = cycle % 7
        if action == 0:
            await _do_http(session, stats_map, "GET /api/v1/chat/my", "GET", f"{base_url}/api/v1/chat/my", headers=headers)
        elif action == 1 and direct_chat:
            await _do_http(
                session, stats_map, "GET /api/v1/chat/message/:id", "GET",
                f"{base_url}/api/v1/chat/message/{direct_chat}?page=1&limit=25", headers=headers,
            )
        elif action == 2 and direct_chat:
            await _do_http(
                session, stats_map, "POST /api/v1/message/send", "POST",
                f"{base_url}/api/v1/message/send", headers=headers,
                json_body={
                    "chatId": direct_chat,
                    "message": f"REST msg {idx}-{cycle}",
                    "client_message_id": f"rest_{idx}_{cycle}_{uuid.uuid4().hex[:6]}",
                },
            )
        elif action == 3:
            await _do_http(session, stats_map, "GET /api/v1/user/me", "GET", f"{base_url}/api/v1/user/me", headers=headers)
        elif action == 4:
            await _do_http(
                session, stats_map, "GET /api/v1/user/search", "GET",
                f"{base_url}/api/v1/user/search?name=lt_user_{(idx % 50) + 1:05d}", headers=headers,
            )
        elif action == 5:
            await _do_http(session, stats_map, "GET /api/v1/chat/my/groups", "GET", f"{base_url}/api/v1/chat/my/groups", headers=headers)
            if peer_id and cycle == 5:
                await _do_http(
                    session, stats_map, "POST /api/v1/chat/direct", "POST",
                    f"{base_url}/api/v1/chat/direct", headers=headers, json_body={"userId": peer_id},
                )
        elif action == 6:
            await _do_http(session, stats_map, "GET /api/v1/user/notifications", "GET", f"{base_url}/api/v1/user/notifications", headers=headers)
            if direct_chat and idx % 20 == 0 and cycle < 14:
                form = aiohttp.FormData()
                form.add_field("chatId", direct_chat)
                form.add_field("message", "lt attachment")
                form.add_field("client_message_id", f"att_{idx}_{cycle}_{uuid.uuid4().hex[:6]}")
                form.add_field("file", b"lt_sample_payload_128bytes" * 4, filename=f"lt_probe_{idx}.txt", content_type="text/plain")
                await _do_http(session, stats_map, "POST /api/v1/message/send[file]", "POST", f"{base_url}/api/v1/message/send", headers=headers, data_body=form)

        cycle += 1
        await asyncio.sleep(1.0 + (idx % 4) * 0.25)


async def run_stage(
    target_users: int,
    base_url: str,
    ws_base_url: str,
    users_pool: list[dict],
    ramp_up_sec: float,
    duration_sec: float,
    monitor: ServerResourceMonitor,
    verify_ssl: bool = True,
) -> dict[str, Any]:
    stop_event = asyncio.Event()
    stop_reasons: list[str] = []

    def _on_monitor_stop(reason: str) -> None:
        if reason not in stop_reasons:
            stop_reasons.append(reason)
        stop_event.set()

    monitor.on_stop_triggered = _on_monitor_stop
    await monitor.start()

    stats_map: dict[str, EndpointStats] = defaultdict(EndpointStats)
    ws_acc = WsAccumulator()

    active_users = users_pool[: min(target_users, len(users_pool))]
    actual_users = len(active_users)
    start_time = time.monotonic()
    end_time = start_time + ramp_up_sec + duration_sec

    ssl_ctx = ssl.create_default_context()
    if not verify_ssl:
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

    connector = aiohttp.TCPConnector(limit=512, ttl_dns_cache=300, ssl=ssl_ctx if base_url.startswith("https://") else None)
    timeout = aiohttp.ClientTimeout(total=15)

    # Watchdog task checking HTTP 5xx / timeout / WS failure burst rates every 2s
    async def _watchdog() -> None:
        while not stop_event.is_set() and time.monotonic() < end_time:
            await asyncio.sleep(2.0)
            tot_req = sum(s.total for s in stats_map.values())
            tot_5xx = sum(s.http_5xx for s in stats_map.values())
            tot_timeout = sum(s.timeouts for s in stats_map.values())
            if tot_req >= 60 and (tot_5xx / tot_req > 0.20 or tot_timeout / tot_req > 0.25):
                reason = f"High HTTP failure rate (5xx={tot_5xx}, timeouts={tot_timeout} / {tot_req})"
                stop_reasons.append(reason)
                stop_event.set()
                break
            if ws_acc.attempted >= 100 and (ws_acc.failed / ws_acc.attempted > 0.45):
                reason = f"Excessive WS connection failures ({ws_acc.failed}/{ws_acc.attempted})"
                stop_reasons.append(reason)
                stop_event.set()
                break

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        tasks: list[asyncio.Task] = [asyncio.create_task(_watchdog())]
        login_budget = min(15, max(2, actual_users // 10))

        for idx, user in enumerate(active_users):
            delay = (idx / max(actual_users, 1)) * ramp_up_sec
            tasks.append(
                asyncio.create_task(
                    _http_user_loop(
                        idx, user, base_url, session, stats_map, stop_event, delay, end_time,
                        include_login_sample=(idx < login_budget),
                    )
                )
            )
            tasks.append(
                asyncio.create_task(
                    _ws_user_session(idx, user, ws_base_url, ssl_ctx, ws_acc, stop_event, delay, end_time, is_secondary_device=False)
                )
            )
            # Multi-device simultaneous socket on 10% of WS users
            if idx % 10 == 0 and actual_users >= 10:
                tasks.append(
                    asyncio.create_task(
                        _ws_user_session(idx, user, ws_base_url, ssl_ctx, ws_acc, stop_event, delay + 0.1, end_time, is_secondary_device=True)
                    )
                )

        # Wait until end_time or safeguard trip
        while not stop_event.is_set() and time.monotonic() < end_time:
            await asyncio.sleep(0.5)
        stop_event.set()
        await asyncio.gather(*tasks, return_exceptions=True)

    elapsed_total = max(time.monotonic() - start_time, 0.001)
    resource_samples = await monitor.stop()

    http_rows = [
        stats.summary(elapsed_total, ep)
        for ep, stats in sorted(stats_map.items())
    ]

    # Aggregate overall stage HTTP summary
    all_latencies: list[float] = []
    tot_req = sum(s.total for s in stats_map.values())
    tot_ok = sum(s.success for s in stats_map.values())
    tot_err = sum(s.failed for s in stats_map.values())
    tot_4xx = sum(s.http_4xx for s in stats_map.values())
    tot_5xx = sum(s.http_5xx for s in stats_map.values())
    tot_to = sum(s.timeouts for s in stats_map.values())
    for s in stats_map.values():
        all_latencies.extend(s.latencies_ms)
    all_latencies.sort()

    overall_http = {
        "endpoint": "__OVERALL__",
        "total_requests": tot_req,
        "successful_requests": tot_ok,
        "failed_requests": tot_err,
        "http_4xx_count": tot_4xx,
        "http_5xx_count": tot_5xx,
        "timeout_count": tot_to,
        "requests_per_second": round(tot_req / elapsed_total, 2),
        "average_latency_ms": round(sum(all_latencies) / len(all_latencies), 2) if all_latencies else 0.0,
        "min_latency_ms": round(all_latencies[0], 2) if all_latencies else 0.0,
        "p50_ms": _percentile(all_latencies, 50),
        "p75_ms": _percentile(all_latencies, 75),
        "p90_ms": _percentile(all_latencies, 90),
        "p95_ms": _percentile(all_latencies, 95),
        "p99_ms": _percentile(all_latencies, 99),
        "max_latency_ms": round(all_latencies[-1], 2) if all_latencies else 0.0,
    }
    http_rows.insert(0, overall_http)

    ws_conn_sorted = sorted(ws_acc.connect_ms)
    ws_ack_sorted = sorted(ws_acc.ack_ms)
    ws_del_sorted = sorted(ws_acc.delivery_ms)

    ws_row = {
        "attempted_connections": ws_acc.attempted,
        "successful_connections": ws_acc.succeeded,
        "peak_active_connections": ws_acc.peak_active,
        "failed_connections": ws_acc.failed,
        "connect_avg_ms": round(sum(ws_conn_sorted) / len(ws_conn_sorted), 2) if ws_conn_sorted else 0.0,
        "connect_p95_ms": _percentile(ws_conn_sorted, 95),
        "messages_sent": ws_acc.messages_sent,
        "messages_received": ws_acc.messages_received,
        "messages_per_second": round((ws_acc.messages_sent + ws_acc.messages_received) / elapsed_total, 2),
        "ack_p50_ms": _percentile(ws_ack_sorted, 50),
        "ack_p95_ms": _percentile(ws_ack_sorted, 95),
        "delivery_p50_ms": _percentile(ws_del_sorted, 50),
        "delivery_p95_ms": _percentile(ws_del_sorted, 95),
        "delivery_p99_ms": _percentile(ws_del_sorted, 99),
        "disconnect_count": ws_acc.disconnects,
        "reconnect_attempts": ws_acc.reconnect_attempts,
        "reconnect_successes": ws_acc.reconnect_successes,
        "slow_consumer_count": ws_acc.slow_consumers,
    }

    error_rows: list[dict[str, Any]] = []
    for ep, s in stats_map.items():
        for err_k, cnt in s.errors.items():
            error_rows.append({
                "error_type": err_k,
                "endpoint": ep,
                "error_count": cnt,
                "error_description": f"Observed {cnt} error(s) on {ep}",
            })
    for err_k, cnt in ws_acc.errors.items():
        error_rows.append({
            "error_type": err_k,
            "endpoint": "/ws/chat/",
            "error_count": cnt,
            "error_description": f"WebSocket error {err_k}",
        })
    if ws_acc.unauthorized_leaks > 0:
        error_rows.append({
            "error_type": "UNAUTHORIZED_CROSS_DELIVERY",
            "endpoint": "/ws/chat/",
            "error_count": ws_acc.unauthorized_leaks,
            "error_description": "Private chat message received by non-member socket!",
        })
    for reason in stop_reasons:
        error_rows.append({
            "error_type": "SAFEGUARD_STOP",
            "endpoint": "cluster",
            "error_count": 1,
            "error_description": reason,
        })

    return {
        "scenario_name": f"stage_{target_users}_users",
        "target_users": target_users,
        "actual_users": actual_users,
        "ramp_up_seconds": ramp_up_sec,
        "duration_seconds": round(elapsed_total, 2),
        "protocol": "HTTP+WS",
        "http_rows": http_rows,
        "overall_http": overall_http,
        "ws_row": ws_row,
        "resource_samples": resource_samples,
        "error_rows": error_rows,
        "stop_reasons": stop_reasons,
        "unauthorized_leaks": ws_acc.unauthorized_leaks,
    }


def _cleanup_remote_test_uploads(
    ssh_host: str = "13.203.33.175",
    ssh_user: str = "ubuntu",
    ssh_key: str = r"D:\personal\chat_app_server.pem",
) -> None:
    subprocess.run(
        [
            "ssh", "-o", "BatchMode=yes", "-i", ssh_key,
            f"{ssh_user}@{ssh_host}",
            "find /opt/chat-app/media/attachments -name '*lt_probe_*' -delete 2>/dev/null || true",
        ],
        capture_output=True,
        timeout=15,
    )


def run_benchmark_suite(args: argparse.Namespace) -> None:
    apply_migrations()
    tokens_path = Path(args.tokens_file)
    if not tokens_path.exists():
        raise FileNotFoundError(f"Tokens file not found: {tokens_path}. Run seed_test_data.py first.")
    users_pool = json.loads(tokens_path.read_text(encoding="utf-8"))

    stages = [int(x.strip()) for x in args.stages.split(",") if x.strip()]
    base_url = args.base_url.rstrip("/")
    ws_base_url = base_url.replace("https://", "wss://").replace("http://", "ws://")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ts_slug = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    raw_run_results: list[dict[str, Any]] = []
    aborted = False

    with open_mysql_tunnel(database="performance_test") as conn:
        recorder = BenchmarkRecorder(conn)
        run_id = recorder.create_test_run(
            run_name=args.run_name,
            environment="ec2_prod_2vcpu_2gb",
            application_version=_get_git_sha(),
            server_configuration=args.server_config,
            notes=args.notes,
        )

        try:
            for target_u in stages:
                if target_u > len(users_pool):
                    print(f"[SKIP] Target {target_u} exceeds seeded pool ({len(users_pool)}).")
                    break

                ramp = max(3.0, min(90.0, target_u / 50.0))
                dur = args.duration
                print(f"\n>>> Starting stage: {target_u} users (ramp={ramp:.1f}s, hold={dur:.1f}s)...", flush=True)

                monitor = ServerResourceMonitor(interval_sec=2.0, thresholds=SafetyThresholds())
                res = asyncio.run(
                    run_stage(
                        target_users=target_u,
                        base_url=base_url,
                        ws_base_url=ws_base_url,
                        users_pool=users_pool,
                        ramp_up_sec=ramp,
                        duration_sec=dur,
                        monitor=monitor,
                        verify_ssl=not args.insecure,
                    )
                )
                raw_run_results.append(res)

                recorder.save_scenario_results(
                    test_run_id=run_id,
                    scenario_name=res["scenario_name"],
                    target_users=res["target_users"],
                    actual_users=res["actual_users"],
                    ramp_up_seconds=res["ramp_up_seconds"],
                    duration_seconds=res["duration_seconds"],
                    protocol=res["protocol"],
                    http_rows=res["http_rows"],
                    ws_row=res["ws_row"],
                    resource_rows=res["resource_samples"],
                    error_rows=res["error_rows"],
                )

                ov = res["overall_http"]
                ws = res["ws_row"]
                peak_cpu = max((s["cpu_percent"] for s in res["resource_samples"]), default=0.0)
                peak_mem = max((s["memory_used_mb"] for s in res["resource_samples"]), default=0.0)
                print(
                    f"    [DONE {target_u}] RPS={ov['requests_per_second']} | p95={ov['p95_ms']}ms | "
                    f"p99={ov['p99_ms']}ms | Err={ov['failed_requests']}/{ov['total_requests']} | "
                    f"WS={ws['successful_connections']}/{ws['attempted_connections']} (del_p95={ws['delivery_p95_ms']}ms) | "
                    f"CPU_max={peak_cpu:.1f}% | RAM_max={peak_mem:.1f}MB",
                    flush=True,
                )

                # Stop escalating if safeguard tripped or severe degradation already confirmed
                if res["stop_reasons"]:
                    print(f"    [SAFEGUARD STOP] {res['stop_reasons']}")
                    aborted = True
                    break
                if ov["p99_ms"] > 10000 and ov["total_requests"] >= 50:
                    print(f"    [CEILING REACHED] p99={ov['p99_ms']}ms > 10000ms; halting escalation cleanly.")
                    aborted = True
                    break

            final_status = "stopped_by_safeguard" if aborted else "completed"
            recorder.complete_test_run(run_id, final_status)
        finally:
            _cleanup_remote_test_uploads()

    # Persist compressed raw artifact + flat summary CSV
    gz_path = RESULTS_DIR / f"{args.run_name}_{ts_slug}.json.gz"
    with gzip.open(gz_path, "wt", encoding="utf-8") as gz:
        json.dump(raw_run_results, gz)

    csv_path = RESULTS_DIR / f"{args.run_name}_{ts_slug}_summary.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow([
            "users", "rps", "avg_ms", "p50_ms", "p95_ms", "p99_ms",
            "total_req", "failed_req", "http_4xx", "http_5xx", "timeouts",
            "ws_ok", "ws_fail", "ws_msg_per_sec", "ws_del_p95_ms", "ws_del_p99_ms",
            "cpu_peak_pct", "ram_peak_mb", "swap_peak_mb", "mysql_conns_peak", "redis_mem_peak_mb",
        ])
        for r in raw_run_results:
            ov = r["overall_http"]
            ws = r["ws_row"]
            res_s = r["resource_samples"]
            writer.writerow([
                r["target_users"], ov["requests_per_second"], ov["average_latency_ms"],
                ov["p50_ms"], ov["p95_ms"], ov["p99_ms"],
                ov["total_requests"], ov["failed_requests"], ov["http_4xx_count"], ov["http_5xx_count"], ov["timeout_count"],
                ws["successful_connections"], ws["failed_connections"], ws["messages_per_second"],
                ws["delivery_p95_ms"], ws["delivery_p99_ms"],
                max((s["cpu_percent"] for s in res_s), default=0.0),
                max((s["memory_used_mb"] for s in res_s), default=0.0),
                max((s["swap_used_mb"] for s in res_s), default=0.0),
                max((s["mysql_connections"] for s in res_s), default=0),
                max((s["redis_memory_mb"] for s in res_s), default=0.0),
            ])

    print(f"\nSaved compressed raw archive: {gz_path}")
    print(f"Saved summary CSV: {csv_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Progressive HTTP + WebSocket benchmark runner.")
    parser.add_argument("--run-name", required=True)
    parser.add_argument("--stages", default="10,100,500,1000,2000,5000,10000,20000")
    parser.add_argument("--duration", type=float, default=15.0, help="Sustained hold duration per stage (seconds).")
    parser.add_argument("--base-url", default="https://chat-nikkiii.duckdns.org")
    parser.add_argument("--tokens-file", default=str(DEFAULT_TOKENS_FILE))
    parser.add_argument("--server-config", default="baseline_daphne_1worker_mysql30_nginx768_redis64mb")
    parser.add_argument("--notes", default="")
    parser.add_argument("--insecure", action="store_true")
    args = parser.parse_args()

    run_benchmark_suite(args)
