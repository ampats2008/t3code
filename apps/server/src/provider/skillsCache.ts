/**
 * Shared skills cache — populated by provider adapters (Codex, Claude) when
 * they discover supported slash-commands during session initialization.
 *
 * Skills are static per provider binary, so we cache them at the module level
 * and merge results from all adapters.
 */

export interface CachedSkill {
  name: string;
  description: string;
  argumentHint: string;
}

const _skillsByProvider = new Map<string, ReadonlyArray<CachedSkill>>();
let _onChangeCallback: (() => void) | undefined;

/**
 * Register a callback that fires whenever the skills cache changes.
 * Only one callback is supported (last-write-wins).
 */
export function onSkillsCacheChange(callback: () => void): void {
  _onChangeCallback = callback;
}

/**
 * Store skills discovered by a specific provider.
 * Overwrites any previously cached skills for that provider.
 */
export function setCachedSkills(provider: string, skills: ReadonlyArray<CachedSkill>): void {
  _skillsByProvider.set(provider, skills);
  _onChangeCallback?.();
}

/**
 * Read the merged, de-duplicated skills from all providers.
 * Skills are keyed by name; if multiple providers define the same skill name,
 * the first provider to cache it wins.
 */
export function getCachedSkills(): ReadonlyArray<CachedSkill> {
  const seen = new Set<string>();
  const merged: CachedSkill[] = [];
  for (const skills of _skillsByProvider.values()) {
    for (const skill of skills) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        merged.push(skill);
      }
    }
  }
  return merged;
}
