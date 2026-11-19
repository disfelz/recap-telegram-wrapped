import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X,
  Download,
  Share2,
  Eye,
  EyeOff,
  Mic,
  Video,
  Image as ImageIcon,
  Flame,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import type { RecapStats } from '../../../shared/types';
import { CountUp } from '../components/CountUp';
import { CardExportDialog } from '../components/CardExportDialog';
import { haptic } from '../utils/telegram';

const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const MONTHS_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

interface StoriesScreenProps {
  stats: RecapStats;
  hideChatNames: boolean;
  onToggleHideNames: () => void;
  onClose: () => void;
}

const TOTAL_SLIDES = 12;

export const StoriesScreen: React.FC<StoriesScreenProps> = ({
  stats,
  hideChatNames,
  onToggleHideNames,
  onClose,
}) => {
  const [slide, setSlide] = useState(0);
  const [exportSelection, setExportSelection] = useState<{format: 'story' | 'square'; action: 'download' | 'share'} | null>(null);
  const [revealed, setRevealed] = useState(false);
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const draggedRef = useRef(false);

  const next = () => {
    setPaused(false);
    haptic('light');
    setSlide((s) => (s < TOTAL_SLIDES - 1 ? s + 1 : s));
  };
  const prev = () => {
    setPaused(false);
    haptic('light');
    setSlide((s) => (s > 0 ? s - 1 : s));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (slide === 11) {
      const t = setTimeout(() => {
        setRevealed(true);
        haptic('success');
      }, 280);
      return () => clearTimeout(t);
    } else {
      setRevealed(false);
    }
  }, [slide]);

  const peakMonthIdx = stats.byMonth.indexOf(Math.max(...stats.byMonth));
  const peakWeekdayIdx = stats.byWeekday.indexOf(Math.max(...stats.byWeekday));
  const peakHourIdx = stats.byHour.indexOf(Math.max(...stats.byHour));
  const maxMonthVal = Math.max(...stats.byMonth, 1);
  const maxWeekdayVal = Math.max(...stats.byWeekday, 1);

  const voiceMinutes =
    stats.voiceTotalDurationSec !== null ? Math.round(stats.voiceTotalDurationSec / 60) : null;

  const handleExport = (fmt: 'story' | 'square', action: 'download' | 'share' = 'download') => {
    haptic('medium');
    setPaused(true);
    setExportSelection({format:fmt,action});
  };

  const renderSlide = () => {
    switch (slide) {
      case 0:
        return (
          <>
            <div className="flagship-story-intro-orbit" aria-hidden="true"><span/><span/></div>
            <div style={{margin:'auto 0',textAlign:'left'}}>
              <div className="ref-story-chapter">RECAP · ПЕРСОНАЛЬНАЯ ХРОНИКА</div>
              <h1 className="display-font" style={{fontSize:'clamp(70px,23vw,100px)',letterSpacing:-6,lineHeight:.95,margin:'12px 0 38px',
                background:'linear-gradient(120deg,#f0ebff,#9daeff)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
                {stats.year}
              </h1>
              <div style={{width:70,height:1,background:'linear-gradient(90deg,#a996ff,transparent)',marginBottom:18}}/>
              <p style={{fontSize:17,color:'#f0eefa',maxWidth:285,lineHeight:1.48}}>
                Год в цифрах. Без домыслов — только твои отправленные сообщения.
              </p>
              {stats.completionStatus === 'partial' &&
                <p style={{fontSize:12,color:'var(--warning)',marginTop:15}}>Часть чатов не была досчитана.</p>}
            </div>
            <div className="ref-story-footer" style={{display:'flex',justifyContent:'space-between',gap:8}}>
              <span>Проверено {stats.metrics.processedDialogs} диалогов</span><span style={{color:'#aaa0ef'}}>Нажми далее →</span>
            </div>
          </>
        );

      case 1:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 700 }}>
              02 · МАСШТАБ ГОДА
            </div>
            <div className="display-font" style={{ fontSize: 60, fontWeight: 700, margin: '14px 0 8px' }}>
              <CountUp value={stats.totalMessages} />
            </div>
            <p style={{ fontSize: 17, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
              сообщений ты отправил за {stats.year} год.
            </p>
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>АКТИВНЫХ ДНЕЙ</div>
                <div className="display-font tabular" style={{ fontSize: 28, fontWeight: 700 }}>
                  {stats.activeDays}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>В СРЕДНЕМ В ДЕНЬ</div>
                <div className="display-font tabular" style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-purple)' }}>
                  {Math.round(stats.totalMessages / Math.max(stats.activeDays, 1))}
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <>
            <div className="ref-story-chapter" style={{marginTop:8}}>03 · КУЛЬМИНАЦИЯ ГОДА</div>
            <div style={{margin:'auto 0'}}>
              <span style={{color:'#b7b3c4',fontSize:14}}>Самый насыщенный месяц</span>
              <h2 className="display-font" style={{fontSize:43,lineHeight:1.1,margin:'5px 0 8px'}}>{MONTHS_FULL[peakMonthIdx]}</h2>
              <div style={{fontSize:14,color:'#9a96ae'}}>
                <strong style={{color:'#b9a2ff',fontSize:18}}>{stats.byMonth[peakMonthIdx].toLocaleString('ru-RU')}</strong> отправленных сообщений
              </div>
              <div className="ref-story-card" style={{marginTop:26}}>
                <div style={{height:156,display:'grid',gridTemplateColumns:'repeat(12,minmax(0,1fr))',alignItems:'end',gap:5}}>
                  {stats.byMonth.map((v,i)=>(
                    <div key={i} style={{height:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',alignItems:'center',gap:7,minWidth:0}}>
                      <motion.div initial={reduceMotion?false:{scaleY:0}} animate={{scaleY:1}} transition={{duration:.4,delay:i*.025}}
                        style={{width:'100%',height:Math.max(4,v/maxMonthVal*122),transformOrigin:'bottom',borderRadius:5,
                          background:i===peakMonthIdx?'linear-gradient(#a996ff,#85b8ff)':'#353241'}}/>
                      <span style={{fontSize:9,color:i===peakMonthIdx?'#fff':'#838096'}}>{MONTHS_SHORT[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="ref-story-footer">
              В этом месяце прошло {stats.totalMessages?Math.round(stats.byMonth[peakMonthIdx]/stats.totalMessages*100):0}% твоей годовой активности.
            </div>
          </>
        );

      case 3:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 700 }}>
              04 · РИТМ НЕДЕЛИ
            </div>
            <h2 className="display-font" style={{ fontSize: 40, margin: '10px 0 6px' }}>
              {WEEKDAYS_FULL[peakWeekdayIdx]}
            </h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 22px', fontSize: 15 }}>
              В этот день ты пишешь чаще всего — {stats.byWeekday[peakWeekdayIdx].toLocaleString('ru-RU')} сообщений.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.byWeekday.map((v, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 56px', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: i === peakWeekdayIdx ? '#F7F5FF' : 'var(--text-secondary)' }}>
                    {WEEKDAYS[i]}
                  </span>
                  <div style={{ height: 10, borderRadius: 99, background: 'rgba(247,245,255,0.08)', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.5, delay: i * 0.04 }}
                      style={{
                        height: '100%',
                        width: `${(v / maxWeekdayVal) * 100}%`,
                        transformOrigin: 'left center',
                        borderRadius: 99,
                        background: i === peakWeekdayIdx ? '#A996FF' : 'rgba(133,184,255,0.45)',
                      }}
                    />
                  </div>
                  <span className="tabular" style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {v.toLocaleString('ru-RU')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <>
            <div className="ref-story-chapter" style={{marginTop:8}}>05 · БИОРИТМ 24/7</div>
            <div style={{margin:'auto 0',textAlign:'center'}}>
              <span className="pill" style={{fontSize:10,marginBottom:8}}>Время активности</span>
              <h2 className="display-font" style={{fontSize:36,margin:'8px 0 18px',letterSpacing:-1}}>
                {String(peakHourIdx).padStart(2,'0')}:00–{String((peakHourIdx+1)%24).padStart(2,'0')}:00
              </h2>
              <svg viewBox="0 0 280 280" className="ref-story-radial" role="img" aria-label="Почасовая активность">
                {[0,1,2].map((n)=><circle key={n} cx="140" cy="140" r={64+n*32} fill="none" stroke="rgba(169,150,255,.1)"/>)}
                {stats.byHour.map((v,h)=>{
                  const a=h/24*Math.PI*2-Math.PI/2;
                  const r=54,r2=61+Math.max(3,v/Math.max(1,...stats.byHour)*68);
                  return <line key={h} x1={140+Math.cos(a)*r} y1={140+Math.sin(a)*r}
                    x2={140+Math.cos(a)*r2} y2={140+Math.sin(a)*r2}
                    stroke={h===peakHourIdx?'#b19bff':h<6?'#9e8ee6':'#85b8ff'}
                    strokeWidth={h===peakHourIdx?5:3.5} strokeLinecap="round" opacity={h===peakHourIdx?1:.7}/>;
                })}
                <circle cx="140" cy="140" r="49" fill="#151226" stroke="#55467c" strokeWidth="1"/>
                <text x="140" y="136" fill="#a6a0bf" fontSize="11" textAnchor="middle">ПИК</text>
                <text x="140" y="158" fill="#f3f0ff" fontSize="25" fontWeight="bold" textAnchor="middle">{peakHourIdx}ч</text>
                <text x="140" y="14" fill="#9693ab" fontSize="11" textAnchor="middle">00</text>
                <text x="266" y="144" fill="#9693ab" fontSize="11" textAnchor="middle">06</text>
                <text x="140" y="277" fill="#9693ab" fontSize="11" textAnchor="middle">12</text>
                <text x="15" y="144" fill="#9693ab" fontSize="11" textAnchor="middle">18</text>
              </svg>
              <p style={{fontSize:12,color:'#9693ab'}}>
                В пиковый час отправлено {stats.byHour[peakHourIdx].toLocaleString('ru-RU')} сообщений.
              </p>
            </div>
            <div className="ref-story-footer">График построен с учётом часового пояса {stats.timezone}.</div>
          </>
        );

      case 5:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 700 }}>
              06 · ГОЛОСОВЫЕ СООБЩЕНИЯ
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 8px' }}>
              <div style={{ width: 54, height: 54, borderRadius: 18, background: 'rgba(169,150,255,0.16)', display: 'grid', placeItems: 'center' }}>
                <Mic size={26} color="#A996FF" />
              </div>
              <div className="display-font" style={{ fontSize: 52, fontWeight: 700 }}>
                <CountUp value={stats.voiceCount} />
              </div>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: '0 0 22px' }}>
              {voiceMinutes !== null
                ? `Общая длительность по метаданным — около ${voiceMinutes.toLocaleString('ru-RU')} минут.`
                : 'Длительность голосовых не возвращена в метаданных Telegram.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 56 }}>
              {Array.from({ length: 28 }).map((_, idx) => (
                <motion.div
                  key={idx}
                  aria-hidden="true"
                  initial={false}
                  animate={reduceMotion?{}:{scaleY:[.75,1.22,.48,1]}}
                  transition={{duration:1.5+idx%4*.16,repeat:Infinity,ease:'easeInOut',delay:idx*.045}}
                  style={{
                    flex: 1,
                    height: `${18 + ((idx * 17) % 38)}px`,
                    transformOrigin:'center',
                    borderRadius: 99,
                    background: idx % 3 === 0 ? '#A996FF' : 'rgba(133,184,255,0.4)',
                  }}
                />
              ))}
            </div>
          </div>
        );

      case 6:
        return (
          <>
            <div className="ref-story-chapter" style={{marginTop:8}}>07 · В КАДРЕ</div>
            <div style={{margin:'auto 0',textAlign:'center'}}>
              <div className="flagship-video-orbit">
                <motion.div className="flagship-video-ring" animate={reduceMotion?{}:{scale:[1,1.09,1],opacity:[.55,1,.55]}}
                  transition={{duration:3,repeat:Infinity,ease:'easeInOut'}}/>
                <div className="flagship-video-core">
                  <Video size={18} color="#afacff"/>
                  <strong className="tabular"><CountUp value={stats.videoNoteCount}/></strong>
                  <span>КРУЖКОВ</span>
                </div>
              </div>
              <h2 className="display-font" style={{fontSize:26,margin:'27px 0 8px'}}>Моменты в прямом эфире</h2>
              <p style={{fontSize:13,color:'#9d99b4',maxWidth:270,margin:'0 auto',lineHeight:1.55}}>
                {stats.videoNoteCount.toLocaleString('ru-RU')} видеосообщений, отправленных тобой в {stats.year} году.
              </p>
            </div>
            <div className="ref-story-footer">Подсчитаны только твои исходящие видеосообщения.</div>
          </>
        );

      case 7:
        return (
          <>
            <div className="ref-story-chapter" style={{marginTop:8}}>08 · ВИЗУАЛЬНЫЙ ЯЗЫК</div>
            <div style={{margin:'auto 0'}}>
              <h2 className="display-font" style={{fontSize:30,margin:'0 0 22px'}}>Не только слова.</h2>
              <div className="flagship-media-layout">
                <div className="flagship-media-hero"><ImageIcon size={22}/>
                  <strong className="tabular"><CountUp value={stats.photoCount}/></strong><span>Фотографий</span></div>
                <div className="flagship-media-side"><Video size={20}/>
                  <strong className="tabular"><CountUp value={stats.videoCount}/></strong><span>Видеофайлов</span></div>
                <div className="flagship-media-side flagship-media-stickers">
                  <span style={{fontSize:20}}>✳</span><strong className="tabular"><CountUp value={stats.stickerAndGifCount}/></strong>
                  <span>Стикеров и GIF</span></div>
              </div>
              <p style={{fontSize:11,color:'#9693ab',marginTop:18}}>Каждый формат — отдельная часть твоего общения.</p>
            </div>
          </>
        );

      case 8:
        return (
          <>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,marginTop:8}}>
              <div className="ref-story-chapter">09 · ТОЧКИ ПРИТЯЖЕНИЯ</div>
              <button type="button" className="ref-story-btn" style={{padding:'6px 9px'}}
                onClick={(e)=>{e.stopPropagation();onToggleHideNames();}}>
                {hideChatNames?<Eye size={13}/>:<EyeOff size={13}/>}
                {hideChatNames?'Показать имена':'Скрыть имена'}
              </button>
            </div>
            <div style={{margin:'auto 0'}}>
              <h2 className="display-font" style={{fontSize:25,margin:'0 0 4px'}}>Самые активные чаты</h2>
              <p style={{color:'#9693ab',fontSize:11,marginBottom:17}}>Рейтинг строго по твоим исходящим сообщениям</p>
              {[
                {title:'ЛИЧНЫЕ ПЕРЕПИСКИ · ТОП-3',items:stats.topPrivateChats.slice(0,3),group:false},
                {title:'ГРУППОВЫЕ ЧАТЫ · ТОП-3',items:stats.topGroupChats.slice(0,3),group:true},
              ].map((section)=><div key={section.title} className="ref-story-card" style={{marginBottom:10,padding:'13px 12px'}}>
                <div style={{fontSize:10,letterSpacing:1.1,color:section.group?'#85b8ff':'#a996ff',marginBottom:9}}>
                  {section.title}
                </div>
                {section.items.length===0&&<p style={{fontSize:12,color:'#9693ab'}}>Данных нет</p>}
                {section.items.map((c,i)=><div key={c.chatHash}
                  style={{display:'grid',gridTemplateColumns:'20px minmax(0,1fr) auto',gap:7,marginTop:7,fontSize:11,color:'#d5d0e2'}}>
                  <span style={{color:'#9693ab'}}>0{i+1}</span>
                  <span className={hideChatNames?'flagship-name-spoiler':''}
                    aria-label={hideChatNames?'Имя скрыто':c.displayLabel}
                    style={{overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
                    {c.displayLabel || (section.group?'Группа ':'Личный чат ')+(i+1)}
                  </span><span style={{color:'#b6a5ee'}}>{c.sentMessages.toLocaleString('ru-RU')}</span>
                </div>)}
              </div>)}
            </div>
            <div className="ref-story-footer">По умолчанию имена скрыты на экспортируемой открытке.</div>
          </>
        );

      case 9:
        return (
          <>
            <div className="ref-story-chapter" style={{marginTop:8}}>10 · БЕЗ ПЕРЕРЫВА</div>
            <div style={{margin:'auto 0',textAlign:'center'}}>
              <div className="flagship-streak-figure">
                <Flame size={27} color="#b6a5ff"/>
                <strong className="tabular"><CountUp value={stats.longestStreakDays}/></strong>
                <span>ДНЕЙ ПОДРЯД</span>
              </div>
              <h2 className="display-font" style={{fontSize:26,margin:'22px 0 6px'}}>Всегда на связи</h2>
              {stats.longestStreakRange&&<div className="flagship-streak-dates">
                <span>{stats.longestStreakRange.start}</span><span className="flagship-streak-date-line"/><span>{stats.longestStreakRange.end}</span>
              </div>}
              <p style={{fontSize:12,color:'#9693ab',margin:'20px auto 0',maxWidth:270}}>
                Столько дней подряд ты отправлял хотя бы одно сообщение.
              </p>
            </div>
          </>
        );

      case 10:
        return (
          <>
            <div className="ref-story-chapter" style={{marginTop:8}}>11 · ТВОЁ ЗВУЧАНИЕ</div>
            <div style={{margin:'auto 0',textAlign:'center'}}>
              <div style={{width:140,height:140,borderRadius:'50%',margin:'0 auto 18px',display:'grid',placeItems:'center',
                background:'repeating-radial-gradient(circle,#100f1d 0 8px,#24203c 9px 10px)',border:'1px solid rgba(169,150,255,.18)'}}>
                <div style={{width:42,height:42,borderRadius:'50%',background:'#a996ff',boxShadow:'0 0 20px rgba(169,150,255,.4)',display:'grid',placeItems:'center'}}>
                  <div style={{width:12,height:12,borderRadius:'50%',background:'#151126'}}/>
                </div>
              </div>
              <span className="ref-story-chapter">RECAP · {stats.persona.code.replace(/_/g,'-')}</span>
              <h2 className="display-font" style={{fontSize:32,lineHeight:1.06,margin:'10px 0'}}>{stats.persona.title}</h2>
              <p style={{fontSize:12,color:'#a39fb8',maxWidth:280,margin:'0 auto',lineHeight:1.5}}>{stats.persona.subtitle}</p>
              <div className="ref-story-card" style={{marginTop:18,textAlign:'left'}}>
                <span style={{color:'#9693ab',fontSize:10}}>ПОЧЕМУ ВЫПАЛ ЭТОТ ХАРАКТЕР</span>
                <ul style={{paddingLeft:15,margin:'10px 0 0',color:'#c6c1dd',fontSize:11,lineHeight:1.7}}>
                  {stats.persona.traits.map((trait)=><li key={trait}>{trait}</li>)}
                </ul>
              </div>
            </div>
            <div className="ref-story-footer">Прозрачные правила без ИИ и чтения текстов переписок.</div>
          </>
        );

      case 11:
      default:
        return (
          <>
            <div className="ref-story-chapter" style={{marginTop:8}}>12 · ИТОГОВАЯ ОТКРЫТКА</div>
            <div style={{margin:'auto 0'}}>
              <motion.div initial={{opacity:0,scale:.92,rotateX:12,y:15}} animate={{opacity:revealed?1:.3,scale:revealed?1:.96,rotateX:0,y:0}}
                transition={{duration:.6}} className="ref-story-final flagship-story-shimmer">
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:11,fontWeight:700}}>
                  <span style={{display:'flex',alignItems:'center',gap:7}}><span style={{color:'#a996ff'}}>◎</span> RECAP</span>
                  <span className="pill" style={{padding:'4px 9px'}}>{stats.year}</span>
                </div>
                <div style={{marginTop:17}}>
                  <span className="ref-story-final-label">ОТПРАВЛЕНО СООБЩЕНИЙ</span>
                  <div className="ref-story-final-total">{stats.totalMessages.toLocaleString('ru-RU')}</div>
                </div>
                <div className="ref-story-final-grid">
                  <div><label>ПИКОВЫЙ МЕСЯЦ</label><b>{MONTHS_FULL[peakMonthIdx]}</b></div>
                  <div><label>АКТИВНЫХ ДНЕЙ</label><b>{stats.activeDays} · серия {stats.longestStreakDays}д</b></div>
                  <div className="wide"><label>ХАРАКТЕР</label><b>{stats.persona.title}</b></div>
                </div>
                {stats.completionStatus==='partial'&&<p style={{color:'#ffd17a',fontSize:10,marginTop:11}}>Частичная статистика</p>}
              </motion.div>
            </div>
            <div>
              <div className="ref-story-cta">
                <button type="button" className="ref-story-btn primary"
                  onClick={(e)=>{e.stopPropagation();void handleExport('story');}}><Download size={14}/> 9:16 (1080×1920)</button>
                <button type="button" className="ref-story-btn"
                  onClick={(e)=>{e.stopPropagation();void handleExport('square');}}><Download size={14}/> 1:1 (1080×1080)</button>
                <button type="button" className="ref-story-btn"
                  onClick={(e)=>{e.stopPropagation();void handleExport('story', 'share');}}><Share2 size={14}/> Поделиться</button>
                <button type="button" className="ref-story-btn"
                  onClick={(e)=>{e.stopPropagation();onClose();}}><BarChart3 size={14}/> Аналитика</button>
              </div>
              
            </div>
          </>
        );


    }
  };

  return (
    <>
    <motion.div
      className="story-fullscreen"
      drag="x"
      dragMomentum={true}
      dragTransition={{bounceStiffness:550,bounceDamping:34}}
      dragElastic={0.14}
      dragConstraints={{left:0,right:0}}
      onDragEnd={(_event,info)=>{
        if(Math.abs(info.offset.x)>45||Math.abs(info.velocity.x)>430){
          draggedRef.current=true;
          if(info.offset.x<0||info.velocity.x< -430)next();else prev();
        }
        setPaused(false);
      }}
      onPointerDown={()=>setPaused(true)}
      onPointerUp={()=>setPaused(false)}
      onPointerCancel={()=>setPaused(false)}
      onPointerLeave={()=>setPaused(false)}
      onContextMenu={e=>e.preventDefault()}
      onClick={e=>{
        if(draggedRef.current){draggedRef.current=false;return;}
        if((e.target as HTMLElement).closest('button,input,a'))return;
        const rect=e.currentTarget.getBoundingClientRect();
        if(e.clientX-rect.left<rect.width*.35)prev();else next();
      }}
    >
      <div className="story-bars" style={{ gridTemplateColumns: `repeat(${TOTAL_SLIDES}, 1fr)` }}>
        {Array.from({ length: TOTAL_SLIDES }).map((_, idx) => (
          <div key={idx} className="story-bar-track">
            <div
              key={idx===slide?'current-'+slide:'static-'+idx}
              className={'story-bar-fill '+(idx===slide&&slide<TOTAL_SLIDES-1&&!reduceMotion?'flagship-story-progress':'')}
              style={{width:idx<=slide?'100%':'0%',transformOrigin:'left center',
                transform:idx>slide?'scaleX(0)':idx<slide||slide===TOTAL_SLIDES-1||reduceMotion?'scaleX(1)':undefined,
                animationPlayState:paused?'paused':'running'}}
              onAnimationEnd={e=>{if(e.target===e.currentTarget&&idx===slide&&slide<TOTAL_SLIDES-1)next();}}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {slide + 1} / {TOTAL_SLIDES}
        </span>
        <button
          onClick={onClose}
          style={{
            width: 34,
            height: 34,
            borderRadius: 99,
            border: '1px solid var(--border)',
            background: 'rgba(247,245,255,0.06)',
            color: 'var(--text-primary)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22 }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          {renderSlide()}
        </motion.div>
      </AnimatePresence>
    </motion.div>
    {exportSelection && <CardExportDialog stats={stats} format={exportSelection.format}
      requestedAction={exportSelection.action} onClose={() => {setExportSelection(null);setPaused(false);}} />}
    </>
  );
};
