import type { RecapStats } from '../../../shared/types';

export type CardFormat = 'story' | 'square';
export type ExportAction = 'download' | 'share';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const fmt = (x:number) => x.toLocaleString('ru-RU');

function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number) {
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,r);
}

function fitText(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,startingSize:number,minSize=25) {
  let size=startingSize;
  while(size>minSize) {
    ctx.font='700 '+size+'px "Space Grotesk",sans-serif';
    if(ctx.measureText(text).width<=maxWidth)break;
    size-=2;
  }
  return size;
}

export async function renderRecapCardPng(stats:RecapStats,format:CardFormat,hideChatNames=true):Promise<Blob>{
  // Export never includes contacts or Telegram IDs, even after names are revealed in the UI.
  void hideChatNames;
  await document.fonts?.ready;
  const w=1080,h=format==='story'?1920:1080;
  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas не поддерживается');

  ctx.fillStyle='#09090f';ctx.fillRect(0,0,w,h);
  const glow=ctx.createRadialGradient(720,0,45,540,130,1250);
  glow.addColorStop(0,'rgba(117,89,200,.36)');
  glow.addColorStop(.52,'rgba(33,29,67,.12)');
  glow.addColorStop(1,'rgba(9,9,15,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  const cool=ctx.createRadialGradient(450,h,40,530,h,950);
  cool.addColorStop(0,'rgba(72,115,168,.23)');cool.addColorStop(1,'rgba(9,9,15,0)');
  ctx.fillStyle=cool;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(155,143,207,.075)';ctx.lineWidth=1;
  for(let x=0;x<w;x+=54){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=54){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}

  const cardX=72,cardW=w-144,cardH=568,cardY=format==='story'?610:252;
  const topLabelY=format==='story'?190:116;
  ctx.fillStyle='#b3a7f1';ctx.font='700 25px "Manrope",sans-serif';
  ctx.fillText('RECAP  /  ПЕРСОНАЛЬНАЯ ХРОНИКА',72,topLabelY);
  ctx.font='700 100px "Space Grotesk",sans-serif';ctx.fillStyle='#e4e3ff';
  ctx.fillText(String(stats.year),67,topLabelY+112);
  ctx.fillStyle='#aaa5c0';ctx.font='400 29px "Manrope",sans-serif';
  ctx.fillText('Твой год. Твои сообщения. Твоя история.',72,topLabelY+173);

  ctx.shadowColor='rgba(106,82,199,.27)';ctx.shadowBlur=70;
  rounded(ctx,cardX,cardY,cardW,cardH,39);
  const panel=ctx.createLinearGradient(100,cardY,975,cardY+cardH);
  panel.addColorStop(0,'#201a39');panel.addColorStop(.45,'#171428');panel.addColorStop(1,'#0f1024');
  ctx.fillStyle=panel;ctx.fill();
  ctx.shadowBlur=0;
  ctx.lineWidth=2;ctx.strokeStyle='rgba(170,150,255,.48)';ctx.stroke();

  ctx.beginPath();ctx.moveTo(670,cardY+6);ctx.lineTo(890,cardY+6);ctx.lineTo(605,cardY+cardH-8);
  ctx.lineTo(385,cardY+cardH-8);ctx.closePath();ctx.fillStyle='rgba(255,255,255,.025)';ctx.fill();

  const x=cardX+37;
  ctx.strokeStyle='#a996ff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x+14,cardY+48,10,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#e5e2f6';ctx.font='700 26px "Manrope",sans-serif';ctx.fillText('RECAP',x+40,cardY+57);
  rounded(ctx,cardX+cardW-150,cardY+28,110,40,20);ctx.fillStyle='rgba(169,150,255,.18)';ctx.fill();
  ctx.fillStyle='#dbd2ff';ctx.font='700 21px "Manrope",sans-serif';ctx.fillText(String(stats.year),cardX+cardW-127,cardY+55);

  ctx.fillStyle='#a49fba';ctx.font='700 20px "Manrope",sans-serif';
  ctx.fillText('ОТПРАВЛЕНО СООБЩЕНИЙ',x,cardY+132);
  ctx.fillStyle='#f8f6ff';ctx.font='700 91px "Space Grotesk",sans-serif';
  ctx.fillText(fmt(stats.totalMessages),x,cardY+230);

  const top=cardY+262,chipGap=18,chipW=(cardW-74-chipGap)/2,chipH=111;
  const peakMonth=MONTHS[stats.byMonth.indexOf(Math.max(...stats.byMonth))]||'—';
  const boxes=[
    {label:'ПИКОВЫЙ МЕСЯЦ',value:peakMonth},
    {label:'АКТИВНЫХ ДНЕЙ',value:fmt(stats.activeDays)+' · серия '+stats.longestStreakDays+'д'},
  ];
  boxes.forEach((box,i)=>{
    const bx=x+i*(chipW+chipGap);
    rounded(ctx,bx,top,chipW,chipH,22);ctx.fillStyle='rgba(7,7,20,.55)';ctx.fill();
    ctx.fillStyle='#8985a3';ctx.font='700 16px "Manrope",sans-serif';ctx.fillText(box.label,bx+19,top+37);
    ctx.fillStyle='#b6a6ff';ctx.font='700 28px "Manrope",sans-serif';
    ctx.fillText(box.value,bx+19,top+77,chipW-37);
  });

  const personaY=cardY+389;
  rounded(ctx,x,personaY,cardW-74,123,22);ctx.fillStyle='#121126';ctx.fill();
  ctx.strokeStyle='rgba(169,150,255,.3)';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle='#9690af';ctx.font='700 18px "Manrope",sans-serif';ctx.fillText('ХАРАКТЕР ОБЩЕНИЯ',x+21,personaY+35);
  const personaSize=fitText(ctx,stats.persona.title,cardW-115,34,24);
  ctx.fillStyle='#f2edff';ctx.font='700 '+personaSize+'px "Space Grotesk",sans-serif';
  ctx.fillText(stats.persona.title,x+21,personaY+83,cardW-115);

  const foot=cardY+cardH+73;
  ctx.fillStyle='#bcb6d0';ctx.font='500 23px "Manrope",sans-serif';
  if(stats.completionStatus==='partial'){
    ctx.fillStyle='#f0d093';ctx.fillText('ЧАСТИЧНАЯ СТАТИСТИКА · не все чаты завершены',72,foot);
  }else{
    ctx.fillText('Только реальные исходящие сообщения',72,foot);
  }
  ctx.fillStyle='#78748d';ctx.font='500 21px "Manrope",sans-serif';
  ctx.fillText('Без имён собеседников и личных ID',72,h-91);

  return await new Promise<Blob>((resolve,reject)=>{
    canvas.toBlob((b)=>b?resolve(b):reject(new Error('Не удалось сформировать PNG')),'image/png');
  });
}

export async function downloadOrShareCard(
  stats:RecapStats,format:CardFormat,hideChatNames:boolean,action:ExportAction='download'
):Promise<void>{
  const blob=await renderRecapCardPng(stats,format,hideChatNames);
  const name='RECAP-'+stats.year+'-'+(format==='story'?'1080x1920':'1080x1080')+'.png';
  const file=new File([blob],name,{type:'image/png'});
  if(action==='share'&&typeof navigator.share==='function'&&
     typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){
    try{await navigator.share({title:'Мой RECAP '+stats.year,files:[file]});return;}
    catch(e){if((e as Error).name==='AbortError')return;}
  }
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
