import React from 'react';
import { HudSnapshot } from '../game/types';

interface HudOverlayProps {
  hud: HudSnapshot;
  muted: boolean;
  waveBanner: { wave: number; name: string; speedTier: string; key: number } | null;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  muted,
  waveBanner,
  onToggleMute,
  onPause,
  onRestart,
}) => {
  const secLeft = Math.ceil(hud.timeLeft);
  const isUrgentTime = secLeft <= 10 && hud.phase === 'playing';
  const comboHot = hud.combo >= 6;

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between"
      data-testid="game-hud"
      data-score={hud.score}
      data-combo={hud.combo}
      data-packed={hud.packedCount}
      data-wave={hud.wave}
      data-time={secLeft}
    >
      {/* Top Perimeter HUD Bar */}
      <div className="w-full px-3 sm:px-6 pt-2.5 sm:pt-3.5 flex items-start justify-between gap-2">
        {/* Left Cluster: Score, Combo, Packed */}
        <div className="flex items-baseline gap-3 sm:gap-6 px-3 sm:px-4 py-1.5 rounded-xl bg-[#091128]/85 border border-sky-300/18">
          <div className="flex flex-col">
            <span className="text-[11px] sm:text-xs text-sky-300/75 leading-none">得分</span>
            <span
              className="font-num font-extrabold text-xl sm:text-3xl text-[#FFF7D6] leading-tight hud-stroke"
              aria-label={`得分 ${hud.score}`}
            >
              {hud.score}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[11px] sm:text-xs text-sky-300/75 leading-none">连击</span>
            <span
              className={`font-num font-extrabold text-lg sm:text-2xl leading-tight hud-stroke transition-transform duration-150 ${
                comboHot
                  ? 'text-[#FFB703] scale-105'
                  : hud.combo >= 2
                    ? 'text-[#7DF0FF]'
                    : 'text-sky-200/75'
              }`}
              aria-label={`当前连击 ${hud.combo}`}
            >
              x{hud.combo}
            </span>
          </div>

          <div className="hidden xs:flex sm:flex flex-col">
            <span className="text-[11px] sm:text-xs text-sky-300/75 leading-none">打包</span>
            <span
              className="font-num font-bold text-lg sm:text-2xl text-[#6BFFB8] leading-tight hud-stroke"
              aria-label={`打包数 ${hud.packedCount}`}
            >
              {hud.packedCount}
            </span>
          </div>
        </div>

        {/* Center Cluster: 90s Timer + Wave Speed Indicator */}
        <div className="flex flex-col items-center px-3.5 sm:px-5 py-1.5 rounded-xl bg-[#091128]/85 border border-sky-300/18 min-w-[118px] sm:min-w-[172px]">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-num font-extrabold text-2xl sm:text-3xl leading-none hud-stroke ${
                isUrgentTime ? 'text-[#FF4D6D]' : 'text-white'
              }`}
              aria-label={`剩余时间 ${secLeft} 秒`}
            >
              {secLeft}
            </span>
            <span className="text-xs text-sky-200/70">秒</span>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-[11px] sm:text-xs text-sky-200/85 whitespace-nowrap">
            <span>第 {hud.wave}/3 波</span>
            <span aria-hidden="true" className="text-sky-400/50">·</span>
            <span
              className={
                hud.wave === 3
                  ? 'text-[#FF758F] font-bold'
                  : hud.wave === 2
                    ? 'text-[#FFD166] font-bold'
                    : 'text-[#7DF0FF]'
              }
            >
              {hud.waveSpeedTier}
            </span>
          </div>

          {/* Wave progress bar */}
          <div className="mt-1 w-full h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full origin-left"
              style={{
                width: '100%',
                transform: `scaleX(${Math.max(0.03, Math.min(1, hud.waveProgress))})`,
                backgroundColor:
                  hud.wave === 3 ? '#FF4D6D' : hud.wave === 2 ? '#FFB703' : '#38BDF8',
              }}
            />
          </div>
        </div>

        {/* Right Cluster: Square SVG Utility Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? '开启音效' : '静音'}
            title={muted ? '开启音效 (M)' : '静音 (M)'}
            className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl border border-sky-200/20 bg-[#091128]/90 text-sky-100 hover:bg-[#172552] hover:border-sky-300/45 transition-colors flex items-center justify-center cursor-pointer"
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="暂停游戏"
            title="暂停 (P)"
            className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl border border-sky-200/20 bg-[#091128]/90 text-sky-100 hover:bg-[#172552] hover:border-sky-300/45 transition-colors flex items-center justify-center cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            aria-label="重新开始"
            title="重开 (R)"
            className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl border border-sky-200/20 bg-[#091128]/90 text-sky-100 hover:bg-[#172552] hover:border-amber-300/50 transition-colors flex items-center justify-center cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Wave-Up Callout Banner (transient, centered in clear air between belt and bays) */}
      {waveBanner && (
        <div
          key={waveBanner.key}
          className="fixed left-1/2 top-[44%] z-20 animate-wave-pop pointer-events-none px-6 py-3 rounded-2xl bg-[#0D1838]/95 border border-amber-300/45 shadow-[0_12px_36px_rgba(0,0,0,0.65)] text-center"
        >
          <div className="text-xs text-amber-300 font-bold tracking-wider">
            第 {waveBanner.wave} 波 · 速度提升至 {waveBanner.speedTier}
          </div>
          <div className="text-xl sm:text-2xl font-black text-white mt-0.5 hud-stroke">
            {waveBanner.name}
          </div>
        </div>
      )}

      {/* Subtle tap-selection helper when player taps a parcel instead of dragging */}
      {hud.selectedParcelId !== null && (
        <div className="mb-1 text-center text-xs text-amber-200/90 hud-stroke">
          已选中包裹，点击下方对应颜色货舱即可送入
        </div>
      )}
    </div>
  );
};
