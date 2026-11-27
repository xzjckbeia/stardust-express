import React from 'react';
import { BAY_SPEC_MAP, HudSnapshot } from '../game/types';

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
  const comboHot = hud.combo >= 7 || hud.feverActive;
  const missionPct = hud.mission ? Math.min(1, hud.mission.current / Math.max(1, hud.mission.target)) : 0;

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between"
      data-testid="game-hud"
      data-score={hud.score}
      data-combo={hud.combo}
      data-packed={hud.packedCount}
      data-wave={hud.wave}
      data-time={secLeft}
      data-fever={hud.feverActive ? '1' : '0'}
      data-selected={hud.selectedParcelId ?? ''}
      data-muted={muted ? '1' : '0'}
    >
      {/* Top Perimeter HUD Stack */}
      <div className="w-full px-2.5 sm:px-6 pt-2 sm:pt-3 flex flex-col gap-1.5">
        {/* Row 1: Core Score / Timer / Utility Controls */}
        <div className="w-full flex items-start justify-between gap-2">
          {/* Left Cluster: Score, Combo (x10 Fever gauge), Packed */}
          <div className="flex items-baseline gap-2.5 sm:gap-5 px-2.5 sm:px-4 py-1.5 rounded-xl bg-[#091128]/88 border border-sky-300/18">
            <div className="flex flex-col">
              <span className="text-[10px] sm:text-xs text-sky-300/75 leading-none">得分</span>
              <span
                className="font-num font-extrabold text-lg sm:text-3xl text-[#FFF7D6] leading-tight hud-stroke"
                aria-label={`得分 ${hud.score}`}
              >
                {hud.score}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] sm:text-xs text-sky-300/75 leading-none">
                {hud.feverActive ? '狂热' : '连击'}
              </span>
              <span
                className={`font-num font-extrabold text-base sm:text-2xl leading-tight hud-stroke ${
                  hud.feverActive
                    ? 'text-[#FFE066]'
                    : comboHot
                      ? 'text-[#FFB703]'
                      : hud.combo >= 2
                        ? 'text-[#7DF0FF]'
                        : 'text-sky-200/75'
                }`}
                aria-label={`当前连击 ${hud.combo}`}
              >
                {hud.feverActive ? '×2' : `x${hud.combo}`}
              </span>
            </div>

            <div className="hidden sm:flex flex-col">
              <span className="text-[10px] sm:text-xs text-sky-300/75 leading-none">打包</span>
              <span
                className="font-num font-bold text-lg sm:text-2xl text-[#6BFFB8] leading-tight hud-stroke"
                aria-label={`打包数 ${hud.packedCount}`}
              >
                {hud.packedCount}
              </span>
            </div>
          </div>

          {/* Center Cluster: 90s Timer + Wave Speed Indicator */}
          <div className="flex flex-col items-center px-3 sm:px-5 py-1 rounded-xl bg-[#091128]/88 border border-sky-300/18 min-w-[106px] sm:min-w-[168px]">
            <div className="flex items-baseline gap-1">
              <span
                className={`font-num font-extrabold text-xl sm:text-3xl leading-none hud-stroke ${
                  isUrgentTime ? 'text-[#FF4D6D]' : 'text-white'
                }`}
                aria-label={`剩余时间 ${secLeft} 秒`}
              >
                {secLeft}
              </span>
              <span className="text-[11px] sm:text-xs text-sky-200/70">秒</span>
            </div>

            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] sm:text-xs text-sky-200/85 whitespace-nowrap">
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

          {/* Right Cluster: Sound Status Toggle + Pause + Restart */}
          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-pressed={!muted}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-label={muted ? '当前已静音，点击开启声音' : '当前声音已开启，点击静音'}
              title={muted ? '开启声音 (M)' : '静音 (M)'}
              className={`h-9 sm:h-11 px-2 sm:px-3 rounded-xl border transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                muted
                  ? 'border-rose-400/40 bg-[#24122B]/92 text-rose-200 hover:bg-[#33183C]'
                  : 'border-emerald-300/35 bg-[#091128]/92 text-emerald-200 hover:bg-[#172552]'
              }`}
            >
              {muted ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <line x1="22" y1="9" x2="16" y2="15" />
                  <line x1="16" y1="9" x2="22" y2="15" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
              <span className="hidden md:inline text-xs font-bold">
                {muted ? '已静音' : '音效开'}
              </span>
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
              className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl border border-sky-200/20 bg-[#091128]/90 text-sky-100 hover:bg-[#172552] hover:border-sky-300/45 transition-colors flex items-center justify-center cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor">
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
              className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl border border-sky-200/20 bg-[#091128]/90 text-sky-100 hover:bg-[#172552] hover:border-amber-300/50 transition-colors flex items-center justify-center cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Row 2: Compact Mission + Active VIP / Fever / Slow-Mo Strip (seated cleanly above belt) */}
        <div className="w-full flex flex-wrap items-center justify-center gap-2">
          {/* Per-Round Mission Progress */}
          {hud.mission && (
            <div
              className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-[11px] sm:text-xs ${
                hud.mission.completed
                  ? 'bg-[#0C2A24]/92 border-emerald-400/45 text-emerald-200'
                  : 'bg-[#091128]/88 border-sky-300/20 text-sky-100'
              }`}
              data-testid="mission-bar"
            >
              <span className="font-bold whitespace-nowrap">
                {hud.mission.completed ? '任务达成' : '任务'}
              </span>
              <span className="whitespace-nowrap">{hud.mission.label}</span>
              <span className="font-num font-bold text-amber-200">
                {hud.mission.current}/{hud.mission.target}
              </span>
              <div className="w-12 sm:w-16 h-1.5 rounded-full bg-white/12 overflow-hidden">
                <div
                  className="h-full rounded-full origin-left"
                  style={{
                    width: '100%',
                    transform: `scaleX(${Math.max(0.02, missionPct)})`,
                    backgroundColor: hud.mission.completed ? '#2CEAA3' : '#FFB703',
                  }}
                />
              </div>
            </div>
          )}

          {/* Active VIP Timed Order (3x Score) */}
          {hud.vipOrder && !hud.vipOrder.completed && (
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#2A1708]/94 border border-amber-400/60 text-[11px] sm:text-xs text-amber-100"
              data-testid="vip-order-bar"
            >
              <span className="font-black text-[#FFE066] whitespace-nowrap">VIP急单 ×3分</span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                {hud.vipOrder.requirements.map((req) => {
                  const spec = BAY_SPEC_MAP[req.color];
                  const done = req.done >= req.needed;
                  return (
                    <span
                      key={req.color}
                      className={`font-bold ${done ? 'line-through opacity-55' : ''}`}
                      style={{ color: done ? '#94A3B8' : spec.bright }}
                    >
                      1组{spec.shortLabel}
                    </span>
                  );
                })}
              </span>
              <span className="font-num font-bold text-white">
                {Math.ceil(hud.vipOrder.timeLeft)}s
              </span>
              <div className="w-10 sm:w-14 h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full origin-left bg-[#FFB703]"
                  style={{
                    width: '100%',
                    transform: `scaleX(${Math.max(0.02, hud.vipOrder.timeLeft / Math.max(1, hud.vipOrder.duration))})`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Active Slow-Mo Timer */}
          {hud.slowmoTimeLeft > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#082640]/92 border border-sky-300/55 text-[11px] sm:text-xs text-sky-100 font-bold">
              <span>时空减速</span>
              <span className="font-num text-[#7DD3FC]">{hud.slowmoTimeLeft.toFixed(1)}s</span>
            </div>
          )}
        </div>
      </div>

      {/* Fever Mode Banner + Countdown Bar (seated in open air between conveyor and cargo bays) */}
      {hud.feverActive && (
        <div
          className="fixed left-1/2 top-[34%] sm:top-[35%] -translate-x-1/2 z-20 pointer-events-none px-4 sm:px-6 py-2 rounded-xl bg-[#2A1905]/94 border-2 border-[#FFE066] shadow-[0_10px_32px_rgba(255,183,3,0.45)] text-center min-w-[240px] sm:min-w-[320px]"
          data-testid="fever-banner"
        >
          <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-black text-[#FFE066] tracking-wider">
            <span>FEVER 狂热模式</span>
            <span className="text-white">得分 ×2 · 轻点秒入舱</span>
            <span className="font-num text-white">{hud.feverTimeLeft.toFixed(1)}s</span>
          </div>
          <div className="mt-1.5 w-full h-1.5 rounded-full bg-white/18 overflow-hidden">
            <div
              className="h-full rounded-full origin-left bg-[#FFE066]"
              style={{
                width: '100%',
                transform: `scaleX(${Math.max(0.02, hud.feverTimeLeft / Math.max(1, hud.feverDuration))})`,
              }}
            />
          </div>
        </div>
      )}

      {/* Wave-Up Callout Banner */}
      {waveBanner && (
        <div
          key={waveBanner.key}
          className="fixed left-1/2 top-[45%] z-20 animate-wave-pop pointer-events-none px-6 py-3 rounded-2xl bg-[#0D1838]/95 border border-amber-300/45 shadow-[0_12px_36px_rgba(0,0,0,0.65)] text-center"
        >
          <div className="text-xs text-amber-300 font-bold tracking-wider">
            第 {waveBanner.wave} 波 · 速度提升至 {waveBanner.speedTier}
          </div>
          <div className="text-xl sm:text-2xl font-black text-white mt-0.5 hud-stroke">
            {waveBanner.name}
          </div>
        </div>
      )}

      {/* Bottom selection hint */}
      {hud.selectedParcelId !== null ? (
        <div className="mb-1.5 text-center text-xs text-amber-200/95 font-bold hud-stroke">
          已选中包裹，点击下方对应颜色货舱即可送入
        </div>
      ) : (
        <div />
      )}
    </div>
  );
};
