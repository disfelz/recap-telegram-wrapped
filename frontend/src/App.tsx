import React, { useEffect, useRef, useState } from 'react';
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

function prefKey(name: string): string | null {
  // Preferences are isolated by Telegram identity and never contain conversation data.
  const id = getTelegramWebApp()?.initDataUnsafe?.user?.id;
  return id ? 'recap:preferences:' + id + ':' + name : null;
}
function readPreference(name: string): string | null {
  const key = prefKey(name);
  if (!key) return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}


export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [demoMode, setDemoMode] = useState<boolean>(DEMO_ALLOWED && !import.meta.env.VITE_API_BASE_URL);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [timezone, setTimezone] = useState<string>(() => readPreference('timezone') || 'Europe/Moscow');
  const [hideChatNames, setHideChatNames] = useState<boolean>(() => readPreference('hide-names') !== 'false');
  const [liveRecaps, setLiveRecaps] = useState<Record<number, RecapStats>>({});
  useEffect(() => {
    const tzKey = prefKey('timezone');
    const namesKey = prefKey('hide-names');
    try {
      if (tzKey) window.localStorage.setItem(tzKey, timezone);
      if (namesKey) window.localStorage.setItem(namesKey, String(hideChatNames));
    } catch { /* Storage may be disabled in a restricted WebView. */ }
  }, [timezone, hideChatNames]);
  const [resumeJobId, setResumeJobId] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const scanPoller = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoPoller = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanRequestInFlight = useRef(false);
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
      if (scanRequestInFlight.current) return;
      scanRequestInFlight.current = true;
      try {
        const { job } = await recapApi.getScanStatus(jobId);
        if (!job) return;
        setScanProgress((previous) => previous.jobId === job.jobId && previous.status === 'paused'
          && job.status !== 'paused' ? previous : job);
        if (job.status === 'paused') {
          if (scanPoller.current) clearInterval(scanPoller.current);
          scanPoller.current = null;
          return;
        }
        if (job.status === 'completed' || job.status === 'partial') {
          // The scan callback writes the job status and the report separately.
          // Keep polling until the confirmed report is retrievable.
          const { results } = await recapApi.getSavedRecaps();
          const byYear: Record<number, RecapStats> = {};
          results.forEach((r) => { byYear[r.year] = r; });
          setLiveRecaps(byYear);
          if (byYear[job.year]) {
            if (scanPoller.current) clearInterval(scanPoller.current);
            scanPoller.current = null;
            haptic('success');
          }
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          if (scanPoller.current) clearInterval(scanPoller.current);
          scanPoller.current = null;
        }
      } catch {
        // A temporary network error should not cancel the scan.
      } finally {
        scanRequestInFlight.current = false;
      }
    }, 2000);
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
        if (job && ['queued', 'auth_pending', 'quick_preview', 'scanning', 'paused_flood_wait', 'paused'].includes(job.status)) {
          setSelectedYear(job.year);
          setScanProgress(job);
          setScreen('scan');
          if (job.status !== 'paused') startScanPolling(job.jobId);
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
    setAppError(null);
    // Keep the year switcher visible even when this year's report is absent.
    setScreen(!currentStats && target === 'stories' ? 'analytics' : target);
  };

  const beginNewAnalysis = () => {
    setAppError(null);
    if (!demoMode && scanProgress.jobId !== 'demo-job' &&
        ['queued', 'auth_pending', 'quick_preview', 'scanning', 'paused_flood_wait'].includes(scanProgress.status)) {
      setAppError('Уже выполняется анализ за ' + scanProgress.year + ' год. Сначала заверши или отмени его.');
      setScreen('scan');
      return;
    }
    setResumeJobId(null);
    setScreen('connect');
  };

  const openScanResults = async () => {
    setSelectedYear(scanProgress.year);
    if (demoMode) {
      setAppError(null);
      setScreen('stories');
      return;
    }
    try {
      const { results } = await recapApi.getSavedRecaps();
      const byYear: Record<number, RecapStats> = {};
      results.forEach((r) => { byYear[r.year] = r; });
      setLiveRecaps(byYear);
      if (byYear[scanProgress.year]) {
        setAppError(null);
        setScreen('stories');
      } else {
        setAppError('Результат ещё сохраняется. Подожди завершения записи статистики.');
      }
    } catch (error) {
      setAppError((error as Error).message || 'Не удалось загрузить аналитику.');
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
      {/* Keep the route container mounted. AnimatePresence(mode="wait") can leave
          Telegram Android WebView with an empty exiting route after fast navigation.
          Individual screens keep their own animations without holding navigation. */}
      <div className="route-content"
        style={{ position: 'relative', zIndex: screen === 'settings' ? 60 : screen === 'stories' ? 45 : 1 }}>
      {screen === 'welcome' && (
        <WelcomeScreen
          selectedYear={selectedYear}
          availableYears={availableYears}
          onSelectYear={setSelectedYear}
          onStartConnect={beginNewAnalysis}
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
          onPause={async () => {
            if (demoMode) {
              if (demoPoller.current) clearInterval(demoPoller.current);
              demoPoller.current = null;
              setScanProgress((p) => ({ ...p, status: 'paused' }));
              return;
            }
            try {
              await recapApi.pauseScan(scanProgress.jobId);
              if (scanPoller.current) clearInterval(scanPoller.current);
              scanPoller.current = null;
              setScanProgress((p) => ({ ...p, status: 'paused', floodWaitUntil: null }));
            } catch (e) {
              setAppError((e as Error).message || 'Не удалось поставить анализ на паузу.');
            }
          }}
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
          onOpenResults={() => {void openScanResults();}}
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
          onStartNewAnalysis={beginNewAnalysis}
        />
      )}

      {!currentStats && (screen === 'stories' || screen === 'analytics') && (
        <main className="screen ref-analytics recap-empty-analytics" role="status">
          <header className="ref-analytics-head">
            <div><h1>Аналитика</h1><p>Реальные исходящие сообщения</p></div>
            <div className="ref-year-switch" aria-label="Выбрать год">
              {availableYears.map((year) => (
                <button type="button" key={year} className={selectedYear === year ? 'active' : ''}
                  onClick={() => {haptic('selection');setSelectedYear(year);}}>{year}</button>
              ))}
            </div>
          </header>
          <section className="ref-panel recap-empty-panel">
            <span className="ref-overline">RECAP / {selectedYear}</span>
            <h2>Анализа за {selectedYear} год пока нет</h2>
            <p>{demoMode
              ? 'За этот год нет демонстрационных данных. Выбери другой год или выключи деморежим в настройках.'
              : 'Выбери год и запусти сканирование. Покажем только проверенные данные твоего Telegram — без вымышленных цифр.'}</p>
            {!demoMode && <button type="button" className="btn btn-primary" onClick={beginNewAnalysis}>
              Начать анализ за {selectedYear} год
            </button>}
            {Object.keys(liveRecaps).length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => {
                const lastYear = Math.max(...Object.keys(liveRecaps).map(Number));
                setSelectedYear(lastYear);
                setScreen('analytics');
              }}>Посмотреть готовый RECAP</button>
            )}
          </section>
        </main>
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
            setTimezone('Europe/Moscow');
            setHideChatNames(true);
            setScreen('welcome');
          }}
        />
      )}

      </div>

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
