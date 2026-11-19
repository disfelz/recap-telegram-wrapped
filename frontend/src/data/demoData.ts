import type { RecapStats } from '../../../shared/types';

/**
 * СТРОГО ИЗОЛИРОВАННЫЕ ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ.
 * Используются только в режиме предпросмотра (demoMode === true) и никогда
 * не смешиваются с реальной MTProto-авторизацией и Live API.
 */
export const DEMO_RECAP_BY_YEAR: Record<number, RecapStats> = {
  2026: {
    year: 2026,
    timezone: 'Europe/Moscow',
    completionStatus: 'completed',
    generatedAt: '2026-11-19T00:00:00Z',
    totalMessages: 28460,
    activeDays: 318,
    longestStreakDays: 64,
    longestStreakRange: { start: '2026-03-04', end: '2026-05-06' },
    byMonth: [2140, 1980, 2650, 2910, 2740, 2290, 2050, 2380, 2610, 3190, 3520, 0],
    byWeekday: [3920, 4110, 4280, 4490, 4760, 3690, 3210],
    byHour: [
      1680, 1420, 980, 510, 240, 110, 90, 180, 420, 760, 1080, 1290,
      1410, 1380, 1340, 1490, 1620, 1790, 1840, 760, 1910, 2140, 2090, 1930,
    ],
    byKind: {
      text: 21890,
      voice: 1184,
      video_note: 342,
      photo: 1840,
      video: 418,
      sticker: 1920,
      gif: 640,
      other: 226,
    },
    voiceCount: 1184,
    voiceTotalDurationSec: 34920,
    videoNoteCount: 342,
    photoCount: 1840,
    videoCount: 418,
    stickerAndGifCount: 2560,
    topPrivateChats: [
      { chatHash: 'demo-p1', displayLabel: 'Настя', chatType: 'private', sentMessages: 9420 },
      { chatHash: 'demo-p2', displayLabel: 'Никита', chatType: 'private', sentMessages: 3810 },
      { chatHash: 'demo-p3', displayLabel: 'Артём', chatType: 'private', sentMessages: 2140 },
      { chatHash: 'demo-p4', displayLabel: 'Даниил', chatType: 'private', sentMessages: 1490 },
      { chatHash: 'demo-p5', displayLabel: 'Максим', chatType: 'private', sentMessages: 1120 },
    ],
    topGroupChats: [
      { chatHash: 'demo-g1', displayLabel: 'Студия / Битмейкинг', chatType: 'group', sentMessages: 2640 },
      { chatHash: 'demo-g2', displayLabel: 'Ночные поездки МСК', chatType: 'group', sentMessages: 1410 },
      { chatHash: 'demo-g3', displayLabel: 'Веб и хостинг', chatType: 'group', sentMessages: 890 },
    ],
    persona: {
      code: 'midnight_architect',
      title: 'Полуночный архитектор',
      subtitle: 'Пик твоей переписки наступает, когда город уже спит',
      traits: ['Ночной пик 22:00–02:00', 'Серия 64 дня', 'Живой баланс текста и аудио'],
      basisMetrics: { nightShare: 0.308, voiceShare: 0.054, visualShare: 0.169, groupShare: 0.174 },
    },
    metrics: {
      apiRequestsCount: 412,
      elapsedMs: 18400,
      floodWaitCount: 1,
      floodWaitTotalSec: 4,
      processedDialogs: 94,
      totalEligibleDialogs: 94,
      skippedDialogs: 38,
      failedDialogs: 0,
    },
  },
  2025: {
    year: 2025,
    timezone: 'Europe/Moscow',
    completionStatus: 'completed',
    generatedAt: '2026-01-02T00:00:00Z',
    totalMessages: 22190,
    activeDays: 294,
    longestStreakDays: 41,
    longestStreakRange: { start: '2025-07-10', end: '2025-08-19' },
    byMonth: [1620, 1540, 1790, 1880, 1950, 2110, 2240, 2180, 1920, 1810, 1640, 1510],
    byWeekday: [3020, 3190, 3310, 3420, 3690, 2940, 2620],
    byHour: [
      1180, 940, 620, 310, 140, 80, 70, 150, 360, 680, 940, 1120,
      1210, 1190, 1150, 1260, 1340, 1480, 500, 1490, 1560, 1640, 1510, 1270,
    ],
    byKind: {
      text: 17120,
      voice: 890,
      video_note: 215,
      photo: 1410,
      video: 320,
      sticker: 1580,
      gif: 480,
      other: 175,
    },
    voiceCount: 890,
    voiceTotalDurationSec: 25140,
    videoNoteCount: 215,
    photoCount: 1410,
    videoCount: 320,
    stickerAndGifCount: 2060,
    topPrivateChats: [
      { chatHash: 'demo-p2', displayLabel: 'Никита', chatType: 'private', sentMessages: 4610 },
      { chatHash: 'demo-p3', displayLabel: 'Артём', chatType: 'private', sentMessages: 2980 },
      { chatHash: 'demo-p4', displayLabel: 'Даниил', chatType: 'private', sentMessages: 1740 },
    ],
    topGroupChats: [
      { chatHash: 'demo-g1', displayLabel: 'Студия / Битмейкинг', chatType: 'group', sentMessages: 2110 },
      { chatHash: 'demo-g2', displayLabel: 'Ночные поездки МСК', chatType: 'group', sentMessages: 1120 },
    ],
    persona: {
      code: 'steady_pulse',
      title: 'Ровный пульс',
      subtitle: 'Сбалансированное общение без перекосов и провалов по ритму',
      traits: ['Стабильный ритм', 'Надёжность на связи', 'Чёткий фокус'],
      basisMetrics: { nightShare: 0.246, voiceShare: 0.05, visualShare: 0.171, groupShare: 0.146 },
    },
    metrics: {
      apiRequestsCount: 348,
      elapsedMs: 14200,
      floodWaitCount: 0,
      floodWaitTotalSec: 0,
      processedDialogs: 81,
      totalEligibleDialogs: 81,
      skippedDialogs: 29,
      failedDialogs: 0,
    },
  },
};


/**
 * 2024: explicitly synthetic demo dataset. Never used by Live API or mixed
 * with saved results. All distributions sum to the corresponding total.
 */
function demoDistribution(total:number,weights:number[]):number[]{
  const sum=weights.reduce((a,b)=>a+b,0);
  if(!sum)return weights.map(()=>0);
  let assigned=0;
  return weights.map((weight,i)=>{
    const value=i===weights.length-1?total-assigned:Math.floor(total*weight/sum);
    assigned+=value;
    return value;
  });
}
const demo2024Base=DEMO_RECAP_BY_YEAR[2025];
const demo2024Total=18624;
const demo2024KindKeys=Object.keys(demo2024Base.byKind) as Array<keyof RecapStats['byKind']>;
const demo2024Kinds=demoDistribution(demo2024Total,demo2024KindKeys.map(k=>demo2024Base.byKind[k]));
const demo2024ByKind={} as RecapStats['byKind'];
demo2024KindKeys.forEach((key,i)=>{demo2024ByKind[key]=demo2024Kinds[i];});
DEMO_RECAP_BY_YEAR[2024]={
  ...demo2024Base,
  year:2024,
  generatedAt:'2025-01-03T00:00:00Z',
  totalMessages:demo2024Total,
  activeDays:268,
  longestStreakDays:37,
  longestStreakRange:{start:'2024-05-01',end:'2024-06-06'},
  byMonth:demoDistribution(demo2024Total,[1350,1280,1520,1590,1710,1960,2100,1850,1550,1510,1260,1440]),
  byWeekday:demoDistribution(demo2024Total,[2600,2740,2820,2950,3200,2450,2300]),
  byHour:demoDistribution(demo2024Total,[820,730,520,270,110,70,50,120,290,520,720,840,920,900,860,980,1050,1190,1320,1410,1470,1560,1220,980]),
  byKind:demo2024ByKind,
  voiceCount:demo2024ByKind.voice,
  videoNoteCount:demo2024ByKind.video_note,
  photoCount:demo2024ByKind.photo,
  videoCount:demo2024ByKind.video,
  stickerAndGifCount:demo2024ByKind.sticker+demo2024ByKind.gif,
  voiceTotalDurationSec:21840,
  topPrivateChats:[
    {chatHash:'demo-2024-p1',displayLabel:'Друг',chatType:'private',sentMessages:4020},
    {chatHash:'demo-2024-p2',displayLabel:'Подруга',chatType:'private',sentMessages:2470},
    {chatHash:'demo-2024-p3',displayLabel:'Брат',chatType:'private',sentMessages:1680},
  ],
  topGroupChats:[
    {chatHash:'demo-2024-g1',displayLabel:'Чат друзей',chatType:'group',sentMessages:1740},
    {chatHash:'demo-2024-g2',displayLabel:'Учебная группа',chatType:'group',sentMessages:1210},
  ],
  persona:{
    code:'steady_pulse',title:'Ровный пульс',
    subtitle:'Твой ритм общения оставался устойчивым на протяжении года',
    traits:['268 активных дней','Серия 37 дней','Дневная активность'],
    basisMetrics:{nightShare:0.22,voiceShare:demo2024ByKind.voice/demo2024Total,visualShare:(demo2024ByKind.photo+demo2024ByKind.video)/demo2024Total,groupShare:0.15},
  },
  metrics:{apiRequestsCount:0,elapsedMs:0,floodWaitCount:0,floodWaitTotalSec:0,processedDialogs:66,totalEligibleDialogs:66,skippedDialogs:0,failedDialogs:0},
};
