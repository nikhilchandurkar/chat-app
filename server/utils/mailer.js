import nodemailer from "nodemailer";

/**
 * Reusable nodemailer transporter.
 * Reads SMTP credentials from environment variables.
 * Works with Gmail (App Password), SendGrid, Mailgun, etc.
 */
const createTransporter = () =>
    nodemailer.createTransport({
        host: process.env.EMAIL_HOST || "smtp.gmail.com",
        port: parseInt(process.env.EMAIL_PORT || "587"),
        secure: process.env.EMAIL_SECURE === "true", // true for port 465
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

/**
 * Send password reset email with a secure URL-based token.
 * @param {string} toEmail - Recipient email
 * @param {string} resetUrl - Full reset URL (token embedded)
 * @param {string} userName - User's display name
 */
export const sendResetEmail = async (toEmail, resetUrl, userName = "there") => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"ChatApp" <${process.env.EMAIL_USER}>`,
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
