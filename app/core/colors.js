// The six player colours.
//
// Chosen to stay apart for the most common kinds of colour blindness:
// red/green and red/orange are the pairs that collide, so the palette
// uses a teal rather than a true green and spaces the warm colours out.
// Colour is never the only signal — the player's name is always on
// screen and each one carries a coloured dot on their tab — but a
// glanceable palette is the point of the feature, so it's worth getting
// right.
//
// The actual colour values live in styles.css as `body.pc-<id>` rules,
// each with a `.dark` variant, so light and dark mode can differ.

export const PLAYER_COLORS = [
  { id: 'blue',   es: 'Azul',    en: 'Blue' },
  { id: 'red',    es: 'Rojo',    en: 'Red' },
  { id: 'amber',  es: 'Naranja', en: 'Orange' },
  { id: 'pink',   es: 'Rosa',    en: 'Pink' },
  { id: 'teal',   es: 'Verde',   en: 'Green' },
  { id: 'violet', es: 'Violeta', en: 'Purple' }
];

export const MAX_COLORED_PLAYERS = PLAYER_COLORS.length;

export function defaultColorFor(index) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length].id;
}

export function isValidColor(id) {
  return PLAYER_COLORS.some(c => c.id === id);
}

export function colorName(id, lang) {
  const c = PLAYER_COLORS.find(x => x.id === id);
  return c ? (c[lang] || c.en) : id;
}

// Picks the colour that is still free, so a newly added player doesn't
// double up with someone already at the table.
export function firstFreeColor(taken) {
  const free = PLAYER_COLORS.find(c => !taken.includes(c.id));
  return (free || PLAYER_COLORS[0]).id;
}

// The row of swatches used in the edit-player sheet.
export function colorSwatchesHtml(selectedId, lang) {
  return PLAYER_COLORS.map(c => `
    <button type="button"
            class="swatch pc-${c.id}${c.id === selectedId ? ' selected' : ''}"
            data-color="${c.id}"
            aria-pressed="${c.id === selectedId}"
            aria-label="${colorName(c.id, lang)}"
            title="${colorName(c.id, lang)}"></button>
  `).join('');
}

// Paints the whole screen in one player's colour. Only `pc-` classes are
// touched, so the theme's `dark` class and the route's `game-` class
// both survive.
export function applyPlayerColor(colorId) {
  const body = document.body;
  [...body.classList].filter(c => c.startsWith('pc-')).forEach(c => body.classList.remove(c));
  if (colorId && isValidColor(colorId)) body.classList.add('pc-' + colorId);
}

export function clearPlayerColor() {
  applyPlayerColor(null);
}
