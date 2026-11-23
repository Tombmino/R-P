// Reading the rules aloud, using the browser's built-in speech. No
// account, no API, no cost, and it works offline because the voices
// are part of the operating system.
//
// It is genuinely optional: voice quality varies a lot by device, and
// a phone may have no voice installed for the language in use. In that
// case the button is hidden rather than reading Spanish in an English
// accent — the rules are on screen either way.

const PREFIX = { es: 'es', en: 'en' };

function synth() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

function voicesFor(lang) {
  const s = synth();
  if (!s) return [];
  const want = PREFIX[lang] || lang;
  return s.getVoices().filter(v => (v.lang || '').toLowerCase().startsWith(want));
}

export function speechSupported() {
  return Boolean(synth());
}

export function hasVoiceFor(lang) {
  return voicesFor(lang).length > 0;
}

// Chrome and Safari populate the voice list asynchronously, so a check
// run at mount can come back empty on a device that does have voices.
// Callers use this to re-check once and show the button late.
export function onVoicesReady(cb) {
  const s = synth();
  if (!s) return () => {};
  const handler = () => cb();
  s.addEventListener('voiceschanged', handler);
  return () => s.removeEventListener('voiceschanged', handler);
}

export function stop() {
  const s = synth();
  if (s) s.cancel();
}

export function isSpeaking() {
  const s = synth();
  return Boolean(s && (s.speaking || s.pending));
}

// Reads the given lines, pausing between them so a list of rules does
// not run together into one breathless sentence.
export function speak(lines, lang, { onEnd } = {}) {
  const s = synth();
  if (!s) return false;
  s.cancel();

  const voice = voicesFor(lang)[0] || null;
  const parts = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
  if (parts.length === 0) return false;

  parts.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(String(text));
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : (PREFIX[lang] || lang);
    u.rate = 0.95;   // a touch slower than default: these are rules
    if (i === parts.length - 1 && onEnd) u.onend = onEnd;
    s.speak(u);
  });
  return true;
}
