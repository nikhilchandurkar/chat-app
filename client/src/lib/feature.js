const fileFormat = (url = "") => {
    // Strip query parameters or fragments
    const cleanUrl = url.split(/[?#]/)[0];
    
    const fileExt = cleanUrl.split(".").pop().toLowerCase();

    if (!fileExt) {
        return "unknown";
    }

    if (fileExt === "mp4" || fileExt === "webm" || fileExt === "ogg") {
        return "video";
    }

    if (fileExt === "mp3" || fileExt === "wav") {
        return "audio";
    }

    if (fileExt === "png" || fileExt === "jpg" || fileExt === "jpeg" || fileExt === "gif") {
        return "image";
    }

    return "file";
};

const transformImage = (url = "", width = 100) => {
    // You could add actual image transformation logic here, for now returning the URL
    return `${url}?width=${width}`;
};

export { fileFormat, transformImage };
