'use client';
import { useState } from 'react';
import Designer from '@/components/Designer';
import Peeking from '@/components/Peeking';
import Reader from '@/components/Reader';
import Log from '@/components/Log';

const TABS = [
  { key: 'design', label: '实验设计器', sub: '跑之前：要多少样本' },
  { key: 'peek', label: '偷看惩罚模拟器', sub: '跑中间：能不能提前停' },
  { key: 'read', label: '结果解读器', sub: '跑完：值不值得全量' },
  { key: 'log', label: '实验记录', sub: '台账长什么样' },
];

export default function Home() {
  const [tab, setTab] = useState('design');

  return (
    <main className="wrap">
      <header className="top">
        <h1>Growth Experiment Lab</h1>
        <p>A/B 实验的决策模拟器 —— 不是算个 p 值就完，而是把增长 PM 每天要做的三个判断做成能上手操作的工具。</p>
        <div className="meta">
          全部计算在浏览器本地完成，不上传任何数据 ·
          统计逻辑见 <code>lib/stats.js</code>，校验产物见 <code>results/</code>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key}
              className={`tab ${tab === t.key ? 'on' : ''}`}
              onClick={() => setTab(t.key)}>
              <span className="tab-l">{t.label}</span>
              <span className="tab-s">{t.sub}</span>
            </button>
          ))}
        </nav>
      </header>

      {tab === 'design' && <Designer />}
      {tab === 'peek' && <Peeking />}
      {tab === 'read' && <Reader />}
      {tab === 'log' && <Log />}

      <footer className="foot">
        <p>
          样本量与检验公式、置信区间方法的选择理由写在 <code>docs/DECISIONS.md</code>；
          模拟用的随机种子在 <code>results/</code> 的产物里，同一个种子跑出来的数字完全一致。
        </p>
      </footer>
    </main>
  );
}
