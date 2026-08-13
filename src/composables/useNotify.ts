// Les toasts d'AURA, en un seul point.
//
// Pourquoi centraliser : le motif `e instanceof Error ? e.message : 'Erreur'`
// était recopié dans treize `notifyErr()` locaux identiques. Un message d'échec
// est le moment où AURA parle le plus — et c'était le seul texte de l'app que
// personne ne relisait, parce qu'il n'existait nulle part en entier.
//
// La charte (docs/voix.md) demande qu'une erreur dise trois choses : ce qu'AURA
// voulait faire, ce qui a échoué, et ce qui reste possible. D'où la signature :
// l'appelant fournit la tentative, le détail vient de l'exception.

import { useQuasar } from 'quasar';
import { t } from '@/i18n';

function detail(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  return '';
}

export function useNotify() {
  const $q = useQuasar();

  /**
   * Échec d'une action.
   *
   * @param tried Ce qu'AURA tentait, à la première personne et sans point final
   *   — « Je n'ai pas pu supprimer ce plan ». Omis, elle reste vague : à ne
   *   laisser vide que là où l'action n'est pas nommable.
   */
  function notifyError(e: unknown, tried?: string): void {
    const d = detail(e);
    // Le détail passe en `caption` plutôt que d'être collé au message : il vient
    // du serveur ou du système, il n'est pas dans la voix d'AURA, et le
    // distinguer typographiquement est plus honnête que de le fondre dedans.
    $q.notify({
      type: 'negative',
      message: tried ? `${tried}.` : d || t('common.noDetail'),
      ...(tried && d ? { caption: d } : {}),
      position: 'top',
    });
  }

  /** Action menée à bien. Le message dit ce qui a changé, pas qu'AURA a réussi. */
  function notifyDone(message: string, caption?: string): void {
    $q.notify({ type: 'positive', message, ...(caption ? { caption } : {}), position: 'top' });
  }

  /** Rien n'est cassé, mais AURA a renoncé ou a trouvé mieux à faire. */
  function notifyWarn(message: string, caption?: string): void {
    $q.notify({ type: 'warning', message, ...(caption ? { caption } : {}), position: 'top' });
  }

  return { notifyError, notifyDone, notifyWarn };
}
