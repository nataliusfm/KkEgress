// Google Maps integration: loads the Maps JS API, renders the school,
// assembly points, and live team markers with status colours + clustering.
import { escapeHtml } from './util.js';

let mapsApiKey = '';
let loaderPromise = null;

export function configureMaps(key) { mapsApiKey = key; }

/** Dynamically load the Google Maps JS API (once). Resolves false if no key. */
export function loadGoogleMaps() {
  if (!mapsApiKey) return Promise.resolve(false);
  if (window.google?.maps) return Promise.resolve(true);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve) => {
    const cb = '__gmapsReady';
    window[cb] = () => resolve(true);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey)}` +
            `&libraries=marker&callback=${cb}&loading=async`;
    s.async = true;
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return loaderPromise;
}

const COLORS = { green: '#1e9e5a', yellow: '#e0a312', red: '#d8392b', school: '#1a3c6e', assembly: '#2f6fd1' };

function pin(color, glyph) {
  return {
    path: 'M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z',
    fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 1.3,
    anchor: new google.maps.Point(12, 36), labelOrigin: new google.maps.Point(12, 12),
  };
}

/** A live map controller bound to a container element. */
export class LiveMap {
  constructor(container) {
    this.container = container;
    this.map = null;
    this.teamMarkers = new Map(); // userId -> marker
    this.staticMarkers = [];
    this.info = null;
  }

  async init(center) {
    const ok = await loadGoogleMaps();
    if (!ok) {
      this.container.innerHTML =
        '<div class="map-fallback">🗺️ Google Maps API key not configured.<br>' +
        'Set <code>GOOGLE_MAPS_API_KEY</code> in <code>.env</code> to enable live tracking.</div>';
      return false;
    }
    this.map = new google.maps.Map(this.container, {
      center: center || { lat: -6.2, lng: 106.81 },
      zoom: 17, mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
    });
    this.info = new google.maps.InfoWindow();
    return true;
  }

  clearStatic() { this.staticMarkers.forEach((m) => m.setMap(null)); this.staticMarkers = []; }

  setSchool(school) {
    if (!this.map || !school?.location) return;
    const m = new google.maps.Marker({
      map: this.map, position: school.location, title: school.name,
      icon: pin(COLORS.school), label: { text: '🏫', fontSize: '12px' },
    });
    this.staticMarkers.push(m);
  }

  setAssemblyPoints(points = []) {
    if (!this.map) return;
    points.forEach((ap) => {
      if (!ap.location) return;
      const m = new google.maps.Marker({
        map: this.map, position: ap.location, title: ap.name,
        icon: pin(COLORS.assembly), label: { text: '🚩', fontSize: '12px' },
      });
      m.addListener('click', () => {
        this.info.setContent(`<strong>${escapeHtml(ap.name)}</strong><br>Assembly point`);
        this.info.open(this.map, m);
      });
      this.staticMarkers.push(m);
    });
  }

  /** Add/update a live team marker. status: green|yellow|red */
  upsertTeam({ userId, name, lat, lng, status = 'green', detail = '' }) {
    if (!this.map || lat == null || lng == null) return;
    const pos = { lat: Number(lat), lng: Number(lng) };
    let m = this.teamMarkers.get(userId);
    if (!m) {
      m = new google.maps.Marker({ map: this.map, position: pos, title: name, icon: pin(COLORS[status]) });
      m.addListener('click', () => {
        this.info.setContent(`<strong>${escapeHtml(name)}</strong><br>${escapeHtml(detail)}`);
        this.info.open(this.map, m);
      });
      this.teamMarkers.set(userId, m);
    } else {
      m.setPosition(pos);
      m.setIcon(pin(COLORS[status]));
    }
    m._detail = detail; m._name = name;
  }

  fitAll() {
    if (!this.map) return;
    const bounds = new google.maps.LatLngBounds();
    let any = false;
    [...this.teamMarkers.values(), ...this.staticMarkers].forEach((m) => { bounds.extend(m.getPosition()); any = true; });
    if (any) this.map.fitBounds(bounds, 60);
  }

  destroy() { this.teamMarkers.clear(); this.clearStatic(); this.map = null; }
}
