// Les unités que `Intl` ne sait pas produire seul.
//
// Tout ce qui relève du système de nombres — séparateurs, ordre des champs
// d'une date, position du symbole monétaire — est laissé à `Intl` : il le fait
// mieux, et pour toutes les langues à la fois. Ne restent ici que les unités
// écrites, où le français et l'anglais divergent (`o` contre `B`), et le seul
// mot de la famille : « à l'instant ».

export default {
  bytes: { b: 'o', kb: 'Ko', mb: 'Mo', gb: 'Go' },
  duration: { ms: 'ms', s: 's', min: 'min', h: 'h' },
  justNow: "à l'instant",
};
