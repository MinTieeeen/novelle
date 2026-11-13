import DOMPurify from 'dompurify';

/** Chapter HTML allowed by the backend (HtmlSanitizer): nothing else is ever rendered. */
export const CHAPTER_ALLOWED_TAGS = ['p', 'h2', 'h3', 'h4', 'br', 'em', 'strong', 'blockquote'];

/**
 * Sanitizes chapter HTML before `dangerouslySetInnerHTML`. The backend already sanitizes on save;
 * this is the second line of defence and must stay in sync with its allow-list.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: CHAPTER_ALLOWED_TAGS,
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}
