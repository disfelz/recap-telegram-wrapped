import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Clock3, X } from 'lucide-react';
import type { ScanProgressPayload } from '../../../shared/types';
import { haptic } from '../utils/telegram';

interface Props {
  progress:ScanProgressPayload;
  onCancel:()=>void|Promise<void>;
  onRetry:()=>void;
  onOpenResults:()=>void;
}
const fmt=(n:number)=>n.toLocaleString('ru-RU');
export const ScanScreen:React.FC<Props>=({progress,onCancel,onRetry,onOpenResults})=>{
  const reduce=useReducedMotion();
  const [line,setLine]=useState(0);
  const [now,setNow]=useState(Date.now());
  const [pending,setPending]=useState(false);
  const done=progress.status==='completed'||progress.status==='partial';
  const failed=progress.status==='cancelled'||progress.status==='failed';
  const flood=progress.status==='paused_flood_wait';
  const paused=progress.status==='paused_user';
  const total=Math.max(0,progress.totalEligibleDialogs);
  const checked=Math.max(0,progress.processedDialogs);
  const percentage=done?100:total>0?Math.max(0,Math.min(99,Math.round(checked/total*100))):0;
  const titles=useMemo(()=>{
    if(failed)return [progress.status==='cancelled'?'Анализ отменён':'Что-то пошло не так'];
    if(done)return ['Всё готово!'];
    if(paused)return ['Анализ на паузе','Можешь продолжить в любой момент'];
    if(flood)return ['Telegram попросил сделать паузу','Продолжим автоматически'];
    if(percentage<15)return ['Подключаемся и собираем список чатов…','Начинаем считать сообщения'];
    if(percentage<40)return ['Работаем изо всех сил','Считаем твои сообщения'];
    if(percentage<75)return ['Нам нужно немного времени','Можешь свернуть — напишем, когда всё будет готово'];
    return ['Проверяем цифры','Почти готово…'];
  },[percentage,done,failed,paused,flood,progress.status]);
  useEffect(()=>{setLine(0);},[percentage<15,percentage<40,percentage<75,done,failed,paused,flood]);
  useEffect(()=>{
    if(titles.length<2)return;
    const timer=setInterval(()=>setLine(n=>(n+1)%titles.length),3600);
    return()=>clearInterval(timer);
  },[titles.join('|')]);
  useEffect(()=>{
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(timer);
  },[]);
  const deadline=progress.floodWaitUntil ? Date.parse(progress.floodWaitUntil) : NaN;
  const remaining=Number.isFinite(deadline)?Math.max(0,Math.ceil((deadline-now)/1000)):null;
  const ring=2*Math.PI*84;
  const cancel=async()=>{
    if(pending)return;
    haptic('medium');setPending(true);
    try{await onCancel();}finally{setPending(false);}
  };
  return <main className="v2-scan">
    <div className="v2-scan-aura" aria-hidden="true"/>
    <header className="v2-scan-header">
      <span className="v2-mark">RECAP<span>✳</span></span>
      <span className="v2-kicker">{progress.year} · Идёт подсчёт</span>
    </header>
    <section className="v2-scan-main">
      <div className="v2-scan-ring">
        <svg viewBox="0 0 220 220" aria-label={'Готово '+percentage+'%'} role="img">
          <defs><linearGradient id="v2-loading-gradient"><stop stopColor="#85B8FF"/><stop offset="1" stopColor="#A996FF"/></linearGradient></defs>
          <circle cx="110" cy="110" r="84" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="11"/>
          <motion.circle cx="110" cy="110" r="84" fill="none" stroke="url(#v2-loading-gradient)"
            strokeWidth="11" strokeLinecap="round" transform="rotate(-90 110 110)"
            strokeDasharray={ring} animate={{strokeDashoffset:ring*(1-percentage/100)}}
            transition={{duration:reduce?0:.85,ease:'easeInOut'}}/>
        </svg>
        <div className="v2-scan-ring-value"><strong>{percentage}<small>%</small></strong><span>ГОТОВО</span></div>
      </div>
      <h1>Собираем твой<br/>RECAP</h1>
      <div className="v2-scan-caption" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={line+'-'+titles[line]} initial={{opacity:0,y:9}}
            animate={{opacity:1,y:0}} exit={{opacity:0,y:-9}}
            transition={{duration:reduce?0:.3}}>{titles[line]}</motion.p>
        </AnimatePresence>
      </div>
      <div className="v2-scan-track"><motion.div
        animate={{scaleX:percentage/100}} transition={{duration:reduce?0:.75}}
        style={{transformOrigin:'left'}}/></div>
      <p className="v2-scan-actual">Проверено чатов: <b>{fmt(checked)}</b>
        {' из '}<b>{total?fmt(total):'—'}</b>
        <span> · </span>Найдено сообщений: <b>{fmt(progress.outgoingFound)}</b>
      </p>
      {flood&&<p className="v2-scan-flood"><Clock3 size={15}/>
        Telegram попросил сделать паузу{remaining!==null?' на '+remaining+' сек':''} — ждём и продолжаем.
      </p>}
      {progress.status==='partial'&&<p className="v2-scan-flood">Не все чаты удалось обработать. Итоги покажем с пометкой.</p>}
    </section>
    <footer className="v2-scan-footer">
      {done?<button type="button" className="v2-white-btn" onClick={onOpenResults}>
        <CheckCircle2 size={18}/> Смотреть итоги
      </button>:failed?<button type="button" className="v2-white-btn" onClick={onRetry}>
        Повторить анализ
      </button>:<button type="button" className="v2-scan-cancel" disabled={pending||!progress.jobId}
        onClick={()=>void cancel()}><X size={18}/>{pending?'Отменяем…':'Отменить'}</button>}
      <small>Можешь закрыть приложение. Бот напишет, когда всё будет готово.</small>
    </footer>
  </main>;
};
