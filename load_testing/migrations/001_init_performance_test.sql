-- Version-controlled schema for isolated benchmark history on existing MySQL 8.0 server.
-- Uses portable SQL data types so schema & exported CSV/JSON can migrate cleanly across RDBMS engines.

CREATE DATABASE IF NOT EXISTS performance_test;
USE performance_test;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    applied_at DATETIME NOT NULL,
    checksum VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS test_runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    run_name VARCHAR(150) NOT NULL,
    environment VARCHAR(64) NOT NULL,
    application_version VARCHAR(64) NOT NULL,
    server_configuration TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    completed_at DATETIME NULL,
    test_status VARCHAR(32) NOT NULL,
    notes TEXT NULL
);

CREATE TABLE IF NOT EXISTS load_scenarios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    test_run_id BIGINT NOT NULL,
    scenario_name VARCHAR(120) NOT NULL,
    target_users INTEGER NOT NULL,
    actual_users INTEGER NOT NULL,
    ramp_up_seconds DOUBLE PRECISION NOT NULL,
    duration_seconds DOUBLE PRECISION NOT NULL,
    protocol VARCHAR(32) NOT NULL,
    CONSTRAINT fk_scenarios_run
        FOREIGN KEY (test_run_id) REFERENCES test_runs(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS http_metrics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scenario_id BIGINT NOT NULL,
    endpoint VARCHAR(180) NOT NULL,
    total_requests BIGINT NOT NULL,
    successful_requests BIGINT NOT NULL,
    failed_requests BIGINT NOT NULL,
    http_4xx_count BIGINT NOT NULL DEFAULT 0,
    http_5xx_count BIGINT NOT NULL DEFAULT 0,
    timeout_count BIGINT NOT NULL DEFAULT 0,
    requests_per_second DOUBLE PRECISION NOT NULL,
    average_latency_ms DOUBLE PRECISION NOT NULL,
    min_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    p50_ms DOUBLE PRECISION NOT NULL,
    p75_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    p90_ms DOUBLE PRECISION NOT NULL,
    p95_ms DOUBLE PRECISION NOT NULL,
    p99_ms DOUBLE PRECISION NOT NULL,
    max_latency_ms DOUBLE PRECISION NOT NULL,
    CONSTRAINT fk_http_scenario
        FOREIGN KEY (scenario_id) REFERENCES load_scenarios(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS websocket_metrics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scenario_id BIGINT NOT NULL,
    attempted_connections BIGINT NOT NULL,
    successful_connections BIGINT NOT NULL,
    peak_active_connections BIGINT NOT NULL,
    failed_connections BIGINT NOT NULL,
    connect_avg_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    connect_p95_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    messages_sent BIGINT NOT NULL,
    messages_received BIGINT NOT NULL,
    messages_per_second DOUBLE PRECISION NOT NULL,
    ack_p50_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    ack_p95_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    delivery_p50_ms DOUBLE PRECISION NOT NULL,
    delivery_p95_ms DOUBLE PRECISION NOT NULL,
    delivery_p99_ms DOUBLE PRECISION NOT NULL,
    disconnect_count BIGINT NOT NULL,
    reconnect_attempts BIGINT NOT NULL DEFAULT 0,
    reconnect_successes BIGINT NOT NULL DEFAULT 0,
    slow_consumer_count BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_ws_scenario
        FOREIGN KEY (scenario_id) REFERENCES load_scenarios(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resource_metrics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scenario_id BIGINT NOT NULL,
    timestamp DATETIME NOT NULL,
    cpu_percent DOUBLE PRECISION NOT NULL,
    memory_used_mb DOUBLE PRECISION NOT NULL,
    memory_available_mb DOUBLE PRECISION NOT NULL,
    swap_used_mb DOUBLE PRECISION NOT NULL,
    disk_used_percent DOUBLE PRECISION NOT NULL,
    mysql_connections INTEGER NOT NULL,
    mysql_slow_queries BIGINT NOT NULL,
    redis_memory_mb DOUBLE PRECISION NOT NULL,
    redis_clients INTEGER NOT NULL,
    daphne_memory_mb DOUBLE PRECISION NOT NULL DEFAULT 0,
    nginx_active_connections INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT fk_resource_scenario
        FOREIGN KEY (scenario_id) REFERENCES load_scenarios(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_errors (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scenario_id BIGINT NOT NULL,
    error_type VARCHAR(80) NOT NULL,
    endpoint VARCHAR(180) NOT NULL,
    error_count BIGINT NOT NULL,
    error_description TEXT NOT NULL,
    CONSTRAINT fk_errors_scenario
        FOREIGN KEY (scenario_id) REFERENCES load_scenarios(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_scenarios_run_id ON load_scenarios(test_run_id);
CREATE INDEX idx_http_scenario_endpoint ON http_metrics(scenario_id, endpoint);
CREATE INDEX idx_ws_scenario_id ON websocket_metrics(scenario_id);
CREATE INDEX idx_resource_scenario_ts ON resource_metrics(scenario_id, timestamp);
CREATE INDEX idx_errors_scenario_id ON test_errors(scenario_id);

