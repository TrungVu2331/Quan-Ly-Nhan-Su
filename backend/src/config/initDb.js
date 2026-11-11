const db = require('./db');
const bcrypt = require('bcryptjs');

const initDatabase = async () => {
    try {
        console.log('🔄 Đang kiểm tra và khởi tạo bảng CSDL...');

        // 1. Bảng users
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                full_name VARCHAR(100),
                role VARCHAR(50) DEFAULT 'HR',
                is_verified BOOLEAN DEFAULT FALSE,
                otp_code VARCHAR(10),
                otp_expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Bảng departments
        await db.query(`
            CREATE TABLE IF NOT EXISTS departments (
                id SERIAL PRIMARY KEY,
                dept_code VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Bảng employees
        await db.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(20),
                position VARCHAR(100) NOT NULL,
                department_id INT REFERENCES departments(id) ON DELETE SET NULL,
                base_salary NUMERIC(12, 2) NOT NULL DEFAULT 5000000.00,
                salary_coefficient NUMERIC(3, 2) DEFAULT 1.00,
                hire_date DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Bảng salaries
        await db.query(`
            CREATE TABLE IF NOT EXISTS salaries (
                id SERIAL PRIMARY KEY,
                employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
                year INT NOT NULL,
                work_days NUMERIC(4, 1) DEFAULT 26.0,
                allowance NUMERIC(12, 2) DEFAULT 0.00,
                deductions NUMERIC(12, 2) DEFAULT 0.00,
                final_salary NUMERIC(12, 2) NOT NULL,
                payment_status VARCHAR(20) DEFAULT 'UNPAID',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_emp_month_year UNIQUE (employee_id, month, year)
            );
        `);

        console.log('✅ Các bảng CSDL đã sẵn sàng!');

        // Seed dữ liệu mẫu nếu bảng users hoặc departments chưa có dữ liệu
        const userCheck = await db.query('SELECT COUNT(*) FROM users');
        if (parseInt(userCheck.rows[0].count, 10) === 0) {
            console.log('🌱 Đang chèn dữ liệu mẫu ban đầu (Seed data)...');
            
            // Tài khoản admin mặc định: admin@hrm.vn / Admin@123
            const hashedPassword = await bcrypt.hash('Admin@123', 10);
            await db.query(`
                INSERT INTO users (email, password, full_name, role, is_verified)
                VALUES ($1, $2, $3, $4, $5)
            `, ['admin@hrm.vn', hashedPassword, 'Quản Trị Viên HR', 'HR', true]);

            // Phòng ban mẫu
            const deptRes = await db.query(`
                INSERT INTO departments (dept_code, name, description)
                VALUES 
                    ('IT', 'Phòng Công Nghệ Thông Tin', 'Phát triển và bảo trì hệ thống phần mềm công ty'),
                    ('HR', 'Phòng Nhân Sự', 'Quản trị nhân lực, tuyển dụng và chế độ lương thưởng'),
                    ('MKT', 'Phòng Marketing', 'Quảng bá sản phẩm, truyền thông thương hiệu và đối ngoại'),
                    ('ACC', 'Phòng Tài Chính Kế Toán', 'Quản lý thu chi, ngân sách và báo cáo thuế')
                RETURNING id, dept_code;
            `);

            const deptMap = {};
            deptRes.rows.forEach(d => {
                deptMap[d.dept_code] = d.id;
            });

            // Nhân viên mẫu
            const empRes = await db.query(`
                INSERT INTO employees (full_name, email, phone, position, department_id, base_salary, salary_coefficient, hire_date)
                VALUES 
                    ('Nguyễn Văn An', 'an.nguyen@hrm.vn', '0912345678', 'Senior Fullstack Developer', $1, 20000000, 1.5, '2023-01-15'),
                    ('Trần Thị Bình', 'binh.tran@hrm.vn', '0923456789', 'HR Manager', $2, 18000000, 1.3, '2022-05-10'),
                    ('Lê Hoàng Long', 'long.le@hrm.vn', '0934567890', 'Marketing Specialist', $3, 12000000, 1.1, '2023-08-20'),
                    ('Phạm Minh Đức', 'duc.pham@hrm.vn', '0945678901', 'Kế toán viên', $4, 10000000, 1.0, '2024-02-01'),
                    ('Vũ Thùy Linh', 'linh.vu@hrm.vn', '0956789012', 'Frontend Developer', $1, 15000000, 1.2, '2023-11-01')
                RETURNING id;
            `, [deptMap['IT'], deptMap['HR'], deptMap['MKT'], deptMap['ACC']]);

            // Bảng lương mẫu cho tháng hiện tại
            const currentMonth = new Date().getMonth() + 1;
            const currentYear = new Date().getFullYear();

            for (const emp of empRes.rows) {
                // Tính lương mẫu:
                await db.query(`
                    INSERT INTO salaries (employee_id, month, year, work_days, allowance, deductions, final_salary, payment_status)
                    VALUES ($1, $2, $3, 26, 1500000, 500000, 
                        ROUND((( (SELECT base_salary * salary_coefficient FROM employees WHERE id = $1) / 26 ) * 26 + 1500000 - 500000)::numeric, 2),
                        'PAID'
                    )
                `, [emp.id, currentMonth, currentYear]);
            }

            console.log('🎉 Seed dữ liệu mẫu hoàn tất!');
            console.log('👉 Tài khoản mặc định: admin@hrm.vn / Mật khẩu: Admin@123');
        }
    } catch (error) {
        const errorDetail = error.errors?.map(e => e.message).join('; ') || error.message || error;
        console.error('❌ Lỗi khởi tạo cơ sở dữ liệu:', errorDetail);
        throw error;
    }
};

module.exports = { initDatabase };
