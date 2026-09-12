import './globals.css';

export const metadata = {
  title: 'Growth Experiment Lab',
  description: 'A/B 实验的决策模拟器：样本量够不够、什么时候能停、这个提升值不值得全量',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
