import fs from 'fs';
import path from 'path';

export const requestLogger = (req, res, next) => {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const logDir = path.join(process.cwd(), 'logs');
    
    if (!fs.existsSync(logDir)) {
        try {
            fs.mkdirSync(logDir);
        } catch(err) {
            console.error('Failed to create logs directory', err);
        }
    }
    
    const logFilePath = path.join(logDir, `${dateStr}.log`);
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'Unknown IP';
    const logEntry = `[${date.toISOString()}] IP: ${ip} | Method: ${req.method} | URL: ${req.originalUrl} | User-Agent: ${req.headers['user-agent']}\n`;
    
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) console.error('Failed to write log', err);
    });
    
    next();
};
