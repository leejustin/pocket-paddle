# Sound source

All app sounds in `assets/sounds/` are synthesized by `scripts/generate_sounds.py`. They are original audio; no recording is bundled.

**Pops** (`pop-{soft,medium,hard}-{1,2,3}.wav`, 150 ms, 48 kHz mono) are modal impact sounds: five damped resonances (ball shell plus paddle core), a sub-millisecond band-limited contact click, a slight pitch glide as the ball deforms, two faint ground reflections, and a trace of air. Their targets come from analyzing the strongest contacts in the reference recordings below:

| Measure | Real contacts | Bundled hard pop |
| --- | --- | --- |
| Dominant resonance | 0.9–1.5 kHz | ~1.1–1.5 kHz |
| Spectral centroid | ~2.5–4 kHz | ~2.5 kHz |
| Time to fall 20 dB | ~10–20 ms | ~14 ms |

Soft pops are intentionally mellower (less click, centroid around 1.7 kHz), like a soft dink.

**Clack** (`clack-1/2.wav`, 120 ms) is an off-center hit on the edge guard: a lower 690 Hz body with buzzy upper modes, a short rattle, and a hard click.

**Pro packs** (`wood/`, `carbon/`, `thock/`, same names as the pops) run the same contact model through a different paddle `Voice`:

| Pack | Dominant resonance | Hard-hit centroid | Character |
| --- | --- | --- | --- |
| Classic | ~1.1–1.2 kHz | ~3.0 kHz | The tuned default |
| Wood | ~0.85 kHz | ~1.1 kHz | Lower and woodier, little click |
| Carbon | ~1.3 kHz | ~3.4 kHz | Tighter and crisper |
| Thock | ~0.65 kHz | ~0.7 kHz | Muted, round, foam-core |

**Rally sounds:** `bounce-1/2.wav` is the ball landing on the court (the same shell, duller, with a ground thud), the cue to swing. `dead-ball.wav` is a missed ball skipping away in four shrinking bounces.

The classic pops and clacks come from the original random seed and are unchanged; newer sounds use their own seed, so adding one never alters the others.

## Reference recordings (not bundled or checked in)

- `pickleball-lincoln.mp3`: **Pickleball Lincoln Nebraska.mp3** by **bmccoy2**, CC BY 4.0, https://freesound.org/people/bmccoy2/sounds/477653/
- `pickleball-cc0.mp3`: **PickleBall.m4a** by **fkunze**, CC0, https://freesound.org/people/fkunze/sounds/547092/

These recordings were measured only to tune the synthesis. Download them from the links above into this folder to re-measure. Earlier recorded contacts were retired and are not imported, bundled, or checked in.
