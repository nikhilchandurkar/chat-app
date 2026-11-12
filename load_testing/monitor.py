"""
Lightweight server resource monitor over SSH using existing Linux utilities
(/proc/stat, /proc/meminfo, df, ss, docker ps, mysql status, redis-cli INFO).
Avoids installing heavy monitoring stacks on the 2 GB EC2 instance and enforces
automatic safety stop conditions.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable


REMOTE_STREAM_SCRIPT = r"""
while true; do
  read -r _ u1 n1 s1 i1 w1 q1 sq1 _ < /proc/stat
  sleep 0.25
  read -r _ u2 n2 s2 i2 w2 q2 sq2 _ < /proc/stat
  TOTAL1=$((u1+n1+s1+i1+w1+q1+sq1))
  TOTAL2=$((u2+n2+s2+i2+w2+q2+sq2))
  IDLE1=$((i1+w1))
  IDLE2=$((i2+w2))
  DT=$((TOTAL2 - TOTAL1))
  DI=$((IDLE2 - IDLE1))
  CPU_PCT=$(awk -v dt="$DT" -v di="$DI" 'BEGIN { if (dt<=0) printf "0.0"; else printf "%.2f", ((dt-di)*100.0)/dt }')

  eval $(awk '/^MemTotal:/{mt=$2} /^MemAvailable:/{ma=$2} /^SwapTotal:/{st=$2} /^SwapFree:/{sf=$2} END {
    printf "MEM_USED_MB=%.2f\nMEM_AVAIL_MB=%.2f\nSWAP_USED_MB=%.2f\n", (mt-ma)/1024.0, ma/1024.0, (st-sf)/1024.0
  }' /proc/meminfo)

  DISK_PCT=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')
  NGINX_CONNS=$(ss -Htn state established '( sport = :443 )' 2>/dev/null | wc -l)
  DAPHNE_MEM_MB=$(ps -eo rss,args | awk '/(daphne |core\.run_wsgi)/ && !/sh -c/ && !/awk/{sum+=$1} END{printf "%.2f", sum/1024.0}')

  MYSQL_OUT=$(docker exec chat_mysql sh -c 'mysql -u"${MYSQL_USER:-root}" -p"${MYSQL_PASSWORD:-$MYSQL_ROOT_PASSWORD}" -Nse "SHOW GLOBAL STATUS WHERE Variable_name IN (\"Threads_connected\",\"Slow_queries\");"' 2>/dev/null || true)
  MYSQL_CONNS=$(echo "$MYSQL_OUT" | awk '$1=="Threads_connected"{print $2}')
  MYSQL_SLOW=$(echo "$MYSQL_OUT" | awk '$1=="Slow_queries"{print $2}')
  MYSQL_CONNS=${MYSQL_CONNS:-0}
  MYSQL_SLOW=${MYSQL_SLOW:-0}

  REDIS_MEM_BYTES=$(docker exec chat_redis redis-cli INFO memory 2>/dev/null | awk -F: '/^used_memory:/{gsub("\r","",$2); print $2}')
  REDIS_CLIENTS=$(docker exec chat_redis redis-cli INFO clients 2>/dev/null | awk -F: '/^connected_clients:/{gsub("\r","",$2); print $2}')
  REDIS_MEM_MB=$(awk -v b="${REDIS_MEM_BYTES:-0}" 'BEGIN { printf "%.2f", b/1048576.0 }')
  REDIS_CLIENTS=${REDIS_CLIENTS:-0}

  echo "${CPU_PCT}|${MEM_USED_MB}|${MEM_AVAIL_MB}|${SWAP_USED_MB}|${DISK_PCT}|${MYSQL_CONNS}|${MYSQL_SLOW}|${REDIS_MEM_MB}|${REDIS_CLIENTS}|${DAPHNE_MEM_MB}|${NGINX_CONNS}"
  sleep __INTERVAL__
done
""".strip()


@dataclass
class SafetyThresholds:
    min_avail_mem_mb: float = 140.0
    max_swap_used_mb: float = 1200.0
    max_cpu_pct_sustained: float = 97.0
    cpu_breach_streak_limit: int = 6
    max_disk_pct: float = 96.0


class ServerResourceMonitor:
    def __init__(
        self,
        ssh_host: str = "13.203.33.175",
        ssh_user: str = "ubuntu",
        ssh_key: str = r"D:\personal\chat_app_server.pem",
        interval_sec: float = 2.0,
        thresholds: SafetyThresholds | None = None,
        on_stop_triggered: Callable[[str], None] | None = None,
    ):
        self.ssh_host = ssh_host
        self.ssh_user = ssh_user
        self.ssh_key = ssh_key
        self.interval_sec = interval_sec
        self.thresholds = thresholds or SafetyThresholds()
        self.on_stop_triggered = on_stop_triggered

        self.samples: list[dict] = []
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task | None = None
        self.stop_reason: str | None = None
        self._cpu_streak = 0

    async def start(self) -> None:
        self._stop_event.clear()
        self.samples = []
        self.stop_reason = None
        self._cpu_streak = 0
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> list[dict]:
        self._stop_event.set()
        if self._task:
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        return list(self.samples)

    def _parse_line(self, raw_line: str) -> dict | None:
        parts = raw_line.strip().split("|")
        if len(parts) < 11:
            return None
        try:
            return {
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                "cpu_percent": float(parts[0]),
                "memory_used_mb": float(parts[1]),
                "memory_available_mb": float(parts[2]),
                "swap_used_mb": float(parts[3]),
                "disk_used_percent": float(parts[4]),
                "mysql_connections": int(parts[5]),
                "mysql_slow_queries": int(parts[6]),
                "redis_memory_mb": float(parts[7]),
                "redis_clients": int(parts[8]),
                "daphne_memory_mb": float(parts[9]),
                "nginx_active_connections": int(parts[10]),
            }
        except ValueError:
            return None

    def _check_safeguards(self, sample: dict) -> str | None:
        th = self.thresholds
        if sample["memory_available_mb"] < th.min_avail_mem_mb:
            return (
                f"Low available RAM: {sample['memory_available_mb']:.1f} MB "
                f"< {th.min_avail_mem_mb} MB threshold"
            )
        if sample["swap_used_mb"] > th.max_swap_used_mb:
            return (
                f"Excessive swap usage: {sample['swap_used_mb']:.1f} MB "
                f"> {th.max_swap_used_mb} MB threshold"
            )
        if sample["disk_used_percent"] >= th.max_disk_pct:
            return (
                f"Critical disk usage: {sample['disk_used_percent']:.1f}% "
                f">= {th.max_disk_pct}%"
            )
        if sample["cpu_percent"] >= th.max_cpu_pct_sustained:
            self._cpu_streak += 1
            if self._cpu_streak >= th.cpu_breach_streak_limit:
                return f"Sustained CPU saturation >= {th.max_cpu_pct_sustained}% for {self._cpu_streak} samples"
        else:
            self._cpu_streak = 0
        return None

    async def _run_loop(self) -> None:
        script = REMOTE_STREAM_SCRIPT.replace("__INTERVAL__", str(max(0.5, self.interval_sec - 0.25)))
        while not self._stop_event.is_set():
            proc = None
            try:
                proc = await asyncio.create_subprocess_exec(
                    "ssh",
                    "-o",
                    "BatchMode=yes",
                    "-o",
                    "ConnectTimeout=5",
                    "-i",
                    self.ssh_key,
                    f"{self.ssh_user}@{self.ssh_host}",
                    "tr -d '\\r' | bash -s",
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                assert proc.stdin and proc.stdout
                proc.stdin.write(script.encode("utf-8"))
                await proc.stdin.drain()
                proc.stdin.close()

                while not self._stop_event.is_set():
                    line_bytes = await asyncio.wait_for(proc.stdout.readline(), timeout=15.0)
                    if not line_bytes:
                        break
                    sample = self._parse_line(line_bytes.decode("utf-8", errors="replace"))
                    if sample:
                        self.samples.append(sample)
                        reason = self._check_safeguards(sample)
                        if reason and not self.stop_reason:
                            self.stop_reason = reason
                            if self.on_stop_triggered:
                                self.on_stop_triggered(reason)
            except Exception:
                await asyncio.sleep(1.0)
            finally:
                if proc and proc.returncode is None:
                    proc.terminate()
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=2.0)
                    except asyncio.TimeoutError:
                        proc.kill()

