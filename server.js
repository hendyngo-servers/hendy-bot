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
const CHANNEL_ID = '-100xxxxxxxxx'; // ID Channel báo cáo tự động của Sếp

const DB_FILE = path.join(__dirname, 'database.json');
let users = {};
const userStates = {};
const userCooldowns = {}; 
let masterWebSocket = null;
let isMaintenanceMode = false;

const DEFAULT_LINKED_ACCOUNTS = { 
    SC88: [], 
    C168: [], 
    'QQ88 THỨ SÁU': [], 
    F8BET: [], 
    KJC: [] 
};

// ==========================================
// 📡 DỮ LIỆU STATUS MONITOR
// ==========================================
let brandStatuses = {
    'SC88': { status: '🟢 Hoạt động', ping: 12 },
    'C168': { status: '🟢 Hoạt động', ping: 15 },
    'F8BET': { status: '🟢 Hoạt động', ping: 14 }
};

function getSystemStatusText() {
    let report = `📡 *HENDY SYSTEM MONITOR*\n🕒 ${new Date().toLocaleTimeString('vi-VN')}\n--------------------------\n`;
    Object.keys(brandStatuses).forEach(brand => {
        const b = brandStatuses[brand];
        report += `• *${brand}:* ${b.status} (${b.ping}ms)\n`;
    });
    return report;
}

// ==========================================
// 🗄️ QUẢN LÝ DATABASE
// ==========================================
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
            Object.keys(users).forEach(uid => {
                if (!users[uid].linkedAccounts) users[uid].linkedAccounts = JSON.parse(JSON.stringify(DEFAULT_LINKED_ACCOUNTS));
                if (users[uid].balance === undefined) users[uid].balance = 50000;
            });
            console.log(`✅ Đã tải dữ liệu của ${Object.keys(users).length} khách hàng.`);
        } else {
            console.log('⚠️ Chưa có file database.json, hệ thống tự khởi tạo.');
            users = {};
        }
    } catch (err) {
        console.error('❌ Lỗi đọc database:', err);
        users = {}; 
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4), 'utf8');
    } catch (err) {
        console.error('❌ Lỗi lưu database:', err);
    }
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

        setInterval(() => {
            try {
                if (bot && CHANNEL_ID.includes('-100')) {
                    bot.sendMessage(CHANNEL_ID, getSystemStatusText(), { parse_mode: 'Markdown' });
                }
            } catch (e) {}
        }, 3600000);

        return true;
    } catch (e) {
        console.error("❌ Lỗi khởi động bot:", e);
        return false;
    }
}

// Hàm render Menu Chính mượt mà
function sendHomeMenu(chatId, u, isAdmin) {
    const welcomeMessage = `
🤖 *HENDY CYBERTECH PRO v2026* 🚀
Chào mừng sếp, *${u.name}*
--------------------------------------------------
💎 *Phân quyền:* ${isAdmin ? '👑 ADMIN TỐI CAO' : '👤 KHÁCH HÀNG'}
💰 **Ví Chính:** \`${u.balance.toLocaleString()} VNĐ\`
--------------------------------------------------
👉 Hệ thống tự động bảo mật & đồng bộ cao cấp.
    `;

    let inlineKeyboard = [
        [{ text: '🎟️ TRUNG TÂM MUA CODE', callback_data: 'buy_code' }],
        [{ text: '💳 NẠP TIỀN TỰ ĐỘNG', callback_data: 'deposit' }, { text: '📇 TRUNG TÂM KHÁCH HÀNG', callback_data: 'customer_center' }],
        [{ text: '👥 NHÓM HỖ TRỢ', url: 'https://t.me/Hendy_Support_Group' }]
    ];

    if (isAdmin) {
        inlineKeyboard.unshift([{ text: '👥 [ADMIN] QUẢN LÝ DANH SÁCH USER', callback_data: 'admin_list_users' }]);
        inlineKeyboard.unshift([{ text: '🎁 [ADMIN] CẬP NHẬT TK TRÚNG CODE', callback_data: 'admin_win_code_menu' }]);
    }

    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineKeyboard } });
}

function setupBotLogic() {
    if (!bot) return;

    const checkMaintenance = (chatId) => {
        if (isMaintenanceMode && chatId.toString() !== ADMIN_ID) {
            bot.sendMessage(chatId, '🛠️ *HỆ THỐNG ĐANG BẢO TRÌ*\nBot đang trong quá trình nâng cấp. Vui lòng quay lại sau sếp nhé!', { parse_mode: 'Markdown' });
            return true;
        }
        return false;
    };

    bot.onText(/\/baotri(?: (.+))?/, (msg, match) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_ID) return;
        const action = match[1] ? match[1].trim().toLowerCase() : '';
        if (action === 'on') { isMaintenanceMode = true; bot.sendMessage(chatId, '🛠️ *Đã BẬT bảo trì!*'); }
        else if (action === 'off') { isMaintenanceMode = false; bot.sendMessage(chatId, '✅ *Đã TẮT bảo trì!*'); }
    });

    bot.onText(/\/broadcast (.+)/, (msg, match) => {
        if (msg.chat.id.toString() !== ADMIN_ID) return;
        const message = match[1];
        let count = 0;
        Object.keys(users).forEach(uid => {
            try {
                bot.sendMessage(uid, "📢 *THÔNG BÁO TỪ HỆ THỐNG:*\n\n" + message, { parse_mode: 'Markdown' });
                count++;
            } catch (e) {}
        });
        bot.sendMessage(ADMIN_ID, `✅ Đã gửi thông báo thành công đến ${count} người dùng.`);
    });

    // Lệnh gửi thông báo code nhanh cho Admin: /sendcode <Nội dung code>
    bot.onText(/\/sendcode (.+)/, (msg, match) => {
        if (msg.chat.id.toString() !== ADMIN_ID) return;
        const codeContent = match[1];
        let count = 0;
        
        const codeMessage = `🎁 *THÔNG BÁO MÃ CODE MỚI!*\n\n` +
                            `🔥 Sếp nhận được mã quà tặng từ hệ thống:\n` +
                            `------------------------------------\n` +
                            `🎟️ Code: \`${codeContent}\`\n` +
                            `------------------------------------\n` +
                            `👉 Nhanh tay vào game kích hoạt ngay kẻo hết hạn nhé!`;

        Object.keys(users).forEach(uid => {
            try {
                bot.sendMessage(uid, codeMessage, { parse_mode: 'Markdown' });
                count++;
            } catch (e) {}
        });
        bot.sendMessage(ADMIN_ID, `✅ Đã gửi thông báo Code [ ${codeContent} ] thành công đến ${count} người dùng.`);
    });

    bot.onText(/\/status/, (msg) => {
        bot.sendMessage(msg.chat.id, getSystemStatusText(), { parse_mode: 'Markdown' });
    });

    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        if (checkMaintenance(chatId)) return;
        const user = msg.from;
        const isAdmin = (chatId.toString() === ADMIN_ID);

        if (!users[chatId]) {
            users[chatId] = {
                name: user.first_name || 'Khách',
                balance: 50000,
                linkedAccounts: JSON.parse(JSON.stringify(DEFAULT_LINKED_ACCOUNTS))
            };
            saveDatabase();
        }

        sendHomeMenu(chatId, users[chatId], isAdmin);
    });

    // ==========================================
    // XỬ LÝ NÚT BẤM (CALLBACK QUERY)
    // ==========================================
    bot.on('callback_query', (query) => {
        const chatId = query.from.id.toString();
        const isAdmin = (chatId === ADMIN_ID);
        if (checkMaintenance(chatId)) return;

        const now = Date.now();
        if (userCooldowns[chatId] && (now - userCooldowns[chatId] < 800)) {
            return bot.answerCallbackQuery(query.id, { text: '⚠️ Thao tác quá nhanh!' });
        }
        userCooldowns[chatId] = now;

        const data = query.data;
        let u = users[chatId];
        if (!u && !data.startsWith('admin_')) return;

        // Admin: Menu Cập nhật tài khoản trúng code
        if (data === 'admin_win_code_menu' && isAdmin) {
            userStates[chatId] = { action: 'waiting_wincode_input' };
            return bot.sendMessage(chatId, 
                `🎁 *CẬP NHẬT TÀI KHOẢN TRÚNG CODE*\n\n` +
                `Sếp hãy gửi danh sách tài khoản trúng thưởng (mỗi dòng một tài khoản hoặc theo định dạng tương ứng):\n` +
                `📌 *Ví dụ:* \`TK123|MãCodeVIP\` hoặc dán nguyên danh sách từ Kho Tài Khoản qua.\n\n` +
                `⌨️ Vui lòng gửi nội dung danh sách ngay dưới đây:`, 
                { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '◀ Quay lại', callback_data: 'back_start' }]]
                    }
                }
            );
        }

        // Admin: Quản lý danh sách user
        if (data === 'admin_list_users' && isAdmin) {
            const userIds = Object.keys(users);
            let buttons = [];
            
            userIds.forEach(uid => {
                let usr = users[uid];
                buttons.push([{ 
                    text: `👤 ${usr.name} (ID: ${uid}) - ${usr.balance.toLocaleString()}đ`, 
                    callback_data: `admin_view_user_${uid}` 
                }]);
            });
            buttons.push([{ text: '◀ Quay lại', callback_data: 'back_start' }]);

            return bot.sendMessage(chatId, `👥 *QUẢN LÝ DANH SÁCH USER (${userIds.length} người dùng)*\nChọn user bên dưới để xem chi tiết và can thiệp trực tiếp:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            });
        }

        if (data.startsWith('admin_view_user_') && isAdmin) {
            const targetId = data.replace('admin_view_user_', '');
            const targetUser = users[targetId];
            if (!targetUser) return bot.answerCallbackQuery(query.id, { text: '❌ Không tìm thấy user này!' });

            let detailMsg = `📋 *CHI TIẾT NGƯỜI DÙNG*\n`;
            detailMsg += `• Tên: *${targetUser.name}*\n`;
            detailMsg += `• ID Telegram: \`${targetId}\`\n`;
            detailMsg += `• Số dư ví: \`${targetUser.balance.toLocaleString()} VNĐ\`\n`;

            return bot.sendMessage(chatId, detailMsg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '➕ Cộng 50k', callback_data: `admin_add_50000_${targetId}` },
                            { text: '➕ Cộng 500k', callback_data: `admin_add_500000_${targetId}` }
                        ],
                        [
                            { text: '➖ Trừ 50k', callback_data: `admin_sub_50000_${targetId}` },
                            { text: '➖ Trừ 500k', callback_data: `admin_sub_500000_${targetId}` }
                        ],
                        [
                            { text: '🔄 Reset 0đ', callback_data: `admin_reset_${targetId}` },
                            { text: '🗑️ Xóa User', callback_data: `admin_delete_${targetId}` }
                        ],
                        [{ text: '◀ Danh sách User', callback_data: 'admin_list_users' }]
                    ]
                }
            });
        }

        if (isAdmin && (data.startsWith('admin_add_') || data.startsWith('admin_sub_') || data.startsWith('admin_reset_') || data.startsWith('admin_delete_'))) {
            const parts = data.split('_');
            const actionType = parts[1];

            if (actionType === 'delete') {
                const targetId = parts[2];
                if (users[targetId]) {
                    delete users[targetId];
                    saveDatabase();
                    bot.answerCallbackQuery(query.id, { text: `🗑️ Đã xóa user ${targetId} thành công!` });
                    return bot.sendMessage(chatId, `🗑️ Đã xóa vĩnh viễn user có ID: \`${targetId}\` khỏi hệ thống.`, { parse_mode: 'Markdown' });
                }
            }

            if (actionType === 'reset') {
                const targetId = parts[2];
                if (users[targetId]) {
                    users[targetId].balance = 0;
                    saveDatabase();
                    bot.answerCallbackQuery(query.id, { text: `🔄 Đã reset số dư user ${targetId} về 0đ!` });
                    try {
                        bot.sendMessage(targetId, `⚠️ *THÔNG BÁO TỪ HỆ THỐNG*\nSố dư ví của Sếp đã được Admin reset về \`0 VNĐ\`.`, { parse_mode: 'Markdown' });
                    } catch (e) {}
                    return bot.sendMessage(chatId, `🔄 Đã reset số dư của user ID \`${targetId}\` về 0 VNĐ.`, { parse_mode: 'Markdown' });
                }
            }

            if (actionType === 'add' || actionType === 'sub') {
                const amount = parseInt(parts[2]);
                const targetId = parts[3];

                if (users[targetId]) {
                    if (actionType === 'add') {
                        users[targetId].balance += amount;
                    } else {
                        users[targetId].balance = Math.max(0, users[targetId].balance - amount);
                    }
                    saveDatabase();

                    bot.answerCallbackQuery(query.id, { text: `✅ Đã cập nhật số dư thành công!` });
                    
                    try {
                        let notifyText = actionType === 'add' 
                            ? `🎉 *TÀI KHOẢN ĐƯỢC CỘNG TIỀN!*\nAdmin vừa cộng thêm \`${amount.toLocaleString()} VNĐ\` vào ví của Sếp.`
                            : `⚠️ *THÔNG BÁO SỐ DƯ!*\nAdmin vừa điều chỉnh trừ \`${amount.toLocaleString()} VNĐ\` từ ví của Sếp.`;
                        bot.sendMessage(targetId, notifyText + `\n💰 Số dư mới: \`${users[targetId].balance.toLocaleString()} VNĐ\``, { parse_mode: 'Markdown' });
                    } catch (e) {}

                    return bot.sendMessage(chatId, `✅ Đã thực hiện thao tác thành công cho User ID: \`${targetId}\`\nSố dư mới hiện tại: \`${users[targetId].balance.toLocaleString()} VNĐ\``, { parse_mode: 'Markdown' });
                }
            }
        }

        // Trung tâm Mua Code & Quản lý Nhà cái (5 nhà cái chuẩn)
        if (data === 'buy_code') {
            let sc88Count = u.linkedAccounts['SC88'].length;
            let c168Count = u.linkedAccounts['C168'].length;
            let qq88Count = u.linkedAccounts['QQ88 THỨ SÁU'].length;
            let f8betCount = u.linkedAccounts['F8BET'].length;
            let kjcCount = u.linkedAccounts['KJC'].length;

            let textMenu = `🎟️ *TRUNG TÂM MUA CODE & NHÀ CÁI*\n☕ Chào sếp *${u.name}*\n--------------------------------------------------\n📊 *Thống Kê Tài Khoản Liên Kết:*\n` +
                           `• SC88: [ ${sc88Count} ]\n` +
                           `• C168: [ ${c168Count} ]\n` +
                           `• QQ88 Thứ Sáu: [ ${qq88Count} ]\n` +
                           `• F8BET: [ ${f8betCount} ]\n` +
                           `• KJC: [ ${kjcCount} ]`;

            bot.sendMessage(chatId, textMenu, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `▶ SC88 (${sc88Count})`, callback_data: 'page_SC88' }],
                        [{ text: `▶ C168 (${c168Count})`, callback_data: 'page_C168' }],
                        [{ text: `▶ QQ88 Thứ Sáu (${qq88Count})`, callback_data: 'page_QQ88 THỨ SÁU' }],
                        [{ text: `▶ F8BET (${f8betCount})`, callback_data: 'page_F8BET' }],
                        [{ text: `▶ KJC (${kjcCount})`, callback_data: 'page_KJC' }],
                        [{ text: '◀ Quay lại', callback_data: 'back_start' }]
                    ]
                }
            });
        }
        else if (data.startsWith('page_')) {
            const brandName = data.replace('page_', '');
            const listAcc = u.linkedAccounts[brandName] || [];
            
            let brandMsg = `🏢 *QUẢN LÝ TÀI KHOẢN: ${brandName}*\n📁 Số lượng liên kết: [ ${listAcc.length} ]\n------------------------------------\n`;
            if (listAcc.length === 0) {
                brandMsg += `⚠️ Chưa có tài khoản liên kết nào cho hệ thống này.`;
            } else {
                listAcc.forEach((acc, index) => {
                    brandMsg += `${index + 1}. \`${acc}\`\n`;
                });
            }

            bot.sendMessage(chatId, brandMsg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ Liên kết tài khoản mới', callback_data: `link_acc_${brandName}` }],
                        [{ text: '◀ Quay lại Trung Tâm', callback_data: 'buy_code' }]
                    ]
                }
            });
        }
        else if (data.startsWith('link_acc_')) {
            const brandName = data.replace('link_acc_', '');
            userStates[chatId] = { action: 'waiting_link_account', brand: brandName };
            bot.sendMessage(chatId, `⌨️ Vui lòng nhập tài khoản/tên đăng nhập muốn liên kết với hệ thống *${brandName}*:`, { parse_mode: 'Markdown' });
        }
        // Trung tâm Khách hàng
        else if (data === 'customer_center') {
            let totalLinked = Object.values(u.linkedAccounts).reduce((sum, arr) => sum + arr.length, 0);
            let custMsg = `📇 *TRUNG TÂM KHÁCH HÀNG*\n\n` +
                          `👤 Tên tài khoản: *${u.name}*\n` +
                          `🆔 ID Telegram: \`${chatId}\`\n` +
                          `💰 Ví chính: \`${u.balance.toLocaleString()} VNĐ\`\n` +
                          `📊 Tổng tài khoản liên kết: *${totalLinked}*\n` +
                          `------------------------------------\n` +
                          `👉 Sếp cần hỗ trợ trực tiếp vui lòng liên hệ nhóm hỗ trợ bên dưới!`;

            bot.sendMessage(chatId, custMsg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '👥 NHÓM HỖ TRỢ TRỰC TUYẾN', url: 'https://t.me/Hendy_Support_Group' }],
                        [{ text: '◀ Quay lại', callback_data: 'back_start' }]
                    ]
                }
            });
        }
        // Nạp tiền tự động
        else if (data === 'deposit') {
            bot.sendMessage(chatId, `💳 *HỆ THỐNG NẠP TIỀN TỰ ĐỘNG*\n\n💰 Ví chính hiện tại: \`${u.balance.toLocaleString()} VNĐ\`\n\n👉 Vui lòng liên hệ Admin hoặc chuyển khoản qua cú pháp để nạp tiền tự động vào ví.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀ Quay lại', callback_data: 'back_start' }]
                    ]
                }
            });
        }
        else if (data === 'back_start') { 
            delete userStates[chatId];
            sendHomeMenu(chatId, u, isAdmin);
        }
        
        bot.answerCallbackQuery(query.id);
    });

    // Lắng nghe text để nhập tài khoản liên kết hoặc cập nhật trúng code
    bot.on('message', (msg) => {
        const chatId = msg.chat.id.toString();
        if (!msg.text || msg.text.startsWith('/')) return;

        if (userStates[chatId]) {
            // Xử lý cập nhật tài khoản trúng code (Dành riêng cho Admin)
            if (userStates[chatId].action === 'waiting_wincode_input' && chatId === ADMIN_ID) {
                const lines = msg.text.split('\n');
                let successCount = 0;
                let notFoundCount = 0;

                lines.forEach(line => {
                    let parts = line.split('|').map(p => p.trim());
                    let targetAccount = parts[0];
                    let prizeCode = parts[1] || 'CODE_VIP_THUONG';

                    if (!targetAccount) return;

                    // Tìm user sở hữu tài khoản liên kết này trong database
                    let foundUid = null;
                    Object.keys(users).forEach(uid => {
                        let usr = users[uid];
                        if (usr.linkedAccounts) {
                            Object.keys(usr.linkedAccounts).forEach(brand => {
                                if (usr.linkedAccounts[brand].includes(targetAccount)) {
                                    foundUid = uid;
                                }
                            });
                        }
                    });

                    if (foundUid) {
                        try {
                            let notifyMsg = `🎉 *CHÚNG MỪNG SẾP ĐÃ TRÚNG CODE!*\n\n` +
                                            `🏢 Tài khoản liên kết: \`${targetAccount}\`\n` +
                                            `🎟️ Mã thưởng: \`${prizeCode}\`\n` +
                                            `------------------------------------\n` +
                                            `👉 Nhanh tay vào nhận thưởng ngay sếp nhé!`;
                            bot.sendMessage(foundUid, notifyMsg, { parse_mode: 'Markdown' });
                            successCount++;
                        } catch (e) {
                            notFoundCount++;
                        }
                    } else {
                        notFoundCount++;
                    }
                });

                delete userStates[chatId];
                return bot.sendMessage(ADMIN_ID, `✅ *ĐÃ XỬ LÝ XONG DANH SÁCH TRÚNG CODE!*\n• Gửi thông báo thành công: ${successCount} user\n• Không tìm thấy/Lỗi: ${notFoundCount}`, { parse_mode: 'Markdown' });
            }

            // Xử lý liên kết tài khoản thông thường
            if (userStates[chatId].action === 'waiting_link_account') {
                const brand = userStates[chatId].brand;
                const accountText = msg.text.trim();

                if (!users[chatId]) return;
                if (!users[chatId].linkedAccounts[brand]) {
                    users[chatId].linkedAccounts[brand] = [];
                }

                users[chatId].linkedAccounts[brand].push(accountText);
                saveDatabase();

                delete userStates[chatId];
                bot.sendMessage(chatId, `✅ Đã liên kết thành công tài khoản \`${accountText}\` vào hệ thống *${brand}*!`, { parse_mode: 'Markdown' });
            }
        }
    });
}

function connectToMasterHub() {
    const wsUrl = 'wss://hendy-server-pro-production.up.railway.app'; 
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => { 
        console.log('⚡ Bot Node.js đã kết nối với WebSocket Trạm Mẹ!'); 
        masterWebSocket = ws; 
        if (bot) ws.send(JSON.stringify({ action: 'RES_TELEGRAM_STATUS', status: 'RUNNING', channel: currentChannel }));
    });
    ws.on('close', () => { masterWebSocket = null; setTimeout(connectToMasterHub, 5000); });
    ws.on('error', () => {});
}

// Khởi chạy hệ thống
loadDatabase(); 
startBot(currentToken);
connectToMasterHub();
console.log('🚀 Hệ thống Bot Telegram ĐÃ KHỞI ĐỘNG THÀNH CÔNG!');
