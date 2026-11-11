require('dotenv').config();
const app = require('./src/app');
const { initDatabase } = require('./src/config/initDb');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        // Tự động kiểm tra và tạo bảng / chèn dữ liệu mẫu ban đầu
        await initDatabase();

        app.listen(PORT, '0.0.0.0', () => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`🚀 [HRM Backend]: Server đang chạy tại http://localhost:${PORT}`);
            console.log(`📡 [Health Check]: http://localhost:${PORT}/api/health`);
            console.log('📌 [Tài khoản test]: email: admin@hrm.vn | mật khẩu: Admin@123');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
    } catch (error) {
        const errorDetail = error.errors?.map(e => e.message).join('; ') || error.message || error;
        console.error('❌ Không thể khởi động server backend:', errorDetail);
        process.exit(1);
    }
};

startServer();
