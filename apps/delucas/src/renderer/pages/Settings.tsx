/**
 * Settings — configuration screen for Nate (handoff screen, not for the client).
 *
 * Sections:
 *  1. Email (IMAP): host, user, password, port, secure
 *  2. AI: Anthropic API key
 *  3. Backup: folder path, last-backup date, "Backup now" button
 *  4. Vendor→category mapping editor: list + add/remove rows
 *
 * Each field persists immediately on blur/change via window.bridge.settings.set().
 *
 * Renderer only — no node:* or electron imports.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = "food" | "beverage" | "utilities" | "rent" | "labor" | "other";
const CATEGORIES: Category[] = ["food", "beverage", "utilities", "rent", "labor", "other"];

interface VendorMapping {
  vendor: string;
  category: Category;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCategory(v: unknown): v is Category {
  return typeof v === "string" && CATEGORIES.includes(v as Category);
}

async function loadSetting(key: string): Promise<string> {
  const val = await window.bridge.settings.get(key);
  return typeof val === "string" ? val : "";
}

async function saveSetting(key: string, value: string): Promise<void> {
  await window.bridge.settings.set(key, value);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionHeadingProps {
  title: string;
}

function SectionHeading({ title }: SectionHeadingProps): React.JSX.Element {
  return (
    <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide border-b border-border pb-1 mb-3">
      {title}
    </h2>
  );
}

interface TextFieldProps {
  label: string;
  settingKey: string;
  type?: "text" | "password" | "number";
  placeholder?: string;
  defaultValue?: string;
}

function TextField({ label, settingKey, type = "text", placeholder, defaultValue }: TextFieldProps): React.JSX.Element {
  const [value, setValue] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    loadSetting(settingKey).then((v) => {
      setValue(v !== "" ? v : (defaultValue ?? ""));
      loaded.current = true;
    }).catch(() => { /* ignore */ });
  }, [settingKey, defaultValue]);

  const handleBlur = useCallback(() => {
    saveSetting(settingKey, value).catch((err) =>
      console.error(`[Settings] failed to save ${settingKey}:`, err)
    );
  }, [settingKey, value]);

  return (
    <div className="flex flex-col gap-1 mb-3">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={settingKey}>
        {label}
      </label>
      <input
        id={settingKey}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        autoComplete="off"
      />
    </div>
  );
}

interface CheckboxFieldProps {
  label: string;
  settingKey: string;
}

function CheckboxField({ label, settingKey }: CheckboxFieldProps): React.JSX.Element {
  const [checked, setChecked] = useState(true); // default: true (TLS on by default)

  useEffect(() => {
    loadSetting(settingKey).then((v) => {
      if (v !== "") setChecked(v !== "false");
    }).catch(() => { /* ignore */ });
  }, [settingKey]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setChecked(next);
    saveSetting(settingKey, String(next)).catch((err) =>
      console.error(`[Settings] failed to save ${settingKey}:`, err)
    );
  }, [settingKey]);

  return (
    <div className="flex items-center gap-2 mb-3">
      <input
        id={settingKey}
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        className="h-4 w-4 rounded border-input accent-primary"
      />
      <label htmlFor={settingKey} className="text-sm text-foreground select-none">
        {label}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backup section
// ---------------------------------------------------------------------------

function BackupSection(): React.JSX.Element {
  const [backupFolder, setBackupFolder] = useState("");
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSetting("backup_folder").then((v) => setBackupFolder(v)).catch(() => { /* ignore */ });
    window.bridge.backup.getStatus().then((s) => {
      setLastBackup(s.lastBackup);
      setBackupError(s.error);
    }).catch(() => { /* ignore */ });
  }, []);

  const handleFolderBlur = useCallback(() => {
    saveSetting("backup_folder", backupFolder).catch((err) =>
      console.error("[Settings] failed to save backup_folder:", err)
    );
  }, [backupFolder]);

  const handlePickFolder = useCallback(async () => {
    const chosen = await window.bridge.dialog.openDirectory();
    if (chosen) {
      setBackupFolder(chosen);
      await saveSetting("backup_folder", chosen);
    }
  }, []);

  const handleBackupNow = useCallback(async () => {
    setRunning(true);
    setMessage(null);
    try {
      const result = await window.bridge.backup.triggerNow();
      if (result.ok) {
        const today = new Date().toISOString().slice(0, 10);
        setLastBackup(today);
        setBackupError(null);
        setMessage("Backup complete.");
      } else {
        setBackupError(result.error ?? "Unknown error");
        setMessage(null);
      }
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <section className="mb-6">
      <SectionHeading title="Backup" />
      <div className="flex flex-col gap-1 mb-3">
        <label htmlFor="backup_folder" className="text-xs font-medium text-muted-foreground">
          Backup folder
        </label>
        <div className="flex gap-2">
          <input
            id="backup_folder"
            type="text"
            value={backupFolder}
            placeholder="/Users/you/Backups/DeLucas"
            onChange={(e) => setBackupFolder(e.target.value)}
            onBlur={handleFolderBlur}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handlePickFolder}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            Browse
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={handleBackupNow}
          disabled={running}
          className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {running ? "Backing up…" : "Backup now"}
        </button>
        {lastBackup !== null && (
          <span className="text-xs text-muted-foreground">Last backup: {lastBackup}</span>
        )}
      </div>

      {message !== null && (
        <p className="text-xs text-green-600 dark:text-green-400">{message}</p>
      )}
      {backupError !== null && (
        <p className="text-xs text-destructive">Backup error: {backupError}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Vendor→category mapping editor
// ---------------------------------------------------------------------------

const VENDOR_MAP_KEY = "vendor_category_map";

function VendorMappingEditor(): React.JSX.Element {
  const [mappings, setMappings] = useState<VendorMapping[]>([]);
  const [newVendor, setNewVendor] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("other");

  useEffect(() => {
    window.bridge.settings.get(VENDOR_MAP_KEY).then((raw) => {
      if (typeof raw === "string" && raw !== "") {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            const entries = Object.entries(parsed as Record<string, unknown>)
              .filter(([, v]) => isCategory(v))
              .map(([vendor, category]) => ({ vendor, category: category as Category }));
            setMappings(entries);
          }
        } catch { /* ignore malformed */ }
      }
    }).catch(() => { /* ignore */ });
  }, []);

  const persistMappings = useCallback((next: VendorMapping[]) => {
    const obj: Record<string, string> = {};
    for (const { vendor, category } of next) {
      if (vendor.trim() !== "") obj[vendor.trim()] = category;
    }
    window.bridge.settings.set(VENDOR_MAP_KEY, obj).catch((err) =>
      console.error("[Settings] failed to save vendor_category_map:", err)
    );
  }, []);

  const handleAdd = useCallback(() => {
    if (newVendor.trim() === "") return;
    const exists = mappings.some((m) => m.vendor.toLowerCase() === newVendor.trim().toLowerCase());
    if (exists) return;
    const next = [...mappings, { vendor: newVendor.trim(), category: newCategory }];
    setMappings(next);
    persistMappings(next);
    setNewVendor("");
    setNewCategory("other");
  }, [mappings, newVendor, newCategory, persistMappings]);

  const handleRemove = useCallback((vendor: string) => {
    const next = mappings.filter((m) => m.vendor !== vendor);
    setMappings(next);
    persistMappings(next);
  }, [mappings, persistMappings]);

  const handleCategoryChange = useCallback((vendor: string, category: Category) => {
    const next = mappings.map((m) => m.vendor === vendor ? { ...m, category } : m);
    setMappings(next);
    persistMappings(next);
  }, [mappings, persistMappings]);

  return (
    <section className="mb-6">
      <SectionHeading title="Vendor categories" />
      <p className="text-xs text-muted-foreground mb-3">
        Map vendor names to categories so imported transactions are auto-classified.
      </p>

      {mappings.length > 0 && (
        <table className="w-full text-sm mb-4 border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-1 font-medium pr-4">Vendor</th>
              <th className="pb-1 font-medium pr-4">Category</th>
              <th className="pb-1" />
            </tr>
          </thead>
          <tbody>
            {mappings.map(({ vendor, category }) => (
              <tr key={vendor} className="border-b border-border/50">
                <td className="py-1.5 pr-4 text-foreground">{vendor}</td>
                <td className="py-1.5 pr-4">
                  <select
                    value={category}
                    onChange={(e) => handleCategoryChange(vendor, e.target.value as Category)}
                    className="rounded border border-input bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5">
                  <button
                    type="button"
                    onClick={() => handleRemove(vendor)}
                    className="text-xs text-destructive/70 hover:text-destructive transition-colors"
                    aria-label={`Remove mapping for ${vendor}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add row */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label htmlFor="new-vendor" className="text-xs font-medium text-muted-foreground block mb-1">
            Vendor name
          </label>
          <input
            id="new-vendor"
            type="text"
            value={newVendor}
            placeholder="e.g. DoorDash"
            onChange={(e) => setNewVendor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="new-category" className="text-xs font-medium text-muted-foreground block mb-1">
            Category
          </label>
          <select
            id="new-category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as Category)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={newVendor.trim() === ""}
          className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Add
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main Settings page
// ---------------------------------------------------------------------------

export function Settings(): React.JSX.Element {
  return (
    <div className="max-w-lg space-y-2">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configuration for Nate — not shown to the client.
        </p>
      </div>

      {/* Email / IMAP */}
      <section className="mb-6">
        <SectionHeading title="Email (IMAP)" />
        <TextField label="IMAP host" settingKey="imap_host" placeholder="imap.gmail.com" />
        <TextField label="IMAP user (email)" settingKey="imap_user" placeholder="yourname@gmail.com" />
        <TextField label="App password" settingKey="imap_password" type="password" placeholder="••••••••••••••••" />
        <TextField label="Port" settingKey="imap_port" type="number" defaultValue="993" placeholder="993" />
        <CheckboxField label="Use TLS/SSL" settingKey="imap_secure" />
      </section>

      {/* AI */}
      <section className="mb-6">
        <SectionHeading title="AI (Anthropic)" />
        <TextField label="Anthropic API key" settingKey="anthropic_key" type="password" placeholder="sk-ant-api03-…" />
      </section>

      {/* Backup */}
      <BackupSection />

      {/* Vendor→category mapping */}
      <VendorMappingEditor />
    </div>
  );
}
