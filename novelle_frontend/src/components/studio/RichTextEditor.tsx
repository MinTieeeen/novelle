import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { Bold, Italic, Quote } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/utils/format';
import { sanitizeHtml } from '@/utils/sanitizeHtml';
import { EDITOR_EXTENSIONS, editorHtml } from './editorConfig';
import '@/styles/reader.css';
import { FOCUS } from './studioStyles';

interface RichTextEditorProps {
  /** HTML at mount; later changes go through `editor.commands.setContent` (see onReady) */
  initialContent: string;
  /** every edit, with the sanitized HTML */
  onChange: (html: string) => void;
  onReady?: (editor: Editor) => void;
  /** Ctrl / ⌘ + S */
  onSave?: () => void;
  disabled?: boolean;
  /** element above the text (the chapter title input) */
  header?: ReactNode;
}

type Block = 'p' | 'h2' | 'h3' | 'h4';

/** CharacterCount's number; 0 while the editor is still being set up (no schema / storage yet). */
function charCount(ed: Editor): number {
  try {
    const storage = (ed.storage as { characterCount?: { characters?: () => number } }).characterCount;
    return storage?.characters?.() ?? 0;
  } catch {
    return 0;
  }
}

const toolBtn = cn(
  'grid h-8 min-w-8 place-items-center rounded-md px-2 text-label font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground aria-pressed:bg-accent aria-pressed:text-primary disabled:opacity-40',
  FOCUS,
);

/**
 * Chapter editor (board ChapterEditor): formatting toolbar (P / H2 / H3 / H4 / B / I / quote, `aria-pressed`)
 * with the character count, then the text in the reading column (Literata, like the reader). Keyboard:
 * Ctrl+B / Ctrl+I, Ctrl+S saves.
 */
export function RichTextEditor({ initialContent, onChange, onReady, onSave, disabled, header }: RichTextEditorProps) {
  // TipTap keeps the handlers it was created with: read the latest callbacks through a ref.
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };
  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: initialContent,
    editable: !disabled,
    immediatelyRender: true,
    editorProps: {
      attributes: { class: 'reader min-h-[50dvh] outline-none', 'aria-label': 'Nội dung chương', role: 'textbox', 'aria-multiline': 'true' },
      transformPastedHTML: (html) => sanitizeHtml(html),
      handleKeyDown: (_view, e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          handlers.current.onSave?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => handlers.current.onChange(editorHtml(ed)),
  });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null;
      const block: Block = ed.isActive('heading', { level: 2 })
        ? 'h2'
        : ed.isActive('heading', { level: 3 })
          ? 'h3'
          : ed.isActive('heading', { level: 4 })
            ? 'h4'
            : 'p';
      return {
        block,
        bold: ed.isActive('bold'),
        italic: ed.isActive('italic'),
        quote: ed.isActive('blockquote'),
        chars: charCount(ed),
      };
    },
  });

  const run = (fn: (e: Editor) => void) => editor && fn(editor);
  const setBlock = (b: Block) =>
    run((e) => {
      const chain = e.chain().focus();
      if (b === 'p') chain.setParagraph().run();
      else chain.setHeading({ level: Number(b.slice(1)) as 2 | 3 | 4 }).run();
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="toolbar"
        aria-label="Định dạng"
        className="no-scrollbar sticky top-[57px] z-10 flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-4 py-1.5 sm:px-6"
      >
        {(['p', 'h2', 'h3', 'h4'] as const).map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={state?.block === b}
            aria-label={b === 'p' ? 'Đoạn văn' : `Tiêu đề ${b.slice(1)}`}
            disabled={disabled}
            onClick={() => setBlock(b)}
            className={toolBtn}
          >
            {b === 'p' ? 'P' : b.toUpperCase()}
          </button>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <button type="button" aria-pressed={!!state?.bold} aria-label="In đậm (Ctrl+B)" disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleBold().run())} className={toolBtn}>
          <Bold aria-hidden className="size-4" strokeWidth={2.25} />
        </button>
        <button type="button" aria-pressed={!!state?.italic} aria-label="In nghiêng (Ctrl+I)" disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleItalic().run())} className={toolBtn}>
          <Italic aria-hidden className="size-4" strokeWidth={2.25} />
        </button>
        <button type="button" aria-pressed={!!state?.quote} aria-label="Trích dẫn" disabled={disabled} onClick={() => run((e) => e.chain().focus().toggleBlockquote().run())} className={toolBtn}>
          <Quote aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
        <span className="flex-1" />
        <span className="num shrink-0 text-small text-muted-foreground" aria-live="off">
          {formatNumber(state?.chars ?? 0)} kí tự
        </span>
      </div>
      <div className="flex-1 bg-card">
        <div className="mx-auto max-w-reading px-6 pt-10 pb-24 sm:pt-14">
          {header}
          <EditorContent editor={editor} className="novelle-editor" />
        </div>
      </div>
    </div>
  );
}
