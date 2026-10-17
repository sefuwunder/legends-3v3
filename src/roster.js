// Roster: 12 NBA legends, prime-era attributes (1-99), stylized (no real likenesses).
// Shared module: imported by bun tests and the browser bundle.

export const PLAYERS = {
  jordan:  { id:'jordan',  name:'Michael Jordan', num:23, pos:'W', h:1.98, build:'athletic', skin:0x8d5524, headband:false, sig:'fadeaway',
             a:{ mid:98, three:78, close:97, ft:84, handles:93, passing:85, perD:97, intD:88, ath:98, str:85, post:92, clutch:99, stam:97 } },
  kobe:    { id:'kobe',    name:'Kobe Bryant',    num:8,  pos:'W', h:1.98, build:'athletic', skin:0x6b4226, headband:true,  sig:'fadeaway',
             a:{ mid:96, three:82, close:94, ft:84, handles:92, passing:82, perD:93, intD:82, ath:96, str:84, post:90, clutch:97, stam:96 } },
  lebron:  { id:'lebron',  name:'LeBron James',   num:23, pos:'G', h:2.06, build:'power',    skin:0x5c3a21, headband:true,  sig:'chasedown',
             a:{ mid:88, three:80, close:98, ft:73, handles:92, passing:98, perD:93, intD:90, ath:99, str:97, post:90, clutch:92, stam:99 } },
  curry:   { id:'curry',   name:'Stephen Curry',  num:30, pos:'G', h:1.88, build:'slight',   skin:0xc68642, headband:false, sig:'quickthree',
             a:{ mid:92, three:99, close:85, ft:91, handles:96, passing:90, perD:78, intD:65, ath:88, str:70, post:55, clutch:95, stam:96 } },
  shaq:    { id:'shaq',    name:'Shaquille O\u2019Neal', num:34, pos:'B', h:2.16, build:'huge', skin:0x4a2f1a, headband:false, sig:'powerdunk',
             a:{ mid:55, three:40, close:99, ft:53, handles:60, passing:72, perD:60, intD:92, ath:90, str:99, post:99, clutch:80, stam:85 } },
  duncan:  { id:'duncan',  name:'Tim Duncan',     num:21, pos:'B', h:2.11, build:'solid',    skin:0x6b4226, headband:false, sig:'bank',
             a:{ mid:88, three:45, close:92, ft:72, handles:65, passing:78, perD:75, intD:96, ath:78, str:92, post:95, clutch:90, stam:90 } },
  magic:   { id:'magic',   name:'Magic Johnson',  num:32, pos:'G', h:2.06, build:'solid',    skin:0x5c3a21, headband:false, sig:'nlook',
             a:{ mid:82, three:70, close:90, ft:85, handles:97, passing:99, perD:80, intD:75, ath:88, str:88, post:80, clutch:93, stam:94 } },
  bird:    { id:'bird',    name:'Larry Bird',     num:33, pos:'W', h:2.06, build:'solid',    skin:0xe8b98a, headband:false, sig:'setthree',
             a:{ mid:95, three:94, close:88, ft:88, handles:82, passing:95, perD:85, intD:80, ath:75, str:85, post:88, clutch:98, stam:92 } },
  durant:  { id:'durant',  name:'Kevin Durant',   num:35, pos:'W', h:2.08, build:'slight',   skin:0x4a2f1a, headband:false, sig:'pullup',
             a:{ mid:97, three:90, close:94, ft:88, handles:88, passing:82, perD:85, intD:82, ath:93, str:80, post:85, clutch:94, stam:94 } },
  hakeem:  { id:'hakeem',  name:'Hakeem Olajuwon', num:34, pos:'B', h:2.13, build:'athletic', skin:0x3d2812, headband:false, sig:'dreamshake',
             a:{ mid:84, three:45, close:95, ft:71, handles:72, passing:75, perD:82, intD:97, ath:90, str:90, post:99, clutch:92, stam:93 } },
  iverson: { id:'iverson', name:'Allen Iverson',  num:3,  pos:'G', h:1.83, build:'slight',   skin:0x5c3a21, headband:true,  sig:'crossover',
             a:{ mid:88, three:74, close:93, ft:78, handles:99, passing:80, perD:78, intD:60, ath:97, str:65, post:50, clutch:94, stam:98 } },
  dirk:    { id:'dirk',    name:'Dirk Nowitzki',  num:41, pos:'B', h:2.13, build:'solid',    skin:0xe8b98a, headband:false, sig:'onelegger',
             a:{ mid:94, three:88, close:88, ft:88, handles:75, passing:78, perD:78, intD:78, ath:72, str:85, post:90, clutch:96, stam:90 } },
};

export const SQUADS = {
  WCI: { id:'WCI', name:'Windy City',      colors:{ pri:'#c8102e', sec:'#111111' }, players:['iverson','jordan','duncan'] },
  SHO: { id:'SHO', name:'Showtime',        colors:{ pri:'#552583', sec:'#fdb927' }, players:['magic','bird','hakeem'] },
  SMA: { id:'SMA', name:'Small Ball',      colors:{ pri:'#1d428a', sec:'#ffc72c' }, players:['curry','durant','shaq'] },
  MAM: { id:'MAM', name:'Mamba Mentality', colors:{ pri:'#000000', sec:'#fdb927' }, players:['lebron','kobe','dirk'] },
};

export const OFF_SCHEMES = {
  iso:    { name:'Isolation',    desc:'Clear out for your best scorer. 1v1 buckets, high usage for the hot hand.' },
  pnr:    { name:'Pick & Roll',  desc:'Guard + big two-man game. Drives, lobs and pops — beats switches.' },
  motion: { name:'Motion',       desc:'Off-ball screens for open 3s and backdoor cuts. Needs shooting.' },
  post:   { name:'Post-Up',      desc:'Feed the big on the block. Dream Shakes, banks and power dunks.' },
  run:    { name:'Run & Gun',    desc:'Push every possession. More shots, more 3s — but legs get heavy.' },
};

export const DEF_SCHEMES = {
  man:   { name:'Man-to-Man',      desc:'Straight up. Balanced, no big weaknesses.' },
  zone:  { name:'Zone',            desc:'Pack the paint, dare them to shoot. Vulnerable to great shooting.' },
  press: { name:'Full-Court Press',desc:'Force turnovers with pressure. Great passers will carve it up.' },
  pack:  { name:'Pack the Paint',  desc:'Double the post, swarm drivers. Leaves shooters open.' },
};

export const TEMPOS = {
  push: { name:'Push',      desc:'Fast pace. More possessions, faster stamina drain.' },
  half: { name:'Half-court',desc:'Slow it down. Fewer possessions, fresher legs late.' },
};

export function player(id) { return PLAYERS[id]; }
export function squad(id) { return SQUADS[id]; }
export function squadPlayers(sid) { return SQUADS[sid].players.map(player); }
