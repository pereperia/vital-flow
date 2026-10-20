// 計算部分の確認：node --experimental-strip-types scripts/logic.test.ts
import assert from 'node:assert/strict';
import { seatedScore, awayScore, isHotHumid, idealSleep } from '../lib/fatigue.ts';
import { generateHistory, toLocalDateString } from '../lib/history.ts';

// 睡眠が足りていて、座り始めなら 0
assert.equal(seatedScore({ sleepHours: 8, ageGroup: '20s', sittingMinutes: 0, bonus: 0 }), 0);
// 20代で 7時間睡眠（1時間不足 = 15点）＋ 90分着席（50点）= 65
assert.equal(seatedScore({ sleepHours: 7, ageGroup: '20s', sittingMinutes: 90, bonus: 0 }), 65);
// 30代以上は理想 7時間なので、同じ条件で 50
assert.equal(seatedScore({ sleepHours: 7, ageGroup: '30s+', sittingMinutes: 90, bonus: 0 }), 50);
// 休憩アクションで差し引き
assert.equal(seatedScore({ sleepHours: 7, ageGroup: '20s', sittingMinutes: 90, bonus: 20 }), 45);
// 上限 100・下限 0
assert.equal(seatedScore({ sleepHours: 3, ageGroup: '20s', sittingMinutes: 300, bonus: 0 }), 100);
assert.equal(seatedScore({ sleepHours: 8, ageGroup: '20s', sittingMinutes: 0, bonus: 50 }), 0);
// 睡眠の入力が空でも NaN にならない
assert.equal(Number.isNaN(seatedScore({ sleepHours: NaN, ageGroup: '20s', sittingMinutes: 0, bonus: 0 })), false);
// 離席中は 1分 2点ずつ回復
assert.equal(awayScore(80, 10, 0), 60);
assert.equal(awayScore(10, 30, 0), 0);
// 高温多湿
assert.equal(isHotHumid(28, 65), true);
assert.equal(isHotHumid(27.9, 80), false);
assert.equal(idealSleep('20s'), 8);

// 履歴：日付が連続し、最終日が今日（現地時刻）
const end = new Date(2026, 9, 20);
const h = generateHistory(end, 365);
assert.equal(h.length, 365);
assert.equal(h[h.length - 1].date, '2026-10-20');
assert.equal(h[h.length - 1].label, '10/20');
assert.equal(toLocalDateString(new Date(2026, 0, 1)), '2026-01-01');
// 同じ種なら同じデータ
assert.deepEqual(generateHistory(end, 30), generateHistory(end, 30));

console.log('logic tests: all passed');
