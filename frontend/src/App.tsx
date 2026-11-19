import React, { useCallback, useEffect, useRef, useState } from 'react';
import './styles/reference.css';
import './styles/flagship.css';
import './styles/v2.css';
import { BarChart3, Settings as SettingsIcon } from 'lucide-react';
import type { RecapMe, RecapStats, ScanProgressPayload } from '../../shared/types';
import { recapApi } from './api/client';
import { DEMO_RECAP_BY_YEAR } from './data/demoData';
import { getTelegramWebApp, haptic, initTelegramMiniApp } from './utils/telegram';
import { ConnectScreen } from './screens/ConnectScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ScanScreen } from './screens/ScanScreen';
import { HoldScreen } from './screens/HoldScreen';
import { StoriesScreen } from './screens/StoriesScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Screen = 'boot'|'welcome'|'connect'|'scan'|'hold'|'stories'|'analytics'|'settings';
const CURRENT_YEAR = new Date().getFullYear();
const DEMO_ALLOWED = true; // Isolated, explicitly labelled demo data.
const ACTIVE = ['queued','auth_pending','quick_preview','scanning','paused_flood_wait','paused_user'];

function defaultTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'; }
  catch { return 'Europe/Moscow'; }
}
function initialYear(): number {
  const requested = Number(new URLSearchParams(window.location.search).get('year'));
  return Number.isInteger(requested) && requested>=2013 && requested<=CURRENT_YEAR ? requested : CURRENT_YEAR;
}
function initialProgress(year:number):ScanProgressPayload {
  return {jobId:'',year,status:'queued',stage:'quick_preview',
    processedDialogs:0,totalEligibleDialogs:0,outgoingFound:0,
    floodWaitUntil:null,errorMessage:null};
}

export default function App(){
  const [screen,setScreen]=useState<Screen>('boot');
  const [selectedYear,setSelectedYear]=useState(initialYear);
  const [timezone,setTimezone]=useState(defaultTimezone);
  const [hideChatNames,setHideChatNames]=useState(true);
  const [demoMode,setDemoMode]=useState(false);
  const [recaps,setRecaps]=useState<Record<number,RecapStats>>({});
  const [authorized,setAuthorized]=useState(false);
  const [progress,setProgress]=useState<ScanProgressPayload>(()=>initialProgress(initialYear()));
  const [error,setError]=useState<string|null>(null);
  const pollRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const skipNextBootstrap=useRef(false);
  const [resumeJobId,setResumeJobId]=useState<string|null>(null);

  const clearPoll=useCallback(()=>{
    if(pollRef.current!==null)clearInterval(pollRef.current);
    pollRef.current=null;
  },[]);
  const loadRecaps=useCallback(async()=>{
    const {results}=await recapApi.getSavedRecaps();
    const map:Record<number,RecapStats>={};
    results.forEach(v=>{map[v.year]=v;});
    setRecaps(map);
    return map;
  },[]);
  const startPolling=useCallback((jobId:string)=>{
    clearPoll();
    let busy=false;
    const tick=async()=>{
      if(busy)return;
      busy=true;
      try {
        const {job}=await recapApi.getScanStatus(jobId);
        if(!job)return;
        setProgress(job);
        if(job.status==='completed'||job.status==='partial'){
          const map=await loadRecaps();
          if(map[job.year]){
            clearPoll();
            setSelectedYear(job.year);
            setScreen('hold');
            haptic('success');
          }
        }else if(job.status==='cancelled'||job.status==='failed'){
          clearPoll();
        }
      } catch {
        // Network glitches do not cancel the server-side scan.
      }finally{busy=false;}
    };
    void tick();
    pollRef.current=setInterval(()=>void tick(),2000);
  },[clearPoll,loadRecaps]);
  const startScan=useCallback(async(year:number,authId='')=>{
    setError(null);
    clearPoll();
    setSelectedYear(year);
    setProgress(initialProgress(year));
    setScreen('scan');
    try{
      const result=await recapApi.startScan(year,timezone,authId);
      if(!result.jobId)throw new Error('Сканер не вернул номер анализа');
      setAuthorized(true);
      setResumeJobId(null);
      setProgress({...initialProgress(year),jobId:result.jobId});
      startPolling(result.jobId);
    }catch(e) {
      try{
        const latest=await recapApi.getMe();
        if(latest.activeJob){
          setSelectedYear(latest.activeJob.year);
          setProgress(latest.activeJob);
          setScreen('scan');
          startPolling(latest.activeJob.jobId);
          return;
        }
      }catch{/* Keep original start error. */}
      setError((e as Error).message||'Не удалось запустить анализ');
      setScreen('connect');
    }
  },[timezone,clearPoll,startPolling]);

  const resumeExistingScan=useCallback(async(jobId:string,authId:string)=>{
    setError(null);
    clearPoll();
    setProgress({...initialProgress(selectedYear),jobId});
    setScreen('scan');
    try {
      const result=await recapApi.resumeScan(jobId,authId);
      setResumeJobId(null);
      startPolling(result.jobId||jobId);
    }catch(e){
      setError((e as Error).message||'Не удалось продолжить анализ');
      setScreen('connect');
    }
  },[clearPoll,startPolling,selectedYear]);

  useEffect(()=>{
    const cleanupTelegram=initTelegramMiniApp();
    return ()=>{cleanupTelegram();clearPoll();};
  },[clearPoll]);
  useEffect(()=>{
    if(demoMode)return;
    if(skipNextBootstrap.current){skipNextBootstrap.current=false;return;}
    let disposed=false;
    setScreen('boot');
    (async()=>{
      try{
        const [me,{results}]=await Promise.all([recapApi.getMe(),recapApi.getSavedRecaps()]);
        if(disposed)return;
        setAuthorized(me.authorized);
        setHideChatNames(me.hideChatNames);
        setTimezone(me.timezone || defaultTimezone());
        const byYear:Record<number,RecapStats>={};
        results.forEach(v=>{byYear[v.year]=v;});
        setRecaps(byYear);
        if(me.activeJob && ACTIVE.includes(me.activeJob.status)){
          setSelectedYear(me.activeJob.year);
          setProgress(me.activeJob);
          setScreen('scan');
          startPolling(me.activeJob.jobId);
          return;
        }
        const requested=initialYear();
        const preferred=byYear[requested] ? requested : Math.max(0,...Object.keys(byYear).map(Number));
        if(preferred){
          setSelectedYear(preferred);
          const direct=new URLSearchParams(window.location.search).get('screen');
          setScreen(direct==='analytics'?'analytics':'hold');
          return;
        }
        // First-time users see a transparent welcome, never a surprise phone form.
        setScreen('welcome');
      }catch(e){
        if(!disposed){
          setError((e as Error).message||'Не удалось подключиться к серверу');
          setScreen('welcome');
        }
      }
    })();
    return()=>{disposed=true;};
    // Initial bootstrap only. Subsequent scan transitions are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[demoMode]);

  const data=demoMode?DEMO_RECAP_BY_YEAR:recaps;
  const stats=data[selectedYear];
  const availableYears=[...new Set([CURRENT_YEAR,CURRENT_YEAR-1,CURRENT_YEAR-2,...Object.keys(data).map(Number)])]
    .filter(year=>year>=2013).sort((a,b)=>b-a);

  const openAnalytics=()=>setScreen('analytics');
  const openStories=()=>stats?setScreen('stories'):setScreen('analytics');
  const requestAnalysis=()=>{
    if(demoMode){exitDemoToConnect();return;}
    setResumeJobId(null);setError(null);setScreen('connect');
    void recapApi.getScanStatus().then(({job})=>{
      if(job && job.year===selectedYear && job.status==='partial')setResumeJobId(job.jobId);
    }).catch(()=>undefined);
  };
  const toggleHideNames=()=>{
    // Temporary access is revoked after scanning; masks remain for privacy.
    setHideChatNames(true);
  };
  const handleYearChange=(year:number)=>{
    setSelectedYear(year);
    setError(null);
    if(!data[year] && screen==='hold')setScreen('analytics');
  };
  const openDemo=()=>{
    clearPoll();setError(null);setDemoMode(true);setResumeJobId(null);setScreen('hold');
  };
  const exitDemoToConnect=()=>{
    skipNextBootstrap.current=true;setDemoMode(false);setError(null);setScreen('connect');
  };
  const toggleDemo=()=>{if(demoMode)exitDemoToConnect();else openDemo();};
  useEffect(()=>{
    const back=getTelegramWebApp()?.BackButton;
    if(!back)return;
    const goBack=()=>{
      haptic('light');
      if(screen==='stories'&&demoMode)setScreen('welcome');
      else if(screen==='stories'||screen==='settings')setScreen('analytics');
      else if(screen==='connect')setScreen('welcome');
      else if(screen==='analytics'&&stats)setScreen('hold');
    };
    if(screen==='stories'||screen==='settings'||screen==='analytics'||screen==='connect') {
      back.show();back.onClick(goBack);
    }else back.hide();
    return()=>back.offClick(goBack);
  },[screen,stats,demoMode]);

  return <div className={'app-shell v2-app v2-screen-'+screen}>
    {error&&<div className="v2-error" role="alert">
      <span>{error}</span><button type="button" onClick={()=>setError(null)} aria-label="Закрыть">×</button>
    </div>}
    {screen==='boot'&&<main className="v2-boot" role="status"><span className="v2-loader"/>Открываем RECAP…</main>}
    {screen==='welcome'&&<WelcomeScreen
      selectedYear={selectedYear}
      availableYears={availableYears.filter(year=>year===CURRENT_YEAR||year===CURRENT_YEAR-1)}
      onSelectYear={handleYearChange}
      onStartConnect={()=>{setResumeJobId(null);if(demoMode)exitDemoToConnect();else setScreen('connect');}}
      hasSavedRecap={Boolean(recaps[selectedYear])}
      onOpenSavedRecap={()=>setScreen('hold')}
      onOpenDemoStories={openDemo}
      demoEnabled={true}
    />}
    {screen==='connect'&&<ConnectScreen
      selectedYear={selectedYear}
      availableYears={availableYears}
      onSelectYear={handleYearChange}
      onAuthorized={async(authId)=>{
        if(resumeJobId)await resumeExistingScan(resumeJobId,authId);
        else await startScan(selectedYear,authId);
      }}
      onShowDemo={openDemo}
    />}
    {screen==='scan'&&<ScanScreen progress={progress}
      onCancel={async()=>{
        try{
          await recapApi.cancelScan(progress.jobId);
          clearPoll();
          setScreen('analytics');
        }catch(e){setError((e as Error).message);}
      }}
      onRetry={async()=>{
        setError(null);
        try {
          const result=await recapApi.resumeScan(progress.jobId);
          setProgress({...initialProgress(progress.year),jobId:result.jobId || progress.jobId});
          setScreen('scan');
          startPolling(result.jobId || progress.jobId);
        }catch(e){
          setResumeJobId(progress.jobId);
          setScreen('connect');
          setError('Временный сеанс закрыт. Войди снова — продолжим с сохранённого места.');
        }
      }}
      onOpenResults={()=>{setSelectedYear(progress.year);setScreen('hold');}}
    />}
    {screen==='hold'&&stats&&<HoldScreen key={selectedYear+(demoMode?'-demo':'-live')}
      year={selectedYear} partial={stats.completionStatus==='partial'} demo={demoMode}
      onReveal={()=>setScreen('stories')}/>}
    {screen==='stories'&&stats&&<StoriesScreen stats={stats}
      hideChatNames={true} onToggleHideNames={toggleHideNames}
      demo={demoMode} onStartReal={exitDemoToConnect}
      onClose={demoMode?()=>setScreen('welcome'):openAnalytics}/>}
    {screen==='analytics'&&<div className="v2-hub">
      <header className="v2-hub-nav">
        <button type="button" className="active" onClick={()=>setScreen('analytics')}><BarChart3 size={17}/> Аналитика</button>
        <button type="button" onClick={()=>setScreen('settings')}><SettingsIcon size={17}/> Настройки</button>
      </header>
      {stats?<AnalyticsScreen
        stats={stats} prevYearStats={data[selectedYear-1]} availableYears={availableYears}
        selectedYear={selectedYear} hideChatNames={hideChatNames}
        onToggleHideNames={toggleHideNames} onSelectYear={handleYearChange}
        onOpenStories={openStories} onStartNewAnalysis={requestAnalysis}
      />:<section className="v2-no-data">
        <span>RECAP / {selectedYear}</span>
        <h2>Этот год ещё не посчитан</h2>
        <div className="v2-year-pills">{availableYears.map(year=>
          <button type="button" className={selectedYear===year?'active':''} key={year}
            onClick={()=>handleYearChange(year)}>{year}</button>)}</div>
        {!demoMode&&<button type="button" className="v2-white-btn" onClick={requestAnalysis}>
          Начать анализ за {selectedYear} год
        </button>}
      </section>}
    </div>}
    {screen==='settings'&&<div className="v2-hub">
      <header className="v2-hub-nav">
        <button type="button" onClick={()=>setScreen('analytics')}><BarChart3 size={17}/> Аналитика</button>
        <button type="button" className="active" onClick={()=>setScreen('settings')}><SettingsIcon size={17}/> Настройки</button>
      </header>
      <SettingsScreen
        timezone={timezone} hideChatNames={hideChatNames}
        demoMode={demoMode} demoAllowed={DEMO_ALLOWED}
        onChangeTimezone={tz=>{
          setTimezone(tz);
          if(!demoMode)void recapApi.updateSettings(tz,hideChatNames).catch(e=>setError((e as Error).message));
        }}
        onToggleHideNames={toggleHideNames}
        onToggleDemoMode={toggleDemo}
        onDeleteAll={async()=>{
          if(!demoMode)await recapApi.deleteAllData();
          clearPoll();setRecaps({});setAuthorized(false);
          setSelectedYear(CURRENT_YEAR);setHideChatNames(true);setScreen('welcome');
        }}
      />
    </div>}
  </div>;
}
