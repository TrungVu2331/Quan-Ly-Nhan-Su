const { getTransporter } = require('../config/mailer');

/**
 * Tạo nội dung HTML cho email chứa mã OTP
 */
const buildOtpHtmlTemplate = (otpCode, fullName) => `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
            .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
            .header { background: linear-gradient(135deg, #1890ff, #096dd9); padding: 30px 20px; text-align: center; color: #ffffff; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
            .content { padding: 30px; color: #333333; line-height: 1.6; }
            .otp-box { text-align: center; margin: 25px 0; padding: 15px; background: #e6f7ff; border: 2px dashed #1890ff; border-radius: 8px; }
            .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #096dd9; }
            .footer { background: #fafafa; padding: 20px; text-align: center; font-size: 13px; color: #888888; border-top: 1px solid #f0f0f0; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                <h1>Hệ Thống HRM & Quản Lý Bảng Lương</h1>
            </div>
            <div class="content">
                <p>Xin chào <strong>${fullName}</strong>,</p>
                <p>Bạn đã đăng ký tài khoản trên hệ thống quản lý nhân sự HRM. Vui lòng sử dụng mã xác thực OTP bên dưới để kích hoạt tài khoản của bạn:</p>
                <div class="otp-box">
                    <div class="otp-code">${otpCode}</div>
                </div>
                <p>Mã OTP này có hiệu lực trong <strong>5 phút</strong>. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.</p>
                <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.</p>
            </div>
            <div class="footer">
                <p>© 2026 HRM System - Nhóm 6 BTL Web Nâng Cao. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
`;

/**
 * Gửi email qua Brevo HTTP API (Port 443 - hoạt động ổn định trên Render Free tier)
 */
const sendViaBrevoApi = async ({ toEmail, fullName, subject, htmlContent }) => {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER;
    const senderName = process.env.BREVO_SENDER_NAME || 'HRM System';

    if (!senderEmail || senderEmail.includes('your_email')) {
        throw new Error('Thiếu cấu hình BREVO_SENDER_EMAIL hợp lệ!');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'api-key': apiKey,
        },
        body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: toEmail, name: fullName }],
            subject,
            htmlContent,
        }),
        signal: AbortSignal.timeout(10000),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || `Brevo API lỗi HTTP ${response.status}`);
    }

    return {
        success: true,
        isMock: false,
        provider: 'brevo',
        messageId: data.messageId,
    };
};

/**
 * Gửi email chứa mã OTP xác thực tài khoản
 * @param {string} toEmail - Địa chỉ email người nhận
 * @param {string} otpCode - Mã OTP 6 chữ số
 * @param {string} fullName - Tên người nhận
 */
const sendOtpEmail = async (toEmail, otpCode, fullName = 'Người dùng') => {
    const subject = `[HRM System] Mã xác thực OTP tài khoản của bạn: ${otpCode}`;
    const htmlContent = buildOtpHtmlTemplate(otpCode, fullName);

    // In mã OTP ra màn hình terminal để hỗ trợ test nhanh và theo dõi server logs
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔐 [MÃ OTP XÁC THỰC CHO ${toEmail}]: ====> ${otpCode} <====`);
    console.log('⏰ Thời hạn: 5 phút');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Ưu tiên 1: Gửi qua Brevo HTTP API (cổng 443, không bị chặn trên Render Free)
    if (process.env.BREVO_API_KEY) {
        try {
            const result = await sendViaBrevoApi({ toEmail, fullName, subject, htmlContent });
            console.log(`📧 [Brevo API]: Đã gửi OTP thành công tới ${toEmail} (ID: ${result.messageId})`);
            return result;
        } catch (error) {
            console.error('⚠️ [Brevo API]: Không thể gửi email:', error.message);
            return { success: false, isMock: true, error: error.message };
        }
    }

    // Ưu tiên 2: Nodemailer (SMTP khi chạy Local / Paid server, hoặc Mock khi chưa cấu hình)
    const transporter = getTransporter();
    const fromAddress = process.env.EMAIL_FROM || '"HRM System" <noreply@hrm.vn>';

    try {
        const info = await transporter.sendMail({
            from: fromAddress,
            to: toEmail,
            subject,
            html: htmlContent,
        });
        const isMock = Boolean(info.messageId && info.messageId.startsWith('dev-mock-id-'));
        return {
            success: true,
            isMock,
            provider: isMock ? 'mock' : 'smtp',
            messageId: info.messageId,
        };
    } catch (error) {
        console.error('⚠️ Không thể gửi mail qua SMTP, nhưng OTP đã được ghi log:', error.message);
        return { success: false, isMock: true, error: error.message };
    }
};

module.exports = {
    sendOtpEmail,
};
