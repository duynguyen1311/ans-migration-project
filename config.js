require('dotenv').config();

// Export all configuration values from environment variables
module.exports = {
  // KiotViet API credentials
  clientId: process.env.KIOTVIET_CLIENT_ID,
  clientSecret: process.env.KIOTVIET_CLIENT_SECRET,
  retailer: process.env.KIOTVIET_RETAILER,

  // Google Sheets Configuration
  spreadsheet: {
    id: process.env.SPREADSHEET_ID,
    sheetName: process.env.SHEET_NAME,
    headers: ['Hoá đơn', 'Ngày nhận', 'Ngày trả', 'Tên đồ dùng', 'Công việc', 'Trạng thái', 'Thời gian', 'Người làm', 'Trạng thái thanh toán', 'Ghi chú']
  },

  // Telegram Bot Configuration
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  },

  // Status dropdown values
  statusValues: ["Chưa làm", "Đang làm", "Phát sinh", "Hoàn thành", "Đóng đơn"],

  // People dropdown values with associated colors
  peopleValues: ['Chọn người làm', 'Minh', 'Huy', 'Vườn Đào', 'Hà Nội', 'Nam Định'],

  peopleColors: {
    "Chọn người làm": [230, 230, 230], // Grey
    "Minh": [100, 181, 246],  // Light blue
    "Huy": [255, 138, 128],    // Light red/pink
    "Vườn Đào": [124, 179, 66],  // Light green
    "Hà Nội": [255, 183, 77],    // Light orange/amber
    "Nam Định": [186, 104, 200]   // Light purple
  },

  // Status colors (RGB values)
  statusColors: {
    "Chưa làm": [230, 230, 230],     // Grey
    "Đang làm": [66, 133, 244],      // Blue
    "Phát sinh": [234, 67, 53],      // Red
    "Hoàn thành": [251, 188, 4],     // Yellow
    "Đóng đơn": [52, 168, 83]        // Green
  }
};