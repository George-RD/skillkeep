import { type ReactNode, useEffect, useState } from "react";
import { errorMessage } from "../api/client";
import type { HubInput, Settings, SettingsInput } from "../api/types";
import { ErrorCard } from "../components/ErrorCard";
import { StringListEditor } from "../components/ListEditor";
import { useToast } from "../components/Toast";
import { usePutSettingsMutation, useSettings } from "../hooks/api";

const KNOWN_CLIENTS = ["claude", "codex", "opencode", "gemini", "omp", "cursor"];

export function toInput(d: Settings): SettingsInput {
  return {
    registryRoot: d.registryRoot,
    repoRoots: [...d.repoRoots],
    globalClients: [...d.globalClients],
    repoClients: [...d.repoClients],
    linkMode: d.linkMode,
    inboxDirs: [...d.inboxDirs],
    hub: d.hub ? { url: d.hub.url, token: "", device: d.hub.device } : null,
  };
}

/** Toggling hub sync off nulls the whole object; toggling on seeds blank fields (or keeps them). */
export function withHubEnabled(form: SettingsInput, enabled: boolean): SettingsInput {
  if (!enabled) return { ...form, hub: null };
  return { ...form, hub: form.hub ?? { url: "", token: "", device: "" } };
}

function clientOptions(...lists: string[][]): string[] {
  const set = new Set<string>(KNOWN_CLIENTS);
  for (const list of lists) for (const c of list) set.add(c);
  return [...set];
}

export function SettingsScreen() {
  const toast = useToast();
  const settings = useSettings();
  const put = usePutSettingsMutation();
  const [form, setForm] = useState<SettingsInput | null>(null);
  const [original, setOriginal] = useState<SettingsInput | null>(null);

  useEffect(() => {
    if (settings.data && form === null) {
      const snapshot = toInput(settings.data);
      setForm(snapshot);
      setOriginal(snapshot);
    }
  }, [settings.data, form]);

  if (settings.isLoading) return <p className="text-sm text-slate-500">Loading settings…</p>;
  if (settings.isError)
    return <ErrorCard message={`Could not load settings: ${errorMessage(settings.error)}`} />;
  if (form === null) return null;

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  function update(patch: Partial<SettingsInput>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateHub(patch: Partial<HubInput>) {
    setForm((prev) => (prev?.hub ? { ...prev, hub: { ...prev.hub, ...patch } } : prev));
  }

  function save() {
    if (form === null) return;
    put.mutate(form, {
      onSuccess: () => {
        setOriginal(form);
        toast.show("Settings saved", "success");
      },
      onError: (e) => toast.show(`Could not save settings: ${errorMessage(e)}`, "error"),
    });
  }

  const probe = settings.data?.linkModeProbe;
  const clientOpts = clientOptions(form.globalClients, form.repoClients);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Registry root">
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={form.registryRoot}
          onChange={(e) => update({ registryRoot: e.target.value })}
        />
      </Field>

      <Field label="Repo roots">
        <StringListEditor
          values={form.repoRoots}
          placeholder="~/repos"
          onChange={(next) => update({ repoRoots: next })}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ClientCheckboxes
          label="Global clients"
          options={clientOpts}
          selected={form.globalClients}
          onChange={(next) => update({ globalClients: next })}
        />
        <ClientCheckboxes
          label="Repo clients"
          options={clientOpts}
          selected={form.repoClients}
          onChange={(next) => update({ repoClients: next })}
        />
      </div>

      <Field label="Link mode">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="linkMode"
              value="symlink"
              checked={form.linkMode === "symlink"}
              onChange={() => update({ linkMode: "symlink" })}
            />
            symlink
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="linkMode"
              value="copy"
              checked={form.linkMode === "copy"}
              onChange={() => update({ linkMode: "copy" })}
            />
            copy
          </label>
          {probe?.reason && (
            <p className="mt-1 text-xs text-slate-500">
              Probe ({probe.platform}): {probe.reason}
            </p>
          )}
        </div>
      </Field>

      <Field label="Inbox directories">
        <StringListEditor
          values={form.inboxDirs}
          placeholder="~/.omp/agent/managed-skills"
          onChange={(next) => update({ inboxDirs: next })}
        />
      </Field>

      <Field label="Hub sync">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.hub !== null}
              onChange={(e) => setForm(withHubEnabled(form, e.target.checked))}
            />
            Enable hub sync
          </label>
          {form.hub !== null && (
            <div className="flex flex-col gap-2 pl-6">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-slate-500">URL</span>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  value={form.hub.url}
                  placeholder="https://hub.example.com"
                  onChange={(e) => updateHub({ url: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-slate-500">Token</span>
                <input
                  type="password"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  value={form.hub.token}
                  placeholder="Leave blank to keep the current token"
                  onChange={(e) => updateHub({ token: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-slate-500">Device name</span>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  value={form.hub.device}
                  placeholder="e.g. laptop"
                  onChange={(e) => updateHub({ device: e.target.value })}
                />
              </label>
            </div>
          )}
        </div>
      </Field>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!dirty || put.isPending}
        >
          Save settings
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </div>
  );
}

function ClientCheckboxes({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </legend>
      <div className="flex flex-wrap gap-3">
        {options.map((c) => (
          <label key={c} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(c)}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, c] : selected.filter((x) => x !== c))
              }
            />
            {c}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
