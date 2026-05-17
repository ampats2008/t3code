export function logPiModelPickerDebug(event: string, details: Record<string, unknown>): void {
  // Intentionally console-only while debugging the Pi picker. The temporary server
  // debug endpoint can fail depending on which dev/desktop origin serves the UI,
  // and that network noise makes the actual picker flow harder to read.
  console.log("[pi-model-picker]", event, details);
}
