
import nodemailer from "nodemailer";

/**
 * Reusable nodemailer transporter.
 * Reads SMTP credentials from environment variables.
 * Supports Gmail (service: 'gmail' or SMTP), SendGrid, Mailgun, custom SMTP, etc.
 */
const createTransporter = () => {
    const user = process.env.EMAIL_USER?.trim();
    // Google App Passwords are shown with spaces (e.g. "abcd efgh ijkl mnop") - remove spaces
    const pass = process.env.EMAIL_PASS?.trim().replace(/\s+/g, "");
    const host = process.env.EMAIL_HOST?.trim();
    const service = process.env.EMAIL_SERVICE?.trim()?.toLowerCase();
    const port = parseInt(process.env.EMAIL_PORT || "465");

    if (!user || !pass) {
        console.error("Mailer Error: EMAIL_USER or EMAIL_PASS environment variable is missing in server .env");
        throw new Error("Email service is not configured on the server. Please set EMAIL_USER and EMAIL_PASS.");
    }

    // If service is explicitly 'gmail' or host is Gmail or user is a Gmail address without custom host
    if (service === "gmail" || (!host && user.endsWith("@gmail.com")) || host === "smtp.gmail.com") {
        return nodemailer.createTransport({
            service: "gmail",
            auth: { user, pass },
            tls: {
                rejectUnauthorized: false,
            },
        });
    }

    // Custom SMTP configuration
    const isSecure = process.env.EMAIL_SECURE === "true" || port === 465;
    return nodemailer.createTransport({
        host: host || "smtp.gmail.com",
        port: port,
        secure: isSecure, // true for 465, false for other ports (587 uses STARTTLS)
        auth: { user, pass },
        tls: {
            rejectUnauthorized: false,
        },
    });
};

/**
 * Send password reset email with a secure URL-based token.
 * @param {string} toEmail - Recipient email
 * @param {string} resetUrl - Full reset URL (token embedded)
 * @param {string} userName - User's display name
 */
export const sendResetEmail = async (toEmail, resetUrl, userName = "there") => {
    const user = process.env.EMAIL_USER?.trim();
    const fromAddress = process.env.EMAIL_FROM?.trim() || user;

    const transporter = createTransporter();

    const mailOptions = {
        from: `"ChatApp" <${fromAddress}>`,
        to: toEmail,
        subject: "Reset Your ChatApp Password",
        html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
            <div style="max-width: 520px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px; letter-spacing: -0.5px;">💬 ChatApp</h1>
                </div>
                <!-- Body -->
                <div style="padding: 32px;">
                    <h2 style="margin: 0 0 8px; color: #1a202c;">Hi ${userName},</h2>
                    <p style="color: #4a5568; line-height: 1.6; margin: 0 0 24px;">
                        We received a request to reset the password for your ChatApp account.
                        Click the button below to set a new password.
                    </p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${resetUrl}"
                           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block; letter-spacing: 0.2px;">
                            Reset Password
                        </a>
                    </div>
                    <p style="color: #718096; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
                        ⏰ This link is valid for <strong>1 hour</strong>.
                    </p>
                    <p style="color: #718096; font-size: 14px; line-height: 1.6; margin: 0;">
                        If you didn't request a password reset, you can safely ignore this email.
                        Your password will not change.
                    </p>
                    <!-- Fallback URL -->
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                    <p style="color: #a0aec0; font-size: 12px; word-break: break-all; margin: 0;">
                        If the button doesn't work, copy and paste this URL:<br />
                        <a href="${resetUrl}" style="color: #667eea;">${resetUrl}</a>
                    </p>
                </div>
                <!-- Footer -->
                <div style="padding: 16px 32px; background: #f7fafc; text-align: center;">
                    <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} ChatApp. All rights reserved.
                    </p>
                </div>
            </div>
        </body>
        </html>
        `,
        text: `Hi ${userName},\n\nReset your ChatApp password here:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, please ignore this email.`,
    };

    await transporter.sendMail(mailOptions);
};
