import { SHOW } from './config';

/**
 * 演出の BGM・効果音。音声ファイルは使わず Web Audio API でその場で合成する（ライセンス不要・追加の通信なし）。
 *
 * - ブラウザの自動再生制限により、多くの環境ではユーザーのタップ後にしか鳴らせない。
 *   unlock() はタップの処理中に呼ぶこと。
 * - play(fromMs) は演出の時刻 fromMs 以降の音をまとめて予約する。途中から鳴らすこともできる。
 * - 予約した音は再生ごとの GainNode にぶら下げてあり、stop() でまとめてフェードアウトして切る。
 */
export class ShowSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /** AudioContext を用意して再開を試みる。鳴らせる状態になれば true */
  async unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
    return ctx.state === 'running';
  }

  /** タップなしで鳴らせる状態か（ブラウザが許可している場合のみ true） */
  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** 演出の fromMs 以降の音を予約して鳴らす */
  play(fromMs: number, opts: { reduced?: boolean } = {}): void {
    this.stop();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.master) return;
    const bus = ctx.createGain();
    bus.connect(this.master);
    this.bus = bus;
    const t0 = ctx.currentTime + 0.03 - fromMs / 1000;
    const events = opts.reduced ? reducedScore() : score();
    for (const ev of events) {
      if (ev.at < fromMs - 30) continue;
      ev.play(this, t0 + ev.at / 1000);
    }
  }

  /** スキップ時：鳴っている音を止め、着地のジャーンだけ鳴らす */
  playFinale(): void {
    this.stop();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.master) return;
    const bus = ctx.createGain();
    bus.connect(this.master);
    this.bus = bus;
    const t = ctx.currentTime + 0.02;
    this.brass(t, 0.9, CHORD_FINAL, 0.22);
    this.crash(t, 0.25);
  }

  stop(): void {
    const ctx = this.ctx;
    const bus = this.bus;
    this.bus = null;
    if (!ctx || !bus) return;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0, now + 0.08);
    setTimeout(() => bus.disconnect(), 200);
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  // ---------------------------------------------------------------------------

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      const master = ctx.createGain();
      master.gain.value = 0.62;
      master.connect(comp);
      comp.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.5);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noiseBuf = buf;
      return ctx;
    } catch {
      return null;
    }
  }

  private out(): AudioNode {
    return this.bus!;
  }

  /** 音程のある音（エンベロープつき） */
  tone(
    t: number,
    dur: number,
    o: { type?: OscillatorType; freq: number; freqEnd?: number; gain: number; attack?: number; detune?: number; lowpass?: number },
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.out());
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** ノイズ（シンバル・スネア・風切り音など） */
  noise(
    t: number,
    dur: number,
    o: { filter: BiquadFilterType; freq: number; freqEnd?: number; q?: number; gain: number; attack?: number },
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out());
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  kick(t: number, gain = 0.9, low = 45): void {
    this.tone(t, 0.45, { freq: 160, freqEnd: low, gain });
    this.noise(t, 0.03, { filter: 'lowpass', freq: 3000, gain: gain * 0.3 });
  }

  snare(t: number, gain = 0.3): void {
    this.noise(t, 0.14, { filter: 'bandpass', freq: 1900, q: 0.7, gain });
    this.tone(t, 0.08, { type: 'triangle', freq: 220, freqEnd: 160, gain: gain * 0.5 });
  }

  hat(t: number, gain = 0.08): void {
    this.noise(t, 0.045, { filter: 'highpass', freq: 7500, gain });
  }

  crash(t: number, gain = 0.3): void {
    this.noise(t, 1.6, { filter: 'highpass', freq: 4500, gain });
    this.noise(t, 0.5, { filter: 'bandpass', freq: 9000, q: 0.5, gain: gain * 0.6 });
  }

  /** ブラス風の和音（のこぎり波を2本ずつ少しずらして重ねる） */
  brass(t: number, dur: number, notes: number[], gain: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(1600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.setValueAtTime(gain, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    g.connect(this.out());
    for (const n of notes) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const CHORD_KOKO = [72, 76, 79, 84]; // C5 E5 G5 C6
const CHORD_BA = [67, 72, 76]; // G4 C5 E5
const CHORD_FINAL = [60, 64, 67, 72, 76]; // C4 E4 G4 C5 E5

interface ScoreEvent {
  at: number;
  play: (s: ShowSound, t: number) => void;
}

/** 演出のタイムライン（config.ts）に合わせた譜面 */
function score(): ScoreEvent[] {
  const ev: ScoreEvent[] = [];
  const add = (at: number, play: ScoreEvent['play']) => ev.push({ at, play });
  const spinEnd = SHOW.globeIn.end;

  // --- BGM：150BPM のノリのいいビート（着地まで） ---
  const beat = 400;
  const bgmEnd = SHOW.arrival.start;
  const bass = [36, 36, 48, 36, 39, 41, 43, 46];
  for (let at = 0, i = 0; at < bgmEnd; at += beat / 2, i++) {
    const inPause = at >= SHOW.pause.start && at < SHOW.pause.end;
    if (!inPause) {
      add(at, (s, t) => s.hat(t, i % 2 ? 0.05 : 0.08));
      if (i % 2 === 0 && at < SHOW.stages[0].start) add(at, (s, t) => s.kick(t, 0.45, 50));
      if (i % 4 === 2 && at < SHOW.stages[0].start) add(at, (s, t) => s.snare(t, 0.16));
      const n = bass[i % bass.length];
      add(at, (s, t) => s.tone(t, 0.18, { type: 'square', freq: midi(n), gain: 0.07, lowpass: 900 }));
    }
  }

  // --- 「そぉ～れ」＋地球グルグル：スネアロール＋風切り音 ---
  for (let at = 60; at < spinEnd - 80; ) {
    const k = at / spinEnd;
    add(at, (s, t) => s.snare(t, 0.05 + 0.1 * Math.sin(Math.PI * k)));
    at += 70 - 30 * Math.sin(Math.PI * k);
  }
  add(0, (s, t) => s.noise(t, spinEnd / 1000, { filter: 'bandpass', freq: 400, freqEnd: 2600, q: 3, gain: 0.12, attack: 0.25 }));
  add(SHOW.callFirst.in, (s, t) => s.tone(t, 0.6, { type: 'triangle', freq: midi(67), freqEnd: midi(64), gain: 0.08, attack: 0.05 }));
  // 止まる「キュッ」
  add(spinEnd - 90, (s, t) => s.tone(t, 0.12, { type: 'sine', freq: 1500, freqEnd: 500, gain: 0.25 }));

  // --- 指「ビシッ」＋「ここぉ！」ジャン！ ---
  const arrive = SHOW.finger.arrive;
  add(SHOW.finger.enter, (s, t) => s.noise(t, 0.18, { filter: 'bandpass', freq: 900, freqEnd: 3500, q: 2, gain: 0.18 }));
  add(arrive, (s, t) => {
    s.noise(t, 0.07, { filter: 'highpass', freq: 2500, gain: 0.5 });
    s.tone(t, 0.09, { type: 'square', freq: 1900, freqEnd: 700, gain: 0.12 });
  });
  add(SHOW.callSecond.in, (s, t) => {
    s.brass(t, 0.38, CHORD_KOKO, 0.16);
    s.crash(t, 0.14);
    s.kick(t, 0.6);
  });

  // --- タメ：低いトレモロで緊張感 ---
  add(SHOW.pause.start, (s, t) => {
    const dur = (SHOW.pause.end - SHOW.pause.start) / 1000;
    for (let i = 0; i < 6; i++) {
      s.tone(t + (i * dur) / 6, dur / 6, { type: 'sawtooth', freq: midi(31 + (i % 2)), gain: 0.09, lowpass: 400 });
    }
    s.noise(t, dur, { filter: 'bandpass', freq: 200, freqEnd: 1200, q: 4, gain: 0.08, attack: dur * 0.8 });
  });

  // --- ズン、ズン、ズーン：上昇音 → 低音ドーン ---
  SHOW.stages.forEach((st, i) => {
    const big = i === SHOW.stages.length - 1;
    add(st.start, (s, t) => {
      s.noise(t, st.move / 1000, { filter: 'bandpass', freq: 300, freqEnd: big ? 6000 : 3500, q: 2, gain: big ? 0.3 : 0.22, attack: st.move / 1000 * 0.8 });
      s.tone(t, st.move / 1000, { type: 'sawtooth', freq: midi(43 + i * 5), freqEnd: midi(55 + i * 5), gain: 0.05, lowpass: 1500, attack: 0.2 });
    });
    add(st.start + st.move, (s, t) => {
      s.kick(t, big ? 1 : 0.85, big ? 30 : 38);
      s.tone(t, big ? 0.9 : 0.5, { type: 'sine', freq: 110, freqEnd: big ? 28 : 40, gain: big ? 0.7 : 0.5 });
      s.noise(t, big ? 0.6 : 0.3, { filter: 'lowpass', freq: 900, gain: big ? 0.35 : 0.22 });
    });
  });

  // --- 到着：ピン「ドン」→「バ・バーン！」ファンファーレ＋シンバル ---
  const ar = SHOW.arrival;
  add(ar.start, (s, t) => s.tone(t, 0.16, { type: 'sine', freq: 2200, freqEnd: 500, gain: 0.12 }));
  add(ar.pinLand, (s, t) => s.kick(t, 0.8));
  add(ar.cardStart, (s, t) => s.brass(t, 0.14, CHORD_BA, 0.18));
  add(ar.cardBang, (s, t) => {
    s.brass(t, 1.5, CHORD_FINAL, 0.2);
    s.crash(t, 0.32);
    s.kick(t, 0.7);
  });
  // 余韻のキラキラ
  [84, 88, 91, 96].forEach((n, i) =>
    add(ar.cardSettle + 250 + i * 90, (s, t) => s.tone(t, 0.5, { type: 'triangle', freq: midi(n), gain: 0.07 })),
  );
  return ev;
}

/** 軽減モーション時：短いジャーンだけ */
function reducedScore(): ScoreEvent[] {
  return [{ at: 100, play: (s, t) => s.brass(t, 0.9, CHORD_FINAL, 0.16) }];
}
