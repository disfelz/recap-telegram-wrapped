import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, Lock, QrCode, ShieldCheck, Smartphone, X } from 'lucide-react';
import { recapApi } from '../api/client';
import { QrMatrix } from '../components/QrMatrix';
import { haptic, requestOwnContact } from '../utils/telegram';

interface Props {
  selectedYear:number;
  availableYears:number[];
  onSelectYear:(year:number)=>void;
  onAuthorized:(authId:string)=>void|Promise<void>;
  onShowDemo?:()=>void;
}
type Step='phone'|'code'|'password';
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export const ConnectScreen:React.FC<Props>=({
  selectedYear,availableYears,onSelectYear,onAuthorized,onShowDemo
})=>{
  const [step,setStep]=useState<Step>('phone');
  const [consent,setConsent]=useState(false);
  const [phone,setPhone]=useState('');
  const [code,setCode]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [authId,setAuthId]=useState<string|null>(null);
  const [qrOpen,setQrOpen]=useState(false);
  const [qrUrl,setQrUrl]=useState('');
  const [qrExpiresAt,setQrExpiresAt]=useState(0);
  const [secondsLeft,setSecondsLeft]=useState(30);
  const [securityOpen,setSecurityOpen]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [contactBusy,setContactBusy]=useState(false);
  const codeRefs=useRef<(HTMLInputElement|null)[]>([]);
  const busyRef=useRef(false), doneRef=useRef(false), mounted=useRef(true), qrGeneration=useRef(0);
  const authorized=useRef(onAuthorized);
  useEffect(()=>{authorized.current=onAuthorized;},[onAuthorized]);
  useEffect(()=>{mounted.current=true;return()=>{
    mounted.current=false;qrGeneration.current++;
  };},[]);

  const finish=useCallback((id:string)=>{
    if(doneRef.current)return;
    doneRef.current=true;setPassword('');setCode('');
    haptic('success');void authorized.current(id);
  },[]);
  const beginPhone=useCallback(async(number:string)=>{
    if(!consent){setError('Подтверди согласие под кнопкой.');return;}
    if(busyRef.current)return;
    busyRef.current=true;setLoading(true);setError('');
    try {
      const clean=number.replace(/[\s()-]/g,'');
      if(!/^\+\d{7,15}$/.test(clean))throw Error('Введи номер с кодом страны, например +79991234567.');
      const result=await recapApi.startPhoneAuth(clean,true);
      if(!mounted.current)return;
      setAuthId(result.authId);setStep('code');setCode('');
      haptic('light');
      setTimeout(()=>codeRefs.current[0]?.focus(),70);
    }catch(e){if(mounted.current)setError((e as Error).message||'Не удалось отправить код.');}
    finally{busyRef.current=false;if(mounted.current)setLoading(false);}
  },[consent]);

  const sharePhone=async()=>{
    if(!consent){setError('Подтверди согласие под кнопкой.');return;}
    setError('');
    setContactBusy(true);
    const shared=await requestOwnContact();
    if(!shared){
      setContactBusy(false);
      setError('Не получилось получить контакт. Можешь ввести номер вручную.');
      return;
    }
    // Telegram sends contact to the bot webhook; phone is not exposed by initData.
    try {
      for(let i=0;i<15;i++){
        if(!mounted.current)return;
        const {phone:received}=await recapApi.pickupPhoneContact();
        if(received){
          setPhone(received);setContactBusy(false);
          await beginPhone(received);return;
        }
        await sleep(1000);
      }
      setError('Telegram пока не передал номер боту. Введи его вручную.');
    }catch(e){setError((e as Error).message||'Не получилось получить номер.');}
    finally{if(mounted.current)setContactBusy(false);}
  };

  const verify=useCallback(async(value:string,kind:'code'|'password')=>{
    if(!authId||busyRef.current||doneRef.current)return;
    busyRef.current=true;setLoading(true);setError('');
    try{
      const result=await recapApi.verifyPhoneAuth(authId,kind==='code'?{code:value}:{password:value});
      if(!mounted.current)return;
      if(result.status==='authorized')finish(authId);
      else if(result.status==='needs_2fa') {setStep('password');setCode('');}
      else throw Error('Telegram не подтвердил вход. Проверь данные.');
    }catch(e){if(mounted.current)setError((e as Error).message||'Не удалось подтвердить вход.');}
    finally{busyRef.current=false;if(mounted.current)setLoading(false);}
  },[authId,finish]);

  const changeCode=(position:number,input:string)=>{
    const digit=input.replace(/\D/g,'');
    const updated=code.padEnd(5,' ').split('');
    if(digit.length>1){
      const newCode=digit.slice(0,5);
      setCode(newCode);
      if(newCode.length===5)void verify(newCode,'code');
      else codeRefs.current[newCode.length]?.focus();
      return;
    }
    updated[position]=digit.slice(-1)||' ';
    const normalized=updated.join('').trimEnd().replace(/ /g,'');
    setCode(normalized);
    if(digit)codeRefs.current[Math.min(4,position+1)]?.focus();
    if(normalized.length===5)void verify(normalized,'code');
  };
  const pasteCode=(e:React.ClipboardEvent<HTMLInputElement>)=>{
    const digits=e.clipboardData.getData('text').replace(/\D/g,'').slice(0,5);
    if(!digits)return;
    e.preventDefault();setCode(digits);
    if(digits.length===5)void verify(digits,'code');
    else codeRefs.current[digits.length]?.focus();
  };

  const refreshQr=useCallback(async()=>{
    if(!consent)return;
    const generation=++qrGeneration.current;
    setError('');setLoading(true);
    try{
      const result=await recapApi.startQrAuth(true);
      if(!mounted.current||generation!==qrGeneration.current)return;
      setAuthId(result.authId);setQrUrl(result.qrUrl);
      const expires=Date.parse(result.expiresAt);
      setQrExpiresAt(Math.min(Date.now()+30000,Number.isFinite(expires)?expires:Date.now()+30000));
      setSecondsLeft(30);
    }catch(e){if(mounted.current&&generation===qrGeneration.current)setError((e as Error).message);}
    finally{if(mounted.current&&generation===qrGeneration.current)setLoading(false);}
  },[consent]);
  useEffect(()=>{
    if(!qrOpen||!consent)return;
    void refreshQr();
    return()=>{qrGeneration.current++;};
  },[qrOpen,consent,refreshQr]);
  useEffect(()=>{
    if(!qrOpen||!qrExpiresAt)return;
    const timer=setInterval(()=>setSecondsLeft(Math.max(0,Math.ceil((qrExpiresAt-Date.now())/1000))),1000);
    return()=>clearInterval(timer);
  },[qrOpen,qrExpiresAt]);
  useEffect(()=>{
    if(qrOpen&&qrExpiresAt&&secondsLeft===0&&!loading)void refreshQr();
  },[qrOpen,qrExpiresAt,secondsLeft,loading,refreshQr]);
  useEffect(()=>{
    if(!qrOpen||!authId||!qrUrl)return;
    let stopped=false,checking=false;
    const tick=async()=>{
      if(stopped||checking)return;
      checking=true;
      try{
        const status=await recapApi.getQrStatus(authId);
        if(stopped)return;
        if(status.status==='authorized')finish(authId);
        else if(status.status==='needs_2fa'){setQrOpen(false);setStep('password');}
        else if(status.status==='expired')setSecondsLeft(0);
      }catch{/* Temporary connection failure. */}
      finally{checking=false;}
    };
    void tick();
    const timer=setInterval(()=>void tick(),2000);
    return()=>{stopped=true;clearInterval(timer);};
  },[qrOpen,authId,qrUrl,finish]);

  return <main className="v2-connect">
    <header className="v2-connect-top">
      <span className="v2-mark">RECAP<span>✳</span></span>
      <div className="v2-year-pills">{availableYears.slice(0,3).map(year=>
        <button type="button" key={year} className={year===selectedYear?'active':''}
          onClick={()=>{onSelectYear(year);haptic('selection');}}>{year}</button>)}</div>
    </header>
    <section className="v2-connect-body">
      <div className="v2-connect-symbol"><Smartphone size={38}/></div>
      <div className="v2-connect-title">
        <h1>{step==='phone'?'Подключи Telegram':step==='code'?'Введи код':'Облачный пароль'}</h1>
        <p>{step==='phone'?'Посчитаем только твои отправленные сообщения за '+selectedYear+' год.':
          step==='code'?'Код придёт в Telegram. Введи пять цифр.':
          'Проверка в два шага включена — введи пароль Telegram.'}</p>
      </div>
      {step==='phone'&&<div className="v2-connect-fields">
        <button type="button" className="v2-white-btn" disabled={loading||contactBusy}
          onClick={()=>void sharePhone()}>
          <Smartphone size={20}/>{contactBusy?'Получаем номер…':'Поделиться номером'}<ArrowRight size={19}/>
        </button>
        <span className="v2-or">или введи вручную</span>
        <form onSubmit={e=>{e.preventDefault();void beginPhone(phone);}}>
          <input className="v2-input" type="tel" inputMode="tel" autoComplete="tel"
            value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+7 999 123-45-67"
            aria-label="Номер телефона"/>
          <button className="v2-outline-btn" type="submit" disabled={loading||contactBusy||!phone.trim()}>
            {loading?'Отправляем…':'Получить код'} <ArrowRight size={17}/>
          </button>
        </form>
        <label className="v2-agree"><input type="checkbox" checked={consent}
          onChange={e=>setConsent(e.target.checked)}/>
          <span>Я понимаю, что MTProto имеет доступ к аккаунту, и согласен на анализ.</span>
        </label>
        <button type="button" className="v2-privacy-link" onClick={()=>setSecurityOpen(true)}>
          <ShieldCheck size={15}/> Как это безопасно?
        </button>
      </div>}
      {step==='code'&&<div className="v2-connect-fields">
        <div className="v2-code" role="group" aria-label="Код входа в Telegram">
          {Array.from({length:5},(_,i)=><input key={i}
            ref={el=>{codeRefs.current[i]=el;}}
            inputMode="numeric" type="text" autoComplete={i===0?'one-time-code':'off'}
            maxLength={1} pattern="[0-9]*" aria-label={'Цифра '+(i+1)}
            value={code[i]||''} onChange={e=>changeCode(i,e.target.value)}
            onPaste={pasteCode} onKeyDown={e=>{
              if(e.key==='Backspace'&&!code[i]&&i>0){e.preventDefault();codeRefs.current[i-1]?.focus();}
            }}/>)}
        </div>
        <p className="v2-step-hint">{loading?'Проверяем код…':'Код отправится сам после пятой цифры.'}</p>
        <button className="v2-text-btn" type="button" onClick={()=>{setStep('phone');setCode('');setAuthId(null);}}>
          <ArrowLeft size={16}/> Изменить номер
        </button>
      </div>}
      {step==='password'&&<form className="v2-connect-fields" onSubmit={e=>{e.preventDefault();void verify(password,'password');}}>
        <div className="v2-password-wrap"><KeyRound size={18}/>
          <input className="v2-input" type={showPassword?'text':'password'} autoComplete="current-password"
            value={password} onChange={e=>setPassword(e.target.value)}
            placeholder="Пароль Telegram" aria-label="Облачный пароль"/>
          <button type="button" aria-label="Показать пароль" onClick={()=>setShowPassword(!showPassword)}>
            {showPassword?<EyeOff size={17}/>:<Eye size={17}/>}
          </button>
        </div>
        <button className="v2-white-btn" type="submit" disabled={loading||!password}>
          {loading?'Проверяем…':'Продолжить'}<ArrowRight size={19}/>
        </button>
        <span className="v2-step-hint">Пароль используется только для входа и не сохраняется.</span>
      </form>}
      {error&&<div className="v2-inline-error" role="alert">{error}</div>}
    </section>
    <footer className="v2-connect-footer">
      {step==='phone'&&<button className="v2-text-btn" type="button"
        onClick={()=>{if(!consent){setError('Сначала подтверди согласие.');return;}setQrOpen(true);}}>
        <QrCode size={17}/> Войти с другого устройства по QR
      </button>}
      {onShowDemo&&<button type="button" className="v2-demo-link" onClick={onShowDemo}>Посмотреть демо</button>}
    </footer>
    <AnimatePresence>
      {securityOpen&&<motion.div className="v2-modal-overlay" initial={{opacity:0}} animate={{opacity:1}}
        exit={{opacity:0}} onClick={()=>setSecurityOpen(false)}>
        <motion.div role="dialog" aria-modal="true" aria-label="О безопасности" className="v2-sheet"
          initial={{y:80}} animate={{y:0}} exit={{y:80}} onClick={e=>e.stopPropagation()}>
          <button className="v2-close" onClick={()=>setSecurityOpen(false)} aria-label="Закрыть"><X size={20}/></button>
          <h2>По-честному о доступе</h2>
          <p><Lock size={18}/> MTProto не умеет «только читать». Такая сессия имеет широкие права аккаунта.</p>
          <p><ShieldCheck size={18}/> Мы считаем метаданные отправленных сообщений. Тексты не сохраняем, медиа не скачиваем.</p>
          <p><Check size={18}/> Сессия шифруется и остаётся для обновлений. Отключить и удалить всё можно в настройках или /delete.</p>
          <button type="button" className="v2-white-btn" onClick={()=>setSecurityOpen(false)}>Понятно</button>
        </motion.div>
      </motion.div>}
      {qrOpen&&<motion.div className="v2-modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
        onClick={()=>setQrOpen(false)}>
        <motion.div className="v2-sheet v2-qr-sheet" role="dialog" aria-modal="true"
          aria-label="Вход по QR-коду" initial={{y:80}} animate={{y:0}} exit={{y:80}}
          onClick={e=>e.stopPropagation()}>
          <button className="v2-close" type="button" onClick={()=>setQrOpen(false)} aria-label="Закрыть"><X size={20}/></button>
          <h2>Сканируй в Telegram</h2>
          <p className="v2-step-hint">На другом устройстве: Настройки → Устройства → Подключить устройство.</p>
          {qrUrl?<QrMatrix value={qrUrl} size={190}/>:<div className="v2-qr-loading">Получаем QR…</div>}
          <p className="v2-qr-timer">Обновим код через {secondsLeft} сек.</p>
          <button className="v2-outline-btn" type="button" disabled={loading} onClick={()=>void refreshQr()}>Обновить код</button>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  </main>;
};
