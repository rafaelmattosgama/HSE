"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MODULE_OPTIONS, type ModuleToggleKey, type ModuleToggleMap } from "@/lib/modules";
import { MANAGED_MODULE_ROLES, ROLE_MODULE_KEYS, type RoleModuleSettings } from "@/lib/role-modules";
import type { N0MasterDataUi } from "@/lib/master-data-ui";

export function RoleModuleManager({ plantCode, authorized, initialRoles, labels, moduleLabels }: {
  plantCode: string;
  authorized: ModuleToggleMap;
  initialRoles: RoleModuleSettings;
  labels: N0MasterDataUi;
  moduleLabels: Partial<Record<ModuleToggleKey, string>>;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const options = MODULE_OPTIONS.filter(module => authorized[module.key] && MANAGED_MODULE_ROLES.some(role => ROLE_MODULE_KEYS[role].includes(module.key)));

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const payload = Object.fromEntries(MANAGED_MODULE_ROLES.map(role => [role, Object.fromEntries(
        options.filter(module => ROLE_MODULE_KEYS[role].includes(module.key)).map(module => [module.key, roles[role][module.key]]),
      )]));
      const response = await fetch(`/api/plants/${plantCode}/admin/role-modules`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roles: payload }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.message ?? labels.moduleSettingsError);
      setRoles(json.data.roles);
      setMessage(labels.moduleSettingsSaved);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.moduleSettingsError);
    } finally {
      setSaving(false);
    }
  }

  return <section className="app-panel space-y-4 rounded-xl p-5">
    <header>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.roleModules.title}</h2>
      <p className="mt-2 text-sm text-slate-600">{labels.roleModules.help}</p>
    </header>
    {options.length ? <div className="app-table-shell overflow-x-auto"><table className="app-table">
      <thead><tr><th>{labels.roleModules.module}</th>{MANAGED_MODULE_ROLES.map(role => <th key={role}>{labels.roleModules[role]}</th>)}</tr></thead>
      <tbody>{options.map(module => <tr key={module.key}>
        <td>{moduleLabels[module.key] ?? module.label}</td>
        {MANAGED_MODULE_ROLES.map(role => <td key={role}>{ROLE_MODULE_KEYS[role].includes(module.key)
          ? <input type="checkbox" aria-label={`${moduleLabels[module.key] ?? module.label} — ${labels.roleModules[role]}`} checked={roles[role][module.key]} disabled={saving}
              onChange={event => setRoles(current => ({ ...current, [role]: { ...current[role], [module.key]: event.target.checked } }))} />
          : <span title={labels.roleModules.unavailable}>—</span>}</td>)}
      </tr>)}</tbody>
    </table></div> : <p className="text-sm text-slate-600">{labels.roleModules.empty}</p>}
    <div className="flex items-center gap-3">
      <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !options.length}>{saving ? labels.saving : labels.savePlantModules}</Button>
      <p aria-live="polite" className="text-sm text-slate-600">{message}</p>
    </div>
  </section>;
}
