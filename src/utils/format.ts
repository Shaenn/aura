// Small shared formatters for sizes, counts, dates and durations.
//
// Tout ce qui dépend de la langue passe par ici, et par `Intl` chaque fois qu'il
// sait faire : séparateur de milliers, ordre des champs d'une date, place du
// symbole monétaire. Le catalogue ne porte que les unités écrites (`o` contre
// `B`), qu'aucune API standard ne donne.
//
// Ces fonctions lisent la locale à chaque appel plutôt que de la recevoir en
// argument : elles sont appelées depuis des `computed`, et lire `t()` ou
// `currentLocale()` y crée la dépendance réactive qui rafraîchit l'affichage
// quand la langue change.

import { currentLocale, t, type AppLocale } from 'src/i18n';

/** Rien à afficher — un tiret cadratin, pas un vide qui ferait douter. */
const EMPTY = '—';

/**
 * Garde un formateur `Intl` tant que la langue ne bouge pas.
 *
 * Construire un `Intl.*Format` coûte cher, et le rejeu en demande un par
 * événement affiché. La clé est la locale : elle change, le formateur suit.
 */
function perLocale<T>(make: (locale: AppLocale) => T): () => T {
  let key: AppLocale | null = null;
  let value: T;
  return () => {
    const locale = currentLocale();
    if (locale !== key) {
      key = locale;
      value = make(locale);
    }
    return value;
  };
}

// Même mise en cache que `perLocale`, mais la clé porte aussi le nombre de
// décimales : deux appelants qui n'en demandent pas autant ne doivent pas se
// disputer une seule instance.
const decimalFormats = new Map<string, Intl.NumberFormat>();

/** Un nombre à décimales fixes, dans la ponctuation du pays. */
function decimals(n: number, digits: number): string {
  const locale = currentLocale();
  const key = `${locale}:${digits}`;
  let format = decimalFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    decimalFormats.set(key, format);
  }
  return format.format(n);
}

/**
 * Une taille lisible : `168,0 Ko` / `168.0 KB`.
 *
 * Le nombre passe par `Intl` et non par `toFixed` : la virgule décimale du
 * français ne s'obtient pas autrement, et une taille écrite `168.0 Ko` au milieu
 * d'une interface française trahit tout de suite l'unité recollée à la main.
 */
export function fmtBytes(n: number): string {
  if (!n) return `0 ${t('formats.bytes.b')}`;
  if (n < 1024) return `${fmtInt(n)} ${t('formats.bytes.b')}`;
  if (n < 1024 * 1024) return `${decimals(n / 1024, 1)} ${t('formats.bytes.kb')}`;
  if (n < 1024 * 1024 * 1024) return `${decimals(n / (1024 * 1024), 1)} ${t('formats.bytes.mb')}`;
  return `${decimals(n / (1024 * 1024 * 1024), 2)} ${t('formats.bytes.gb')}`;
}

/**
 * Un compte abrégé : `1,2 k` / `1.2k`, `3,9 M` / `3.9M`.
 *
 * `k` et `M` sont des symboles, pas des mots : ils ne se traduisent pas. Ce qui
 * change est l'espace qui les précède — le français en met une devant ses
 * symboles, l'anglais les colle. Même règle que `server/diagnostics/format.ts`,
 * pour qu'un compte affiché par la page et un compte écrit par le serveur ne se
 * contredisent pas dans la même phrase.
 */
export function fmtNum(n: number): string {
  const space = currentLocale() === 'fr' ? ' ' : '';
  if (n < 1000) return decimals(n, 0);
  if (n < 1_000_000) return `${decimals(n / 1000, n < 10_000 ? 1 : 0)}${space}k`;
  return `${decimals(n / 1_000_000, 1)}${space}M`;
}

/** Un nombre à décimales fixes : `10,1` / `10.1`. */
export function fmtDecimal(n: number, digits = 1): string {
  return decimals(n, digits);
}

const intFormat = perLocale((l) => new Intl.NumberFormat(l));

/** Un entier avec ses séparateurs de milliers : `1 234 567` / `1,234,567`. */
export function fmtInt(n: number): string {
  return intFormat().format(n);
}

const percentFormats = new Map<string, Intl.NumberFormat>();

/**
 * Une proportion, à partir d'un rapport : `77 %` / `77%`.
 *
 * L'espace insécable du français devant le signe est posée par `Intl`, pas par
 * la chaîne — la recoller à la main donnerait `77 %` des deux côtés.
 */
export function fmtPercent(ratio: number, digits = 0): string {
  const locale = currentLocale();
  const key = `${locale}:${digits}`;
  let format = percentFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    percentFormats.set(key, format);
  }
  return format.format(ratio);
}

const dateTimeFormat = perLocale(
  (l) =>
    new Intl.DateTimeFormat(l, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
);

/** Absolute local date-time, e.g. "8 juil. 2026, 14:32". */
export function fmtDate(ms: number): string {
  if (!ms) return EMPTY;
  return dateTimeFormat().format(new Date(ms));
}

const dateShortFormat = perLocale((l) => new Intl.DateTimeFormat(l));

/** La date seule, au format court du pays : `08/07/2026` / `7/8/2026`. */
export function fmtDateShort(ms: number): string {
  if (!ms) return EMPTY;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? EMPTY : dateShortFormat().format(d);
}

const dateLongFormat = perLocale(
  (l) => new Intl.DateTimeFormat(l, { day: 'numeric', month: 'long', year: 'numeric' }),
);

/** La date écrite en toutes lettres : `8 juillet 2026` / `July 8, 2026`. */
export function fmtDateLong(ms: number): string {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? EMPTY : dateLongFormat().format(d);
}

const monthFormat = perLocale((l) => new Intl.DateTimeFormat(l, { month: 'long' }));

/** Le nom du mois seul, pour un regroupement par période. */
export function fmtMonth(ms: number): string {
  return monthFormat().format(new Date(ms));
}

const timeFormat = perLocale(
  (l) => new Intl.DateTimeFormat(l, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
);

/** L'heure seule, à la seconde — l'échelle du rejeu d'une session. */
export function fmtTime(ms: number): string {
  if (!ms) return '';
  return timeFormat().format(new Date(ms));
}

const relFormat = perLocale((l) => new Intl.RelativeTimeFormat(l, { style: 'narrow' }));

/** Relative time, e.g. "il y a 3 j". */
export function relTime(ms: number): string {
  if (!ms) return EMPTY;
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return t('formats.justNow');
  if (s < 3600) return relFormat().format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return relFormat().format(-Math.floor(s / 3600), 'hour');
  if (s < 2592000) return relFormat().format(-Math.floor(s / 86400), 'day');
  return fmtDate(ms);
}

/**
 * Un montant en dollars → "0,42 $" / "$0.42".
 *
 * `narrowSymbol` plutôt que le défaut : hors des États-Unis, `Intl` désambiguïse
 * la devise en « 0,42 $US », ce qui est juste mais bavard dans un tableau où
 * toute la colonne est en dollars. Le montant est toujours au prix catalogue de
 * l'API, jamais ce qu'un abonnement a facturé.
 */
export function fmtMoney(usd: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(currentLocale(), {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits,
  }).format(usd);
}

/**
 * Un montant en dollars, descendu au cent sous le dollar.
 *
 * Deux décimales afficheraient « 0,00 $ » là où il s'est passé quelque chose.
 */
export function fmtCost(usd: number): string {
  if (usd >= 1) return fmtMoney(usd);
  return `${decimals(usd * 100, 1)} ¢`;
}

/** A duration in ms → "5 min 3 s" / "1 h 2 min" / "820 ms". */
export function fmtDuration(ms: number): string {
  if (ms <= 0) return EMPTY;
  if (ms < 1000) return `${Math.round(ms)} ${t('formats.duration.ms')}`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} ${t('formats.duration.s')}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${t('formats.duration.min')} ${s % 60} ${t('formats.duration.s')}`;
  const h = Math.floor(m / 60);
  return `${h} ${t('formats.duration.h')} ${m % 60} ${t('formats.duration.min')}`;
}
