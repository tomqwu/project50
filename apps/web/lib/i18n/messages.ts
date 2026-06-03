/**
 * Typed, nested message dictionary for the application.
 *
 * This is the source of truth for the default locale (`en`). To add a new
 * locale, see the "Adding a locale" section in `./index.ts`.
 *
 * Keys are grouped by surface (e.g. `welcome.*`). The shape of `en` defines
 * the canonical `Messages` type that every locale must satisfy, so adding a
 * key here without translating it in another locale becomes a type error.
 */
export const en = {
  welcome: {
    badge: "Welcome",
    title: "Project 50",
    howItWorks: "How it works",
    allOrNothing: "All or nothing",
    cta: "Start Project 50",
  },
} as const;

/**
 * The canonical message shape, derived from the `en` dictionary. Every locale's
 * dictionary must be assignable to this type (each leaf a `string`).
 */
export type Messages = {
  readonly [Group in keyof typeof en]: {
    readonly [Key in keyof (typeof en)[Group]]: string;
  };
};
