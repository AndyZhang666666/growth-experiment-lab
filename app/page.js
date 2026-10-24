"use client";
import { useState, useEffect } from "react";
import Designer from "@/components/Designer";
import Peeking from "@/components/Peeking";
import Reader from "@/components/Reader";
import Log from "@/components/Log";

const TABS = [
  { key: "design", label: "实验设计器", sub: "跑之前：要多少样本" },
  { key: "peek", label: "偷看惩罚模拟器", sub: "跑中间：能不能提前停" },
  { key: "read", label: "结果解读器", sub: "跑完：值不值得全量" },
  { key: "log", label: "实验记录", sub: "台账长什么样" },
];

export default function Home() {
  const [tab, setTab] = useState("design");
  useEffect(() => {
    const read = () => {
      const id = location.hash.slice(1);
      setTab(TABS.some((t) => t.key === id) ? id : "design");
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  const go = (id) => {
    setTab(id);
    history.replaceState(null, "", "#" + id);
  };

  return (
    <main className="wrap">
      <header className="top">
        <a className="back" href="https://andyzhang666666.github.io/#projects">
          ← Andy 的作品
        </a>
        <h1>Growth Experiment Lab</h1>
        <p>
          把实验设计、停止规则和上线判断分开。显著是证据，不是自动全量的指令。
        </p>
        <div className="meta">
          本地计算，不上传数据 · 示例与模拟均为合成数据 ·
          设计计划和决策记录可导出
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? "on" : ""}`}
              aria-pressed={tab === t.key}
              onClick={() => go(t.key)}
            >
              <span className="tab-l">{t.label}</span>
              <span className="tab-s">{t.sub}</span>
            </button>
          ))}
        </nav>
      </header>

      {tab === "design" && <Designer />}
      {tab === "peek" && <Peeking />}
      {tab === "read" && <Reader />}
      {tab === "log" && <Log />}

      <footer className="foot">
        <p>
          模型假设与上线核对分开说明。
          <a href="https://github.com/AndyZhang666666/growth-experiment-lab/blob/main/docs/DECISIONS.md">
            查看方法与取舍
          </a>{" "}
          ·{" "}
          <a href="https://github.com/AndyZhang666666/growth-experiment-lab/blob/main/docs/VALIDATION.md">
            查看验证记录
          </a>
          。所有示例为合成数据。
        </p>
      </footer>
    </main>
  );
}
