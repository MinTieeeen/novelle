import { CharacterCount, Placeholder } from '@tiptap/extensions';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

/**
 * Only what the backend's HtmlSanitizer keeps (p, h2–h4, strong, em, blockquote, br): StarterKit with
 * lists, code, links, rules, strike and underline switched off. Pasted HTML is reduced to these too.
 */
export const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: false,
  }),
  Placeholder.configure({ placeholder: 'Viết nội dung chương ở đây…' }),
  CharacterCount,
];

/** Editor HTML as sent to the backend: sanitized, and "" for an empty document. */
export function editorHtml(editor: Editor): string {
  if (editor.isEmpty) return '';
  return sanitizeHtml(editor.getHTML());
}

