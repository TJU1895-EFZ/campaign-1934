export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  subtitles: boolean;
  mouseSensitivity: number;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 0.8,
  subtitles: true,
  mouseSensitivity: 0.5,
};

const STORAGE_KEY = 'campaign1934.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      masterVolume: clamp(parsed.masterVolume ?? DEFAULT_SETTINGS.masterVolume, 0, 1),
      sfxVolume: clamp(parsed.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume, 0, 1),
      subtitles: parsed.subtitles ?? DEFAULT_SETTINGS.subtitles,
      mouseSensitivity: clamp(parsed.mouseSensitivity ?? DEFAULT_SETTINGS.mouseSensitivity, 0, 1),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings are optional; a blocked storage API must not break the experience.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
