// ── STATE ────────────────────────────────────────────────────────────────
let coachMember=null,coachGoal=null,coachGoalEmoji=null,coachIsSoccer=false;
let coachPhotoB64=null,coachPhotoMime=null;
let neuralProfile='adult',neuralGroup='all';
let drillCompletions=new Set();

// ── NAVIGATION ───────────────────────────────────────────────────────────
function showScreen(id,el){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('screen-'+id).classList.add('active');
  if(el&&el.classList) el.classList.add('active');
  if(id==='tracker') buildTracker();
}

function quickCoach(name,emoji,bg){
  showScreen('ai-coach',document.querySelector('[onclick*="ai-coach"]'));
  setTimeout(()=>{
    const names=['Tim','Kara','Lily','Mason'];
    const idx=names.indexOf(name);
    if(idx>=0){
      coachMember={name,emoji,bg};
      document.querySelectorAll('#coach-step-1 .member-card')[idx].classList.add('active');
      document.getElementById('coach-name-lbl').textContent=name;
      coachGoTo(2);
    }
  },100);
}

// ── AI COACH ─────────────────────────────────────────────────────────────
function coachGoTo(step){
  [1,2,3,4,5].forEach(n=>document.getElementById('coach-step-'+n).style.display='none');
  document.getElementById('coach-step-'+step).style.display='block';
}

function setCoachMember(name,emoji,bg,el){
  coachMember={name,emoji,bg};
  document.querySelectorAll('#coach-step-1 .member-card').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('coach-name-lbl').textContent=name;
  setTimeout(()=>coachGoTo(2),200);
}

function addCoachMember(){
  const n=prompt('Enter family member name:');
  if(!n||!n.trim()) return;
  coachMember={name:n.trim(),emoji:'👤',bg:'rgba(255,107,43,.15)'};
  document.getElementById('coach-name-lbl').textContent=n.trim();
  coachGoTo(2);
}

function setCoachGoal(g,emoji,soccer,el){
  coachGoal=g; coachGoalEmoji=emoji; coachIsSoccer=soccer;
  document.querySelectorAll('#coach-step-2 .goal-btn:not(.locked)').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');
  setTimeout(()=>coachGoTo(3),200);
}

function handleCoachPhoto(e){
  const file=e.target.files[0]; if(!file) return;
  coachPhotoMime=file.type;
  const r=new FileReader();
  r.onload=ev=>{
    coachPhotoB64=ev.target.result.split(',')[1];
    const img=document.getElementById('coach-preview');
    img.src=ev.target.result; img.style.display='block';
    document.getElementById('coach-uzone').innerHTML='<span class="upload-icon">✅</span><div class="upload-text" style="color:var(--green)">Photo ready</div><div class="upload-hint">Tap to change</div>';
  };
  r.readAsDataURL(file);
}

function toggleRC(id){document.getElementById(id).classList.toggle('open');}

const COACH_MSGS=['Building your personalized plan...','Analyzing body composition...','Designing your workout program...','Writing nutrition guidance...','Almost ready...'];

async function runCoachAnalysis(){
  if(!coachMember||!coachGoal) return;
  coachGoTo(4);
  let mi=0;
  const mel=document.getElementById('coach-load-msg');
  const iv=setInterval(()=>{mi=(mi+1)%COACH_MSGS.length;mel.textContent=COACH_MSGS[mi];},2000);

  try{
    const res=await fetch('/api/coach',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        member_name:coachMember.name,
        goal:coachGoal,
        is_soccer:coachIsSoccer,
        photo_b64:coachPhotoB64||null,
        photo_mime:coachPhotoMime||'image/jpeg',
      })
    });
    clearInterval(iv);

    if(!res.ok){
      const err=await res.json();
      throw new Error(err.error||'Server error');
    }

    const p=await res.json();

    document.getElementById('res-av').textContent=coachMember.emoji;
    document.getElementById('res-av').style.background=coachMember.bg;
    document.getElementById('res-name').textContent=coachMember.name+"'s Plan";
    document.getElementById('res-tag').textContent=(coachGoalEmoji||'')+' '+coachGoal.split('—')[0].split('(')[0].trim().slice(0,40);
    document.getElementById('txt-assess').textContent=p.assessment||'';
    document.getElementById('txt-workout').textContent=p.workout||'';
    document.getElementById('txt-nutrition').textContent=p.nutrition||'';

    const tabsEl=document.getElementById('vis-tabs');
    const panelsEl=document.getElementById('vis-panels');
    tabsEl.innerHTML=''; panelsEl.innerHTML='';

    if(coachIsSoccer&&p.visual_steps&&p.visual_steps.length){
      document.getElementById('vis-title').textContent='Skill Visuals';
      document.getElementById('workout-title').textContent=p.workout_title||'Drills';
      tabsEl.innerHTML='<button class="vtab active" onclick="switchVTab(0,this)">Field Diagram</button><button class="vtab" onclick="switchVTab(1,this)">Steps</button><button class="vtab" onclick="switchVTab(2,this)">Muscles</button>';
      panelsEl.innerHTML=`<div class="vpanel active" id="vp-0">${buildSoccerSVG(coachGoal)}</div><div class="vpanel" id="vp-1">${buildStepCards(p.visual_steps)}</div><div class="vpanel" id="vp-2">${buildMuscleSVGs(p.primary_muscles,p.secondary_muscles,true)}</div>`;
    } else {
      document.getElementById('vis-title').textContent='Muscle Map';
      document.getElementById('workout-title').textContent=p.workout_title||'Weekly Plan';
      tabsEl.innerHTML='<button class="vtab active" onclick="switchVTab(0,this)">Front</button><button class="vtab" onclick="switchVTab(1,this)">Back</button>';
      panelsEl.innerHTML=buildMuscleSVGs(p.primary_muscles,p.secondary_muscles,false);
    }

    const accGrid=document.getElementById('acc-grid');
    accGrid.innerHTML='';
    (p.milestones||[]).forEach((m,i)=>{
      const d=document.createElement('div');
      d.className='acc-card'; d.id='acc-'+i;
      d.innerHTML=`<div class="acc-week">${m.week}</div><div class="acc-goal">${m.goal}</div><div class="acc-check" onclick="checkMilestone(${i})">☐</div>`;
      accGrid.appendChild(d);
    });
    document.getElementById('coach-note').textContent='"'+(p.coach_note||'You got this.')+'"';
    coachGoTo(5);
  } catch(err){
    clearInterval(iv);
    document.getElementById('txt-assess').textContent='Something went wrong: '+err.message+'. Please try again.';
    coachGoTo(5);
  }
}

function switchVTab(idx,el){
  document.querySelectorAll('.vtab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.vpanel').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  const pnl=document.getElementById('vp-'+idx);
  if(pnl) pnl.classList.add('active');
}

function checkMilestone(i){
  const c=document.getElementById('acc-'+i); if(!c) return;
  const checked=c.classList.toggle('checked');
  c.querySelector('.acc-check').textContent=checked?'✅':'☐';
}

function resetCoach(){
  coachMember=null; coachGoal=null; coachGoalEmoji=null; coachIsSoccer=false;
  coachPhotoB64=null; coachPhotoMime=null;
  document.getElementById('coach-preview').style.display='none';
  document.getElementById('coach-uzone').innerHTML='<span class="upload-icon">📷</span><div class="upload-text">Tap to upload a photo</div><div class="upload-hint">Optional — great plan with or without it</div>';
  document.querySelectorAll('#coach-step-1 .member-card, #coach-step-2 .goal-btn').forEach(b=>b.classList.remove('active','sel'));
  coachGoTo(1);
}

// ── MUSCLE SVG ────────────────────────────────────────────────────────────
function buildMuscleSVGs(primary,secondary,singlePanel){
  const pSet=new Set((primary||[]).map(m=>m.toLowerCase()));
  const sSet=new Set((secondary||[]).map(m=>m.toLowerCase()));
  const groups={
    chest:{front:true,cx:200,cy:112,rx:38,ry:22},
    shoulders:{front:true,cx:200,cy:90,rx:55,ry:14},
    biceps:{front:true,cx:155,cy:142,rx:13,ry:24},
    core:{front:true,cx:200,cy:158,rx:28,ry:22},
    quads:{front:true,cx:185,cy:248,rx:20,ry:32},
    'hip flexors':{front:true,cx:200,cy:190,rx:32,ry:16},
    'upper back':{front:false,cx:200,cy:112,rx:38,ry:22},
    lats:{front:false,cx:200,cy:148,rx:40,ry:26},
    glutes:{front:false,cx:200,cy:205,rx:36,ry:24},
    hamstrings:{front:false,cx:185,cy:248,rx:20,ry:32},
    triceps:{front:false,cx:155,cy:142,rx:13,ry:24},
    calves:{front:false,cx:185,cy:305,rx:20,ry:26},
  };
  function colorFor(name){
    const k=Object.keys(groups).find(g=>name.toLowerCase().includes(g)||g.includes(name.toLowerCase()));
    if(!k) return null;
    if([...pSet].some(p=>p.includes(k)||k.includes(p))) return{fill:'#1a3a5c',stroke:'#4cc9f0'};
    if([...sSet].some(s=>s.includes(k)||k.includes(s))) return{fill:'#0d3320',stroke:'#06d6a0'};
    return{fill:'#1c2028',stroke:'#3a4050'};
  }
  function makeSVG(isFront,label,panelId){
    const vis=Object.entries(groups).filter(([n,d])=>d.front===isFront);
    let els='';
    vis.forEach(([name,d])=>{
      const c=colorFor(name)||{fill:'#1c2028',stroke:'#3a4050'};
      els+=`<ellipse cx="${d.cx}" cy="${d.cy}" rx="${d.rx}" ry="${d.ry}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/><text x="${d.cx}" y="${d.cy+1}" text-anchor="middle" dominant-baseline="middle" font-size="7" fill="${c.stroke}" font-family="sans-serif" font-weight="600">${name}</text>`;
    });
    return `<div class="vpanel${panelId===0?' active':''}" id="vp-${panelId}"><svg viewBox="0 0 400 380" class="diagram"><text x="200" y="16" text-anchor="middle" font-size="10" fill="#6b7385" font-family="sans-serif">${label}</text><ellipse cx="200" cy="56" rx="28" ry="30" fill="#1c2028" stroke="#3a4050" stroke-width="1"/><rect x="162" y="84" width="76" height="115" rx="8" fill="#1c2028" stroke="#3a4050" stroke-width="1"/><rect x="175" y="199" width="50" height="95" rx="6" fill="#1c2028" stroke="#3a4050" stroke-width="1"/><rect x="179" y="294" width="18" height="60" rx="5" fill="#1c2028" stroke="#3a4050" stroke-width="1"/><rect x="203" y="294" width="18" height="60" rx="5" fill="#1c2028" stroke="#3a4050" stroke-width="1"/><rect x="131" y="89" width="31" height="88" rx="8" fill="#1c2028" stroke="#3a4050" stroke-width="1"/><rect x="238" y="89" width="31" height="88" rx="8" fill="#1c2028" stroke="#3a4050" stroke-width="1"/>${els}<rect x="30" y="340" width="11" height="11" rx="2" fill="#1a3a5c" stroke="#4cc9f0" stroke-width="1"/><text x="45" y="349" font-size="9" fill="#8892a4" font-family="sans-serif">Primary</text><rect x="105" y="340" width="11" height="11" rx="2" fill="#0d3320" stroke="#06d6a0" stroke-width="1"/><text x="120" y="349" font-size="9" fill="#8892a4" font-family="sans-serif">Secondary</text><rect x="200" y="340" width="11" height="11" rx="2" fill="#1c2028" stroke="#3a4050" stroke-width="1"/><text x="215" y="349" font-size="9" fill="#8892a4" font-family="sans-serif">Supporting</text></svg></div>`;
  }
  if(singlePanel){
    return `<div class="vis-tabs" style="margin-bottom:8px"><button class="vtab active" onclick="switchInnerTab(0,this,'ms')">Front</button><button class="vtab" onclick="switchInnerTab(1,this,'ms')">Back</button></div><div id="ms-0" class="vpanel active">${makeSVG(true,'Front View',0)}</div><div id="ms-1" class="vpanel">${makeSVG(false,'Back View',1)}</div>`;
  }
  return makeSVG(true,'Front View',0)+makeSVG(false,'Back View',1);
}

function switchInnerTab(idx,el,prefix){
  const parent=el.closest('.result-card-body')||el.parentElement.parentElement;
  parent.querySelectorAll('.vtab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(prefix+'-0').classList.toggle('active',idx===0);
  document.getElementById(prefix+'-1').classList.toggle('active',idx===1);
}

function buildSoccerSVG(goal){
  const isRainbow=goal.toLowerCase().includes('rainbow');
  const isFirst=goal.toLowerCase().includes('first touch');
  const isCruyff=goal.toLowerCase().includes('cruyff');
  let inner='';
  if(isRainbow){
    inner=`<text x="185" y="25" text-anchor="middle" font-size="10" fill="#06d6a0" font-family="sans-serif" font-weight="600">Rainbow Flick — Foot Path</text><circle cx="185" cy="145" r="13" fill="#185FA5" opacity=".85"/><text x="185" y="149" text-anchor="middle" font-size="8" fill="white" font-family="sans-serif">P</text><circle cx="185" cy="172" r="8" fill="#BA7517"/><defs><marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill="#A32D2D"/></marker></defs><path d="M185,172 Q185,135 138,95 Q115,74 185,55 Q255,74 232,95 Q185,135 185,172" stroke="#A32D2D" stroke-width="2" fill="none" stroke-dasharray="5,3" marker-end="url(#arr)"/><text x="108" y="93" font-size="8" fill="#ff8c5a" font-family="sans-serif">Ball arc</text><text x="100" y="162" font-size="7.5" fill="#8892a4" font-family="sans-serif">① Roll ball up with sole</text><text x="100" y="175" font-size="7.5" fill="#8892a4" font-family="sans-serif">② Heel flick launches ball</text><text x="210" y="115" font-size="7.5" fill="#8892a4" font-family="sans-serif">③ Jump over arc</text>`;
  } else if(isFirst){
    inner=`<text x="185" y="25" text-anchor="middle" font-size="10" fill="#06d6a0" font-family="sans-serif" font-weight="600">First Touch — Cushion &amp; Redirect</text><defs><marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill="#A32D2D"/></marker><marker id="arr2" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill="#06d6a0"/></marker></defs><circle cx="60" cy="80" r="8" fill="#BA7517"/><line x1="68" y1="80" x2="175" y2="148" stroke="#A32D2D" stroke-width="2" marker-end="url(#arr)"/><circle cx="185" cy="152" r="13" fill="#185FA5" opacity=".85"/><text x="185" y="156" text-anchor="middle" font-size="8" fill="white" font-family="sans-serif">P</text><path d="M195,148 Q215,138 245,132" stroke="#06d6a0" stroke-width="2" stroke-dasharray="4,3" marker-end="url(#arr2)" fill="none"/><text x="248" y="130" font-size="7.5" fill="#06d6a0" font-family="sans-serif">Redirect</text><text x="140" y="185" font-size="7.5" fill="#8892a4" font-family="sans-serif">Cushion — don't stab</text>`;
  } else {
    inner=`<text x="185" y="25" text-anchor="middle" font-size="10" fill="#06d6a0" font-family="sans-serif" font-weight="600">Movement Diagram</text><defs><marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill="#A32D2D"/></marker><marker id="arr2" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill="#06d6a0"/></marker></defs><circle cx="185" cy="150" r="14" fill="#185FA5" opacity=".85"/><text x="185" y="154" text-anchor="middle" font-size="8" fill="white">P</text><path d="M185,136 Q215,110 248,88" stroke="#A32D2D" stroke-width="2" fill="none" marker-end="url(#arr)" stroke-dasharray="5,3"/><path d="M185,136 Q155,110 122,88" stroke="#06d6a0" stroke-width="2" fill="none" marker-end="url(#arr2)" stroke-dasharray="5,3"/><text x="252" y="86" font-size="7.5" fill="#ff8c5a" font-family="sans-serif">Option A</text><text x="78" y="86" font-size="7.5" fill="#06d6a0" font-family="sans-serif">Option B</text>`;
  }
  return `<svg viewBox="0 0 370 230" class="diagram"><rect x="5" y="5" width="360" height="220" rx="7" fill="#0d1a0d" stroke="#1a3020" stroke-width="1.5"/><line x1="185" y1="5" x2="185" y2="225" stroke="#1a3020" stroke-width="1"/><ellipse cx="185" cy="115" rx="50" ry="30" fill="none" stroke="#1a3020" stroke-width="1"/>${inner}</svg>`;
}

function buildStepCards(steps){
  let h='<div class="step-cards">';
  steps.forEach((s,i)=>{h+=`<div class="step-c"><div class="step-num">${i+1}</div><div class="step-txt"><strong>${s.title}</strong><br>${s.cue}</div></div>`;});
  return h+'</div>';
}

// ── LILY'S PROGRAM ────────────────────────────────────────────────────────
async function loadDrillCompletions(){
  try{
    const r=await fetch('/api/drills/Lily');
    const data=await r.json();
    drillCompletions=new Set(data.completions.map(c=>`${c.week_num}|${c.day_name}|${c.drill_name}`));
  } catch(e){ drillCompletions=new Set(); }
}

function buildLilyProgram(){
  const tabsEl=document.getElementById('lily-week-tabs');
  const contentEl=document.getElementById('lily-week-content');
  tabsEl.innerHTML=''; contentEl.innerHTML='';
  LILY_PROGRAM.forEach((wk,wi)=>{
    const btn=document.createElement('button');
    btn.className='wtab'+(wi===0?' active':'');
    btn.textContent='Wk '+wk.week;
    btn.onclick=()=>{
      document.querySelectorAll('.wtab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderLilyWeek(wk);
    };
    tabsEl.appendChild(btn);
  });
  renderLilyWeek(LILY_PROGRAM[0]);

  const techEl=document.getElementById('lily-tech-cards');
  const techs=[
    {name:'A-Skip Technique',icon:'🏃',content:'Step 1: Just march — slow exaggerated knee drives to hip height, toe pulled UP toward shin. No skip yet.\nStep 2: Add the skip hop on the support foot between each step.\nStep 3: Add opposite arm drive — elbow back, not just forward.\nStep 4: Speed it up gradually over weeks.\n\nKey: The toe must be DORSIFLEXED (pulled up) before contact. Heel never hits first.',yt:'A Skip sprint drill Altis technique'},
    {name:'B-Skip Technique',icon:'⚡',content:'Same as A-Skip plus:\nAt the top of the knee drive → EXTEND the lower leg forward like a kick → PULL IT BACK before contact.\nThe pull-back is everything. If the foot is moving forward when it hits the ground you are braking. It must be moving BACKWARD to produce forward propulsion.\n\nKey: Think "kick and retract" not "kick and hold".',yt:'B Skip sprint drill technique slow motion'},
    {name:'Kicking — 6 Components',icon:'⚽',content:'Teach ONE per session:\n1. Plant foot: BESIDE the ball, toes pointing at target.\n2. Ankle lock: Kick foot pointed DOWN and RIGID before swinging.\n3. Contact point: Hard bony laces area — not toe, not inside.\n4. Ball contact: Dead center for straight drive, below center for loft.\n5. Hip drive: Power comes from hip ROTATION, not knee snap.\n6. Follow-through: Kicking foot ends up pointing at target.',yt:'soccer shooting technique 6 components plant foot ankle lock'},
    {name:'PVC Pipe Progressions',icon:'🦶',content:'Setup: Two 18" pieces of 1.5" Schedule 40 PVC on yoga mat, shoulder-width.\nStart: Both hands on cane, eyes open, 3×20 sec.\nProgress: Eyes closed intervals → head turns → one hand → fingertips → no cane → arm variations → weight shifts → knee drives → tennis ball catch.\nSmaller pipe = harder: 1.5" → 1" → 3/4".\n\nKey: Grip with toes. Parent pushes unpredictably — reflex training is gold.',yt:'PVC pipe balance peroneal training progression'},
    {name:'Rainbow Flick',icon:'🌈',content:'Step 1: Position ball between feet.\nStep 2: Dominant foot rolls ball up the back of non-dominant leg.\nStep 3: Non-dominant heel flicks the ball UP and OVER.\nStep 4: Jump over the arc of the ball.\nStep 5: Land and control.\n\nLearn the foot motion without the ball first. × 50 slow reps.',yt:'rainbow flick tutorial slow motion beginner'},
  ];
  techs.forEach((t,i)=>{
    techEl.innerHTML+=`<div class="day-card" id="tech-${i}"><div class="day-hdr" onclick="toggleDay('tech-${i}')"><div class="day-dot" style="background:var(--green)"></div><div class="day-name">${t.icon} ${t.name}</div><div class="day-chev">›</div></div><div class="day-body"><div style="font-size:.79rem;color:var(--mid);line-height:1.7;white-space:pre-wrap;margin-top:8px">${t.content}</div><div class="drill-yt" onclick="window.open('https://www.youtube.com/results?search_query='+encodeURIComponent('${t.yt}'),'_blank')">▶ YouTube: ${t.yt}</div></div></div>`;
  });
}

function renderLilyWeek(wk){
  const el=document.getElementById('lily-week-content');
  let html=`<div style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin-bottom:10px;"><div style="font-family:'Barlow Condensed',sans-serif;font-size:.62rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${wk.color};margin-bottom:2px">Week ${wk.week}</div><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:1.2rem;color:#fff">${wk.theme}</div></div>`;
  wk.days.forEach((day,di)=>{
    const id=`lily-day-w${wk.week}d${di}`;
    html+=`<div class="day-card" id="${id}"><div class="day-hdr" onclick="toggleDay('${id}')"><div class="day-dot" style="background:${day.color}"></div><div class="day-name">${day.name}</div><div class="day-tag" style="background:${day.color}22;color:${day.color}">${day.type}</div><div class="day-chev">›</div></div><div class="day-body">`;
    day.drills.forEach((drill,dri)=>{
      const cid=`check-${id}-${dri}`;
      const isBonus=drill.name.startsWith('BONUS');
      const key=`${wk.week}|${day.name}|${drill.name}`;
      const done=drillCompletions.has(key);
      html+=`<div class="drill" id="drill-${cid}" style="${done?'opacity:.5':''}"><div class="drill-name">${isBonus?'⭐ ':''}${drill.name}</div><div class="drill-detail">${drill.detail}</div><div class="drill-why">🧠 ${drill.why}</div><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><div class="drill-yt" onclick="window.open('https://www.youtube.com/results?search_query='+encodeURIComponent('${drill.yt.replace(/'/g,"\\'")}'),'_blank')">▶ YouTube</div><label class="check-drill"><input type="checkbox" id="${cid}" data-week="${wk.week}" data-day="${day.name}" data-drill="${drill.name}"${done?' checked':''} onchange="checkDrill(this)"> Done</label></div></div>`;
    });
    html+=`</div></div>`;
  });
  el.innerHTML=html;
}

function toggleDay(id){document.getElementById(id).classList.toggle('open');}

async function checkDrill(el){
  const drillEl=el.closest('.drill');
  if(drillEl) drillEl.style.opacity=el.checked?'0.5':'1';
  const weekNum=parseInt(el.dataset.week);
  const dayName=el.dataset.day;
  const drillName=el.dataset.drill;
  const key=`${weekNum}|${dayName}|${drillName}`;
  if(el.checked) drillCompletions.add(key); else drillCompletions.delete(key);
  try{
    await fetch('/api/drills/Lily',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({week_num:weekNum,day_name:dayName,drill_name:drillName,completed:el.checked})
    });
  } catch(e){}
}

// ── NEURAL TRAINING ───────────────────────────────────────────────────────
function buildNeuralFilter(){
  const bar=document.getElementById('neural-filter-bar');
  bar.innerHTML='';
  NEURAL_GROUPS.forEach(g=>{
    const btn=document.createElement('button');
    btn.className='fbtn'+(g===neuralGroup?' active':'');
    btn.textContent=NEURAL_GROUP_LABELS[g];
    btn.onclick=()=>{neuralGroup=g;document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderNeuralExercises();};
    bar.appendChild(btn);
  });
}

function renderNeuralExercises(){
  const el=document.getElementById('neural-ex-list');
  const filtered=neuralGroup==='all'?NEURAL_EXERCISES:NEURAL_EXERCISES.filter(e=>e.group===neuralGroup);
  el.innerHTML='';
  filtered.forEach(ex=>{
    const isYouth=neuralProfile==='youth';
    const pd=isYouth?ex.youth:ex.adult;
    const notRec=isYouth&&(pd.sets.toLowerCase().includes('n/a')||pd.sets.toLowerCase().includes('not'));
    const div=document.createElement('div');
    div.className='ex-card'; div.id='nex-'+ex.id;
    div.innerHTML=`<div class="ex-hdr" onclick="document.getElementById('nex-${ex.id}').classList.toggle('open')"><div class="ex-dot" style="background:${ex.color};box-shadow:0 0 6px ${ex.color}44"></div><div class="ex-info"><div class="ex-name">${ex.name}</div><div class="ex-meta"><span class="ebadge eb-m">${NEURAL_GROUP_LABELS[ex.group]}</span><span class="ebadge eb-t">${ex.type}</span><span class="ebadge eb-e">${ex.equip}</span>${ex.youthSafe&&isYouth?'<span class="ebadge eb-y">✓ Youth</span>':''}${notRec?'<span class="ebadge" style="background:rgba(239,35,60,.12);color:#ef233c">⚠ Modify</span>':''}</div></div><div class="ex-chev">›</div></div><div class="ex-body"><div class="detail-lbl">How to do it</div><div class="detail-txt">${ex.desc}</div><div class="sets-grid"><div class="set-box"><div class="set-who">${isYouth?'👧 Youth Sets':'💪 Sets'}</div><div class="set-val">${pd.sets}</div></div><div class="set-box"><div class="set-who">Reps / Duration</div><div class="set-val" style="font-size:.8rem">${pd.reps||'—'}</div></div></div>${pd.note?`<div class="tip-bar"><div class="tip-txt">${pd.note}</div></div>`:''}<div class="mech-bar"><div class="mech-lbl">🧠 Why It Works</div><div class="mech-txt">${ex.mechanism}</div></div><div class="tip-bar"><div class="tip-txt">${ex.tip}</div></div>${ex.contrast?`<div class="detail-lbl">Contrast Pair</div><div class="detail-txt" style="color:var(--orange2)">→ ${ex.contrast}</div>`:''}<div class="yt-btn" onclick="window.open('https://www.youtube.com/results?search_query='+encodeURIComponent('${ex.yt}'),'_blank')">▶ YouTube: ${ex.yt.slice(0,50)}</div></div>`;
    el.appendChild(div);
  });
}

function setNeuralProfile(p,btn){
  neuralProfile=p;
  document.querySelectorAll('.pbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderNeuralExercises();
}

// ── TRACKER ───────────────────────────────────────────────────────────────
async function buildTracker(){
  const el=document.getElementById('tracker-content');
  el.innerHTML='<div style="text-align:center;padding:2rem;color:var(--muted);font-size:.8rem">Loading...</div>';
  const emojis={Lily:'👧',Tim:'👨',Kara:'👩',Mason:'👦'};
  let html='';
  for(const [name,metrics] of Object.entries(TRACKER_METRICS)){
    let latest={},best={};
    try{
      const r=await fetch('/api/metrics/'+name);
      const data=await r.json();
      latest=data.latest||{}; best=data.best||{};
    } catch(e){}
    html+=`<div class="tracker-card"><div class="tracker-name">${emojis[name]||'👤'} ${name}</div>`;
    metrics.forEach(m=>{
      const key=m.replace(/[^a-z0-9]/gi,'_');
      const val=latest[key]||'';
      const pr=best[key];
      html+=`<div class="metric-row"><div class="metric-label">${m}</div><input class="metric-input" type="number" step="0.01" placeholder="—" value="${val}" id="metric_${name}_${key}">${pr?`<span class="metric-pr">PR: ${pr}</span>`:''}</div>`;
    });
    html+=`<button class="save-btn" onclick="saveTracker('${name}')">💾 Save Week</button></div>`;
  }
  el.innerHTML=html;
}

async function saveTracker(name){
  const metrics=TRACKER_METRICS[name];
  const data={};
  metrics.forEach(m=>{
    const key=m.replace(/[^a-z0-9]/gi,'_');
    const val=document.getElementById(`metric_${name}_${key}`)?.value;
    if(val) data[key]=parseFloat(val);
  });
  try{
    await fetch('/api/metrics/'+name,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({metrics:data})
    });
    const btn=event.target;
    btn.textContent='✅ Saved!';
    setTimeout(()=>{btn.textContent='💾 Save Week';buildTracker();},1500);
  } catch(e){
    alert('Save failed — check your connection.');
  }
}

// ── MEMBER PHOTOS ─────────────────────────────────────────────────────────
async function loadMemberPhotos(){
  try{
    const r=await fetch('/api/members/photos');
    const data=await r.json();
    for(const [name,url] of Object.entries(data.photos||{})){
      const av=document.getElementById('av-'+name);
      if(av) av.innerHTML=`<img src="${url}" alt="${name}">`;
    }
  } catch(e){}
}

async function uploadMemberPhoto(name,file){
  if(!file) return;
  const fd=new FormData();
  fd.append('photo',file);
  try{
    const r=await fetch(`/api/members/${name}/photo`,{method:'POST',body:fd});
    const data=await r.json();
    if(data.url){
      const av=document.getElementById('av-'+name);
      if(av) av.innerHTML=`<img src="${data.url}?t=${Date.now()}" alt="${name}">`;
    }
  } catch(e){
    alert('Photo upload failed.');
  }
}

// ── SCIENCE ───────────────────────────────────────────────────────────────
function buildScience(){
  document.getElementById('science-content').innerHTML=`
  <div class="science-card"><div class="science-title">Strength vs Power vs Explosiveness vs Violence</div><div class="science-txt"><strong style="color:var(--text)">Strength</strong> is how much force a muscle can produce. The ceiling. Potential energy — not expressed until something converts it.\n\n<strong style="color:var(--text)">Power</strong> is Force × Velocity. A 600lb squatter who takes 3 seconds is less powerful than a 300lb squatter who explodes in 0.3 seconds.\n\n<strong style="color:var(--text)">Explosiveness</strong> is Rate of Force Development (RFD) — how FAST you reach peak power. If ground contact is 0.08 seconds and you reach peak force in 0.3 seconds, your power never even activates. Polamalu wasn't the biggest safety — he was the most explosive.\n\n<strong style="color:var(--text)">Violence</strong> is explosiveness with no hesitation. The Golgi tendon organ applies a neural brake at maximum effort. Athletes described as "violent" movers have overridden that brake through extreme iso holds.</div></div>
  <div class="science-card"><div class="science-title">The Four Training Quadrants</div><div class="quad-grid"><div class="quad-box"><div class="quad-lbl" style="color:var(--purple)">Heavy · Slow</div><div class="quad-title">Strength Foundation</div><div class="quad-desc">Heavy calf raises, slow squats, Nordic curls. Builds the ceiling. Most gym training lives here.</div></div><div class="quad-box"><div class="quad-lbl" style="color:var(--orange)">Heavy · Fast</div><div class="quad-title">Power</div><div class="quad-desc">Olympic lifts, jump squats with load, resisted sprints. Force × velocity.</div></div><div class="quad-box"><div class="quad-lbl" style="color:var(--blue)">Light · Slow</div><div class="quad-title">Neural Recruitment</div><div class="quad-desc">Long iso holds, PVC balance, wall squat. Accesses motor units that normal exercise can't reach. The Schroeder foundation.</div></div><div class="quad-box"><div class="quad-lbl" style="color:var(--green)">Light · Fast</div><div class="quad-title">Elasticity / SSC</div><div class="quad-desc">Band assisted jumps, pogos, bounding. Overspeed eccentric — the garage setup.</div></div></div><div style="font-size:.76rem;color:var(--muted);margin-top:10px;line-height:1.6">Most gym training lives entirely in Heavy·Slow. The garage band setup lives in Light·Fast. Complete development hits all four. Sequence: Neural → SSC → Power in each session.</div></div>
  <div class="science-card"><div class="science-title">Energy Transfer &amp; the Stretch-Shortening Cycle</div><div class="science-txt"><strong style="color:var(--text)">Flat-footed runner:</strong> Force returns, ankle collapses, knee bends, hip sinks. Energy disperses as heat across every joint. Near-zero elastic return per step.\n\n<strong style="color:var(--text)">Trained spring ankle:</strong> Force returns, stiff ankle redirects it immediately into next stride. Achilles pre-loaded before contact releases elastic energy for free. Elite sprinters get 40-50% of forward propulsion from elastic return alone.\n\nThe band jump amplifies this: bands bring you down FASTER than gravity, training the Achilles to handle higher energy levels than normal movement creates. When bands come off — gravity feels slow.\n\n<strong style="color:var(--text)">Lily's flat-footed running</strong> is a nervous system timing problem — not a strength deficit. The pattern fixes through: pogo jumps → A-skip → falling start → reactive drills.</div></div>
  <div class="science-card"><div class="science-title">The EvoSport / Schroeder / Polamalu Method</div><div class="science-txt">Jay Schroeder's training system — used on Troy Polamalu and Adam Archuleta — is built on one premise: the CNS (central nervous system) is the limiting factor, not muscle size or cardiovascular fitness.\n\nCore pillars:\n• Extreme isometric holds (30-90 sec) to override Golgi tendon inhibition\n• Overspeed eccentrics (band jumps) to train above normal movement speeds\n• Reflexive strength — force production without conscious thought\n• Full body tension — total stiffness under dynamic load\n\nArchuleta went from undrafted prospect to physically dominant NFL safety entirely through this system.\n\nThe session sequence: Neural Recruitment → SSC Expression → Power. Always in that order.</div></div>`;
}

// ── INIT ──────────────────────────────────────────────────────────────────
async function init(){
  buildLilyProgram();
  buildNeuralFilter();
  renderNeuralExercises();
  buildScience();
  await loadDrillCompletions();
  renderLilyWeek(LILY_PROGRAM[0]);
  await buildTracker();
  await loadMemberPhotos();
}
init();
