import logging
import sqlite3
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationBuilder, CallbackQueryHandler, CommandHandler, MessageHandler, filters, ContextTypes

logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)

user_states = {}
BRANDS = ['SC88', 'C168', 'QQ88 THỨ SÁU', 'F8BET', 'KJC']
BOT1_TOKEN = "8689114890:AAFBFM0rNtZWpOtAovIPHPVQTJVp0odU1DQ"

def init_db():
    conn = sqlite3.connect('system.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY, 
                        name TEXT, 
                        balance INTEGER DEFAULT 50000)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS linked_accounts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        user_id TEXT, 
                        brand TEXT, 
                        account_name TEXT)''')
    conn.commit()
    conn.close()

def get_or_create_user(user_id, name):
    conn = sqlite3.connect('system.db')
    cursor = conn.cursor()
    cursor.execute("SELECT balance FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if row:
        balance = row[0]
    else:
        cursor.execute("INSERT INTO users (id, name, balance) VALUES (?, ?, 50000)", (user_id, name))
        conn.commit()
        balance = 50000
    conn.close()
    return balance

def get_linked_accounts(user_id):
    conn = sqlite3.connect('system.db')
    cursor = conn.cursor()
    cursor.execute("SELECT brand, account_name FROM linked_accounts WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    accounts = {brand: [] for brand in BRANDS}
    for brand, acc_name in rows:
        if brand in accounts:
            accounts[brand].append(acc_name)
    return accounts

def add_linked_account(user_id, brand, account_name):
    conn = sqlite3.connect('system.db')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO linked_accounts (user_id, brand, account_name) VALUES (?, ?, ?)", (user_id, brand, account_name))
    conn.commit()
    conn.close()

async def send_home_menu(chat_id, user_name, balance, update: Update):
    welcome_message = (
        "🤖 *HENDY CYBERTECH PRO v2026* 🚀\n"
        f"Chào mừng sếp, *{user_name}*\n"
        "--------------------------------------------------\n"
        "💎 *Phân quyền:* 👤 KHÁCH HÀNG\n"
        f"💰 **Ví Chính:** `{balance:,} VNĐ`\n"
        "--------------------------------------------------\n"
        "👉 Hệ thống tự động bảo mật & đồng bộ cao cấp."
    )

    keyboard = [
        [InlineKeyboardButton("🎟️ TRUNG TÂM MUA CODE", callback_data="buy_code")],
        [
            InlineKeyboardButton("💳 NẠP TIỀN", callback_data="deposit"), 
            InlineKeyboardButton("📇 TT KHÁCH HÀNG", callback_data="customer_center")
        ],
        [InlineKeyboardButton("👥 NHÓM HỖ TRỢ", url="https://t.me/Hendy_Support_Group")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.message:
        await update.message.reply_text(welcome_message, reply_markup=reply_markup, parse_mode="Markdown")
    elif update.callback_query:
        await update.callback_query.edit_message_text(welcome_message, reply_markup=reply_markup, parse_mode="Markdown")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    chat_id = str(user.id)
    name = user.first_name or "Khách"
    balance = get_or_create_user(chat_id, name)
    if chat_id in user_states:
        del user_states[chat_id]
    await send_home_menu(chat_id, name, balance, update)

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    chat_id = str(query.from_user.id)
    name = query.from_user.first_name or "Khách"
    data = query.data

    balance = get_or_create_user(chat_id, name)
    linked_accs = get_linked_accounts(chat_id)

    if data == "buy_code":
        text_menu = (
            "🎟️ *TRUNG TÂM MUA CODE & NHÀ CÁI*\n"
            f"☕ Chào sếp *{name}*\n"
            "--------------------------------------------------\n"
            "📊 *Thống Kê Tài Khoản Liên Kết:*\n"
        )
        for b in BRANDS:
            text_menu += f"• {b}: [ {len(linked_accs[b])} ]\n"

        kb = [[InlineKeyboardButton(f"▶ {b} ({len(linked_accs[b])})", callback_data=f"page_{b}")] for b in BRANDS]
        kb.append([InlineKeyboardButton("◀ Quay lại", callback_data="back_start")])
        await query.edit_message_text(text_menu, reply_markup=InlineKeyboardMarkup(kb), parse_mode="Markdown")

    elif data.startswith("page_"):
        brand = data.replace("page_", "")
        acc_list = linked_accs.get(brand, [])
        brand_msg = f"🏢 *QUẢN LÝ TÀI KHOẢN: {brand}*\n📁 Số lượng liên kết: [ {len(acc_list)} ]\n------------------------------------\n"
        if not acc_list:
            brand_msg += "⚠️ Chưa có tài khoản liên kết nào."
        else:
            for idx, acc in enumerate(acc_list, 1):
                brand_msg += f"{idx}. `{acc}`\n"

        kb = [
            [InlineKeyboardButton("➕ Liên kết tài khoản mới", callback_data=f"link_acc_{brand}")],
            [InlineKeyboardButton("◀ Quay lại Trung Tâm", callback_data="buy_code")]
        ]
        await query.edit_message_text(brand_msg, reply_markup=InlineKeyboardMarkup(kb), parse_mode="Markdown")

    elif data.startswith("link_acc_"):
        brand = data.replace("link_acc_", "")
        user_states[chat_id] = {'action': 'waiting_link_account', 'brand': brand}
        await query.edit_message_text(f"⌨️ Vui lòng nhập tên đăng nhập liên kết với hệ thống *{brand}*:", parse_mode="Markdown")

    elif data == "customer_center":
        total_linked = sum(len(lst) for lst in linked_accs.values())
        cust_msg = (
            "📇 *TRUNG TÂM KHÁCH HÀNG*\n\n"
            f"👤 Tên: *{name}* | ID: `{chat_id}`\n"
            f"💰 Ví: `{balance:,} VNĐ` | Tổng liên kết: *{total_linked}*"
        )
        kb = [
            [InlineKeyboardButton("👥 NHÓM HỖ TRỢ", url="https://t.me/Hendy_Support_Group")],
            [InlineKeyboardButton("◀ Quay lại", callback_data="back_start")]
        ]
        await query.edit_message_text(cust_msg, reply_markup=InlineKeyboardMarkup(kb), parse_mode="Markdown")

    elif data == "deposit":
        msg = f"💳 *NẠP TIỀN TỰ ĐỘNG*\n\nVí chính: `{balance:,} VNĐ`\nLiên hệ Admin để nạp tiền."
        kb = [[InlineKeyboardButton("◀ Quay lại", callback_data="back_start")]]
        await query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(kb), parse_mode="Markdown")

    elif data == "back_start":
        if chat_id in user_states:
            del user_states[chat_id]
        await send_home_menu(chat_id, name, balance, update)

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_user.id)
    text = update.message.text.strip()
    if chat_id in user_states and user_states[chat_id]['action'] == 'waiting_link_account':
        brand = user_states[chat_id]['brand']
        add_linked_account(chat_id, brand, text)
        del user_states[chat_id]
        await update.message.reply_text(f"✅ Đã liên kết `{text}` với *{brand}*!\nGửi /start để về menu chính.", parse_mode="Markdown")

def main():
    init_db()
    app = ApplicationBuilder().token(BOT1_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    app.run_polling()

if __name__ == "__main__":
    main()
