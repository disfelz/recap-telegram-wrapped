import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './styles/reference.css';
import './styles/flagship.css';
import { Home, BarChart3, Sparkles, Settings } from 'lucide-react';
import type { RecapStats, ScanProgressPayload } from '../../shared/types';
import { recapApi } from './api/client';
import { DEMO_RECAP_BY_YEAR } from './data/demoData';
import { getTelegramWebApp, initTelegramMiniApp, haptic } from './utils/telegram';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ConnectScreen } from './screens/ConnectScreen';
import { ScanScreen } from './screens/ScanScreen';
import { StoriesScreen } from './screens/StoriesScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Screen = 'welcome' | 'connect' | 'scan' | 'stories' | 'analytics' | 'settings';

const DEMO_ALLOWED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const reduceMotion = useReducedMotion();
  const [demoMode, setDemoMode] = useState<boolean>(DEMO_ALLOWED && !import.meta.env.VITE_API_BASE_URL);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [timezone, setTimezone] = useState<string>('Europe/Moscow');
  const [hideChatNames, setHideChatNames] = useState<boolean>(true);
  const [liveRecaps, setLiveRecaps] = useState<Record<number, RecapStats>>({});
  const [resumeJobId, setResumeJobId] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const scanPoller = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoPoller = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (scanPoller.current) clearInterval(scanPoller.current); if (demoPoller.current) clearInterval(demoPoller.current); }, []);
  const [scanProgress, setScanProgress] = useState<ScanProgressPayload>({
    jobId: 'demo-job',
    year: 2026,
    status: 'quick_preview',
    stage: 'quick_preview',
    processedDialogs: 0,
    totalEligibleDialogs: 94,
    outgoingFound: 0,
    floodWaitUntil: null,
    errorMessage: null,
  });

  // The scanner runs server-side, independently of this Telegram WebView.
  // Reconnect to the user's latest job after reopening the Mini App.
  function startScanPolling(jobId: string) {
    if (scanPoller.current) clearInterval(scanPoller.current);
    scanPoller.current = setInterval(async () => {
      try {
        const { job } = await recapApi.getScanStatus(jobId);
        if (!job) return;
        setScanProgress(job);
        if (['completed', 'partial', 'failed', 'cancelled'].includes(job.status)) {
          if (scanPoller.current) clearInterval(scanPoller.current);
          scanPoller.current = null;
          if (job.status === 'completed' || job.status === 'partial') {
            haptic('success');
            const { results } = await recapApi.getSavedRecaps();
            const byYear: Record<number, RecapStats> = {};
            results.forEach((r) => { byYear[r.year] = r; });
            setLiveRecaps(byYear);
          }
        }
      } catch {
        // A temporary network error should not cancel the scan.
      }
    }, 2500);
  }

  useEffect(() => {
    initTelegramMiniApp();
    if (demoMode) return;
    let disposed = false;
    async function reconnect() {
      try {
        const [{ results }, { job }] = await Promise.all([
          recapApi.getSavedRecaps(),
          recapApi.getScanStatus(),
        ]);
        if (disposed) return;
        const byYear: Record<number, RecapStats> = {};
        results.forEach((r) => { byYear[r.year] = r; });
        setLiveRecaps(byYear);
        if (job && ['queued', 'auth_pending', 'quick_preview', 'scanning', 'paused_flood_wait'].includes(job.status)) {
          setSelectedYear(job.year);
          setScanProgress(job);
          setScreen('scan');
          startScanPolling(job.jobId);
        } else if (new URLSearchParams(window.location.search).get('screen') === 'stories') {
          const yearParam = Number(new URLSearchParams(window.location.search).get('year'));
          const ready = results.find((r) => r.year === yearParam) ??
            results.find((r) => r.completionStatus === 'completed') ?? results[0];
          if (ready) {
            setSelectedYear(ready.year);
            setScreen('stories');
          }
        }
      } catch {
        if (!disposed) {
          setAppError('Не удалось связаться с RECAP API. Проверь подключение и открой приложение через Telegram.');
        }
      }
    }
    void reconnect();
    return () => { disposed = true; };
  }, [demoMode]);

  const activeDataMap = demoMode ? DEMO_RECAP_BY_YEAR : liveRecaps;
  // Never substitute demo statistics for missing Live data.
  const currentStats: RecapStats | undefined = activeDataMap[selectedYear];
  const availableYears = [...new Set([2026, 2025, 2024, ...Object.keys(activeDataMap).map(Number)])].sort((a,b) => b-a);
  const toggleHideNames = () => {
    const value = !hideChatNames;
    setHideChatNames(value);
    if (!demoMode) void recapApi.updateSettings(timezone, value).catch(() => undefined);
  };

  useEffect(() => {
    const back = getTelegramWebApp()?.BackButton;
    if (!back) return;
    const goBack = () => {
      haptic('light');
      setScreen((current) => current === 'stories' ? 'analytics' : 'welcome');
    };
    if (screen === 'welcome') back.hide();
    else { back.show(); back.onClick(goBack); }
    return () => { back.offClick(goBack); };
  }, [screen]);

  const openResults = (target: 'stories' | 'analytics') => {
    if (!demoMode && !currentStats) {
      setAppError('За выбранный год ещё нет проверенной статистики. Сначала подключи аккаунт и запусти анализ.');
      setScreen('welcome');
    } else {
      setAppError(null);
      setScreen(target);
    }
  };

  const startDemoScanSimulation = () => {
    setScreen('scan');
    if (demoPoller.current) clearInterval(demoPoller.current);
    let dialogs = 0;
    let msgs = 0;
    let floodShown = false;
    const totalDialogs = 94;
    const targetMsgs = (DEMO_RECAP_BY_YEAR[selectedYear] || DEMO_RECAP_BY_YEAR[2026]).totalMessages;

    setScanProgress({
      jobId: 'demo-job',
      year: selectedYear,
      status: 'quick_preview',
      stage: 'quick_preview',
      processedDialogs: 0,
      totalEligibleDialogs: totalDialogs,
      outgoingFound: 0,
      floodWaitUntil: null,
      errorMessage: null,
    });

    demoPoller.current = setInterval(() => {
      if (!floodShown && dialogs >= 40 && dialogs < 48) {
        floodShown = true;
        setScanProgress((p) => ({
          ...p,
          status: 'paused_flood_wait',
          stage: 'full_scan',
          processedDialogs: dialogs,
          outgoingFound: msgs,
        }));
        return;
      }
      dialogs = Math.min(totalDialogs, dialogs + 8);
      msgs = Math.min(targetMsgs, Math.round((dialogs / totalDialogs) * targetMsgs));
      if (dialogs >= totalDialogs) {
        if (demoPoller.current) clearInterval(demoPoller.current);
        demoPoller.current = null;
        haptic('success');
        setScanProgress((p) => ({
          ...p,
          status: 'completed',
          stage: 'full_scan',
          processedDialogs: totalDialogs,
          outgoingFound: targetMsgs,
        }));
        return;
      }

      setScanProgress((p) => ({
        ...p,
        status: 'scanning',
        stage: 'full_scan',
        processedDialogs: dialogs,
        outgoingFound: msgs,
      }));
    }, 340);
  };

  const handleAuthorized = async (authId: string) => {
    setAppError(null);
    if (demoMode) {
      startDemoScanSimulation();
      return;
    }
    try {
      if (scanPoller.current) clearInterval(scanPoller.current);
      const { jobId } = resumeJobId
        ? await recapApi.resumeScan(resumeJobId, authId)
        : await recapApi.startScan(selectedYear, timezone, authId);
      setResumeJobId(null);
      setScanProgress({
        jobId,
        year: selectedYear,
        status: 'queued',
        stage: 'quick_preview',
        processedDialogs: 0,
        totalEligibleDialogs: 0,
        outgoingFound: 0,
        floodWaitUntil: null,
        errorMessage: null,
      });
      setScreen('scan');

      startScanPolling(jobId);
    } catch (error) {
      setAppError((error as Error).message || 'Не удалось начать анализ.');
      setScreen('connect');
    }
  };

  return (
    <div className="app-shell">
      <div className={`ambient-bg ambient-${screen}`}>
        <div className="ambient-orb one" />
        <div className="ambient-orb two" />
      </div>

      {appError && <div role="alert" className="card" style={{margin:16, borderColor:'rgba(255,209,122,.5)', fontSize:13}}>{appError}</div>}
      <AnimatePresence mode="wait" initial={false}>
      <motion.div key={screen}
        initial={reduceMotion ? { opacity: 0 } : screen === 'stories' ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
        animate={reduceMotion || screen === 'stories' ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion || screen === 'stories' ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.99 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.26, ease: 'easeOut' }}>
      {screen === 'welcome' && (
        <WelcomeScreen
          selectedYear={selectedYear}
          availableYears={availableYears}
          onSelectYear={setSelectedYear}
          onStartConnect={() => setScreen('connect')}
          hasSavedRecap={Boolean(currentStats)}
          onOpenSavedRecap={() => openResults('stories')}
          onOpenDemoStories={() => {
            setDemoMode(true);
            setScreen('stories');
          }}
          demoEnabled={DEMO_ALLOWED}
        />
      )}

      {screen === 'connect' && (
        <ConnectScreen
          demoMode={demoMode}
          onAuthorized={handleAuthorized}
          onBack={() => setScreen('welcome')}
        />
      )}

      {screen === 'scan' && (
        <ScanScreen
          progress={scanProgress}
          onCancel={async () => {
            if (demoMode) {
              if (demoPoller.current) clearInterval(demoPoller.current);
              demoPoller.current = null;
              setScanProgress((p) => ({ ...p, status: 'cancelled' }));
              return;
            }
            try {
              await recapApi.cancelScan(scanProgress.jobId);
              if (scanPoller.current) clearInterval(scanPoller.current);
              scanPoller.current = null;
              setScanProgress((p) => ({ ...p, status: 'cancelled' }));
            } catch (e) {
              setAppError((e as Error).message || 'Не удалось отменить сканирование.');
            }
          }}
          onResume={() => {
            if (demoMode) startDemoScanSimulation();
            else {
              setResumeJobId(scanProgress.jobId);
              setScreen('connect');
            }
          }}
          onOpenResults={() => openResults('stories')}
        />
      )}

      {screen === 'stories' && currentStats && (
        <StoriesScreen
          stats={currentStats}
          hideChatNames={hideChatNames}
          onToggleHideNames={toggleHideNames}
          onClose={() => openResults('analytics')}
        />
      )}

      {screen === 'analytics' && currentStats && (
        <AnalyticsScreen
          stats={currentStats}
          prevYearStats={activeDataMap[selectedYear - 1]}
          availableYears={availableYears}
          selectedYear={selectedYear}
          hideChatNames={hideChatNames}
          onToggleHideNames={toggleHideNames}
          onSelectYear={setSelectedYear}
          onOpenStories={() => openResults('stories')}
        />
      )}

      {!currentStats && !demoMode && (screen === 'stories' || screen === 'analytics') && (
        <div className="screen" role="status">
          <h2>Статистика ещё не готова</h2>
          <p>Для этого года нет результатов реального анализа. Демо-цифры не показываем.</p>
          <button className="btn btn-primary" onClick={() => setScreen('connect')}>Подключить аккаунт</button>
        </div>
      )}
      {screen === 'settings' && (
        <SettingsScreen
          timezone={timezone}
          hideChatNames={hideChatNames}
          demoMode={demoMode}
          demoAllowed={DEMO_ALLOWED}
          onChangeTimezone={(tz) => {
            setTimezone(tz);
            if (!demoMode) recapApi.updateSettings(tz, hideChatNames).catch(() => undefined);
          }}
          onToggleHideNames={toggleHideNames}
          onToggleDemoMode={() => { if (DEMO_ALLOWED) setDemoMode((v) => !v); }}
          onDeleteAll={async () => {
            if (!demoMode) await recapApi.deleteAllData();
            if (scanPoller.current) clearInterval(scanPoller.current);
            scanPoller.current = null;
            setLiveRecaps({});
            setScreen('welcome');
          }}
        />
      )}

      </motion.div>
      </AnimatePresence>

      {screen !== 'stories' && (
        <nav className="bottom-nav">
          <button className={`nav-item ${screen === 'welcome' ? 'active' : ''}`} onClick={() => setScreen('welcome')}>
            <Home size={19} /> Главная
          </button>
          <button className="nav-item" onClick={() => openResults('stories')}>
            <Sparkles size={19} /> Истории
          </button>
          <button className={`nav-item ${screen === 'analytics' ? 'active' : ''}`} onClick={() => openResults('analytics')}>
            <BarChart3 size={19} /> Аналитика
          </button>
          <button className={`nav-item ${screen === 'settings' ? 'active' : ''}`} onClick={() => setScreen('settings')}>
            <Settings size={19} /> Настройки
          </button>
        </nav>
      )}
    </div>
  );
}
