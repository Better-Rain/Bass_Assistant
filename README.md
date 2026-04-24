# Redline Bass Tuner

Redline Bass Tuner is a bass practice tool focused on direct-input workflow. The visual style is inspired by the red metal shell and black faceplate of the Focusrite Scarlett Solo.

## Features

- Real-time bass tuner with note name, target string, target frequency, and cents offset
- Multiple tuning presets: 4-string standard, Drop D, 5-string standard, and Tenor Bass
- Audio input selection with active input display
- Concert pitch calibration with `A4 = 430 ~ 450 Hz`
- Reference tone playback with octave reinforcement
- Practice library UI grouped by lesson
- Backing / full / workout track switching
- Search, favorites, playback speed, and single-track loop
- Resume playback from the last saved position for each song
- App-style layout with sidebar, top search bar, main workspace, and bottom transport bar

## Local Library

The project keeps a local practice-audio directory at:

- `public/library`

Git now preserves the directory itself but does not track the music files inside it. You can keep your own audio files in that folder without committing them.

## Run

```bash
npm install
npm run dev
```

The default local address is usually `http://localhost:5173`.

## Validate

```bash
npm run lint
npm run build
```

## Usage Notes

- Use the `INST` input mode on Scarlett Solo when plugging in the bass.
- Allow microphone permission in the browser.
- Disable OS-level auto gain, noise suppression, and echo cancellation when possible.
- For tuning, pluck a single open string and let the detector lock for 1 to 2 seconds.
- During practice, start with the backing-track version and switch to the full version for comparison when needed.
