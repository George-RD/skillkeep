import { useState } from "react";

export function StringListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (value === "") return;
    if (!values.includes(value)) onChange([...values, value]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1">
      {values.map((value, idx) => (
        <div key={value} className="flex items-center gap-2">
          <span className="flex-1 break-all text-sm">{value}</span>
          <button
            type="button"
            className="text-sm text-red-600 hover:underline"
            onClick={() => onChange([...values.slice(0, idx), ...values.slice(idx + 1)])}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1 text-sm text-white"
          onClick={add}
        >
          Add
        </button>
      </div>
    </div>
  );
}
