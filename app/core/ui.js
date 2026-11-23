// Shared tiny UI helpers. A single toast (short message, auto-hides) is
// enough for every game today; the element already exists in index.html.

let toastTimer = null;

export function showToast(message, durationMs = 1900) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), durationMs);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The sheet shown when filing a game in the history. A name is optional
// — "Sunday with Lucas" is far easier to find later than a timestamp —
// and the standings are repeated so it is clear what is being saved.
// This also retires the last browser confirm() in the save flow.
export const SAVE_MODAL_HTML = `
  <div id="saveModal" class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-sheet">
      <div class="modal-header">
        <h2 id="lblSaveTitle"></h2>
        <button id="btnCloseSave" aria-label="\u2715">\u2715</button>
      </div>
      <div class="field-label" id="lblMatchName"></div>
      <input type="text" id="matchNameInput" maxlength="40" />
      <div class="field-label" id="lblFinalScore" style="margin-top:14px"></div>
      <div id="saveSummary" class="rules-table"></div>
      <button id="btnConfirmSave" class="primary"
              style="width:100%; padding:13px; margin-top:16px"></button>
    </div>
  </div>
`;
