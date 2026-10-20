'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Brain,
  Calendar as CalendarIcon,
  Coffee,
  Droplets,
  HeartPulse,
  History,
  Moon,
  PersonStanding,
  Thermometer,
  Timer,
  UserCheck,
  Zap,
} from 'lucide-react';
import {
  AgeGroup,
  FATIGUE_ALERT,
  awayScore,
  isHotHumid,
  seatedScore,
} from '@/lib/fatigue';
import { DayRecord, generateHistory, toLocalDateString } from '@/lib/history';
import { firebaseEnabled, subscribeFirebase } from '@/lib/firebaseSource';

type Env = { temp: number; humi: number };

const LIVE = firebaseEnabled();

export default function Dashboard() {
  // --- 着席状態（ラズパイ → Firebase、またはデモ操作で切り替わる） ---
  const [present, setPresent] = useState(false);
  const [since, setSince] = useState(0); // 今の状態になった時刻（ms）
  const [now, setNow] = useState(0); // 0 = まだ画面が表示されていない
  const [env, setEnv] = useState<Env | null>(null);

  // --- 操作モード ---
  const [manual, setManual] = useState(!LIVE); // センサーの代わりにボタンで操作
  const [speed, setSpeed] = useState<1 | 60>(LIVE ? 1 : 60); // 60 = 1秒を1分として進める

  // --- 入力 ---
  const [sleepHours, setSleepHours] = useState('7.0');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('20s');
  const [bonus, setBonus] = useState(0); // 水分補給・ストレッチで差し引く点
  const [scoreAtLeave, setScoreAtLeave] = useState(0);

  // --- 経過時間とスコア ---
  const elapsedMin = now && since ? Math.max(0, Math.floor(((now - since) * speed) / 60000)) : 0;
  const score = present
    ? seatedScore({
        sleepHours: parseFloat(sleepHours),
        ageGroup,
        sittingMinutes: elapsedMin,
        bonus,
      })
    : awayScore(scoreAtLeave, elapsedMin, bonus);

  const presentRef = useRef(present);
  const scoreRef = useRef(score);
  const manualRef = useRef(manual);
  scoreRef.current = score;
  manualRef.current = manual;

  /** 状態が「変わったとき」だけ開始時刻を更新する（同じ状態の再送ではリセットしない） */
  const applyPresence = useCallback((next: boolean, at: number) => {
    if (next === presentRef.current) return;
    if (!next) setScoreAtLeave(scoreRef.current);
    presentRef.current = next;
    setPresent(next);
    setSince(at);
    setBonus(0);
  }, []);

  // 時計
  useEffect(() => {
    const start = Date.now();
    setNow(start);
    setSince(start);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Firebase の監視（設定があるときだけ）
  useEffect(() => {
    if (!LIVE) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    subscribeFirebase(
      (isPresent, changedAt) => {
        if (!manualRef.current) applyPresence(isPresent, changedAt);
      },
      (temp, humi) => setEnv({ temp, humi })
    )
      .then((fn) => {
        if (cancelled) fn();
        else stop = fn;
      })
      .catch((e) => console.error('Firebase に接続できませんでした', e));
    return () => {
      cancelled = true;
      if (stop) stop();
    };
  }, [applyPresence]);

  // センサーが無いときの温湿度（ゆっくり揺らぐ見本値）
  useEffect(() => {
    if (LIVE) return;
    setEnv({ temp: 24.5, humi: 52 });
    const timer = setInterval(() => {
      setEnv((prev) => {
        if (!prev) return prev;
        const temp = Math.min(31, Math.max(20, prev.temp + (Math.random() - 0.5) * 0.4));
        const humi = Math.min(80, Math.max(35, prev.humi + (Math.random() - 0.5) * 2));
        return { temp: Number(temp.toFixed(1)), humi: Math.round(humi) };
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // --- 履歴グラフ ---
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const today = new Date();
    setHistory(generateHistory(today));
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    setStartDate(toLocalDateString(from));
    setEndDate(toLocalDateString(today));
  }, []);

  const filtered = useMemo(
    () => history.filter((d) => d.date >= startDate && d.date <= endDate),
    [history, startDate, endDate]
  );
  const average = filtered.length
    ? (filtered.reduce((sum, d) => sum + d.workHours, 0) / filtered.length).toFixed(1)
    : '0.0';

  // --- 警告 ---
  const fatigueAlert = present && score >= FATIGUE_ALERT;
  const envAlert = env !== null && isHotHumid(env.temp, env.humi);
  const ready = now !== 0;

  return (
    <div className="min-h-screen p-4 md:p-8">
      {/* ヘッダー */}
      <header className="mx-auto mb-8 flex max-w-7xl flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-800">
            <HeartPulse className="animate-pulse text-red-500" /> VITAL FLOW
            <span className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-600">
              {LIVE ? 'LIVE' : 'DEMO'}
            </span>
          </h1>
          <p className="mt-1 text-xs font-bold text-slate-400">
            着席時間と睡眠から疲労度を出し、休憩をうながすダッシュボード
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LIVE && (
            <button
              onClick={() => setManual((m) => !m)}
              className={`rounded-full px-5 py-2.5 text-xs font-bold transition-all ${
                manual
                  ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-200'
                  : 'border border-slate-200 bg-white text-slate-500'
              }`}
            >
              {manual ? '手動操作中' : 'センサー連動中'}
            </button>
          )}
          <button
            onClick={() => setSpeed((s) => (s === 60 ? 1 : 60))}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition-all ${
              speed === 60
                ? 'bg-slate-800 text-white shadow-lg'
                : 'border border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Zap size={14} /> {speed === 60 ? '60倍速（1秒＝1分）' : '実時間'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8">
        {/* 警告 */}
        {(fatigueAlert || envAlert) && (
          <div className="space-y-2" role="alert">
            {fatigueAlert && (
              <div className="flex items-center gap-3 rounded-2xl bg-red-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-red-200">
                <AlertTriangle size={20} /> 疲労スコアが {score}% です。席を立って休憩しましょう。
              </div>
            )}
            {envAlert && env && (
              <div className="flex items-center gap-3 rounded-2xl bg-orange-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-orange-200">
                <AlertTriangle size={20} /> 高温多湿です（{env.temp}℃ / {env.humi}%）。換気や水分補給を。
              </div>
            )}
          </div>
        )}

        {/* 上段 */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* 入力 */}
          <div className="space-y-6 lg:col-span-3">
            <div className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
              <label
                htmlFor="sleep"
                className="mb-3 block text-[11px] font-bold uppercase tracking-widest text-slate-400"
              >
                昨夜の睡眠（時間）
              </label>
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <Moon size={18} className="text-indigo-500" />
                <input
                  id="sleep"
                  type="number"
                  step="0.5"
                  min="0"
                  max="12"
                  value={sleepHours}
                  onChange={(e) => setSleepHours(e.target.value)}
                  className="w-full bg-transparent font-black text-slate-700 outline-none"
                />
              </div>
              <label
                htmlFor="age"
                className="mb-3 mt-5 block text-[11px] font-bold uppercase tracking-widest text-slate-400"
              >
                年代（理想の睡眠時間）
              </label>
              <select
                id="age"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                className="w-full rounded-2xl bg-slate-50 p-3 font-black text-slate-700 outline-none"
              >
                <option value="20s">20代（8時間）</option>
                <option value="30s+">30代以上（7時間）</option>
              </select>
            </div>
            <div className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                期間の平均着席時間
              </p>
              <p className="text-4xl font-black text-slate-800">
                {average}
                <span className="ml-1 text-sm font-medium italic text-slate-400">時間/日</span>
              </p>
            </div>
          </div>

          {/* 着席状態と疲労スコア */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:col-span-9">
            <div
              className={`rounded-[40px] border-4 p-8 transition-all duration-500 ${
                present
                  ? 'border-green-500 bg-white shadow-xl shadow-green-100'
                  : 'border-transparent bg-slate-100 shadow-inner'
              }`}
            >
              <div className="mb-6 flex items-center justify-between">
                <span
                  className={`rounded-full px-4 py-1 text-[11px] font-black ${
                    present ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {manual ? 'デモ操作' : 'センサー'}
                </span>
                <UserCheck size={24} className={present ? 'text-green-500' : 'text-slate-300'} />
              </div>

              <h2 className="mb-6 text-5xl font-black text-slate-800">
                {present ? '着席中' : '離席中'}
              </h2>

              {manual && (
                <div className="mb-4 flex rounded-xl bg-slate-200 p-1">
                  <button
                    onClick={() => applyPresence(true, Date.now())}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                      present ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    座る
                  </button>
                  <button
                    onClick={() => applyPresence(false, Date.now())}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                      !present ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    席を立つ
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3 text-3xl font-black text-slate-500">
                  <Timer size={28} />
                  {ready ? elapsedMin : '–'}
                  <span className="text-sm tracking-widest">分{present ? '着席' : '離席'}</span>
                </div>
                <div className="flex items-center gap-1 font-black text-blue-500">
                  <span className="text-xl">−{bonus}</span>
                  <span className="text-[11px]">休憩ボーナス</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setBonus((b) => b + 10)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-blue-500 bg-white py-4 text-xs font-black text-blue-600 transition-colors hover:bg-blue-50"
                >
                  <Coffee size={16} /> 水分補給 −10
                </button>
                <button
                  onClick={() => setBonus((b) => b + 20)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-indigo-500 bg-white py-4 text-xs font-black text-indigo-600 transition-colors hover:bg-indigo-50"
                >
                  <PersonStanding size={16} /> ストレッチ −20
                </button>
              </div>
            </div>

            <div className="relative flex flex-col justify-center rounded-[40px] bg-slate-900 p-8 text-white shadow-2xl">
              <Brain className="mb-4 text-blue-400" size={32} />
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-8xl font-black ${
                    score >= FATIGUE_ALERT ? 'text-red-500' : 'text-white'
                  }`}
                >
                  {ready ? score : '–'}
                </span>
                <span className="text-2xl font-bold text-slate-500">%</span>
              </div>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                疲労スコア（{FATIGUE_ALERT}% で休憩をうながす）
              </p>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                  className={`h-full transition-all duration-500 ${
                    score >= FATIGUE_ALERT ? 'bg-red-500' : 'bg-blue-400'
                  }`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 履歴グラフ */}
        <section className="rounded-[40px] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-black tracking-widest text-slate-400">
                <History size={18} /> 着席時間と室内環境の推移
              </h3>
              <p className="mt-1 text-[11px] text-slate-400">※ 見本データです（実機の記録ではありません）</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-full bg-slate-900 px-5 py-3 shadow-2xl">
              <CalendarIcon size={14} className="text-indigo-400" />
              <input
                type="date"
                aria-label="開始日"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="cursor-pointer bg-transparent text-xs font-black text-white outline-none [color-scheme:dark]"
              />
              <span className="font-bold text-slate-500">〜</span>
              <input
                type="date"
                aria-label="終了日"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="cursor-pointer bg-transparent text-xs font-black text-white outline-none [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="h-80 w-full md:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filtered}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                  minTickGap={20}
                />
                <YAxis yAxisId="left" hide />
                <YAxis yAxisId="right" hide />
                <Tooltip
                  contentStyle={{ borderRadius: 16, border: 'none', padding: 12 }}
                  itemStyle={{ fontSize: 11, fontWeight: 800 }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 900, paddingTop: 20 }} />
                <Bar
                  yAxisId="left"
                  dataKey="workHours"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                  name="着席時間（時間）"
                  maxBarSize={30}
                />
                <Line yAxisId="right" type="monotone" dataKey="temp" stroke="#f59e0b" strokeWidth={3} dot={false} name="室温（℃）" />
                <Line yAxisId="right" type="monotone" dataKey="humi" stroke="#3b82f6" strokeWidth={3} dot={false} name="湿度（%）" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 現在の環境 */}
        <div className="grid grid-cols-1 gap-8 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center justify-between rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="rounded-2xl bg-orange-100 p-4 text-orange-600">
              <Thermometer size={28} />
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold tracking-widest text-slate-400">室温</p>
              <p className="text-3xl font-black text-slate-800">{env ? `${env.temp}℃` : '–'}</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="rounded-2xl bg-blue-100 p-4 text-blue-600">
              <Droplets size={28} />
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold tracking-widest text-slate-400">湿度</p>
              <p className="text-3xl font-black text-slate-800">{env ? `${env.humi}%` : '–'}</p>
            </div>
          </div>
          {!LIVE && (
            <button
              onClick={() => setEnv({ temp: 29.2, humi: 70 })}
              className="rounded-[32px] border-2 border-dashed border-slate-200 p-6 text-left text-xs font-bold text-slate-400 transition-colors hover:border-orange-300 hover:text-orange-500 sm:col-span-2"
            >
              デモ：室内を高温多湿にする（警告の表示を確認できます）
            </button>
          )}
        </div>

        <footer className="pb-10 text-center text-[11px] text-slate-400">
          {LIVE
            ? 'ラズパイのセンサー → Firebase → この画面 の順にリアルタイムで反映しています。'
            : 'センサーなしで動くデモ版です。実機ではラズパイの人感センサーと AI カメラが着席を判定し、Firebase 経由でこの画面に反映します。'}
        </footer>
      </main>
    </div>
  );
}
