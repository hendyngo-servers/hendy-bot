from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import requests

app = FastAPI(title="Telegram Bot Master API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BOT2_TOKEN = "ĐIỀN_TOKEN_BOT_2"
ADMIN_CHAT_ID = "ĐIỀN_ID_NHÓM_ADMIN"

def get_db_connection():
    conn = sqlite3.connect('system.db', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

class BroadcastMsg(BaseModel):
    message: str

class AlertMsg(BaseModel):
    message: str

@app.get("/api/stats")
def get_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM accounts")
    total_users = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM accounts WHERE status = 'PENDING'")
    pending_services = cursor.fetchone()[0]
    conn.close()
    return {"total_users": total_users, "pending_services": pending_services, "last_cmd": "/dk"}

@app.get("/api/accounts")
def get_accounts():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, user_id, username, service, status FROM accounts ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/accounts/{account_id}/approve")
def approve_account(account_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE accounts SET status = 'ACTIVE' WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

def send_telegram_message(chat_id: str, text: str):
    url = f"https://api.telegram.org/bot{BOT2_TOKEN}/sendMessage"
    requests.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}, timeout=5)

@app.post("/api/bot/broadcast")
def broadcast_message(data: BroadcastMsg):
    send_telegram_message(ADMIN_CHAT_ID, f"📢 *THÔNG BÁO*\n\n{data.message}")
    return {"status": "success"}

@app.post("/api/bot/alert")
def send_alert(data: AlertMsg):
    send_telegram_message(ADMIN_CHAT_ID, f"⚠️ *CẢNH BÁO*\n\n`{data.message}`")
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
