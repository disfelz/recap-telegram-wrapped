import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Database, Globe2, LockKeyhole, ShieldCheck, Trash2, X } from 'lucide-react';
import { haptic } from '../utils/telegram';

const TIMEZONES=[
  {id:'Europe/Moscow',label:'Москва · UTC+3'},
  {id:'Europe/Kaliningrad',label:'Калининград · UTC+2'},
  {id:'Asia/Yekaterinburg',label:'Екатеринбург · UTC+5'},
  {id:'Asia/Novosibirsk',label:'Новосибирск · UTC+7'},
  {id:'Asia/Vladivostok',label:'Владивосток · UTC+10'},
  {id:'UTC',label:'UTC · Всемирное время'},
];

interface Props{
  timezone:string;hideChatNames:boolean;demoMode:boolean;demoAllowed:boolean;
  onChangeTimezone:(tz:string)=>void;onToggleHideNames:()=>void;onToggleDemoMode:()=>void;onDeleteAll:()=>Promise<void>;
}

export const SettingsScreen:React.FC<Props>=({
  timezone,hideChatNames,demoMode,demoAllowed,onChangeTimezone,onToggleHideNames,onToggleDemoMode,onDeleteAll,
})=>{
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!confirmDelete)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!deleting)setConfirmDelete(false);};
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[confirmDelete,deleting]);

  async function handleDelete(){
    if(deleting)return;
    setDeleting(true);setError('');
    try{
      await onDeleteAll();
      haptic('success');
      setConfirmDelete(false);
    }catch(e){
      setError((e as Error).message||'Не удалось удалить данные.');
      haptic('medium');
    }finally{setDeleting(false);}
  }

  return <main className="screen flagship-settings">
    <div className="v2-top-fade-scrim" aria-hidden="true" />
    <header className="flagship-settings-head"><span className="flagship-eyebrow">RECAP / КОНТРОЛЬ</span>
      <h1>Настройки<br/><em>и приватность.</em></h1>
      <p>Ты управляешь тем, что RECAP анализирует, показывает и сохраняет.</p>
    </header>
    <section className="flagship-settings-section">
      <div className="flagship-setting-title"><Globe2 size={17}/><div><h2>Часовой пояс</h2><p>Для границ года и графиков активности</p></div></div>
      <select className="input-field flagship-timezone" aria-label="Часовой пояс расчёта" value={timezone} onChange={e=>{haptic('selection');onChangeTimezone(e.target.value);}}>
        {!TIMEZONES.some(t=>t.id===timezone)&&<option value={timezone}>{timezone}</option>}
        {TIMEZONES.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}
      </select>
      <p className="flagship-settings-footnote">Изменение часового пояса применяется к следующему анализу. Сохранённые результаты не пересчитываются автоматически.</p>
    </section>
    <section className="flagship-settings-section">
      <div className="flagship-setting-row">
        <div><div className="flagship-setting-title"><LockKeyhole size={17}/><h2>Имена собеседников скрыты</h2></div>
          <p>В рейтингах используются «Личный чат #1» и «Группа #1». После автоматического выхода названия недоступны. В PNG имён и ID нет.</p></div>
        <ShieldCheck size={20} aria-hidden="true"/>
      </div>
    </section>
    {demoAllowed&&<section className="flagship-settings-section">
      <div className="flagship-setting-row">
        <div><div className="flagship-setting-title"><Database size={17}/><h2>Демонстрационный режим</h2></div>
          <p>Изолированный предпросмотр без вызова реального API и Telegram-авторизации.</p></div>
        <label className="flagship-switch" aria-label="Демонстрационный режим">
          <input type="checkbox" checked={demoMode} onChange={()=>{haptic('selection');onToggleDemoMode();}}/>
          <span className="flagship-switch-track"><span/></span>
        </label>
      </div>
    </section>}
    <section className="flagship-settings-security">
      <div className="flagship-setting-title"><ShieldCheck size={19}/><h2>Прозрачно и безопасно</h2></div>
      <div className="flagship-security-facts">
        <p><span>01</span> Анализируются только твои отправленные сообщения и метаданные.</p>
        <p><span>02</span> Тексты переписок и медиафайлы не сохраняются в RECAP.</p>
        <p><span>03</span> Временный MTProto-сеанс шифруется AES-256-GCM и нужен только на время подсчёта (обычно 1–3 минуты, иногда дольше). После результата, отмены или ошибки RECAP вызывает Telegram LogOut и удаляет файл. Если Telegram не подтвердит выход, мы предупредим. Во время паузы сеанс активен. У MTProto нет режима «только чтение»: доступ технически широкий.</p>
        <p><span>04</span> Статистика хранится в Cloudflare D1 до удаления.</p>
      </div>
    </section>
    {!demoMode&&<button type="button" className="flagship-delete-trigger" onClick={()=>{haptic('medium');setConfirmDelete(true);setError('');}}>
      <Trash2 size={17}/> Отключить аккаунт и удалить все данные <span>↗</span>
    </button>}
    {demoMode?<p className="flagship-settings-footnote">В демо нет твоих данных. Отключи демо, чтобы управлять реальным аккаунтом.</p>:
    <p className="flagship-settings-footnote">Это действие необратимо. Повторный анализ потребует нового подключения.</p>}
    <AnimatePresence>
      {confirmDelete&&<motion.div className="flagship-modal-backdrop" role="presentation"
        initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
        onClick={()=>{if(!deleting)setConfirmDelete(false);}}>
        <motion.div role="dialog" aria-modal="true" aria-labelledby="flagship-confirm-title"
          className="flagship-modal" initial={{opacity:0,scale:.94,y:24}} animate={{opacity:1,scale:1,y:0}}
          exit={{opacity:0,scale:.96,y:12}} transition={{type:'spring',stiffness:410,damping:35}}
          onClick={e=>e.stopPropagation()}>
          <button className="flagship-modal-close" type="button" disabled={deleting} onClick={()=>setConfirmDelete(false)} aria-label="Закрыть"><X size={17}/></button>
          <div className="flagship-modal-icon"><AlertTriangle size={25}/></div>
          <span className="flagship-eyebrow">НЕОБРАТИМОЕ ДЕЙСТВИЕ</span>
          <h2 id="flagship-confirm-title">Удалить свою историю из RECAP?</h2>
          <p>Сохранённые результаты и настройки будут удалены. Если идёт анализ, он будет остановлен. RECAP отзовёт временный сеанс, если он ещё активен. Это не удаляет сообщения из Telegram.</p>
          {error&&<div className="flagship-inline-error" role="alert">{error}</div>}
          <div className="flagship-modal-actions">
            <button type="button" className="btn btn-secondary" disabled={deleting} onClick={()=>setConfirmDelete(false)}>Оставить</button>
            <button type="button" className="btn btn-danger" disabled={deleting} onClick={()=>void handleDelete()}>
              {deleting?'Удаляем…':'Удалить данные'}
            </button>
          </div>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  </main>;
};
