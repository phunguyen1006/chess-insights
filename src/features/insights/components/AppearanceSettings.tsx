import type { useAppearance, Theme } from "../../state/useAppearance";
import { Panel } from "./Common";
export function AppearanceSettings({
  appearance,
}: {
  appearance: ReturnType<typeof useAppearance>;
}) {
  return (
    <Panel title="Appearance">
      <label className="ci-field">
        <span>Color theme</span>
        <select
          aria-label="Color theme"
          value={appearance.theme}
          disabled={!appearance.ready || appearance.saving}
          onChange={(e) => void appearance.change(e.target.value as Theme)}
        >
          <option value="light">Light mode</option>
          <option value="dark">Dark mode</option>
        </select>
      </label>
      <p className="ci-note">
        Applies to Insights and the homepage heatmap. Saved on this device.
      </p>
      {appearance.saving && <p role="status">Saving appearance…</p>}
      {appearance.error && <p role="alert">{appearance.error}</p>}
    </Panel>
  );
}
