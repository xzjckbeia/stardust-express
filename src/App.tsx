/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { HudOverlay } from './components/HudOverlay';
import { StatusModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import { StardustEngine } from './game/engine';
import {
  ROUND_DURATION_SECONDS,
  loadRecords,
  mergeAndSaveRecords,
} from './game/rules';
import { SoundEngine } from './game/sound';
import { GamePhase, HudSnapshot, RunSummary, StoredRecords } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  score: 0,
  combo: 0,
  maxCombo: 0,
  packedCount: 0,
  packedParcels: 0,
  blackholesCleared: 0,
  timeLeft: ROUND_DURATION_SECONDS,
  duration: ROUND_DURATION_SECONDS,
  wave: 1,
  waveName: '星港起航',
  waveSpeedTier: '1档',
  waveProgress: 0,
  selectedParcelId: null,
};

function readUrlOptions(): { autostart: boolean; customDuration?: number } {
  if (typeof window === 'undefined') return { autostart: false };
  const params = new URLSearchParams(window.location.search);
  const autostart = params.get('autostart') === '1';
  const rawDur = Number(params.get('duration'));
  const customDuration = Number.isFinite(rawDur) && rawDur >= 5 && rawDur <= 180 ? rawDur : undefined;
  return { autostart, customDuration };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<StardustEngine | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const bannerTimerRef = useRef<number | null>(null);

  const [records, setRecords] = useState<StoredRecords>(() => loadRecords());
  const recordsRef = useRef<StoredRecords>(records);
  recordsRef.current = records;

  const [muted, setMuted] = useState<boolean>(() => {
    const s = new SoundEngine();
    soundRef.current = s;
    return s.isMuted();
  });

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [phase, setPhase] = useState<GamePhase>('title');
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [waveBanner, setWaveBanner] = useState<{
    wave: number;
    name: string;
    speedTier: string;
    key: number;
  } | null>(null);

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;

  const syncBodyState = useCallback((next: GamePhase) => {
    document.body.dataset.state = next;
    setPhase(next);
  }, []);

  const showWaveBanner = useCallback((wave: number, name: string, speedTier: string) => {
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current);
    }
    setWaveBanner({ wave, name, speedTier, key: Date.now() });
    bannerTimerRef.current = window.setTimeout(() => {
      setWaveBanner(null);
      bannerTimerRef.current = null;
    }, 2200);
  }, []);

  const handleStartOrRestart = useCallback(() => {
    const opts = readUrlOptions();
    setSummary(null);
    setWaveBanner(null);
    syncBodyState('playing');
    engineRef.current?.startGame(opts.customDuration);
  }, [syncBodyState]);

  const handlePause = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    engineRef.current?.setPhase('paused');
    syncBodyState('paused');
  }, [syncBodyState]);

  const handleResume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    engineRef.current?.setPhase('playing');
    syncBodyState('playing');
  }, [syncBodyState]);

  const handleBackToTitle = useCallback(() => {
    setSummary(null);
    setWaveBanner(null);
    engineRef.current?.setPhase('title');
    syncBodyState('title');
  }, [syncBodyState]);

  const handleToggleMute = useCallback(() => {
    const sound = soundRef.current;
    if (!sound) return;
    const next = sound.toggleMute();
    setMuted(next);
  }, []);

  // Mount isolated 60fps Canvas Engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!soundRef.current) {
      soundRef.current = new SoundEngine();
    }

    const engine = new StardustEngine(canvas, soundRef.current, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onWaveChange: (wave, waveName, speedTier) => {
        showWaveBanner(wave, waveName, speedTier);
      },
      onRoundComplete: (stats) => {
        const { records: nextRecords, summary: nextSummary } = mergeAndSaveRecords(
          recordsRef.current,
          stats
        );
        setRecords(nextRecords);
        setSummary(nextSummary);
        syncBodyState('gameover');
      },
    });

    engineRef.current = engine;

    const opts = readUrlOptions();
    if (opts.autostart) {
      syncBodyState('playing');
      engine.startGame(opts.customDuration);
    } else {
      syncBodyState('title');
    }

    return () => {
      if (bannerTimerRef.current !== null) {
        window.clearTimeout(bannerTimerRef.current);
      }
      engine.destroy();
      engineRef.current = null;
    };
  }, [showWaveBanner, syncBodyState]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const current = phaseRef.current;

      if (current === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartOrRestart();
        }
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (current === 'playing') {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          handlePause();
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          handleStartOrRestart();
        } else if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
          e.preventDefault();
          engineRef.current?.routeByHotkey(Number(e.key) - 1);
        } else if (e.key === ' ') {
          e.preventDefault();
          engineRef.current?.zapNearestBlackHoleByHotkey();
        }
      } else if (current === 'paused') {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P' || e.key === 'Enter') {
          e.preventDefault();
          handleResume();
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          handleStartOrRestart();
        }
      } else if (current === 'gameover') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartOrRestart();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePause, handleResume, handleStartOrRestart, handleToggleMute]);

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-[#070B1A] select-none">
      {/* Isolated Canvas mount container */}
      <div className="absolute inset-0 w-full h-full touch-none">
        <canvas
          ref={canvasRef}
          data-testid="stardust-canvas"
          className="block w-full h-full touch-none cursor-grab active:cursor-grabbing"
        />
      </div>

      {/* Title Screen */}
      {phase === 'title' && (
        <TitleOverlay
          records={records}
          muted={muted}
          onStart={handleStartOrRestart}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Active HUD */}
      {phase !== 'title' && (
        <HudOverlay
          hud={hud}
          muted={muted}
          waveBanner={waveBanner}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
          onRestart={handleStartOrRestart}
        />
      )}

      {/* Pause & Results Modals */}
      <StatusModal
        phase={phase}
        summary={summary}
        records={records}
        onResume={handleResume}
        onRestart={handleStartOrRestart}
        onBackToTitle={handleBackToTitle}
      />
    </div>
  );
}
