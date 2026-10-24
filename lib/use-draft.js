"use client";
import { useEffect, useState } from "react";
import { decodeDraft } from "./workflow";
export function useDraft(scope, defaults) {
  const [values, setValues] = useState(defaults),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("输入仅保存在当前浏览器，不上传。");
  const key = "growth-lab:" + scope + ":v1";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key),
        v = decodeDraft(raw, defaults);
      if (v) {
        setValues(v);
        setStatus("已恢复本机输入；上线核对需重新确认。");
      } else if (raw) {
        localStorage.removeItem(key);
        setStatus("旧草稿无法恢复，已使用示例输入。");
      }
    } catch {
      setStatus("本地存储不可用，仍可计算和导出。");
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, values }));
    } catch {
      setStatus("草稿保存失败，当前输入仍可使用。");
    }
  }, [key, ready, values]);
  return {
    values,
    set: (k, v) => setValues((p) => ({ ...p, [k]: v })),
    reset: () => {
      setValues({ ...defaults });
      setStatus("已恢复合成示例输入。");
    },
    status,
  };
}
