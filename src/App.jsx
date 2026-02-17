import { useEffect, useState, useRef, useCallback } from 'react';
import { DAYS, CATEGORY_COLORS, SOUND_OPTIONS, DEFAULT_TEMPLATES } from './data.js';
import { rescheduleAll, requestPermissions } from './notifications.js';
import {
  saveEvents, loadEvents,
  saveTempEvents, loadTempEvents,
  setOnboarded, isOnboarded,
  saveGlobalSound, loadGlobalSound,
  loadCustomTemplates, upsertCustomTemplate, deleteCustomTemplate,
} from './storage.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const tmplUid = () => `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const timeToMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minToTime = n => {
  const h = Math.floor(n / 60) % 24;
  const m = n % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};
const fmtTime = t => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const autoColor = title =>
  CATEGORY_COLORS[title] || CATEGORY_COLORS[Object.keys(CATEGORY_COLORS).find(k => title.toLowerCase().includes(k.toLowerCase()))] || '#818CF8';

const today = () => {
  const d = new Date().getDay();
  return DAYS[d === 0 ? 6 : d - 1];
};

const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

// Attach fresh ids to template events
const hydrateEvents = events =>
  events.map(e => ({ ...e, id: uid(), isTemp: false }));

// ─── Default new-event shape ──────────────────────────────────────────────────

const newEventDefaults = (day = today()) => ({
  id: '',
  days: [day],          // multi-day array (new)
  day,                  // kept for single-event compat
  start: '09:00',
  end:   '10:00',
  title: '',
  color: '#818CF8',
  notify: true,
  notifyBefore: 10,
  sound: 'default',
  soundEnabled: true,
  isTemp: false,
});

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view,          setView]         = useState('loading');
  const [events,        setEvents]       = useState([]);
  const [tempEvents,    setTempEvents]   = useState([]);
  const [selectedDay,   setSelectedDay]  = useState(today());
  const [editingEvent,  setEditingEvent] = useState(null);
  const [globalSoundOn, setGlobalSoundOn]= useState(true);
  const [customTemplates, setCustomTemplates] = useState([]);

  // Boot: load all persisted data
  useEffect(() => {
    (async () => {
      const [onboarded, evts, temps, snd, custTmpls] = await Promise.all([
        isOnboarded(), loadEvents(), loadTempEvents(), loadGlobalSound(), loadCustomTemplates(),
      ]);
      const now = new Date();
      const liveTempEvents = temps.filter(e => e.endDate && new Date(e.endDate) > now);
      setEvents(evts);
      setTempEvents(liveTempEvents);
      setGlobalSoundOn(snd);
      setCustomTemplates(custTmpls);
      setView(onboarded ? 'timetable' : 'onboarding');
    })();
  }, []);

  // Persist events whenever they change
  useEffect(() => { if (view !== 'loading') saveEvents(events); }, [events]);
  useEffect(() => { if (view !== 'loading') saveTempEvents(tempEvents); }, [tempEvents]);

  // Reschedule notifications on any events change
  useEffect(() => {
    if (view !== 'loading') rescheduleAll(events, tempEvents, globalSoundOn);
  }, [events, tempEvents, globalSoundOn]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelectTemplate = async (template) => {
    const hydrated = hydrateEvents(template.events);
    setEvents(hydrated);
    await setOnboarded(true);
    setView('timetable');
  };

  const handleAddEvent = (eventData) => {
    // eventData.days is an array — create one event per day
    const days = eventData.days && eventData.days.length > 0 ? eventData.days : [eventData.day];
    const newEvts = days.map(day => ({
      ...eventData,
      id: uid(),
      day,
      days: undefined,  // store only the single day per event
      isTemp: false,
    }));
    setEvents(prev => [...prev, ...newEvts]);
    setView('timetable');
  };

  const handleEditEvent = (eventData) => {
    setEvents(prev => prev.map(e => e.id === eventData.id ? { ...eventData, days: undefined } : e));
    setView('timetable');
  };

  const handleDeleteEvent = (id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    setView('timetable');
  };

  const handleAddTemp = (eventData) => {
    const ev = { ...eventData, id: uid(), isTemp: true };
    setTempEvents(prev => [...prev, ev]);
    setView('timetable');
  };

  const handleDeleteTemp = (id) => {
    setTempEvents(prev => prev.filter(e => e.id !== id));
  };

  const handleSoundToggle = async (on) => {
    setGlobalSoundOn(on);
    await saveGlobalSound(on);
  };

  const handleReset = async () => {
    const { clearAllData } = await import('./storage.js');
    await clearAllData();
    setEvents([]);
    setTempEvents([]);
    setView('onboarding');
  };

  // ── Template management ──────────────────────────────────────────────────────

  const handleSaveTemplate = async ({ id, name, description, icon, color }) => {
    const template = {
      id: id || tmplUid(),
      name,
      description,
      icon: icon || '📋',
      color: color || '#818CF8',
      isDefault: false,
      events: events.map(({ id: _id, isTemp, ...rest }) => rest), // strip runtime ids
    };
    const updated = await upsertCustomTemplate(template);
    setCustomTemplates(updated);
    return template;
  };

  const handleDeleteCustomTemplate = async (id) => {
    const updated = await deleteCustomTemplate(id);
    setCustomTemplates(updated);
  };

  const handleLoadTemplate = async (template) => {
    const hydrated = hydrateEvents(template.events);
    setEvents(hydrated);
  };

  // ── Routing ──────────────────────────────────────────────────────────────────

  const allTemplates = [...DEFAULT_TEMPLATES, ...customTemplates];

  if (view === 'loading') {
    return (
      <div style={S.centered}>
        <div style={S.loader} />
      </div>
    );
  }

  if (view === 'onboarding') {
    return <Onboarding templates={allTemplates} onSelect={handleSelectTemplate} />;
  }

  if (view === 'addEvent') {
    return (
      <EventForm
        initial={editingEvent || newEventDefaults(selectedDay)}
        isEdit={false}
        onSave={handleAddEvent}
        onCancel={() => setView('timetable')}
      />
    );
  }

  if (view === 'editEvent' && editingEvent) {
    return (
      <EventForm
        initial={{ ...editingEvent, days: [editingEvent.day] }}
        isEdit={true}
        onSave={handleEditEvent}
        onDelete={handleDeleteEvent}
        onCancel={() => setView('timetable')}
      />
    );
  }

  if (view === 'addTemp') {
    return (
      <TempForm
        onSave={handleAddTemp}
        onCancel={() => setView('timetable')}
        globalSoundOn={globalSoundOn}
      />
    );
  }

  if (view === 'settings') {
    return (
      <Settings
        events={events}
        globalSoundOn={globalSoundOn}
        onSoundToggle={handleSoundToggle}
        onEventUpdate={ev => setEvents(prev => prev.map(e => e.id === ev.id ? ev : e))}
        onReset={handleReset}
        allTemplates={allTemplates}
        customTemplates={customTemplates}
        onSaveTemplate={handleSaveTemplate}
        onDeleteCustomTemplate={handleDeleteCustomTemplate}
        onLoadTemplate={handleLoadTemplate}
        onClose={() => setView('timetable')}
      />
    );
  }

  return (
    <Timetable
      events={events}
      tempEvents={tempEvents}
      selectedDay={selectedDay}
      onDayChange={setSelectedDay}
      onAddEvent={() => { setEditingEvent(null); setView('addEvent'); }}
      onEditEvent={ev => { setEditingEvent(ev); setView('editEvent'); }}
      onAddTemp={() => setView('addTemp')}
      onDeleteTemp={handleDeleteTemp}
      onOpenSettings={() => setView('settings')}
    />
  );
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

function Onboarding({ templates, onSelect }) {
  return (
    <div style={S.page}>
      <div style={S.onboardHeader}>
        <div style={S.onboardIcon}>📅</div>
        <h1 style={S.onboardTitle}>Timetable</h1>
        <p style={S.onboardSub}>Choose a template to get started</p>
      </div>
      <div style={S.tmplGrid}>
        {templates.map(t => (
          <button key={t.id} style={{ ...S.tmplCard, borderColor: t.color }} onClick={() => onSelect(t)}>
            <span style={S.tmplIcon}>{t.icon}</span>
            <span style={{ ...S.tmplDot, background: t.color }} />
            <span style={S.tmplName}>{t.name}</span>
            <span style={S.tmplDesc}>{t.description}</span>
            {!t.isDefault && <span style={S.tmplCustomBadge}>Custom</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Timetable ────────────────────────────────────────────────────────────────

function Timetable({ events, tempEvents, selectedDay, onDayChange, onAddEvent, onEditEvent, onAddTemp, onDeleteTemp, onOpenSettings }) {
  const now = nowMin();
  const todayName = today();

  const dayEvents = [
    ...events.filter(e => e.day === selectedDay),
    ...tempEvents.filter(e => e.day === selectedDay),
  ].sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerTitle}>Timetable</span>
        <button style={S.iconBtn} onClick={onOpenSettings}><Icon name="settings" /></button>
      </div>

      {/* Day strip */}
      <div style={S.dayStrip}>
        {DAYS.map(d => (
          <button
            key={d}
            style={{ ...S.dayBtn, ...(d === selectedDay ? S.dayBtnActive : {}) }}
            onClick={() => onDayChange(d)}
          >
            <span style={S.dayBtnLabel}>{d.slice(0,3)}</span>
            {d === todayName && <span style={S.todayDot} />}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div style={S.eventList}>
        {dayEvents.length === 0 && (
          <div style={S.emptyState}>
            <span style={{ fontSize: 40 }}>📭</span>
            <p style={{ marginTop: 12, color: '#94A3B8' }}>No events for {selectedDay}</p>
          </div>
        )}
        {dayEvents.map(ev => {
          const start = timeToMin(ev.start);
          const end   = timeToMin(ev.end);
          const isLive = selectedDay === todayName && now >= start && now < end;
          const isPast = selectedDay === todayName && now >= end;
          return (
            <button
              key={ev.id}
              style={{ ...S.eventCard, opacity: isPast ? 0.4 : 1, borderLeftColor: ev.color }}
              onClick={() => !ev.isTemp && onEditEvent(ev)}
            >
              <div style={S.eventCardInner}>
                <div style={S.eventLeft}>
                  <span style={{ ...S.eventDot, background: ev.color }} />
                  <div>
                    <div style={S.eventTitle}>{ev.title}</div>
                    <div style={S.eventTime}>{fmtTime(ev.start)} – {fmtTime(ev.end)}</div>
                  </div>
                </div>
                <div style={S.eventRight}>
                  {isLive && <span style={S.liveBadge}>LIVE</span>}
                  {ev.isTemp && (
                    <button style={S.deleteBtn} onClick={e => { e.stopPropagation(); onDeleteTemp(ev.id); }}>
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* FABs */}
      <div style={S.fabGroup}>
        <button style={S.fabTemp} onClick={onAddTemp}><Icon name="lightning" /></button>
        <button style={S.fab} onClick={onAddEvent}><Icon name="plus" /></button>
      </div>
    </div>
  );
}

// ─── EventForm (Add / Edit) ───────────────────────────────────────────────────

function EventForm({ initial, isEdit, onSave, onDelete, onCancel }) {
  const [form, setForm] = useState(() => ({
    ...initial,
    days: initial.days || [initial.day || today()],
  }));
  const [showDelete, setShowDelete] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDay = (day) => {
    set('days', form.days.includes(day)
      ? form.days.length > 1 ? form.days.filter(d => d !== day) : form.days // keep at least 1
      : [...form.days, day]
    );
  };

  const handleTitleChange = (v) => {
    set('title', v);
    if (!isEdit || form.color === '#818CF8') set('color', autoColor(v));
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    if (form.days.length === 0) return;
    onSave({ ...form, day: form.days[0] });
  };

  const palette = Object.values(CATEGORY_COLORS);
  const uniquePalette = [...new Set(palette)].slice(0, 20);

  return (
    <div style={S.page}>
      <div style={S.formHeader}>
        <button style={S.backBtn} onClick={onCancel}><Icon name="back" /></button>
        <span style={S.formTitle}>{isEdit ? 'Edit Event' : 'New Event'}</span>
        <button style={S.saveBtn} onClick={handleSave}>Save</button>
      </div>

      <div style={S.formBody}>
        {/* Title */}
        <label style={S.label}>Title</label>
        <input
          style={S.input}
          value={form.title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="Event name"
        />

        {/* Day Selector — Multi select */}
        <label style={S.label}>Day{!isEdit ? 's' : ''}</label>
        {isEdit ? (
          // When editing an existing event keep single-day for simplicity
          <div style={S.dayPicker}>
            {DAYS.map(d => (
              <button
                key={d}
                style={{ ...S.dayPillBtn, ...(form.days.includes(d) ? S.dayPillActive : {}) }}
                onClick={() => set('days', [d])}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div style={S.dayPicker}>
              {DAYS.map(d => (
                <button
                  key={d}
                  style={{ ...S.dayPillBtn, ...(form.days.includes(d) ? S.dayPillActive : {}) }}
                  onClick={() => toggleDay(d)}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            {/* Quick-select shortcuts */}
            <div style={S.quickDays}>
              {[
                { label: 'Weekdays', days: DAYS.slice(0, 5) },
                { label: 'Weekend',  days: DAYS.slice(5) },
                { label: 'All',      days: DAYS },
                { label: 'M/W/F',   days: ['Monday','Wednesday','Friday'] },
                { label: 'T/Th',    days: ['Tuesday','Thursday'] },
              ].map(q => (
                <button key={q.label} style={S.quickDayBtn}
                  onClick={() => set('days', q.days)}>
                  {q.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Time */}
        <div style={S.row}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Start</label>
            <input style={S.input} type="time" value={form.start}
              onChange={e => set('start', e.target.value)} />
          </div>
          <div style={{ width: 16 }} />
          <div style={{ flex: 1 }}>
            <label style={S.label}>End</label>
            <input style={S.input} type="time" value={form.end}
              onChange={e => set('end', e.target.value)} />
          </div>
        </div>

        {/* Color */}
        <label style={S.label}>Color</label>
        <div style={S.colorPicker}>
          {uniquePalette.map(c => (
            <button key={c} style={{ ...S.colorSwatch, background: c,
              outline: form.color === c ? `3px solid #1E293B` : 'none' }}
              onClick={() => set('color', c)} />
          ))}
        </div>

        {/* Notifications */}
        <div style={S.row}>
          <span style={S.label}>Notifications</span>
          <Toggle value={form.notify} onChange={v => set('notify', v)} />
        </div>
        {form.notify && (
          <div style={S.row}>
            <span style={S.label}>Remind me</span>
            <select style={S.select} value={form.notifyBefore}
              onChange={e => set('notifyBefore', Number(e.target.value))}>
              {[0,5,10,15,30,60].map(n => (
                <option key={n} value={n}>{n === 0 ? 'At event time' : `${n} min before`}</option>
              ))}
            </select>
          </div>
        )}

        {/* Sound */}
        <div style={S.row}>
          <span style={S.label}>Sound</span>
          <Toggle value={form.soundEnabled} onChange={v => set('soundEnabled', v)} />
        </div>
        {form.soundEnabled && (
          <div style={S.row}>
            <span style={S.label}>Sound type</span>
            <select style={S.select} value={form.sound}
              onChange={e => set('sound', e.target.value)}>
              {SOUND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        {/* Delete (edit only) */}
        {isEdit && (
          showDelete ? (
            <div style={S.deleteConfirm}>
              <span>Delete this event?</span>
              <div style={S.row}>
                <button style={S.deleteConfirmBtn} onClick={() => onDelete(form.id)}>Delete</button>
                <button style={S.cancelConfirmBtn} onClick={() => setShowDelete(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button style={S.deleteEventBtn} onClick={() => setShowDelete(true)}>
              Delete Event
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── TempForm ─────────────────────────────────────────────────────────────────

function TempForm({ onSave, onCancel, globalSoundOn }) {
  const [form, setForm] = useState({
    title: '', day: today(), days: [today()],
    start: minToTime(nowMin()), end: minToTime(nowMin() + 60),
    color: '#F59E0B', notify: true, notifyBefore: 0,
    sound: 'default', soundEnabled: true,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.title.trim()) return;
    const endDate = computeEndDate(form.day, form.end);
    const notifyAt = computeNotifyAt(form.day, form.start, form.notifyBefore);
    onSave({ ...form, day: form.days[0], endDate: endDate.toISOString(), notifyAt: notifyAt?.toISOString() });
  };

  return (
    <div style={S.page}>
      <div style={S.formHeader}>
        <button style={S.backBtn} onClick={onCancel}><Icon name="back" /></button>
        <span style={S.formTitle}>Temporary Event</span>
        <button style={S.saveBtn} onClick={handleSave}>Add</button>
      </div>
      <div style={S.formBody}>
        <p style={S.tempNote}>Temporary events disappear after their end time.</p>
        <label style={S.label}>Title</label>
        <input style={S.input} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Event name" />

        <label style={S.label}>Day</label>
        <div style={S.dayPicker}>
          {DAYS.map(d => (
            <button key={d}
              style={{ ...S.dayPillBtn, ...(form.day === d ? S.dayPillActive : {}) }}
              onClick={() => set('day', d)}>
              {d.slice(0, 3)}
            </button>
          ))}
        </div>

        <div style={S.row}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Start</label>
            <input style={S.input} type="time" value={form.start} onChange={e => set('start', e.target.value)} />
          </div>
          <div style={{ width: 16 }} />
          <div style={{ flex: 1 }}>
            <label style={S.label}>End</label>
            <input style={S.input} type="time" value={form.end} onChange={e => set('end', e.target.value)} />
          </div>
        </div>

        <div style={S.row}>
          <span style={S.label}>Notifications</span>
          <Toggle value={form.notify} onChange={v => set('notify', v)} />
        </div>
        {form.notify && (
          <div style={S.row}>
            <span style={S.label}>Remind me</span>
            <select style={S.select} value={form.notifyBefore} onChange={e => set('notifyBefore', Number(e.target.value))}>
              {[0,5,10,15,30,60].map(n => <option key={n} value={n}>{n === 0 ? 'At event time' : `${n} min before`}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function computeEndDate(day, endTime) {
  const now = new Date();
  const dayIdx = DAYS.indexOf(day);
  const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
  let diff = dayIdx - todayIdx;
  if (diff < 0) diff += 7;
  const d = new Date(now);
  d.setDate(d.getDate() + diff);
  const [h, m] = endTime.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
}

function computeNotifyAt(day, startTime, minutesBefore) {
  const end = computeEndDate(day, startTime);
  end.setMinutes(end.getMinutes() - minutesBefore);
  return end;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function Settings({
  events, globalSoundOn, onSoundToggle, onEventUpdate, onReset,
  allTemplates, customTemplates,
  onSaveTemplate, onDeleteCustomTemplate, onLoadTemplate,
  onClose,
}) {
  const [tab, setTab]           = useState('notifications');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [loadConfirm, setLoadConfirm] = useState(null); // template to load
  const [deleteConfirm, setDeleteConfirm] = useState(null); // template id to delete
  const [saveName, setSaveName]   = useState('');
  const [saveDesc, setSaveDesc]   = useState('');
  const [saveIcon, setSaveIcon]   = useState('📋');
  const [saveColor, setSaveColor] = useState('#818CF8');
  const [saveMsg, setSaveMsg]     = useState('');
  const [saveId,  setSaveId]      = useState(''); // empty = new template

  const TABS = ['notifications','sounds','templates','general'];

  const openSaveModal = (existing = null) => {
    if (existing) {
      setSaveId(existing.id);
      setSaveName(existing.name);
      setSaveDesc(existing.description || '');
      setSaveIcon(existing.icon || '📋');
      setSaveColor(existing.color || '#818CF8');
    } else {
      setSaveId('');
      setSaveName('My Schedule');
      setSaveDesc('Custom template');
      setSaveIcon('📋');
      setSaveColor('#818CF8');
    }
    setSaveModal(true);
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    const saved = await onSaveTemplate({ id: saveId || undefined, name: saveName, description: saveDesc, icon: saveIcon, color: saveColor });
    setSaveMsg(`"${saved.name}" saved!`);
    setSaveModal(false);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const ICON_OPTIONS = ['📋','🗓️','⭐','🔥','💡','🏋️','📚','💼','🎯','🌟','🎓','🏠'];

  return (
    <div style={S.page}>
      <div style={S.formHeader}>
        <button style={S.backBtn} onClick={onClose}><Icon name="back" /></button>
        <span style={S.formTitle}>Settings</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Tab bar */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button key={t} style={{ ...S.tabBtn, ...(tab === t ? S.tabBtnActive : {}) }}
            onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={S.formBody}>

        {/* ── Notifications tab ── */}
        {tab === 'notifications' && (
          <>
            <p style={S.settingNote}>Manage per-event notification settings.</p>
            {events.filter(e => !e.isTemp).sort((a,b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || timeToMin(a.start) - timeToMin(b.start)).map(ev => (
              <div key={ev.id} style={S.settingRow}>
                <div style={{ display:'flex', alignItems:'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ ...S.eventDot, background: ev.color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.title}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>{ev.day} · {fmtTime(ev.start)}</div>
                  </div>
                </div>
                <Toggle value={ev.notify} onChange={v => onEventUpdate({ ...ev, notify: v })} />
              </div>
            ))}
          </>
        )}

        {/* ── Sounds tab ── */}
        {tab === 'sounds' && (
          <>
            <div style={S.settingRow}>
              <div>
                <div style={{ fontWeight: 600 }}>Master Sound</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>Enable sound for all notifications</div>
              </div>
              <Toggle value={globalSoundOn} onChange={onSoundToggle} />
            </div>
            <div style={S.divider} />
            {events.filter(e => !e.isTemp).sort((a,b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || timeToMin(a.start) - timeToMin(b.start)).map(ev => (
              <div key={ev.id} style={{ ...S.settingRow, flexDirection:'column', alignItems:'flex-start', gap: 8 }}>
                <div style={{ display:'flex', alignItems:'center', gap: 10, width:'100%' }}>
                  <span style={{ ...S.eventDot, background: ev.color }} />
                  <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{ev.title}</span>
                  <Toggle value={ev.soundEnabled} onChange={v => onEventUpdate({ ...ev, soundEnabled: v })} />
                </div>
                {ev.soundEnabled && (
                  <select style={{ ...S.select, marginLeft: 28 }} value={ev.sound}
                    onChange={e => onEventUpdate({ ...ev, sound: e.target.value })}>
                    {SOUND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </div>
            ))}
          </>
        )}

        {/* ── Templates tab ── */}
        {tab === 'templates' && (
          <>
            {saveMsg && <div style={S.successMsg}>{saveMsg}</div>}

            {/* Save current as template */}
            <div style={S.settingSection}>
              <div style={S.settingSectionTitle}>Save Current Schedule</div>
              <p style={S.settingNote}>Save your current events as a reusable template.</p>
              <button style={S.primaryBtn} onClick={() => openSaveModal()}>
                💾  Save as New Template
              </button>
            </div>

            <div style={S.divider} />

            {/* Custom templates */}
            {customTemplates.length > 0 && (
              <>
                <div style={S.settingSectionTitle}>My Templates</div>
                {customTemplates.map(t => (
                  <div key={t.id} style={S.tmplRow}>
                    <span style={S.tmplRowIcon}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#94A3B8' }}>{t.description}</div>
                      <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{t.events.length} events</div>
                    </div>
                    <div style={{ display:'flex', gap: 8 }}>
                      <button style={S.tmplActionBtn} onClick={() => openSaveModal(t)}>✏️</button>
                      <button style={S.tmplActionBtn} onClick={() => setLoadConfirm(t)}>📥</button>
                      <button style={{ ...S.tmplActionBtn, color: '#EF4444' }} onClick={() => setDeleteConfirm(t.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
                <div style={S.divider} />
              </>
            )}

            {/* Default templates */}
            <div style={S.settingSectionTitle}>Built-in Templates</div>
            <p style={S.settingNote}>Load a built-in template to replace your current schedule.</p>
            {DEFAULT_TEMPLATES.map(t => (
              <div key={t.id} style={S.tmplRow}>
                <span style={S.tmplRowIcon}>{t.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{t.description}</div>
                  <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{t.events.length} events</div>
                </div>
                <button style={S.tmplActionBtn} onClick={() => setLoadConfirm(t)}>📥</button>
              </div>
            ))}

            {/* Load confirm dialog */}
            {loadConfirm && (
              <div style={S.modalOverlay}>
                <div style={S.modal}>
                  <div style={S.modalTitle}>Load Template</div>
                  <p style={S.modalText}>Load "{loadConfirm.name}"? This will replace your current schedule. Your saved templates won't be affected.</p>
                  <div style={S.modalBtns}>
                    <button style={S.modalConfirmBtn} onClick={async () => { await onLoadTemplate(loadConfirm); setLoadConfirm(null); }}>Load</button>
                    <button style={S.modalCancelBtn} onClick={() => setLoadConfirm(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete confirm dialog */}
            {deleteConfirm && (
              <div style={S.modalOverlay}>
                <div style={S.modal}>
                  <div style={S.modalTitle}>Delete Template</div>
                  <p style={S.modalText}>Are you sure you want to delete this template? This cannot be undone.</p>
                  <div style={S.modalBtns}>
                    <button style={{ ...S.modalConfirmBtn, background: '#EF4444' }}
                      onClick={async () => { await onDeleteCustomTemplate(deleteConfirm); setDeleteConfirm(null); }}>Delete</button>
                    <button style={S.modalCancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Save modal */}
            {saveModal && (
              <div style={S.modalOverlay}>
                <div style={{ ...S.modal, maxHeight: '80vh', overflowY:'auto' }}>
                  <div style={S.modalTitle}>{saveId ? 'Update Template' : 'Save as Template'}</div>

                  <label style={S.label}>Name</label>
                  <input style={{ ...S.input, marginBottom: 12 }} value={saveName}
                    onChange={e => setSaveName(e.target.value)} placeholder="Template name" />

                  <label style={S.label}>Description</label>
                  <input style={{ ...S.input, marginBottom: 12 }} value={saveDesc}
                    onChange={e => setSaveDesc(e.target.value)} placeholder="Short description" />

                  <label style={S.label}>Icon</label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap: 8, marginBottom: 12 }}>
                    {ICON_OPTIONS.map(ic => (
                      <button key={ic} style={{ ...S.iconPickerBtn, ...(saveIcon === ic ? S.iconPickerActive : {}) }}
                        onClick={() => setSaveIcon(ic)}>
                        {ic}
                      </button>
                    ))}
                  </div>

                  <label style={S.label}>Color</label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap: 8, marginBottom: 16 }}>
                    {['#6366F1','#0EA5E9','#10B981','#F97316','#EC4899','#EF4444','#8B5CF6','#F59E0B','#94A3B8','#14B8A6'].map(c => (
                      <button key={c} style={{ ...S.colorSwatch, background: c,
                        outline: saveColor === c ? '3px solid #1E293B' : 'none' }}
                        onClick={() => setSaveColor(c)} />
                    ))}
                  </div>

                  <div style={S.modalBtns}>
                    <button style={S.modalConfirmBtn} onClick={handleSave}>
                      {saveId ? 'Update' : 'Save'}
                    </button>
                    <button style={S.modalCancelBtn} onClick={() => setSaveModal(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── General tab ── */}
        {tab === 'general' && (
          <>
            <div style={S.settingSectionTitle}>Data</div>
            {resetConfirm ? (
              <div style={S.deleteConfirm}>
                <span>Reset all events and return to template picker?</span>
                <div style={S.row}>
                  <button style={S.deleteConfirmBtn} onClick={() => { setResetConfirm(false); onReset(); }}>Reset</button>
                  <button style={S.cancelConfirmBtn} onClick={() => setResetConfirm(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button style={S.deleteEventBtn} onClick={() => setResetConfirm(true)}>
                Reset App &amp; Return to Template Picker
              </button>
            )}
            <p style={S.settingNote}>This clears all events but keeps your saved custom templates.</p>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }) {
  return (
    <button
      style={{ ...S.toggle, background: value ? '#6366F1' : '#CBD5E1' }}
      onClick={() => onChange(!value)}
    >
      <span style={{ ...S.toggleThumb, transform: value ? 'translateX(20px)' : 'translateX(2px)' }} />
    </button>
  );
}

// ─── Icon ─────────────────────────────────────────────────────────────────────

function Icon({ name }) {
  const icons = {
    settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:22,height:22 }}>
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>,
    plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width:24,height:24 }}>
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>,
    lightning: <svg viewBox="0 0 24 24" fill="currentColor" style={{ width:22,height:22 }}>
      <path d="M13 2L4.5 13.5H11L10 22L20.5 10H14L13 2Z"/>
    </svg>,
    back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width:22,height:22 }}>
      <polyline points="15 18 9 12 15 6"/>
    </svg>,
    trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:18,height:18 }}>
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>,
  };
  return icons[name] || null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page:        { display:'flex', flexDirection:'column', height:'100%', background:'#F8FAFC', overflow:'hidden' },
  centered:    { display:'flex', alignItems:'center', justifyContent:'center', height:'100%' },
  loader:      { width:40, height:40, borderRadius:'50%', border:'4px solid #E2E8F0', borderTopColor:'#6366F1', animation:'spin 0.8s linear infinite' },

  // Header
  header:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 16px 8px', background:'#fff', borderBottom:'1px solid #E2E8F0' },
  headerTitle: { fontSize:20, fontWeight:700, color:'#1E293B' },
  iconBtn:     { background:'none', border:'none', color:'#64748B', cursor:'pointer', padding:4, borderRadius:8, display:'flex', alignItems:'center' },

  // Day strip
  dayStrip:    { display:'flex', gap:4, padding:'10px 12px', background:'#fff', borderBottom:'1px solid #E2E8F0', overflowX:'auto' },
  dayBtn:      { flex:'0 0 auto', padding:'6px 10px', borderRadius:10, border:'none', background:'#F1F5F9', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3 },
  dayBtnActive:{ background:'#6366F1' },
  dayBtnLabel: { fontSize:13, fontWeight:600, color:'inherit' },
  todayDot:    { width:5, height:5, borderRadius:'50%', background:'#F59E0B' },

  // Event list
  eventList:   { flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 },
  emptyState:  { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, padding:40 },
  eventCard:   { background:'#fff', border:'none', borderLeft:'4px solid', borderRadius:12, padding:'12px 14px', cursor:'pointer', textAlign:'left', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' },
  eventCardInner: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  eventLeft:   { display:'flex', alignItems:'center', gap:10 },
  eventRight:  { display:'flex', alignItems:'center', gap:8 },
  eventDot:    { width:10, height:10, borderRadius:'50%', flexShrink:0 },
  eventTitle:  { fontWeight:600, fontSize:15, color:'#1E293B' },
  eventTime:   { fontSize:12, color:'#64748B', marginTop:2 },
  liveBadge:   { fontSize:10, fontWeight:700, background:'#10B981', color:'#fff', padding:'2px 6px', borderRadius:6, letterSpacing:0.5 },
  deleteBtn:   { background:'none', border:'none', color:'#EF4444', cursor:'pointer', padding:4, borderRadius:6, display:'flex' },

  // FABs
  fabGroup:    { position:'absolute', bottom:24, right:20, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:12 },
  fab:         { width:56, height:56, borderRadius:28, background:'#6366F1', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 14px rgba(99,102,241,0.4)' },
  fabTemp:     { width:46, height:46, borderRadius:23, background:'#F59E0B', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 14px rgba(245,158,11,0.4)' },

  // Onboarding
  onboardHeader: { padding:'40px 24px 16px', textAlign:'center' },
  onboardIcon:   { fontSize:48, marginBottom:8 },
  onboardTitle:  { fontSize:28, fontWeight:800, color:'#1E293B', margin:0 },
  onboardSub:    { fontSize:15, color:'#64748B', marginTop:6 },
  tmplGrid:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, padding:'8px 16px 32px', overflowY:'auto' },
  tmplCard:      { background:'#fff', border:'2px solid', borderRadius:16, padding:'16px 12px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6, textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', position:'relative' },
  tmplIcon:      { fontSize:32 },
  tmplDot:       { width:8, height:8, borderRadius:'50%' },
  tmplName:      { fontSize:13, fontWeight:700, color:'#1E293B' },
  tmplDesc:      { fontSize:11, color:'#94A3B8' },
  tmplCustomBadge: { position:'absolute', top:8, right:8, fontSize:9, fontWeight:700, background:'#6366F1', color:'#fff', padding:'2px 5px', borderRadius:4 },

  // Form
  formHeader:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 16px 12px', background:'#fff', borderBottom:'1px solid #E2E8F0' },
  formTitle:   { fontSize:17, fontWeight:700, color:'#1E293B' },
  backBtn:     { background:'none', border:'none', color:'#6366F1', cursor:'pointer', padding:4, display:'flex' },
  saveBtn:     { background:'#6366F1', border:'none', color:'#fff', fontWeight:700, fontSize:15, padding:'8px 18px', borderRadius:10, cursor:'pointer' },
  formBody:    { flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:8 },

  label:       { fontSize:13, fontWeight:600, color:'#475569', marginBottom:4 },
  input:       { width:'100%', padding:'11px 13px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:15, color:'#1E293B', background:'#fff', boxSizing:'border-box' },
  select:      { padding:'8px 12px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:14, color:'#1E293B', background:'#fff' },
  row:         { display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 },

  // Day picker (multi)
  dayPicker:   { display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 },
  dayPillBtn:  { padding:'6px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'#F8FAFC', fontSize:13, fontWeight:600, color:'#64748B', cursor:'pointer' },
  dayPillActive: { background:'#6366F1', borderColor:'#6366F1', color:'#fff' },

  // Quick day selectors
  quickDays:   { display:'flex', flexWrap:'wrap', gap:6, marginBottom:4 },
  quickDayBtn: { padding:'4px 10px', borderRadius:6, border:'1.5px solid #CBD5E1', background:'#F1F5F9', fontSize:12, fontWeight:600, color:'#64748B', cursor:'pointer' },

  colorPicker: { display:'flex', flexWrap:'wrap', gap:8, marginBottom:4 },
  colorSwatch: { width:28, height:28, borderRadius:'50%', border:'none', cursor:'pointer', outlineOffset:2 },

  tempNote:    { fontSize:13, color:'#F59E0B', fontWeight:600, marginBottom:4 },

  // Delete button inside form
  deleteEventBtn: { marginTop:12, padding:'12px', borderRadius:10, border:'none', background:'#FEE2E2', color:'#EF4444', fontWeight:700, fontSize:15, cursor:'pointer' },
  deleteConfirm:  { background:'#FFF1F2', borderRadius:12, padding:16, display:'flex', flexDirection:'column', gap:10 },
  deleteConfirmBtn: { flex:1, padding:'10px', borderRadius:8, border:'none', background:'#EF4444', color:'#fff', fontWeight:700, cursor:'pointer' },
  cancelConfirmBtn: { flex:1, padding:'10px', borderRadius:8, border:'none', background:'#E2E8F0', color:'#475569', fontWeight:700, cursor:'pointer' },

  // Toggle
  toggle:      { width:44, height:26, borderRadius:13, border:'none', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 },
  toggleThumb: { position:'absolute', top:3, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'transform 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' },

  // Settings
  tabBar:      { display:'flex', gap:0, background:'#fff', borderBottom:'1px solid #E2E8F0', overflowX:'auto' },
  tabBtn:      { flex:'1 0 auto', padding:'12px 10px', border:'none', background:'none', fontSize:13, fontWeight:600, color:'#94A3B8', cursor:'pointer', borderBottom:'2px solid transparent', whiteSpace:'nowrap' },
  tabBtnActive: { color:'#6366F1', borderBottomColor:'#6366F1' },
  settingRow:  { display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 0', borderBottom:'1px solid #F1F5F9' },
  settingNote: { fontSize:12, color:'#94A3B8', marginBottom:8 },
  settingSection: { marginBottom:8 },
  settingSectionTitle: { fontSize:14, fontWeight:700, color:'#475569', marginBottom:8, marginTop:4 },
  divider:     { height:1, background:'#E2E8F0', margin:'12px 0' },
  successMsg:  { background:'#D1FAE5', color:'#065F46', padding:'10px 14px', borderRadius:10, fontSize:13, fontWeight:600, marginBottom:8 },
  primaryBtn:  { width:'100%', padding:'12px', borderRadius:10, border:'none', background:'#6366F1', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', marginTop:4 },

  // Template rows in settings
  tmplRow:     { display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #F1F5F9' },
  tmplRowIcon: { fontSize:24, flexShrink:0 },
  tmplActionBtn: { padding:'6px 8px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'#F8FAFC', fontSize:15, cursor:'pointer' },

  // Modal
  modalOverlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 },
  modal:        { background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(0,0,0,0.18)' },
  modalTitle:   { fontSize:18, fontWeight:700, color:'#1E293B', marginBottom:12 },
  modalText:    { fontSize:14, color:'#64748B', marginBottom:16, lineHeight:1.5 },
  modalBtns:    { display:'flex', gap:10, marginTop:16 },
  modalConfirmBtn: { flex:1, padding:'11px', borderRadius:10, border:'none', background:'#6366F1', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer' },
  modalCancelBtn:  { flex:1, padding:'11px', borderRadius:10, border:'none', background:'#E2E8F0', color:'#475569', fontWeight:700, fontSize:15, cursor:'pointer' },

  // Icon picker in modal
  iconPickerBtn:    { fontSize:22, padding:6, border:'2px solid #E2E8F0', borderRadius:8, background:'#F8FAFC', cursor:'pointer' },
  iconPickerActive: { borderColor:'#6366F1', background:'#EEF2FF' },
};
