"""
Manages the isolated `performance_test` benchmark history schema on the existing
MySQL 8.0 server over a local SSH port-forward (keeping MySQL private to 127.0.0.1).
"""

from __future__ import annotations

import hashlib
import os
import socket
import subprocess
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pymysql


ROOT_DIR = Path(__file__).resolve().parent
MIGRATIONS_DIR = ROOT_DIR / "migrations"


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def fetch_ec2_mysql_credentials(
    ssh_host: str = "13.203.33.175",
    ssh_user: str = "ubuntu",
    ssh_key: str = r"D:\personal\chat_app_server.pem",
) -> tuple[str, str]:
    """Reads MYSQL_USER and MYSQL_PASSWORD from chat_mysql container env over SSH."""
    cmd = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-i",
        ssh_key,
        f"{ssh_user}@{ssh_host}",
        "docker exec chat_mysql sh -c 'printf \"%s\\n%s\\n\" \"${MYSQL_USER:-root}\" \"${MYSQL_PASSWORD:-$MYSQL_ROOT_PASSWORD}\"'",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=20)
    lines = [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]
    if len(lines) < 2:
        raise RuntimeError("Unable to read MySQL credentials from EC2 container.")
    return lines[0], lines[1]


@contextmanager
def open_mysql_tunnel(
    ssh_host: str = "13.203.33.175",
    ssh_user: str = "ubuntu",
    ssh_key: str = r"D:\personal\chat_app_server.pem",
    database: str | None = "performance_test",
):
    """Opens a temporary SSH port-forward to EC2 127.0.0.1:3306 and yields a PyMySQL connection."""
    db_user = os.environ.get("PERF_DB_USER")
    db_pass = os.environ.get("PERF_DB_PASSWORD")
    if not db_user or not db_pass:
        db_user, db_pass = fetch_ec2_mysql_credentials(ssh_host, ssh_user, ssh_key)

    local_port = _find_free_port()
    tunnel_cmd = [
        "ssh",
        "-N",
        "-o",
        "BatchMode=yes",
        "-o",
        "ExitOnForwardFailure=yes",
        "-i",
        ssh_key,
        "-L",
        f"{local_port}:127.0.0.1:3306",
        f"{ssh_user}@{ssh_host}",
    ]
    proc = subprocess.Popen(
        tunnel_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    conn = None
    try:
        deadline = time.time() + 15.0
        while time.time() < deadline:
            if proc.poll() is not None:
                err = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
                raise RuntimeError(f"SSH MySQL tunnel exited prematurely: {err}")
            try:
                with socket.create_connection(("127.0.0.1", local_port), timeout=0.5):
                    break
            except OSError:
                time.sleep(0.15)
        else:
            raise TimeoutError("Timed out waiting for SSH MySQL tunnel.")

        conn = pymysql.connect(
            host="127.0.0.1",
            port=local_port,
            user=db_user,
            password=db_pass,
            database=database,
            charset="utf8mb4",
            autocommit=False,
            cursorclass=pymysql.cursors.DictCursor,
        )
        yield conn
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()


def apply_migrations(
    ssh_host: str = "13.203.33.175",
    ssh_user: str = "ubuntu",
    ssh_key: str = r"D:\personal\chat_app_server.pem",
) -> list[str]:
    """Applies pending SQL migrations to the `performance_test` schema cleanly."""
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    applied: list[str] = []

    with open_mysql_tunnel(ssh_host, ssh_user, ssh_key, database=None) as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE DATABASE IF NOT EXISTS performance_test")
            cur.execute("USE performance_test")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(64) PRIMARY KEY,
                    applied_at DATETIME NOT NULL,
                    checksum VARCHAR(64) NOT NULL
                )
                """
            )
            cur.execute("SELECT version, checksum FROM schema_migrations")
            existing = {row["version"]: row["checksum"] for row in cur.fetchall()}

            for sql_path in migration_files:
                version = sql_path.stem
                sql_text = sql_path.read_text(encoding="utf-8")
                checksum = hashlib.sha256(sql_text.encode("utf-8")).hexdigest()

                if version in existing:
                    continue

                statements = [s.strip() for s in sql_text.split(";") if s.strip()]
                for stmt in statements:
                    cur.execute(stmt)

                cur.execute(
                    "INSERT INTO schema_migrations (version, applied_at, checksum) VALUES (%s, %s, %s)",
                    (version, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), checksum),
                )
                applied.append(version)

        conn.commit()

    return applied


class BenchmarkRecorder:
    """Writes aggregated benchmark runs, scenarios, metrics, and errors after a scenario finishes."""

    def __init__(self, conn: pymysql.connections.Connection):
        self.conn = conn

    def create_test_run(
        self,
        run_name: str,
        environment: str,
        application_version: str,
        server_configuration: str,
        notes: str = "",
    ) -> int:
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO test_runs (
                    run_name, environment, application_version, server_configuration,
                    started_at, test_status, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (run_name, environment, application_version, server_configuration, now_str, "running", notes),
            )
            run_id = cur.lastrowid
        self.conn.commit()
        return int(run_id)

    def complete_test_run(self, run_id: int, status: str, notes: str | None = None) -> None:
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        with self.conn.cursor() as cur:
            if notes is not None:
                cur.execute(
                    "UPDATE test_runs SET completed_at=%s, test_status=%s, notes=%s WHERE id=%s",
                    (now_str, status, notes, run_id),
                )
            else:
                cur.execute(
                    "UPDATE test_runs SET completed_at=%s, test_status=%s WHERE id=%s",
                    (now_str, status, run_id),
                )
        self.conn.commit()

    def save_scenario_results(
        self,
        test_run_id: int,
        scenario_name: str,
        target_users: int,
        actual_users: int,
        ramp_up_seconds: float,
        duration_seconds: float,
        protocol: str,
        http_rows: list[dict[str, Any]],
        ws_row: dict[str, Any] | None,
        resource_rows: list[dict[str, Any]],
        error_rows: list[dict[str, Any]],
    ) -> int:
        if self.conn is not None:
            self.conn.ping(reconnect=True)
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO load_scenarios (
                    test_run_id, scenario_name, target_users, actual_users,
                    ramp_up_seconds, duration_seconds, protocol
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    test_run_id,
                    scenario_name,
                    target_users,
                    actual_users,
                    round(ramp_up_seconds, 2),
                    round(duration_seconds, 2),
                    protocol,
                ),
            )
            scenario_id = int(cur.lastrowid)

            if http_rows:
                cur.executemany(
                    """
                    INSERT INTO http_metrics (
                        scenario_id, endpoint, total_requests, successful_requests, failed_requests,
                        http_4xx_count, http_5xx_count, timeout_count, requests_per_second,
                        average_latency_ms, min_latency_ms, p50_ms, p75_ms, p90_ms, p95_ms, p99_ms, max_latency_ms
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    [
                        (
                            scenario_id,
                            r["endpoint"],
                            int(r["total_requests"]),
                            int(r["successful_requests"]),
                            int(r["failed_requests"]),
                            int(r.get("http_4xx_count", 0)),
                            int(r.get("http_5xx_count", 0)),
                            int(r.get("timeout_count", 0)),
                            float(r["requests_per_second"]),
                            float(r["average_latency_ms"]),
                            float(r.get("min_latency_ms", 0.0)),
                            float(r["p50_ms"]),
                            float(r.get("p75_ms", 0.0)),
                            float(r["p90_ms"]),
                            float(r["p95_ms"]),
                            float(r["p99_ms"]),
                            float(r["max_latency_ms"]),
                        )
                        for r in http_rows
                    ],
                )

            if ws_row:
                cur.execute(
                    """
                    INSERT INTO websocket_metrics (
                        scenario_id, attempted_connections, successful_connections, peak_active_connections,
                        failed_connections, connect_avg_ms, connect_p95_ms,
                        messages_sent, messages_received, messages_per_second,
                        ack_p50_ms, ack_p95_ms, delivery_p50_ms, delivery_p95_ms, delivery_p99_ms,
                        disconnect_count, reconnect_attempts, reconnect_successes, slow_consumer_count
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        scenario_id,
                        int(ws_row["attempted_connections"]),
                        int(ws_row["successful_connections"]),
                        int(ws_row["peak_active_connections"]),
                        int(ws_row["failed_connections"]),
                        float(ws_row.get("connect_avg_ms", 0.0)),
                        float(ws_row.get("connect_p95_ms", 0.0)),
                        int(ws_row["messages_sent"]),
                        int(ws_row["messages_received"]),
                        float(ws_row["messages_per_second"]),
                        float(ws_row.get("ack_p50_ms", 0.0)),
                        float(ws_row.get("ack_p95_ms", 0.0)),
                        float(ws_row["delivery_p50_ms"]),
                        float(ws_row["delivery_p95_ms"]),
                        float(ws_row["delivery_p99_ms"]),
                        int(ws_row["disconnect_count"]),
                        int(ws_row.get("reconnect_attempts", 0)),
                        int(ws_row.get("reconnect_successes", 0)),
                        int(ws_row.get("slow_consumer_count", 0)),
                    ),
                )

            if resource_rows:
                cur.executemany(
                    """
                    INSERT INTO resource_metrics (
                        scenario_id, timestamp, cpu_percent, memory_used_mb, memory_available_mb,
                        swap_used_mb, disk_used_percent, mysql_connections, mysql_slow_queries,
                        redis_memory_mb, redis_clients, daphne_memory_mb, nginx_active_connections
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        (
                            scenario_id,
                            r["timestamp"],
                            float(r["cpu_percent"]),
                            float(r["memory_used_mb"]),
                            float(r["memory_available_mb"]),
                            float(r["swap_used_mb"]),
                            float(r["disk_used_percent"]),
                            int(r["mysql_connections"]),
                            int(r["mysql_slow_queries"]),
                            float(r["redis_memory_mb"]),
                            int(r["redis_clients"]),
                            float(r.get("daphne_memory_mb", 0.0)),
                            int(r.get("nginx_active_connections", 0)),
                        )
                        for r in resource_rows
                    ],
                )

            if error_rows:
                cur.executemany(
                    """
                    INSERT INTO test_errors (
                        scenario_id, error_type, endpoint, error_count, error_description
                    ) VALUES (%s, %s, %s, %s, %s)
                    """,
                    [
                        (
                            scenario_id,
                            e["error_type"][:80],
                            e["endpoint"][:180],
                            int(e["error_count"]),
                            str(e["error_description"])[:2000],
                        )
                        for e in error_rows
                    ],
                )

        self.conn.commit()
        return scenario_id


if __name__ == "__main__":
    applied_versions = apply_migrations()
    print(f"Applied migrations: {applied_versions or 'already up to date'}")

