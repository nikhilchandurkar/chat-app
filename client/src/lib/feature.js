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

const transformImage = (url = "", width = 200) => {
    if (!url) return "";
    // If Cloudinary URL, can inject width, otherwise return clean URL
    if (url.includes("cloudinary.com")) {
        return url.replace("/upload/", `/upload/dpr_auto,w_${width}/`);
    }
    return url;
};

export { fileFormat, transformImage };
