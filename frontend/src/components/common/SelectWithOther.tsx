import { useState } from 'react';
import { toast } from 'react-hot-toast';
import Button from './Button';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectWithOtherProps {
  createErrorMessage?: string;
  disabled?: boolean;
  error?: string;
  inputPlaceholder: string;
  label: string;
  onChange: (value: string) => void;
  onCreate: (name: string) => Promise<{ label: string; value: string }>;
  options: SelectOption[];
  saveLabel: string;
  selectPlaceholder: string;
  value: string;
}

const OTHER_VALUE = '__OTHER__';

/**
 * Dropdown that offers an "Other" option. Selecting it swaps the <select>
 * for a text input + Save button; saving persists the new value via
 * `onCreate`, then re-selects the freshly created option.
 */
function SelectWithOther({
  createErrorMessage,
  disabled,
  error,
  inputPlaceholder,
  label,
  onChange,
  onCreate,
  options,
  saveLabel,
  selectPlaceholder,
  value
}: SelectWithOtherProps) {
  const [isOther, setIsOther] = useState(false);
  const [otherValue, setOtherValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = event.target.value;
    if (selected === OTHER_VALUE) {
      setIsOther(true);
      setOtherValue('');
      return;
    }
    onChange(selected);
  };

  const handleCancelOther = () => {
    setIsOther(false);
    setOtherValue('');
  };

  const handleSaveOther = async () => {
    const trimmed = otherValue.trim();
    if (!trimmed) {
      toast.error(`${label} cannot be empty`);
      return;
    }
    const isDuplicate = options.some(
      (option) => option.label.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      toast.error(`${label} already exists`);
      return;
    }

    setIsSaving(true);
    try {
      const created = await onCreate(trimmed);
      onChange(created.value);
      setIsOther(false);
      setOtherValue('');
      toast.success(`${label} saved`);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || createErrorMessage || `Failed to save ${label.toLowerCase()}`;
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isOther) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            autoFocus
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            disabled={isSaving}
            onChange={(event) => setOtherValue(event.target.value)}
            placeholder={inputPlaceholder}
            type="text"
            value={otherValue}
          />
        </div>
        <div className="flex gap-2">
          <Button loading={isSaving} onClick={handleSaveOther} size="sm" type="button">
            {saveLabel}
          </Button>
          <Button disabled={isSaving} onClick={handleCancelOther} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
        </div>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <select
        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        disabled={disabled}
        onChange={handleSelectChange}
        value={value}
      >
        <option value="">{selectPlaceholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value={OTHER_VALUE}>Other</option>
      </select>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default SelectWithOther;
