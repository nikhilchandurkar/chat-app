import hashlib
import ipaddress
import socket
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _is_public_ip(ip_str: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return bool(
        ip_obj.is_global
        and not (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_multicast
            or ip_obj.is_reserved
            or ip_obj.is_unspecified
        )
    )


def validate_public_http_url(raw_url: str) -> tuple[bool, str]:
    """Validates that a URL uses HTTP(S) on standard ports and resolves only to global public IPs (SSRF defense)."""
    if not raw_url or not isinstance(raw_url, str) or len(raw_url) > 2048:
        return False, ""
    parsed = urlparse(raw_url.strip())
    if parsed.scheme not in ("http", "https"):
        return False, ""
    hostname = parsed.hostname
    if not hostname or hostname.lower() in ("localhost", "localhost.localdomain"):
        return False, ""
    if parsed.port not in (None, 80, 443):
        return False, ""

    # Block raw IP literals unless strictly public
    try:
        ipaddress.ip_address(hostname)
        if not _is_public_ip(hostname):
            return False, ""
    except ValueError:
        pass

    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addr_info = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except OSError:
        return False, ""

    if not addr_info:
        return False, ""

    for entry in addr_info:
        resolved_ip = entry[4][0]
        if not _is_public_ip(resolved_ip):
            return False, ""

    return True, parsed.geturl()


def _safe_fetch_public_html(url: str, headers: dict) -> str | None:
    """Fetches HTML from a validated public URL without following redirects into private networks."""
    current_url = url
    for _ in range(3):
        is_safe, clean_url = validate_public_http_url(current_url)
        if not is_safe:
            return None
        resp = requests.get(
            clean_url,
            headers=headers,
            timeout=5,
            allow_redirects=False,
            stream=True,
        )
        if 300 <= resp.status_code < 400 and resp.headers.get("Location"):
            current_url = resp.headers["Location"]
            continue
        if resp.status_code >= 400:
            return None
        chunks = []
        total = 0
        for chunk in resp.iter_content(chunk_size=16384):
            chunks.append(chunk)
            total += len(chunk)
            if total >= 512 * 1024:
                break
        return b"".join(chunks).decode(resp.encoding or "utf-8", errors="replace")
    return None


class PreviewLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        raw_url = request.query_params.get("url", "").strip()
        is_safe, target_url = validate_public_http_url(raw_url)
        if not is_safe:
            return Response(
                {"success": False, "message": "A valid public HTTP/HTTPS URL is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cache_key = f"link_preview:{hashlib.sha256(target_url.encode()).hexdigest()}"
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response({"success": True, "preview": cached_data})

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; ChitChatPreview/1.0)"
        }

        try:
            html_body = _safe_fetch_public_html(target_url, headers)
            if not html_body:
                return Response({
                    "success": True,
                    "preview": {
                        "url": target_url,
                        "title": target_url,
                        "description": "",
                        "image": None,
                        "siteName": urlparse(target_url).netloc,
                    },
                })

            soup = BeautifulSoup(html_body, "html.parser")

            def get_meta(property_name, attr_name="property"):
                tag = soup.find("meta", {attr_name: property_name})
                return tag.get("content", "") if tag else ""

            title = (
                get_meta("og:title")
                or get_meta("twitter:title")
                or (soup.title.string.strip() if soup.title and soup.title.string else "")
            )
            description = (
                get_meta("og:description")
                or get_meta("twitter:description")
                or get_meta("description", attr_name="name")
            )
            image = get_meta("og:image") or get_meta("twitter:image")
            site_name = get_meta("og:site_name") or urlparse(target_url).netloc

            preview_data = {
                "url": target_url,
                "title": title[:200] if title else "",
                "description": description[:300] if description else "",
                "image": image,
                "siteName": site_name,
            }

            cache.set(cache_key, preview_data, timeout=86400)
            return Response({"success": True, "preview": preview_data})
        except Exception:
            return Response({
                "success": True,
                "preview": {
                    "url": target_url,
                    "title": target_url,
                    "description": "",
                    "image": None,
                    "siteName": urlparse(target_url).netloc,
                },
            })
