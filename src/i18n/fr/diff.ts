// La confirmation d'écriture : le seul endroit où l'utilisateur voit le contrat
// propose → apply. Elle sert toutes les pages qui écrivent dans ~/.claude.

export default {
  title: "Confirmer l'écriture",
  newFile: 'nouveau fichier',
  noChange: 'Je ne vois rien à changer : le fichier est déjà dans cet état.',
  apply: 'Appliquer',
  applied: 'Modification appliquée.',
  conflict: "Le fichier a changé sur le disque depuis que je vous l'ai montré. Rechargez avant de réappliquer.",
  failed: "Je n'ai pas pu écrire le fichier.",
}
