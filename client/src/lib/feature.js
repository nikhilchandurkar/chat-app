import { server } from "../constants/config";

const fileFormat = (url = "") => {
    if (!url) return "unknown";
    // Strip query parameters or fragments
    const cleanUrl = url.split(/[?#]/)[0];
    const fileExt = cleanUrl.split(".").pop().toLowerCase();

    if (!fileExt) {
        return "unknown";
    }

    if (["mp4", "webm", "ogg", "mov", "mkv", "avi", "m4v"].includes(fileExt)) {
        return "video";
    }

    if (["mp3", "wav", "m4a", "aac", "ogg", "flac", "wma"].includes(fileExt)) {
        return "audio";
    }

    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "jfif"].includes(fileExt)) {
        return "image";
    }

    if (["pdf"].includes(fileExt)) {
        return "pdf";
    }

    return "file";
};

/** Resolves relative /api/v1/media/... URLs against the configured server base when needed. */
const resolveMediaUrl = (url = "") => {
    if (!url || typeof url !== "string") return "";
    if (/^(https?:|blob:|data:)/i.test(url)) return url;
    if (server && url.startsWith("/")) {
        return `${server}${url}`;
    }
    return url;
};

const transformImage = (url = "", width = 200) => {
    const resolved = resolveMediaUrl(url);
    if (!resolved) return "";
    // If Cloudinary URL, can inject width, otherwise return clean URL
    if (resolved.includes("cloudinary.com")) {
        return resolved.replace("/upload/", `/upload/dpr_auto,w_${width}/`);
    }
    return resolved;
};

export { fileFormat, resolveMediaUrl, transformImage };
