// Strings shared by every game's chrome (header, players, undo, standings,
// history, dialogs). A game module supplies only its own strings — its
// title, section labels and category names — and they are merged over
// these. Keep game-specific wording OUT of here.

export const COMMON = {
  es: {
    home: 'Inicio',
    installBtn: 'Instalar',
    reset: 'Reiniciar',
    activePlayer: 'Turno de:',
    viewingNote: (name) => `· viendo a ${name}`,
    rename: 'Renombrar',
    addPlayer: '+ Jugador',
    defaultPlayerPrefix: 'Jugador',
    autoAdvance: 'Avance automático de turno',
    finishGame: '💾 Guardar partida',
    modalFinishGame: '💾 Finalizar y guardar en historial',
    undoBtn: '↩️ Deshacer',
    grandTotal: 'Puntuación Total',
    leaderboardBtn: '🏆 Clasificación',
    leaderboardTitle: '🏆 Clasificación de la partida',
    gameOverTitle: '🏁 ¡Partida terminada!',
    historyTitle: '📜 Historial de partidas',
    clearHistory: 'Borrar',
    emptyHistory: 'Aún no hay partidas guardadas en el historial.',
    recordLabel: '👑 Récord histórico:',
    currentLabel: 'Actual',
    emptyLabel: 'vacío',
    save: 'Guardar',
    scratchZero: 'Tachar (0 pts)',
    clearEmpty: 'Dejar vacío',
    playersShort: 'jug.',
    maxScoreToast: (max) => `Máximo ${max} puntos`,
    maxPlayersAlert: (n) => `Máximo ${n} jugadores en esta versión.`,
    renamePrompt: 'Nuevo nombre para el jugador:',
    deleteConfirm: (name) => `¿Eliminar a "${name}"?`,
    resetConfirm: '¿Reiniciar todas las puntuaciones de la partida actual?',
    finishConfirm: '¿Guardar el resultado actual en el historial y empezar una partida nueva?',
    emptyGameAlert: 'Aún no hay puntos anotados para guardar.',
    clearHistoryConfirm: '¿Borrar todo el historial de partidas guardadas?',
    toastTurn: (name) => `Turno de ${name}`,
    toastUndone: 'Último movimiento deshecho',
    toastSaved: 'Partida guardada en el historial',
    instantWinToast: (name) => `¡${name} gana la partida!`
  },
  en: {
    home: 'Home',
    installBtn: 'Install',
    reset: 'Reset',
    activePlayer: 'Turn:',
    viewingNote: (name) => `· viewing ${name}`,
    rename: 'Rename',
    addPlayer: '+ Player',
    defaultPlayerPrefix: 'Player',
    autoAdvance: 'Auto-advance turn',
    finishGame: '💾 Save game',
    modalFinishGame: '💾 Finish & save to history',
    undoBtn: '↩️ Undo',
    grandTotal: 'Grand Total',
    leaderboardBtn: '🏆 Standings',
    leaderboardTitle: '🏆 Game Standings',
    gameOverTitle: '🏁 Game over!',
    historyTitle: '📜 Match History',
    clearHistory: 'Clear',
    emptyHistory: 'No saved games in history yet.',
    recordLabel: '👑 All-time record:',
    currentLabel: 'Current',
    emptyLabel: 'empty',
    save: 'Save',
    scratchZero: 'Scratch (0 pts)',
    clearEmpty: 'Clear cell',
    playersShort: 'players',
    maxScoreToast: (max) => `Max ${max} points`,
    maxPlayersAlert: (n) => `Maximum ${n} players in this version.`,
    renamePrompt: 'New name for player:',
    deleteConfirm: (name) => `Remove "${name}"?`,
    resetConfirm: 'Reset all scores for the current game?',
    finishConfirm: 'Save current standings to history and start a fresh game?',
    emptyGameAlert: 'No scores entered yet to save.',
    clearHistoryConfirm: 'Clear all saved match history?',
    toastTurn: (name) => `${name}'s turn`,
    toastUndone: 'Last move undone',
    toastSaved: 'Game saved to history',
    instantWinToast: (name) => `${name} wins the game!`
  }
};

// Merge a game's own strings over the shared ones, per language.
export function mergeStrings(gameStrings = {}) {
  const out = {};
  for (const lang of ['es', 'en']) {
    out[lang] = { ...COMMON[lang], ...(gameStrings[lang] || {}) };
  }
  return out;
}

export const LANG_LABEL = { es: 'ES 🇪🇸', en: 'EN 🇺🇸' };
