# Melody Syntax Specification

Melody is a compact, text-based music notation syntax inspired by Music Macro Language (MML). It is parsed sequentially from left to right, whitespace is ignored, and tokens can be combined without separators.

---

## 1. Notes and Rests

Each musical event consists of a pitch or rest, optional accidentals, an optional duration denominator, and optional duration modifiers.

```
[pitch/rest][accidentals][duration][modifiers]
```

* **Pitches:** `a`, `b`, `c`, `d`, `e`, `f`, `g` (case-insensitive).
* **Rests:** `r` (creates silence for the specified duration).
* **Base Register:** Playback defaults to **Octave 4** (Middle C is `c4` or `c` when `L4` is active).

---

## 2. Accidentals

Accidentals immediately follow the pitch letter. The token `p` raises the pitch by one semitone (sharp ♯), and `q` lowers the pitch by one semitone (flat ♭). Multiple accidentals can be chained for double sharps or double flats.

| Symbol | Description | Semitone Delta | Example | Pitch Result |
| :--- | :--- | :--- | :--- | :--- |
| `p` | Sharp (♯) | +1 | `cp`, `dp`, `gp` | C♯, D♯, G♯ |
| `q` | Flat (♭) | −1 | `dq`, `eq`, `bq` | D♭, E♭, B♭ |
| `pp` | Double sharp (𝄪) | +2 | `cpp` | D |
| `qq` | Double flat (𝄫) | −2 | `dqq` | C |

---

## 3. Durations and Timing

Duration is expressed as the denominator of a musical note fraction (e.g., `4` for a quarter note, `8` for an eighth note).

### Global Defaults (`L` and `T`)

* **`T<bpm>` — Tempo:** Sets playback speed in beats per minute (quarter notes per minute). Defaults to `120` BPM. Tempo can be set or changed anywhere within the string.
  * Example: `T90 c d T180 e f`
* **`L<n>` — Default Note Length:** Sets the fallback duration denominator for all subsequent notes that do not specify an explicit number. The engine initializes with `L4` (quarter notes).
  * Example: `L8 c d e` plays three eighth notes.

---

## 4. Duration Modifiers

Modifiers appear directly after the duration denominator (or after the pitch/accidentals if using the default length). Modifiers can be combined in any arbitrary order.

| Symbol | Name | Description | Mathematical Effect |
| :--- | :--- | :--- | :--- |
| `-` | **Hyphen (Base Tie)** | Adds one base note length unit per hyphen. | Multiplies base time by $(1 + h)$ |
| `.` | **Dot** | Adds half of the preceding dot's increment. | Multiplies by $2 - (0.5)^d$ |
| `,` | **Comma (Flag / Beam)** | Halves the note's duration per comma. | Divides by $2^c$ |

### Mathematical Formula

$$\text{Duration (seconds)} = \left(\frac{4}{\text{denom}} \times \frac{60}{\text{tempo}} \times (1 + h)\right) \times \frac{2 - (0.5)^d}{2^c}$$

Where:
* $\text{denom}$: Explicit numeric denominator (or active `L` setting).
* $\text{tempo}$: Active tempo in BPM from `T`.
* $h$: Total number of hyphens (`-`).
* $d$: Total number of dots (`.`).
* $c$: Total number of commas (`,`).

### Modifier Behavior Examples (assuming `L4`, `T120`, where 1 beat = 0.500s)

* `c` — 1 beat (0.500 s)
* `c-` — 2 beats (1.000 s, base * 2)
* `c--` — 3 beats (1.500 s, base * 3)
* `c.` — 1.5 beats (0.750 s, dotted quarter)
* `c..` — 1.75 beats (0.875 s, double-dotted quarter)
* `c,` — 0.5 beats (0.250 s, eighth note equivalent)
* `c,,` — 0.25 beats (0.125 s, sixteenth note equivalent)
* `c.,` — 0.75 beats (0.375 s, dotted eighth note equivalent)
* `c8-` — 2 * eighth note = 1 quarter note (0.500 s)
* `c-..` — 2 beats * 1.75 = 3.5 beats (1.750 s)

---

## 5. Octave Navigation

Melody uses a modal register system featuring both persistent global shifts and non-destructive local displacements.

### Global Shifts (`J` / `K`)
Uppercase commands change the reference octave persistently for all subsequent events:
* `J`: Shifts global register **down** by 1 octave.
* `K`: Shifts global register **up** by 1 octave.

### Local Displacements (`j` / `k`)
Lowercase commands temporarily shift only the **immediately following event** (single note or chord). Once that event completes, the register automatically reverts to the global octave:
* `j`: Shifts next note or chord **down** by 1 octave.
* `k`: Shifts next note or chord **up** by 1 octave.
* Operators stack: `kk c` plays C two octaves higher than the global register without modifying the base octave for the note after it.

---

## 6. Chords

Chords are encapsulated in brackets `[...]`. All notes inside sound simultaneously.

```
[[internal_notes]][duration][modifiers]
```

* **Note Definition:** Pitches and accidentals are written consecutively: `[ceg]`, `[c ep g]`, `[d fq a]`.
* **Internal Voicing (`j` / `k`):** Lowercase octave modifiers can precede any note within a chord to shift only that individual note. The displacement resets for subsequent notes in the same bracket.
* **Duration & Modifiers:** Duration numbers, hyphens, dots, and commas apply to the entire chord when placed immediately outside the closing bracket:
  * `[ceg]2.` — Dotted half chord.
  * `[ceg]-` — Chord sustained for twice its base length.

### Chord Examples
* `[c e g kc]4` — C major triad with doubled octave (C4, E4, G4, C5).
* `[jf c f a]2` — F major triad in second inversion (F3, C4, F4, A4).
* `[jg f b kd]2` — Dominant 7th voicing (G3, F4, B4, D5).
* `[c e g kc]-` — C major chord sustained for two base durations.

---

## 7. Formal Grammar (EBNF)

```ebnf
Sequence        ::= ( Command | Event | Whitespace )* ;

Command         ::= SetTempo | SetLength | GlobalOctave | LocalOctave ;
SetTempo        ::= "T" [0-9]+ ;
SetLength       ::= "L" [0-9]+ ;
GlobalOctave    ::= "J" | "K" ;
LocalOctave     ::= "j" | "k" ;

Event           ::= ( SingleNote | Chord ) Duration? Modifiers? ;
SingleNote      ::= ( Pitch Accidental* ) | Rest ;
Pitch           ::= "a" | "b" | "c" | "d" | "e" | "f" | "g" ;
Rest            ::= "r" ;

Chord           ::= "[" ChordMember+ "]" ;
ChordMember     ::= ( "j" | "k" )* Pitch Accidental* ;

Accidental      ::= "p" | "q" ;
Duration        ::= [0-9]+ ;
Modifiers       ::= [.,-]* ;
Whitespace      ::= " " | "\t" | "\n" | "\r" ;
```

---

## 8. Musical Examples

### Für Elise (Theme Motif)
```
T140 L8 K e dp e dp e j b d c j a-
```
* `T140 L8`: Tempo set to 140 BPM; default length set to eighth notes.
* `K`: Shifts global reference register to Octave 5.
* `e dp e dp e`: Alternating E5 and D♯5 notes in the base register.
* `j b`: Temporary local drop to Octave 4 for B4.
* `d c`: Automatically returns to the base register for D5 and C5.
* `j a-`: Temporary local drop to Octave 4 for A4, held for 2 eighth-note lengths (one quarter note) via `-`.

### Classical Cadence (I – IV – V⁷ – I)
```
T110 L2 [c e g kc] [jf c f a] [jg f b kd] [c e g kc]-
```
* `T110 L2`: Tempo set to 110 BPM; default length set to half notes.
* `[c e g kc]`: C major triad with doubled octave (C4, E4, G4, C5).
* `[jf c f a]`: F major triad second inversion (F3, C4, F4, A4).
* `[jg f b kd]`: Dominant 7th open-position voicing (G3, F4, B4, D5).
* `[c e g kc]-`: C major chord held for 2 half-note lengths (C4, E4, G4, C5).
