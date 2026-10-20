// 疲労スコアの計算（画面とラズパイ側で同じ考え方を使う）

export type AgeGroup = '20s' | '30s+';

/** 休憩をうながすしきい値（ラズパイ側の通知と同じ 65%） */
export const FATIGUE_ALERT = 65;

/** 年代ごとの理想の睡眠時間 */
export function idealSleep(ageGroup: AgeGroup): number {
  return ageGroup === '20s' ? 8 : 7;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/**
 * 着席中のスコア
 * 睡眠不足 1時間 = 15点、90分座り続ける = 50点、休憩アクションの分だけ差し引く
 */
export function seatedScore(p: {
  sleepHours: number;
  ageGroup: AgeGroup;
  sittingMinutes: number;
  bonus: number;
}): number {
  const sleep = Number.isFinite(p.sleepHours) ? p.sleepHours : 0;
  const sleepDebt = Math.max(0, idealSleep(p.ageGroup) - sleep) * 15;
  const workLoad = (p.sittingMinutes / 90) * 50;
  return clamp(Math.round(sleepDebt + workLoad - p.bonus));
}

/** 離席中のスコア：席を立った時点のスコアから、1分ごとに 2点ずつ回復する */
export function awayScore(scoreAtLeave: number, awayMinutes: number, bonus: number): number {
  return clamp(Math.round(scoreAtLeave - awayMinutes * 2 - bonus));
}

/** 高温多湿（28℃以上かつ 65%以上） */
export function isHotHumid(temp: number, humi: number): boolean {
  return temp >= 28 && humi >= 65;
}
