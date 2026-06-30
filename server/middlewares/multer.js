import multer from "multer"
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "media");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const multerUpload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 5, // 5MB Limit
    },
    fileFilter: (req, file, cb) => {
        // Prevent zip bombs and executables
        const blockedTypes = ['application/zip', 'application/x-zip-compressed', 'application/x-msdownload', 'application/x-sh'];
        if (blockedTypes.includes(file.mimetype)) {
            return cb(new Error("File type not allowed for security reasons"), false);
        }
        cb(null, true);
    }
})

const singleAvatar = multerUpload.single("avatar")
const attachmentsMulter = multerUpload.array("files",5);


export {
    multerUpload,
    singleAvatar,
    attachmentsMulter
}