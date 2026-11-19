import type { RecapStats } from '../../../shared/types';
import { pluralRu } from './pluralRu';

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

async function renderRecapCardCanvas(stats:RecapStats,format:CardFormat,hideChatNames=true):Promise<HTMLCanvasElement>{
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

  const top=cardY+262,chipGap=12,chipW=(cardW-74-chipGap*2)/3,chipH=111;
  const peakMonth=MONTHS[stats.byMonth.indexOf(Math.max(...stats.byMonth))]||'—';
  const boxes=[
    {label:'ПИКОВЫЙ МЕСЯЦ',value:peakMonth},
    {label:'АКТИВНОСТЬ',value:fmt(stats.activeDays)+' '+pluralRu(stats.activeDays,['активный день','активных дня','активных дней'])},
    {label:'ЛУЧШАЯ СЕРИЯ',value:fmt(stats.longestStreakDays)+' '+pluralRu(stats.longestStreakDays,['день','дня','дней'])},
  ];
  boxes.forEach((box,i)=>{
    const bx=x+i*(chipW+chipGap);
    rounded(ctx,bx,top,chipW,chipH,22);ctx.fillStyle='rgba(7,7,20,.55)';ctx.fill();
    ctx.fillStyle='#8985a3';ctx.font='700 16px "Manrope",sans-serif';ctx.fillText(box.label,bx+19,top+37);
    const size=fitText(ctx,box.value,chipW-32,28,18);
    ctx.fillStyle='#b6a6ff';ctx.font='700 '+size+'px "Manrope",sans-serif';
    ctx.fillText(box.value,bx+16,top+77,chipW-32);
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
  if(format==='story'){
    const gridTop=1350,gap=18,tileW=(cardW-gap)/2,tileH=139;
    const counters=[
      {label:'ГОЛОСОВЫЕ',value:stats.voiceCount},
      {label:'КРУЖКИ',value:stats.videoNoteCount},
      {label:'ФОТО И ВИДЕО',value:stats.photoCount+stats.videoCount},
      {label:'СТИКЕРЫ И GIF',value:stats.stickerAndGifCount},
    ];
    counters.forEach((item,i)=>{
      const bx=cardX+(i%2)*(tileW+gap),by=gridTop+Math.floor(i/2)*(tileH+gap);
      rounded(ctx,bx,by,tileW,tileH,23);
      ctx.fillStyle='rgba(25,22,46,.91)';ctx.fill();
      ctx.strokeStyle='rgba(169,150,255,.20)';ctx.lineWidth=1.5;ctx.stroke();
      ctx.fillStyle='#aea6d0';ctx.font='700 19px "Manrope",sans-serif';
      ctx.fillText(item.label,bx+24,by+43);
      ctx.fillStyle='#f4efff';ctx.font='700 47px "Space Grotesk",sans-serif';
      ctx.fillText(fmt(item.value),bx+24,by+107,tileW-48);
    });
    const hour=stats.byHour.indexOf(Math.max(...stats.byHour));
    const peak=stats.totalMessages>0 && stats.byHour[hour]>0
      ? String(hour).padStart(2,'0')+':00–'+String((hour+1)%24).padStart(2,'0')+':00' : '—';
    rounded(ctx,cardX,1690,cardW,91,22);
    ctx.fillStyle='rgba(169,150,255,.11)';ctx.fill();
    ctx.strokeStyle='rgba(169,150,255,.25)';ctx.stroke();
    ctx.fillStyle='#afa5d1';ctx.font='700 19px "Manrope",sans-serif';
    ctx.fillText('ПИКОВЫЙ ЧАС',cardX+25,1725);
    ctx.fillStyle='#dfd5ff';ctx.font='700 35px "Space Grotesk",sans-serif';
    ctx.fillText(peak,cardX+25,1764);
    ctx.fillStyle='#a9a3bd';ctx.font='500 19px "Manrope",sans-serif';
    ctx.textAlign='right';ctx.fillText('Часовой пояс: '+stats.timezone,cardX+cardW-25,1758,440);
    ctx.textAlign='left';
  }
  ctx.fillStyle='#bdb6d1';ctx.font='600 22px "Manrope",sans-serif';
  ctx.fillText('Без имён собеседников и личных ID',72,h-91);

  return canvas;
}

export async function renderRecapCardPng(stats:RecapStats,format:CardFormat,hideChatNames=true):Promise<Blob>{
  const canvas=await renderRecapCardCanvas(stats,format,hideChatNames);
  return new Promise<Blob>((resolve,reject)=>{
    canvas.toBlob((blob)=>blob?resolve(blob):reject(new Error('Не удалось сформировать PNG')),'image/png');
  });
}

/** Data URL renders in Telegram mobile WebView, unlike blob: URL. */
export async function renderRecapCardPreview(stats:RecapStats,format:CardFormat,hideChatNames=true):
  Promise<{dataUrl:string;blob:Blob}>{
  const canvas=await renderRecapCardCanvas(stats,format,hideChatNames);
  const dataUrl=canvas.toDataURL('image/png');
  const blob=await new Promise<Blob>((resolve,reject)=>{
    canvas.toBlob((result)=>result?resolve(result):reject(new Error('Не удалось сформировать PNG')),'image/png');
  });
  return {dataUrl,blob};
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
