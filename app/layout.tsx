import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VITAL FLOW',
  description: '着席時間と睡眠から疲労度を出し、休憩をうながすダッシュボード',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
