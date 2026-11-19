import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, PauseCircle, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import type { ScanProgressPayload } from '../../../shared/types';
import { CountUp } from '../components/CountUp';
import { haptic } from '../utils/telegram';

interface Props {
  progress:ScanProgressPayload;
  onCancel:()=>void|Promise<void>;
  onResume:()=>void;
  onOpenResults:()=>void;
}

export const ScanScreen:React.FC<Props>=({progress,onCancel,onResume,onOpenResults})=>{
  const reduce=useReducedMotion();
  const [now,setNow]=useState(()=>Date.now());
  const [lastUpdate,setLastUpdate]=useState(()=>Date.now());
  const isFlood=progress.status==='paused_flood_wait';
  const isDone=progress.status==='completed'||progress.status==='partial';
  const isCancelled=progress.status==='cancelled';
  const isFailed=progress.status==='failed';
  const active=!isDone&&!isCancelled&&!isFailed;
  const total=progress.totalEligibleDialogs;
  const pct=total>0?Math.min(100,Math.round(progress.processedDialogs/total*100)):isDone?100:0;
  const circumference=2*Math.PI*80;
  const deadline=progress.floodWaitUntil?Date.parse(progress.floodWaitUntil):NaN;
  const remaining=Number.isFinite(deadline)?Math.max(0,Math.ceil((deadline-now)/1000)):null;
  const statusFresh=now-lastUpdate<9000;
  const mm=remaining!==null?String(Math.floor(remaining/60)).padStart(2,'0'):null;
  const ss=remaining!==null?String(remaining%60).padStart(2,'0'):null;

  useEffect(()=>{setLastUpdate(Date.now());},[progress]);
  useEffect(()=>{
    if(!active)return;
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[active]);

  const title=progress.status==='completed'?'Анализ завершён':
    progress.status==='partial'?'Частичная статистика':
    isFlood?'Telegram взял паузу':isCancelled?'Анализ остановлен':
    isFailed?'Анализ прервался':progress.stage==='quick_preview'?'Изучаем диалоги':'Считаем сообщения';
  const subtitle=progress.status==='completed'?'Все доступные данные обработаны. Твой RECAP готов.':
    progress.status==='partial'?'Некоторые диалоги недоступны или не были завершены. Показаны только проверенные результаты.':
    isFlood?'Telegram временно ограничил частоту запросов. Прогресс сохранён, работа продолжится после паузы.':
    isCancelled?'Сканирование остановлено. При необходимости можно продолжить после повторного входа.':
    isFailed?(progress.errorMessage||'Не удалось завершить сканирование. Результаты не выдаются за полный анализ.'):
    'Мы учитываем только твои исходящие сообщения. Тексты не сохраняются, медиафайлы не скачиваются.';

  return <main className="screen flagship-scan">
    <header className="flagship-scan-heading">
      <span className="flagship-eyebrow">RECAP / {progress.year}</span>
      <h1>Анализ активности</h1>
      <p>Твоя история собирается из реальных данных.</p>
    </header>
    <div className="flagship-stage-stepper" aria-label="Этапы анализа">
      <div className="active"><span>01</span><b>Быстрый обзор</b></div>
      <div className="flagship-stage-line"/>
      <div className={progress.stage==='full_scan'?'active':''}><span>02</span><b>Точный подсчёт</b></div>
    </div>
    <section className="flagship-scan-main">
      <div className="flagship-scan-radar">
        <motion.div className="flagship-scan-pulse" animate={reduce?{}:{scale:[.92,1.10,.92],opacity:[.18,.5,.18]}}
          transition={{repeat:Infinity,duration:3.2,ease:'easeInOut'}}/>
        <svg viewBox="0 0 200 200" role="img" aria-label={'Выполнено '+pct+' процентов'} className="flagship-scan-ring">
          <defs><linearGradient id="recap-scan-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A996FF"/><stop offset="100%" stopColor="#85B8FF"/>
          </linearGradient></defs>
          <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(169,150,255,.11)" strokeWidth="8"/>
          <motion.circle cx="100" cy="100" r="80" fill="none" stroke="url(#recap-scan-gradient)" strokeWidth="8"
            strokeLinecap="round" transform="rotate(-90 100 100)" strokeDasharray={circumference}
            initial={false} animate={{strokeDashoffset:circumference*(1-pct/100)}}
            transition={{duration:reduce?0:.65,ease:'easeOut'}}/>
          <circle cx="100" cy="100" r="61" fill="none" stroke="rgba(169,150,255,.10)" strokeDasharray="2 8"/>
        </svg>
        <div className="flagship-scan-radar-value"><strong className="tabular"><CountUp value={pct} durationMs={550}/>%</strong>
          <span>{isDone?'ГОТОВО':isFlood?'ПАУЗА':progress.stage==='quick_preview'?'ЭТАП 1 / 2':'ЭТАП 2 / 2'}</span>
        </div>
      </div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </section>
    <div className="flagship-scan-metrics">
      <div><span>ОБРАБОТАНО ЧАТОВ</span><strong className="tabular"><CountUp value={progress.processedDialogs}/>
        <small> / {total||'—'}</small></strong></div>
      <div><span>НАЙДЕНО ИСХОДЯЩИХ</span><strong className="tabular"><CountUp value={progress.outgoingFound}/></strong></div>
    </div>
    <div className="flagship-connection-status" role="status">
      <span className={'flagship-signal-dot '+(statusFresh?'online':'offline')}/>
      <span>{!active?'Сканирование не выполняется':statusFresh?'Связь с API активна':'Нет свежих данных от API'}</span>
      <span className="flagship-connection-code">{progress.stage==='quick_preview'?'БЫСТРЫЙ ОБЗОР':'ТОЧНЫЙ ПОДСЧЁТ'}</span>
    </div>
    {isFlood&&<div className="flagship-flood-card">
      <div className="flagship-flood-title"><PauseCircle size={20}/><strong>Пауза по требованию Telegram</strong></div>
      <div className="flagship-flood-time tabular">{remaining!==null?mm+':'+ss:'Ожидаем завершения паузы'}</div>
      <p>Telegram ограничил запросы на время. Уже обработанные данные сохранены, ничего начинать сначала не нужно.</p>
    </div>}
    {progress.status==='partial'&&<div className="flagship-partial-note"><AlertTriangle size={18}/>
      <span>Частичный результат не выдаётся за полную статистику.</span></div>}
    {active&&<div className="flagship-scan-background-note">
      <Clock3 size={17}/><div><strong>Не нужно держать приложение открытым</strong>
        <p>Сканирование выполняется на сервере. Ты сможешь вернуться в Mini App и продолжить просмотр прогресса.</p></div>
    </div>}
    <div className="flagship-scan-actions">
      {isDone?<>
        <button className="btn btn-primary" onClick={()=>{haptic('success');onOpenResults();}}>
          <CheckCircle2 size={17}/> Смотреть RECAP {progress.year}<ArrowRight size={16}/>
        </button>
        {progress.status==='partial'&&<button className="btn btn-secondary" onClick={()=>{haptic('medium');onResume();}}>
          <RotateCcw size={16}/> Продолжить анализ
        </button>}
      </>:isCancelled||isFailed?
        <button className="btn btn-primary" onClick={()=>{haptic('medium');onResume();}}><RotateCcw size={17}/> Продолжить с места остановки</button>
      :<button className="btn btn-danger" onClick={()=>{haptic('medium');void onCancel();}}><XCircle size={17}/>
        Отменить и завершить сессию
      </button>}
      <div className="flagship-scan-privacy"><ShieldCheck size={14}/> Временная MTProto-сессия завершается по завершении анализа.</div>
    </div>
  </main>;
};
