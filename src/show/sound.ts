import { SHOW } from './config';

/**
 * 演出の BGM・効果音。音声ファイルは使わず Web Audio API でその場で合成する（ライセンス不要・追加の通信なし）。
 *
 * - ブラウザの自動再生制限により、多くの環境ではユーザーの操作後にしか鳴らせない。
 *   unlock() は操作（タップ・クリック・キー入力）の処理中に呼ぶこと。
 * - play(fromMs) は演出の時刻 fromMs 以降の音をまとめて予約する。途中から鳴らすこともできる。
 * - 予約した音は再生ごとの GainNode にぶら下げてあり、stop() でまとめてフェードアウトして切る。
 * - 残響（リバーブ）は合成したインパルス応答の ConvolverNode。派手な音ほど多めに送る。
 */
export class ShowSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private bus: GainNode | null = null;
  private send: GainNode | null = null;
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

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** 演出の fromMs 以降の音を予約して鳴らす */
  play(fromMs: number, opts: { reduced?: boolean } = {}): void {
    if (!this.openBus()) return;
    const t0 = this.ctx!.currentTime + 0.03 - fromMs / 1000;
    const events = opts.reduced ? reducedScore() : score();
    for (const ev of events) {
      if (ev.at < fromMs - 30) continue;
      ev.play(this, t0 + ev.at / 1000);
    }
  }

  /** スキップ時：鳴っている音を止め、着地の「バーン」だけ鳴らす */
  playFinale(): void {
    if (!this.openBus()) return;
    this.bang(this.ctx!.currentTime + 0.02);
  }

  stop(): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const send = this.send;
    this.bus = null;
    this.send = null;
    if (!ctx || !bus) return;
    const now = ctx.currentTime;
    for (const g of [bus, send]) {
      if (!g) continue;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 0.08);
    }
    setTimeout(() => {
      bus.disconnect();
      send?.disconnect();
    }, 200);
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  // ---------------------------------------------------------------------------

  private openBus(): boolean {
    this.stop();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.master || !this.reverbIn) return false;
    const bus = ctx.createGain();
    bus.connect(this.master);
    const send = ctx.createGain();
    send.connect(this.reverbIn);
    this.bus = bus;
    this.send = send;
    return true;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 8;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      const master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(comp);
      comp.connect(ctx.destination);

      // 残響：指数減衰するステレオのノイズをインパルス応答にする
      const conv = ctx.createConvolver();
      const irLen = Math.floor(ctx.sampleRate * 2.2);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
      }
      conv.buffer = ir;
      const reverbIn = ctx.createGain();
      reverbIn.gain.value = 0.55;
      reverbIn.connect(conv);
      conv.connect(master);

      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.reverbIn = reverbIn;
      this.noiseBuf = buf;
      return ctx;
    } catch {
      return null;
    }
  }

  /** 出力先：ドライ（bus）と残響（send）に分けて送る */
  private connectOut(node: AudioNode, t: number, o: { pan?: number; wet?: number } = {}): void {
    const ctx = this.ctx!;
    let out: AudioNode = node;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(o.pan, t);
      node.connect(p);
      out = p;
    }
    out.connect(this.bus!);
    if (o.wet && this.send) {
      const w = ctx.createGain();
      w.gain.value = o.wet;
      out.connect(w);
      w.connect(this.send);
    }
  }

  /** 音程のある音（エンベロープつき） */
  tone(
    t: number,
    dur: number,
    o: {
      type?: OscillatorType;
      freq: number;
      freqEnd?: number;
      gain: number;
      attack?: number;
      detune?: number;
      lowpass?: number;
      pan?: number;
      wet?: number;
    },
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
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
    let node: AudioNode = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    this.connectOut(g, t, o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** ノイズ（シンバル・スネア・風切り音など）。reverse で逆再生風に盛り上がる */
  noise(
    t: number,
    dur: number,
    o: {
      filter: BiquadFilterType;
      freq: number;
      freqEnd?: number;
      q?: number;
      gain: number;
      attack?: number;
      reverse?: boolean;
      pan?: number;
      wet?: number;
    },
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
    g.gain.setValueAtTime(0.0001, t);
    if (o.reverse) {
      g.gain.exponentialRampToValueAtTime(o.gain, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    } else {
      g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.003));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    src.connect(f);
    f.connect(g);
    this.connectOut(g, t, o);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  kick(t: number, gain = 0.9, low = 45): void {
    this.tone(t, 0.42, { freq: 150, freqEnd: low, gain });
    this.noise(t, 0.025, { filter: 'lowpass', freq: 4000, gain: gain * 0.35 });
  }

  snare(t: number, gain = 0.3, pan = 0): void {
    this.noise(t, 0.16, { filter: 'bandpass', freq: 2000, q: 0.6, gain, pan, wet: 0.15 });
    this.tone(t, 0.09, { type: 'triangle', freq: 230, freqEnd: 170, gain: gain * 0.6, pan });
  }

  hat(t: number, gain = 0.07, open = false): void {
    this.noise(t, open ? 0.18 : 0.04, { filter: 'highpass', freq: 8000, gain, pan: 0.25 });
  }

  crash(t: number, gain = 0.3, pan = 0): void {
    this.noise(t, 2.2, { filter: 'highpass', freq: 4200, gain, pan, wet: 0.5 });
    this.noise(t, 0.6, { filter: 'bandpass', freq: 8500, q: 0.5, gain: gain * 0.6, pan, wet: 0.3 });
  }

  /** ティンパニ風（音程の下がる低音＋ノイズの打撃） */
  timpani(t: number, gain = 0.6, note = 36): void {
    const f = midi(note);
    this.tone(t, 1.1, { freq: f * 1.06, freqEnd: f, gain, wet: 0.35 });
    this.tone(t, 0.8, { freq: f * 1.5, freqEnd: f * 1.47, gain: gain * 0.25, wet: 0.35 });
    this.noise(t, 0.08, { filter: 'lowpass', freq: 1200, gain: gain * 0.4 });
  }

  /** ブラス風の和音（のこぎり波を少しずらして重ね、フィルタを開いて「パァン」と鳴らす） */
  brass(t: number, dur: number, notes: number[], gain: number, o: { attack?: number; wet?: number; bright?: number } = {}): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.5;
    const bright = o.bright ?? 4800;
    const a = o.attack ?? 0.02;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(bright, t + a + 0.04);
    f.frequency.exponentialRampToValueAtTime(Math.max(900, bright * 0.35), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + a);
    g.gain.setValueAtTime(gain, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    this.connectOut(g, t, { wet: o.wet ?? 0.35 });
    notes.forEach((n, i) => {
      for (const det of [-9, 0, 9]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midi(n);
        osc.detune.value = det + (i % 2 ? 3 : -3);
        osc.connect(f);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
    });
  }

  /** ストリングス風のパッド（ゆっくり立ち上がる） */
  strings(t: number, dur: number, notes: number[], gain: number, attack = 0.25): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    this.connectOut(g, t, { wet: 0.6 });
    for (const n of notes) {
      for (const det of [-12, 12]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midi(n);
        osc.detune.value = det;
        // ビブラート
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.5;
        const lg = ctx.createGain();
        lg.gain.value = 6;
        lfo.connect(lg);
        lg.connect(osc.detune);
        osc.connect(f);
        osc.start(t);
        lfo.start(t);
        osc.stop(t + dur + 0.05);
        lfo.stop(t + dur + 0.05);
      }
    }
  }

  /** 「ここぉ！」：オーケストラ・ヒット */
  orchestraHit(t: number): void {
    this.brass(t, 0.75, [48, 55, 60, 64, 67, 72, 76], 0.2, { attack: 0.008, wet: 0.6, bright: 6500 });
    this.strings(t, 0.6, [72, 79, 84], 0.05, 0.01);
    this.timpani(t, 0.75, 36);
    this.kick(t, 0.9, 35);
    this.crash(t, 0.22, -0.3);
    this.noise(t, 0.05, { filter: 'highpass', freq: 3000, gain: 0.5 });
  }

  /** 最後の「バーン」：主和音のブラス＋ストリングス＋ティンパニ＋シンバル（スキップ時もこれ） */
  bang(t: number): void {
    this.brass(t, 2.4, [48, 55, 60, 64, 67, 72, 74, 76, 79], 0.2, { attack: 0.012, wet: 0.7, bright: 7000 });
    this.strings(t, 2.6, [60, 64, 67, 72, 76, 84], 0.06, 0.08);
    this.tone(t, 2.2, { type: 'sine', freq: midi(24), gain: 0.5, wet: 0.2 });
    this.timpani(t, 0.9, 36);
    this.kick(t, 1, 30);
    this.crash(t, 0.32, -0.4);
    this.crash(t + 0.03, 0.26, 0.4);
    // 余韻のキラキラ
    [84, 88, 91, 96, 100].forEach((n, i) =>
      this.tone(t + 0.5 + i * 0.07, 0.6, { type: 'triangle', freq: midi(n), gain: 0.06, pan: i % 2 ? 0.4 : -0.4, wet: 0.6 }),
    );
  }
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

interface ScoreEvent {
  at: number;
  play: (s: ShowSound, t: number) => void;
}

/**
 * 演出のタイムライン（config.ts）に合わせた譜面。テンションを段階的に上げていく：
 *  回転（軽いビート＋ドラムロール＋上昇音）→「ここぉ！」オケヒット →
 *  タメ（ティンパニロール＋逆再生シンバル）→ ズーム（4つ打ち、スネアが 8分→16分→32分、段ごとに転調）→
 *  「バ・バーン！」
 */
function score(): ScoreEvent[] {
  const ev: ScoreEvent[] = [];
  const add = (at: number, play: ScoreEvent['play']) => ev.push({ at, play });
  const spinEnd = SHOW.globeIn.end;
  const eighth = 200; // 150BPM

  // ===== A. 回転：軽快なビート、ドラムロール、上昇するアルペジオ =====
  for (let at = 0, i = 0; at < spinEnd - 100; at += eighth, i++) {
    add(at, (s, t) => s.hat(t, i % 2 ? 0.04 : 0.06));
    if (i % 2 === 0) add(at, (s, t) => s.kick(t, 0.5, 50));
    const bass = [36, 36, 43, 36, 39, 41, 43, 46][i % 8];
    add(at, (s, t) => s.tone(t, 0.17, { type: 'square', freq: midi(bass), gain: 0.06, lowpass: 700 }));
  }
  // ドラムロール（回転の速さに合わせて細かく、だんだん強く）
  for (let at = 40; at < spinEnd - 60; ) {
    const k = at / spinEnd;
    add(at, (s, t) => s.snare(t, 0.03 + 0.11 * k, (Math.random() - 0.5) * 0.4));
    at += 75 - 40 * k;
  }
  // 「ギュイーン」：回転とともに音程が上がる
  add(0, (s, t) => {
    s.noise(t, spinEnd / 1000, { filter: 'bandpass', freq: 300, freqEnd: 3200, q: 4, gain: 0.14, attack: 0.3 });
    s.tone(t, spinEnd / 1000, { type: 'sawtooth', freq: midi(48), freqEnd: midi(72), gain: 0.04, lowpass: 2000, attack: 0.2 });
  });
  // きらびやかなアルペジオ（C メジャー、だんだん上へ）
  const arp = [60, 64, 67, 72, 64, 67, 72, 76, 67, 72, 76, 79, 72, 76, 79, 84];
  arp.forEach((n, i) =>
    add(120 + i * 75, (s, t) => s.tone(t, 0.12, { type: 'triangle', freq: midi(n), gain: 0.05, pan: i % 2 ? 0.3 : -0.3, wet: 0.3 })),
  );
  // 止まる「キュッ」
  add(spinEnd - 80, (s, t) => s.tone(t, 0.12, { type: 'sine', freq: 1700, freqEnd: 480, gain: 0.28 }));

  // ===== B. 指「ビシッ」→「ここぉ！」オーケストラ・ヒット =====
  add(SHOW.finger.enter, (s, t) => s.noise(t, 0.16, { filter: 'bandpass', freq: 700, freqEnd: 4000, q: 2, gain: 0.2 }));
  add(SHOW.finger.arrive, (s, t) => {
    s.noise(t, 0.06, { filter: 'highpass', freq: 2800, gain: 0.55 });
    s.tone(t, 0.08, { type: 'square', freq: 2100, freqEnd: 800, gain: 0.12 });
  });
  add(SHOW.callSecond.in, (s, t) => s.orchestraHit(t));

  // ===== C. タメ：ティンパニロールのクレッシェンド＋低い弦のトレモロ＋逆再生シンバル =====
  const pauseDur = SHOW.pause.end - SHOW.pause.start;
  for (let at = SHOW.pause.start; at < SHOW.pause.end - 20; at += 45) {
    const k = (at - SHOW.pause.start) / pauseDur;
    add(at, (s, t) => s.tone(t, 0.14, { freq: midi(31), freqEnd: midi(30), gain: 0.12 + 0.3 * k }));
  }
  add(SHOW.pause.start, (s, t) => {
    s.strings(t, pauseDur / 1000 + 0.1, [36, 37, 43], 0.05, pauseDur / 1000);
    s.noise(t, pauseDur / 1000, { filter: 'highpass', freq: 3000, gain: 0.3, reverse: true, wet: 0.3 });
  });

  // ===== D. ズーム：4つ打ち＋段ごとに転調・細かくなるスネア＋上昇音＋着弾ドーン =====
  const zoomStart = SHOW.stages[0].start;
  const zoomEnd = SHOW.arrival.start;
  const keys = [0, 3, 5]; // C → E♭ → F
  for (let at = zoomStart, i = 0; at < zoomEnd; at += eighth / 2, i++) {
    const stage = SHOW.stages.findIndex((st, j) => at >= st.start && (j === SHOW.stages.length - 1 || at < SHOW.stages[j + 1].start));
    const key = keys[Math.max(0, stage)];
    const k = (at - zoomStart) / (zoomEnd - zoomStart);
    if (i % 4 === 0) add(at, (s, t) => s.kick(t, 0.7, 45));
    add(at, (s, t) => s.hat(t, 0.04 + 0.04 * k, i % 4 === 2));
    if (i % 2 === 0) {
      const n = [36, 36, 48, 36][(i / 2) % 4] + key;
      add(at, (s, t) => s.tone(t, 0.18, { type: 'sawtooth', freq: midi(n), gain: 0.07, lowpass: 600 + 2400 * k }));
    }
  }
  // スネアビルド：段1は8分、段2は16分、段3は32分。だんだん強く
  SHOW.stages.forEach((st, si) => {
    const end = si < SHOW.stages.length - 1 ? SHOW.stages[si + 1].start : zoomEnd;
    const step = [eighth, eighth / 2, eighth / 4][si];
    for (let at = st.start; at < end - 10; at += step) {
      const k = (at - zoomStart) / (zoomEnd - zoomStart);
      add(at, (s, t) => s.snare(t, 0.08 + 0.18 * k, (Math.random() - 0.5) * 0.3));
    }
  });
  SHOW.stages.forEach((st, i) => {
    const big = i === SHOW.stages.length - 1;
    const key = keys[i];
    add(st.start, (s, t) => {
      const d = st.move / 1000;
      s.noise(t, d, { filter: 'bandpass', freq: 400, freqEnd: big ? 8000 : 4000, q: 2.5, gain: big ? 0.32 : 0.22, attack: d * 0.85 });
      s.tone(t, d, { type: 'sawtooth', freq: midi(48 + key), freqEnd: midi(60 + key + (big ? 12 : 0)), gain: 0.05, lowpass: 2500, attack: d * 0.6 });
    });
    add(st.start + st.move, (s, t) => {
      s.kick(t, big ? 1 : 0.85, big ? 28 : 36);
      s.tone(t, big ? 1.1 : 0.55, { type: 'sine', freq: 110, freqEnd: big ? 26 : 38, gain: big ? 0.75 : 0.5 });
      s.noise(t, big ? 0.7 : 0.35, { filter: 'lowpass', freq: 900, gain: big ? 0.38 : 0.24 });
      s.brass(t, big ? 0.5 : 0.28, [48 + key, 55 + key, 60 + key, 64 + key + (i === 1 ? -1 : 0)], big ? 0.14 : 0.1, { attack: 0.01, wet: 0.4 });
      if (big) s.crash(t, 0.22);
    });
  });

  // ===== E. 到着：ピン「ドン」→「バ」（属和音）→「バーン！」（主和音） =====
  const ar = SHOW.arrival;
  add(ar.start, (s, t) => s.tone(t, 0.18, { type: 'sine', freq: 2400, freqEnd: 500, gain: 0.12 }));
  add(ar.pinLand, (s, t) => {
    s.kick(t, 0.85);
    s.timpani(t, 0.5, 31);
  });
  add(ar.cardStart, (s, t) => {
    s.brass(t, 0.16, [55, 59, 62, 67, 71], 0.2, { attack: 0.008, wet: 0.3, bright: 6000 });
    s.snare(t, 0.3);
  });
  // 「バ」と「バーン」の間をつなぐ短いドラムフィル
  for (let at = ar.cardStart + 60; at < ar.cardBang - 20; at += 35) add(at, (s, t) => s.snare(t, 0.18));
  add(ar.cardBang, (s, t) => s.bang(t));
  return ev;
}

/** 軽減モーション時：短い「バーン」だけ */
function reducedScore(): ScoreEvent[] {
  return [{ at: 100, play: (s, t) => s.bang(t) }];
}
