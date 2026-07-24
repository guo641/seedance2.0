'use client';
import { useState } from 'react';
import { parseSegments, extractDialogue } from '@/lib/storyboard';

function CopyBtn({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-ghost py-1 text-xs whitespace-nowrap"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // 某些环境 clipboard 不可用,兜底用 execCommand
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? '已复制 ✓' : label}
    </button>
  );
}

export default function StoryboardView({ text }: { text: string }) {
  const segments = parseSegments(text);
  const dialogueCount = segments.filter((s) => extractDialogue(s)).length;

  function download() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '分镜提示词.txt';
    a.click();
  }

  const hasSheet = segments.some((s) => /^\s*【?(统一设定|人物设定)】?/.test(s));
  const segCount = segments.length - (hasSheet ? 1 : 0);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="tag">共 {segCount} 段</span>
        {hasSheet && <span className="tag">👤 含统一设定</span>}
        <span className="tag">{dialogueCount > 0 ? `识别到台词 ${dialogueCount} 段` : '未识别到台词'}</span>
        <div className="ml-auto flex gap-2">
          <CopyBtn text={text} label="一键复制全部" />
          <button className="btn-ghost py-1 text-xs" onClick={download}>
            下载 TXT
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[62vh] overflow-auto pr-1">
        {(() => {
          let segNo = 0;
          return segments.map((seg, i) => {
            const isSheet = /^\s*(【?(统一设定|人物设定)】?)/.test(seg);
            if (!isSheet) segNo += 1;
            return (
              <div key={i} className={`card p-3 ${isSheet ? 'bg-accent/10 border-accent/40' : 'bg-ink/40'}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs text-accent2 font-medium">{isSheet ? '👤 统一设定（人物·场景·道具,全片一致）' : `第 ${segNo} 段`}</span>
                  <CopyBtn text={seg} label="复制本段" />
                </div>
                <SegmentBody text={seg} />
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

const FIELD_LABELS = ['时间', '场景', '角色', '人物', '道具', '时间线', '画面', '镜头', '解说', '台词', '配音', '音效', '梗概', '标签', '标题'];

/** 把一段分镜按行渲染:字段标签加粗高亮,角色/时间线子行缩进,更清爽。 */
function SegmentBody({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trimEnd());
  return (
    <div className="text-sm leading-relaxed space-y-0.5">
      {lines.map((line, idx) => {
        const t = line.trim();
        if (!t || /^第\s*\d+\s*段$/.test(t) || /^镜头\s*\d+$/.test(t) || /^【?(统一设定|人物设定)】?$/.test(t)) return null; // 段号/镜头号/设定标题已在上方显示
        // 子行:角色的 "· xxx" 或 时间线的 "[0-3s] xxx"
        if (/^[·•\-]\s/.test(t) || /^\[\d/.test(t)) {
          const beat = t.match(/^(\[[^\]]+\])\s*([\s\S]*)$/);
          return (
            <div key={idx} className="pl-4 text-gray-200">
              {beat ? (
                <>
                  <span className="text-accent2 font-medium">{beat[1]}</span> {beat[2]}
                </>
              ) : (
                t
              )}
            </div>
          );
        }
        // 字段行:"标签：值"
        const m = t.match(/^([^：:]{1,6})[：:]\s*([\s\S]*)$/);
        if (m && FIELD_LABELS.includes(m[1])) {
          return (
            <div key={idx}>
              <span className="text-accent font-semibold">{m[1]}</span>
              <span className="text-gray-400">：</span>
              <span className="text-gray-100">{m[2]}</span>
            </div>
          );
        }
        return (
          <div key={idx} className="text-gray-100">
            {t}
          </div>
        );
      })}
    </div>
  );
}
