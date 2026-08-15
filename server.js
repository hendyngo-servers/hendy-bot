const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = TelegramBotModule.default || TelegramBotModule;
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ==========================================
// ⚙️ CẤU HÌNH MẶC ĐỊNH & HỆ THỐNG
// ==========================================
const WS_PORT = process.env.PORT || 8080;
let currentToken = process.env.BOT_TOKEN || '8689114890:AAFBFM0rNtZWpOtAovIPHPVQTJVp0odU1DQ'; 
let currentAdminId = ''; 
let currentChannel = 'KENH-1'; 
let bot = null;

// Cấu hình ID của Admin
const ADMIN_ID = '6138197737'; 

// Cấu hình Database
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};
const userStates = {};
const userCooldowns = {}; 
let masterWebSocket = null;

// Khung cấu trúc tài khoản mặc định (Bổ sung QQ88 và 78WIN)
const DEFAULT_LINKED_ACCOUNTS = { 
    SC88: [], 
    C168: [], 
    CM88: [], 
    F8BET: [], 
    QQ88: [], 
    '78WIN': [] 
};

// ==========================================
// 🗄️ HÀM LƯU & ĐỌC DATABASE (CÓ TỰ ĐỘNG BACKUP)
// ==========================================
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
            // Đảm bảo user cũ cũng có đủ các brand mới
            Object.keys(users).forEach(uid => {
                if (!users[uid].linkedAccounts) {
                    users[uid].linkedAccounts = JSON.parse(JSON.stringify(DEFAULT_LINKED_ACCOUNTS));
                } else {
                    Object.keys(DEFAULT_LINKED_ACCOUNTS).forEach(brand => {
                        if (!users[uid].linkedAccounts[brand]) {
                            users[uid].linkedAccounts[brand] = [];
                        }
                    });
                }
            });
            console.log(`✅ Đã tải dữ liệu của ${Object.keys(users).length} khách hàng từ database.json`);
        } else {
            console.log('⚠️ Không tìm thấy database.json, sẽ tạo mới file khi có dữ liệu.');
            users = {};
        }
    } catch (err) {
        console.error('❌ Lỗi khi đọc file database.json:', err);
        users = {}; 
    }
}

function saveDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const backupPath = path.join(__dirname, 'database_backup.json');
            fs.copyFileSync(DB_FILE, backupPath);
        }
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4), 'utf8');
    } catch (err) {
        console.error('❌ Lỗi khi lưu file database.json:', err);
    }
}

// ==========================================
// 1. HÀM GỬI LOG VỀ GIAO DIỆN TRẠM MẸ (WEB)
// ==========================================
function sendLogToWeb(msg) {
    if (masterWebSocket && masterWebSocket.readyState === WebSocket.OPEN) {
        masterWebSocket.send(JSON.stringify({
            action: 'RES_TELEGRAM_LOG',
            message: msg,
            channel: currentChannel
        }));
    }
    console.log(`[BOT LOG] ${msg}`);
}

// ==========================================
// 2. HÀM KHỞI ĐỘNG VÀ CÀI ĐẶT LOGIC BOT
// ==========================================
function startBot(token) {
    if (bot) {
        try { bot.stopPolling(); } catch (e) {}
        bot = null;
    }
    
    try {
        bot = new TelegramBot(token, { polling: true });
        setupBotLogic();
        console.log('🤖 Bot Telegram đã khởi động thành công!');
        
        if (masterWebSocket && masterWebSocket.readyState === WebSocket.OPEN) {
            masterWebSocket.send(JSON.stringify({ action: 'RES_TELEGRAM_STATUS', status: 'RUNNING', channel: currentChannel }));
        }
        return true;
    } catch (e) {
        console.error("❌ Lỗi khởi động bot:", e);
        return false;
    }
}

function setupBotLogic() {
    if (!bot) return;

    // LỆNH /START
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const user = msg.from;

        sendLogToWeb(`👤 Khách [${user.first_name}] (ID: ${chatId}) vừa mở Bot.`);

        if (!users[chatId]) {
            users[chatId] = {
                name: user.first_name || 'Khách',
                balance: 1501, voucher: 0, wonCodes: [], 
                linkedAccounts: JSON.parse(JSON.stringify(DEFAULT_LINKED_ACCOUNTS))
            };
            saveDatabase();
        } else {
            users[chatId].name = user.first_name || users[chatId].name;
            // Đảm bảo đủ các trường liên kết mới
            Object.keys(DEFAULT_LINKED_ACCOUNTS).forEach(brand => {
                if (!users[chatId].linkedAccounts[brand]) {
                    users[chatId].linkedAccounts[brand] = [];
                }
            });
            saveDatabase();
        }

        const u = users[chatId];
        const welcomeMessage = `
🤖 *BOT HENDY CYBERTECH 2026* [BOT CHÍNH] 🚀
Buổi chiều vui vẻ nhé, *${u.name}* (ID: \`${chatId}\`)
--------------------------------------------------
💎 *VIP 0*

💰 **Ví Chính:** \`${u.balance.toLocaleString()} VNĐ\`
🎁 **Ví Voucher:** \`${u.voucher.toLocaleString()} VNĐ\`
--------------------------------------------------
👉 Trang Chủ Website: https://hendy-cybertech.com
        `;

        bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎟️ TRUNG TÂM MUA CODE', callback_data: 'buy_code' }],
                    [{ text: '💳 NẠP TIỀN', callback_data: 'deposit' }],
                    [{ text: '📇 TRUNG TÂM KHÁCH HÀNG', callback_data: 'customer_center' }],
                    [{ text: '👥 NHÓM GIAO LƯU', url: 'https://t.me/Hendy_Support_Group' }]
                ]
            }
        });
    });

    // ==========================================
    // 🛡️ HỆ THỐNG LỆNH ADMIN TỐI ƯU GỌN GÀNG
    // ==========================================
    bot.onText(/\/admin/, (msg) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_ID) {
            bot.sendMessage(chatId, '⛔ Sếp không có quyền sử dụng bảng điều khiển này!');
            return;
        }

        const adminMenuText = `
🛠️ *BẢNG QUẢN TRỊ HỆ THỐNG (ADMIN PANEL)*
--------------------------------------------------
• \`/status\` - Kiểm tra trạng thái hệ thống
• \`/user [ID]\` - Xem thông tin chi tiết khách hàng
• \`/addmoney [ID] [Số tiền]\` - Cộng/trừ tiền ví chính
• \`/trungcode [ID] [Trang] [TàiKhoản] [MãCode]\` - Cấp code cho khách
• \`/broadcast [Nội dung]\` - Phát loa toàn hệ thống
        `;

        bot.sendMessage(chatId, adminMenuText, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_ID) return;

        const totalUsers = Object.keys(users).length;
        const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

        const statusText = `
⚙️ *TRẠNG THÁI HỆ THỐNG BOT*
--------------------------------------------------
👥 Tổng số khách hàng: \`${totalUsers}\`
🧠 RAM đang sử dụng: \`${memoryUsage.toFixed(2)} MB\`
⚡ Trạng thái WebSocket: \`${masterWebSocket && masterWebSocket.readyState === WebSocket.OPEN ? 'ĐÃ KẾT NỐI' : 'MẤT KẾT NỐI'}\`
🕒 Thời gian hoạt động: \`${(process.uptime() / 60).toFixed(1)} phút\`
        `;
        bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/broadcast (.+)/, (msg, match) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_ID) return;

        const broadcastMessage = match[1];
        let successCount = 0;

        Object.keys(users).forEach(uid => {
            bot.sendMessage(uid, `📢 *THÔNG BÁO TỪ HỆ THỐNG:*\n\n${broadcastMessage}`, { parse_mode: 'Markdown' })
               .catch(() => {});
            successCount++;
        });

        bot.sendMessage(chatId, `✅ Đã phát loa thành công tới \`${successCount}\` khách hàng!`);
    });

    bot.onText(/\/user (\d+)/, (msg, match) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_ID) return;

        const targetId = match[1];
        const uInfo = users[targetId];

        if (!uInfo) {
            bot.sendMessage(chatId, `❌ Không tìm thấy thông tin của user ID: \`${targetId}\``, { parse_mode: 'Markdown' });
            return;
        }

        let linkSummary = '';
        Object.keys(uInfo.linkedAccounts || {}).forEach(brand => {
            const accs = uInfo.linkedAccounts[brand];
            if (accs.length > 0) {
                linkSummary += `\n• *${brand}* (${accs.length}): `;
                accs.forEach(a => linkSummary += `\`${a.tk}\` `);
            }
        });

        const userInfoText = `
👤 *THÔNG TIN KHÁCH HÀNG*
--------------------------------------------------
🆔 ID: \`${targetId}\`
🏷️ Tên: \`${uInfo.name}\`
💰 Ví chính: \`${uInfo.balance.toLocaleString()} VNĐ\`
🎁 Voucher: \`${uInfo.voucher.toLocaleString()} VNĐ\`
🏆 Số code đã trúng: \`${(uInfo.wonCodes || []).length}\`
🔗 Tài khoản liên kết:${linkSummary || '\nChưa có liên kết nào'}
        `;
        bot.sendMessage(chatId, userInfoText, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/addmoney (\d+) (-?\d+)/, (msg, match) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_ID) return;

        const targetId = match[1];
        const amount = parseInt(match[2]);

        if (!users[targetId]) {
            bot.sendMessage(chatId, `❌ Không tìm thấy user ID: \`${targetId}\``, { parse_mode: 'Markdown' });
            return;
        }

        users[targetId].balance += amount;
        saveDatabase();

        bot.sendMessage(chatId, `✅ Đã cập nhật ví cho user \`${targetId}\`. Số dư mới: \`${users[targetId].balance.toLocaleString()} VNĐ\``, { parse_mode: 'Markdown' });
        
        bot.sendMessage(targetId, `💰 *BIẾN ĐỘNG SỐ DƯ*\n\nTài khoản của sếp vừa được điều chỉnh: \`${amount > 0 ? '+' : ''}${amount.toLocaleString()} VNĐ\`\n💎 Số dư hiện tại: \`${users[targetId].balance.toLocaleString()} VNĐ\``, { parse_mode: 'Markdown' })
            .catch(() => {});
    });

    // LỆNH TRÚNG CODE
    bot.onText(/\/trungcode (\d+) (\S+) (\S+) (\S+)/, (msg, match) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_ID) return;

        const targetId = match[1];
        const brand = match[2].toUpperCase();
        const accountTk = match[3];
        const wonCode = match[4];

        if (!users[targetId]) {
            bot.sendMessage(chatId, `❌ Không tìm thấy user ID: \`${targetId}\``, { parse_mode: 'Markdown' });
            return;
        }

        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();

        const formattedTime = `${hours}:${minutes}:${seconds} ngày ${day}/${month}/${year}`;

        if (!users[targetId].wonCodes) {
            users[targetId].wonCodes = [];
        }
        
        users[targetId].wonCodes.push({ 
            brand, 
            accountTk, 
            code: wonCode, 
            time: formattedTime 
        });
        saveDatabase();

        const congratText = `
🎉 *CHÚNG MỪNG SẾP ĐÃ TRÚNG CODE!* 🏆
--------------------------------------------------
🎯 **Trang Game:** \`${brand}\`
👤 **Tài Khoản:** \`${accountTk}\`
🎁 **Mã Code Nhận Thưởng:** \`🎉 ${wonCode} 🎉\`
🕒 **Thời Gian Trúng:** \`${formattedTime}\`
--------------------------------------------------
💡 *Mã code và thời gian đã được lưu vào hệ thống Trung Tâm Khách Hàng của sếp!*
        `;

        bot.sendMessage(targetId, congratText, { parse_mode: 'Markdown' })
            .then(() => {
                bot.sendMessage(chatId, `✅ Đã cấp code \`${wonCode}\` vào database lúc [${formattedTime}] cho khách \`${targetId}\` thành công!`);
            })
            .catch((err) => {
                bot.sendMessage(chatId, `⚠️ Đã lưu code vào database kèm thời gian nhưng không gửi được tin nhắn cho khách: ${err.message}`);
            });
    });

    // ==========================================
    // XỬ LÝ NÚT BẤM (CALLBACK QUERY)
    // ==========================================
    bot.on('callback_query', (query) => {
        const chatId = query.from.id;
        
        const now = Date.now();
        if (userCooldowns[chatId] && (now - userCooldowns[chatId] < 1500)) {
            bot.answerCallbackQuery(query.id, { text: '⚠️ Thao tác quá nhanh, từ từ thôi sếp ơi!' });
            return;
        }
        userCooldowns[chatId] = now;

        const user = query.from;
        const data = query.data;

        let u = users[chatId];
        if (!u) {
            u = { 
                name: user.first_name || 'Khách', 
                balance: 1501, voucher: 0, wonCodes: [], 
                linkedAccounts: JSON.parse(JSON.stringify(DEFAULT_LINKED_ACCOUNTS))
            };
            saveDatabase();
        } else {
            u.name = user.first_name || u.name;
            Object.keys(DEFAULT_LINKED_ACCOUNTS).forEach(brand => {
                if (!u.linkedAccounts[brand]) u.linkedAccounts[brand] = [];
            });
        }
        users[chatId] = u;
        
        sendLogToWeb(`🖱️ Khách [${u.name}] bấm nút: ${data}`);

        if (data === 'buy_code') {
            bot.sendMessage(chatId, `
🖤 *TRUNG TÂM MUA CODE*
💎 *TRẠNG THÁI ĐƠN HÀNG:*
- Đơn hàng MINI GAME: Chờ [0] | Hoàn tất [0]
- Đơn hàng CODE MÀN: Chờ [0] | Hoàn tất [0]
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎮 V2 LIÊN KẾT (SC88, C168, CM88, F8BET, QQ88, 78WIN)', callback_data: 'v2_links' }],
                        [{ text: '🕹️ Trang Live Riêng [Hi88, 78Win..]', callback_data: 'live_pages' }],
                        [{ text: '🔙 Quay lại', callback_data: 'back_start' }]
                    ]
                }
            });
        }
        else if (data === 'v2_links') {
            const cSC88 = u.linkedAccounts.SC88.length;
            const cC168 = u.linkedAccounts.C168.length;
            const cCM88 = u.linkedAccounts.CM88.length;
            const cF8BET = u.linkedAccounts.F8BET.length;
            const cQQ88 = u.linkedAccounts.QQ88.length;
            const c78WIN = u.linkedAccounts['78WIN'].length;

            bot.sendMessage(chatId, `
MINI GAME
🖤 Chào *${u.name}*
--------------------------------------------------
📊 *Thống Kê Liên Kết:*
• Liên Kết tại SC88: [${cSC88}]
• Liên Kết tại C168: [${cC168}]
• Liên Kết tại CM88: [${cCM88}]
• Liên Kết tại F8BET: [${cF8BET}]
• Liên Kết tại QQ88: [${cQQ88}]
• Liên Kết tại 78WIN: [${c78WIN}]
--------------------------------------------------
👉 Chọn trang game bên dưới để quản lý hoặc đặt đơn:
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `🎯 SC88 (${cSC88})`, callback_data: 'manage_SC88' },
                            { text: `🎯 C168 (${cC168})`, callback_data: 'manage_C168' }
                        ],
                        [
                            { text: `🎯 CM88 (${cCM88})`, callback_data: 'manage_CM88' },
                            { text: `🎯 F8BET (${cF8BET})`, callback_data: 'manage_F8BET' }
                        ],
                        [
                            { text: `🎯 QQ88 (${cQQ88})`, callback_data: 'manage_QQ88' },
                            { text: `🎯 78WIN (${c78WIN})`, callback_data: 'manage_78WIN' }
                        ],
                        [{ text: '📖 HƯỚNG DẪN - CHI TIẾT', callback_data: 'guide_detail' }],
                        [{ text: '🔙 Quay lại', callback_data: 'buy_code' }]
                    ]
                }
            });
        }
        else if (data === 'guide_detail') {
            bot.sendMessage(chatId, `
📖 *HƯỚNG DẪN SỬ DỤNG HỆ THỐNG HENDY CYBERTECH*
--------------------------------------------------
1️⃣ *Liên Kết Tài Khoản SLL:* 
   - Gửi theo cú pháp: \`Tài khoản | Mật khẩu | Brand\`
   - (Ví dụ: \`acc123 | 123456 | QQ88\`)
2️⃣ *Trung Tâm Khách Hàng:* 
   - Xem tổng quan số dư ví, số lượng tài khoản đã liên kết và lịch sử trúng code trực tuyến qua giao diện web.
--------------------------------------------------
💡 *Mọi thắc mắc vui lòng liên hệ @hendyngo hỗ trợ để được giải đáp!*
            `, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Quay lại', callback_data: 'v2_links' }]] }
            });
        }
        else if (data.startsWith('manage_')) {
            const brand = data.replace('manage_', '');
            const accounts = u.linkedAccounts[brand] || [];
            let keyboard = [];
            
            if (accounts.length === 0) {
                bot.sendMessage(chatId, `📂 *DANH SÁCH TÀI KHOẢN (${brand})*\n--------------------------------------------------\nChưa liên kết tài khoản nào.`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `➕ THÊM LIÊN KẾT | ACC ${brand}`, callback_data: `link_${brand}` }], [{ text: '🔙 Quay lại', callback_data: 'v2_links' }]] }
                });
            } else {
                let msgText = `📂 *DANH SÁCH TÀI KHOẢN (${brand})*\n--------------------------------------------------\n`;
                accounts.forEach((acc, index) => {
                    msgText += `${index + 1}. TK: \`${acc.tk}\` - Code: \`${acc.miniCode}\`\n`;
                    keyboard.push([{ text: `❌ Xóa ${acc.tk}`, callback_data: `del_${brand}_${index}` }]);
                });
                keyboard.push([{ text: `➕ THÊM LIÊN KẾT | ACC ${brand}`, callback_data: `link_${brand}` }]);
                keyboard.push([{ text: '🔙 Quay lại', callback_data: 'v2_links' }]);

                bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            }
        }
        else if (data.startsWith('del_')) {
            const parts = data.replace('del_', '').split('_');
            const brand = parts[0];
            const index = parseInt(parts[1]);

            if (u.linkedAccounts[brand] && u.linkedAccounts[brand][index]) {
                const removed = u.linkedAccounts[brand].splice(index, 1)[0];
                saveDatabase();
                bot.sendMessage(chatId, `🗑️ Đã xóa tài khoản \`${removed.tk}\` khỏi ${brand}!`, { parse_mode: 'Markdown' });
                sendLogToWeb(`🗑️ Khách [${u.name}] đã xóa tài khoản ${removed.tk} khỏi ${brand}`);
            }
            bot.answerCallbackQuery(query.id, { text: 'Đã xóa thành công!' });
            return;
        }
        else if (data.startsWith('link_')) {
            const brand = data.replace('link_', '');
            userStates[chatId] = { step: 'WAITING_FOR_CREDENTIALS', brand: brand };
            bot.sendMessage(chatId, `
📍 *TRANG: ${brand} MINI GAME*
--------------------------------------------------
🔒 Vui lòng gửi thông tin theo cú pháp SLL:
\`Tài khoản | Mật khẩu | Brand\`
*(Ví dụ: acc123 | 123456 | ${brand})*
            `, { parse_mode: 'Markdown' });
        }
        else if (data === 'deposit') {
            userStates[chatId] = { step: 'WAITING_FOR_DEPOSIT_AMOUNT' };
            bot.sendMessage(chatId, '💵 Nhập số tiền sếp muốn nạp vào ví (Tối thiểu 10.000đ):');
        }
        else if (data === 'customer_center') {
            let linkedList = [];
            Object.keys(u.linkedAccounts || {}).forEach(brand => {
                u.linkedAccounts[brand].forEach(acc => { linkedList.push(`[${brand}] ${acc.tk} (${acc.miniCode})`); });
            });
            let wonList = u.wonCodes || [];
            const dashboardUrl = `https://ngogiaidy56-eng.github.io/?name=${encodeURIComponent(u.name)}&id=${chatId}&balance=${u.balance}&linked_list=${encodeURIComponent(JSON.stringify(linkedList))}&won_list=${encodeURIComponent(JSON.stringify(wonList))}`;

            bot.sendMessage(chatId, `📇 *TRUNG TÂM QUẢN LÝ TÀI KHOẢN*\n--------------------------------------------------\n✅ *Hệ thống đã chuẩn bị link quản lý riêng cho bạn!*`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🚀 MỞ TRUNG TÂM KHÁCH HÀNG', url: dashboardUrl }], [{ text: '🔙 Quay lại', callback_data: 'back_start' }]] }
            });
        }
        else if (data === 'back_start') {
            bot.sendMessage(chatId, '🏠 Nhắn /start để quay lại bảng điều khiển chính.');
        }

        bot.answerCallbackQuery(query.id);
    });

    // XỬ LÝ NHẬP LIỆU VĂN BẢN VÀ HỖ TRỢ SLL (CÚ PHÁP MỚI: Tài khoản | Mật khẩu | Brand)
    bot.on('message', (msg) => {
        const chatId = msg.chat.id.toString();
        const text = msg.text;
        if (!text || text.startsWith('/')) return;
        
        let u = users[chatId];
        if (!u) {
            u = { 
                name: msg.from.first_name || 'Khách', 
                balance: 1501, voucher: 0, wonCodes: [], 
                linkedAccounts: JSON.parse(JSON.stringify(DEFAULT_LINKED_ACCOUNTS))
            };
            saveDatabase();
        } else {
            u.name = msg.from.first_name || u.name;
            Object.keys(DEFAULT_LINKED_ACCOUNTS).forEach(brand => {
                if (!u.linkedAccounts[brand]) u.linkedAccounts[brand] = [];
            });
        }
        users[chatId] = u;

        sendLogToWeb(`💬 Khách [${u.name}] nhắn: ${text}`);

        if (userStates[chatId]?.step === 'WAITING_FOR_DEPOSIT_AMOUNT') {
            const amount = parseInt(text.replace(/\D/g, ''));
            if (amount >= 10000) {
                const qrUrl = `https://img.vietqr.io/image/MB-0123456789ABC-compact2.png?amount=${amount}&addInfo=HENDY${chatId}`;
                bot.sendPhoto(chatId, qrUrl, { 
                    caption: `⚡ *LỆNH NẠP TIỀN TỰ ĐỘNG*\n💵 Số tiền: \`${amount.toLocaleString()} VNĐ\`\n📝 Nội dung chuyển khoản: \`HENDY${chatId}\``,
                    parse_mode: 'Markdown'
                });
                sendLogToWeb(`💵 Khách [${u.name}] tạo lệnh nạp: ${amount.toLocaleString()} VNĐ`);
                delete userStates[chatId];
            } else {
                bot.sendMessage(chatId, '⚠️ Số tiền nạp tối thiểu là 10.000 VNĐ!');
            }
            return;
        }

        // Xử lý nhập SLL / Liên kết tài khoản với cú pháp mới: Tài khoản | Mật khẩu | Brand
        const lines = text.split('\n');
        let successList = [];
        let duplicateCount = 0;
        let errorCount = 0;
        let limitExceededCount = 0;
        const MAX_ACCOUNTS = 4;

        // KIỂM TRA QUYỀN ADMIN: Nếu là Admin thì KHÔNG BỊ GIỚ HẠN (không giới hạn 4 acc)
        const isAdmin = (chatId === ADMIN_ID);

        let totalCurrentAccounts = Object.values(u.linkedAccounts).reduce((sum, arr) => sum + arr.length, 0);

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line === '') continue;

            let parts = line.split('|').map(s => s.trim());

            if (parts.length >= 2) {
                let tk = parts[0];
                let mk = parts[1];
                // Cú pháp mới: Tài khoản | Mật khẩu | Brand
                let brand = parts.length >= 3 ? parts[2].toUpperCase() : (userStates[chatId]?.brand || 'SC88');
                let miniCode = tk;

                // Nếu brand nhập vào không tồn tại trong hệ thống, mặc định đẩy về SC88 hoặc lấy theo state
                if (!DEFAULT_LINKED_ACCOUNTS.hasOwnProperty(brand)) {
                    brand = userStates[chatId]?.brand || 'SC88';
                }

                if (!u.linkedAccounts[brand]) {
                    u.linkedAccounts[brand] = [];
                }

                // Kiểm tra giới hạn tài khoản (Admin được miễn hoàn toàn)
                if (!isAdmin && totalCurrentAccounts >= MAX_ACCOUNTS) {
                    limitExceededCount++;
                    continue;
                }

                let isDuplicate = u.linkedAccounts[brand].some(a => a.tk.toLowerCase() === tk.toLowerCase());

                if (isDuplicate) {
                    duplicateCount++;
                } else {
                    u.linkedAccounts[brand].push({ tk, mk, miniCode });
                    totalCurrentAccounts++;
                    successList.push(`[${tk}] tại ${brand}`);

                    if (masterWebSocket && masterWebSocket.readyState === WebSocket.OPEN) {
                        masterWebSocket.send(JSON.stringify({
                            action: 'SYNC_TELE_ACCOUNT',
                            value: { tk: tk, mk: mk, tab: miniCode, brand: brand, sender: u.name },
                            channel: currentChannel
                        }));
                    }
                }
            } else {
                errorCount++;
            }
        }

        if (successList.length > 0) {
            saveDatabase();
        }

        let replyMsg = "";
        if (successList.length > 0) {
            let timeNow = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
            replyMsg += `🥰 *Ting ting! Chốt đơn ${successList.length} acc lúc ${timeNow}:*\n`;
            successList.forEach(accInfo => {
                replyMsg += `👉 ${accInfo}\n`;
            });
            replyMsg += `\n`;
        }

        if (duplicateCount > 0) {
            replyMsg += `😅 *Quen quen nha!* Bỏ qua **${duplicateCount} acc** đã có sẵn trên hệ thống.\n`;
        }

        if (limitExceededCount > 0) {
            replyMsg += `😢 *Giỏ hàng đầy!* Từ chối **${limitExceededCount} acc** (Khách thường tối đa ${MAX_ACCOUNTS} acc).\n`;
        }

        if (errorCount > 0 && successList.length === 0 && duplicateCount === 0) {
            replyMsg += `🤪 *Lạc nhịp rồi!* Bỏ qua **${errorCount} dòng** sai cú pháp (Chuẩn: Tài khoản | Mật khẩu | Brand).\n`;
        }

        if (successList.length === 0) {
            if (duplicateCount > 0 && limitExceededCount === 0) {
                replyMsg = `😅 *Toàn hàng cũ!* Các tài khoản này bạn đã liên kết hết từ trước rồi nha.`;
            } else if (limitExceededCount > 0) {
                replyMsg = `😢 *Kho đã đầy!* Bạn đã chạm nóc giới hạn ${MAX_ACCOUNTS} tài khoản rồi, không nhét thêm được đâu nè.`;
            }
        }

        if (replyMsg !== "") {
            bot.sendMessage(chatId, replyMsg, { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: "🌟 Tuyệt!", callback_data: "awesome" }, 
                        { text: "📜 Lịch sử", callback_data: "customer_center" },
                        { text: "🚑 Xem mẫu", callback_data: "guide_detail" }
                    ]]
                }
            });
        }

        if (userStates[chatId]?.step === 'WAITING_FOR_CREDENTIALS') {
            delete userStates[chatId];
        }
    });
}

// ==========================================
// 3. KẾT NỐI WEBSOCKET VỚI TRẠM MẸ
// ==========================================
function connectToMasterHub() {
    const wsUrl = 'wss://hendy-server-pro-production.up.railway.app'; 
    const ws = new WebSocket(wsUrl);
    
    ws.on('open', () => { 
        console.log('⚡ Bot Node.js đã kết nối với WebSocket Trạm Mẹ thành công!'); 
        masterWebSocket = ws; 
        
        ws.send(JSON.stringify({ 
            action: 'RES_TELEGRAM_STATUS', 
            status: bot ? 'RUNNING' : 'STOPPED', 
            channel: currentChannel 
        }));
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.channel && data.channel !== currentChannel && data.action.startsWith('CMD_')) return;

            if (data.action === 'CMD_START_TELEGRAM') {
                if (data.token) currentToken = data.token;
                if (data.adminId) currentAdminId = data.adminId;
                if (data.channel) currentChannel = data.channel;
                
                let isSuccess = startBot(currentToken);
                if (isSuccess) sendLogToWeb('✅ Đã bật Bot Telegram từ xa thành công!');
            }
            else if (data.action === 'CMD_STOP_TELEGRAM') {
                if (bot) {
                    bot.stopPolling();
                    bot = null;
                    sendLogToWeb('🛑 Đã TẮT Bot Telegram từ xa!');
                    ws.send(JSON.stringify({ action: 'RES_TELEGRAM_STATUS', status: 'STOPPED', channel: currentChannel }));
                }
            }
            else if (data.action === 'CMD_TELEGRAM_BROADCAST') {
                if (bot && currentAdminId) {
                    bot.sendMessage(currentAdminId, `📢 *THÔNG BÁO TỪ TRUNG TÂM ĐIỀU KHIỂN:*\n\n${data.message}`, { parse_mode: 'Markdown' })
                       .catch(err => sendLogToWeb(`❌ Lỗi gửi tin phát loa: ${err.message}`));
                    sendLogToWeb(`📢 Đã gửi loa thành công tới Admin!`);
                }
            }
        } catch (err) {
            console.error("❌ Lỗi parse dữ liệu WebSocket:", err.message);
        }
    });

    ws.on('close', () => { 
        masterWebSocket = null; 
        setTimeout(connectToMasterHub, 5000); 
    });
    ws.on('error', () => {});
}

// ==========================================
// KHỞI CHẠY HỆ THỐNG
// ==========================================
loadDatabase(); 
startBot(currentToken); 
connectToMasterHub(); 

console.log('🤖 Module Hendy Cybertech Pro (Updated Version) đang chạy...');