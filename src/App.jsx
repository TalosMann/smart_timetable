import { useState, useEffect, useRef } from 'react';
import { TEMPLATES, CATEGORY_COLORS, SOUND_OPTIONS } from './data.js';
import { rescheduleAll } from './notifications.js';
import {
  loadEvents, saveEvents, loadTempEvents, saveTempEvents,
  isOnboarded, setOnboarded, loadGlobalSound, saveGlobalSound,
  loadAccomplishments, saveAccomplishments, clearAllData
} from './storage.js';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function uid() { return 'ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6); }
function taskId() { return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,5); }
function timeToMin(t) { if (!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; }
function minToTime(m) { const h=Math.floor(m/60)%24, mn=m%60; return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`; }
function fmtTime(t) { if (!t) return ''; const [h,m] = t.split(':').map(Number); const ap=h>=12?'PM':'AM', h12=h%12||12; return `${h12}:${String(m).padStart(2,'0')} ${ap}`; }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDateDisplay(ds) { return new Date(ds+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}); }
function getTodayDayName() { return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]; }

// ── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('loading');
  const [events, setEvents] = useState([]);
  const [tempEvents, setTempEvents] = useState([]);
  const [globalSoundOn, setGlobalSoundOn] = useState(true);
  const [accomplishments, setAccomplishments] = useState({});
  const [selectedDay, setSelectedDay] = useState(getTodayDayName());
  const [editingEvent, setEditingEvent] = useState(null);
  const [checklistEvent, setChecklistEvent] = useState(null);

  useEffect(() => {
    (async () => {
      const onboarded = await isOnboarded();
      const evts = await loadEvents();
      const temps = await loadTempEvents();
      const sound = await loadGlobalSound();
      const acc = await loadAccomplishments();
      setEvents(evts); setTempEvents(temps); setGlobalSoundOn(sound); setAccomplishments(acc);
      setView(onboarded ? 'timetable' : 'onboarding');
    })();
  }, []);

  useEffect(() => { if (view !== 'loading') saveEvents(events); }, [events]);
  useEffect(() => { if (view !== 'loading') saveTempEvents(tempEvents); }, [tempEvents]);
  useEffect(() => { if (view !== 'loading') saveGlobalSound(globalSoundOn); }, [globalSoundOn]);

  useEffect(() => {
    const now = new Date();
    const active = tempEvents.filter(e => { const [h,m]=e.end.split(':').map(Number); const end=new Date(); end.setHours(h,m,0,0); return end>now; });
    if (active.length !== tempEvents.length) setTempEvents(active);
  }, []);

  useEffect(() => {
    if (view === 'loading') return;
    rescheduleAll(events, tempEvents, globalSoundOn);
  }, [events, tempEvents, globalSoundOn]);

  async function handleSelectTemplate(template) {
    const seeded = template.events.map(e => ({ ...e, id: uid(), checklist: e.checklist || [] }));
    setEvents(seeded); await setOnboarded(true); setView('timetable');
  }

  function handleAddEvent(event) {
    setEvents(prev => [...prev, { ...event, id: uid(), checklist: event.checklist || [] }]);
    setView('timetable');
  }

  function handleUpdateEvent(updated) {
    setEvents(prev => prev.map(e => e.id === updated.id ? { ...updated, checklist: updated.checklist || [] } : e));
    setView('timetable'); setEditingEvent(null);
  }

  function handleDeleteEvent(id) {
    setEvents(prev => prev.filter(e => e.id !== id));
    setAccomplishments(prev => { const next={...prev}; delete next[id]; saveAccomplishments(next); return next; });
    setView('timetable'); setEditingEvent(null);
  }

  function handleAddTemp(event) {
    setTempEvents(prev => [...prev, { ...event, id: uid(), isTemp: true, checklist: [] }]);
    setView('timetable');
  }

  async function handleReset() {
    await clearAllData(); setEvents([]); setTempEvents([]); setAccomplishments({}); setView('onboarding');
  }

  function handleOpenChecklist(event) { setChecklistEvent(event); setView('checklist'); }

  async function handleToggleTask(eventId, tid, checked) {
    const date = todayStr();
    setAccomplishments(prev => {
      const next = { ...prev };
      if (!next[eventId]) next[eventId] = {};
      if (!next[eventId][date]) next[eventId][date] = {};
      next[eventId][date][tid] = checked;
      saveAccomplishments(next);
      return next;
    });
  }

  if (view === 'loading') return <div style={S.screen}><div style={S.loadCenter}><div style={S.spinner}/></div></div>;
  if (view === 'onboarding') return <Onboarding onSelect={handleSelectTemplate} />;
  if (view === 'addEvent') return <EventForm event={{day:selectedDay,start:'09:00',end:'10:00',title:'',color:'#818CF8',notify:false,notifyBefore:10,sound:'default',soundEnabled:true,checklist:[]}} onSave={handleAddEvent} onCancel={()=>setView('timetable')} />;
  if (view === 'editEvent' && editingEvent) return <EventForm event={editingEvent} onSave={handleUpdateEvent} onCancel={()=>{setView('timetable');setEditingEvent(null);}} onDelete={()=>handleDeleteEvent(editingEvent.id)} />;
  if (view === 'addTemp') return <TempForm onSave={handleAddTemp} onCancel={()=>setView('timetable')} currentDay={selectedDay} />;
  if (view === 'settings') return <Settings events={events} globalSoundOn={globalSoundOn} setGlobalSoundOn={setGlobalSoundOn} onReset={handleReset} onBack={()=>setView('timetable')} />;
  if (view === 'checklist' && checklistEvent) return <ChecklistView event={checklistEvent} accomplishments={accomplishments} onToggleTask={handleToggleTask} onViewHistory={()=>setView('checklistHistory')} onBack={()=>{setView('timetable');setChecklistEvent(null);}} />;
  if (view === 'checklistHistory' && checklistEvent) return <HistoryView event={checklistEvent} accomplishments={accomplishments} onBack={()=>setView('checklist')} />;

  return <Timetable events={[...events,...tempEvents]} day={selectedDay} setDay={setSelectedDay} accomplishments={accomplishments} onAddEvent={()=>setView('addEvent')} onAddTemp={()=>setView('addTemp')} onEditEvent={e=>{setEditingEvent(e);setView('editEvent');}} onOpenChecklist={handleOpenChecklist} onViewSettings={()=>setView('settings')} />;
}

// ── Timetable ─────────────────────────────────────────────────────────────────
function Timetable({ events, day, setDay, accomplishments, onAddEvent, onAddTemp, onEditEvent, onOpenChecklist, onViewSettings }) {
  const todayName = getTodayDayName();
  const dayEvents = events.filter(e=>e.day===day).sort((a,b)=>timeToMin(a.start)-timeToMin(b.start));
  const now = new Date(); const nowMin = now.getHours()*60+now.getMinutes();
  const touchStart = useRef(null);

  function handleTouchStart(e) { touchStart.current = {x:e.touches[0].clientX, y:e.touches[0].clientY}; }
  function handleTouchEnd(e) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      const idx = DAYS.indexOf(day);
      if (dx < 0 && idx < 6) setDay(DAYS[idx+1]);
      if (dx > 0 && idx > 0) setDay(DAYS[idx-1]);
    }
    touchStart.current = null;
  }

  return (
    <div style={S.screen}>
      <div style={S.header}>
        <div style={S.headerTitle}>Timetable</div>
        <button style={S.iconBtn} onClick={onViewSettings}><Icon name="settings"/></button>
      </div>
      <div style={S.dayStrip}>
        {DAYS.map((d,i) => (
          <button key={d} onClick={()=>setDay(d)} style={{...S.dayBtn,...(d===day?S.dayBtnActive:{}),...(d===todayName&&d!==day?S.dayBtnToday:{})}}>
            {DAY_SHORT[i]}
          </button>
        ))}
      </div>
      <div style={S.eventList} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {dayEvents.length === 0 && (
          <div style={S.emptyState}>
            <div style={{fontSize:40}}>📅</div>
            <div style={{fontSize:16,fontWeight:600,color:'#475569'}}>No events for {day}</div>
            <div style={{fontSize:13,color:'#334155'}}>Tap + to add one</div>
          </div>
        )}
        {dayEvents.map(e => {
          const isLive = day===todayName && nowMin>=timeToMin(e.start) && nowMin<timeToMin(e.end);
          const isPast = day===todayName && nowMin>=timeToMin(e.end);
          const checkCount = (e.checklist||[]).length;
          const todayChecks = ((accomplishments[e.id]||{})[todayStr()])||{};
          const doneCount = (e.checklist||[]).filter(t=>todayChecks[t.id]).length;
          return (
            <div key={e.id} style={{...S.eventCard, borderLeftColor:e.color, opacity:isPast?0.5:1}}>
              <div style={{...S.eventDot, background:e.color}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={S.eventTitle}>{e.title}{e.isTemp&&<span style={S.tempBadge}>TEMP</span>}</div>
                  {isLive && <div style={S.liveBadge}>LIVE</div>}
                </div>
                <div style={S.eventTime}>{fmtTime(e.start)} – {fmtTime(e.end)}</div>
                {checkCount > 0 && (
                  <div style={S.checklistMini}>
                    <span style={{color: doneCount===checkCount ? '#34D399' : '#818CF8'}}>✓</span>
                    <span style={{color:'#64748B'}}> {doneCount}/{checkCount} tasks</span>
                  </div>
                )}
              </div>
              <div style={{display:'flex',gap:4,flexShrink:0}}>
                {checkCount > 0 && (
                  <button style={{...S.iconBtn,color:'#818CF8'}} onClick={()=>onOpenChecklist(e)}><Icon name="checklist"/></button>
                )}
                {!e.isTemp && (
                  <button style={S.iconBtn} onClick={()=>onEditEvent(e)}><Icon name="edit"/></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button style={{...S.fab,...S.fabTemp}} onClick={onAddTemp}><Icon name="bolt"/></button>
      <button style={S.fab} onClick={onAddEvent}><Icon name="plus"/></button>
    </div>
  );
}

// ── EventForm ─────────────────────────────────────────────────────────────────
function EventForm({ event, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({...event, checklist: event.checklist||[]});
  const [newTask, setNewTask] = useState('');
  function set(k,v) { setForm(f=>({...f,[k]:v})); }

  function addTask() {
    const text = newTask.trim(); if (!text) return;
    set('checklist', [...form.checklist, {id:taskId(), text}]);
    setNewTask('');
  }

  const COLORS = ['#818CF8','#34D399','#F472B6','#FB923C','#60A5FA','#A78BFA','#FBBF24','#F87171','#2DD4BF','#E879F9'];

  return (
    <div style={S.screen}>
      <div style={S.header}>
        <button style={S.iconBtn} onClick={onCancel}><Icon name="back"/></button>
        <div style={S.headerTitle}>{event.id ? 'Edit Event' : 'Add Event'}</div>
        {onDelete && <button style={{...S.iconBtn,color:'#EF4444'}} onClick={onDelete}><Icon name="trash"/></button>}
      </div>
      <div style={S.formBody}>
        <label style={S.label}>Title</label>
        <input style={S.input} value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Event name"/>
        <label style={S.label}>Day</label>
        <select style={S.input} value={form.day} onChange={e=>set('day',e.target.value)}>
          {DAYS.map(d=><option key={d}>{d}</option>)}
        </select>
        <div style={{display:'flex',gap:12}}>
          <div style={{flex:1}}><label style={S.label}>Start</label><input style={S.input} type="time" value={form.start} onChange={e=>set('start',e.target.value)}/></div>
          <div style={{flex:1}}><label style={S.label}>End</label><input style={S.input} type="time" value={form.end} onChange={e=>set('end',e.target.value)}/></div>
        </div>
        <label style={S.label}>Color</label>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:4}}>
          {COLORS.map(c=>(
            <button key={c} onClick={()=>set('color',c)} style={{width:30,height:30,borderRadius:'50%',background:c,border:'3px solid transparent',cursor:'pointer',...(form.color===c?{border:'3px solid #fff',boxShadow:`0 0 0 2px ${c}`}:{})}}/>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:16,marginBottom:4}}>
          <label style={{...S.label,marginTop:0,marginBottom:0}}>Notifications</label>
          <Toggle on={form.notify} onChange={v=>set('notify',v)}/>
        </div>
        {form.notify && (
          <select style={S.input} value={form.notifyBefore} onChange={e=>set('notifyBefore',Number(e.target.value))}>
            <option value={0}>At event time</option><option value={5}>5 min before</option>
            <option value={10}>10 min before</option><option value={15}>15 min before</option>
            <option value={30}>30 min before</option><option value={60}>1 hour before</option>
          </select>
        )}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:16,marginBottom:4}}>
          <label style={{...S.label,marginTop:0,marginBottom:0}}>Sound</label>
          <Toggle on={form.soundEnabled} onChange={v=>set('soundEnabled',v)}/>
        </div>
        {form.soundEnabled && (
          <select style={S.input} value={form.sound} onChange={e=>set('sound',e.target.value)}>
            <option value="default">Default</option><option value="none">None</option>
            <option value="beep">Beep</option><option value="chime">Chime</option>
            <option value="alert">Alert</option><option value="gentle">Gentle</option>
          </select>
        )}

        {/* ── Routine Checklist ── */}
        <div style={{height:1,background:'#1E293B',margin:'20px 0 12px'}}/>
        <div style={{fontSize:15,fontWeight:700,color:'#F1F5F9'}}>Routine Checklist</div>
        <div style={{fontSize:12,color:'#64748B',marginTop:4,marginBottom:12}}>Tasks to complete each time this event runs</div>

        {form.checklist.map((task,i)=>(
          <div key={task.id} style={{display:'flex',alignItems:'center',background:'#1E293B',borderRadius:8,padding:'10px 12px',marginBottom:6,gap:10}}>
            <div style={{width:20,height:20,borderRadius:'50%',background:'#334155',color:'#94A3B8',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{i+1}</div>
            <div style={{flex:1,fontSize:14,color:'#E2E8F0'}}>{task.text}</div>
            <button onClick={()=>set('checklist',form.checklist.filter(t=>t.id!==task.id))} style={{background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:20,padding:'0 4px',lineHeight:1}}>×</button>
          </div>
        ))}

        <div style={{display:'flex',gap:8,marginTop:8}}>
          <input style={{...S.input,flex:1,marginBottom:0}} value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTask()} placeholder="Add a task..."/>
          <button onClick={addTask} style={{background:'#818CF8',border:'none',borderRadius:10,padding:'0 16px',color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer',flexShrink:0}}>Add</button>
        </div>

        <div style={{height:24}}/>
        <button style={S.saveBtn} onClick={()=>onSave(form)}>Save Event</button>
        <div style={{height:40}}/>
      </div>
    </div>
  );
}

// ── TempForm ──────────────────────────────────────────────────────────────────
function TempForm({ onSave, onCancel, currentDay }) {
  const [form, setForm] = useState({title:'',day:currentDay,start:'12:00',end:'13:00',color:'#FBBF24',notify:false,notifyBefore:5,sound:'default',soundEnabled:true,isTemp:true,checklist:[]});
  function set(k,v) { setForm(f=>({...f,[k]:v})); }
  return (
    <div style={S.screen}>
      <div style={S.header}>
        <button style={S.iconBtn} onClick={onCancel}><Icon name="back"/></button>
        <div style={S.headerTitle}>Temporary Event</div>
      </div>
      <div style={S.formBody}>
        <div style={{background:'#1E293B',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#F59E0B',marginBottom:8}}>⚡ Auto-expires after end time</div>
        <label style={S.label}>Title</label>
        <input style={S.input} value={form.title} onChange={e=>set('title',e.target.value)} placeholder="What's happening?"/>
        <label style={S.label}>Day</label>
        <select style={S.input} value={form.day} onChange={e=>set('day',e.target.value)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select>
        <div style={{display:'flex',gap:12}}>
          <div style={{flex:1}}><label style={S.label}>Start</label><input style={S.input} type="time" value={form.start} onChange={e=>set('start',e.target.value)}/></div>
          <div style={{flex:1}}><label style={S.label}>End</label><input style={S.input} type="time" value={form.end} onChange={e=>set('end',e.target.value)}/></div>
        </div>
        <div style={{height:16}}/>
        <button style={{...S.saveBtn,background:'#F59E0B'}} onClick={()=>onSave(form)}>Add Temporary Event</button>
      </div>
    </div>
  );
}

// ── Onboarding ────────────────────────────────────────────────────────────────
function Onboarding({ onSelect }) {
  return (
    <div style={S.screen}>
      <div style={{padding:'48px 24px 16px',textAlign:'center'}}>
        <div style={{fontSize:26,fontWeight:800,color:'#F1F5F9'}}>Welcome to Timetable</div>
        <div style={{fontSize:15,color:'#94A3B8',marginTop:6}}>Choose a starting template</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,padding:'0 16px 32px',overflowY:'auto'}}>
        {TEMPLATES.map(t => (
          <button key={t.id} onClick={()=>onSelect(t)} style={{background:'#1E293B',border:`2px solid ${t.color}`,borderRadius:16,padding:16,cursor:'pointer',textAlign:'left'}}>
            <div style={{fontSize:28,marginBottom:8}}>{t.icon}</div>
            <div style={{fontSize:14,fontWeight:700,color:'#F1F5F9'}}>{t.name}</div>
            <div style={{fontSize:12,color:'#64748B',marginTop:4}}>{t.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── ChecklistView ─────────────────────────────────────────────────────────────
function ChecklistView({ event, accomplishments, onToggleTask, onViewHistory, onBack }) {
  const date = todayStr();
  const todayChecks = ((accomplishments[event.id]||{})[date])||{};
  const checklist = event.checklist||[];
  const doneCount = checklist.filter(t=>todayChecks[t.id]).length;
  const progress = checklist.length > 0 ? doneCount/checklist.length : 0;

  return (
    <div style={S.screen}>
      <div style={S.header}>
        <button style={S.iconBtn} onClick={onBack}><Icon name="back"/></button>
        <div style={S.headerTitle}>{event.title}</div>
        <button style={{...S.iconBtn,color:'#818CF8'}} onClick={onViewHistory}><Icon name="history"/></button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'8px 16px 32px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{fontSize:13,color:'#94A3B8',fontWeight:600}}>{formatDateDisplay(date)}</div>
          <div style={{fontSize:20,fontWeight:800,color:'#F1F5F9'}}>{doneCount}/{checklist.length}</div>
        </div>
        <div style={{height:6,background:'#1E293B',borderRadius:3,marginBottom:20,overflow:'hidden'}}>
          <div style={{height:'100%',borderRadius:3,transition:'width 0.4s ease',width:`${progress*100}%`,background:event.color}}/>
        </div>
        {checklist.length === 0 && (
          <div style={S.emptyState}>
            <div style={{fontSize:40}}>📋</div>
            <div style={{fontSize:16,fontWeight:600,color:'#475569'}}>No checklist items yet</div>
            <div style={{fontSize:13,color:'#334155'}}>Edit this event to add routine tasks</div>
          </div>
        )}
        {checklist.map(task => {
          const checked = !!todayChecks[task.id];
          return (
            <button key={task.id} onClick={()=>onToggleTask(event.id,task.id,!checked)}
              style={{display:'flex',alignItems:'center',background:checked?'#162032':'#1E293B',borderRadius:12,padding:'14px 16px',marginBottom:8,gap:14,border:'none',width:'100%',cursor:'pointer',textAlign:'left',transition:'background 0.2s'}}>
              <div style={{width:24,height:24,borderRadius:6,border:`2px solid ${checked?event.color:'#334155'}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:checked?event.color:'transparent',color:'#fff',transition:'all 0.2s'}}>
                {checked && <Icon name="check"/>}
              </div>
              <div style={{fontSize:15,color:checked?'#475569':'#E2E8F0',textDecoration:checked?'line-through':'none',flex:1}}>{task.text}</div>
            </button>
          );
        })}
        {doneCount===checklist.length && checklist.length>0 && (
          <div style={{textAlign:'center',padding:'20px',fontSize:15,color:'#34D399',fontWeight:700}}>🎉 All done for today!</div>
        )}
      </div>
    </div>
  );
}

// ── HistoryView ───────────────────────────────────────────────────────────────
function HistoryView({ event, accomplishments, onBack }) {
  const eventAcc = accomplishments[event.id]||{};
  const checklist = event.checklist||[];
  const dates = Object.keys(eventAcc).sort((a,b)=>b.localeCompare(a));

  return (
    <div style={S.screen}>
      <div style={S.header}>
        <button style={S.iconBtn} onClick={onBack}><Icon name="back"/></button>
        <div style={{flex:1}}>
          <div style={S.headerTitle}>Progress History</div>
          <div style={{fontSize:12,color:'#64748B'}}>{event.title}</div>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'8px 16px 32px'}}>
        {dates.length === 0 && (
          <div style={S.emptyState}>
            <div style={{fontSize:40}}>📊</div>
            <div style={{fontSize:16,fontWeight:600,color:'#475569'}}>No history yet</div>
            <div style={{fontSize:13,color:'#334155'}}>Check off tasks to build your progress log</div>
          </div>
        )}
        {dates.map(date => {
          const checks = eventAcc[date]||{};
          const done = checklist.filter(t=>checks[t.id]).length;
          const total = checklist.length;
          const pct = total>0 ? Math.round((done/total)*100) : 0;
          const pctColor = pct===100?'#34D399':pct>50?'#FBBF24':'#94A3B8';
          return (
            <div key={date} style={{background:'#1E293B',borderRadius:14,padding:'14px 16px',marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:700,color:'#F1F5F9'}}>{formatDateDisplay(date)}</div>
                <div style={{fontSize:16,fontWeight:800,color:pctColor}}>{pct}%</div>
              </div>
              <div style={{height:4,background:'#0F172A',borderRadius:2,marginBottom:12,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:2,width:`${pct}%`,background:pct===100?'#34D399':event.color}}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {checklist.map(task=>(
                  <div key={task.id} style={{display:'flex',alignItems:'flex-start',gap:8}}>
                    <span style={{fontSize:13,fontWeight:700,color:checks[task.id]?'#34D399':'#475569',flexShrink:0}}>{checks[task.id]?'✓':'○'}</span>
                    <span style={{fontSize:13,color:checks[task.id]?'#E2E8F0':'#64748B'}}>{task.text}</span>
                  </div>
                ))}
                {checklist.length===0 && <div style={{fontSize:12,color:'#475569'}}>No active checklist items for this event</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
function Settings({ events, globalSoundOn, setGlobalSoundOn, onReset, onBack }) {
  const [tab, setTab] = useState('notifications');
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <div style={S.screen}>
      <div style={S.header}>
        <button style={S.iconBtn} onClick={onBack}><Icon name="back"/></button>
        <div style={S.headerTitle}>Settings</div>
      </div>
      <div style={{display:'flex',borderBottom:'1px solid #1E293B',flexShrink:0}}>
        {['notifications','sounds','general'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:'none',border:'none',color:tab===t?'#818CF8':'#64748B',padding:'10px 4px',fontSize:13,fontWeight:600,cursor:'pointer',borderBottom:tab===t?'2px solid #818CF8':'2px solid transparent'}}>
            {t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>
      <div style={S.formBody}>
        {tab==='notifications' && (
          <>
            <div style={{fontSize:12,color:'#64748B',marginTop:12,marginBottom:8}}>Events with notifications enabled</div>
            {events.filter(e=>e.notify).length===0 && <div style={{fontSize:13,color:'#475569'}}>No events have notifications enabled</div>}
            {events.filter(e=>e.notify).map(e=>(
              <div key={e.id} style={{display:'flex',alignItems:'center',padding:'10px 0',gap:10,borderBottom:'1px solid #1E293B'}}>
                <div style={{...S.eventDot,background:e.color}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,color:'#E2E8F0'}}>{e.title}</div>
                  <div style={{fontSize:12,color:'#94A3B8'}}>{e.day} · {fmtTime(e.start)} · {e.notifyBefore?`${e.notifyBefore}m before`:'At time'}</div>
                </div>
              </div>
            ))}
          </>
        )}
        {tab==='sounds' && (
          <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:16,marginBottom:4}}>
              <div><div style={S.label}>Master Sound</div><div style={{fontSize:12,color:'#64748B'}}>All notification sounds</div></div>
              <Toggle on={globalSoundOn} onChange={setGlobalSoundOn}/>
            </div>
            <div style={{height:1,background:'#1E293B',margin:'16px 0'}}/>
            {events.map(e=>(
              <div key={e.id} style={{display:'flex',alignItems:'center',padding:'10px 0',gap:10,borderBottom:'1px solid #1E293B'}}>
                <div style={{...S.eventDot,background:e.color}}/>
                <div style={{flex:1}}><div style={{fontSize:14,color:'#E2E8F0'}}>{e.title}</div><div style={{fontSize:12,color:'#94A3B8'}}>{e.sound||'default'}</div></div>
                <div style={{fontSize:12,color:e.soundEnabled?'#818CF8':'#475569'}}>{e.soundEnabled?'On':'Off'}</div>
              </div>
            ))}
          </>
        )}
        {tab==='general' && (
          <>
            <div style={{fontSize:12,color:'#64748B',marginTop:16,marginBottom:8}}>Danger Zone</div>
            <button onClick={()=>setShowConfirm(true)} style={{background:'#7F1D1D',border:'1px solid #EF4444',borderRadius:10,padding:'12px 20px',color:'#FCA5A5',fontSize:14,fontWeight:600,cursor:'pointer',width:'100%'}}>Reset All Data</button>
            <div style={{fontSize:12,color:'#475569',marginTop:8}}>Clears all events, accomplishments, and returns to template selection</div>
          </>
        )}
      </div>
      {showConfirm && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:24}}>
          <div style={{background:'#1E293B',borderRadius:16,padding:24,width:'100%',maxWidth:360}}>
            <div style={{fontSize:18,fontWeight:700,color:'#F1F5F9',marginBottom:10}}>Reset All Data?</div>
            <div style={{fontSize:14,color:'#94A3B8',marginBottom:20}}>This will delete all events and accomplishment history. This cannot be undone.</div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowConfirm(false)} style={{flex:1,background:'#334155',border:'none',borderRadius:10,padding:12,color:'#E2E8F0',fontSize:14,fontWeight:600,cursor:'pointer'}}>Cancel</button>
              <button onClick={onReset} style={{flex:1,background:'#EF4444',border:'none',borderRadius:10,padding:12,color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer'}}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <button onClick={()=>onChange(!on)} style={{width:46,height:26,borderRadius:13,border:'none',cursor:'pointer',position:'relative',flexShrink:0,transition:'background 0.2s',background:on?'#818CF8':'#334155'}}>
      <div style={{position:'absolute',top:3,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'transform 0.2s',transform:on?'translateX(20px)':'translateX(2px)'}}/>
    </button>
  );
}

// ── Icon ──────────────────────────────────────────────────────────────────────
function Icon({ name }) {
  const icons = {
    settings: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    back: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
    edit: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    plus: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    bolt: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13Z"/></svg>,
    trash: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
    check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>,
    checklist: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    history: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>,
  };
  return icons[name]||null;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  screen: {display:'flex',flexDirection:'column',height:'100%',background:'#0F172A',color:'#E2E8F0',overflow:'hidden'},
  loadCenter: {display:'flex',alignItems:'center',justifyContent:'center',height:'100%'},
  spinner: {width:32,height:32,border:'3px solid #1E293B',borderTop:'3px solid #818CF8',borderRadius:'50%',animation:'spin 0.8s linear infinite'},
  header: {display:'flex',alignItems:'center',padding:'16px 16px 8px',gap:8,flexShrink:0},
  headerTitle: {flex:1,fontSize:20,fontWeight:700,color:'#F1F5F9'},
  iconBtn: {background:'none',border:'none',color:'#94A3B8',cursor:'pointer',padding:8,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8},
  dayStrip: {display:'flex',padding:'4px 12px',gap:4,flexShrink:0,overflowX:'auto'},
  dayBtn: {flex:1,minWidth:40,background:'transparent',border:'1px solid transparent',color:'#64748B',borderRadius:8,padding:'6px 4px',cursor:'pointer',fontSize:12,fontWeight:600},
  dayBtnActive: {background:'#818CF8',color:'#fff',borderColor:'#818CF8'},
  dayBtnToday: {borderColor:'#818CF8'},
  eventList: {flex:1,overflowY:'auto',padding:'8px 16px 100px'},
  eventCard: {display:'flex',alignItems:'center',background:'#1E293B',borderRadius:12,padding:'12px 12px',marginBottom:8,borderLeft:'4px solid transparent',gap:10},
  eventDot: {width:10,height:10,borderRadius:'50%',flexShrink:0},
  eventTitle: {fontSize:15,fontWeight:600,color:'#F1F5F9',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  eventTime: {fontSize:12,color:'#94A3B8',marginTop:2},
  checklistMini: {fontSize:12,marginTop:4},
  liveBadge: {background:'#EF4444',color:'#fff',fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,flexShrink:0},
  tempBadge: {background:'#F59E0B',color:'#000',fontSize:10,fontWeight:700,padding:'1px 5px',borderRadius:4,marginLeft:6},
  fab: {position:'absolute',bottom:24,right:24,width:56,height:56,borderRadius:28,background:'#818CF8',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 20px rgba(129,140,248,0.4)'},
  fabTemp: {right:92,background:'#F59E0B',boxShadow:'0 4px 20px rgba(245,158,11,0.4)'},
  emptyState: {display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',gap:8},
  formBody: {flex:1,overflowY:'auto',padding:'8px 16px'},
  label: {display:'block',fontSize:12,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6,marginTop:16},
  input: {width:'100%',background:'#1E293B',border:'1px solid #334155',borderRadius:10,padding:'12px 14px',color:'#F1F5F9',fontSize:15,marginBottom:4,boxSizing:'border-box'},
  saveBtn: {width:'100%',background:'#818CF8',border:'none',borderRadius:12,padding:'14px',color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer'},
};
