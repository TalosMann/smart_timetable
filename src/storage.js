import { Preferences } from '@capacitor/preferences';

// ─── Storage Keys ──────────────────────────────────────────────────────────────
const KEYS = {
  EVENTS:          'timetable_events',
  TEMP_EVENTS:     'timetable_temp_events',
  ONBOARDED:       'timetable_onboarded',
  GLOBAL_SOUND:    'timetable_global_sound',
  CUSTOM_TEMPLATES:'timetable_custom_templates',
};

// ─── Events ───────────────────────────────────────────────────────────────────

export async function saveEvents(events) {
  await Preferences.set({ key: KEYS.EVENTS, value: JSON.stringify(events) });
}

export async function loadEvents() {
  const { value } = await Preferences.get({ key: KEYS.EVENTS });
  return value ? JSON.parse(value) : [];
}

// ─── Temp Events ──────────────────────────────────────────────────────────────

export async function saveTempEvents(events) {
  await Preferences.set({ key: KEYS.TEMP_EVENTS, value: JSON.stringify(events) });
}

export async function loadTempEvents() {
  const { value } = await Preferences.get({ key: KEYS.TEMP_EVENTS });
  return value ? JSON.parse(value) : [];
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export async function setOnboarded(flag) {
  await Preferences.set({ key: KEYS.ONBOARDED, value: flag ? 'true' : 'false' });
}

export async function isOnboarded() {
  const { value } = await Preferences.get({ key: KEYS.ONBOARDED });
  return value === 'true';
}

// ─── Global Sound ─────────────────────────────────────────────────────────────

export async function saveGlobalSound(on) {
  await Preferences.set({ key: KEYS.GLOBAL_SOUND, value: on ? 'true' : 'false' });
}

export async function loadGlobalSound() {
  const { value } = await Preferences.get({ key: KEYS.GLOBAL_SOUND });
  return value !== 'false'; // default true
}

// ─── Custom Templates ─────────────────────────────────────────────────────────
//
// Custom templates are stored as an array of template objects:
// { id, name, description, icon, color, isDefault: false, events: [...] }
//
// The id is a uid string so users can have multiple saves.

export async function loadCustomTemplates() {
  const { value } = await Preferences.get({ key: KEYS.CUSTOM_TEMPLATES });
  return value ? JSON.parse(value) : [];
}

export async function saveCustomTemplates(templates) {
  await Preferences.set({ key: KEYS.CUSTOM_TEMPLATES, value: JSON.stringify(templates) });
}

/**
 * Save or overwrite a custom template.
 * If a template with the same id already exists it will be replaced in-place;
 * otherwise the new template is appended.
 */
export async function upsertCustomTemplate(template) {
  const existing = await loadCustomTemplates();
  const idx = existing.findIndex(t => t.id === template.id);
  if (idx >= 0) {
    existing[idx] = template;
  } else {
    existing.push(template);
  }
  await saveCustomTemplates(existing);
  return existing;
}

/**
 * Delete a custom template by id.
 * No-op if the id doesn't exist or belongs to a default template.
 */
export async function deleteCustomTemplate(id) {
  const existing = await loadCustomTemplates();
  const updated = existing.filter(t => t.id !== id);
  await saveCustomTemplates(updated);
  return updated;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

export async function clearAllData() {
  await Preferences.remove({ key: KEYS.EVENTS });
  await Preferences.remove({ key: KEYS.TEMP_EVENTS });
  await Preferences.remove({ key: KEYS.ONBOARDED });
  await Preferences.remove({ key: KEYS.GLOBAL_SOUND });
  // NOTE: clearAllData does NOT delete custom templates by design.
  // Use clearCustomTemplates() separately if you want to wipe those too.
}

export async function clearCustomTemplates() {
  await Preferences.remove({ key: KEYS.CUSTOM_TEMPLATES });
}
