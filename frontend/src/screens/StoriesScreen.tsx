import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, Download, Eye, EyeOff, Flame, Image as ImageIcon, MessageCircle, Mic, Moon, Send, Sparkles, Video, X } from 'lucide-react';
import type { RecapStats } from '../../../shared/types';
import { CountUp } from '../components/CountUp';
import { CardExportDialog } from '../components/CardExportDialog';
import { haptic } from '../utils/telegram';
import { pluralRu } from '../utils/pluralRu';

const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const SHORT=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const THEMES=[
  ['#1B6BFF','#0B2568','#061233'],['#E05A18','#7B2908','#2A0D03'],
  ['#7C4DFF','#34168A','#130833'],['#108A9D','#083B67','#08142D'],
  ['#10A881','#064D3E','#031F1A'],['#E83A76','#6F1237','#280614'],
  ['#5260FF','#1D2175','#0B0D30'],['#C97B16','#5A3107','#211203'],
  ['#FF4757','#7D1225','#2B060D'],['#A996FF','#342668','#0D0B1F'],
  ['#A996FF','#241B52','#09090F'],
];
const fmt=(x:number)=>x.toLocaleString('ru-RU');
interface Props {
  stats:RecapStats; hideChatNames:boolean; onToggleHideNames:()=>void; onClose:()=>void;
}
function Art({index,stats}:{index:number;stats:RecapStats}) {
  const reduce=useReducedMotion();
  const month=stats.byMonth.indexOf(Math.max(...stats.byMonth));
  const day=stats.byWeekday.indexOf(Math.max(...stats.byWeekday));
  const maxMonth=Math.max(1,...stats.byMonth);
  const peak=stats.byHour.indexOf(Math.max(...stats.byHour));
  const nighttime=peak>=21||peak<6;
  if(index===0)return <div className="v2-art v2-art-plane">
    <motion.div className="v2-plane" animate={reduce?{}:{x:[-16,14,-16],y:[12,-16,12],rotate:[-8,8,-8]}}
      transition={{duration:5,repeat:Infinity,ease:'easeInOut'}}>
      <svg viewBox="0 0 220 160"><path d="M12 83L207 10L134 153L105 103L12 83Z" fill="#FFF" opacity=".98"/>
        <path d="M105 103L207 10L87 120L105 103Z" fill="#A1C7FF"/>
        <path d="M105 103L134 153L87 120Z" fill="#356AFF"/></svg>
    </motion.div><span className="v2-bubble one">•••</span><span className="v2-bubble two">✳</span>
  </div>;
  if(index===1)return <div className="v2-art v2-art-months"><div className="v2-bars">
    {stats.byMonth.map((v,i)=><div key={i} className={i===month?'peak':''}>
      <motion.span initial={reduce?false:{scaleY:0}} animate={{scaleY:1}} transition={{duration:.65,delay:i*.045}}
        style={{height:Math.max(5,(v/maxMonth)*100)+'%',transformOrigin:'bottom'}}/>
      <small>{i+1}</small></div>)}
  </div></div>;
  if(index===2)return <div className="v2-art v2-art-week">
    {stats.byWeekday.map((v,i)=><motion.div key={i} className={day===i?'peak':''}
      initial={reduce?false:{opacity:0,scale:.65}} animate={{opacity:1,scale:1}}
      transition={{type:'spring',delay:.05*i}}>
      <span>{SHORT[i]}</span><b>{v.toLocaleString('ru-RU')}</b>
    </motion.div>)}
  </div>;
  if(index===3)return <div className="v2-art v2-art-moon">
    <motion.div animate={reduce?{}:{rotate:360}} transition={{duration:36,repeat:Infinity,ease:'linear'}}
      className="v2-moon-halo"/>
    <div className={nighttime?'v2-moon-disc night':'v2-moon-disc day'}>
      {nighttime?<Moon size={115} strokeWidth={.8}/>:<span>☀</span>}
    </div>
    <small>{nighttime?'Ночной час':'Твой час'}</small>
  </div>;
  if(index===4)return <div className="v2-art v2-art-audio"><div className="v2-wave">
    {Array.from({length:29},(_,i)=><motion.span key={i}
      animate={reduce?{}:{scaleY:[.4,1,.5,.9,.4]}}
      transition={{duration:1.5+i%6*.14,repeat:Infinity,delay:i*.055,ease:'easeInOut'}}
      style={{height:(15+Math.abs(Math.sin(i*.78))*110)+'px'}}/>)}
  </div><Mic size={48} strokeWidth={1.3}/></div>;
  if(index===5)return <div className="v2-art v2-art-round">
    <motion.div className="v2-round-outer" animate={reduce?{}:{rotate:360}}
      transition={{repeat:Infinity,duration:24,ease:'linear'}}/>
    <div className="v2-round-inner"><Video size={81} strokeWidth={1.3}/></div>
  </div>;
  if(index===6)return <div className="v2-art v2-art-media">
    <motion.div animate={reduce?{}:{rotate:[-14,-9,-14],y:[0,-12,0]}}
      transition={{duration:4,repeat:Infinity}}><ImageIcon size={88}/></motion.div>
    <motion.div animate={reduce?{}:{rotate:[12,18,12],y:[0,12,0]}}
      transition={{duration:3.5,repeat:Infinity}}><Video size={66}/></motion.div>
    <motion.div animate={reduce?{}:{scale:[1,1.09,1]}} transition={{duration:3,repeat:Infinity}}>GIF</motion.div>
  </div>;
  if(index===7)return <div className="v2-art v2-art-chat">
    <motion.div animate={reduce?{}:{y:[-7,7,-7]}} transition={{duration:4,repeat:Infinity}}><MessageCircle size={112} strokeWidth={1.15}/></motion.div>
    <motion.div animate={reduce?{}:{y:[7,-7,7]}} transition={{duration:5,repeat:Infinity}}><Send size={84} strokeWidth={1.15}/></motion.div>
  </div>;
  if(index===8)return <div className="v2-art v2-art-flame">
    <motion.div animate={reduce?{}:{scale:[.95,1.08,.95],rotate:[-4,4,-4]}}
      transition={{duration:1.8,repeat:Infinity,ease:'easeInOut'}}><Flame size={190} strokeWidth={1.05}/></motion.div>
  </div>;
  if(index===9)return <div className="v2-art v2-art-persona">
    <motion.div animate={reduce?{}:{rotate:[-6,6,-6],scale:[.95,1.04,.95]}}
      transition={{duration:6,repeat:Infinity}}><Sparkles size={143} strokeWidth={.9}/></motion.div>
    <div className="v2-persona-pills">{stats.persona.traits.slice(0,3).map((trait,i)=><span key={i}>{trait}</span>)}</div>
  </div>;
  const topMonth=stats.byMonth.indexOf(Math.max(...stats.byMonth));
  const bestMonth=stats.byMonth[topMonth]>0?MONTHS[topMonth]:'—';
  return <div className="v2-art v2-art-finale">
    <motion.div className="v2-finale-card" initial={reduce?false:{rotateY:45,opacity:0}}
      animate={{rotateY:0,opacity:1}} transition={{duration:reduce?0:.35}}>
      <small>RECAP / {stats.year}</small>
      <b>{fmt(stats.totalMessages)}</b>
      <span>{pluralRu(stats.totalMessages,['сообщение','сообщения','сообщений'])} за год</span>
      <div className="v2-finale-details">
        <span><em>Активность</em><strong>{fmt(stats.activeDays)} {pluralRu(stats.activeDays,['активный день','активных дня','активных дней'])}</strong></span>
        <span><em>Лучший месяц</em><strong>{bestMonth}</strong></span>
        <span><em>Лучшая серия</em><strong>{stats.longestStreakDays} {pluralRu(stats.longestStreakDays,['день','дня','дней'])}</strong></span>
      </div>
      <div className="v2-finale-archetype"><em>Твой архетип</em><strong>{stats.persona.title}</strong></div>
    </motion.div>
  </div>;
}
export const StoriesScreen:React.FC<Props>=({stats,hideChatNames,onToggleHideNames,onClose})=>{
  const [index,setIndex]=useState(0);
  const [exportFormat,setExportFormat]=useState<'story'|'square'|null>(null);
  const reduce=useReducedMotion();
  const pointer=useRef<{x:number;y:number}|null>(null);
  const peakMonth=stats.byMonth.indexOf(Math.max(...stats.byMonth));
  const peakDay=stats.byWeekday.indexOf(Math.max(...stats.byWeekday));
  const peakHour=stats.byHour.indexOf(Math.max(...stats.byHour));
  const maxMonth=stats.byMonth[peakMonth];
  const maxDay=stats.byWeekday[peakDay];
  const maxHour=stats.byHour[peakHour];
  const voiceDuration=stats.voiceTotalDurationSec === null ? null : Math.round(stats.voiceTotalDurationSec/60);
  const topPrivate=stats.topPrivateChats[0],topGroup=stats.topGroupChats[0];
  const activeDaysLabel=pluralRu(stats.activeDays,['активный день','активных дня','активных дней']);
  const slides=[
    {title:stats.totalMessages?'Ты не молчал!':'Твой год начинается здесь',sub:'Все сообщения, которые ты отправил за год.',number:stats.totalMessages,label:pluralRu(stats.totalMessages,['сообщение','сообщения','сообщений'])},
    {title:maxMonth? 'Твой самый громкий месяц':'Без месячных рекордов',sub:maxMonth?MONTHS[peakMonth]+' был особенно активным.':'Отправленных сообщений за год пока нет.',number:maxMonth,label:pluralRu(maxMonth,['сообщение','сообщения','сообщений'])+' за месяц'},
    {title:maxDay?'Твой день недели':'Неделя без рекордов',sub:maxDay?'Больше всего сообщений в '+DAYS[peakDay].toLowerCase()+'.':'Нечего сравнить — сообщений пока нет.',number:maxDay,label:pluralRu(maxDay,['сообщение','сообщения','сообщений'])+' за день недели'},
    {title:maxHour?'Твоё любимое время':'Пикового часа пока нет',sub:maxHour?'Чаще всего ты писал с '+String(peakHour).padStart(2,'0')+':00 до '+String((peakHour+1)%24).padStart(2,'0')+':00.':'Отправленных сообщений пока нет.',number:maxHour,label:pluralRu(maxHour,['сообщение','сообщения','сообщений'])+' в этот час'},
    {title:stats.voiceCount?'Живой голос':'Голосовые? Пока нет',sub:voiceDuration===null?'Считаем голосовые, без прослушивания.':'По метаданным: '+fmt(voiceDuration)+' мин.',number:stats.voiceCount,label:pluralRu(stats.voiceCount,['голосовое','голосовых','голосовых'])},
    {title:stats.videoNoteCount?'Кружок за кружком':'Без кружочков',sub:'Видеоcообщения, которые ты отправлял.',number:stats.videoNoteCount,label:pluralRu(stats.videoNoteCount,['кружок','кружка','кружков'])},
    {title:'И не только текст',sub:'Фото, видео, стикеры и GIF — всё по метаданным.',number:stats.photoCount+stats.videoCount+stats.stickerAndGifCount,label:'медиафайлов и стикеров'},
    {title:'Главные переписки',sub:'Рейтинг только по твоим отправленным сообщениям.',number:(topPrivate?.sentMessages||0),label:pluralRu(topPrivate?.sentMessages||0,['сообщение','сообщения','сообщений'])+' в самом активном личном чате'},
    {title:stats.longestStreakDays?'Без пауз!':'Без длинных серий',sub:stats.longestStreakRange?stats.longestStreakRange.start+' — '+stats.longestStreakRange.end:'Серия считается по дням с исходящими сообщениями.',number:stats.longestStreakDays,label:pluralRu(stats.longestStreakDays,['день подряд','дня подряд','дней подряд'])},
    {title:'Твой вайб года',sub:stats.persona.subtitle,number:stats.activeDays,label:activeDaysLabel+' с сообщениями'},
    {title:'Этот год — твой',sub:'И это только твои настоящие цифры.',number:stats.totalMessages,label:''},
  ];
  const next=()=>{haptic('light');if(index>=slides.length-1)onClose();else setIndex(v=>v+1);};
  const back=()=>{haptic('light');setIndex(v=>Math.max(0,v-1));};
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==='ArrowRight')next();
      else if(e.key==='ArrowLeft')back();
      else if(e.key==='Escape')onClose();
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[index,onClose]);
  const onPointerDown=(e:React.PointerEvent<HTMLElement>)=>{
    pointer.current={x:e.clientX,y:e.clientY};
  };
  const onPointerUp=(e:React.PointerEvent<HTMLElement>)=>{
    if(!pointer.current)return;
    const dx=e.clientX-pointer.current.x,dy=e.clientY-pointer.current.y;
    pointer.current=null;
    if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5){
      if(dx<0)next();else back();
    }
  };
  const [first,second,third]=THEMES[index];
  const isFinal=index===10;
  return <main className="v2-story"
    style={{background:'radial-gradient(ellipse at 46% 30%, '+first+' 0%, '+second+' 48%, '+third+' 100%)'}}
    onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
    <div className="v2-story-sparkles" aria-hidden="true">{Array.from({length:18},(_,i)=>
      <span key={i} style={{left:(i*61%97)+'%',top:(i*37%90)+'%',animationDelay:-(i%7)+'s'}}/>)}</div>
    <header className="v2-story-top">
      <div className="v2-segments" aria-label={'История '+(index+1)+' из '+slides.length}>
        {slides.map((_,i)=><div key={i} className={i<index?'done':i===index?'current':''}>
          {i===index&&<motion.span initial={reduce?false:{scaleX:0}} animate={{scaleX:1}}
            transition={{duration:reduce?0:2.5,ease:'easeOut'}} style={{transformOrigin:'left'}}/>}</div>)}
      </div>
      <button type="button" className="v2-story-x" onClick={onClose} aria-label="Закрыть истории"><X size={20}/></button>
    </header>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={index} className="v2-story-slide" initial={reduce?false:{opacity:0,x:14,y:5}}
        animate={{opacity:1,x:0,y:0}} exit={reduce?{}:{opacity:0,x:-12,y:-4}} transition={{duration:reduce?0:.2,ease:'easeOut'}}>
        <div className="v2-story-heading">
          {stats.completionStatus==='partial'&&(index===0||isFinal)&&<span className="v2-partial">Частичная статистика</span>}
          <span className="v2-kicker">RECAP · {stats.year} / {String(index+1).padStart(2,'0')}</span>
          <h1>{slides[index].title}</h1><p>{slides[index].sub}</p>
        </div>
        <Art index={index} stats={stats}/>
        {!isFinal&&<section className="v2-story-number">
          {index===9&&<h2 className="v2-persona-title">{stats.persona.title}</h2>}
          <strong><CountUp value={slides[index].number} durationMs={950}/></strong>
          <span>{slides[index].label}</span>
          {index===6&&<div className="v2-media-stats">
            <span>Фото <b>{fmt(stats.photoCount)}</b></span>
            <span>Видео <b>{fmt(stats.videoCount)}</b></span>
            <span>Стикеры + GIF <b>{fmt(stats.stickerAndGifCount)}</b></span>
          </div>}
          {index===7&&<div className="v2-chats-preview">
            <button type="button" onClick={onToggleHideNames}>
              {hideChatNames?<Eye size={15}/>:<EyeOff size={15}/>} {hideChatNames?'Показать имена':'Скрыть имена'}
            </button>
            <div><span>Личный чат</span><b>{topPrivate?(hideChatNames?'Личный чат №1':topPrivate.displayLabel):'Нет данных'}</b></div>
            <div><span>Группа · {fmt(topGroup?.sentMessages||0)} исх.</span>
              <b>{topGroup?(hideChatNames?'Группа №1':topGroup.displayLabel):'Нет данных'}</b></div>
          </div>}
        </section>}
      </motion.div>
    </AnimatePresence>
    <footer className="v2-story-actions">
      {isFinal&&<div className="v2-export-row">
        <button type="button" onClick={()=>setExportFormat('story')}><Download size={16}/> 1080×1920</button>
        <button type="button" onClick={()=>setExportFormat('square')}><Download size={16}/> 1080×1080</button>
      </div>}
      <button type="button" className="v2-story-continue" onClick={next}>
        {isFinal?<><BarChart3 size={19}/> Подробная статистика</>:<>Продолжить <ArrowRight size={19}/></>}
      </button>
      {index>0&&<button type="button" className="v2-story-back" onClick={back}><ArrowLeft size={17}/> Назад</button>}
    </footer>
    {exportFormat&&<CardExportDialog stats={stats} format={exportFormat}
      onClose={()=>setExportFormat(null)}/>}
  </main>;
};
