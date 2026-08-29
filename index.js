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

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // API Thống kê & Quản lý MMO
    if (req.url === '/api/stats' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total_users: Object.keys(users).length, status: "Online MMO System" }));
    }
    // API Webhook Auto Banking (Nhận biến động số dư từ Se-pay / MB / VCB)
    else if (req.url === '/api/webhook/banking' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                // Cú pháp nội dung chuyển khoản: "NAP [ID_TELEGRAM]" hoặc tự động quét số tiền
                const content = data.content || '';
                const amount = data.amount || 0;
                
                // Tìm kiếm ID Telegram trong nội dung chuyển khoản
                let targetUid = null;
                Object.keys(users).forEach(uid => {
                    if (content.includes(uid)) targetUid = uid;
                });

                if (targetUid && amount > 0) {
                    users[targetUid].balance += amount;
                    if (!users[targetUid].transactions) users[targetUid].transactions = [];
                    users[targetUid].transactions.push({ time: new Date(), amount: amount, type: 'DEPOSIT' });
                    saveDatabase();

                    // Báo tin nhắn qua Telegram cho khách
                    if (bot) {
                        bot.sendMessage(targetUid, `💳 *NẠP TIỀN THÀNH CÔNG!*\n\nCộng vào ví: \`+${amount.toLocaleString()} VNĐ\`\nVí chính: \`${users[targetUid].balance.toLocaleString()} VNĐ\``, { parse_mode: 'Markdown' });
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', processed: targetUid ? true : false }));
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

const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            // Xử lý báo cáo trạng thái tài khoản Live/Die từ Worker gửi về
            if (data.action === 'REPORT_ACCOUNT_STATUS') {
                const { userId, brand, accountName, status } = data;
                if (users[userId] && users[userId].linkedAccounts[brand]) {
                    let acc = users[userId].linkedAccounts[brand].find(a => a.tk === accountName);
                    if (acc) {
                        acc.status = status; // "LIVE" hoặc "DIE"
                        saveDatabase();
                    }
                }
            }
        } catch (e) {}
    });
});

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
                linkedAccounts: { SC88: [], C168: [], F8BET: [], QQ88: [], "78WIN": [] },
                transactions: []
            };
            saveDatabase();
        }
        bot.sendMessage(chatId, `🤖 *HENDY MMO SYSTEM v2026*\nChào sếp *${users[chatId].name}*\nVí chính: \`${users[chatId].balance.toLocaleString()} VNĐ\``, { parse_mode: 'Markdown' });
    });
    console.log('🤖 Bot MMO Telegram khởi động thành công!');
} catch (e) {
    console.error("Lỗi bot:", e);
}

server.listen(PORT, () => {
    console.log(`🚀 MMO Server đang chạy tại cổng ${PORT}`);
});
