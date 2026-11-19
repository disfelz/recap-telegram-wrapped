import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CountUp } from '../components/CountUp';
import { AlertTriangle, Download, Eye, EyeOff, Play, Share2 } from 'lucide-react';
import type { MessageKind, RecapStats, TopChatStat } from '../../../shared/types';
import { downloadOrShareCard } from '../utils/exportCard';
import { haptic } from '../utils/telegram';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const KINDS: {key:MessageKind; name:string; color:string}[] = [
  {key:'text',name:'Текст',color:'#aa95ff'}, {key:'photo',name:'Фото',color:'#85b8ff'},
  {key:'voice',name:'Голосовые',color:'#d8a4ff'}, {key:'sticker',name:'Стикеры',color:'#cec1ff'},
  {key:'video',name:'Видео',color:'#77d5d0'}, {key:'video_note',name:'Кружки',color:'#b5c9ff'},
  {key:'gif',name:'GIF',color:'#9186c8'}, {key:'other',name:'Другое',color:'#74708b'}
];
const fmt = (v:number) => v.toLocaleString('ru-RU');

interface Props {
  stats:RecapStats; prevYearStats?:RecapStats; availableYears:number[]; selectedYear:number;
  hideChatNames:boolean; onSelectYear:(n:number)=>void; onToggleHideNames:()=>void; onOpenStories:()=>void;
}
function Chats({items,hidden,group}:{items:TopChatStat[];hidden:boolean;group:boolean}) {
  const max=Math.max(1,...items.map((x)=>x.sentMessages));
  return <div className="ref-chats">{items.length===0 && <p className="ref-sub">Нет доступных данных</p>}
    {items.slice(0,5).map((x,i)=><div key={x.chatHash} className="ref-chat">
      <div><span>{hidden?(group?'Группа ':'Личный чат ')+(i+1):x.displayLabel}</span><b>{fmt(x.sentMessages)}</b></div>
      <div className="ref-track"><span className={group?'ref-blue':''} style={{width:x.sentMessages/max*100+'%'}} /></div>
    </div>)}
  </div>;
}
export const AnalyticsScreen:React.FC<Props>=({
  stats,prevYearStats,availableYears,selectedYear,hideChatNames,onSelectYear,onToggleHideNames,onOpenStories
})=>{
  const reduceMotion=useReducedMotion();
  const peakMonth=stats.byMonth.indexOf(Math.max(...stats.byMonth));
  const peakHour=stats.byHour.indexOf(Math.max(...stats.byHour));
  const [month,setMonth]=useState(peakMonth),[hour,setHour]=useState(peakHour);
  const [kind,setKind]=useState<MessageKind>('text'),[weekday,setWeekday]=useState<number|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{setMonth(peakMonth);setHour(peakHour);setKind('text');setWeekday(null);},[stats.year]);
  const maxMonth=Math.max(1,...stats.byMonth), maxDay=Math.max(1,...stats.byWeekday), maxHour=Math.max(1,...stats.byHour);
  const totalKinds=Object.values(stats.byKind).reduce((a,v)=>a+v,0);
  const kinds=KINDS.map((k)=>({...k,count:stats.byKind[k.key]||0}));
  const selectedKind=kinds.find((k)=>k.key===kind)||kinds[0];
  const circumference=2*Math.PI*47;
  let offset=0;
  const yoy=prevYearStats&&prevYearStats.totalMessages>0?Math.round((stats.totalMessages/prevYearStats.totalMessages-1)*100):null;
  const selectedMonthShare=stats.totalMessages?((stats.byMonth[month]||0)/stats.totalMessages*100).toFixed(1):'0.0';
  const chatCount=stats.metrics.totalEligibleDialogs||stats.metrics.processedDialogs;
  async function exportPng(format:'story'|'square',action:'download'|'share'='download'){
    if(busy)return;
    setBusy(true);setError('');haptic('medium');
    try{await downloadOrShareCard(stats,format,true,action);}catch{setError('Не удалось создать PNG. Попробуй ещё раз.');}
    finally{setBusy(false);}
  }
  return <main className="screen ref-analytics">
    <header className="ref-analytics-head">
      <div><h1>Аналитика</h1><p>Только твои отправленные сообщения</p></div>
      <div className="ref-year-switch">
        {availableYears.map(y=><button type="button" key={y} className={y===selectedYear?'active':''}
          onClick={()=>{haptic('selection');onSelectYear(y);}}>{y}</button>)}
      </div>
    </header>
    {stats.completionStatus==='partial'&&<div className="ref-warning"><AlertTriangle size={16}/>
      <span>Частичная статистика · Не все чаты завершены</span></div>}
    <section className="ref-panel ref-summary">
      <div className="ref-header-row"><span className="ref-overline">ВСЕГО ОТПРАВЛЕНО ЗА {stats.year}</span>
        {yoy!==null&&<span className="ref-compare">{yoy>0?'+':''}{yoy}% к {stats.year-1}</span>}</div>
      <strong className="ref-hero-total"><CountUp value={stats.totalMessages} durationMs={1050}/></strong>
      <div className="ref-summary-grid">
        <div><b><CountUp value={stats.activeDays}/></b><small>акт. дней</small></div>
        <div><b><CountUp value={stats.longestStreakDays}/>д</b><small>макс. серия</small></div>
        <div><b><CountUp value={chatCount}/></b><small>чатов</small></div>
      </div>
    </section>
    <section className="ref-panel">
      <div className="ref-header-row"><div><h2>По месяцам</h2><p>Нажми на столбец для деталей</p></div>
        <div className="ref-chart-detail"><b>{MONTHS[month]}</b><small>{fmt(stats.byMonth[month]||0)} ({selectedMonthShare}%)</small></div></div>
      <div className="ref-months" role="group" aria-label="Активность по месяцам">
        {stats.byMonth.map((v,i)=><button className={month===i?'active':''} key={i} type="button"
          aria-pressed={month===i} aria-label={MONTHS[i]+': '+fmt(v)}
          onClick={()=>{setMonth(i);haptic('selection');}}>
          <span className="ref-month-bar-container"><motion.span initial={reduceMotion?false:{scaleY:0}} animate={{scaleY:1}} transition={{duration:.55,delay:i*.035,ease:'easeOut'}} style={{height:Math.max(3,v/maxMonth*100)+'%',transformOrigin:'bottom center'}}/></span>
          <small>{MONTHS[i][0]}</small>
        </button>)}
      </div>
    </section>
    <section className="ref-panel"><h2>Дни недели</h2><div className="ref-weekdays">
      {stats.byWeekday.map((v,i)=><button type="button" key={i} className={'ref-weekday '+(weekday===i?'ref-selected-weekday':'')} title={DAYS[i]+': '+fmt(v)} onClick={()=>{setWeekday(i);haptic('selection');}}>
        <span>{DAYS[i]}</span><div className="ref-track"><motion.span className={v===maxDay?'ref-peak':''} initial={reduceMotion?false:{scaleX:0}} animate={{scaleX:1}} transition={{duration:.52,delay:i*.04}} style={{width:v/maxDay*100+'%',transformOrigin:'left'}}/></div>
        <small>{fmt(v)}</small>
      </button>)}
    </div></section>
    <section className="ref-panel">
      <div className="ref-header-row"><h2>Активность по часам (00–23)</h2>
        <div className="ref-chart-detail"><b>{String(hour).padStart(2,'0')}:00</b><small>· {fmt(stats.byHour[hour]||0)}</small></div></div>
      <div className="ref-hours" role="group" aria-label="Активность по часам">
        {stats.byHour.map((v,i)=><button key={i} type="button" className={hour===i?'active':i<=4||i>=22?'night':''}
          title={String(i).padStart(2,'0')+':00 — '+fmt(v)}
          aria-pressed={hour===i} onClick={()=>{setHour(i);haptic('selection');}}
          style={{background:'rgba(169,150,255,'+(0.13+0.8*v/maxHour).toFixed(2)+')'}}>
          {String(i).padStart(2,'0')}
        </button>)}
      </div><p className="ref-caption">Часовой пояс: {stats.timezone}</p>
    </section>
    <section className="ref-panel">
      <div className="ref-header-row"><h2>Типы сообщений</h2><small className="ref-sub">Всего: {fmt(totalKinds)}</small></div>
      <div className="ref-kind-layout">
        <div className="ref-donut-area"><svg viewBox="0 0 116 116" className="ref-donut" role="img" aria-label="Доли типов сообщений">
          <circle cx="58" cy="58" r="47" fill="none" stroke="#28233a" strokeWidth="13"/>
          {kinds.map((k)=>{
            const length=totalKinds?k.count/totalKinds*circumference:0;
            const elm=<motion.circle key={k.key} cx="58" cy="58" r="47" fill="none" stroke={k.color}
              strokeWidth={kind===k.key?17:13}
              strokeDasharray={length+' '+Math.max(0,circumference-length)}
              strokeDashoffset={-offset} initial={reduceMotion?false:{strokeDashoffset:-offset+length}} animate={{strokeDashoffset:-offset}} transition={{duration:.75,delay:.12}} transform="rotate(-90 58 58)"/>;
            offset+=length;return elm;
          })}
        </svg><div className="ref-donut-value"><small>{selectedKind.name}</small><b>{fmt(selectedKind.count)}</b></div></div>
        <div className="ref-kind-list">{kinds.filter(k=>k.count>0).map(k=><button key={k.key} type="button"
          className={k.key===kind?'active':''} aria-pressed={k.key===kind}
          onClick={()=>{setKind(k.key);haptic('selection');}}>
          <i style={{background:k.color}}/><span>{k.name}</span><b>{fmt(k.count)}</b>
        </button>)}</div>
      </div>
      {stats.voiceTotalDurationSec!==null&&<p className="ref-caption">Длительность голосовых по метаданным: {Math.round(stats.voiceTotalDurationSec/60)} мин.</p>}
    </section>
    <section className="ref-panel">
      <div className="ref-header-row"><div><h2>Топ переписок (исходящие)</h2><p>Личные и групповые отдельно</p></div>
        <button type="button" className="ref-eye" onClick={()=>{onToggleHideNames();haptic('light');}}>
          {hideChatNames?<Eye size={14}/>:<EyeOff size={14}/>}
          {hideChatNames?'Открыть':'Скрыть'}
        </button></div>
      <h3 className="ref-category">ЛИЧНЫЕ ЧАТЫ</h3><Chats items={stats.topPrivateChats} hidden={hideChatNames} group={false}/>
      <h3 className="ref-category ref-groups">ГРУППЫ</h3><Chats items={stats.topGroupChats} hidden={hideChatNames} group={true}/>
    </section>
    <section className="ref-panel ref-persona">
      <span className="ref-overline">ТВОЁ ЗВУЧАНИЕ</span>
      <h2>{stats.persona.title}</h2><p>{stats.persona.subtitle}</p>
      <small>На основе метаданных, без чтения текстов сообщений</small>
    </section>
    <section className="ref-panel ref-exports"><div><h2>Экспорт открытки PNG</h2><p>Без имён и ID</p></div>
      <div className="ref-export-grid">
        <button type="button" disabled={busy} onClick={()=>void exportPng('story')}><Download size={14}/> 1080×1920</button>
        <button type="button" disabled={busy} onClick={()=>void exportPng('square')}><Download size={14}/> 1080×1080</button>
        <button type="button" onClick={()=>{haptic('light');onOpenStories();}}><Play size={14}/> Пересмотреть истории</button>
        <button type="button" disabled={busy} onClick={()=>void exportPng('story','share')}><Share2 size={14}/> Поделиться</button>
      </div>{error&&<p role="alert" className="ref-error">{error}</p>}
    </section>
  </main>;
};