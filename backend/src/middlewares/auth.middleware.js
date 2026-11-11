const { verifyToken } = require('../utils/token');

/**
 * Middleware xác thực JWT token
 */
const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Không tìm thấy token xác thực. Vui lòng đăng nhập lại!',
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);

        // Gán thông tin người dùng vào req
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Token xác thực không hợp lệ hoặc đã hết hạn!',
            error: error.message,
        });
    }
};

/**
 * Middleware phân quyền (Role-based access control)
 * @param  {...string} roles - Các quyền được phép (ví dụ: 'HR', 'Admin', 'Manager')
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền thực hiện thao tác này!',
            });
        }
        next();
    };
};

module.exports = {
    authenticate,
    authorize,
    verifyToken: authenticate,
};
