import logging
import asyncio
import aiosqlite
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationBuilder, CallbackQueryHandler, CommandHandler, MessageHandler, filters, ContextTypes

# Thiết lập log để theo dõi lỗi
logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)

# Lưu trữ trạng thái tạm thời của người dùng
user_states = {}
BRANDS = ['SC88', 'C168', 'QQ88 THỨ SÁU', 'F8BET', 'KJC']
# ⚠️ THAY MÃ TOKEN MỚI CỦA BẠN VÀO ĐÂY (Vui lòng revoke token cũ để bảo mật)
BOT1_TOKEN = "YOUR_BOT_TOKEN_HERE" 

# ================= DATABASE (TỐI ƯU ASYNC) =================

async def init_db():
    async with aiosqlite.connect('system.db') as db:
        await db.execute('''CREATE TABLE IF NOT EXISTS users (
                            id TEXT PRIMARY KEY, 
                            name TEXT, 
                            balance INTEGER DEFAULT 50000)''')
        await db.execute('''CREATE TABLE IF NOT EXISTS linked_accounts (
                            id INTEGER PRIMARY KEY AUTOINCREMENT, 
                            user_id TEXT, 
                            brand TEXT, 
                            account_name TEXT)''')
        await db.commit()

async def get_or_create_user(user_id, name):
    async with aiosqlite.connect('system.db') as db:
        async with db.execute("SELECT balance FROM users WHERE id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                balance = row[0]
            else:
                await db.execute("INSERT INTO users (id, name, balance) VALUES (?, ?, 50000)", (user_id, name))
                await db.commit()
                balance = 50000
    return balance

async def get_linked_accounts(user_id):
    async with aiosqlite.connect('system.db') as db:
        async with db.execute("SELECT brand, account_name FROM linked_accounts WHERE user_id = ?", (user_id,)) as cursor:
            rows = await cursor.fetchall()
    
    accounts = {brand: [] for brand in BRANDS}
    for brand, acc_name in rows:
        if brand in accounts:
            accounts[brand].append(acc_name)
    return accounts

async def add_linked_account(user_id, brand, account_name):
    async with aiosqlite.connect('system.db') as db:
        await db.execute("INSERT INTO linked_accounts (user_id, brand, account_name) VALUES (?, ?, ?)", (user_id, brand, account_name))
        await db.commit()

async def update_balance(user_id, amount):
    async with aiosqlite.connect('system.db') as db:
        await db.execute("UPDATE users SET balance = balance + ? WHERE id = ?", (amount, user_id))
        await db.commit()

# ================= GIAO DIỆN & XỬ LÝ CHÍNH =================

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
        [InlineKeyboardButton("👁️ DỊCH VỤ MXH (Tăng Mắt Live)", callback_data="social_services")],
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
    
    balance = await get_or_create_user(chat_id, name)
    if chat_id in user_states:
        del user_states[chat_id]
        
    await send_home_menu(chat_id, name, balance, update)

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    chat_id = str(query.from_user.id)
    name = query.from_user.first_name or "Khách"
    data = query.data

    balance = await get_or_create_user(chat_id, name)

    # 1. Menu Mua Code / Nhà Cái
    if data == "buy_code":
        linked_accs = await get_linked_accounts(chat_id)
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

    # 2. Chi tiết Nhà Cái & Liên kết
    elif data.startswith("page_"):
        brand = data.replace("page_", "")
        linked_accs = await get_linked_accounts(chat_id)
        acc_list = linked_accs.get(brand, [])
        
        brand_msg = f"🏢 *QUẢN LÝ TÀI KHOẢN: {brand}*\n📁 Số lượng liên kết: [ {len(acc_list)} ]\n------------------------------------\n"
        if not acc_list:
            brand_msg += "⚠️ Chưa có tài khoản liên kết nào.\n"
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

    # 3. TÍNH NĂNG MỚI: DỊCH VỤ MẠNG XÃ HỘI
    elif data == "social_services":
        text_menu = (
            "👁️ *HỆ THỐNG DỊCH VỤ MẠNG XÃ HỘI*\n"
            "--------------------------------------------------\n"
            "Vui lòng chọn nền tảng bạn muốn tăng mắt Live:\n"
            "_(Giá có thể thay đổi tùy thời điểm)_"
        )
        kb = [
            [InlineKeyboardButton("🎵 Tăng Mắt TikTok (10,000đ/1K mắt)", callback_data="buff_live_tiktok")],
            [InlineKeyboardButton("📘 Tăng Mắt Facebook (15,000đ/1K mắt)", callback_data="buff_live_facebook")],
            [InlineKeyboardButton("◀ Quay lại", callback_data="back_start")]
        ]
        await query.edit_message_text(text_menu, reply_markup=InlineKeyboardMarkup(kb), parse_mode="Markdown")

    elif data.startswith("buff_live_"):
        platform = "TikTok" if "tiktok" in data else "Facebook"
        user_states[chat_id] = {'action': 'waiting_live_link', 'platform': platform}
        await query.edit_message_text(f"🔗 Vui lòng gửi **LINK LIVESTREAM {platform}** của bạn:\n\n_(Hệ thống sẽ tự động lên 1000 mắt và trừ tiền khi bạn gửi link)_", parse_mode="Markdown")

    # 4. Trung Tâm Khách Hàng
    elif data == "customer_center":
        linked_accs = await get_linked_accounts(chat_id)
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

    # 5. Nạp Tiền
    elif data == "deposit":
        msg = f"💳 *NẠP TIỀN TỰ ĐỘNG*\n\nVí chính: `{balance:,} VNĐ`\nLiên hệ Admin để nạp tiền."
        kb = [[InlineKeyboardButton("◀ Quay lại", callback_data="back_start")]]
        await query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(kb), parse_mode="Markdown")

    # Quay lại Menu chính
    elif data == "back_start":
        if chat_id in user_states:
            del user_states[chat_id]
        await send_home_menu(chat_id, name, balance, update)

# ================= XỬ LÝ TIN NHẮN (TEXT) =================

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_user.id)
    text = update.message.text.strip()
    
    if chat_id not in user_states:
        return

    # Xử lý nhập tên liên kết tài khoản
    if user_states[chat_id]['action'] == 'waiting_link_account':
        brand = user_states[chat_id]['brand']
        await add_linked_account(chat_id, brand, text)
        del user_states[chat_id]
        await update.message.reply_text(f"✅ Đã liên kết `{text}` với *{brand}*!\n👉 Nhấn /start để về menu chính.", parse_mode="Markdown")

    # Xử lý nhập link tăng mắt Live
    elif user_states[chat_id]['action'] == 'waiting_live_link':
        platform = user_states[chat_id]['platform']
        link = text
        price = 10000 if platform == "TikTok" else 15000
        
        balance = await get_or_create_user(chat_id, update.effective_user.first_name)
        
        if balance >= price:
            await update_balance(chat_id, -price) # Trừ tiền
            del user_states[chat_id]
            success_msg = (
                "✅ **TIẾN TRÌNH THÀNH CÔNG!**\n\n"
                f"📺 Nền tảng: *{platform}*\n"
                f"🔗 Link: {link}\n"
                f"💸 Đã thanh toán: `-{price:,} VNĐ`\n\n"
                "_Mắt sẽ bắt đầu tăng dần trong 1 - 5 phút tới._\n"
                "👉 Nhấn /start để về menu chính."
            )
            await update.message.reply_text(success_msg, parse_mode="Markdown")
        else:
            del user_states[chat_id]
            await update.message.reply_text("❌ **SỐ DƯ KHÔNG ĐỦ!**\nVui lòng nạp thêm tiền để sử dụng dịch vụ.\n👉 Nhấn /start để về menu chính.", parse_mode="Markdown")

# ================= HÀM MAIN =================

def main():
    # Khởi tạo DB (Chạy event loop tạm để setup bảng)
    loop = asyncio.get_event_loop()
    loop.run_until_complete(init_db())
    
    app = ApplicationBuilder().token(BOT1_TOKEN).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    
    print("🤖 Bot đang chạy...")
    app.run_polling()

if __name__ == "__main__":
    main()
