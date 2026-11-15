/**
 * Hotel Reservation System - Staff API Client Module
 * File: HotelReservation/frontend/staff/js/api.js
 * Author: Pham Quang Duy (Staff Frontend)
 *
 * Quy tắc kiến trúc:
 * 1. API thật (Backend Laravel) là nguồn dữ liệu chính mặc định.
 * 2. Không tự động âm thầm chuyển sang Mock Data khi API lỗi.
 * 3. Mock Mode phải được người dùng bật CHỦ ĐỘNG qua nút chuyển đổi chế độ.
 * 4. Khi Mock Mode bật, hiển thị nhãn: "DỮ LIỆU MÔ PHỎNG / CHỜ TÍCH HỢP API".
 * 5. Mock Repository lưu trữ trong localStorage để kiểm thử giao diện nhất quán.
 * 6. Tuân thủ chuẩn Response của dự án: { status: "success"|"error", message: "...", data: {...} }
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StaffAPI = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Cấu hình URL Backend Laravel
  var DEFAULT_API_BASE = 'http://127.0.0.1:8000/api';
  var STORAGE_KEYS = {
    MOCK_MODE: 'hotel_staff_mock_mode',
    MOCK_BOOKINGS: 'hotel_staff_mock_bookings',
    MOCK_ROOMS: 'hotel_staff_mock_rooms',
    MOCK_SERVICES: 'hotel_staff_mock_services',
    MOCK_ORDERS: 'hotel_staff_mock_orders',
    MOCK_INVOICES: 'hotel_staff_mock_invoices'
  };

  /**
   * ==========================================
   * 1. QUẢN LÝ CHẾ ĐỘ MOCK MODE (CHỦ ĐỘNG)
   * ==========================================
   */
  var MockModeManager = {
    isMockMode: function () {
      return localStorage.getItem(STORAGE_KEYS.MOCK_MODE) === 'true';
    },

    setMockMode: function (enabled) {
      localStorage.setItem(STORAGE_KEYS.MOCK_MODE, enabled ? 'true' : 'false');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('staff:mode-change', {
          detail: { isMock: enabled }
        }));
      }
    },

    toggleMockMode: function () {
      var current = this.isMockMode();
      this.setMockMode(!current);
      return !current;
    }
  };

  /**
   * ==========================================
   * 2. MOCK DATA REPOSITORY (LOCALSTORAGE)
   * Dữ liệu mô phỏng bám sát schema Báo cáo CK
   * ==========================================
   */
  var MockRepository = {
    _defaultRooms: [
      { id: 1, room_number: "101", room_type: "Deluxe Double", price_per_night: 800000, status: "occupied", capacity: 2 },
      { id: 2, room_number: "102", room_type: "Standard Single", price_per_night: 500000, status: "available", capacity: 2 },
      { id: 3, room_number: "103", room_type: "Standard Single", price_per_night: 500000, status: "available", capacity: 2 },
      { id: 4, room_number: "201", room_type: "Deluxe Double", price_per_night: 800000, status: "available", capacity: 3 },
      { id: 5, room_number: "202", room_type: "Standard Single", price_per_night: 500000, status: "dirty", capacity: 2 },
      { id: 6, room_number: "203", room_type: "Family Suite", price_per_night: 1200000, status: "available", capacity: 4 },
      { id: 7, room_number: "301", room_type: "Deluxe Double", price_per_night: 800000, status: "maintenance", capacity: 3 },
      { id: 8, room_number: "302", room_type: "Suite", price_per_night: 1500000, status: "available", capacity: 4 },
      { id: 9, room_number: "303", room_type: "Suite", price_per_night: 1500000, status: "occupied", capacity: 4 },
      { id: 10, room_number: "401", room_type: "Family Suite", price_per_night: 1200000, status: "available", capacity: 4 }
    ],

    _defaultBookings: [
      {
        id: 1,
        booking_code: "BK-20261104-001",
        room_id: 1,
        guest_name: "Nguyen Van A",
        guest_phone: "0901234567",
        check_in_date: "2026-11-08",
        check_out_date: "2026-11-12",
        total_room_amount: 3200000,
        deposit_amount: 960000,
        status: "checked_in",
        room: { id: 1, room_number: "101", room_type: "Deluxe Double", price_per_night: 800000 }
      },
      {
        id: 2,
        booking_code: "BK-20261105-002",
        room_id: 8,
        guest_name: "Tran Hoang Nam",
        guest_phone: "0902345678",
        check_in_date: "2026-11-15",
        check_out_date: "2026-11-18",
        total_room_amount: 4500000,
        deposit_amount: 1500000,
        status: "confirmed",
        room: { id: 8, room_number: "302", room_type: "Suite", price_per_night: 1500000 }
      },
      {
        id: 3,
        booking_code: "BK-20261106-003",
        room_id: 2,
        guest_name: "Le Thu Ha",
        guest_phone: "0903456789",
        check_in_date: "2026-11-11",
        check_out_date: "2026-11-13",
        total_room_amount: 1000000,
        deposit_amount: 500000,
        status: "confirmed",
        room: { id: 2, room_number: "102", room_type: "Standard Single", price_per_night: 500000 }
      },
      {
        id: 4,
        booking_code: "BK-20261101-004",
        room_id: 5,
        guest_name: "Pham Quoc Bao",
        guest_phone: "0904567890",
        check_in_date: "2026-11-05",
        check_out_date: "2026-11-07",
        total_room_amount: 1000000,
        deposit_amount: 500000,
        status: "checked_out",
        room: { id: 5, room_number: "202", room_type: "Standard Single", price_per_night: 500000 }
      },
      {
        id: 5,
        booking_code: "BK-20261102-005",
        room_id: 4,
        guest_name: "Dang Gia Huy",
        guest_phone: "0905678901",
        check_in_date: "2026-11-20",
        check_out_date: "2026-11-23",
        total_room_amount: 2400000,
        deposit_amount: 800000,
        status: "cancelled",
        refund_amount: 800000,
        refund_rate: "100%",
        room: { id: 4, room_number: "201", room_type: "Deluxe Double", price_per_night: 800000 }
      }
    ],

    _defaultServices: [
      { id: 1, name: "Phở Bò Đặc Biệt", category: "food", price: 75000, unit: "tô", description: "Phở bò tái nạm gầu nóng hổi phục vụ tận phòng", is_available: true },
      { id: 2, name: "Cơm Gà Hải Nam", category: "food", price: 85000, unit: "phần", description: "Cơm gà luộc kèm canh rong biển", is_available: true },
      { id: 3, name: "Coca Cola (Lon)", category: "minibar", price: 25000, unit: "lon", description: "Nước ngọt có gas ướp lạnh", is_available: true },
      { id: 4, name: "Nước Suối Lavie 500ml", category: "minibar", price: 15000, unit: "chai", description: "Nước khoáng thiên nhiên đóng chai", is_available: true },
      { id: 5, name: "Giặt Sấy Lấy Liền", category: "laundry", price: 60000, unit: "kg", description: "Giặt sấy ủi giao trong vòng 4 tiếng", is_available: true },
      { id: 6, name: "Massage Body Tinh Dầu 60p", category: "spa", price: 350000, unit: "vé", description: "Dịch vụ spa thư giãn tại phòng", is_available: true }
    ],

    _defaultOrders: [
      {
        id: 1,
        order_code: "ORD-20261110-001",
        booking_id: 1,
        room_id: 1,
        total_amount: 150000,
        status: "pending",
        charge_to_room: true,
        is_paid: false,
        created_at: new Date().toISOString(),
        items: [
          { service_id: 1, service_name: "Phở Bò Đặc Biệt", quantity: 2, unit_price: 75000, subtotal: 150000 }
        ],
        booking: { booking_code: "BK-20261104-001", guest_name: "Nguyen Van A" },
        room: { room_number: "101" }
      },
      {
        id: 2,
        order_code: "ORD-20261110-002",
        booking_id: 1,
        room_id: 1,
        total_amount: 120000,
        status: "delivered",
        charge_to_room: true,
        is_paid: false,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        items: [
          { service_id: 5, service_name: "Giặt Sấy Lấy Liền", quantity: 2, unit_price: 60000, subtotal: 120000 }
        ],
        booking: { booking_code: "BK-20261104-001", guest_name: "Nguyen Van A" },
        room: { room_number: "101" }
      }
    ],

    _defaultInvoices: [
      {
        id: 1,
        invoice_code: "INV-20261104-001",
        booking_id: 4,
        booking_code: "BK-20261101-004",
        guest_name: "Pham Quoc Bao",
        room_charges: 1000000,
        service_charges: 150000,
        late_checkout_fee: 0,
        deposit_deducted: 500000,
        total_amount: 650000,
        status: "paid",
        issued_at: "2026-11-07T12:05:00Z",
        paid_at: "2026-11-07T12:10:00Z"
      }
    ],

    init: function () {
      if (!localStorage.getItem(STORAGE_KEYS.MOCK_ROOMS)) {
        localStorage.setItem(STORAGE_KEYS.MOCK_ROOMS, JSON.stringify(this._defaultRooms));
      }
      if (!localStorage.getItem(STORAGE_KEYS.MOCK_BOOKINGS)) {
        localStorage.setItem(STORAGE_KEYS.MOCK_BOOKINGS, JSON.stringify(this._defaultBookings));
      }
      if (!localStorage.getItem(STORAGE_KEYS.MOCK_SERVICES)) {
        localStorage.setItem(STORAGE_KEYS.MOCK_SERVICES, JSON.stringify(this._defaultServices));
      }
      if (!localStorage.getItem(STORAGE_KEYS.MOCK_ORDERS)) {
        localStorage.setItem(STORAGE_KEYS.MOCK_ORDERS, JSON.stringify(this._defaultOrders));
      }
      if (!localStorage.getItem(STORAGE_KEYS.MOCK_INVOICES)) {
        localStorage.setItem(STORAGE_KEYS.MOCK_INVOICES, JSON.stringify(this._defaultInvoices));
      }
    },

    getRooms: function () {
      this.init();
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.MOCK_ROOMS) || '[]');
    },

    saveRooms: function (rooms) {
      localStorage.setItem(STORAGE_KEYS.MOCK_ROOMS, JSON.stringify(rooms));
    },

    getBookings: function () {
      this.init();
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.MOCK_BOOKINGS) || '[]');
    },

    saveBookings: function (bookings) {
      localStorage.setItem(STORAGE_KEYS.MOCK_BOOKINGS, JSON.stringify(bookings));
    },

    getBookingById: function (id) {
      var list = this.getBookings();
      return list.find(function (b) {
        return String(b.id) === String(id) || b.booking_code === String(id);
      }) || null;
    },

    createBooking: function (bookingData) {
      var list = this.getBookings();
      var rooms = this.getRooms();
      var room = rooms.find(function (r) {
        return String(r.id) === String(bookingData.room_id);
      }) || null;

      var newId = list.length > 0 ? Math.max.apply(null, list.map(function (b) { return Number(b.id) || 0; })) + 1 : 1;
      var code = 'BK-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(newId).padStart(3, '0');

      var newBooking = {
        id: newId,
        booking_code: code,
        room_id: Number(bookingData.room_id),
        guest_name: bookingData.guest_name,
        guest_phone: bookingData.guest_phone,
        check_in_date: bookingData.check_in_date,
        check_out_date: bookingData.check_out_date,
        total_room_amount: bookingData.total_room_amount || 0,
        deposit_amount: bookingData.deposit_amount || 0,
        status: bookingData.status || 'confirmed',
        created_at: new Date().toISOString(),
        room: room
      };

      list.unshift(newBooking);
      this.saveBookings(list);
      return newBooking;
    },

    cancelBooking: function (id, cancelData) {
      var list = this.getBookings();
      var index = list.findIndex(function (b) { return String(b.id) === String(id); });
      if (index === -1) return null;

      list[index].status = 'cancelled';
      list[index].refund_rate = cancelData.refund_rate;
      list[index].refund_amount = cancelData.refund_amount;
      list[index].cancelled_at = new Date().toISOString();

      this.saveBookings(list);
      return list[index];
    },

    checkInBooking: function (id) {
      var list = this.getBookings();
      var rooms = this.getRooms();
      var index = list.findIndex(function (b) { return String(b.id) === String(id); });
      if (index === -1) return null;

      list[index].status = 'checked_in';
      list[index].actual_checkin_at = new Date().toISOString();

      var roomId = list[index].room_id;
      var roomIndex = rooms.findIndex(function (r) { return r.id === roomId; });
      if (roomIndex !== -1) {
        rooms[roomIndex].status = 'occupied';
        this.saveRooms(rooms);
      }

      this.saveBookings(list);
      return list[index];
    },

    checkOutBooking: function (id) {
      var list = this.getBookings();
      var rooms = this.getRooms();
      var index = list.findIndex(function (b) { return String(b.id) === String(id); });
      if (index === -1) return null;

      list[index].status = 'checked_out';
      list[index].actual_checkout_at = new Date().toISOString();

      var roomId = list[index].room_id;
      var roomIndex = rooms.findIndex(function (r) { return r.id === roomId; });
      if (roomIndex !== -1) {
        rooms[roomIndex].status = 'dirty'; // Sau khi checkout phòng chuyển sang bẩn
        this.saveRooms(rooms);
      }

      this.saveBookings(list);
      return list[index];
    },

    getServices: function () {
      this.init();
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.MOCK_SERVICES) || '[]');
    },

    getOrders: function () {
      this.init();
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.MOCK_ORDERS) || '[]');
    },

    saveOrders: function (orders) {
      localStorage.setItem(STORAGE_KEYS.MOCK_ORDERS, JSON.stringify(orders));
    },

    updateOrderStatus: function (id, status) {
      var orders = this.getOrders();
      var index = orders.findIndex(function (o) { return String(o.id) === String(id); });
      if (index === -1) return null;
      orders[index].status = status;
      this.saveOrders(orders);
      return orders[index];
    },

    getInvoices: function () {
      this.init();
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.MOCK_INVOICES) || '[]');
    },

    saveInvoices: function (invoices) {
      localStorage.setItem(STORAGE_KEYS.MOCK_INVOICES, JSON.stringify(invoices));
    },

    createInvoice: function (invoiceData) {
      var invoices = this.getInvoices();
      var newId = invoices.length > 0 ? Math.max.apply(null, invoices.map(function (inv) { return Number(inv.id) || 0; })) + 1 : 1;
      var code = 'INV-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(newId).padStart(3, '0');

      var newInv = {
        id: newId,
        invoice_code: code,
        booking_id: invoiceData.booking_id,
        booking_code: invoiceData.booking_code,
        guest_name: invoiceData.guest_name,
        room_charges: invoiceData.room_charges || 0,
        service_charges: invoiceData.service_charges || 0,
        late_checkout_fee: invoiceData.late_checkout_fee || 0,
        deposit_deducted: invoiceData.deposit_deducted || 0,
        total_amount: invoiceData.total_amount || 0,
        status: invoiceData.status || 'unpaid',
        issued_at: new Date().toISOString(),
        paid_at: null
      };

      invoices.unshift(newInv);
      this.saveInvoices(invoices);
      return newInv;
    },

    payInvoice: function (id, paymentMethod) {
      var invoices = this.getInvoices();
      var index = invoices.findIndex(function (inv) { return String(inv.id) === String(id); });
      if (index === -1) return null;
      invoices[index].status = 'paid';
      invoices[index].payment_method = paymentMethod;
      invoices[index].paid_at = new Date().toISOString();
      this.saveInvoices(invoices);
      return invoices[index];
    }
  };

  /**
   * ==========================================
   * 3. HTTP CLIENT GỌI API BACKEND THẬT
   * ==========================================
   */
  async function requestAPI(endpoint, options) {
    options = options || {};
    var url = endpoint.indexOf('http') === 0 ? endpoint : DEFAULT_API_BASE + endpoint;
    var defaultHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    var config = Object.assign({}, options, {
      headers: Object.assign({}, defaultHeaders, options.headers || {})
    });

    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 7000);
    config.signal = controller.signal;

    try {
      var response = await fetch(url, config);
      clearTimeout(timeoutId);

      var contentType = response.headers.get('content-type') || '';
      var data = null;
      if (contentType.indexOf('application/json') !== -1) {
        data = await response.json();
      } else {
        var text = await response.text();
        throw new Error('Phản hồi máy chủ không phải JSON (HTTP ' + response.status + '): ' + text.substring(0, 100));
      }

      if (!response.ok) {
        var errorMsg = data && data.message ? data.message : ('Lỗi HTTP ' + response.status);
        var err = new Error(errorMsg);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        var timeoutErr = new Error('Yêu cầu máy chủ vượt quá thời gian chờ (Timeout 7s).');
        timeoutErr.status = 408;
        throw timeoutErr;
      }
      throw error;
    }
  }

  /**
   * ==========================================
   * 4. BUSINESS LOGIC BR-06 (CANCELLATION)
   * Kế thừa đúng Báo cáo Cuối kỳ Chương 3 & 10
   * ==========================================
   */
  function calculateBR06Refund(booking) {
    if (!booking || !booking.check_in_date) {
      return { hoursRemaining: 0, refundRate: 0, refundPercentText: '0%', refundAmount: 0, ruleCode: 'INVALID' };
    }

    var checkInDateTime = new Date(booking.check_in_date + 'T14:00:00');
    var now = new Date();
    var diffMs = checkInDateTime.getTime() - now.getTime();
    var diffHours = diffMs / (1000 * 60 * 60);

    var refundRate = 0.0;
    var ruleCode = 'UT-CAN-03';
    var ruleDescription = 'Hủy dưới 24h hoặc No-show: Không hoàn tiền';

    if (diffHours >= 48) {
      refundRate = 1.0;
      ruleCode = 'UT-CAN-01';
      ruleDescription = 'Hủy trước hoặc đúng 48 giờ: Hoàn 100% tiền cọc';
    } else if (diffHours >= 24) {
      refundRate = 0.5;
      ruleCode = 'UT-CAN-02';
      ruleDescription = 'Hủy từ 24h đến dưới 48 giờ: Hoàn 50% tiền cọc';
    } else {
      refundRate = 0.0;
      ruleCode = 'UT-CAN-03';
      ruleDescription = 'Hủy dưới 24h hoặc No-show: Không hoàn tiền';
    }

    var deposit = Number(booking.deposit_amount) || 0;
    var refundAmount = Math.round(deposit * refundRate);

    return {
      hoursRemaining: Math.round(diffHours * 10) / 10,
      refundRate: refundRate,
      refundPercentText: Math.round(refundRate * 100) + '%',
      depositAmount: deposit,
      refundAmount: refundAmount,
      ruleCode: ruleCode,
      ruleDescription: ruleDescription
    };
  }

  /**
   * ==========================================
   * 5. TÍNH TIỀN PHÒNG VÀ TIỀN CỌC (BR-04, BR-05)
   * ==========================================
   */
  function calculateStayCost(room, checkInDateStr, checkOutDateStr) {
    if (!room || !checkInDateStr || !checkOutDateStr) {
      return { nights: 0, totalAmount: 0, depositAmount: 0 };
    }

    var checkIn = new Date(checkInDateStr + 'T00:00:00');
    var checkOut = new Date(checkOutDateStr + 'T00:00:00');
    var nights = Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    if (nights <= 0) {
      return { nights: 0, totalAmount: 0, depositAmount: 0 };
    }

    var basePrice = Number(room.price_per_night) || 0;
    var totalRoomAmount = 0;
    var cur = new Date(checkIn);

    for (var i = 0; i < nights; i++) {
      var day = cur.getDay(); // 5 = Thứ sáu, 6 = Thứ bảy
      var isWeekend = (day === 5 || day === 6);
      var nightRate = isWeekend ? (basePrice * 1.15) : basePrice;
      totalRoomAmount += nightRate;
      cur.setDate(cur.getDate() + 1);
    }

    var depositAmount = 0;
    if (nights >= 2) {
      depositAmount = Math.max(totalRoomAmount * 0.3, basePrice);
    }

    return {
      nights: nights,
      basePrice: basePrice,
      totalAmount: Math.round(totalRoomAmount),
      depositAmount: Math.round(depositAmount)
    };
  }

  /**
   * ==========================================
   * 6. STAFF API FACADE
   * Cung cấp hàm đồng nhất cho giao diện
   * ==========================================
   */
  return {
    isMockMode: function () {
      return MockModeManager.isMockMode();
    },

    setMockMode: function (enabled) {
      MockModeManager.setMockMode(enabled);
    },

    toggleMockMode: function () {
      return MockModeManager.toggleMockMode();
    },

    getModeInfo: function () {
      var isMock = MockModeManager.isMockMode();
      return {
        isMock: isMock,
        badgeText: isMock ? "DỮ LIỆU MÔ PHỎNG / CHỜ TÍCH HỢP API" : "KẾT NỐI API BACKEND",
        badgeClass: isMock ? "badge-mock" : "badge-api",
        description: isMock
          ? "Đang sử dụng dữ liệu mô phỏng trong LocalStorage. Dữ liệu này chỉ phục vụ kiểm thử giao diện."
          : "Đang kết nối trực tiếp máy chủ Backend tại " + DEFAULT_API_BASE + "."
      };
    },

    calculateBR06Refund: calculateBR06Refund,
    calculateStayCost: calculateStayCost,

    // ==========================================
    // MODULE: DASHBOARD SUMMARY
    // ==========================================
    getDashboardSummary: async function () {
      if (MockModeManager.isMockMode()) {
        var rooms = MockRepository.getRooms();
        var bookings = MockRepository.getBookings();

        var totalRooms = rooms.length;
        var availableRoomsCount = rooms.filter(function (r) { return r.status === 'available'; }).length;
        var occupiedRoomsCount = rooms.filter(function (r) { return r.status === 'occupied'; }).length;
        var maintenanceRoomsCount = rooms.filter(function (r) { return r.status === 'maintenance' || r.status === 'dirty'; }).length;
        var occupancyRate = totalRooms > 0 ? Math.round((occupiedRoomsCount / totalRooms) * 1000) / 10 : 0;

        var totalBookings = bookings.length;
        var pendingBookings = bookings.filter(function (b) { return b.status === 'pending'; }).length;
        var confirmedBookings = bookings.filter(function (b) { return b.status === 'confirmed'; }).length;
        var stayingGuests = bookings.filter(function (b) { return b.status === 'checked_in'; }).length;

        return {
          status: 'success',
          message: 'Lấy dữ liệu tổng quan Dashboard thành công (Mock Mode).',
          data: {
            total_rooms: totalRooms,
            available_rooms: availableRoomsCount,
            occupied_rooms: occupiedRoomsCount,
            maintenance_rooms: maintenanceRoomsCount,
            occupancy_rate: occupancyRate,
            total_bookings: totalBookings,
            pending_bookings: pendingBookings,
            confirmed_bookings: confirmedBookings,
            staying_guests: stayingGuests,
            recent_bookings: bookings.slice(0, 5)
          },
          isMock: true
        };
      }

      // API Thật: Đọc song song /rooms và /bookings nếu có
      try {
        var roomRes = await requestAPI('/rooms');
        var rList = Array.isArray(roomRes.data) ? roomRes.data : [];
        var totalR = rList.length;
        var availR = rList.filter(function (r) { return r.status === 'available'; }).length;
        var occR = rList.filter(function (r) { return r.status === 'occupied'; }).length;
        var maintR = rList.filter(function (r) { return r.status === 'maintenance' || r.status === 'dirty'; }).length;
        var occRate = totalR > 0 ? Math.round((occR / totalR) * 1000) / 10 : 0;

        return {
          status: 'success',
          message: 'Lấy dữ liệu tổng quan phòng từ Backend thành công.',
          data: {
            total_rooms: totalR,
            available_rooms: availR,
            occupied_rooms: occR,
            maintenance_rooms: maintR,
            occupancy_rate: occRate,
            total_bookings: 0,
            pending_bookings: 0,
            confirmed_bookings: 0,
            staying_guests: 0,
            recent_bookings: []
          },
          isMock: false
        };
      } catch (err) {
        throw err;
      }
    },

    // ==========================================
    // MODULE: ROOMS
    // ==========================================
    getRooms: async function (filters) {
      filters = filters || {};
      if (MockModeManager.isMockMode()) {
        var rooms = MockRepository.getRooms();
        if (filters.status) rooms = rooms.filter(function (r) { return r.status === filters.status; });
        if (filters.room_type) rooms = rooms.filter(function (r) { return r.room_type === filters.room_type; });
        return {
          status: 'success',
          message: 'Lấy danh sách phòng thành công (Mock Mode).',
          data: rooms,
          isMock: true
        };
      }

      var query = new URLSearchParams();
      if (filters.status) query.append('status', filters.status);
      if (filters.room_type) query.append('room_type', filters.room_type);
      var qs = query.toString() ? ('?' + query.toString()) : '';

      var res = await requestAPI('/rooms' + qs);
      return Object.assign({}, res, { isMock: false });
    },

    updateRoomStatus: async function (roomId, newStatus) {
      if (MockModeManager.isMockMode()) {
        var rooms = MockRepository.getRooms();
        var idx = rooms.findIndex(function (r) { return String(r.id) === String(roomId); });
        if (idx === -1) throw new Error('Không tìm thấy phòng.');
        rooms[idx].status = newStatus;
        MockRepository.saveRooms(rooms);
        return {
          status: 'success',
          message: 'Cập nhật trạng thái phòng thành công (Mock Mode).',
          data: rooms[idx],
          isMock: true
        };
      }

      // API thật (nếu có endpoint PATCH /api/rooms/{id}/status)
      var apiRes = await requestAPI('/rooms/' + roomId + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      return Object.assign({}, apiRes, { isMock: false });
    },

    // ==========================================
    // MODULE: BOOKINGS
    // ==========================================
    getBookings: async function (filters) {
      filters = filters || {};
      if (MockModeManager.isMockMode()) {
        var list = MockRepository.getBookings();
        if (filters.search) {
          var kw = filters.search.trim().toLowerCase();
          list = list.filter(function (b) {
            var str = (String(b.booking_code || '') + ' ' + String(b.guest_name || '') + ' ' +
              String(b.guest_phone || '') + ' ' + (b.room ? b.room.room_number : '')).toLowerCase();
            return str.indexOf(kw) !== -1;
          });
        }
        if (filters.status && filters.status !== 'all') {
          list = list.filter(function (b) { return b.status === filters.status; });
        }
        if (filters.check_in_date) {
          list = list.filter(function (b) { return b.check_in_date >= filters.check_in_date; });
        }
        return {
          status: 'success',
          message: 'Lấy danh sách đặt phòng thành công (Mock Mode).',
          data: list,
          isMock: true
        };
      }

      var query = new URLSearchParams();
      if (filters.search) query.append('search', filters.search);
      if (filters.status && filters.status !== 'all') query.append('status', filters.status);
      if (filters.check_in_date) query.append('check_in_date', filters.check_in_date);
      var qs = query.toString() ? ('?' + query.toString()) : '';

      var res = await requestAPI('/bookings' + qs);
      return Object.assign({}, res, { isMock: false });
    },

    getBookingById: async function (id) {
      if (MockModeManager.isMockMode()) {
        var booking = MockRepository.getBookingById(id);
        if (!booking) {
          var err = new Error('Không tìm thấy đơn đặt phòng (Mock Mode).');
          err.status = 404;
          throw err;
        }
        return {
          status: 'success',
          message: 'Chi tiết đơn đặt phòng (Mock Mode).',
          data: booking,
          isMock: true
        };
      }

      var res = await requestAPI('/bookings/' + id);
      return Object.assign({}, res, { isMock: false });
    },

    createBooking: async function (bookingPayload) {
      if (MockModeManager.isMockMode()) {
        var created = MockRepository.createBooking(bookingPayload);
        return {
          status: 'success',
          message: 'Đặt phòng thành công (Mock Mode).',
          data: created,
          isMock: true
        };
      }

      var res = await requestAPI('/bookings', {
        method: 'POST',
        body: JSON.stringify(bookingPayload)
      });
      return Object.assign({}, res, { isMock: false });
    },

    cancelBooking: async function (id, calculatedRefund) {
      if (MockModeManager.isMockMode()) {
        var cancelled = MockRepository.cancelBooking(id, calculatedRefund);
        if (!cancelled) {
          var err = new Error('Không tìm thấy đơn đặt phòng để hủy.');
          err.status = 404;
          throw err;
        }
        return {
          status: 'success',
          message: 'Hủy đặt phòng thành công (Mock Mode). Áp dụng ' + calculatedRefund.ruleCode + ' (' + calculatedRefund.refundPercentText + ').',
          data: {
            booking: cancelled,
            refund_info: calculatedRefund
          },
          isMock: true
        };
      }

      var res = await requestAPI('/bookings/' + id + '/cancel', {
        method: 'POST'
      });
      return Object.assign({}, res, { isMock: false });
    },

    // ==========================================
    // MODULE: CHECK-IN / CHECK-OUT
    // ==========================================
    checkInBooking: async function (id) {
      if (MockModeManager.isMockMode()) {
        var checkedIn = MockRepository.checkInBooking(id);
        if (!checkedIn) throw new Error('Không tìm thấy đơn để Check-in.');
        return {
          status: 'success',
          message: 'Check-in thành công. Trạng thái phòng chuyển sang Occupied (Mock Mode).',
          data: checkedIn,
          isMock: true
        };
      }

      // API thật
      var res = await requestAPI('/bookings/' + id + '/check-in', {
        method: 'POST'
      });
      return Object.assign({}, res, { isMock: false });
    },

    checkOutBooking: async function (id) {
      if (MockModeManager.isMockMode()) {
        var checkedOut = MockRepository.checkOutBooking(id);
        if (!checkedOut) throw new Error('Không tìm thấy đơn để Check-out.');
        return {
          status: 'success',
          message: 'Check-out hoàn tất. Trạng thái phòng chuyển sang Dirty cần dọn dẹp (Mock Mode).',
          data: checkedOut,
          isMock: true
        };
      }

      // API thật
      var res = await requestAPI('/bookings/' + id + '/check-out', {
        method: 'POST'
      });
      return Object.assign({}, res, { isMock: false });
    },

    // ==========================================
    // MODULE: ROOM SERVICE QUEUE
    // ==========================================
    getServices: async function () {
      if (MockModeManager.isMockMode()) {
        return {
          status: 'success',
          message: 'Lấy danh mục dịch vụ thành công (Mock Mode).',
          data: MockRepository.getServices(),
          isMock: true
        };
      }
      var res = await requestAPI('/services');
      return Object.assign({}, res, { isMock: false });
    },

    getServiceOrders: async function (filters) {
      filters = filters || {};
      if (MockModeManager.isMockMode()) {
        var orders = MockRepository.getOrders();
        if (filters.status && filters.status !== 'all') {
          orders = orders.filter(function (o) { return o.status === filters.status; });
        }
        return {
          status: 'success',
          message: 'Lấy danh sách đơn dịch vụ phòng thành công (Mock Mode).',
          data: orders,
          isMock: true
        };
      }
      var res = await requestAPI('/service-orders');
      return Object.assign({}, res, { isMock: false });
    },

    updateServiceOrderStatus: async function (orderId, newStatus) {
      if (MockModeManager.isMockMode()) {
        var updated = MockRepository.updateOrderStatus(orderId, newStatus);
        if (!updated) throw new Error('Không tìm thấy đơn dịch vụ.');
        return {
          status: 'success',
          message: 'Cập nhật trạng thái đơn dịch vụ thành công (Mock Mode).',
          data: updated,
          isMock: true
        };
      }

      var res = await requestAPI('/service-orders/' + orderId + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      return Object.assign({}, res, { isMock: false });
    },

    // ==========================================
    // MODULE: BILLING & INVOICES
    // ==========================================
    getInvoices: async function () {
      if (MockModeManager.isMockMode()) {
        return {
          status: 'success',
          message: 'Lấy danh sách hóa đơn thành công (Mock Mode).',
          data: MockRepository.getInvoices(),
          isMock: true
        };
      }

      // API thật
      var res = await requestAPI('/invoices');
      return Object.assign({}, res, { isMock: false });
    },

    getInvoicePreview: async function (bookingId) {
      if (MockModeManager.isMockMode()) {
        var b = MockRepository.getBookingById(bookingId);
        if (!b) throw new Error('Không tìm thấy đơn đặt phòng để tạo hóa đơn.');
        var roomCharges = Number(b.total_room_amount) || 0;
        var deposit = Number(b.deposit_amount) || 0;
        var orders = MockRepository.getOrders().filter(function (o) { return o.booking_id === b.id && o.charge_to_room; });
        var serviceCharges = orders.reduce(function (sum, o) { return sum + (Number(o.total_amount) || 0); }, 0);
        var totalPayable = Math.max(0, roomCharges + serviceCharges - deposit);

        return {
          status: 'success',
          message: 'Xem trước hóa đơn thành công (Mock Mode).',
          data: {
            booking_id: b.id,
            booking_code: b.booking_code,
            guest_name: b.guest_name,
            room_charges: roomCharges,
            service_charges: serviceCharges,
            late_checkout_fee: 0,
            deposit_deducted: deposit,
            total_amount: totalPayable
          },
          isMock: true
        };
      }

      var res = await requestAPI('/bookings/' + bookingId + '/invoice/preview');
      return Object.assign({}, res, { isMock: false });
    },

    payInvoice: async function (invoiceId, paymentMethod) {
      if (MockModeManager.isMockMode()) {
        var paid = MockRepository.payInvoice(invoiceId, paymentMethod);
        if (!paid) throw new Error('Không tìm thấy hóa đơn.');
        return {
          status: 'success',
          message: 'Thanh toán hóa đơn thành công (Mock Mode).',
          data: paid,
          isMock: true
        };
      }

      var res = await requestAPI('/invoices/' + invoiceId + '/pay', {
        method: 'POST',
        body: JSON.stringify({ payment_method: paymentMethod })
      });
      return Object.assign({}, res, { isMock: false });
    },

    closeInvoice: async function (invoiceId) {
      if (MockModeManager.isMockMode()) {
        return {
          status: 'success',
          message: 'Đã đóng hóa đơn và hoàn tất thanh toán (Mock Mode).',
          data: { id: invoiceId, status: 'closed' },
          isMock: true
        };
      }

      var res = await requestAPI('/invoices/' + invoiceId + '/close', {
        method: 'POST'
      });
      return Object.assign({}, res, { isMock: false });
    }
  };
});
