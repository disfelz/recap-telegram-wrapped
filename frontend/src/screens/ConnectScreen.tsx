import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, CircleHelp, KeyRound, LockKeyhole, QrCode, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react';
import { recapApi } from '../api/client';
import { QrMatrix } from '../components/QrMatrix';
import { haptic } from '../utils/telegram';

interface Props {
  demoMode: boolean;
  onAuthorized: (authId: string) => void;
  onBack: () => void;
}
type Tab='qr'|'phone';
type Step='phone'|'code'|'2fa';

export const ConnectScreen:React.FC<Props>=({demoMode,onAuthorized,onBack})=>{
  const [tab,setTab]=useState<Tab>('qr');
  const [consent,setConsent]=useState(false);
  const [qrUrl,setQrUrl]=useState('');
  const [authId,setAuthId]=useState<string|null>(null);
  const [expiresAt,setExpiresAt]=useState(0);
  const [ttl,setTtl]=useState(30);
  const [phone,setPhone]=useState('');
  const [code,setCode]=useState('');
  const [password,setPassword]=useState('');
  const [step,setStep]=useState<Step>('phone');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [status,setStatus]=useState('Ожидаем подтверждения в Telegram');
  const activeRef=useRef(true);
  const requestRef=useRef(0);
  const completedRef=useRef(false);
  const onAuthorizedRef=useRef(onAuthorized);
  const loadingRef=useRef(false);

  useEffect(()=>{onAuthorizedRef.current=onAuthorized;},[onAuthorized]);
  useEffect(()=>()=>{activeRef.current=false;requestRef.current++;},[]);

  const finish=useCallback((id:string)=>{
    if(completedRef.current)return;
    completedRef.current=true;
    setCode('');setPassword('');
    haptic('success');
    onAuthorizedRef.current(id);
  },[]);

  const loadQr=useCallback(async()=>{
    if(!consent||demoMode||loadingRef.current)return;
    const request=++requestRef.current;
    loadingRef.current=true;setLoading(true);setError('');
    setStatus('Создаём новый QR-код…');
    try{
      const result=await recapApi.startQrAuth(true);
      if(!activeRef.current||request!==requestRef.current)return;
      setQrUrl(result.qrUrl);
      setAuthId(result.authId);
      const fromApi=Date.parse(result.expiresAt);
      // QR-rotation is capped at 30 seconds even if the server token lives longer.
      setExpiresAt(Math.min(Number.isFinite(fromApi)?fromApi:Date.now()+30000,Date.now()+30000));
      setTtl(30);
      setStatus('Ожидаем подтверждения в Telegram');
    }catch(e){
      if(activeRef.current&&request===requestRef.current)setError((e as Error).message||'Не удалось получить QR-код');
    }finally{
      if(request===requestRef.current){loadingRef.current=false;if(activeRef.current)setLoading(false);}
    }
  },[consent,demoMode]);

  useEffect(()=>{if(consent&&tab==='qr'&&!demoMode&&!qrUrl&&!loadingRef.current)void loadQr();},[consent,tab,demoMode,qrUrl,loadQr]);
  useEffect(()=>{
    if(tab!=='qr'||!consent||demoMode||!expiresAt)return;
    const ticker=window.setInterval(()=>setTtl(Math.max(0,Math.ceil((expiresAt-Date.now())/1000))),1000);
    return ()=>window.clearInterval(ticker);
  },[expiresAt,tab,consent,demoMode]);
  useEffect(()=>{
    if(tab==='qr'&&consent&&!demoMode&&expiresAt&&ttl<=0&&!loadingRef.current)void loadQr();
  },[tab,consent,demoMode,expiresAt,ttl,loadQr]);
  useEffect(()=>{
    if(demoMode||tab!=='qr'||!consent||!authId||completedRef.current)return;
    let disposed=false,checking=false;
    const poll=async()=>{
      if(checking||disposed)return;
      checking=true;
      try{
        const result=await recapApi.getQrStatus(authId);
        if(disposed||completedRef.current)return;
        if(result.status==='authorized')finish(authId);
        else if(result.status==='needs_2fa'){
          setTab('phone');setStep('2fa');setStatus('Требуется облачный пароль 2FA');
        }else if(result.status==='expired'){
          setExpiresAt(Date.now());setTtl(0);
        }else{
          setStatus('Ожидаем подтверждения в Telegram');
        }
      }catch{/* Сбой сети не означает отмену авторизации. */}
      finally{checking=false;}
    };
    void poll();
    const t=window.setInterval(()=>void poll(),2200);
    return ()=>{disposed=true;window.clearInterval(t);};
  },[tab,authId,consent,demoMode,finish]);

  async function handlePhoneSubmit(event:React.FormEvent){
    event.preventDefault();
    if(!consent||loadingRef.current)return;
    setError('');haptic('medium');
    if(demoMode){finish('demo-auth-phone');return;}
    loadingRef.current=true;setLoading(true);
    try{
      if(step==='phone'){
        const result=await recapApi.startPhoneAuth(phone.trim(),true);
        setAuthId(result.authId);
        setStep('code');
      }else if(step==='code'&&authId){
        const result=await recapApi.verifyPhoneAuth(authId,{code:code.trim()});
        if(result.status==='authorized')finish(authId);
        else if(result.status==='needs_2fa'){setCode('');setStep('2fa');}
        else setError('Код пока не подтверждён. Проверь данные и повтори.');
      }else if(step==='2fa'&&authId){
        const result=await recapApi.verifyPhoneAuth(authId,{password});
        if(result.status==='authorized')finish(authId);
        else setError('Пароль не подтверждён. Попробуй снова.');
      }else{
        setError('Авторизация устарела. Начни вход заново.');
        setStep('phone');
      }
    }catch(e){setError((e as Error).message||'Ошибка авторизации.');}
    finally{loadingRef.current=false;if(activeRef.current)setLoading(false);}
  }

  return <main className="screen flagship-connect">
    <header className="flagship-screen-heading">
      <button type="button" className="flagship-back" onClick={()=>{haptic('light');onBack();}} aria-label="Назад"><ArrowLeft size={18}/></button>
      <div><span className="flagship-eyebrow">RECAP / 02</span><h1>Подключение</h1></div>
    </header>
    <div className="flagship-connect-intro">
      <div className="flagship-connect-glyph"><LockKeyhole size={26}/></div>
      <h2>Твоя история начинается здесь.</h2>
      <p>Подключи Telegram, чтобы увидеть реальную статистику своего общения. Никаких импортов чатов и файлов.</p>
    </div>

    <div className="flagship-access-disclosure">
      <ShieldAlert size={19} aria-hidden="true"/>
      <div><strong>Важно знать перед входом</strong>
        <p>MTProto не имеет режима «только чтение»: временная сессия технически получает широкие права аккаунта. Она шифруется AES-256-GCM и завершается запросом LogOut после анализа или отмены. Тексты сообщений не сохраняются, медиа не скачиваются.</p>
      </div>
    </div>
    <label className="flagship-consent">
      <input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);haptic('selection');}}/>
      <span className="flagship-check-icon"><Check size={15}/></span>
      <span>Я понимаю объём доступа временной MTProto-сессии и согласен на анализ исходящих сообщений.</span>
    </label>
    <section className="flagship-auth-section">
      <div className="flagship-auth-tabs" role="tablist" aria-label="Способ подключения">
        {[{key:'qr' as const,label:'QR-код',icon:<QrCode size={16}/>},{key:'phone' as const,label:'Одно устройство',icon:<Smartphone size={16}/>}].map(t=>
          <button role="tab" type="button" key={t.key} aria-selected={tab===t.key} onClick={()=>{setTab(t.key);setError('');haptic('selection');}}>
            {tab===t.key&&<motion.span layoutId="flagship-auth-tab-bg" className="flagship-auth-tab-active"
              transition={{type:'spring',stiffness:430,damping:36}}/>}
            <span>{t.icon}{t.label}</span>
          </button>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {tab==='qr'?
          <motion.div key="qr" className="flagship-auth-body" initial={{opacity:0,x:15}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-15}}
            transition={{duration:.19}}>
            {!consent?<div className="flagship-auth-placeholder"><CircleHelp size={25}/><p>Подтверди согласие выше, чтобы получить QR-код.</p></div>
            :demoMode?<div className="flagship-auth-placeholder">
              <QrCode size={35}/><p>Демо-режим работает без подключения Telegram.</p>
              <button type="button" className="btn btn-primary" onClick={()=>finish('demo-auth-qr')}>Запустить демонстрацию <ArrowRight size={16}/></button>
            </div>:<>
              <div className="flagship-qr-frame">
                {qrUrl?<QrMatrix value={qrUrl} size={202}/>:<div className="flagship-qr-empty"><RefreshCw size={25}/><span>Готовим QR-код…</span></div>}
              </div>
              <div className="flagship-qr-caption">
                <strong>{loading?'Обновляем код…':ttl>0?status:'Обновляем QR-код…'}</strong>
                <span>Открой Telegram на другом устройстве → Настройки → Устройства → Подключить устройство</span>
              </div>
              <div className="flagship-qr-timer">
                <span>Обновление через {ttl} сек.</span>
                <div><motion.span initial={false} animate={{scaleX:Math.min(1,ttl/30)}} transition={{duration:.15}}/></div>
              </div>
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={()=>{haptic('light');void loadQr();}}>
                <RefreshCw size={16}/> Обновить QR
              </button>
            </>}
          </motion.div>:
          <motion.form key="phone" className="flagship-auth-body flagship-phone-form" initial={{opacity:0,x:15}}
            animate={{opacity:1,x:0}} exit={{opacity:0,x:-15}} transition={{duration:.19}} onSubmit={e=>void handlePhoneSubmit(e)}>
            <span className="flagship-eyebrow">ШАГ {step==='phone'?'01':step==='code'?'02':'03'} / 03</span>
            <h3>{step==='phone'?'Номер телефона':step==='code'?'Подтверждение входа':'Облачный пароль'}</h3>
            <p>{step==='phone'?'Укажи номер в международном формате.':step==='code'?'Введи код из официального Telegram. Не сообщай его никому.':'Если на аккаунте включена двухэтапная проверка, нужен пароль 2FA.'}</p>
            {step==='phone'&&<input className="input-field" type="tel" inputMode="tel" autoComplete="tel" value={phone}
              onChange={e=>setPhone(e.target.value)} placeholder="+7 999 000 00 00" disabled={!consent||loading} required={!demoMode}/>}
            {step==='code'&&<input className="input-field" type="text" inputMode="numeric" autoComplete="one-time-code"
              value={code} onChange={e=>setCode(e.target.value)} placeholder="Код из Telegram" required/>}
            {step==='2fa'&&<input className="input-field" type="password" autoComplete="off" value={password}
              onChange={e=>setPassword(e.target.value)} placeholder="Пароль облачной защиты" required/>}
            <button type="submit" className="btn btn-primary" disabled={!consent||loading}>
              {loading?'Подключаем…':demoMode?'Запустить демо':step==='phone'?'Получить код':step==='code'?'Подтвердить код':'Подтвердить пароль'}
              <ArrowRight size={17}/>
            </button>
            <div className="flagship-auth-hint">Это форма RECAP, не системное окно Telegram. Коды и пароли не сохраняются в базе.</div>
          </motion.form>}
      </AnimatePresence>
    </section>
    {error&&<div className="flagship-inline-error" role="alert">{error}</div>}
  </main>;
};
