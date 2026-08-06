import { useEffect, useRef, useState } from 'react';

interface WysiwygEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function WysiwygEditor({ value, onChange, placeholder }: WysiwygEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  useEffect(() => {
    if (editorRef.current && !initializedRef.current) {
      editorRef.current.innerHTML = value;
      initializedRef.current = true;
    }
  }, [value]);

  const notifyChange = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const exec = (command: string, valueArg: string | undefined = undefined) => {
    document.execCommand(command, false, valueArg);
    notifyChange();
  };

  const handleInput = () => {
    notifyChange();
  };

  const insertLink = () => {
    if (!linkUrl) return;
    exec('createLink', linkUrl);
    setLinkUrl('');
    setShowLinkInput(false);
  };

  const insertImage = () => {
    const url = window.prompt('Image URL');
    if (url) {
      exec('insertImage', url);
    }
  };

  return (
    <div className="wysiwyg-editor">
      <div className="wysiwyg-toolbar">
        <button type="button" className="wysiwyg-tool" onClick={() => exec('bold')} title="Bold">
          <i className="bi bi-type-bold" />
        </button>
        <button type="button" className="wysiwyg-tool" onClick={() => exec('italic')} title="Italic">
          <i className="bi bi-type-italic" />
        </button>
        <button type="button" className="wysiwyg-tool" onClick={() => exec('underline')} title="Underline">
          <i className="bi bi-type-underline" />
        </button>
        <button type="button" className="wysiwyg-tool" onClick={() => exec('formatBlock', 'H2')} title="Heading">
          <i className="bi bi-type-h1" />
        </button>
        <button type="button" className="wysiwyg-tool" onClick={() => exec('insertUnorderedList')} title="Bullet list">
          <i className="bi bi-list-ul" />
        </button>
        <button type="button" className="wysiwyg-tool" onClick={() => exec('insertOrderedList')} title="Numbered list">
          <i className="bi bi-list-ol" />
        </button>
        <button type="button" className="wysiwyg-tool" onClick={() => setShowLinkInput((s) => !s)} title="Link">
          <i className="bi bi-link" />
        </button>
        <button type="button" className="wysiwyg-tool" onClick={insertImage} title="Image">
          <i className="bi bi-image" />
        </button>
        <button type="button" className="wysiwyg-tool" onClick={() => exec('formatBlock', 'PRE')} title="Code block">
          <i className="bi bi-code-slash" />
        </button>
        {showLinkInput && (
          <div className="wysiwyg-link-input">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              onKeyDown={(e) => e.key === 'Enter' && insertLink()}
            />
            <button type="button" onClick={insertLink}>
              Add
            </button>
          </div>
        )}
      </div>
      <div
        ref={editorRef}
        className="wysiwyg-content"
        contentEditable
        onInput={handleInput}
        data-placeholder={placeholder}
      />
    </div>
  );
}
