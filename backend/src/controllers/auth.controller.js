const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateToken } = require('../utils/token');
const { sendOtpEmail } = require('../services/mail.service');

/**
 * Xác định có trả về otpPreview cho client không (chỉ bật khi dev hoặc khi chưa gửi được mail thật)
 */
const getOtpPreview = (otpCode, mailResult) => {
    const isRealEmailSent = mailResult?.success && !mailResult?.isMock;
    if (process.env.NODE_ENV !== 'production' || !isRealEmailSent) {
        return otpCode;
    }
    return undefined;
};

/**
 * Đăng ký tài khoản mới
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
    try {
        const { email, password, full_name, role } = req.body;

        if (!email || !password || !full_name) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng điền đầy đủ Họ tên, Email và Mật khẩu!',
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Kiểm tra xem email đã tồn tại chưa
        const existing = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

        if (existing.rows.length > 0) {
            const user = existing.rows[0];
            if (user.is_verified) {
                return res.status(400).json({
                    success: false,
                    message: 'Email này đã được đăng ký và xác thực trên hệ thống!',
                });
            }
        }

        // Tạo OTP 6 chữ số ngẫu nhiên
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút
        const hashedPassword = await bcrypt.hash(password, 10);
        const assignedRole = role || 'HR';

        if (existing.rows.length > 0) {
            // Cập nhật lại thông tin cho tài khoản chưa verify
            await db.query(`
                UPDATE users 
                SET password = $1, full_name = $2, role = $3, otp_code = $4, otp_expires_at = $5, is_verified = FALSE
                WHERE email = $6
            `, [hashedPassword, full_name.trim(), assignedRole, otpCode, otpExpiresAt, normalizedEmail]);
        } else {
            // Thêm mới tài khoản
            await db.query(`
                INSERT INTO users (email, password, full_name, role, is_verified, otp_code, otp_expires_at)
                VALUES ($1, $2, $3, $4, FALSE, $5, $6)
            `, [normalizedEmail, hashedPassword, full_name.trim(), assignedRole, otpCode, otpExpiresAt]);
        }

        // Gửi email chứa mã OTP
        const mailResult = await sendOtpEmail(normalizedEmail, otpCode, full_name.trim());
        const otpPreview = getOtpPreview(otpCode, mailResult);

        res.status(201).json({
            success: true,
            message: otpPreview
                ? 'Đăng ký thành công! Vui lòng sử dụng mã OTP hiển thị trên màn hình để xác thực.'
                : 'Đăng ký thành công! Mã OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (hoặc thư mục Spam).',
            email: normalizedEmail,
            otpPreview,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Xác thực mã OTP
 * POST /api/auth/verify-otp
 */
const verifyOtp = async (req, res, next) => {
    try {
        const { email, otp_code } = req.body;

        if (!email || !otp_code) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp Email và Mã OTP!',
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const userRes = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

        if (userRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy tài khoản với email này!',
            });
        }

        const user = userRes.rows[0];

        if (user.is_verified) {
            return res.status(200).json({
                success: true,
                message: 'Tài khoản này đã được xác thực trước đó. Bạn có thể đăng nhập ngay!',
            });
        }

        // Kiểm tra mã OTP
        if (user.otp_code !== otp_code.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Mã OTP không chính xác. Vui lòng kiểm tra lại!',
            });
        }

        // Kiểm tra thời hạn OTP
        if (new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({
                success: false,
                message: 'Mã OTP đã hết hạn (quá 5 phút). Vui lòng nhấn gửi lại mã mới!',
            });
        }

        // Cập nhật trạng thái xác thực
        await db.query(`
            UPDATE users 
            SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL 
            WHERE id = $1
        `, [user.id]);

        res.status(200).json({
            success: true,
            message: 'Kích hoạt tài khoản thành công! Bạn có thể tiến hành đăng nhập.',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Gửi lại mã OTP
 * POST /api/auth/resend-otp
 */
const resendOtp = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp email!',
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const userRes = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

        if (userRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tài khoản không tồn tại!',
            });
        }

        const user = userRes.rows[0];
        if (user.is_verified) {
            return res.status(400).json({
                success: false,
                message: 'Tài khoản đã được xác thực, không cần gửi lại OTP!',
            });
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await db.query(`
            UPDATE users 
            SET otp_code = $1, otp_expires_at = $2 
            WHERE id = $3
        `, [otpCode, otpExpiresAt, user.id]);

        const mailResult = await sendOtpEmail(normalizedEmail, otpCode, user.full_name);
        const otpPreview = getOtpPreview(otpCode, mailResult);

        res.status(200).json({
            success: true,
            message: otpPreview
                ? 'Mã OTP mới đã được tạo trên màn hình!'
                : 'Mã OTP mới đã được gửi tới email của bạn!',
            otpPreview,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Đăng nhập
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập email và mật khẩu!',
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const userRes = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

        if (userRes.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Email hoặc mật khẩu không chính xác!',
            });
        }

        const user = userRes.rows[0];

        // Kiểm tra xem đã kích hoạt tài khoản bằng OTP chưa
        if (!user.is_verified) {
            return res.status(403).json({
                success: false,
                is_verified: false,
                email: user.email,
                message: 'Tài khoản chưa được kích hoạt qua mã OTP. Vui lòng xác thực tài khoản!',
            });
        }

        // Kiểm tra mật khẩu
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Email hoặc mật khẩu không chính xác!',
            });
        }

        // Tạo JWT Token
        const tokenPayload = {
            id: user.id,
            email: user.email,
            role: user.role,
            full_name: user.full_name,
        };

        const token = generateToken(tokenPayload);

        res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công!',
            token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy thông tin tài khoản hiện tại
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
    try {
        const userRes = await db.query('SELECT id, email, full_name, role, created_at FROM users WHERE id = $1', [req.user.id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông tin người dùng!',
            });
        }

        res.status(200).json({
            success: true,
            data: userRes.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    verifyOtp,
    resendOtp,
    login,
    getMe,
};
