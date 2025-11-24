Hooks.once('init', () => {
  try {
    if (!Handlebars.helpers || !Handlebars.helpers.localize) {
      Handlebars.registerHelper('localize', (key) => {
        try { return game?.i18n?.localize ? game.i18n.localize(key) : key; }
        catch (e) { return key; }
      });
    }
    if (!Handlebars.helpers || !Handlebars.helpers.format) {
      Handlebars.registerHelper('format', (key, options) => {
        try { return game?.i18n?.format ? game.i18n.format(key, options?.hash || {} ) : key; }
        catch (e) { return key; }
      });
    }
  } catch (err) {
    console.warn('RNK localize helper registration failed', err);
  }
});
