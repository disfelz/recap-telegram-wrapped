import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, LockKeyhole, Play, ShieldCheck, Sparkles } from 'lucide-react';
import { haptic } from '../utils/telegram';

interface WelcomeScreenProps {
  selectedYear: number;
  availableYears: number[];
  onSelectYear: (year: number) => void;
  onStartConnect: () => void;
  hasSavedRecap: boolean;
  onOpenSavedRecap: () => void;
  onOpenDemoStories: () => void;
  demoEnabled: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  selectedYear, availableYears, onSelectYear, onStartConnect, hasSavedRecap,
  onOpenSavedRecap, onOpenDemoStories, demoEnabled,
}) => {
  const reduce = useReducedMotion();
  return (
    <main className="screen flagship-welcome">
      <header className="flagship-welcome-header">
        <span className="flagship-brand"><span className="flagship-brand-mark" />RECAP<span className="flagship-brand-dot">.</span></span>
        <span className="flagship-eyebrow">ТВОЙ ГОД / TELEGRAM</span>
      </header>

      <div className="flagship-orbit-scene" role="img" aria-label={'RECAP ' + selectedYear}>
        <motion.div className="flagship-orbit-halo"
          animate={reduce ? {} : {rotate:360}}
          transition={{duration:45,repeat:Infinity,ease:'linear'}} />
        <motion.div className="flagship-orbit-track flagship-orbit-outer"
          animate={reduce ? {} : {rotate:-360}}
          transition={{duration:29,repeat:Infinity,ease:'linear'}}>
          <span className="flagship-orbit-satellite"/>
        </motion.div>
        <motion.div className="flagship-orbit-track flagship-orbit-inner"
          animate={reduce ? {} : {rotate:360}}
          transition={{duration:18,repeat:Infinity,ease:'linear'}}>
          <span className="flagship-orbit-satellite second"/>
        </motion.div>
        <motion.div className="flagship-orbit-core"
          animate={reduce ? {} : {scale:[1,1.045,1]}}
          transition={{duration:4.4,repeat:Infinity,ease:'easeInOut'}}>
          <span>ТВОЙ RECAP</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.strong key={selectedYear} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
              exit={{opacity:0,y:-12}} transition={{duration:reduce?0:.27}}>
              {selectedYear}
            </motion.strong>
          </AnimatePresence>
        </motion.div>
        <span className="flagship-orbit-index">01 / ∞</span>
      </div>

      <section className="flagship-welcome-copy">
        <span className="flagship-eyebrow">ТВОЯ ПЕРСОНАЛЬНАЯ ХРОНИКА</span>
        <h1 className="display-font">Твой настоящий<br/><em>год в Telegram.</em></h1>
        <p>Не случайные цифры. Сообщения, активные дни, любимое время и твоя история за год.</p>
      </section>

      <section className="flagship-year-block" aria-label="Выбор года">
        <div className="flagship-year-caption"><span>ВЫБЕРИ ГОД</span><span>2026 / 2025</span></div>
        <div className="flagship-year-list">
          {availableYears.map((year)=><button type="button" key={year} aria-pressed={selectedYear===year}
            onClick={()=>{haptic('selection');onSelectYear(year);}}>
            {selectedYear===year&&<motion.span className="flagship-year-active" layoutId="recap-active-year"
              transition={{type:'spring',stiffness:360,damping:31}} />}
            <span className="flagship-year-text">{year}</span>
          </button>)}
        </div>
      </section>

      <div className="flagship-welcome-actions">
        {demoEnabled&&<button type="button" className="btn btn-primary flagship-demo-main" onClick={()=>{haptic('medium');onOpenDemoStories();}}>
          <Play size={18}/> Посмотреть живой пример <ArrowRight size={17}/>
        </button>}
        {hasSavedRecap&&<button type="button" className="btn btn-secondary" onClick={()=>{haptic('success');onOpenSavedRecap();}}>
          Открыть мой RECAP {selectedYear} <ArrowRight size={18}/>
        </button>}
        <button type="button" className="btn btn-secondary" onClick={()=>{haptic('medium');onStartConnect();}}>
          Узнать свой год <ArrowRight size={18}/>
        </button>
      </div>

      <section className="v2-trust-explain">
        <h2>Почему здесь нужен вход?</h2>
        <p>Telegram не отдаёт ботам историю сообщений. Сервисы «без входа» не могут посчитать твои реальные сообщения и иногда показывают выдуманные цифры. Мы считаем настоящие сообщения через временный сеанс и сразу после подсчёта выходим из аккаунта.</p>
        <small>Если Telegram не подтвердит выход, мы предупредим. Активные сеансы можно проверить в Настройки → Устройства.</small>
      </section>

      <div className="flagship-privacy-note">
        <div><ShieldCheck size={16}/><span>Только исходящие сообщения</span></div>
        <div><LockKeyhole size={16}/><span>Без сохранения текстов и медиа</span></div>
        <div><Sparkles size={16}/><span>Без подписок и платных разблокировок</span></div>
      </div>
    </main>
  );
};
