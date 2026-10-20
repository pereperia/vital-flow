"""
疲労スコアの計算と通知（Raspberry Pi 側）

- Firebase の着席状態と、SQLite の温湿度を 1分ごとに確認する
- 疲労スコアが 65% 以上、または高温多湿（28℃以上かつ 65%以上）のとき
  LINE（Messaging API）・Gmail・ブザーで知らせる
- 同じ通知が続かないよう、通知の種類ごとに 30分の間隔をあける

※ 鍵やトークンはすべて環境変数から読み込みます（リポジトリには含めない）。
"""
import os
import smtplib
import sqlite3
import time
from email.mime.text import MIMEText

import firebase_admin
import requests
import RPi.GPIO as GPIO
from firebase_admin import credentials, firestore

DB_PATH = os.environ.get("VITAL_DB_PATH", "school_data.db")
GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
LINE_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
LINE_USER_ID = os.environ.get("LINE_USER_ID")

CHECK_INTERVAL = 60
COOLDOWN = 1800
FATIGUE_ALERT = 65
BUZZER_PIN = 25

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(BUZZER_PIN, GPIO.OUT)

firebase_admin.initialize_app(credentials.Certificate(os.environ["FIREBASE_KEY_PATH"]))
db = firestore.client()

# 通知の種類（channel × 内容）ごとに最後に送った時刻を持つ。
# 1つの変数を共有すると、先に送った Gmail の直後に LINE がクールダウン扱いで送られなくなるため
last_sent = {}


def cooled_down(key):
    now = time.time()
    if now - last_sent.get(key, 0) < COOLDOWN:
        return False
    last_sent[key] = now
    return True


def send_line(text):
    if not (LINE_TOKEN and LINE_USER_ID):
        return
    try:
        res = requests.post(
            "https://api.line.me/v2/bot/message/push",
            headers={"Authorization": f"Bearer {LINE_TOKEN}"},
            json={"to": LINE_USER_ID, "messages": [{"type": "text", "text": text}]},
            timeout=10,
        )
        if res.status_code != 200:
            print(f"LINE送信失敗: {res.status_code} {res.text}")
    except requests.RequestException as e:
        print(f"LINEエラー: {e}")


def send_gmail(subject, body):
    if not (GMAIL_USER and GMAIL_APP_PASSWORD):
        return
    msg = MIMEText(body)
    msg["Subject"], msg["From"], msg["To"] = subject, GMAIL_USER, GMAIL_USER
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.send_message(msg)
    except Exception as e:
        print(f"メール送信エラー: {e}")


def notify(kind, subject, body, beeps):
    if cooled_down(f"line:{kind}"):
        send_line(f"{subject}\n{body}")
    if cooled_down(f"gmail:{kind}"):
        send_gmail(subject, body)
    ring_buzzer(beeps)


def ring_buzzer(times):
    for _ in range(times):
        GPIO.output(BUZZER_PIN, GPIO.HIGH)
        time.sleep(0.6)
        GPIO.output(BUZZER_PIN, GPIO.LOW)
        time.sleep(0.1)


def latest_env():
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute("SELECT temp, humi FROM logs ORDER BY date DESC LIMIT 1").fetchone()
        conn.close()
        return row if row else (None, None)
    except sqlite3.Error as e:
        print(f"DB読み込みエラー: {e}")
        return None, None


def user_settings():
    doc = db.collection("UserSettings").document("profile").get()
    if doc.exists:
        data = doc.to_dict()
        return float(data.get("sleepTime", 7.0)), data.get("ageGroup", "20s")
    return 7.0, "20s"


def main():
    score = 0
    last_env = (None, None)
    seated_since = None

    while True:
        status = db.collection("DeviceStatus").document("current_status").get()
        present = status.exists and status.to_dict().get("is_present", 0) == 1
        sleep_time, age_group = user_settings()
        temp, humi = latest_env()

        if present:
            # 状態が変わったときだけ開始時刻を決める（3秒ごとの再送で着席時間をリセットしない）
            if seated_since is None:
                seated_since = time.time()
            sitting_min = (time.time() - seated_since) / 60
            ideal = 8.0 if age_group == "20s" else 7.0
            score = min(100, round(max(0, ideal - sleep_time) * 15 + sitting_min / 90 * 50))
            print(f"着席中: {int(sitting_min)}分 / 疲労: {score}%")
            if score >= FATIGUE_ALERT:
                notify("fatigue", "【休憩のおすすめ】", f"疲労スコアが{score}%です。休憩しましょう。", 5)
        else:
            seated_since = None
            score = max(0, score - 2)  # 離席中は 1分ごとに 2点回復
            print(f"離席中 / 回復中: {score}%")

        if temp is not None and humi is not None:
            if temp >= 28 and humi >= 65:
                notify("env", "【環境警告】", f"高温多湿です（{temp}℃ / {humi}%）。", 2)
            if (temp, humi) != last_env:  # 値が変わったときだけ送り、通信を減らす
                db.collection("Environment").document("latest").set(
                    {"temp": temp, "humi": humi, "timestamp": firestore.SERVER_TIMESTAMP})
                last_env = (temp, humi)

        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("終了します...")
    finally:
        GPIO.cleanup()
