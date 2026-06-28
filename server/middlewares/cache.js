export const httpCache = (req, res, next) => {
    // Prevent client side caching but allow CDNs/Proxies, and revalidate in background
    res.set("Cache-Control", "private, max-age=0, stale-while-revalidate=60");
    next();
};
