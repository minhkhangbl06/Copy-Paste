-- MICROSOFT SQL SERVER (SSMS / T-SQL)
USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = N'hotel_management_db')
BEGIN
    ALTER DATABASE hotel_management_db SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE hotel_management_db;
END
GO

CREATE DATABASE hotel_management_db COLLATE Latin1_General_100_CI_AS_SC_UTF8;
GO

USE hotel_management_db;
GO

CREATE TABLE roles (
    role_id INT IDENTITY(1,1) PRIMARY KEY,
    role_code NVARCHAR(30) NOT NULL UNIQUE,
    role_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE users (
    user_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    role_id INT NOT NULL,
    email NVARCHAR(255) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(150) NOT NULL,
    phone NVARCHAR(30),
    national_id NVARCHAR(50),
    status NVARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOCKED')),
    last_login_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_users_roles FOREIGN KEY (role_id) REFERENCES roles(role_id)
);
GO

CREATE TABLE room_types (
    room_type_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL UNIQUE,
    base_price DECIMAL(18,2) NOT NULL CHECK (base_price > 0),
    max_capacity INT NOT NULL CHECK (max_capacity BETWEEN 1 AND 20),
    bed_count INT NOT NULL DEFAULT 1,
    bed_type NVARCHAR(50) NOT NULL DEFAULT 'King',
    area_sqm DECIMAL(6,2),
    amenities NVARCHAR(MAX), -- JSON string
    description NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE rooms (
    room_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    room_number NVARCHAR(20) NOT NULL UNIQUE,
    room_type_id INT NOT NULL,
    floor INT NOT NULL DEFAULT 1,
    status NVARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' 
        CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'CLEANING', 'MAINTENANCE')),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_rooms_room_types FOREIGN KEY (room_type_id) REFERENCES room_types(room_type_id)
);
GO

CREATE TABLE room_rates (
    rate_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    room_type_id INT NOT NULL,
    stay_date DATE NOT NULL,
    rate DECIMAL(18,2) NOT NULL CHECK (rate > 0),
    rule_type NVARCHAR(20) NOT NULL DEFAULT 'BASE' CHECK (rule_type IN ('BASE', 'WEEKEND', 'HOLIDAY', 'PROMOTION')),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_room_type_date UNIQUE (room_type_id, stay_date),
    CONSTRAINT FK_room_rates_room_types FOREIGN KEY (room_type_id) REFERENCES room_types(room_type_id) ON DELETE CASCADE
);
GO

CREATE TABLE bookings (
    booking_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    booking_code NVARCHAR(50) NOT NULL UNIQUE,
    guest_id BIGINT NOT NULL,
    guest_name NVARCHAR(150) NOT NULL,
    guest_phone NVARCHAR(30) NOT NULL,
    guest_email NVARCHAR(255) NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')),
    total_nights AS (DATEDIFF(day, check_in_date, check_out_date)) PERSISTED,
    subtotal_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (subtotal_amount >= 0),
    deposit_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (deposit_amount >= 0),
    deposit_status NVARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (deposit_status IN ('PENDING', 'PAID', 'REFUNDED')),
    notes NVARCHAR(MAX),
    created_by BIGINT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CHK_booking_dates CHECK (check_out_date > check_in_date),
    CONSTRAINT FK_bookings_guest FOREIGN KEY (guest_id) REFERENCES users(user_id),
    CONSTRAINT FK_bookings_created_by FOREIGN KEY (created_by) REFERENCES users(user_id)
);
GO

CREATE TABLE booking_rooms (
    booking_room_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    booking_id BIGINT NOT NULL,
    room_id BIGINT NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    price_per_night DECIMAL(18,2) NOT NULL CHECK (price_per_night >= 0),
    total_room_amount DECIMAL(18,2) NOT NULL CHECK (total_room_amount >= 0),
    status NVARCHAR(20) NOT NULL DEFAULT 'RESERVED' 
        CHECK (status IN ('RESERVED', 'OCCUPIED', 'CHECKED_OUT', 'CANCELLED')),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CHK_booking_room_dates CHECK (check_out_date > check_in_date),
    CONSTRAINT FK_booking_rooms_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    CONSTRAINT FK_booking_rooms_room FOREIGN KEY (room_id) REFERENCES rooms(room_id)
);
GO

CREATE OR ALTER TRIGGER trg_check_double_booking_sqlserver
ON booking_rooms
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    IF EXISTS (
        SELECT 1
        FROM booking_rooms br
        INNER JOIN inserted i ON br.room_id = i.room_id AND br.booking_room_id != i.booking_room_id
        WHERE br.status != 'CANCELLED' 
          AND i.status != 'CANCELLED'
          AND NOT (br.check_out_date <= i.check_in_date OR br.check_in_date >= i.check_out_date)
    )
    BEGIN
        RAISERROR(N'DOUBLE_BOOKING_ERROR: Phát hiện xung đột trùng lịch phòng trên SQL Server!', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
END;
GO

CREATE TABLE services (
    service_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(150) NOT NULL UNIQUE,
    category NVARCHAR(30) NOT NULL DEFAULT 'FOOD' 
        CHECK (category IN ('FOOD', 'BEVERAGE', 'LAUNDRY', 'TRANSPORT', 'CLEANING', 'OTHER')),
    unit NVARCHAR(50) NOT NULL DEFAULT N'Lần',
    price DECIMAL(18,2) NOT NULL CHECK (price >= 0),
    department NVARCHAR(30) NOT NULL DEFAULT 'KITCHEN' 
        CHECK (department IN ('KITCHEN', 'HOUSEKEEPING', 'FRONT_DESK', 'EXTERNAL')),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE service_orders (
    order_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    order_code NVARCHAR(50) NOT NULL UNIQUE,
    booking_id BIGINT NOT NULL,
    room_id BIGINT NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
    total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    requested_by BIGINT NULL,
    assigned_to BIGINT NULL,
    notes NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_service_orders_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT FK_service_orders_room FOREIGN KEY (room_id) REFERENCES rooms(room_id),
    CONSTRAINT FK_service_orders_requester FOREIGN KEY (requested_by) REFERENCES users(user_id),
    CONSTRAINT FK_service_orders_assignee FOREIGN KEY (assigned_to) REFERENCES users(user_id)
);
GO

CREATE TABLE service_order_items (
    order_item_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    order_id BIGINT NOT NULL,
    service_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(18,2) NOT NULL CHECK (unit_price >= 0),
    amount AS (quantity * unit_price) PERSISTED,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_order_items_order FOREIGN KEY (order_id) REFERENCES service_orders(order_id) ON DELETE CASCADE,
    CONSTRAINT FK_order_items_service FOREIGN KEY (service_id) REFERENCES services(service_id)
);
GO

CREATE TABLE invoices (
    invoice_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    invoice_code NVARCHAR(50) NOT NULL UNIQUE,
    booking_id BIGINT NOT NULL UNIQUE,
    room_charge DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    service_charge DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    late_checkout_fee DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    surcharge DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    deposit_deducted DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    final_total DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (final_total >= 0),
    status NVARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'PAID', 'CLOSED')),
    closed_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_invoices_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
);
GO

CREATE TABLE invoice_items (
    item_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    item_type NVARCHAR(30) NOT NULL 
        CHECK (item_type IN ('ROOM', 'SERVICE', 'LATE_CHECKOUT', 'SURCHARGE', 'DISCOUNT')),
    description NVARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(18,2) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE CASCADE
);
GO

CREATE TABLE payments (
    payment_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    booking_id BIGINT NOT NULL,
    payment_type NVARCHAR(20) NOT NULL CHECK (payment_type IN ('DEPOSIT', 'SERVICE', 'BALANCE', 'REFUND')),
    payment_method NVARCHAR(30) NOT NULL CHECK (payment_method IN ('CASH', 'CREDIT_CARD', 'BANK_TRANSFER', 'MOMO', 'VNPAY')),
    amount DECIMAL(18,2) NOT NULL CHECK (amount > 0),
    status NVARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    transaction_ref NVARCHAR(100) NULL,
    paid_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    processed_by BIGINT NULL,
    CONSTRAINT FK_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id),
    CONSTRAINT FK_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT FK_payments_processor FOREIGN KEY (processed_by) REFERENCES users(user_id)
);
GO

CREATE TABLE housekeeping_tasks (
    task_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    room_id BIGINT NOT NULL,
    booking_id BIGINT NULL,
    assigned_to BIGINT NULL,
    confirmed_by BIGINT NULL,
    task_type NVARCHAR(30) NOT NULL DEFAULT 'CLEANING' CHECK (task_type IN ('CLEANING', 'INSPECTION', 'MAINTENANCE')),
    status NVARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED')),
    notes NVARCHAR(MAX),
    started_at DATETIME2 NULL,
    completed_at DATETIME2 NULL,
    verified_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_housekeeping_room FOREIGN KEY (room_id) REFERENCES rooms(room_id),
    CONSTRAINT FK_housekeeping_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT FK_housekeeping_assignee FOREIGN KEY (assigned_to) REFERENCES users(user_id),
    CONSTRAINT FK_housekeeping_confirmer FOREIGN KEY (confirmed_by) REFERENCES users(user_id)
);
GO

CREATE TABLE reviews (
    review_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    booking_id BIGINT NOT NULL UNIQUE,
    guest_id BIGINT NOT NULL,
    overall_rating TINYINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    cleanliness_rating TINYINT CHECK (cleanliness_rating BETWEEN 1 AND 5),
    service_rating TINYINT CHECK (service_rating BETWEEN 1 AND 5),
    comment NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT FK_reviews_guest FOREIGN KEY (guest_id) REFERENCES users(user_id)
);
GO

CREATE TABLE notifications (
    notification_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title NVARCHAR(200) NOT NULL,
    content NVARCHAR(MAX) NOT NULL,
    type NVARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    is_read BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_notifications_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
GO

CREATE TABLE audit_logs (
    log_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    actor_id BIGINT NULL,
    action NVARCHAR(100) NOT NULL,
    entity_type NVARCHAR(100) NOT NULL,
    entity_id BIGINT NULL,
    old_value NVARCHAR(MAX) NULL,
    new_value NVARCHAR(MAX) NULL,
    ip_address NVARCHAR(45) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_audit_actor FOREIGN KEY (actor_id) REFERENCES users(user_id)
);
GO

CREATE NONCLUSTERED INDEX IX_booking_dates ON bookings (check_in_date, check_out_date, status);
CREATE NONCLUSTERED INDEX IX_booking_rooms_lookup ON booking_rooms (room_id, check_in_date, check_out_date);
CREATE NONCLUSTERED INDEX IX_rooms_status ON rooms (room_type_id, status);
CREATE NONCLUSTERED INDEX IX_service_orders_booking ON service_orders (booking_id, status);
GO
 

SET IDENTITY_INSERT roles ON;
INSERT INTO roles (role_id, role_code, role_name, description) VALUES
(1, N'GUEST', N'Khách hàng', N'Đặt phòng và dịch vụ'),
(2, N'FRONT_DESK', N'Lễ tân', N'Quản lý check-in / check-out'),
(3, N'HOUSEKEEPING', N'Buồng phòng', N'Dọn phòng và kiểm tra phòng'),
(4, N'ROOM_SERVICE', N'Dịch vụ phòng', N'Chế biến và phục vụ món'),
(5, N'BILLING', N'Thu ngân', N'Chốt và đối soát hóa đơn'),
(6, N'MANAGER', N'Quản trị viên', N'Toàn quyền hệ thống');
SET IDENTITY_INSERT roles OFF;
GO

SET IDENTITY_INSERT users ON;
INSERT INTO users (user_id, role_id, email, password_hash, full_name, phone, national_id, status) VALUES
(1, 1, N'guest@example.com', N'$2y$10$e8w.p4fH4mG2cT9vW1p2n.v7F7K7c6H7K7c6H7K7c6H7K7c6H7K7c', N'Nguyễn Văn An', N'0901234567', N'079204001234', N'ACTIVE'),
(2, 2, N'receptionist@hotel.com', N'$2y$10$e8w.p4fH4mG2cT9vW1p2n.v7F7K7c6H7K7c6H7K7c6H7K7c6H7K7c', N'Trần Thị Lễ Tân', N'0912345678', N'079204005678', N'ACTIVE'),
(3, 3, N'housekeeping@hotel.com', N'$2y$10$e8w.p4fH4mG2cT9vW1p2n.v7F7K7c6H7K7c6H7K7c6H7K7c6H7K7c', N'Lê Văn Buồng Phòng', N'0923456789', N'079204009012', N'ACTIVE'),
(4, 4, N'service@hotel.com', N'$2y$10$e8w.p4fH4mG2cT9vW1p2n.v7F7K7c6H7K7c6H7K7c6H7K7c6H7K7c', N'Phạm Bếp Trưởng', N'0934567890', N'079204003456', N'ACTIVE'),
(5, 5, N'billing@hotel.com', N'$2y$10$e8w.p4fH4mG2cT9vW1p2n.v7F7K7c6H7K7c6H7K7c6H7K7c6H7K7c', N'Hoàng Thu Ngân', N'0945678901', N'079204007890', N'ACTIVE'),
(6, 6, N'manager@hotel.com', N'$2y$10$e8w.p4fH4mG2cT9vW1p2n.v7F7K7c6H7K7c6H7K7c6H7K7c6H7K7c', N'Võ Giám Đốc', N'0956789012', N'079204001122', N'ACTIVE');
SET IDENTITY_INSERT users OFF;
GO

SET IDENTITY_INSERT room_types ON;
INSERT INTO room_types (room_type_id, name, base_price, max_capacity, bed_count, bed_type, area_sqm, description) VALUES
(1, N'Standard', 500000.00, 2, 1, N'Queen', 22.0, N'Phòng tiêu chuẩn 2 khách'),
(2, N'Deluxe', 800000.00, 3, 2, N'Twin/King', 32.0, N'Phòng sang trọng view thành phố'),
(3, N'Family', 1200000.00, 4, 2, N'2 Double', 45.0, N'Phòng rộng rãi cho gia đình'),
(4, N'Suite', 1500000.00, 4, 1, N'Super King', 60.0, N'Căn hộ cao cấp có phòng khách riêng');
SET IDENTITY_INSERT room_types OFF;
GO

INSERT INTO rooms (room_number, room_type_id, floor, status) VALUES
(N'101', 1, 1, N'AVAILABLE'), (N'102', 1, 1, N'AVAILABLE'), (N'103', 1, 1, N'AVAILABLE'),
(N'104', 1, 1, N'AVAILABLE'), (N'105', 1, 1, N'AVAILABLE'), (N'106', 1, 1, N'AVAILABLE'),
(N'107', 1, 1, N'AVAILABLE'), (N'108', 1, 1, N'AVAILABLE'), (N'109', 1, 1, N'AVAILABLE'), (N'110', 1, 1, N'AVAILABLE'),
(N'201', 2, 2, N'AVAILABLE'), (N'202', 2, 2, N'AVAILABLE'), (N'203', 2, 2, N'AVAILABLE'),
(N'204', 2, 2, N'AVAILABLE'), (N'205', 2, 2, N'AVAILABLE'), (N'206', 2, 2, N'AVAILABLE'),
(N'207', 2, 2, N'AVAILABLE'), (N'208', 2, 2, N'AVAILABLE'), (N'209', 2, 2, N'AVAILABLE'), (N'210', 2, 2, N'AVAILABLE'),
(N'301', 3, 3, N'AVAILABLE'), (N'302', 3, 3, N'AVAILABLE'), (N'303', 3, 3, N'AVAILABLE'),
(N'304', 3, 3, N'AVAILABLE'), (N'305', 3, 3, N'AVAILABLE'),
(N'401', 4, 4, N'AVAILABLE'), (N'402', 4, 4, N'AVAILABLE'), (N'403', 4, 4, N'AVAILABLE'),
(N'404', 4, 4, N'AVAILABLE'), (N'405', 4, 4, N'AVAILABLE');
GO

SET IDENTITY_INSERT services ON;
INSERT INTO services (service_id, name, category, unit, price, department) VALUES
(1, N'Set ăn sáng Buffet', N'FOOD', N'Khách', 100000.00, N'KITCHEN'),
(2, N'Giặt ủi quần áo', N'LAUNDRY', N'Kg', 50000.00, N'HOUSEKEEPING'),
(3, N'Đưa đón sân bay', N'TRANSPORT', N'Chuyến', 300000.00, N'EXTERNAL'),
(4, N'Dọn phòng ngoài giờ', N'CLEANING', N'Lần', 100000.00, N'HOUSEKEEPING');
SET IDENTITY_INSERT services OFF;
GO

-- Demo Booking
SET IDENTITY_INSERT bookings ON;
INSERT INTO bookings (booking_id, booking_code, guest_id, guest_name, guest_phone, guest_email, check_in_date, check_out_date, status, subtotal_amount, deposit_amount, deposit_status, created_by)
VALUES (1, N'BK-202611-001', 1, N'Nguyễn Văn An', N'0901234567', N'guest@example.com', '2026-11-20', '2026-11-23', N'CONFIRMED', 2400000.00, 800000.00, N'PAID', 1);
SET IDENTITY_INSERT bookings OFF;
GO

SET IDENTITY_INSERT booking_rooms ON;
INSERT INTO booking_rooms (booking_room_id, booking_id, room_id, check_in_date, check_out_date, price_per_night, total_room_amount, status)
VALUES (1, 1, 11, '2026-11-20', '2026-11-23', 800000.00, 2400000.00, N'RESERVED');
SET IDENTITY_INSERT booking_rooms OFF;
GO

UPDATE rooms SET status = N'RESERVED' WHERE room_id = 11;
GO
