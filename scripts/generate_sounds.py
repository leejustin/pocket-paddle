"""Synthesize the paddle pops.

Also generates the off-center "clack" for edge hits, the Pro sound packs, and
the court bounce and dead ball used by rally mode.

The pops are modal impact sounds tuned to measurements of real pickleball
contacts (sound-source/pickleball-lincoln.mp3): a dominant "pock" resonance near
1.1 kHz, a bright contact click (spectral centroid around 3 kHz), and a fast
decay that falls 20 dB in roughly 10-20 ms. Two faint ground reflections give
the dry hit an outdoor court feel.

Run from the project root:  python3 scripts/generate_sounds.py
"""

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import scipy.io.wavfile as wavfile
import scipy.signal as signal

SR = 48_000
OUT = Path(__file__).resolve().parent.parent / "assets" / "sounds"
TIERS = {"soft": 0.15, "medium": 0.55, "hard": 1.0}
VARIANTS = 3


@dataclass(frozen=True)
class Voice:
    """How a paddle (or the court) colors the same ball-contact model."""
    base: float = 1120  # dominant ball/face resonance, Hz
    decay: float = 1.0  # scales every mode's decay time
    upper: float = 1.0  # scales the bright upper modes
    click: float = 1.0  # scales the contact click
    click_top: float = 1.0  # scales the click's upper band edge
    core: float = 1.0  # scales the low paddle-core thump
    tone: float | None = None  # optional final low-pass, Hz


CLASSIC = Voice()
# Pro sound packs: each is a different paddle build hitting the same ball.
PACKS = {
    # Solid wood: lower, woodier and longer, with little high click.
    "wood": Voice(base=840, decay=1.6, upper=0.45, click=0.35, click_top=0.45, core=2.2, tone=5200),
    # Raw carbon pro paddle: tighter, higher and crackling.
    "carbon": Voice(base=1260, decay=0.85, upper=1.15, click=1.15, click_top=1.0, core=0.8, tone=9000),
    # A muted, round "thock": a foam-core paddle at its softest.
    "thock": Voice(base=640, decay=1.7, upper=0.3, click=0.2, click_top=0.35, core=2.6, tone=2600),
}
# The ball meeting the court: the same shell, duller, with a thud from the ground.
COURT = Voice(base=1000, decay=0.85, upper=0.5, click=0.35, click_top=0.5, core=1.8, tone=4200)


def butter(kind: str, cutoff: float | list[float], order: int = 2) -> np.ndarray:
    return signal.butter(order, cutoff, kind, fs=SR, output="sos")


def pop(strength: float, rng: np.random.Generator, voice: Voice = CLASSIC) -> np.ndarray:
    length = int(0.15 * SR)
    t = np.arange(length) / SR
    detune = 1 + rng.uniform(-0.035, 0.035)
    f1 = voice.base * detune * (0.96 + 0.06 * strength)
    # The ball shell deforms on contact, so the main tone starts a little sharp.
    glide = 1 + 0.06 * (0.4 + strength) * np.exp(-t / 0.0035)
    modes = [
        # (frequency ratio, gain, decay seconds)
        (1.00, 1.00, 0.0068 + 0.0018 * (1 - strength)),
        (1.27, 0.45, 0.0052),
        (1.52, 0.55, 0.0046),
        (2.41, 0.50 * (0.6 + strength) * voice.upper, 0.0031),
        (3.83, 0.38 * (0.45 + strength) * voice.upper, 0.0019),
        (5.62, 0.24 * (0.3 + strength) * voice.upper, 0.0012),
        (0.24, 0.20 * (1.2 - 0.5 * strength) * voice.core, 0.0070),  # paddle core thump
    ]
    body = np.zeros(length)
    for ratio, gain, decay in modes:
        jitter = 1 + rng.uniform(-0.01, 0.01)
        phase = 2 * np.pi * np.cumsum(f1 * ratio * jitter * glide) / SR
        body += gain * np.sin(phase) * np.exp(-t / (decay * voice.decay))
    # Contact click: a sub-millisecond band-limited burst, brighter for harder hits.
    click = rng.standard_normal(length) * np.exp(-t / (0.00045 + 0.0002 * strength))
    click = signal.sosfilt(butter("bandpass", [1800, (9000 + 5000 * strength) * voice.click_top]), click)
    pulse_width = int(0.0006 * SR)
    pulse = np.zeros(length)
    pulse[:pulse_width] = np.sin(np.linspace(0, np.pi, pulse_width))
    dry = body + (1.3 + 2.2 * strength) * voice.click * click / np.abs(click).max() + 0.35 * pulse
    # Soften the very first sample so playback never starts with a DC step.
    dry *= 1 - np.exp(-t / 0.00012)
    wet = dry.copy()
    for delay, gain in ((0.0085, 0.13), (0.0205, 0.07)):
        offset = int(delay * SR)
        reflection = signal.sosfilt(butter("lowpass", 3200), dry)[: length - offset]
        wet[offset:] += gain * reflection
    air = rng.standard_normal(length) * np.exp(-t / 0.028)
    wet += 0.012 * signal.sosfilt(butter("bandpass", [400, 4000]), air)
    if voice.tone:
        wet = signal.sosfilt(butter("lowpass", voice.tone), wet)
    fade = int(0.025 * SR)
    wet[-fade:] *= np.cos(np.linspace(0, np.pi / 2, fade)) ** 2
    return wet / np.abs(wet).max() * 0.95


def modal(t: np.ndarray, base: float, modes: list[tuple[float, float, float]], rng: np.random.Generator) -> np.ndarray:
    out = np.zeros(len(t))
    for ratio, gain, decay in modes:
        jitter = 1 + rng.uniform(-0.015, 0.015)
        out += gain * np.sin(2 * np.pi * base * ratio * jitter * t) * np.exp(-t / decay)
    return out


def clack(rng: np.random.Generator) -> np.ndarray:
    """An off-center hit on the edge guard: harder, lower, buzzier, with a short rattle."""
    length = int(0.12 * SR)
    t = np.arange(length) / SR
    base = 690 * (1 + rng.uniform(-0.04, 0.04))
    body = modal(t, base, [(1.0, 1.0, 0.006), (1.83, 0.7, 0.004), (3.1, 0.55, 0.0025), (4.4, 0.35, 0.0016)], rng)
    rattle = rng.standard_normal(length) * np.exp(-t / 0.012) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 95 * t)))
    rattle = signal.sosfilt(butter("bandpass", [900, 5200]), rattle)
    click = signal.sosfilt(butter("highpass", 2500), rng.standard_normal(length) * np.exp(-t / 0.0004))
    dry = body + 0.35 * rattle / np.abs(rattle).max() + 0.8 * click / np.abs(click).max()
    dry *= 1 - np.exp(-t / 0.0001)
    return finish(dry)


def bounce(strength: float, rng: np.random.Generator) -> np.ndarray:
    """The ball landing on the court: rally mode's cue that it's time to swing."""
    return pop(strength, rng, COURT) * (0.55 + 0.45 * strength)


def dead_ball(rng: np.random.Generator) -> np.ndarray:
    """A missed ball skipping away: four bounces, each lower, softer and sooner."""
    length = int(1.2 * SR)
    out = np.zeros(length)
    for at, strength in ((0.0, 0.7), (0.38, 0.42), (0.66, 0.24), (0.86, 0.12)):
        hit = bounce(strength, rng)
        start = int(at * SR)
        out[start:start + len(hit)] += hit[: length - start]
    return finish(out)


def finish(audio: np.ndarray) -> np.ndarray:
    fade = int(0.02 * SR)
    audio = audio.copy()
    audio[-fade:] *= np.cos(np.linspace(0, np.pi / 2, fade)) ** 2
    return audio / np.abs(audio).max() * 0.95


def write(path: Path, audio: np.ndarray) -> None:
    wavfile.write(path, SR, (np.clip(audio, -1, 1) * 32767).astype(np.int16))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20261009)
    for tier, strength in TIERS.items():
        for variant in range(1, VARIANTS + 1):
            write(OUT / f"pop-{tier}-{variant}.wav", pop(strength, rng))
    # The retired whoosh loop drew this much noise; skip it so the clacks stay the same.
    rng.standard_normal(int(2.25 * SR))
    for variant in (1, 2):
        write(OUT / f"clack-{variant}.wav", clack(rng))
    # Newer sounds use their own generator, so adding them never changes the classic set.
    rng = np.random.default_rng(20261011)
    for name, voice in PACKS.items():
        (OUT / name).mkdir(exist_ok=True)
        for tier, strength in TIERS.items():
            for variant in range(1, VARIANTS + 1):
                write(OUT / name / f"pop-{tier}-{variant}.wav", pop(strength, rng, voice))
    for variant in (1, 2):
        write(OUT / f"bounce-{variant}.wav", bounce(0.75, rng))
    write(OUT / "dead-ball.wav", dead_ball(rng))
    print(f"Wrote {len(TIERS) * VARIANTS} pops, two clacks, {len(PACKS)} Pro packs, two bounces and a dead ball to {OUT}")


if __name__ == "__main__":
    main()
