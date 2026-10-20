// Firebase（Firestore）からの受信。環境変数が無いときは使わない

export function firebaseEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

type PresenceHandler = (present: boolean, changedAt: number) => void;
type EnvHandler = (temp: number, humi: number) => void;

/**
 * ラズパイが書き込む 2 つのドキュメントを監視する
 * - DeviceStatus/current_status { is_present: 0 | 1, timestamp }
 * - Environment/latest          { temp, humi }
 * 戻り値は監視をやめる関数
 */
export async function subscribeFirebase(
  onPresence: PresenceHandler,
  onEnv: EnvHandler
): Promise<() => void> {
  const { initializeApp, getApps } = await import('firebase/app');
  const { getFirestore, doc, onSnapshot } = await import('firebase/firestore');

  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  const db = getFirestore(app);

  const stopPresence = onSnapshot(doc(db, 'DeviceStatus', 'current_status'), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const ts = data.timestamp && typeof data.timestamp.toMillis === 'function'
      ? data.timestamp.toMillis()
      : Date.now();
    onPresence(data.is_present === 1, ts);
  });

  const stopEnv = onSnapshot(doc(db, 'Environment', 'latest'), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (typeof data.temp === 'number' && typeof data.humi === 'number') {
      onEnv(data.temp, data.humi);
    }
  });

  return () => {
    stopPresence();
    stopEnv();
  };
}
