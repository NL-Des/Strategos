/** Texte multi-ligne → HTML simple (le backend le nettoie à nouveau). */
export function toHtml(text: string): string {
  const escape = (s: string) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p.trim()).replaceAll('\n', '<br>')}</p>`)
    .filter((p) => p !== '<p></p>')
    .join('');
}

/** HTML nettoyé → texte, pour ré-éditer un message. */
export function toText(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/g, '\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .trim();
}
