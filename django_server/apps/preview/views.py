import hashlib
import requests
from bs4 import BeautifulSoup
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated


class PreviewLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        target_url = request.query_params.get("url")
        if not target_url:
            return Response({"success": False, "message": "URL parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Check cache
        cache_key = f"link_preview:{hashlib.md5(target_url.encode()).hexdigest()}"
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response({"success": True, "preview": cached_data})

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        try:
            resp = requests.get(target_url, headers=headers, timeout=5)
            soup = BeautifulSoup(resp.text, "html.parser")

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
            site_name = get_meta("og:site_name")

            if not site_name:
                from urllib.parse import urlparse
                parsed = urlparse(target_url)
                site_name = parsed.netloc

            preview_data = {
                "url": target_url,
                "title": title[:200] if title else "",
                "description": description[:300] if description else "",
                "image": image,
                "siteName": site_name,
            }

            # Cache for 24 hours
            cache.set(cache_key, preview_data, timeout=86400)

            return Response({"success": True, "preview": preview_data})
        except Exception as err:
            return Response({
                "success": True,
                "preview": {
                    "url": target_url,
                    "title": target_url,
                    "description": "",
                    "image": None,
                    "siteName": "",
                }
            })

