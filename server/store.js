import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

/**
 * A tiny JSON-backed data store. Keeps everything in memory and persists to
 * disk on each mutation (debounced). Avoids native dependencies so the app
 * runs anywhere Node runs. For higher-scale production use, swap this module
 * for a real database — the public API is intentionally small.
 */
const EMPTY = () => ({
  school: {
    name: 'Yayasan Pendidikan Jayawijaya',
    address: 'Tembagapura · Kuala Kencana, Papua',
    location: { lat: -4.0, lng: 136.88 }, // Kuala Kencana, Papua (configurable)
    logoUrl: '',
  },
  users: [],
  assemblyPoints: [],
  drillTypes: [
    { id: 'fire', name: 'Fire Drill', builtin: true },
    { id: 'earthquake', name: 'Earthquake Drill', builtin: true },
    { id: 'tsunami', name: 'Tsunami Drill', builtin: true },
    { id: 'lockdown', name: 'Lockdown Drill', builtin: true },
    { id: 'custom', name: 'Custom Drill', builtin: true },
  ],
  drills: [],
  reports: [],
  notifications: [],
  audit: [],
});

let state = EMPTY();

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      state = { ...EMPTY(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      persistNow();
    }
  } catch (err) {
    console.error('Failed to load data store, starting fresh:', err.message);
    state = EMPTY();
  }
}

let persistTimer = null;
function persistNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 50);
}

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

load();

export const db = {
  raw: () => state,

  // --- School settings ---
  getSchool: () => state.school,
  updateSchool: (patch) => {
    state.school = { ...state.school, ...patch };
    persist();
    return state.school;
  },

  // --- Users ---
  users: () => state.users,
  findUserById: (uid) => state.users.find((u) => u.id === uid) || null,
  findUserByEmail: (email) =>
    state.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null,
  addUser: (user) => {
    const record = { id: id(), createdAt: now(), ...user };
    state.users.push(record);
    persist();
    return record;
  },
  updateUser: (uid, patch) => {
    const u = state.users.find((x) => x.id === uid);
    if (!u) return null;
    Object.assign(u, patch);
    persist();
    return u;
  },
  deleteUser: (uid) => {
    state.users = state.users.filter((u) => u.id !== uid);
    persist();
  },

  // --- Assembly points ---
  assemblyPoints: () => state.assemblyPoints,
  addAssemblyPoint: (ap) => {
    const record = { id: id(), ...ap };
    state.assemblyPoints.push(record);
    persist();
    return record;
  },
  updateAssemblyPoint: (apId, patch) => {
    const ap = state.assemblyPoints.find((x) => x.id === apId);
    if (!ap) return null;
    Object.assign(ap, patch);
    persist();
    return ap;
  },
  deleteAssemblyPoint: (apId) => {
    state.assemblyPoints = state.assemblyPoints.filter((a) => a.id !== apId);
    persist();
  },

  // --- Drill types ---
  drillTypes: () => state.drillTypes,
  addDrillType: (dt) => {
    const record = { id: id(), builtin: false, ...dt };
    state.drillTypes.push(record);
    persist();
    return record;
  },
  deleteDrillType: (dtId) => {
    state.drillTypes = state.drillTypes.filter((d) => d.id !== dtId || d.builtin);
    persist();
  },

  // --- Drills ---
  drills: () => state.drills,
  findDrill: (did) => state.drills.find((d) => d.id === did) || null,
  activeDrill: () => state.drills.find((d) => d.status === 'Active') || null,
  addDrill: (drill) => {
    const record = { id: id(), createdAt: now(), status: 'Planned', ...drill };
    state.drills.push(record);
    persist();
    return record;
  },
  updateDrill: (did, patch) => {
    const d = state.drills.find((x) => x.id === did);
    if (!d) return null;
    Object.assign(d, patch);
    persist();
    return d;
  },

  // --- Reports ---
  reports: () => state.reports,
  reportsForDrill: (did) => state.reports.filter((r) => r.drillId === did),
  findReport: (rid) => state.reports.find((r) => r.id === rid) || null,
  findReportByTeacher: (did, teacherId) =>
    state.reports.find((r) => r.drillId === did && r.teacherId === teacherId) || null,
  addReport: (report) => {
    const record = { id: id(), revisions: [], ...report };
    state.reports.push(record);
    persist();
    return record;
  },
  updateReport: (rid, patch) => {
    const r = state.reports.find((x) => x.id === rid);
    if (!r) return null;
    Object.assign(r, patch);
    persist();
    return r;
  },

  // --- Notifications ---
  notifications: () => state.notifications,
  addNotification: (n) => {
    const record = { id: id(), ts: now(), read: false, ...n };
    state.notifications.unshift(record);
    // keep last 500
    if (state.notifications.length > 500) state.notifications.length = 500;
    persist();
    return record;
  },
  markNotificationRead: (nid, userId) => {
    const n = state.notifications.find((x) => x.id === nid);
    if (n && (!n.userId || n.userId === userId)) n.read = true;
    persist();
  },

  // --- Audit ---
  audit: () => state.audit,
  addAudit: (entry) => {
    const record = { id: id(), ts: now(), ...entry };
    state.audit.unshift(record);
    if (state.audit.length > 5000) state.audit.length = 5000;
    persist();
    return record;
  },
};
