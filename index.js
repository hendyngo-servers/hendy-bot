const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = TelegramBotModule.default || TelegramBotModule;
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const currentToken = process.env.BOT_TOKEN || '8689114890:AAFBFM0rNtZWpOtAovIPHPVQTJVp0odU1DQ'; 
let bot = null;

const ADMIN_ID = '6138197737'; 
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};
let activeWorkers = new Map(); // Lưu trữ danh sách các Worker đang kết nối tự động hóa

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            users = {};
        }
    } catch (err) {
        users = {}; 
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4), 'utf8');
    } catch (err) {}
}

loadDatabase();

// HTTP Server cung cấp API cho Dashboard quản trị tự động hóa
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.url === '/api/stats' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            total_users: Object.keys(users).length, 
            active_workers: activeWorkers.size,
            status: "Automation Engine Online" 
        }));
    }
    // API Gửi lệnh tự động hóa hàng loạt đến các Worker đang treo trình duyệt
    else if (req.url === '/api/automation/trigger' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { action, payload } = JSON.parse(body);
                let count = 0;
                activeWorkers.forEach((ws) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ action, payload }));
                        count++;
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', dispatched_workers: count }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error' }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// WebSocket Server quản lý luồng tự động hóa thời gian thực
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
    let workerId = 'worker_' + Math.random().toString(36).substring(2, 7);
    activeWorkers.set(workerId, ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            // Xử lý báo cáo kết quả tự động hóa từ Worker (Ví dụ: Check Live/Die, Giải Captcha xong)
            if (data.action === 'AUTO_REPORT_RESULT') {
                const { userId, brand, accountName, status } = data;
                if (users[userId] && users[userId].linkedAccounts[brand]) {
                    let acc = users[userId].linkedAccounts[brand].find(a => a.tk === accountName);
                    if (acc) {
                        acc.status = status; // Cập nhật trạng thái LIVE / DIE tự động
                        saveDatabase();
                    }
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        activeWorkers.delete(workerId);
    });
});

// Khởi chạy Bot Telegram phục vụ điều khiển tự động hóa
try {
    bot = new TelegramBot(currentToken, { polling: true });
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id.toString();
        const user = msg.from;
        if (!users[chatId]) {
            users[chatId] = {
                name: user.first_name || 'Khách',
                balance: 1501,
                voucher: 0,
                wonCodes: [],
                linkedAccounts: { SC88: [], C168: [], F8BET: [], QQ88: [], "78WIN": [] }
            };
            saveDatabase();
        }
        bot.sendMessage(chatId, `🤖 *HENDY AUTOMATION SYSTEM v2026*\nChào sếp *${users[chatId].name}*\nHệ thống tự động hóa trình duyệt đã sẵn sàng.`, { parse_mode: 'Markdown' });
    });
    console.log('🤖 Bot Telegram tự động hóa đã khởi động thành công!');
} catch (e) {
    console.error("Lỗi bot:", e);
}

server.listen(PORT, () => {
    console.log(`🚀 Automation Server đang chạy tại cổng ${PORT}`);
});
