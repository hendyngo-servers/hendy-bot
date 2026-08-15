const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = TelegramBotModule.default || TelegramBotModule;
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ==========================================
// ⚙️ CẤU HÌNH HỆ THỐNG
// ==========================================
const WS_PORT = process.env.PORT || 8080;
let currentToken = process.env.BOT_TOKEN || '8689114890:AAFBFM0rNtZWpOtAovIPHPVQTJVp0odU1DQ'; 
let currentChannel = 'KENH-1'; 
let bot = null;

const ADMIN_ID = '6138197737'; 
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};
const userStates = {};
const userCooldowns = {}; 
let masterWebSocket = null;
let isMaintenanceMode = false; // Trạng thái bảo trì hệ thống

// Khớp chuẩn các brand theo giao diện thực tế
const DEFAULT_LINKED_ACCOUNTS = { 
    SC88: [], 
    C168: [], 
    'QQ88 THỨ SÁU': [], 
    F8BET: [], 
    KJC: [] 
};

// ==========================================
// 🗄️ QUẢN LÝ DATABASE
// ==========================================
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
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
            console.log(`✅ Đã tải dữ liệu của ${Object.keys(users).length} khách hàng.`);
        } else {
            console.log('⚠️ Chưa có file database.json, hệ thống sẽ tự khởi tạo.');
            users = {};
        }
    } catch (err) {
        console.error('❌ Lỗi đọc database:', err);
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
        console.error('❌ Lỗi lưu database:', err);
    }
}

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
// 🏆 HÀM THÔNG BÁO TRÚNG THƯỞNG
// ==========================================
function notifyUserWon(chatId, brand, accountName, points) {
    if (!users[chatId]) return;
    
    if (!users[chatId].wonCodes) {
        users[chatId].wonCodes = [];
    }
    users[chatId].wonCodes.push({ brand, accountName, points, time: new Date().toISOString() });
    saveDatabase();

    const winMessage = `
🌐 *THÔNG TIN CHI TIẾT ĐÃ TRÚNG:*

⭐ *Tài khoản đã trúng:* \`${accountName}\`

${brand} | ${points}
💎 *Điểm trúng:* \`${points}\`
    `;

    bot.sendMessage(chatId, winMessage, { parse_mode: 'Markdown' });
}

// ==========================================
// 🤖 KHỞI TẠO BOT TELEGRAM
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

    // Bộ lọc kiểm tra bảo trì
    const checkMaintenance = (chatId) => {
        if (isMaintenanceMode && chatId.toString() !== ADMIN_ID) {
            bot.sendMessage(chatId, '🛠️ *HỆ THỐNG ĐANG BẢO TRÌ*\nBot đang trong quá trình nâng cấp hệ thống. Vui lòng quay lại sau sếp nhé!', { parse_mode: 'Markdown' });
            return true;
        }
        return false;
    };

    // LỆNH BẬT/TẮT BẢO TRÌ DÀNH CHO ADMIN
    bot.onText(/\/baotri(?: (.+))?/, (msg, match) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_ID) {
            bot.sendMessage(chatId, '⛔ Bạn không có quyền thực hiện lệnh này!');
            return;
        }

        const action = match[1] ? match[1].trim().toLowerCase() : '';

        if (action === 'on') {
            isMaintenanceMode = true;
            bot.sendMessage(chatId, '🛠️ *Đã BẬT chế độ bảo trì hệ thống!*', { parse_mode: 'Markdown' });
            sendLogToWeb('⚠️ Admin đã BẬT chế độ bảo trì hệ thống.');
        } else if (action === 'off') {
            isMaintenanceMode = false;
            bot.sendMessage(chatId, '✅ *Đã TẮT chế độ bảo trì!* Hệ thống hoạt động bình thường.', { parse_mode: 'Markdown' });
            sendLogToWeb('✅ Admin đã TẮT chế độ bảo trì hệ thống.');
        } else {
            bot.sendMessage(chatId, `
⚙️ *TRẠNG THÁI BẢO TRÌ:* \`${isMaintenanceMode ? 'ĐANG BẢO TRÌ 🔴' : 'ĐANG HOẠT ĐỘNG 🟢'}\`
--------------------------------------------------
• \`/baotri on\` - Bật chế độ bảo trì
• \`/baotri off\` - Tắt chế độ bảo trì
            `, { parse_mode: 'Markdown' });
        }
    });

    // LỆNH /START (TỰ ĐỘNG HIỆN MENU ADMIN NẾU ĐÚNG ID)
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        if (checkMaintenance(chatId)) return;
        
        const user = msg.from;
        const isAdmin = (chatId.toString() === ADMIN_ID);

        sendLogToWeb(`👤 Khách [${user.first_name}] (ID: ${chatId}) mở Bot.`);

        if (!users[chatId]) {
            users[chatId] = {
                name: user.first_name || 'Khách',
                balance: 1501, voucher: 0, wonCodes: [], 
                linkedAccounts: JSON.parse(JSON.stringify(DEFAULT_LINKED_ACCOUNTS))
            };
            saveDatabase();
        } else {
            users[chatId].name = user.first_name || users[chatId].name;
            Object.keys(DEFAULT_LINKED_ACCOUNTS).forEach(brand => {
                if (!users[chatId].linkedAccounts[brand]) {
                    users[chatId].linkedAccounts[brand] = [];
                }
            });
            saveDatabase();
        }

        const u = users[chatId];
        const welcomeMessage = `
🤖 *HENDY CYBERTECH PRO v2026* 🚀
Chào mừng sếp, *${u.name}* (ID: \`${chatId}\`)
--------------------------------------------------
💎 *Cấp độ:* ${isAdmin ? '👑 ADMIN TỐI CAO' : 'VIP 0'}
💰 **Ví Chính:** \`${u.balance.toLocaleString()} VNĐ\`
🎁 **Ví Voucher:** \`${u.voucher.toLocaleString()} VNĐ\`
--------------------------------------------------
👉 Hệ thống tự động bảo mật & đồng bộ cao cấp.
        `;

        let inlineKeyboard = [
            [{ text: '🎟️ TRUNG TÂM MUA CODE & MINI GAME', callback_data: 'buy_code' }],
            [{ text: '💳 NẠP TIỀN TỰ ĐỘNG', callback_data: 'deposit' }],
            [{ text: '📇 TRUNG TÂM KHÁCH HÀNG (WEB)', callback_data: 'customer_center' }],
            [{ text: '👥 NHÓM HỖ TRỢ', url: 'https://t.me/Hendy_Support_Group' }]
        ];

        if (isAdmin) {
            inlineKeyboard.unshift(
                [{ text: '🛠️ [ADMIN] THỐNG KÊ MÁY CHỦ & RAM', callback_data: 'admin_server_status' }],
                [{ text: '👥 [ADMIN] DANH SÁCH USER HỆ THỐNG', callback_data: 'admin_list_users' }]
            );
        }

        bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
    });

    // CALLBACK QUERY XỬ LÝ NÚT BẤM
    bot.on('callback_query', (query) => {
        const chatId = query.from.id;
        if (checkMaintenance(chatId)) return;

        const now = Date.now();
        if (userCooldowns[chatId] && (now - userCooldowns[chatId] < 800)) {
            bot.answerCallbackQuery(query.id, { text: '⚠️ Thao tác quá nhanh!' });
            return;
        }
        userCooldowns[chatId] = now;

        const user = query.from;
        const data = query.data;
        let u = users[chatId] || { 
            name: user.first_name || 'Khách', 
            balance: 1501, voucher: 0, wonCodes: [], 
            linkedAccounts: JSON.parse(JSON.stringify(DEFAULT_LINKED_ACCOUNTS))
        };
        users[chatId] = u;

        if (data === 'buy_code') {
            let sc88Count = u.linkedAccounts['SC88'].length;
            let c168Count = u.linkedAccounts['C168'].length;
            let qqCount = u.linkedAccounts['QQ88 THỨ SÁU'].length;
            let f8Count = u.linkedAccounts['F8BET'].length;
            let kjcCount = u.linkedAccounts['KJC'].length;

            let textMenu = `
MINI GAME
☕ Chào ${u.name}
--------------------------------------------------
📊 *Thống Kê Liên Kết:*

• Liên Kết tại SC88: [ ${sc88Count} ]
• Liên Kết tại C168: [ ${c168Count} ]
• Liên Kết tại QQ88 THỨ SÁU: [ ${qqCount} ]
• Liên Kết tại F8BET: [ ${f8Count} ]
• Liên Kết tại KJC: [ ${kjcCount} ]
--------------------------------------------------
👉 Đơn hàng được đặt hàng bằng tài khoản liên kết với bot theo từng trang game.
            `;

            bot.sendMessage(chatId, textMenu, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `▶ SC88 (Đã liên kết: ${sc88Count})`, callback_data: 'page_SC88' }],
                        [{ text: `▶ C168 (Đã liên kết: ${c168Count})`, callback_data: 'page_C168' }],
                        [{ text: `▶ QQ88 THỨ SÁU (Đã liên kết: ${qqCount})`, callback_data: 'page_QQ88 THỨ SÁU' }],
                        [{ text: `▶ F8BET (Đã liên kết: ${f8Count})`, callback_data: 'page_F8BET' }],
                        [{ text: `▶ KJC (Đã liên kết: ${kjcCount})`, callback_data: 'page_KJC' }],
                        [{ text: '📖 HƯỚNG DẪN - CHI TIẾT', callback_data: 'guide' }],
                        [{ text: '<<<< Quay lại', callback_data: 'back_start' }]
                    ]
                }
            });
        }
        else if (data.startsWith('page_')) {
            const brand = data.replace('page_', '');
            let count = u.linkedAccounts[brand] ? u.linkedAccounts[brand].length : 0;

            bot.sendMessage(chatId, `
📍 *TRANG: ${brand} MINI GAME*
--------------------------------------------------
Số tài khoản đã liên kết: *${count}*

Chọn gói dịch vụ để đặt đơn:
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `📦 ${brand} RANDOM 68 138 288 - 35,000đ`, callback_data: `buy_${brand}_pack1` }],
                        [{ text: `📦 ${brand} GÓI CAM KẾT 272 ĐIỂM - 77,000đ`, callback_data: `buy_${brand}_pack2` }],
                        [{ text: `📦 ĐƠN NHIỀU ACC | ${brand} | TỐI THIỂU 340 ĐIỂM - 105,000đ`, callback_data: `buy_${brand}_pack3` }],
                        [{ text: `📋 QUẢN LÝ LIÊN KẾT - ${brand} MINI GAME`, callback_data: `manage_${brand}` }],
                        [{ text: '◀ Quay lại', callback_data: 'buy_code' }]
                    ]
                }
            });
        }
        else if (data.startsWith('manage_')) {
            const brand = data.replace('manage_', '');
            if (!u.linkedAccounts[brand]) u.linkedAccounts[brand] = [];
            const accounts = u.linkedAccounts[brand];
            let keyboard = [];
            
            let msgText = `📂 *QUẢN LÝ TÀI KHOẢN TẠI ${brand}*\n--------------------------------------------------\n`;
            if (accounts.length === 0) {
                msgText += `⚠️ Bạn chưa có tài khoản nào đã liên kết tại trang này.\nVui lòng thêm liên kết trước khi đặt đơn.\n`;
                keyboard.push([{ text: `➕ THÊM LIÊN KẾT | ACC XEM LIVE ${brand} MINI GAME`, callback_data: `link_${brand}` }]);
            } else {
                accounts.forEach((acc, idx) => {
                    msgText += `${idx + 1}. TK: \`${acc.tk}\`\n`;
                    keyboard.push([{ text: `❌ Xóa tài khoản ${acc.tk}`, callback_data: `del_${brand}_${idx}` }]);
                });
                keyboard.push([{ text: `➕ THÊM LIÊN KẾT MỚI`, callback_data: `link_${brand}` }]);
            }
            keyboard.push([{ text: '◀ Quay lại', callback_data: `page_${brand}` }]);

            bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        }
        else if (data.startsWith('link_')) {
            const brand = data.replace('link_', '');
            userStates[chatId] = { step: 'WAITING_FOR_CREDENTIALS', brand: brand };
            bot.sendMessage(chatId, `
📍 *THÊM TÀI KHOẢN XEM LIVE ${brand}*
Gửi thông tin theo cú pháp:
\`Tài khoản | Mật khẩu\`
*(Ví dụ: player01 | 123456)*
            `, { parse_mode: 'Markdown' });
        }
        else if (data.startsWith('del_')) {
            const parts = data.split('_');
            const brand = parts[1];
            const idx = parseInt(parts[2]);
            if (u.linkedAccounts[brand] && u.linkedAccounts[brand][idx]) {
                u.linkedAccounts[brand].splice(idx, 1);
                saveDatabase();
                bot.answerCallbackQuery(query.id, { text: 'Đã xóa tài khoản thành công!' });
                bot.sendMessage(chatId, `✅ Đã xóa tài khoản khỏi ${brand}.`);
            }
        }
        else if (data === 'guide') {
            bot.sendMessage(chatId, '📖 *HƯỚNG DẪN SỬ DỤNG*\n1. Chọn trang game.\n2. Thêm tài khoản liên kết (Tài khoản | Mật khẩu).\n3. Đặt gói cược và trải nghiệm mini game!', { parse_mode: 'Markdown' });
        }
        else if (data === 'deposit') {
            userStates[chatId] = { step: 'WAITING_FOR_DEPOSIT_AMOUNT' };
            bot.sendMessage(chatId, '💵 Vui lòng nhập số tiền bạn muốn nạp vào ví (Tối thiểu 10.000 VNĐ):');
        }
        else if (data === 'customer_center') {
            let linkedList = [];
            Object.keys(u.linkedAccounts || {}).forEach(brand => {
                u.linkedAccounts[brand].forEach(acc => { linkedList.push(`[${brand}] ${acc.tk}`); });
            });
            const dashUrl = `https://ngogiaidy56-eng.github.io/?name=${encodeURIComponent(u.name)}&id=${chatId}&balance=${u.balance}&linked_list=${encodeURIComponent(JSON.stringify(linkedList))}`;
            bot.sendMessage(chatId, `📇 *TRUNG TÂM KHÁCH HÀNG*\nTruy cập bảng điều khiển trực tuyến:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🚀 MỞ WEB QUẢN LÝ', url: dashUrl }], [{ text: '◀ Quay lại', callback_data: 'back_start' }]] }
            });
        }
        else if (data === 'back_start') {
            bot.sendMessage(chatId, '🏠 Nhập /start để về màn hình chính.');
        }
        else if (data === 'admin_server_status' && chatId.toString() === ADMIN_ID) {
            const totalUsers = Object.keys(users).length;
            const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
            bot.sendMessage(chatId, `⚙️ *THÔNG SỐ MÁY CHỦ*\n• Tổng User: \`${totalUsers}\`\n• RAM: \`${memoryUsage.toFixed(2)} MB\``, { parse_mode: 'Markdown' });
        }
        else if (data === 'admin_list_users' && chatId.toString() === ADMIN_ID) {
            let userKeys = Object.keys(users);
            let textList = `👥 *DANH SÁCH USER (${userKeys.length})*\n--------------------------------------------------\n`;
            userKeys.slice(0, 15).forEach((uid, idx) => {
                let usr = users[uid];
                let totalAcc = Object.values(usr.linkedAccounts || {}).reduce((s, arr) => s + arr.length, 0);
                textList += `${idx + 1}. *${usr.name}* (ID: \`${uid}\`) - Ví: \`${usr.balance}đ\` - Acc: \`${totalAcc}\`\n`;
            });
            bot.sendMessage(chatId, textList, { parse_mode: 'Markdown' });
        }

        bot.answerCallbackQuery(query.id);
    });

    // XỬ LÝ NHẬP LIỆU VĂN BẢN
    bot.on('message', (msg) => {
        const chatId = msg.chat.id.toString();
        const text = msg.text;
        if (!text || text.startsWith('/')) return;
        if (checkMaintenance(chatId)) return;
        
        let u = users[chatId];
        if (!u) return;

        if (userStates[chatId]?.step === 'WAITING_FOR_DEPOSIT_AMOUNT') {
            const amount = parseInt(text.replace(/\D/g, ''));
            if (amount >= 10000) {
                const qrUrl = `https://img.vietqr.io/image/MB-0123456789ABC-compact2.png?amount=${amount}&addInfo=HENDY${chatId}`;
                bot.sendPhoto(chatId, qrUrl, { caption: `⚡ NẠP TIỀN\nSố tiền: \`${amount.toLocaleString()} VNĐ\`\nNội dung: \`HENDY${chatId}\``, parse_mode: 'Markdown' });
                delete userStates[chatId];
            } else {
                bot.sendMessage(chatId, '⚠️ Số tiền tối thiểu là 10.000 VNĐ!');
            }
            return;
        }

        if (userStates[chatId]?.step === 'WAITING_FOR_CREDENTIALS') {
            const brand = userStates[chatId].brand;
            let parts = text.split('|').map(s => s.trim());
            if (parts.length >= 2) {
                let tk = parts[0];
                let mk = parts[1];
                let isDup = u.linkedAccounts[brand].some(a => a.tk.toLowerCase() === tk.toLowerCase());
                if (isDup) {
                    bot.sendMessage(chatId, `⚠️ Tài khoản \`${tk}\` đã tồn tại trong ${brand}!`, { parse_mode: 'Markdown' });
                } else {
                    u.linkedAccounts[brand].push({ tk, mk });
                    saveDatabase();
                    bot.sendMessage(chatId, `✅ Liên kết thành công tài khoản \`${tk}\` vào *${brand}*!`, { parse_mode: 'Markdown' });
                }
            } else {
                bot.sendMessage(chatId, '❌ Sai cú pháp! Vui lòng nhập định dạng: `Tài khoản | Mật khẩu`', { parse_mode: 'Markdown' });
            }
            delete userStates[chatId];
        }
    });
}

function connectToMasterHub() {
    const wsUrl = 'wss://hendy-server-pro-production.up.railway.app'; 
    const ws = new WebSocket(wsUrl);
    
    ws.on('open', () => { 
        console.log('⚡ Bot Node.js đã kết nối với WebSocket Trạm Mẹ thành công!'); 
        masterWebSocket = ws; 
        ws.send(JSON.stringify({ action: 'RES_TELEGRAM_STATUS', status: bot ? 'RUNNING' : 'STOPPED', channel: currentChannel }));
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.channel && data.channel !== currentChannel && data.action.startsWith('CMD_')) return;

            if (data.action === 'CMD_START_TELEGRAM') {
                if (data.token) currentToken = data.token;
                if (data.channel) currentChannel = data.channel;
                startBot(currentToken);
            } else if (data.action === 'CMD_STOP_TELEGRAM') {
                if (bot) {
                    bot.stopPolling();
                    bot = null;
                }
            }
        } catch (err) {}
    });

    ws.on('close', () => { 
        masterWebSocket = null; 
        setTimeout(connectToMasterHub, 5000); 
    });
    ws.on('error', () => {});
}

// Khởi chạy hệ thống
loadDatabase(); 
startBot(currentToken);
connectToMasterHub();
console.log('🚀 Hệ thống Bot Telegram Mini Game đã sẵn sàng!');
