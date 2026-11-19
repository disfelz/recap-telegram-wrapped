import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Fingerprint, Sparkles } from 'lucide-react';
import { haptic } from '../utils/telegram';

interface Props { year:number; onReveal:()=>void; partial:boolean }
const THRESHOLDS=[15,40,65,85];
function Burst({onDone}:{onDone:()=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const element=canvas.current;
    if(!element) return;
    const ctx=element.getContext('2d');
    if(!ctx) {onDone();return;}
    let frame=0, raf=0;
    const dpr=Math.min(window.devicePixelRatio || 1,2);
    const w=element.clientWidth,h=element.clientHeight;
    element.width=w*dpr;element.height=h*dpr;
    ctx.scale(dpr,dpr);
    const colors=['#A996FF','#85B8FF','#ffffff','#FFB45C','#5EF3D0'];
    const points=Array.from({length:100},(_,i)=>{
      const a=(i/100)*Math.PI*2;
      const v=2.5+Math.random()*9;
      return {x:w/2,y:h/2,vx:Math.cos(a)*v,vy:Math.sin(a)*v,r:2+Math.random()*4,c:colors[i%colors.length]};
    });
    const draw=()=>{
      ctx.clearRect(0,0,w,h);
      points.forEach(p=>{
        p.x+=p.vx;p.y+=p.vy;p.vy+=.13;p.vx*=.994;
        ctx.globalAlpha=Math.max(0,1-frame/66);
        ctx.fillStyle=p.c;
        ctx.fillRect(p.x,p.y,p.r,p.r*1.5);
      });
      frame++;
      if(frame<66)raf=requestAnimationFrame(draw);else onDone();
    };
    raf=requestAnimationFrame(draw);
    return()=>cancelAnimationFrame(raf);
  },[onDone]);
  return <canvas ref={canvas} className="v2-confetti" aria-hidden="true"/>;
}
export const HoldScreen:React.FC<Props>=({year,onReveal,partial})=>{
  const reduce=useReducedMotion();
  const [progress,setProgress]=useState(0);
  const [finished,setFinished]=useState(false);
  const started=useRef(0),raf=useRef(0),called=useRef(false),milestones=useRef(new Set<number>());
  const callback=useRef(onReveal);
  useEffect(()=>{callback.current=onReveal;},[onReveal]);
  const complete=useCallback(()=>{
    if(called.current)return;
    called.current=true; cancelAnimationFrame(raf.current);
    setProgress(100);haptic('success');
    if(reduce)callback.current();else setFinished(true);
  },[reduce]);
  const animate=useCallback((now:number)=>{
    const pct=Math.min(100,Math.round((now-started.current)/2200*100));
    setProgress(pct);
    for(const point of THRESHOLDS) {
      if(pct>=point&&!milestones.current.has(point)) {
        milestones.current.add(point);
        haptic(point>=65?'heavy':point>=40?'medium':'light');
      }
    }
    if(pct===100)complete();else raf.current=requestAnimationFrame(animate);
  },[complete]);
  const begin=()=>{
    if(called.current)return;
    if(reduce){complete();return;}
    cancelAnimationFrame(raf.current);
    started.current=performance.now();
    milestones.current.clear();
    raf.current=requestAnimationFrame(animate);
  };
  const release=()=>{
    if(called.current)return;
    cancelAnimationFrame(raf.current);
    milestones.current.clear();
    setProgress(0);
  };
  useEffect(()=>()=>cancelAnimationFrame(raf.current),[]);
  const circumference=2*Math.PI*92;
  return <main className="v2-hold">
    <div className="v2-stars" aria-hidden="true">{Array.from({length:25},(_,i)=>
      <span key={i} style={{left:(i*41%97)+'%',top:(i*29%91)+'%',
        animationDelay:-(i%9)+'s',animationDuration:(7+i%7)+'s'}}/>)}</div>
    <div className="v2-hold-head">
      <div className="v2-kicker"><Sparkles size={14}/> RECAP · {year}</div>
      <h1>Удержи палец,<br/><em>чтобы узнать итоги {year} года</em></h1>
      {partial && <span className="v2-partial">Частичная статистика</span>}
    </div>
    <div className="v2-hold-center">
      <svg className="v2-hold-ring" viewBox="0 0 240 240" aria-hidden="true">
        <defs><linearGradient id="hold-gradient"><stop stopColor="#85B8FF"/><stop offset="1" stopColor="#A996FF"/></linearGradient></defs>
        <circle cx="120" cy="120" r="92" fill="none" stroke="rgba(133,184,255,.13)" strokeWidth="8"/>
        <circle cx="120" cy="120" r="92" fill="none" stroke="url(#hold-gradient)" strokeWidth="8"
          strokeLinecap="round" transform="rotate(-90 120 120)"
          strokeDasharray={circumference} strokeDashoffset={circumference*(1-progress/100)}/>
        {progress>0&&progress<100&&<circle cx={120+92*Math.cos(-Math.PI/2+progress/100*2*Math.PI)}
          cy={120+92*Math.sin(-Math.PI/2+progress/100*2*Math.PI)} r="6" fill="#fff"/>}
      </svg>
      <motion.button type="button" className="v2-fingerprint"
        aria-label="Удерживай 2 секунды, чтобы открыть итоги, либо нажми Enter"
        onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);begin();}}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();complete();}}}
        onClick={()=>{if(reduce)complete();}}
        animate={{scale:progress>0?1.045:1}} transition={{type:'spring',stiffness:320,damping:23}}>
        <Fingerprint size={76} strokeWidth={1.5}/>
      </motion.button>
    </div>
    <div className="v2-hold-footer">
      <strong className="v2-percent">{progress}%</strong>
      <span>{progress===0?'УДЕРЖИВАЙ':progress<55?'НЕ ОТПУСКАЙ':progress<100?'ЕЩЁ ЧУТЬ-ЧУТЬ':'ГОТОВО!'}</span>
      <small>Всё, что ты увидишь, основано на твоих сообщениях.</small>
      <button type="button" className="v2-accessibility" onClick={complete}>Открыть без удержания</button>
    </div>
    {finished&&<Burst onDone={()=>callback.current()}/>}
  </main>;
};
