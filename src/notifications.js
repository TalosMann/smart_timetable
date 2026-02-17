import { LocalNotifications } from '@capacitor/local-notifications';

// ─── Sound Resolution ─────────────────────────────────────────────────────────
//
// Three-layer resolution:
//   1. globalSoundOn === false → always silent
//   2. event.soundEnabled === false → silent
//   3. event.sound value → resolved to Capacitor sound param

export function resolveSoundField(event, globalSoundOn) {
  if (!globalSoundOn) return null;
  if (!event.soundEnabled) return null;
  const s = event.sound || 'default';
  if (s === 'none') return null;
  if (s === 'default') return 'default';
  return s; // custom filename in res/raw/
}

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestPermissions() {
  const { display } = await LocalNotifications.requestPermissions();
  return display === 'granted';
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

const DAY_MAP = {
  Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4,
  Thursday: 5, Friday: 6, Saturday: 7,
};

let _notifIdCounter = 1000;
function nextId() { return _notifIdCounter++; }

/**
 * Cancel all scheduled notifications then re-schedule from the current events
 * list. Called whenever events change.
 */
export async function rescheduleAll(events, tempEvents, globalSoundOn) {
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch (_) { /* ignore */ }

  const toSchedule = [];

  for (const ev of events) {
    if (!ev.notify) continue;
    const sound = resolveSoundField(ev, globalSoundOn);
    const [h, m] = ev.start.split(':').map(Number);
    const offsetMin = ev.notifyBefore || 0;
    let notifyMin = h * 60 + m - offsetMin;
    if (notifyMin < 0) notifyMin += 24 * 60;
    const notifyH = Math.floor(notifyMin / 60) % 24;
    const notifyM = notifyMin % 60;

    toSchedule.push({
      id: nextId(),
      title: ev.title,
      body: `Starting at ${fmtTime(ev.start)}${offsetMin > 0 ? ` (in ${offsetMin} min)` : ''}`,
      schedule: {
        on: { weekday: DAY_MAP[ev.day], hour: notifyH, minute: notifyM },
        allowWhileIdle: true,
      },
      sound: sound || undefined,
      channelId: 'timetable',
    });
  }

  for (const ev of tempEvents) {
    if (!ev.notify || !ev.notifyAt) continue;
    const fireAt = new Date(ev.notifyAt);
    if (fireAt <= new Date()) continue;
    const sound = resolveSoundField(ev, globalSoundOn);
    toSchedule.push({
      id: nextId(),
      title: ev.title,
      body: `Starting at ${fmtTime(ev.start)}`,
      schedule: { at: fireAt, allowWhileIdle: true },
      sound: sound || undefined,
      channelId: 'timetable',
    });
  }

  if (toSchedule.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications: toSchedule });
    } catch (_) { /* ignore scheduling errors silently */ }
  }
}

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}
