import {GEARS, OUTFIT_COST, UPGRADE_COST, trade} from './economy.js';
import {mountPreview} from './wardrobe-preview.js';

const russian={
    title:'Гардероб',wallet:'Жетоны',close:'Назад',outfit:'Образы',board:'Доски',gear:'Улучшения',left:'Повернуть влево',right:'Повернуть вправо',
    owned:'В коллекции',worn:'Надето',use:'Надеть',boardUsed:'Выбрана',boardUse:'Взять на волну',buy:'Купить и надеть',upgrade:'Улучшить',
    max:'Максимальный уровень',duration:'Действие',level:'Уровень',sec:'с',missing:'До покупки · {} жет.',unlocked:'Открывается в заезде',cost:'Цена в жетонах',
    bought:'Образ куплен и надет',changed:'Комплект сохранён',improved:'Улучшение установлено',walletName:'Жетонов в кошельке',
    failed:'Не удалось сохранить покупку. Попробуйте ещё раз.',
    outfits:[
      ['Курьер','Оранжевая ветровка, шлем с визором и поясная сумка для первых рейсов.'],
      ['Рыбак','Южный ветер приносит брызги. Широкая зюйдвестка и штормовая пелерина держат ворот сухим.'],
      ['Ночной лоцман','Двубортный бушлат с медными пуговицами, вязаная шапка и сумка для портовых карт.'],
      ['Водолаз','Медный шлем с решётчатым иллюминатором, парные баллоны и манометр на груди.']
    ],
    boards:[['Мандарин','Первая доска портового курьера.'],['Янтарь','Зафиксируй серию на сходе с волны.'],['Лагуна','Пройди 1 000 м за один заезд.'],['Сирень','Пройди пять створов волны одной серией.']],
    gearItems:[['Магнит','Притягивает жетоны с соседних полос, пока действует подобранный магнит.'],['Форсаж','Каждый жетон приносит вдвое больше, пока действует подобранный форсаж.']],
  };
function translate(copy, dictionary){
  if(typeof copy==='string')return dictionary[copy]??copy;
  if(Array.isArray(copy))return copy.map(item=>translate(item,dictionary));
  return Object.fromEntries(Object.entries(copy).map(([key,value])=>[key,translate(value,dictionary)]));
}
const swatches={outfit:['#ef7941','#eab83c','#626583','#b87450'],board:['#ef7941','#dda31a','#50aaa0','#a783c0'],gear:['#b6564b','#ed914a']};
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function button(cls,text,action){
  const b=node('button',cls,text);b.type='button';b.dataset.wardrobe=action;return b;
}
function coin(){const b=node('span','locker-coin');b.setAttribute('aria-hidden','true');return b;}

export function openWardrobe({profile,commit,close,lang='ru',translations={},mount=document.getElementById('screen')}) {
  const t=lang==='en'?translate(russian,translations):russian;
  if(!document.getElementById('locker-style')){
    const link=node('link');link.id='locker-style';link.rel='stylesheet';link.href=new URL('./wardrobe.css',import.meta.url).href;document.head.append(link);
  }
  let tab='outfit',id=profile.outfit;
  let current=profile;
  const selected={outfit:profile.outfit,board:profile.skin,gear:0};
  const shell=node('section','locker'),top=node('header','locker-top'),back=button('locker-back','←','back'),
    title=node('h2','',t.title),wallet=node('div','locker-wallet'),balance=node('strong');
  title.id='locker-title';shell.setAttribute('aria-labelledby',title.id);
  back.setAttribute('aria-label',t.close);back.title=t.close;
  wallet.append(coin(),balance);wallet.setAttribute('aria-label',t.walletName);wallet.title=t.walletName;
  top.append(back,title,wallet);
  const tabs=node('div','locker-tabs'),body=node('div','locker-body'),stage=node('div','locker-stage'),
    mount3D=node('div','locker-turntable'),tools=node('div','locker-rotate'),
    left=button('','↶','rotate-left'),right=button('','↷','rotate-right'),controls=node('div','locker-details');
  left.setAttribute('aria-label',t.left);right.setAttribute('aria-label',t.right);left.title=t.left;right.title=t.right;
  tools.append(left,right);stage.append(mount3D,tools);
  const name=node('h3','locker-name'),desc=node('p','locker-desc'),choices=node('div','locker-choices'),
    info=node('div','locker-info'),action=button('locker-action','','trade'),message=node('div','locker-status');
  message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  controls.append(choices,name,desc,info,action,message);body.append(stage,controls);shell.append(top,tabs,body);mount.replaceChildren(shell);
  const preview=mountPreview(mount3D);
  left.onclick=()=>preview.rotate(-Math.PI/4);right.onclick=()=>preview.rotate(Math.PI/4);
  const observer=new MutationObserver(()=>{if(!shell.isConnected)dispose();});observer.observe(mount,{childList:true});
  function dispose(){observer.disconnect();preview.dispose();}
  back.onclick=()=>{dispose();close();};
  const duration=level=>(4.5+level*1.5).toLocaleString(lang==='en'?'en-US':'ru-RU')+' '+t.sec;
  const label=(text,value)=>{const item=node('div','locker-line');item.append(node('span','',text),node('strong','',value));return item;};
  const tabButtons={};
  for(const key of ['outfit','board','gear']){
    const b=button('','',key);b.textContent=t[key];
    b.onclick=()=>{if(tab===key)return;tab=key;id=selected[tab];message.textContent='';render(true);};
    tabButtons[key]=b;tabs.append(b);
  }
  function render(refreshModel){
    balance.textContent=current.wallet.toLocaleString(lang==='en'?'en-US':'ru-RU');
    wallet.setAttribute('aria-label',t.walletName+' '+current.wallet);
    for(const [key,b] of Object.entries(tabButtons))b.setAttribute('aria-pressed',String(key===tab));
    const catalog=tab==='outfit'?t.outfits:tab==='board'?t.boards:t.gearItems;
    choices.replaceChildren();
    catalog.forEach(([title],i)=>{
      const b=button('locker-choice',title,'item-'+i);b.style.setProperty('--swatch',swatches[tab][i]);
      b.setAttribute('aria-pressed',String(i===id));b.onclick=()=>{if(id===i)return;id=i;selected[tab]=i;message.textContent='';render(true);choices.children[i]?.focus({preventScroll:true});};
      choices.append(b);
    });
    name.textContent=catalog[id][0];desc.textContent=catalog[id][1];info.replaceChildren();action.replaceChildren();
    const gearId=GEARS[id],level=tab==='gear'?current.gear[gearId]:0;
    const owned=tab==='outfit'?current.ownedOutfits.includes(id):tab==='board'?current.ownedBoards.includes(id):false;
    const worn=tab==='outfit'?current.outfit===id:current.skin===id;
    const price=tab==='outfit'&&!owned?OUTFIT_COST[id]:tab==='gear'?UPGRADE_COST[level]:undefined;
    let caption='',enabled=false;
    if(tab==='gear'){
      info.append(label(t.level,level+' / 3'),label(t.duration,duration(level)+(level<3?' → '+duration(level+1):'')));
      caption=level===3?t.max:t.upgrade;enabled=level<3&&current.wallet>=price;
    } else if(owned){
      info.append(label(t.owned,'✓'));caption=tab==='board'?(worn?t.boardUsed:t.boardUse):(worn?t.worn:t.use);enabled=!worn;
    } else if(tab==='outfit'){caption=t.buy;enabled=current.wallet>=price;}
    else {caption=t.unlocked;}
    if(price!==undefined&&current.wallet<price)info.append(node('div','locker-short',t.missing.replace('{}',price-current.wallet)));
    action.append(node('span','',caption));
    if(price!==undefined){const amount=node('span','locker-price',String(price));amount.prepend(coin());amount.setAttribute('aria-label',t.cost+' '+price);action.append(amount);}
    action.disabled=!enabled;
    action.onclick=()=>{
      const next=trade(current,tab,tab==='gear'?gearId:id,level);if(next===current)return;
      try{if(commit(next)===false){message.textContent=t.failed;return;}}
      catch(_){message.textContent=t.failed;return;}
      current=next;render(false);message.textContent=tab==='gear'?t.improved:!owned?t.bought:t.changed;
    };
    if(refreshModel)preview.select(tab,tab==='gear'?gearId:id,tab==='outfit'?id:current.outfit,tab==='board'?id:current.skin);
  }
  render(true);back.focus({preventScroll:true});return dispose;
}
