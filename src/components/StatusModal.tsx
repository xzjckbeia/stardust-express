import React, { useState } from 'react';
import { formatShareText } from '../game/rules';
import { GamePhase, RunSummary, StoredRecords } from '../game/types';

interface StatusModalProps {
  phase: GamePhase;
  summary: RunSummary | null;
  records: StoredRecords;
  onResume: () => void;
  onRestart: () => void;
  onBackToTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  phase,
  summary,
  records,
  onResume,
  onRestart,
  onBackToTitle,
}) => {
  const [shareFeedback, setShareFeedback] = useState<'idle' | 'copied' | 'shared' | 'preview'>('idle');
  const [shareTextPreview, setShareTextPreview] = useState<string>('');

  if (phase !== 'paused' && phase !== 'gameover') return null;

  const handleShare = async () => {
    if (!summary) return;
    const text = formatShareText(summary, records);
    setShareTextPreview(text);

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: '星尘快递站 · 分拣战报',
          text,
        });
        setShareFeedback('shared');
        return;
      }
    } catch {
      // Fall back to clipboard
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareFeedback('copied');
        return;
      }
    } catch {
      // Clipboard blocked in restricted iframe
    }

    setShareFeedback('preview');
  };

  if (phase === 'paused') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="游戏已暂停"
        className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050816]/76"
      >
        <div className="animate-modal-enter w-full max-w-sm rounded-2xl bg-[#0D1633] border border-sky-300/25 p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.75)]">
          <h2 className="text-2xl font-black text-white tracking-wide">已暂停</h2>
          <p className="mt-1.5 text-sm text-sky-200/75">传送带已临时制动，随时继续分拣</p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 rounded-xl bg-[#FFB703] hover:bg-[#FFC933] text-[#090F24] font-bold text-base cursor-pointer transition-colors whitespace-nowrap"
            >
              继续分拣
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-3 rounded-xl bg-[#182754] hover:bg-[#223670] text-sky-50 font-semibold text-base border border-sky-300/20 cursor-pointer transition-colors whitespace-nowrap"
            >
              重新开始
            </button>
            <button
              type="button"
              onClick={onBackToTitle}
              className="w-full py-2.5 rounded-xl text-sky-300/85 hover:text-white hover:bg-white/5 font-medium text-sm cursor-pointer transition-colors whitespace-nowrap"
            >
              返回主界面
            </button>
          </div>
        </div>
      </div>
    );
  }

  const safeSummary: RunSummary = summary ?? {
    score: 0,
    maxCombo: 0,
    packedCount: 0,
    packedParcels: 0,
    blackholesCleared: 0,
    isNewBestScore: false,
    isNewBestCombo: false,
    rankTitle: '星港见习员',
    rankSubtitle: '熟悉传送带节奏，下局一定更高分',
    nextRank: { nextTitle: '星际快递员', nextThreshold: 1200, pointsNeeded: 1200 },
    missionCompleted: false,
    missionLabel: '',
    vipCompletedCount: 0,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="本局分拣结算"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050816]/80"
    >
      <div className="animate-modal-enter w-full max-w-md rounded-2xl bg-[#0C1532] border border-sky-300/28 p-6 sm:p-7 shadow-[0_28px_72px_rgba(0,0,0,0.82)]">
        <div className="text-center">
          <div className="text-xs font-bold text-amber-300 tracking-wider">90秒分拣结算</div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-black text-white">
            {safeSummary.rankTitle}
          </h2>
          <p className="mt-1 text-sm text-sky-200/75">{safeSummary.rankSubtitle}</p>

          {/* Points remaining to next courier rank */}
          <p className="mt-2 text-xs sm:text-sm font-num text-amber-200/95">
            {safeSummary.nextRank
              ? `距离下一称号「${safeSummary.nextRank.nextTitle}」还差 ${safeSummary.nextRank.pointsNeeded} 分`
              : '已达成最高称号「银河特快传奇」！'}
          </p>
        </div>

        {/* 3 Clean Tabular Stat Tiles */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className="rounded-xl bg-[#13204A] border border-sky-300/15 p-3 text-center">
            <div className="text-xs text-sky-300/75">本局得分</div>
            <div className="mt-1 font-num font-extrabold text-xl sm:text-2xl text-[#FFD166]">
              {safeSummary.score}
            </div>
            <div className="mt-1 text-[11px] font-num text-sky-200/70">
              {safeSummary.isNewBestScore ? '刷新最高!' : `最高 ${records.bestScore}`}
            </div>
          </div>

          <div className="rounded-xl bg-[#13204A] border border-sky-300/15 p-3 text-center">
            <div className="text-xs text-sky-300/75">最高连击</div>
            <div className="mt-1 font-num font-extrabold text-xl sm:text-2xl text-[#7DF0FF]">
              x{safeSummary.maxCombo}
            </div>
            <div className="mt-1 text-[11px] font-num text-sky-200/70">
              {safeSummary.isNewBestCombo ? '连击新高!' : `纪录 x${records.bestMaxCombo}`}
            </div>
          </div>

          <div className="rounded-xl bg-[#13204A] border border-sky-300/15 p-3 text-center">
            <div className="text-xs text-sky-300/75">打包总数</div>
            <div className="mt-1 font-num font-extrabold text-xl sm:text-2xl text-[#6BFFB8]">
              {safeSummary.packedCount}
            </div>
            <div className="mt-1 text-[11px] font-num text-sky-200/70">
              累计 {records.totalPackedAllTime} 批
            </div>
          </div>
        </div>

        {/* Quiet unboxed breakdown line */}
        <div className="mt-3 text-center text-xs text-sky-200/80 font-num">
          发出包裹 {safeSummary.packedParcels} 件 · 清除黑洞 {safeSummary.blackholesCleared} 个
          {safeSummary.vipCompletedCount > 0 ? ` · VIP急单 ${safeSummary.vipCompletedCount} 次` : ''}
          {safeSummary.missionLabel
            ? ` · ${safeSummary.missionCompleted ? '本局任务已达成' : '本局任务未完成'}`
            : ''}
        </div>

        {/* Share feedback / copyable battle report */}
        {shareFeedback !== 'idle' && (
          <div className="mt-4 rounded-xl bg-[#080F24] border border-emerald-400/35 p-3 text-left">
            <div className="text-xs font-bold text-emerald-300 mb-1.5">
              {shareFeedback === 'copied'
                ? '战绩已复制到剪贴板，快发给好友吧'
                : shareFeedback === 'shared'
                  ? '已调起系统分享战绩'
                  : '长按或全选复制以下战绩分享给好友'}
            </div>
            <pre className="text-xs text-sky-100/90 whitespace-pre-wrap font-sans leading-relaxed select-text">
              {shareTextPreview}
            </pre>
          </div>
        )}

        {/* Instant Restart & Share Actions */}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={() => {
              setShareFeedback('idle');
              onRestart();
            }}
            className="w-full py-3.5 rounded-xl bg-[#FFB703] hover:bg-[#FFC933] active:scale-[0.98] text-[#090F24] font-bold text-lg tracking-wide shadow-[0_8px_24px_rgba(255,183,3,0.35)] transition-transform duration-150 cursor-pointer whitespace-nowrap"
          >
            再来一局
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleShare}
              className="py-2.5 rounded-xl bg-[#182754] hover:bg-[#233773] text-sky-100 font-semibold text-sm border border-sky-300/20 transition-colors cursor-pointer whitespace-nowrap"
            >
              {shareFeedback === 'copied' ? '已复制战绩' : '分享战绩'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShareFeedback('idle');
                onBackToTitle();
              }}
              className="py-2.5 rounded-xl bg-transparent hover:bg-white/6 text-sky-200/85 font-medium text-sm border border-sky-300/15 transition-colors cursor-pointer whitespace-nowrap"
            >
              返回标题
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
