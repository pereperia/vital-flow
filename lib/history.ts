// グラフ用のサンプル履歴（実機の記録ではない見本データ）

export type DayRecord = {
  date: string; // 'YYYY-MM-DD'（端末の現地時刻）
  label: string; // 'M/D'
  workHours: number;
  temp: number;
  humi: number;
};

/** 端末の現地時刻で 'YYYY-MM-DD' を作る（toISOString は UTC になり、日本時間だと日付がずれる） */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 毎回同じ並びになる乱数（表示のたびにグラフが変わらないように） */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateHistory(end: Date, days = 365, seed = 3544): DayRecord[] {
  const rand = seededRandom(seed);
  const records: DayRecord[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    const start = new Date(d.getFullYear(), 0, 1);
    const dayOfYear = Math.round((d.getTime() - start.getTime()) / 86400000);
    // 室温：1月中旬に低く、7月中旬に高い
    const seasonal = 23 - 5 * Math.cos((2 * Math.PI * (dayOfYear - 15)) / 365);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    records.push({
      date: toLocalDateString(d),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      workHours: Number(((weekend ? 1 : 3) + rand() * (weekend ? 3 : 5)).toFixed(1)),
      temp: Number((seasonal + (rand() - 0.5) * 3).toFixed(1)),
      humi: Math.round(45 + rand() * 25),
    });
  }
  return records;
}
