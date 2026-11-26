import React from 'react';
import { StoredRecords } from '../game/types';

interface TitleOverlayProps {
  records: StoredRecords;
  muted: boolean;
  onStart: () => void;
  onToggleMute: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  records,
  muted,
  onStart,
  onToggleMute,
}) => {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col items-center justify-between px-4 py-3.5 sm:py-4 pointer-events-none"
      style={{
        background:
          'radial-gradient(circle at 50% 44%, rgba(7, 11, 26, 0.56) 0%, rgba(7, 11, 26, 0.18) 58%, rgba(7, 11, 26, 0.44) 100%)',
      }}
    >
      {/* Top-right single audio button */}
      <div className="w-full max-w-6xl flex justify-end pointer-events-none">
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={muted ? '开启音效' : '关闭音效'}
          className="pointer-events-auto h-10 w-10 sm:h-11 sm:w-11 rounded-xl border border-sky-200/25 bg-[#0D1633]/92 text-sky-100 hover:bg-[#172552] hover:border-sky-300/50 transition-colors flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400"
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
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>
      </div>

      {/* Center Hero Title Lockup seated cleanly in negative space between conveyor and cargo bays */}
      <main className="w-full max-w-lg flex flex-col items-center text-center pointer-events-auto px-5 py-4 sm:px-7 sm:py-5 -mt-6 sm:-mt-12 rounded-2xl bg-[#091128]/92 border border-sky-300/25 shadow-[0_20px_56px_rgba(2,5,18,0.85)]">
        {/* Bespoke inline SVG Title Emblem & Chinese Lockup */}
        <svg
          viewBox="0 0 420 106"
          className="w-full max-w-[300px] sm:max-w-[350px] h-auto"
          role="img"
          aria-label="星尘快递站"
        >
          <defs>
            <linearGradient id="crestGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF099" />
              <stop offset="55%" stopColor="#FFB703" />
              <stop offset="100%" stopColor="#F97316" />
            </linearGradient>
            <linearGradient id="crestCyan" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#2CEAA3" />
            </linearGradient>
          </defs>

          <ellipse
            cx="210"
            cy="28"
            rx="54"
            ry="13"
            fill="none"
            stroke="url(#crestCyan)"
            strokeWidth="2.5"
            opacity="0.82"
            transform="rotate(-10 210 28)"
          />
          <path
            d="M210 4 L216 18.5 L231.5 20 L219.5 30 L223 45 L210 37 L197 45 L200.5 30 L188.5 20 L204 18.5 Z"
            fill="url(#crestGold)"
            stroke="#070B1A"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <polygon points="136,28 143,21 150,28 143,35" fill="#FF4D6D" />
          <polygon points="274,22 283,22 288,29 283,36 274,36 269,29" fill="#00D9FF" />

          <text
            x="210"
            y="88"
            textAnchor="middle"
            fill="#F8FAFF"
            stroke="#060A18"
            strokeWidth="6"
            paintOrder="stroke fill"
            fontSize="44"
            fontWeight="900"
            letterSpacing="6"
            fontFamily="'Noto Sans SC', 'Outfit', sans-serif"
          >
            星尘快递站
          </text>
        </svg>

        <p className="mt-1 text-xs sm:text-sm text-sky-100/85 leading-relaxed [text-wrap:balance]">
          拖放发光星星包裹入对应货舱，三连以上自动打包升空
        </p>

        {/* Compact inline visual key for special parcels (unboxed, clean) */}
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-sky-200/85">
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
              <path d="M10 1.5l2.5 5.2 5.7.8-4.1 4 1 5.7L10 14.5l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="#FFB703" />
            </svg>
            四色异形入舱
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
              <polygon points="10,1 12.6,6.5 19,7.5 14.2,11.6 15.5,18 10,14.8 4.5,18 5.8,11.6 1,7.5 7.4,6.5" fill="#38BDF8" stroke="#FDE047" strokeWidth="1.5" />
            </svg>
            彩虹任意通用
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
              <circle cx="10" cy="10" r="7" fill="#0B0418" stroke="#E879F9" strokeWidth="2.4" />
            </svg>
            急点黑洞防吸货
          </span>
        </div>

        {/* LocalStorage Best Records (clean unboxed typographic metadata) */}
        {records.gamesPlayed > 0 && (
          <div className="mt-2.5 flex items-center justify-center gap-2 text-xs text-amber-200/95 font-num">
            <span>最高分 {records.bestScore}</span>
            <span aria-hidden="true" className="text-sky-400/50">·</span>
            <span>最高连击 x{records.bestMaxCombo}</span>
            <span aria-hidden="true" className="text-sky-400/50">·</span>
            <span>累计打包 {records.totalPackedAllTime}</span>
          </div>
        )}

        {/* Primary Start CTA */}
        <div className="mt-4 flex items-center justify-center">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="min-w-[196px] px-8 py-3 rounded-xl bg-[#FFB703] hover:bg-[#FFC933] active:scale-[0.98] text-[#090F24] font-bold text-base sm:text-lg tracking-wider shadow-[0_8px_28px_rgba(255,183,3,0.42)] transition-transform duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            开始分拣
          </button>
        </div>
      </main>

      {/* Single flat control hint line in bottom safe margin (below cargo bays) */}
      <p className="text-[11px] sm:text-xs text-sky-200/80 text-center hud-stroke max-w-2xl">
        拖放或点选包裹入舱 · 90秒三波加速 · 键盘 1-4 入舱 · 空格清黑洞 · P 暂停
      </p>
    </div>
  );
};
