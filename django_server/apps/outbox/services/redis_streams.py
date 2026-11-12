import json
import logging
import os
import redis
from django.conf import settings

logger = logging.getLogger(__name__)

STREAMS = [
    "chat:events",
    "chat:messages",
    "chat:receipts",
    "chat:notifications",
]

DEFAULT_CONSUMER_GROUP = "chat_workers"


_redis_pool = None


def get_redis_client():
    global _redis_pool
    try:
        if _redis_pool is None:
            pool_size = int(
                os.environ.get(
                    "REDIS_STREAM_MAX_CONNS",
                    str(min(256, max(128, (os.cpu_count() or 2) * 32))),
                )
            )
            _redis_pool = redis.ConnectionPool.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                max_connections=pool_size,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=True,
            )
        return redis.Redis(connection_pool=_redis_pool)
    except Exception as e:
        logger.warning("Failed to connect to Redis at %s: %s", settings.REDIS_URL, str(e))
        return None


def init_stream_groups():
    """Initializes consumer groups for all required chat streams."""
    r = get_redis_client()
    if not r:
        return False

    for stream in STREAMS:
        try:
            r.xgroup_create(stream, DEFAULT_CONSUMER_GROUP, id="$", mkstream=True)
            logger.info("Created consumer group '%s' for stream '%s'", DEFAULT_CONSUMER_GROUP, stream)
        except redis.exceptions.ResponseError as e:
            if "BUSYGROUP" in str(e):
                pass  # Group already exists
            else:
                logger.error("Error creating group for %s: %s", stream, str(e))
    return True


def publish_to_stream(stream_name: str, event_id: str, event_type: str, payload: dict) -> str | None:
    """Publishes an event to a Redis Stream with XADD and max retention cap."""
    r = get_redis_client()
    if not r:
        return None

    try:
        data = {
            "event_id": event_id,
            "event_type": event_type,
            "payload": json.dumps(payload),
        }
        # Retain last 100,000 entries per stream
        msg_id = r.xadd(stream_name, data, maxlen=100000, approximate=True)
        return msg_id
    except Exception as e:
        logger.error("Redis XADD failed for %s (%s): %s", stream_name, event_type, str(e))
        return None


def read_stream_events(stream_name: str, consumer_name: str, count: int = 10, block_ms: int = 2000) -> list[dict]:
    """Reads events from consumer group using XREADGROUP."""
    r = get_redis_client()
    if not r:
        return []

    try:
        entries = r.xreadgroup(DEFAULT_CONSUMER_GROUP, consumer_name, {stream_name: ">"}, count=count, block=block_ms)
        results = []
        if entries:
            for s_name, msg_list in entries:
                for msg_id, data in msg_list:
                    parsed_payload = json.loads(data.get("payload", "{}"))
                    results.append({
                        "stream": s_name,
                        "msg_id": msg_id,
                        "event_id": data.get("event_id"),
                        "event_type": data.get("event_type"),
                        "payload": parsed_payload,
                    })
        return results
    except Exception as e:
        logger.error("Redis XREADGROUP error on %s: %s", stream_name, str(e))
        return []


def ack_stream_event(stream_name: str, msg_id: str) -> bool:
    """Acknowledges an event using XACK."""
    r = get_redis_client()
    if not r:
        return False
    try:
        r.xack(stream_name, DEFAULT_CONSUMER_GROUP, msg_id)
        return True
    except Exception as e:
        logger.error("Redis XACK failed for %s on %s: %s", msg_id, stream_name, str(e))
        return False


def claim_pending_stream_events(stream_name: str, consumer_name: str, min_idle_ms: int = 60000, count: int = 10) -> list[dict]:
    """Recovers hung/unacked events using XPENDING and XCLAIM."""
    r = get_redis_client()
    if not r:
        return []

    try:
        pending = r.xpending_range(stream_name, DEFAULT_CONSUMER_GROUP, min="-", max="+", count=count)
        msg_ids_to_claim = [p["message_id"] for p in pending if p["idle"] >= min_idle_ms]
        if not msg_ids_to_claim:
            return []

        claimed = r.xclaim(stream_name, DEFAULT_CONSUMER_GROUP, consumer_name, min_idle_ms, msg_ids_to_claim)
        results = []
        for msg_id, data in claimed:
            results.append({
                "stream": stream_name,
                "msg_id": msg_id,
                "event_id": data.get("event_id"),
                "event_type": data.get("event_type"),
                "payload": json.loads(data.get("payload", "{}")),
            })
        return results
    except Exception as e:
        logger.error("Redis XCLAIM error on %s: %s", stream_name, str(e))
        return []

