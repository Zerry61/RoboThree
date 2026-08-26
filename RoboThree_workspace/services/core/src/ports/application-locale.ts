export type ApplicationLocaleFact = Readonly<{
  locale: string;
  sourceRevision: string;
}>;

/** Core-owned locale authority. Renderer, Prompt, and LocalStorage are not inputs. */
export interface ApplicationLocaleSource {
  requireCurrent(): ApplicationLocaleFact;
}

