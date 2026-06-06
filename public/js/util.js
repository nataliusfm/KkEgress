// Shared UI helpers.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function toast(message, kind = '') {
  const host = document.getElementById('toast-host');
  const node = el(`<div class="toast ${kind}">${escapeHtml(message)}</div>`);
  host.appendChild(node);
  setTimeout(() => { node.style.opacity = '0'; setTimeout(() => node.remove(), 250); }, 3200);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Map a report's condition + missing count to a status colour. */
export function reportStatusColor(report) {
  if (!report) return 'gray';
  if (report.condition === 'Serious Injuries' ||
      report.condition === 'Medical Assistance Required' ||
      (report.missing || 0) > 0) return 'red';
  if (report.condition === 'Minor Injuries') return 'yellow';
  return 'green';
}

export function conditionPill(condition) {
  const map = {
    'All Safe': 'green',
    'Minor Injuries': 'yellow',
    'Serious Injuries': 'red',
    'Medical Assistance Required': 'red',
  };
  return `<span class="pill ${map[condition] || 'gray'}">${escapeHtml(condition || '—')}</span>`;
}

/**
 * Compress an image File/Blob under a target byte size using a canvas.
 * Returns a Blob. Iteratively lowers quality and dimensions until it fits.
 * Pass mime: 'image/png' to preserve transparency (e.g. for logos).
 */
export async function compressImage(file, { maxBytes = 200 * 1024, maxDim = 1280, mime = 'image/jpeg' } = {}) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  let quality = 0.85;

  for (let attempt = 0; attempt < 8; attempt++) {
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h); // transparent canvas preserves PNG alpha
    const blob = await new Promise((r) => canvas.toBlob(r, mime, quality));
    if (blob && blob.size <= maxBytes) return blob;
    // Tighten: drop JPEG quality first, then shrink dimensions (PNG only scales).
    if (mime === 'image/jpeg' && quality > 0.5) quality -= 0.12;
    else scale *= 0.82;
    if (attempt === 7) return blob; // best effort
  }
}
