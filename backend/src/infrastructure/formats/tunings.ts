const NOTE_NAMES = ["E", "F", "F#", "G", "Ab", "A", "Bb", "B", "C", "C#", "D", "Eb"] as const;

const STANDARD_NAMES: Record<number, string> = {
  0:  "E Standard",
  [-1]: "Eb Standard",
  [-2]: "D Standard",
  [-3]: "C# Standard",
  [-4]: "C Standard",
  [-5]: "B Standard",
  [-6]: "Bb Standard",
  [-7]: "A Standard",
  1:  "F Standard",
  2:  "F# Standard",
};

const NAMED_TUNINGS: Record<string, string> = {
  "-2,0,0,0,0,0":      "Drop D",
  "-4,-2,-2,-2,-2,-2": "Drop C",
  "-2,-2,0,0,0,0":     "Double Drop D",
  "0,0,0,-1,0,0":      "Open G",
  "-2,-2,0,0,-2,-2":   "Open D",
  "-2,0,0,0,-2,0":     "DADGAD",
  "0,2,2,1,0,0":       "Open E",
  "-2,0,0,2,3,2":      "Open D (alt)",
};

export function tuningName(offsets: number[]): string {
  if (offsets.length > 0 && offsets.every((o) => o === offsets[0])) {
    const name = STANDARD_NAMES[offsets[0]];
    if (name) return name;
  }

  // Drop tuning: low string is 2 semitones below the rest (6-string only)
  if (
    offsets.length === 6 &&
    offsets[0] === offsets[1] - 2 &&
    offsets.slice(1).every((o) => o === offsets[1])
  ) {
    const lowNote = NOTE_NAMES[((offsets[0] % 12) + 12) % 12];
    return `Drop ${lowNote}`;
  }

  const key = offsets.join(",");
  if (NAMED_TUNINGS[key]) return NAMED_TUNINGS[key];

  return offsets.join(" ") || "Unknown";
}

export function tuningSortKey(offsets: number[]): number {
  return offsets.reduce((sum, o) => sum + o, 0);
}
