/** Substitui o registro do service worker na versão arquivo único (file://), onde não há SW. */
export function registerSW() {
  return () => {};
}
