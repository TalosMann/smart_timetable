import { Preferences } from '@capacitor/preferences';

const KEYS = {
  EVENTS: 'timetable_events',
  TEMP_EVENTS: 'timetable_temp_events',
  ONBOARDED: 'timetable_onboarded',
  GLOBAL_SOUND: 'timetable_global_sound',
  ACCOMPLISHMENTS: 'timetable_accomplishments',
};

export async function loadEvents() {
  const { value } = await Preferences.get({ key: KEYS.EVENTS });
  return value ? JSON.parse(value) : [];
}

export async function saveEvents(events) {
  await Preferences.set({ key: KEYS.EVENTS, value: JSON.stringify(events) });
}

export async function loadTempEvents() {
  const { value } = await Preferences.get({ key: KEYS.TEMP_EVENTS });
  return value ? JSON.parse(value) : [];
}

export async function saveTempEvents(events) {
  await Preferences.set({ key: KEYS.TEMP_EVENTS, value: JSON.stringify(events) });
}

export async function isOnboarded() {
  const { value } = await Preferences.get({ key: KEYS.ONBOARDED });
  return value === 'true';
}

export async function setOnboarded(val) {
  await Preferences.set({ key: KEYS.ONBOARDED, value: val ? 'true' : 'false' });
}

export async function loadGlobalSound() {
  const { value } = await Preferences.get({ key: KEYS.GLOBAL_SOUND });
  return value !== 'false';
}

export async function saveGlobalSound(val) {
  await Preferences.set({ key: KEYS.GLOBAL_SOUND, value: val ? 'true' : 'false' });
}

/**
 * Accomplishments data structure:
 * {
 *   [eventId]: {
 *     [date YYYY-MM-DD]: {
 *       [taskId]: boolean  // true = checked, false/absent = unchecked
 *     }
 *   }
 * }
 */
export async function loadAccomplishments() {
  const { value } = await Preferences.get({ key: KEYS.ACCOMPLISHMENTS });
  return value ? JSON.parse(value) : {};
}

export async function saveAccomplishments(data) {
  await Preferences.set({ key: KEYS.ACCOMPLISHMENTS, value: JSON.stringify(data) });
}

export async function clearAllData() {
  await Preferences.remove({ key: KEYS.EVENTS });
  await Preferences.remove({ key: KEYS.TEMP_EVENTS });
  await Preferences.remove({ key: KEYS.ONBOARDED });
  await Preferences.remove({ key: KEYS.GLOBAL_SOUND });
  await Preferences.remove({ key: KEYS.ACCOMPLISHMENTS });
}
