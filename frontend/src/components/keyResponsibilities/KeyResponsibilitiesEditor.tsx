import { useQuery } from '@tanstack/react-query';
import { getKeyResponsibilityTemplates } from '../../services/keyResponsibilityService';
import Button from '../common/Button';

interface KeyResponsibilitiesEditorProps {
  /** Role of the user being edited; used to offer the standard list from the KRA/JD document. */
  role: string;
  summary: string;
  items: string[];
  onChange: (next: { summary: string; items: string[] }) => void;
  error?: string;
}

const inputClass =
  'block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500';

/** Editable, ordered list of key responsibilities (any number of rows). */
function KeyResponsibilitiesEditor({ role, summary, items, onChange, error }: KeyResponsibilitiesEditorProps) {
  const { data: templates } = useQuery({
    queryKey: ['key-responsibility-templates'],
    queryFn: getKeyResponsibilityTemplates,
    staleTime: 5 * 60 * 1000
  });
  const template = templates?.[role];

  const setItem = (index: number, value: string) =>
    onChange({ summary, items: items.map((item, i) => (i === index ? value : item)) });
  const removeItem = (index: number) => onChange({ summary, items: items.filter((_, i) => i !== index) });
  const addItem = () => onChange({ summary, items: [...items, ''] });
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ summary, items: next });
  };

  const hasContent = items.some((item) => item.trim()) || summary.trim();
  const applyTemplate = () => {
    if (!template) return;
    if (hasContent && !window.confirm('Replace the current key responsibilities with the standard list for this role?')) {
      return;
    }
    onChange({ summary: template.summary, items: [...template.items] });
  };

  return (
    <section aria-label="Key Responsibilities" className="space-y-3" data-testid="key-responsibilities-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-sm font-medium text-gray-700">Key Responsibilities</label>
        {template ? (
          <Button onClick={applyTemplate} size="sm" type="button" variant="ghost">
            Use standard list for {template.title}
          </Button>
        ) : null}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500" htmlFor="kr-summary">
          Responsibility summary (optional)
        </label>
        <textarea
          className={`${inputClass} mt-1`}
          id="kr-summary"
          maxLength={2000}
          onChange={(event) => onChange({ summary: event.target.value, items })}
          rows={2}
          value={summary}
        />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No key responsibilities added yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <li className="flex items-start gap-2" key={index}>
              <span className="mt-2 w-6 shrink-0 text-right text-xs font-semibold text-gray-500">{index + 1}.</span>
              <textarea
                aria-label={`Key responsibility ${index + 1}`}
                className={inputClass}
                maxLength={2000}
                onChange={(event) => setItem(index, event.target.value)}
                rows={2}
                value={item}
              />
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  aria-label={`Move responsibility ${index + 1} up`}
                  className="rounded border border-gray-200 px-1.5 text-xs text-gray-600 disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move responsibility ${index + 1} down`}
                  className="rounded border border-gray-200 px-1.5 text-xs text-gray-600 disabled:opacity-30"
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={`Remove responsibility ${index + 1}`}
                  className="rounded border border-red-200 px-1.5 text-xs text-red-600"
                  onClick={() => removeItem(index)}
                  type="button"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Button onClick={addItem} size="sm" type="button" variant="ghost">
        + Add responsibility
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}

export default KeyResponsibilitiesEditor;
