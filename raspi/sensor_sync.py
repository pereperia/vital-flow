"""
着席判定と Firebase への送信（Raspberry Pi 側）

- 人感センサー（PIR）で着席を判定する
- 30秒反応がないときは、AIカメラ（YOLOv8）で本当に席を外したかを確かめる
- 判定結果は、状態が変わったとき、または 3秒ごとに Firebase へ送る
- 温湿度（DHT11）は 5分ごとに SQLite に記録する

※ 卒業制作で使ったコードから、鍵ファイル名・画面表示（pygame）・日記入力を除いて整理したものです。
   実行にはラズパイ本体とセンサー・カメラが必要です。
"""
import datetime
import os
import sqlite3
import time

import adafruit_dht
import board
import cv2
import firebase_admin
from firebase_admin import credentials, firestore
from gpiozero import MotionSensor
from ultralytics import YOLO

# --- 設定 ---
DB_PATH = os.environ.get("VITAL_DB_PATH", "school_data.db")
KEY_PATH = os.environ["FIREBASE_KEY_PATH"]  # サービスアカウントの鍵（リポジトリには含めない）
AWAY_THRESHOLD = 30   # この秒数センサーが反応しなければ、カメラで確認する
SYNC_INTERVAL = 3     # 状態が変わらなくても、この秒数ごとに送る（生存確認）
LOG_INTERVAL = 300    # 温湿度を記録する間隔（秒）

model = YOLO("yolov8n.pt")  # 起動時に一度だけ読み込む

firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
fb_db = firestore.client()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS logs (date TEXT, status TEXT, temp REAL, humi REAL)")
    conn.commit()
    conn.close()


def check_person_ai():
    """カメラで 1枚撮り、人が写っていれば True"""
    cap = cv2.VideoCapture(0)
    ret, frame = cap.read()
    cap.release()
    if not ret:
        return True  # カメラが使えないときは、誤って「離席」にしない
    for result in model(frame, verbose=False):
        for box in result.boxes:
            if int(box.cls) == 0:  # クラス 0 = person
                return True
    return False


class SensorManager:
    def __init__(self):
        try:
            self.dht = adafruit_dht.DHT11(board.D4)
        except Exception:
            self.dht = None
        try:
            # queue_len=1：読み取り中に値が書き換わるエラー（deque mutated during iteration）を防ぐ
            self.pir = MotionSensor(18, queue_len=1)
        except Exception:
            self.pir = None
        self.temp, self.humi = 0.0, 0.0

    def read(self):
        if self.dht:
            try:
                t, h = self.dht.temperature, self.dht.humidity
                if t is not None:
                    self.temp, self.humi = t, h
            except RuntimeError:
                pass  # DHT11 は読み取りに時々失敗するため、前回の値を使う
        motion = self.pir.motion_detected if self.pir else True
        return self.temp, self.humi, motion


def send_presence(is_seated):
    try:
        fb_db.collection("DeviceStatus").document("current_status").set({
            "is_present": 1 if is_seated else 0,
            "status": "着席中" if is_seated else "離席中",
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
    except Exception as e:
        print(f"Firebase送信エラー: {e}")


def save_log(now, status, temp, humi):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("INSERT INTO logs VALUES (?, ?, ?, ?)",
                     (now.strftime("%Y-%m-%d %H:%M"), status, temp, humi))
        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        print(f"記録エラー: {e}")


def main():
    init_db()
    sensors = SensorManager()
    is_seated = True
    last_sent = None
    last_sync = 0.0
    no_motion_since = None
    last_log = datetime.datetime.now()

    while True:
        now = datetime.datetime.now()
        temp, humi, motion = sensors.read()

        # 1. 着席判定：センサーが反応しない時間が続いたら、カメラで確かめる
        if motion:
            no_motion_since = None
            is_seated = True
        elif no_motion_since is None:
            no_motion_since = now
        elif (now - no_motion_since).total_seconds() > AWAY_THRESHOLD:
            print("センサー無反応のため、AIカメラで確認中...")
            if check_person_ai():
                print("AIが着席を確認。猶予を延長します。")
                no_motion_since = now
            else:
                is_seated = False

        # 2. Firebase へ送信（状態が変わったとき、または一定間隔）
        if is_seated != last_sent or time.time() - last_sync > SYNC_INTERVAL:
            send_presence(is_seated)
            last_sent, last_sync = is_seated, time.time()

        # 3. 温湿度の記録
        if (now - last_log).total_seconds() > LOG_INTERVAL:
            save_log(now, "着席" if is_seated else "離席", temp, humi)
            last_log = now

        time.sleep(1)


if __name__ == "__main__":
    main()
