const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = TelegramBotModule.default || TelegramBotModule;
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// ⚙️ CẤU HÌNH HỆ THỐNG
// ==========================================
const PORT = process.env.PORT || 8080;
const currentToken = process.env.BOT_TOKEN || '8689114890:AAFBFM0rNtZWpOtAovIPHPVQTJVp0odU1DQ'; 
let bot = null;

const ADMIN_ID = '6138197737'; 
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};
let activeWorkers = new Map(); // Quản lý danh sách Worker kết nối Realtime

// ==========================================
// 🗄️ QUẢN LÝ DATABASE
// ==========================================
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

// ==========================================
// 🌐 HTTP SERVER & API TỰ ĐỘNG HÓA
// ==========================================
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // API Lấy danh sách thống kê & Trạng thái Worker tự động hóa
    if (req.url === '/api/automation/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            total_users: Object.keys(users).length, 
            active_workers: activeWorkers.size,
            status: "Automation System Online" 
        }));
    }
    // API Gửi lệnh tự động hóa hàng loạt (Bulk Actions: Quét Live, Đổi Proxy, Chạy Kèo)
    else if (req.url === '/api/automation/trigger' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const actionType = data.action; 
                
                let dispatchedCount = 0;
                activeWorkers.forEach((wsClient) => {
                    if (wsClient.readyState === WebSocket.OPEN) {
                        wsClient.send(JSON.stringify({ action: actionType, payload: data.payload || {} }));
                        dispatchedCount++;
                    }
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', dispatched_workers: dispatchedCount }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Invalid payload' }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// ==========================================
// ⚡ WEBSOCKET SERVER CHO CÁC TAB WORKER
// ==========================================
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
    let workerId = 'worker_' + Math.random().toString(36).substring(2, 7);
    activeWorkers.set(workerId, ws);
    console.log(`[+] Worker tự động hóa kết nối: ${workerId}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.action === 'REPORT_ACCOUNT_STATUS') {
                const { userId, brand, accountName, status } = data;
                if (users[userId] && users[userId].linkedAccounts && users[userId].linkedAccounts[brand]) {
                    let acc = users[userId].linkedAccounts[brand].find(a => a.tk === accountName);
                    if (acc) {
                        acc.status = status; 
                        saveDatabase();
                    }
                }
            }
            else if (data.action === 'AUTOMATION_LOG') {
                console.log(`[Automation Log - ${workerId}]:`, data.message);
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        activeWorkers.delete(workerId);
        console.log(`[-] Worker ngắt kết nối: ${workerId}`);
    });
});

// ==========================================
// 🤖 TELEGRAM BOT TỰ ĐỘNG HÓA
// ==========================================
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
                proxy: "Default-IP",
                linkedAccounts: { SC88: [], C168: [], F8BET: [], QQ88: [], "78WIN": [] },
                auditLogs: []
            };
            saveDatabase();
        }
        
        let welcomeText = `🤖 *HENDY AUTOMATION SYSTEM v2026*\n` +
                          `Chào sếp *${users[chatId].name}*\n` +
                          `------------------------------------\n` +
                          `⚙️ Hệ thống tự động hóa & quản lý tài nguyên sẵn sàng.`;
                          
        bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
    });

    console.log('🤖 Bot Telegram Tự động hóa khởi động thành công!');
} catch (e) {
    console.error("Lỗi khởi chạy bot:", e);
}

// Khởi chạy toàn bộ hệ thống HTTP và WebSocket chung cổng PORT
server.listen(PORT, () => {
    console.log(`🚀 Automation Server & Bot đang chạy thành công trên cổng ${PORT}`);
});
