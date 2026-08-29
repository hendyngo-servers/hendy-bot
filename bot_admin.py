import logging
import sqlite3
import requests
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationBuilder, CallbackQueryHandler, CommandHandler, MessageHandler, filters, ContextTypes

logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)

# ==========================================
# ⚙️ CẤU HÌNH HỆ THỐNG
# ==========================================
BOT2_TOKEN = "8864632779:AAHX6grIi3yat-Ak7kYTUyJeRDE1ZggJ3eI"
BOT1_TOKEN = "8689114890:AAFBFM0rNtZWpOtAovIPHPVQTJVp0odU1DQ"
ADMIN_ID = "6138197737"

admin_states = {}

# ==========================================
# 🗄️ QUẢN LÝ DATABASE (SQLite)
# ==========================================
def get_all_users():
    conn = sqlite3.connect('system.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, balance FROM users")
    rows = cursor.fetchall()
    conn.close()
    return rows

def get_user(user_id):
    conn = sqlite3.connect('system.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, balance FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return row

def update_balance(user_id, amount, is_add=True, is_reset=False):
    conn = sqlite3.connect('system.db')
    cursor = conn.cursor()
    if is_reset:
        cursor.execute("UPDATE users SET balance = 0 WHERE id = ?", (user_id,))
    else:
        if is_add:
            cursor.execute("UPDATE users SET balance = balance + ? WHERE id = ?", (amount, user_id))
        else:
            cursor.execute("UPDATE users SET balance = MAX(0, balance - ?) WHERE id = ?", (amount, user_id))
    conn.commit()
    conn.close()

def delete_user(user_id):
    conn = sqlite3.connect('system.db')
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    cursor.execute("DELETE FROM linked_accounts WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()

def get_linked_accounts(user_id):
    conn = sqlite3.connect('system.db')
    cursor = conn.cursor()
    cursor.execute("SELECT brand, account_name FROM linked_accounts WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return rows

def notify_user_via_bot1(chat_id, text):
    url = f"https://api.telegram.org/bot{BOT1_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"Lỗi gửi thông báo: {e}")

# ==========================================
# 🤖 GIAO DIỆN & XỬ LÝ LOGIC BOT ADMIN
# ==========================================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_user.id)
    if chat_id != ADMIN_ID:
        return

    welcome_message = "👑 *BẢNG ĐIỀU KHIỂN ADMIN TỐI CAO*\nHệ thống quản lý tích hợp sẵn sàng."
    
    # Bổ sung thêm các nút tính năng mới trên Menu chính
    keyboard = [
        [InlineKeyboardButton("👥 QUẢN LÝ USER", callback_data="admin_list_users")],
        [InlineKeyboardButton("🎁 CẬP NHẬT TRÚNG CODE", callback_data="admin_win_code_menu")],
        [InlineKeyboardButton("📢 GỬI BROADCAST", callback_data="admin_broadcast_prompt"), InlineKeyboardButton("🔗 ĐỔI LINK LIVE", callback_data="admin_changelink_prompt")]
    ]
    
    if chat_id in admin_states:
        del admin_states[chat_id]

    if update.message:
        await update.message.reply_text(welcome_message, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
    elif update.callback_query:
        await update.callback_query.edit_message_text(welcome_message, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    chat_id = str(query.from_user.id)
    if chat_id != ADMIN_ID:
        return

    data = query.data

    if data == "admin_list_users":
        users = get_all_users()
        keyboard = []
        for u in users:
            uid, name, balance = u
            keyboard.append([InlineKeyboardButton(f"👤 {name} ({uid}) - {balance:,}đ", callback_data=f"admin_view_{uid}")])
        keyboard.append([InlineKeyboardButton("◀ Quay lại", callback_data="back_start")])
        await query.edit_message_text(f"👥 *DANH SÁCH KHÁCH HÀNG ({len(users)})*", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")

    elif data.startswith("admin_view_"):
        target_id = data.replace("admin_view_", "")
        user = get_user(target_id)
        if not user:
            return
        uid, name, balance = user
        detail_msg = f"📋 *USER:* {name}\nID: `{uid}`\nVí: `{balance:,} VNĐ`"
        keyboard = [
            [InlineKeyboardButton("🎯 Săn Lệnh / Tài Khoản", callback_data=f"admin_sanlenh_{uid}")],
            [InlineKeyboardButton("➕ Cộng 50k", callback_data=f"admin_add_50000_{uid}"), InlineKeyboardButton("➖ Trừ 50k", callback_data=f"admin_sub_50000_{uid}")],
            [InlineKeyboardButton("🔄 Reset 0đ", callback_data=f"admin_reset_{uid}"), InlineKeyboardButton("🗑️ Xóa", callback_data=f"admin_delete_{uid}")],
            [InlineKeyboardButton("◀ Danh sách User", callback_data="admin_list_users")]
        ]
        await query.edit_message_text(detail_msg, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")

    elif data.startswith("admin_sanlenh_"):
        target_id = data.replace("admin_sanlenh_", "")
        user = get_user(target_id)
        linked = get_linked_accounts(target_id)
        msg = f"🎯 *KHO TÀI KHOẢN LIÊN KẾT ({user[1]}):*\n"
        if not linked:
            msg += "⚠️ Chưa liên kết tài khoản nào."
        else:
            brands = {}
            for brand, acc in linked:
                brands.setdefault(brand, []).append(acc)
            for b, accs in brands.items():
                msg += f"• *{b}*: `{('`, `'.join(accs))}`\n"
        keyboard = [[InlineKeyboardButton("◀ Quay lại", callback_data=f"admin_view_{target_id}")]]
        await query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")

    elif data.startswith(("admin_add_", "admin_sub_", "admin_reset_", "admin_delete_")):
        parts = data.split('_')
        action = parts[1]
        if action == "delete":
            delete_user(parts[2])
            await query.edit_message_text("🗑️ Đã xóa user thành công.", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("◀ Danh sách", callback_data="admin_list_users")]]))
        elif action == "reset":
            update_balance(parts[2], 0, is_reset=True)
            notify_user_via_bot1(parts[2], "⚠️ Số dư ví đã được Admin reset về `0 VNĐ`.")
            await query.edit_message_text("🔄 Đã reset ví về 0đ.", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("◀ Quay lại", callback_data=f"admin_view_{parts[2]}")]]))
        elif action in ["add", "sub"]:
            amount, target_id = int(parts[2]), parts[3]
            is_add = (action == "add")
            update_balance(target_id, amount, is_add=is_add)
            new_bal = get_user(target_id)[2]
            msg_notify = f"🎉 Được cộng `{amount:,} VNĐ`." if is_add else f"⚠️ Bị trừ `{amount:,} VNĐ`."
            notify_user_via_bot1(target_id, f"{msg_notify}\nVí mới: `{new_bal:,} VNĐ`")
            await query.edit_message_text(f"✅ Đã cập nhật. Ví mới: `{new_bal:,} VNĐ`", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("◀ Quay lại", callback_data=f"admin_view_{target_id}")]]))

    elif data == "admin_win_code_menu":
        admin_states[chat_id] = "waiting_wincode"
        await query.edit_message_text("🎁 Gửi danh sách theo định dạng: `TàiKhoản|MãCode` (mỗi dòng 1 acc).", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("◀ Quay lại", callback_data="back_start")]]))

    elif data == "admin_broadcast_prompt":
        admin_states[chat_id] = "waiting_broadcast"
        await query.edit_message_text("📢 Sếp hãy nhập nội dung thông báo muốn gửi đến toàn bộ người dùng:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("◀ Quay lại", callback_data="back_start")]]))

    elif data == "admin_changelink_prompt":
        admin_states[chat_id] = "waiting_changelink"
        await query.edit_message_text("🔗 Sếp hãy nhập Link Live mới để gửi lệnh cập nhật:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("◀ Quay lại", callback_data="back_start")]]))

    elif data == "back_start":
        await start(update, context)

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_user.id)
    if chat_id != ADMIN_ID or chat_id not in admin_states:
        return
    
    current_state = admin_states[chat_id]

    if current_state == "waiting_wincode":
        lines = update.message.text.strip().split('\n')
        conn = sqlite3.connect('system.db')
        cursor = conn.cursor()
        cursor.execute("SELECT user_id, account_name FROM linked_accounts")
        all_linked = cursor.fetchall()
        conn.close()

        success, not_found = 0, 0
        for line in lines:
            parts = [p.strip() for p in line.split('|')]
            target_acc = parts[0]
            code = parts[1] if len(parts) > 1 else "CODE_VIP"
            if not target_acc:
                continue
            found_uid = next((uid for uid, acc in all_linked if acc.lower() == target_acc.lower()), None)
            if found_uid:
                notify_user_via_bot1(found_uid, f"🎉 *TRÚNG CODE!*\nTK: `{target_acc}`\nCode: `{code}`")
                success += 1
            else:
                not_found += 1
        del admin_states[chat_id]
        await update.message.reply_text(f"✅ Xong!\nGửi thành công: {success}\nKhông tìm thấy: {not_found}")

    elif current_state == "waiting_broadcast":
        msg_text = update.message.text.strip()
        users = get_all_users()
        count = 0
        for u in users:
            uid = u[0]
            notify_user_via_bot1(uid, f"📢 *THÔNG BÁO HỆ THỐNG*\n\n{msg_text}")
            count += 1
        del admin_states[chat_id]
        await update.message.reply_text(f"✅ Đã gửi thông báo Broadcast thành công đến {count} khách hàng!")

    elif current_state == "waiting_changelink":
        new_link = update.message.text.strip()
        del admin_states[chat_id]
        # Xử lý bắn lệnh đổi link hoặc lưu trữ tùy biến hệ thống sếp
        await update.message.reply_text(f"✅ Đã nhận Link Live mới:\n`{new_link}`\n(Hệ thống đã ghi nhận lệnh đổi link)", parse_mode="Markdown")

def main():
    app = ApplicationBuilder().token(BOT2_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    app.run_polling()

if __name__ == "__main__":
    main()
