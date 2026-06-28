import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";

const app = express.Router();

app.use(isAuthenticated);

/**
 * GET /api/v1/preview?url=<encoded_url>
 * Fetches OpenGraph metadata server-side to avoid CORS issues.
 * Results are in-memory cached with a 1-hour TTL.
 */

// Simple in-memory cache: url -> { data, expiresAt }
const previewCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

app.get("/", isAuthenticated, async (req, res) => {
    const { url } = req.query;

    if (!url) return res.status(400).json({ success: false, message: "URL is required" });

    // Basic URL validation
    try { new URL(url); } catch {
        return res.status(400).json({ success: false, message: "Invalid URL" });
    }

    // Check cache
    const cached = previewCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
        return res.status(200).json({ success: true, preview: cached.data });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "ChatApp-LinkPreview/1.0" },
        });
        clearTimeout(timeout);

        if (!response.ok) throw new Error("Failed to fetch URL");

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
            // For non-HTML (e.g., direct image links), return minimal preview
            const preview = { url, title: url, image: url, description: "" };
            previewCache.set(url, { data: preview, expiresAt: Date.now() + CACHE_TTL_MS });
            return res.status(200).json({ success: true, preview });
        }

        const html = await response.text();

        // Extract OpenGraph / fallback meta tags using regex
        const getMeta = (property) => {
            const match =
                html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, "i")) ||
                html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, "i"));
            return match ? match[1] : null;
        };

        const title =
            getMeta("og:title") ||
            (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] ||
            url;

        const preview = {
            url,
            title: title?.trim().substring(0, 120) || "",
            description: (getMeta("og:description") || getMeta("description") || "").trim().substring(0, 200),
            image: getMeta("og:image") || getMeta("twitter:image") || null,
            siteName: getMeta("og:site_name") || new URL(url).hostname,
        };

        // Cache result
        previewCache.set(url, { data: preview, expiresAt: Date.now() + CACHE_TTL_MS });

        return res.status(200).json({ success: true, preview });
    } catch (err) {
        // Don't crash — gracefully return null preview
        return res.status(200).json({ success: false, preview: null });
    }
});

export default app;
