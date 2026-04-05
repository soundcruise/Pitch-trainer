/** アプリの版表示（リリースのたびにここを更新。運用ルールは README_VERSIONS.md 参照） */
const PITCH_TRAINER_APP_VERSION = '1.1.1';

function isPitchTrainerPro() {
    return document.documentElement.dataset.appEdition === 'Pro';
}

function isPitchTrainerBeta() {
    return document.documentElement.dataset.appEdition === 'Beta';
}

/** ルート直下の旧SW（scope が / 全体）が残ると standard/ と Pro 用フォルダが混ざるため解除する */
function unregisterLegacyRootServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => {
            const sw = reg.active || reg.waiting || reg.installing;
            if (!sw) return;
            try {
                const u = new URL(sw.scriptURL);
                const p = u.pathname;
                if (
                    p.endsWith('/standard/service-worker.js') ||
                    p.endsWith('/beta/service-worker.js') ||
                    p.endsWith('/pro_k3m9/service-worker.js')
                ) {
                    return;
                }
                if (p.endsWith('/prok3m9/service-worker.js')) {
                    void reg.unregister();
                    return;
                }
                if (p.endsWith('/pro/service-worker.js')) {
                    void reg.unregister();
                    return;
                }
                if (p.endsWith('/service-worker.js')) {
                    void reg.unregister();
                }
            } catch (_) {
                /* ignore */
            }
        });
    });
}

// AudioEngine Class
class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.baseHz = 440.0;
        this.notes = {};
        this._buildNotes();
        this.currentInstrument = 'acoustic_guitar';
        this.sustainTime = 0.5; // 余韻の長さ（秒）。設定から変更可能。
        this._lastKnownTime = 0;
        this._frozenSince = 0;

        // モバイルブラウザ対策: ユーザー操作でAudioContextを起こすリスナー
        this._setupResumeHandlers();
    }

    _buildNotes() {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.notes = {};
        for (let oct = 2; oct <= 6; oct++) {
            for (let i = 0; i < 12; i++) {
                if (oct === 6 && i > 0) break; // only up to C6
                const noteName = noteNames[i] + oct;
                const midiNote = (oct + 1) * 12 + i;
                this.notes[noteName] = this.baseHz * Math.pow(2, (midiNote - 69) / 12);
            }
        }
    }

    setBaseHz(hz) {
        this.baseHz = parseFloat(hz);
        this._buildNotes();
    }

    _isContextFrozen() {
        if (!this.ctx) return true;
        const t = this.ctx.currentTime;
        if (t !== this._lastKnownTime) {
            this._lastKnownTime = t;
            this._frozenSince = 0;
            return false;
        }
        if (this._frozenSince === 0) {
            this._frozenSince = Date.now();
            return false;
        }
        return Date.now() - this._frozenSince > 300;
    }

    _forceNewContext() {
        try { if (this.ctx) this.ctx.close(); } catch (_) { /* ignore */ }
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._lastKnownTime = 0;
        this._frozenSince = 0;
    }

    /** Safari 等の interrupted 状態も suspended と同様に扱う */
    _needsResume(state) {
        return state === 'suspended' || state === 'interrupted';
    }

    async _resumeIfNeeded() {
        if (!this.ctx || this.ctx.state === 'closed') return;
        if (this._needsResume(this.ctx.state)) {
            await this.ctx.resume();
        }
    }

    /** ページ遷移・リロード直前に呼ぶと、固まったコンテキストの残骸を減らせる */
    closeContextForNavigation() {
        try {
            if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
        } catch (_) { /* ignore */ }
    }

    ensureContext() {
        if (!this.ctx || this.ctx.state === 'closed') {
            this._forceNewContext();
        } else if (this._needsResume(this.ctx.state)) {
            void this.ctx.resume();
        } else if (this._isContextFrozen()) {
            this._forceNewContext();
        }
    }

    async resumeContext() {
        try {
            if (!this.ctx || this.ctx.state === 'closed') {
                this._forceNewContext();
            }
            await this._resumeIfNeeded();
            if (this.ctx.state === 'running' && this._isContextFrozen()) {
                this._forceNewContext();
                await this._resumeIfNeeded();
            }
            const t0 = this.ctx.currentTime;
            await new Promise(r => setTimeout(r, 50));
            if (this.ctx.state === 'running' && this.ctx.currentTime === t0) {
                this._forceNewContext();
                await this._resumeIfNeeded();
            }
            await this._resumeIfNeeded();
        } catch (e) {
            console.warn('PitchTrainer: AudioContext resume failed, forcing new context', e);
            this._forceNewContext();
        }
    }

    _setupResumeHandlers() {
        const tryResume = () => {
            void this.resumeContext();
        };

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this._frozenSince = 0;
                tryResume();
            }
        });
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                this._lastKnownTime = 0;
                this._frozenSince = 0;
            }
            void this.resumeContext();
        });
        window.addEventListener('focus', tryResume);

        const onPageLifecycleResume = () => {
            this._lastKnownTime = 0;
            this._frozenSince = 0;
            void this.resumeContext();
        };
        document.addEventListener('resume', onPageLifecycleResume);
        window.addEventListener('resume', onPageLifecycleResume);

        const resumeOnInteraction = () => {
            void this.resumeContext();
        };
        document.addEventListener('touchstart', resumeOnInteraction, { passive: true });
        document.addEventListener('touchend', resumeOnInteraction, { passive: true });
        document.addEventListener('pointerdown', resumeOnInteraction, { passive: true });
        document.addEventListener('click', resumeOnInteraction);
    }

    playNote(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        // Delegate to instrument-specific method
        switch (this.currentInstrument) {
            case 'piano': return this.playPiano(noteName, duration, time, keyOffset);
            case 'violin': return this.playViolin(noteName, duration, time, keyOffset);
            case 'electric_guitar': return this.playElectricGuitar(noteName, duration, time, keyOffset);
            case 'acoustic_guitar':
            default: return this.playAcousticGuitar(noteName, duration, time, keyOffset);
        }
    }

    /**
     * Karplus-Strong アコースティックギター音源
     *
     * アルゴリズム概要:
     *   1. ホワイトノイズバーストを励起信号として使用（ピックのひっかかりを再現）
     *   2. ディレイライン + ローパスフィルタのフィードバックループで弦の振動を合成
     *   3. JavaScriptで直接バッファを生成 → AudioBufferSourceNodeで再生（低レイテンシ）
     *
     * @param {string} noteName  - 音名 (例: "A4")
     * @param {number} duration  - 発音時間（秒）
     * @param {number} time      - 再生開始時刻（AudioContext時間）
     * @param {number} keyOffset - 半音単位のキートランスポーズ
     * @param {number} velocity  - 弾く強さ 0.0〜1.0 (省略時 0.7)
     */
    playAcousticGuitar(noteName, duration = 1.0, time = 0, keyOffset = 0, velocity = 0.7) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        // ── 1. 周波数の決定 ──────────────────────────────────────────
        // キートランスポーズ + わずかなデチューン（±0.15%）で機械的な正確さを排除
        const detuneRatio = 1 + (Math.random() - 0.5) * 0.003;
        const freq = frequency * Math.pow(2, keyOffset / 12) * detuneRatio;

        // ── 2. Karplus-Strong バッファ生成 ───────────────────────────
        const sampleRate = this.ctx.sampleRate;

        // バッファ長 = duration（発音期間）+ sustainTime（余韻）
        // duration はシーケンス再生のタイミング制御に必要なので含める
        const sustainSamples = Math.ceil(sampleRate * this.sustainTime);
        const totalSamples = Math.ceil(sampleRate * (duration + this.sustainTime));

        // ディレイライン長 = サンプルレート / 周波数（1周期分）
        const delayLength = Math.max(2, Math.round(sampleRate / freq));

        // 出力バッファ（モノラル）
        const output = new Float32Array(totalSamples);

        // ── 2a. 励起信号: ホワイトノイズバースト ──────────────────────
        const excitationAmplitude = 0.5 + velocity * 0.5;
        const delayLine = new Float32Array(delayLength);
        for (let i = 0; i < delayLength; i++) {
            delayLine[i] = (Math.random() * 2 - 1) * excitationAmplitude;
        }

        // ── 2b. ローパスフィルタ係数 ──────────────────────────────────
        const filterCoeff = 0.40 + velocity * 0.20;

        // ── 2c. 弦の減衰係数（sustainSamples で正確に逆算） ─────────────
        // 目標: sustainTime 秒分のサンプル後に振幅が -60dB（1/1000）になる
        //   decayFactor ^ sustainSamples = 0.001
        //   → decayFactor = 0.001 ^ (1 / sustainSamples)
        // ※ バッファ全体（duration+sustainTime）ではなく sustainTime 分で計算
        //   することで、スライダーの値が実際の余韻の長さと一致する
        // 周波数補正: 高音ほど最大5%速く減衰（自然な弦の特性）
        const freqDecayCorrection = 1.0 - (freq / 8000) * 0.05;
        const decayFactor = Math.pow(0.001, 1 / sustainSamples) * freqDecayCorrection;

        // ── 2d. フィードバックループ ──────────────────────────────────
        let writePos = 0;
        let prevSample = 0;

        for (let n = 0; n < totalSamples; n++) {
            const currentSample = delayLine[writePos];
            const filtered = filterCoeff * currentSample + (1 - filterCoeff) * prevSample;
            prevSample = currentSample;
            delayLine[writePos] = filtered * decayFactor;
            output[n] = currentSample;
            writePos = (writePos + 1) % delayLength;
        }

        // ピックアタック（ごく短いノイズ）で弾き始めを自然に
        const pickSamples = Math.min(Math.ceil(sampleRate * 0.006), totalSamples);
        for (let n = 0; n < pickSamples; n++) {
            const env = Math.exp(-n / Math.max(1, sampleRate * 0.0018));
            output[n] += (Math.random() * 2 - 1) * (0.055 + velocity * 0.06) * env;
        }

        // ── 2e. 末尾フェードアウト（ブツ切れ防止） ───────────────────
        const fadeStartSample = Math.floor(totalSamples * 0.80);
        for (let n = fadeStartSample; n < totalSamples; n++) {
            const t = (n - fadeStartSample) / (totalSamples - fadeStartSample);
            output[n] *= 0.5 * (1 + Math.cos(Math.PI * t));
        }

        // ── 3. AudioBuffer に変換 ────────────────────────────────────
        const audioBuffer = this.ctx.createBuffer(1, totalSamples, sampleRate);
        audioBuffer.copyToChannel(output, 0);

        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;

        // ── 4. ボディ共鳴フィルタ（箱鳴りのシミュレーション） ─────────
        // ギターボディの低域共鳴（80〜200Hz付近）を再現

        // 低域共鳴 1: ~100Hz（ボディの主共鳴）
        const bodyRes1 = this.ctx.createBiquadFilter();
        bodyRes1.type = 'peaking';
        bodyRes1.frequency.value = 100;
        bodyRes1.Q.value = 1.5;
        bodyRes1.gain.value = 4; // +4dB

        // 低域共鳴 2: ~180Hz（ヘルムホルツ共鳴 / サウンドホール）
        const bodyRes2 = this.ctx.createBiquadFilter();
        bodyRes2.type = 'peaking';
        bodyRes2.frequency.value = 180;
        bodyRes2.Q.value = 2.0;
        bodyRes2.gain.value = 3; // +3dB

        // 低域 3: ~240Hz（胴の厚み）
        const bodyRes3 = this.ctx.createBiquadFilter();
        bodyRes3.type = 'peaking';
        bodyRes3.frequency.value = 240;
        bodyRes3.Q.value = 1.2;
        bodyRes3.gain.value = 1.8;

        // 中域プレゼンス（弦の倍音を引き立てる ~2kHz）
        const presence = this.ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 2000;
        presence.Q.value = 1.0;
        presence.gain.value = 2; // +2dB

        // 高域ロールオフ（ギターらしい丸みを出す）
        const highCut = this.ctx.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 6000;
        highCut.Q.value = 0.7;

        // ── 5. 出力ゲイン ─────────────────────────────────────────────
        const outputGain = this.ctx.createGain();
        outputGain.gain.value = 0.25 + velocity * 0.35; // velocity: 0→0.25, 1→0.60

        // ── 6. ノード接続 ─────────────────────────────────────────────
        // source → bodyRes1 → bodyRes2 → bodyRes3 → presence → highCut → outputGain → destination
        source.connect(bodyRes1);
        bodyRes1.connect(bodyRes2);
        bodyRes2.connect(bodyRes3);
        bodyRes3.connect(presence);
        presence.connect(highCut);
        highCut.connect(outputGain);
        outputGain.connect(this.ctx.destination);

        // ── 7. 再生 ───────────────────────────────────────────────────
        const startTime = time || this.ctx.currentTime;
        source.start(startTime);
        source.stop(startTime + duration + this.sustainTime);
    }

    playChord(chordName, octave = 3, duration = 1.0, time = 0, keyOffset = 0, voicing = null) {
        this.ensureContext();

        const chordIntervals = {
            'C': ['C', 'E', 'G'],
            'F': ['F', 'A', 'C'],
            'G': ['G', 'B', 'D'],
            'Am': ['A', 'C', 'E'],
            'Dm': ['D', 'F', 'A'],
            'Em': ['E', 'G', 'B']
        };

        const intervals = chordIntervals[chordName];
        if (!intervals) return;

        // voicing: array of indices to play (e.g. [0, 1] for Root+3rd)
        // if null/undefined, play all notes
        const notesToPlay = voicing
            ? voicing.map(i => intervals[i]).filter(n => n !== undefined)
            : intervals;

        notesToPlay.forEach(note => {
            let noteOctave = octave;
            // Handle notes that wrap to next octave
            // Logic: if note is lower than root in sequence (C-B), bump octave? 
            // Simplified logic based on previous implementation:
            if (chordName === 'F' && note === 'C') noteOctave++;
            if (chordName === 'G' && note === 'D') noteOctave++;
            if (chordName === 'Am' && note === 'C') noteOctave++;
            if (chordName === 'Am' && note === 'E') noteOctave++;
            if (chordName === 'Dm' && note === 'D') { /* No octave bump needed for root pos */ }
            if (chordName === 'Em' && note === 'E') { /* No octave bump needed for root pos */ }
            this.playNote(note + noteOctave, duration, time, keyOffset);
        });
    }

    playCustomChord(chordObj, octave = 3, duration = 1.0, time = 0, keyOffset = 0) {
        if (!chordObj) return;
        this.ensureContext();

        const rootNoteIndex = parseInt(chordObj.root);
        const intervals = [0]; // Root is always 0 relative to itself

        if (chordObj.third !== 'null') intervals.push(parseInt(chordObj.third));
        if (chordObj.fifth !== 'null') intervals.push(parseInt(chordObj.fifth));
        if (chordObj.seventh !== 'null') intervals.push(parseInt(chordObj.seventh));

        if (chordObj.tensions) {
            chordObj.tensions.forEach(t => intervals.push(parseInt(t)));
        }

        // Sort intervals by pitch
        intervals.sort((a, b) => a - b);

        // Apply inversions by shifting the lowest note up an octave (12 semitones)
        const inversion = parseInt(chordObj.inversion || 0);
        for (let i = 0; i < inversion; i++) {
            if (intervals.length > 0) {
                const lowest = intervals.shift();
                intervals.push(lowest + 12);
            }
        }
        intervals.sort((a, b) => a - b); // Re-sort after inversion

        const notesScale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Play each note
        intervals.forEach(interval => {
            const totalSemitones = rootNoteIndex + interval;
            const extraOctaves = Math.floor(totalSemitones / 12);

            let noteIndex = totalSemitones % 12;
            if (noteIndex < 0) noteIndex += 12; // Handle negative if necessary

            const noteName = notesScale[noteIndex];
            const noteOctave = octave + extraOctaves;

            this.playNote(noteName + noteOctave, duration, time, keyOffset);
        });
    }

    playPiano(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        const f0 = frequency * Math.pow(2, keyOffset / 12);
        const now = time || this.ctx.currentTime;
        const end = now + duration + this.sustainTime;

        const master = this.ctx.createGain();
        master.gain.value = 0.64;
        const tone = this.ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.Q.value = 0.65;
        master.connect(tone);
        tone.connect(this.ctx.destination);

        const envPartial = (freqHz, peak, quickLevel, sustainLevel) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freqHz;
            const g = this.ctx.createGain();
            osc.connect(g);
            g.connect(master);
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(peak, now + 0.0025);
            g.gain.exponentialRampToValueAtTime(Math.max(quickLevel, 0.0001), now + 0.042);
            g.gain.exponentialRampToValueAtTime(Math.max(sustainLevel, 0.0001), now + duration * 0.52);
            g.gain.exponentialRampToValueAtTime(0.0001, end);
            osc.start(now);
            osc.stop(end);
        };

        // 基音をわずかにずらした2本（複弦のうねり）
        const det = Math.pow(2, 0.85 / 1200);
        envPartial(f0, 0.24, 0.33, 0.085);
        envPartial(f0 * det, 0.24, 0.33, 0.085);

        // 高次倍音ほどアタックで強く、すぐ減る
        const highs = [
            { n: 2, peak: 0.25, quick: 0.12, tail: 0.052 },
            { n: 3, peak: 0.14, quick: 0.053, tail: 0.026 },
            { n: 4, peak: 0.066, quick: 0.023, tail: 0.013 },
            { n: 5, peak: 0.033, quick: 0.009, tail: 0.0065 },
            { n: 6, peak: 0.017, quick: 0.004, tail: 0.0032 }
        ];
        highs.forEach(p => envPartial(f0 * p.n, p.peak, p.quick, p.tail));

        tone.frequency.setValueAtTime(Math.min(11000, f0 * 13), now);
        tone.frequency.exponentialRampToValueAtTime(Math.min(7200, f0 * 8.5), now + 0.038);
        tone.frequency.exponentialRampToValueAtTime(Math.max(2000, f0 * 3.6), now + duration * 0.42);
    }

    playViolin(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        const f0 = frequency * Math.pow(2, keyOffset / 12);
        const now = time || this.ctx.currentTime;
        const end = now + duration + this.sustainTime;

        const master = this.ctx.createGain();
        master.gain.value = 0.62;
        master.connect(this.ctx.destination);

        const osc = this.ctx.createOscillator();
        const oscLo = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const body = this.ctx.createBiquadFilter();
        const gainNode = this.ctx.createGain();
        const vibrato = this.ctx.createOscillator();
        const vibratoGain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.value = f0;
        oscLo.type = 'triangle';
        oscLo.frequency.value = f0 * 0.5;
        const loG = this.ctx.createGain();
        loG.gain.value = 0.32;
        oscLo.connect(loG);
        loG.connect(filter);

        vibrato.frequency.value = 5.2;
        vibratoGain.gain.setValueAtTime(0, now);
        vibratoGain.gain.linearRampToValueAtTime(f0 * 0.0055, now + 0.09);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);

        filter.type = 'bandpass';
        filter.Q.value = 2.4;
        filter.frequency.setValueAtTime(Math.max(550, f0 * 1.1), now);
        filter.frequency.exponentialRampToValueAtTime(Math.min(3200, f0 * 5.5), now + 0.11);
        filter.frequency.exponentialRampToValueAtTime(Math.min(2400, f0 * 4.2), now + duration * 0.65);

        body.type = 'peaking';
        body.frequency.value = 280;
        body.Q.value = 0.9;
        body.gain.value = 2.5;

        osc.connect(filter);
        filter.connect(body);
        body.connect(gainNode);
        gainNode.connect(master);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.4, now + 0.055);
        gainNode.gain.setValueAtTime(0.37, now + duration);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

        // 弓の摩擦ノイズ（アタックのみ）
        const sr = this.ctx.sampleRate;
        const nLen = Math.ceil(0.055 * sr);
        const nBuf = this.ctx.createBuffer(1, nLen, sr);
        const nd = nBuf.getChannelData(0);
        for (let i = 0; i < nLen; i++) nd[i] = (Math.random() * 2 - 1) * 0.45;
        const nSrc = this.ctx.createBufferSource();
        nSrc.buffer = nBuf;
        const nHp = this.ctx.createBiquadFilter();
        nHp.type = 'highpass';
        nHp.frequency.value = 1800;
        const nG = this.ctx.createGain();
        nSrc.connect(nHp);
        nHp.connect(nG);
        nG.connect(master);
        nG.gain.setValueAtTime(0, now);
        nG.gain.linearRampToValueAtTime(0.058, now + 0.012);
        nG.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
        nSrc.start(now);
        nSrc.stop(now + 0.056);

        vibrato.start(now);
        oscLo.start(now);
        osc.start(now);
        vibrato.stop(end);
        oscLo.stop(end);
        osc.stop(end);
    }

    playElectricGuitar(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        const f0 = frequency * Math.pow(2, keyOffset / 12);
        const now = time || this.ctx.currentTime;
        const end = now + duration + this.sustainTime;

        const mix = this.ctx.createGain();
        mix.gain.value = 0.34;

        const oscSaw = this.ctx.createOscillator();
        const oscSq = this.ctx.createOscillator();
        oscSaw.type = 'sawtooth';
        oscSq.type = 'square';
        oscSaw.frequency.value = f0;
        oscSq.frequency.value = f0;
        const gSaw = this.ctx.createGain();
        const gSq = this.ctx.createGain();
        gSaw.gain.value = 0.62;
        gSq.gain.value = 0.28;
        oscSaw.connect(gSaw);
        oscSq.connect(gSq);
        gSaw.connect(mix);
        gSq.connect(mix);

        const distortion = this.ctx.createWaveShaper();
        const curve = new Float32Array(512);
        for (let i = 0; i < 512; i++) {
            const x = (i - 256) / 256;
            curve[i] = Math.tanh(x * 2.35) * 0.92 + Math.sign(x) * 0.04 * (1 - Math.exp(-Math.abs(x) * 4));
        }
        distortion.curve = curve;
        distortion.oversample = '2x';

        const pre = this.ctx.createBiquadFilter();
        pre.type = 'peaking';
        pre.frequency.value = 420;
        pre.Q.value = 0.85;
        pre.gain.value = -5;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.85;
        filter.frequency.setValueAtTime(7200, now);
        filter.frequency.exponentialRampToValueAtTime(2400, now + 0.08);
        filter.frequency.exponentialRampToValueAtTime(1500, now + duration * 0.5);

        const air = this.ctx.createBiquadFilter();
        air.type = 'highshelf';
        air.frequency.value = 2800;
        air.gain.value = -2.5;

        const gainNode = this.ctx.createGain();

        mix.connect(distortion);
        distortion.connect(pre);
        pre.connect(filter);
        filter.connect(air);
        air.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.26, now + 0.004);
        gainNode.gain.setValueAtTime(0.24, now + duration);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

        oscSaw.start(now);
        oscSq.start(now);
        oscSaw.stop(end);
        oscSq.stop(end);
    }
}


// Game Class
class Game {
    constructor() {
        this.audio = new AudioEngine();
        this.currentSequence = [];
        this.previousSequenceKeys = []; // Track last 2 questions to prevent 3 consecutive duplicates
        this.inputIndex = 0;
        this.stage = 1;
        this.baseHz = 440; // Default reference frequency
        this.baseOctave = 3; // Default to octave 3
        this.keyOffset = 0; // Semitones from C (0=C, 1=C#, 2=D, etc.)
        this.instrument = 'acoustic_guitar'; // Default instrument
        this.score = 0;
        this.streak = 0;
        this.isPlaying = false;
        this.isBlockingInput = false;
        this.isRoundOver = false;
        this.scaleEnabled = true; // 問題前の音階再生フラグ
        this.noteSpeed = 1.0;    // 問題の再生スピード（0.5～2.0）
        this.lastCategory = 'screen-melody'; // 最後に選んだカテゴリ画面
        this.isAnswerMode = true; // 回答モード (true: 回答する, false: 音確認のみ)
        this.notationStyle = 'doremi'; // Added notation preference
        // Dictionary for Note naming
        this.doremiMap = {
            'C': 'ド', 'C#': 'ド#', 'D': 'レ', 'D#': 'レ#',
            'E': 'ミ', 'F': 'ファ', 'F#': 'ファ#', 'G': 'ソ',
            'G#': 'ソ#', 'A': 'ラ', 'A#': 'ラ#', 'B': 'シ'
        };
        this.chordDegreeMap = {
            'C': 'Ⅰ', 'Dm': 'Ⅱm', 'Em': 'Ⅲm', 'F': 'Ⅳ', 'G': 'Ⅴ', 'Am': 'Ⅵm'
        };
        this.chordPatternMode = 'progression'; // 'random' または 'progression'
        this.proQuestionMode = 'chords'; // 'chords' or 'progressions'
        /** Proメロディ: 変化音を ♯ / ♭ どちらで見せるか（内部キーは常に C# 形式） */
        this.proAccidentalDisplay = 'sharp';
        this.proSharpToFlatLetter = { 'C#': 'D♭', 'D#': 'E♭', 'F#': 'G♭', 'G#': 'A♭', 'A#': 'B♭' };
        this.proSolfegeFlatBySharpNote = { 'C#': 'レ♭', 'D#': 'ミ♭', 'F#': 'ソ♭', 'G#': 'ラ♭', 'A#': 'シ♭' };
        this.loadProMelodyAccidentalPref();
        this.customChords = []; // User-defined Pro chords
        this.customProgressions = []; // User-defined Pro progressions
        this.naturalNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

        this.naturalNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        this.noteToSolfege = {
            'C': 'ド', 'C#': 'ド#', 'D': 'レ', 'D#': 'レ#', 'E': 'ミ', 'F': 'ファ',
            'F#': 'ファ#', 'G': 'ソ', 'G#': 'ソ#', 'A': 'ラ', 'A#': 'ラ#', 'B': 'シ'
        };

        // ステージ設定テーブル
        this.stageConfig = {
            1: { pool: ['C', 'E', 'G'], count: 1, label: 'Stage 1', description: 'ドミソ' },
            2: { pool: ['C', 'E', 'G', 'B'], count: 1, label: 'Stage 2', description: 'ドミソシ' },
            3: { pool: ['C', 'E', 'F', 'G', 'B'], count: 1, label: 'Stage 3', description: 'ドミファソシ' },
            4: { pool: this.naturalNotes, count: 1, label: 'Stage 4', description: '1音 (全７音)' },
            5: { pool: this.naturalNotes, count: 2, label: 'Stage 5', description: '2音 (全７音)' },
            6: { pool: this.naturalNotes, count: 4, label: 'Stage 6', description: '4音 (全７音)' },
            // Chord Stages
            101: { pool: ['C', 'F', 'G'], count: 4, isChord: true, chordVoicing: [0, 2], label: 'Stage 1', description: 'C, F, G (2和音)' },
            102: { pool: ['C', 'F', 'G'], count: 4, isChord: true, chordVoicing: [0, 1, 2], label: 'Stage 2', description: 'C, F, G (3和音)' },
            103: { pool: ['C', 'F', 'G', 'Am'], count: 4, isChord: true, chordVoicing: [0, 2], label: 'Stage 3', description: 'C, F, G, Am (2和音)' },
            104: { pool: ['C', 'F', 'G', 'Am'], count: 4, isChord: true, chordVoicing: [0, 1, 2], label: 'Stage 4', description: 'C, F, G, Am (3和音)' },
            105: { pool: ['C', 'F', 'G', 'Am', 'Dm', 'Em'], count: 4, isChord: true, chordVoicing: [0, 2], label: 'Stage 5', description: 'C, F, G, Am, Dm, Em (2和音)' },
            106: { pool: ['C', 'F', 'G', 'Am', 'Dm', 'Em'], count: 4, isChord: true, chordVoicing: [0, 1, 2], label: 'Stage 6', description: 'C, F, G, Am, Dm, Em (3和音)' },
            // Pro Stage (ID 99) - Default settings, overwritten by UI
            99: { pool: this.naturalNotes, count: 4, label: 'Pro Stage', description: 'カスタム設定' },
            // Chord Pro Stage (ID 199)
            199: { pool: ['C', 'F', 'G', 'Am', 'Dm', 'Em'], count: 4, isChord: true, chordVoicing: [0, 1, 2], label: 'Pro Stage', description: 'カスタム設定' }
        };

        // DOM Elements
        this.overlay = document.getElementById('overlay');
        this.settingsModal = document.getElementById('settings-modal');
        this.overlay = document.getElementById('overlay');
        this.settingsModal = document.getElementById('settings-modal');
        this.comboEl = document.getElementById('combo');
        // this.scoreEl = document.getElementById('score'); // Deprecated
        // this.streakEl = document.getElementById('streak'); // Deprecated
        this.feedbackEl = document.getElementById('feedback');
        this.noteButtonsContainer = document.querySelector('.note-buttons');
        this.chordButtonsContainer = document.querySelector('.chord-buttons');
        this.noteBtns = document.querySelectorAll('.note-btn');
        this.chordBtns = document.querySelectorAll('.chord-btn');

        // Settings elements
        this.currentOctaveEl = document.getElementById('current-octave');
        this.keySelector = document.getElementById('key-selector');
        this.instrumentSelector = document.getElementById('instrument-selector');
        this.notationSelector = document.getElementById('notation-selector');
        this.proChordSettingsModal = document.getElementById('pro-settings-modal-chord');

        this.loadCustomData(); // Initialize with localStorage or defaults
        this.loadSettings();   // Initialize general settings from localStorage

        // Event Listeners
        document.querySelectorAll('[data-stage]:not(.custom-stage-btn)').forEach(btn => {
            btn.addEventListener('click', (e) => this.startGame(parseInt(e.currentTarget.dataset.stage)));
        });

        if (document.getElementById('stage-select-btn')) document.getElementById('stage-select-btn').addEventListener('click', () => this.showStageSelector());
        if (document.getElementById('top-btn')) document.getElementById('top-btn').addEventListener('click', () => this.showHomeScreen());
        if (document.getElementById('replay-btn')) document.getElementById('replay-btn').addEventListener('click', () => this.replaySequence());
        if (document.getElementById('tonic-btn')) document.getElementById('tonic-btn').addEventListener('click', () => this.playTonic());
        if (document.getElementById('scale-btn')) document.getElementById('scale-btn').addEventListener('click', () => this.playScaleManual());

        // Settings button（ゲーム中ヘッダー）
        if (document.getElementById('settings-btn')) document.getElementById('settings-btn').addEventListener('click', () => this.openSettingsModal());

        // Settings button（トップページ）
        if (document.getElementById('home-settings-btn')) document.getElementById('home-settings-btn').addEventListener('click', () => this.openSettingsModal());

        // Settings button（メロディ選択画面）
        if (document.getElementById('melody-settings-btn')) document.getElementById('melody-settings-btn').addEventListener('click', () => this.openSettingsModal());

        // Settings button（コード選択画面）
        if (document.getElementById('chord-settings-btn')) document.getElementById('chord-settings-btn').addEventListener('click', () => this.openSettingsModal());

        // カテゴリカード → ステージ選択画面
        const showScreen = (screenId) => {
            ['screen-home', 'screen-melody', 'screen-chord'].forEach(id => {
                if (document.getElementById(id)) document.getElementById(id).classList.add('hidden');
            });
            if (document.getElementById(screenId)) document.getElementById(screenId).classList.remove('hidden');
        };

        if (document.getElementById('btn-category-melody')) document.getElementById('btn-category-melody').addEventListener('click', () => {
            this.lastCategory = 'screen-melody';
            showScreen('screen-melody');
        });
        if (document.getElementById('btn-category-chord')) document.getElementById('btn-category-chord').addEventListener('click', () => {
            this.lastCategory = 'screen-chord';
            showScreen('screen-chord');
        });
        // 戻るボタン → ホーム画面
        if (document.getElementById('btn-back-melody')) document.getElementById('btn-back-melody').addEventListener('click', () => showScreen('screen-home'));
        if (document.getElementById('btn-back-chord')) document.getElementById('btn-back-chord').addEventListener('click', () => showScreen('screen-home'));

        if (document.getElementById('confirm-settings')) {
            document.getElementById('confirm-settings').addEventListener('click', () => this.hideSettingsModal());
        }
        if (document.getElementById('cancel-settings')) {
            document.getElementById('cancel-settings').addEventListener('click', () => {
                if (this._settingsModalSnapshot) {
                    this.applySettingsModalData(this._settingsModalSnapshot);
                }
                this.hideSettingsModal();
            });
        }

        // Octave controls
        if (isPitchTrainerPro()) {
            if (document.getElementById('octave-down')) {
                document.getElementById('octave-down').addEventListener('click', () => this.updateOctave(-1));
            }
            if (document.getElementById('octave-up')) {
                document.getElementById('octave-up').addEventListener('click', () => this.updateOctave(1));
            }
            if (this.keySelector) {
                this.keySelector.addEventListener('change', (e) => this.updateKey(parseInt(e.target.value, 10)));
            }
        }

        // Instrument selector
        if (this.instrumentSelector) {
            this.instrumentSelector.addEventListener('change', (e) => this.updateInstrument(e.target.value));
        }

        // Language selector

        // Reset button
        if (document.getElementById('reset-settings')) document.getElementById('reset-settings').addEventListener('click', () => this.resetToDefaults());

        // 基準周波数・余韻・問題スピードは Pro 版のみ操作可能
        const hzSlider = document.getElementById('hz-slider');
        const hzDisplay = document.getElementById('current-hz') || document.getElementById('hz-value');
        if (hzSlider && isPitchTrainerPro()) {
            hzSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.audio.setBaseHz(val);
                if (hzDisplay) hzDisplay.textContent = val;
                this.saveSettings();
            });
        }

        const sustainSlider = document.getElementById('sustain-slider');
        const sustainValue = document.getElementById('sustain-value');
        if (sustainSlider && isPitchTrainerPro()) {
            sustainSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.audio.sustainTime = val;
                if (sustainValue) sustainValue.textContent = val.toFixed(1);
                this.saveSettings();
            });
        }

        // 音を確認ボタン
        if (document.getElementById('preview-sound')) document.getElementById('preview-sound').addEventListener('click', () => this.previewSound());

        // 音名表記変更リスナー
        if (this.notationSelector) {
            this.notationSelector.addEventListener('change', (e) => {
                this.updateNotation(e.target.value);
            });
        }

        // 音階ON/OFFトグル
        if (document.getElementById('scale-toggle')) document.getElementById('scale-toggle').addEventListener('change', (e) => {
            this.scaleEnabled = e.target.checked;
            this.saveSettings();
        });

        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        if (speedSlider && isPitchTrainerPro()) {
            speedSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.noteSpeed = val;
                if (speedValue) speedValue.textContent = val.toFixed(1);
                this.saveSettings();
            });
        }

        // 回答モード切替（トグルスイッチ）
        const answerToggle = document.getElementById('answer-mode-toggle');
        if (answerToggle) answerToggle.addEventListener('change', (e) => {
            this.toggleAnswerMode(e.target.checked);
            this.saveSettings();
        });

        this.chordBtns.forEach(btn => {
            btn.addEventListener('mousedown', (e) => this.handleInput(e.target.dataset.chord));
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleInput(e.target.dataset.chord);
            });
        });

        // --- Pro Stage Logic ---
        this.proSettingsModal = document.getElementById('screen-pro-settings');

        if (document.getElementById('btn-level-pro')) document.getElementById('btn-level-pro').addEventListener('click', () => {
            if (this.proSettingsModal) {
                this.syncProAccidentalToggleUi();
                this.refreshProNoteToggleLabels();
                this.proSettingsModal.classList.remove('hidden');
            }
        });

        // Cancel Pro Settings
        if (document.getElementById('btn-cancel-pro')) document.getElementById('btn-cancel-pro').addEventListener('click', () => {
            if (this.proSettingsModal) this.proSettingsModal.classList.add('hidden');
        });

        if (document.getElementById('btn-start-pro')) {
            document.getElementById('btn-start-pro').addEventListener('click', () => this.confirmProMelodySettings());
        }
        if (document.getElementById('btn-reset-pro-melody')) {
            document.getElementById('btn-reset-pro-melody').addEventListener('click', () => this.resetProMelodySettingsToDefaults());
        }

        const inGameProBtn = document.getElementById('in-game-pro-settings-btn');
        if (inGameProBtn) {
            inGameProBtn.addEventListener('click', () => this.openInGameProSettings());
        }

        // Pro Count Slider Logic
        const proCountSlider = document.getElementById('pro-count-slider');
        const proCountValue = document.getElementById('pro-count-value');
        if (proCountSlider) {
            proCountSlider.addEventListener('input', (e) => {
                const val = e.target.value;
                if (proCountValue) proCountValue.textContent = val;
            });
        }

        // Scale Preset Logic
        const presetSelect = document.getElementById('scale-preset-select');
        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                this.applyScalePreset(e.target.value);
            });
            this.applyScalePreset(presetSelect.value); // App load initializer
        }

        const answerMethodSelect = document.getElementById('pro-answer-method');
        if (answerMethodSelect) {
            answerMethodSelect.addEventListener('change', () => this.refreshProNoteToggleLabels());
        }

        const proAccToggle = document.getElementById('pro-accidental-toggle');
        if (proAccToggle) {
            proAccToggle.addEventListener('change', () => {
                this.proAccidentalDisplay = proAccToggle.checked ? 'flat' : 'sharp';
                this.saveProMelodyAccidentalPref();
                this.refreshProNoteToggleLabels();
            });
        }
        this.syncProAccidentalToggleUi();
        if (answerMethodSelect) {
            answerMethodSelect.dispatchEvent(new Event('change'));
        }

        // Chord Pattern Mode Toggle (Random vs Progression)
        document.querySelectorAll('input[name="chord-pattern-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.chordPatternMode = e.target.value;
            });
        });

        // --- Chord Pro Stage Logic (Advanced Builder) ---
        this.chordEditorModal = document.getElementById('chord-editor-modal');

        if (document.getElementById('btn-level-pro-chord')) document.getElementById('btn-level-pro-chord').addEventListener('click', () => {
            this.renderCustomChordList();
            if (this.renderCustomProgressionList) this.renderCustomProgressionList();
            if (this.proChordSettingsModal) this.proChordSettingsModal.classList.remove('hidden');
        });

        if (document.getElementById('btn-cancel-pro-chord')) document.getElementById('btn-cancel-pro-chord').addEventListener('click', () => {
            if (this.proChordSettingsModal) this.proChordSettingsModal.classList.add('hidden');
        });

        const btnStartProChord = document.getElementById('btn-start-pro-chord');
        const handleConfirmProChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            this.confirmProChordSettings();
        };
        if (btnStartProChord) {
            btnStartProChord.addEventListener('click', handleConfirmProChord);
            btnStartProChord.addEventListener('touchstart', handleConfirmProChord, { passive: false });
        }
        if (document.getElementById('btn-reset-pro-chord')) {
            document.getElementById('btn-reset-pro-chord').addEventListener('click', () => this.resetProChordSettingsToDefaults());
        }

        // Expand/Collapse Chord List
        const btnExpandList = document.getElementById('btn-expand-chord-list');
        const listDiv = document.getElementById('pro-custom-chord-list');
        const handleExpandList = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (listDiv) {
                listDiv.classList.toggle('expanded');
                if (listDiv.classList.contains('expanded')) {
                    btnExpandList.textContent = '一部表示 ▲';
                } else {
                    btnExpandList.textContent = '全件表示 ▼';
                }
            }
        };
        if (btnExpandList) {
            btnExpandList.addEventListener('click', handleExpandList);
            btnExpandList.addEventListener('touchstart', handleExpandList, { passive: false });
        }

        // Editor UI
        const btnAddChord = document.getElementById('btn-add-custom-chord');
        const handleAddChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (this.customChords.length >= 50) {
                alert("登録できるコードは最大50個までです。");
                return;
            }
            this.openChordEditor();
        };
        if (btnAddChord) {
            btnAddChord.addEventListener('click', handleAddChord);
            btnAddChord.addEventListener('touchstart', handleAddChord, { passive: false });
        }

        const btnCancelEditor = document.getElementById('btn-cancel-editor');
        const handleCancelEditor = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (this.chordEditorModal) this.chordEditorModal.classList.add('hidden');
        };
        if (btnCancelEditor) {
            btnCancelEditor.addEventListener('click', handleCancelEditor);
            btnCancelEditor.addEventListener('touchstart', handleCancelEditor, { passive: false });
        }

        const btnSaveChord = document.getElementById('btn-save-chord');
        const handleSaveChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            this.saveChordFromEditor();
        };
        if (btnSaveChord) {
            btnSaveChord.addEventListener('click', handleSaveChord);
            btnSaveChord.addEventListener('touchstart', handleSaveChord, { passive: false });
        }

        const btnPreviewChord = document.getElementById('btn-preview-chord');
        const handlePreviewChord = async (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            const chordData = this.readChordEditorState();
            await this.audio.resumeContext();
            this.audio.playCustomChord(chordData, this.baseOctave, 1.5, 0, this.keyOffset);

            // Add playing class for visual feedback
            if (btnPreviewChord) {
                btnPreviewChord.classList.add('playing');
                setTimeout(() => btnPreviewChord.classList.remove('playing'), 600);
            }
        };
        if (btnPreviewChord) {
            btnPreviewChord.addEventListener('click', handlePreviewChord);
            btnPreviewChord.addEventListener('touchstart', handlePreviewChord, { passive: false });
        }

        // Listen for editor changes to update preview name dynamically
        const editorInputs = this.chordEditorModal ? this.chordEditorModal.querySelectorAll('select, input') : [];
        editorInputs.forEach(input => {
            input.addEventListener('change', () => {
                const chordData = this.readChordEditorState();
                const previewName = document.getElementById('chord-preview-name');
                if (previewName) previewName.textContent = this.generateChordName(chordData);
            });
        });

        // Default Presets Button
        if (document.getElementById('btn-preset-custom-chord')) {
            document.getElementById('btn-preset-custom-chord').addEventListener('click', () => {
                if (confirm('カスタムコードの設定をデフォルトに戻しますか？')) {
                    this.loadDefaultCustomChords();
                    this.saveCustomData();
                    this.renderCustomChordList();
                    this.renderCustomProgressionList(); // Call this when implemented
                }
            });
        }

        if (document.getElementById('btn-preset-custom-progression')) {
            console.log("Attached btn-preset-custom-progression click handler");
            document.getElementById('btn-preset-custom-progression').addEventListener('click', () => {
                console.log("btn-preset-custom-progression clicked");
                if (confirm('カスタム進行の設定をデフォルトに戻しますか？')) {
                    console.log("Confirmed resetting progressions");
                    try {
                        const c = this.customChords.find(ch => ch.name === 'C');
                        const dm = this.customChords.find(ch => ch.name === 'Dm');
                        const em = this.customChords.find(ch => ch.name === 'Em');
                        const f = this.customChords.find(ch => ch.name === 'F');
                        const g = this.customChords.find(ch => ch.name === 'G');
                        const am = this.customChords.find(ch => ch.name === 'Am');

                        console.log("Found Chords:", { c, dm, em, f, g, am });

                        if (c && dm && em && f && g && am) {
                            console.log("All required chords found, writing to this.customProgressions");
                            const baseId = Date.now();
                            this.customProgressions = [
                                { id: baseId + 100, name: '基本進行', chords: [c.id, f.id, g.id, c.id], isActive: true },
                                { id: baseId + 101, name: 'Pop Standard', chords: [c.id, f.id, c.id, g.id], isActive: true },
                                { id: baseId + 102, name: 'Pop Standard 2', chords: [c.id, g.id, f.id, g.id], isActive: true },
                                { id: baseId + 103, name: '1950s', chords: [c.id, am.id, f.id, g.id], isActive: true },
                                { id: baseId + 104, name: '王道進行', chords: [f.id, g.id, em.id, am.id], isActive: true },
                                { id: baseId + 105, name: '小室進行', chords: [am.id, f.id, g.id, c.id], isActive: true },
                                { id: baseId + 106, name: '前ツーファイブワン', chords: [dm.id, g.id, c.id, am.id], isActive: true },
                                { id: baseId + 107, name: '後ツーファイブワン', chords: [am.id, dm.id, g.id, c.id], isActive: true },
                                { id: baseId + 108, name: 'カノン進行前半', chords: [c.id, g.id, am.id, em.id], isActive: true },
                                { id: baseId + 109, name: 'カノン進行後半', chords: [f.id, c.id, f.id, g.id], isActive: true },
                                { id: baseId + 110, name: 'ポップパンク', chords: [f.id, c.id, g.id, am.id], isActive: true },
                                { id: baseId + 111, name: 'Let it be進行', chords: [c.id, g.id, am.id, f.id], isActive: true },
                                { id: baseId + 112, name: '洋楽定番 (6415)', chords: [am.id, f.id, c.id, g.id], isActive: true },
                                { id: baseId + 113, name: '王道アレンジ (4561)', chords: [f.id, g.id, am.id, c.id], isActive: true },
                                { id: baseId + 114, name: 'マイナー下降', chords: [am.id, g.id, f.id, g.id], isActive: true },
                                { id: baseId + 115, name: '強進行 (3625)', chords: [em.id, am.id, dm.id, g.id], isActive: true },
                                { id: baseId + 116, name: '625強進行 (1625)', chords: [c.id, am.id, dm.id, g.id], isActive: true },
                                { id: baseId + 117, name: '上昇順次進行 (3456)', chords: [em.id, f.id, g.id, am.id], isActive: true },
                                { id: baseId + 119, name: 'トニック進行 (1361)', chords: [c.id, em.id, am.id, c.id], isActive: true },
                                { id: baseId + 120, name: '上昇順次進行2 (2345)', chords: [dm.id, em.id, f.id, g.id], isActive: true }
                            ];
                            this.saveCustomData();
                            this.renderCustomProgressionList();
                            console.log("Rendered custom progression list, count:", this.customProgressions.length);
                        } else {
                            console.log("Missing chords, alerting");
                            alert('基本のコードが見つかりません。');
                        }
                    } catch (e) {
                        console.error("Error generating progressions", e);
                    }
                }
            });
        }

        // Helper to update the UI gray-out for chord pro settings
        const updateChordModeUI = (mode) => {
            const chordsArea = document.getElementById('custom-chords-area');
            const progsArea = document.getElementById('custom-progressions-area');
            if (!chordsArea || !progsArea) return;

            if (mode === 'chords') {
                chordsArea.style.opacity = '1';
                chordsArea.style.pointerEvents = 'auto';
                progsArea.style.opacity = '0.4';
                progsArea.style.pointerEvents = 'none';
            } else {
                progsArea.style.opacity = '1';
                progsArea.style.pointerEvents = 'auto';
                chordsArea.style.opacity = '0.4';
                chordsArea.style.pointerEvents = 'none';
            }
        };

        // Pro Question Mode Toggle
        document.querySelectorAll('input[name="pro-question-mode"]').forEach(radio => {
            // Wait for DOM to be fully ready before setting initial state
            setTimeout(() => {
                if (radio.checked) {
                    this.proQuestionMode = radio.value;
                    updateChordModeUI(radio.value);
                }
            }, 0);

            radio.addEventListener('change', (e) => {
                this.proQuestionMode = e.target.value;
                updateChordModeUI(e.target.value);
            });
        });

        // Expand/Collapse Progression List
        const btnExpandProgList = document.getElementById('btn-expand-progression-list');
        const progListDiv = document.getElementById('pro-custom-progression-list');
        const handleExpandProgList = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (progListDiv) {
                progListDiv.classList.toggle('expanded');
                if (progListDiv.classList.contains('expanded')) {
                    btnExpandProgList.textContent = '一部表示 ▲';
                } else {
                    btnExpandProgList.textContent = '全件表示 ▼';
                }
            }
        };
        if (btnExpandProgList) {
            btnExpandProgList.addEventListener('click', handleExpandProgList);
            btnExpandProgList.addEventListener('touchstart', handleExpandProgList, { passive: false });
        }

        // Progression Editor UI
        const btnAddProgression = document.getElementById('btn-add-custom-progression');
        const handleAddProg = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (this.customProgressions.length >= 50) {
                alert('進行は最大50個まで登録可能です。');
                return;
            }
            this.openProgressionEditor();
        };
        if (btnAddProgression) {
            btnAddProgression.addEventListener('click', handleAddProg);
            btnAddProgression.addEventListener('touchstart', handleAddProg, { passive: false });
        }

        const btnCancelProgression = document.getElementById('btn-cancel-progression');
        const handleCancelProg = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            document.getElementById('progression-editor-modal').classList.add('hidden');
        };
        if (btnCancelProgression) {
            btnCancelProgression.addEventListener('click', handleCancelProg);
            btnCancelProgression.addEventListener('touchstart', handleCancelProg, { passive: false });
        }

        const btnSaveProgression = document.getElementById('btn-save-progression');
        const handleSaveProg = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            this.saveProgressionFromEditor();
        };
        if (btnSaveProgression) {
            btnSaveProgression.addEventListener('click', handleSaveProg);
            btnSaveProgression.addEventListener('touchstart', handleSaveProg, { passive: false });
        }

        const btnAddProgChord = document.getElementById('btn-add-progression-chord');
        const handleAddProgChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            this.addProgressionChordSlot();
        };
        if (btnAddProgChord) {
            btnAddProgChord.addEventListener('click', handleAddProgChord);
            btnAddProgChord.addEventListener('touchstart', handleAddProgChord, { passive: false });
        }

        const btnRemoveProgChord = document.getElementById('btn-remove-progression-chord');
        const handleRemoveProgChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            const container = document.getElementById('progression-sequence-container');
            if (container.children.length > 2) {
                container.removeChild(container.lastChild);
                this.updateProgressionChordsDisplay();
            } else {
                alert('進行には少なくとも2つのコードが必要です。');
            }
        };
        if (btnRemoveProgChord) {
            btnRemoveProgChord.addEventListener('click', handleRemoveProgChord);
            btnRemoveProgChord.addEventListener('touchstart', handleRemoveProgChord, { passive: false });
        }

        const btnPreviewProgression = document.getElementById('btn-preview-progression');
        const handlePreviewProg = async (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            await this.audio.resumeContext();
            const slots = document.querySelectorAll('.progression-chord-slot');
            const chords = Array.from(slots).map(select => parseInt(select.value));
            const now = this.audio.ctx.currentTime;
            chords.forEach((chordId, index) => {
                const chord = this.customChords.find(c => c.id === chordId);
                if (chord) {
                    this.audio.playCustomChord(chord, this.baseOctave, 1.0, now + index * 1.2, this.keyOffset);
                }
            });
        };
        if (btnPreviewProgression) {
            btnPreviewProgression.addEventListener('click', handlePreviewProg);
            btnPreviewProgression.addEventListener('touchstart', handlePreviewProg, { passive: false });
        }

        const proChordCountSlider = document.getElementById('pro-chord-count-slider');
        const proChordCountValue = document.getElementById('pro-chord-count-value');
        if (proChordCountSlider) {
            proChordCountSlider.addEventListener('input', (e) => {
                if (proChordCountValue) proChordCountValue.textContent = e.target.value;
            });
        }
    }

    loadDefaultCustomChords() {
        const baseId = Date.now();
        const cId = baseId + 1;
        const dmId = baseId + 2;
        const emId = baseId + 3;
        const fId = baseId + 4;
        const gId = baseId + 5;
        const amId = baseId + 6;

        this.customChords = [
            { id: cId, name: 'C', root: "0", third: "4", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: dmId, name: 'Dm', root: "2", third: "3", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: emId, name: 'Em', root: "4", third: "3", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: fId, name: 'F', root: "5", third: "4", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: gId, name: 'G', root: "7", third: "4", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: amId, name: 'Am', root: "9", third: "3", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true }
        ];

        this.customProgressions = [
            { id: baseId + 100, name: '基本進行', chords: [cId, fId, gId, cId], isActive: true },
            { id: baseId + 101, name: 'Pop Standard', chords: [cId, fId, cId, gId], isActive: true },
            { id: baseId + 102, name: 'Pop Standard 2', chords: [cId, gId, fId, gId], isActive: true },
            { id: baseId + 103, name: '1950s', chords: [cId, amId, fId, gId], isActive: true },
            { id: baseId + 104, name: '王道進行', chords: [fId, gId, emId, amId], isActive: true },
            { id: baseId + 105, name: '小室進行', chords: [amId, fId, gId, cId], isActive: true },
            { id: baseId + 106, name: '前ツーファイブワン', chords: [dmId, gId, cId, amId], isActive: true },
            { id: baseId + 107, name: '後ツーファイブワン', chords: [amId, dmId, gId, cId], isActive: true },
            { id: baseId + 108, name: 'カノン進行前半', chords: [cId, gId, amId, emId], isActive: true },
            { id: baseId + 109, name: 'カノン進行後半', chords: [fId, cId, fId, gId], isActive: true },
            { id: baseId + 110, name: 'ポップパンク', chords: [fId, cId, gId, amId], isActive: true },
            { id: baseId + 111, name: 'Let it be進行', chords: [cId, gId, amId, fId], isActive: true },
            { id: baseId + 112, name: '洋楽定番 (6415)', chords: [amId, fId, cId, gId], isActive: true },
            { id: baseId + 113, name: '王道アレンジ (4561)', chords: [fId, gId, amId, cId], isActive: true },
            { id: baseId + 114, name: 'マイナー下降', chords: [amId, gId, fId, gId], isActive: true },
            { id: baseId + 115, name: '強進行 (3625)', chords: [emId, amId, dmId, gId], isActive: true },
            { id: baseId + 116, name: '625強進行 (1625)', chords: [cId, amId, dmId, gId], isActive: true },
            { id: baseId + 117, name: '上昇順次進行 (3456)', chords: [emId, fId, gId, amId], isActive: true },
            { id: baseId + 119, name: 'トニック進行 (1361)', chords: [cId, emId, amId, cId], isActive: true },
            { id: baseId + 120, name: '上昇順次進行2 (2345)', chords: [dmId, emId, fId, gId], isActive: true }
        ];
    }

    loadCustomData() {
        try {
            const data = localStorage.getItem('pitchTrainerProData');
            if (data) {
                const parsed = JSON.parse(data);
                this.customChords = parsed.customChords || [];
                this.customProgressions = parsed.customProgressions || [];
                if (this.customChords.length === 0) {
                    this.loadDefaultCustomChords();
                } else if (this.customProgressions.length === 0) {
                    // Try to initialize default progression using existing chords if possible
                    const c = this.customChords.find(ch => ch.name === 'C');
                    const dm = this.customChords.find(ch => ch.name === 'Dm');
                    const em = this.customChords.find(ch => ch.name === 'Em');
                    const f = this.customChords.find(ch => ch.name === 'F');
                    const g = this.customChords.find(ch => ch.name === 'G');
                    const am = this.customChords.find(ch => ch.name === 'Am');
                    if (c && dm && em && f && g && am) {
                        const baseId = Date.now();
                        this.customProgressions = [
                            { id: baseId + 100, name: '基本進行', chords: [c.id, f.id, g.id, c.id], isActive: true },
                            { id: baseId + 101, name: 'Pop Standard', chords: [c.id, f.id, c.id, g.id], isActive: true },
                            { id: baseId + 102, name: 'Pop Standard 2', chords: [c.id, g.id, f.id, g.id], isActive: true },
                            { id: baseId + 103, name: '1950s', chords: [c.id, am.id, f.id, g.id], isActive: true },
                            { id: baseId + 104, name: '王道進行', chords: [f.id, g.id, em.id, am.id], isActive: true },
                            { id: baseId + 105, name: '小室進行', chords: [am.id, f.id, g.id, c.id], isActive: true },
                            { id: baseId + 106, name: '前ツーファイブワン', chords: [dm.id, g.id, c.id, am.id], isActive: true },
                            { id: baseId + 107, name: '後ツーファイブワン', chords: [am.id, dm.id, g.id, c.id], isActive: true },
                            { id: baseId + 108, name: 'カノン進行前半', chords: [c.id, g.id, am.id, em.id], isActive: true },
                            { id: baseId + 109, name: 'カノン進行後半', chords: [f.id, c.id, f.id, g.id], isActive: true },
                            { id: baseId + 110, name: 'ポップパンク', chords: [f.id, c.id, g.id, am.id], isActive: true },
                            { id: baseId + 111, name: 'Let it be進行', chords: [c.id, g.id, am.id, f.id], isActive: true },
                            { id: baseId + 112, name: '洋楽定番 (6415)', chords: [am.id, f.id, c.id, g.id], isActive: true },
                            { id: baseId + 113, name: '王道アレンジ (4561)', chords: [f.id, g.id, am.id, c.id], isActive: true },
                            { id: baseId + 114, name: 'マイナー下降', chords: [am.id, g.id, f.id, g.id], isActive: true },
                            { id: baseId + 115, name: '強進行 (3625)', chords: [em.id, am.id, dm.id, g.id], isActive: true },
                            { id: baseId + 116, name: '625強進行 (1625)', chords: [c.id, am.id, dm.id, g.id], isActive: true },
                            { id: baseId + 117, name: '上昇順次進行 (3456)', chords: [em.id, f.id, g.id, am.id], isActive: true },
                            { id: baseId + 119, name: 'トニック進行 (1361)', chords: [c.id, em.id, am.id, c.id], isActive: true },
                            { id: baseId + 120, name: '上昇順次進行2 (2345)', chords: [dm.id, em.id, f.id, g.id], isActive: true }
                        ];
                        this.saveCustomData(); // Save the newly generated default progression to localStorage
                    } else if (this.customChords.length >= 2) {
                        // Fallback: just use the first few available chords
                        this.customProgressions = [{
                            id: Date.now(),
                            name: '初期進行',
                            chords: this.customChords.slice(0, Math.min(6, this.customChords.length)).map(ch => ch.id),
                            isActive: true
                        }];
                        this.saveCustomData();
                    }
                }
            } else {
                this.loadDefaultCustomChords();
                this.saveCustomData(); // Save defaults if completely fresh
            }
        } catch (e) {
            console.error("Failed to load custom data from localStorage", e);
            this.loadDefaultCustomChords();
        }
    }

    saveCustomData() {
        try {
            const data = {
                customChords: this.customChords,
                customProgressions: this.customProgressions
            };
            localStorage.setItem('pitchTrainerProData', JSON.stringify(data));
        } catch (e) {
            console.error("Failed to save custom data to localStorage", e);
        }
    }

    /** 通常版では A4=440Hz・余韻0.5秒・スピード1.0x に固定（表示も合わせる） */
    clampStandardEditionSoundSettings() {
        if (isPitchTrainerPro()) return;
        this.audio.setBaseHz(440);
        this.audio.sustainTime = 0.5;
        this.noteSpeed = 1.0;
        const hzSlider = document.getElementById('hz-slider');
        const hzSpan = document.getElementById('current-hz') || document.getElementById('hz-value');
        if (hzSlider) hzSlider.value = '440';
        if (hzSpan) hzSpan.textContent = '440';
        const sustainSlider = document.getElementById('sustain-slider');
        const sustainValue = document.getElementById('sustain-value');
        if (sustainSlider) sustainSlider.value = '0.5';
        if (sustainValue) sustainValue.textContent = '0.5';
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        if (speedSlider) speedSlider.value = '1.0';
        if (speedValue) speedValue.textContent = '1.0';
    }

    /** 通常版ではキー=C（0）・基準オクターブ=3 に固定 */
    clampStandardEditionKeyOctave() {
        if (isPitchTrainerPro()) return;
        this.baseOctave = 3;
        this.keyOffset = 0;
        if (this.currentOctaveEl) this.currentOctaveEl.textContent = '3';
        if (this.keySelector) this.keySelector.value = '0';
    }

    loadSettings() {
        try {
            const data = localStorage.getItem('pitchTrainerSettings');
            if (data) {
                const s = JSON.parse(data);
                this.isInitializing = true; // Add flag to prevent saveSettings during loading

                if (isPitchTrainerPro()) {
                    if (s.baseOctave !== undefined) this.updateOctave(s.baseOctave - this.baseOctave);
                    if (s.keyOffset !== undefined) this.updateKey(s.keyOffset);
                }
                if (s.instrument !== undefined) this.updateInstrument(s.instrument);
                if (s.notationStyle !== undefined) {
                    console.log("Game: updating notation to", s.notationStyle);
                    this.updateNotation(s.notationStyle);
                }
                if (s.scaleEnabled !== undefined) {
                    this.scaleEnabled = s.scaleEnabled;
                    const scaleToggle = document.getElementById('scale-toggle');
                    if (scaleToggle) scaleToggle.checked = this.scaleEnabled;
                }
                if (isPitchTrainerPro()) {
                    if (s.noteSpeed !== undefined) {
                        this.noteSpeed = s.noteSpeed;
                        const speedSlider = document.getElementById('speed-slider');
                        const speedValue = document.getElementById('speed-value');
                        if (speedSlider) {
                            speedSlider.value = this.noteSpeed;
                            if (speedValue) speedValue.textContent = this.noteSpeed.toFixed(1);
                        }
                    }
                    if (s.baseHz !== undefined) {
                        this.audio.setBaseHz(s.baseHz);
                        const hzSlider = document.getElementById('hz-slider');
                        const hzSpan = document.getElementById('current-hz') || document.getElementById('hz-value');
                        if (hzSlider) {
                            hzSlider.value = this.audio.baseHz;
                            if (hzSpan) hzSpan.textContent = this.audio.baseHz;
                        }
                    }
                    if (s.sustainTime !== undefined) {
                        this.audio.sustainTime = s.sustainTime;
                        const sustainSlider = document.getElementById('sustain-slider');
                        const sustainValue = document.getElementById('sustain-value');
                        if (sustainSlider) {
                            sustainSlider.value = this.audio.sustainTime;
                            if (sustainValue) sustainValue.textContent = this.audio.sustainTime.toFixed(1);
                        }
                    }
                }
                if (s.isAnswerMode !== undefined) {
                    this.isAnswerMode = s.isAnswerMode;
                    const answerToggle = document.getElementById('answer-mode-toggle');
                    if (answerToggle) answerToggle.checked = this.isAnswerMode;
                    console.log("Game: toggling answer mode to", this.isAnswerMode);
                    this.toggleAnswerMode(this.isAnswerMode);
                }

                this.isInitializing = false;
            } else {
                this.updateNotation('doremi');
            }
        } catch (e) {
            console.error("Failed to load settings from localStorage", e);
            this.isInitializing = false;
        }
        this.clampStandardEditionSoundSettings();
        this.clampStandardEditionKeyOctave();
    }

    saveSettings() {
        if (this.isInitializing) return; // Don't save while loading
        try {
            const data = {
                instrument: this.instrument,
                notationStyle: this.notationStyle,
                scaleEnabled: this.scaleEnabled,
                isAnswerMode: this.isAnswerMode
            };
            if (isPitchTrainerPro()) {
                data.baseOctave = this.baseOctave;
                data.keyOffset = this.keyOffset;
                data.noteSpeed = this.noteSpeed;
                data.sustainTime = this.audio.sustainTime;
                data.baseHz = this.audio.baseHz;
            } else {
                // 通常版は Pro 用の値を書き換えない（同じ端末で Pro を使うときのため）
                try {
                    const prevRaw = localStorage.getItem('pitchTrainerSettings');
                    if (prevRaw) {
                        const prev = JSON.parse(prevRaw);
                        ['baseOctave', 'keyOffset', 'noteSpeed', 'sustainTime', 'baseHz'].forEach((k) => {
                            if (prev[k] !== undefined) data[k] = prev[k];
                        });
                    }
                } catch (e) { /* ignore */ }
            }
            localStorage.setItem('pitchTrainerSettings', JSON.stringify(data));
        } catch (e) {
            console.error("Failed to save settings to localStorage", e);
        }
    }

    captureSettingsModalSnapshot() {
        this._settingsModalSnapshot = {
            instrument: this.instrument,
            notationStyle: this.notationStyle,
            scaleEnabled: this.scaleEnabled,
            isAnswerMode: this.isAnswerMode
        };
        if (isPitchTrainerPro()) {
            this._settingsModalSnapshot.baseOctave = this.baseOctave;
            this._settingsModalSnapshot.keyOffset = this.keyOffset;
            this._settingsModalSnapshot.noteSpeed = this.noteSpeed;
            this._settingsModalSnapshot.sustainTime = this.audio.sustainTime;
            this._settingsModalSnapshot.baseHz = this.audio.baseHz;
        }
    }

    applySettingsModalData(s) {
        if (!s) return;
        this.isInitializing = true;
        try {
            if (isPitchTrainerPro()) {
                if (s.baseOctave !== undefined) this.updateOctave(s.baseOctave - this.baseOctave);
                if (s.keyOffset !== undefined) this.updateKey(s.keyOffset);
                if (s.noteSpeed !== undefined) {
                    this.noteSpeed = s.noteSpeed;
                    const speedSlider = document.getElementById('speed-slider');
                    const speedValue = document.getElementById('speed-value');
                    if (speedSlider) speedSlider.value = this.noteSpeed;
                    if (speedValue) speedValue.textContent = this.noteSpeed.toFixed(1);
                }
                if (s.baseHz !== undefined) {
                    this.audio.setBaseHz(s.baseHz);
                    const hzSlider = document.getElementById('hz-slider');
                    const hzSpan = document.getElementById('current-hz') || document.getElementById('hz-value');
                    if (hzSlider) hzSlider.value = this.audio.baseHz;
                    if (hzSpan) hzSpan.textContent = this.audio.baseHz;
                }
                if (s.sustainTime !== undefined) {
                    this.audio.sustainTime = s.sustainTime;
                    const sustainSlider = document.getElementById('sustain-slider');
                    const sustainValue = document.getElementById('sustain-value');
                    if (sustainSlider) sustainSlider.value = this.audio.sustainTime;
                    if (sustainValue) sustainValue.textContent = this.audio.sustainTime.toFixed(1);
                }
            } else {
                this.clampStandardEditionKeyOctave();
                this.clampStandardEditionSoundSettings();
            }
            if (s.instrument !== undefined) this.updateInstrument(s.instrument);
            if (s.notationStyle !== undefined) this.updateNotation(s.notationStyle);
            if (s.scaleEnabled !== undefined) {
                this.scaleEnabled = s.scaleEnabled;
                const scaleToggle = document.getElementById('scale-toggle');
                if (scaleToggle) scaleToggle.checked = this.scaleEnabled;
            }
            if (s.isAnswerMode !== undefined) {
                this.isAnswerMode = s.isAnswerMode;
                const answerToggle = document.getElementById('answer-mode-toggle');
                if (answerToggle) answerToggle.checked = this.isAnswerMode;
                this.toggleAnswerMode(this.isAnswerMode);
            }
        } finally {
            this.isInitializing = false;
        }
        this.saveSettings();
    }

    openSettingsModal() {
        this.clampStandardEditionSoundSettings();
        this.clampStandardEditionKeyOctave();
        this.captureSettingsModalSnapshot();
        if (this.settingsModal) {
            this.settingsModal.classList.remove('hidden');
        }
    }

    hideSettingsModal() {
        this._settingsModalSnapshot = null;
        if (this.settingsModal) {
            this.settingsModal.classList.add('hidden');
        }
    }

    renderCustomChordList() {
        const listDiv = document.getElementById('pro-custom-chord-list');
        const countSpan = document.getElementById('pro-custom-chord-count');
        if (!listDiv || !countSpan) return;

        countSpan.textContent = this.customChords.length;
        listDiv.innerHTML = '';

        if (this.customChords.length === 0) {
            listDiv.innerHTML = '<div class="custom-chord-placeholder">まだコードが登録されていません。<br>「+ 新規コード追加」から作成してください。</div>';
            return;
        }

        this.customChords.forEach(chord => {
            const item = document.createElement('div');
            item.className = 'custom-chord-item';
            if (!chord.isActive) item.classList.add('inactive'); // Add class for styling

            const nameWrap = document.createElement('div');
            nameWrap.style.display = 'flex';
            nameWrap.style.alignItems = 'center';
            nameWrap.style.gap = '10px';
            nameWrap.style.flex = '1';
            nameWrap.style.minWidth = '0'; // Allows children to truncate

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'switch';
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = chord.isActive !== false; // Default true if undefined

            const toggleHandler = (e) => {
                chord.isActive = e.target.checked;
                item.classList.toggle('inactive', !chord.isActive);
                this.saveCustomData();
            };
            toggleInput.addEventListener('change', toggleHandler);

            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'slider round';

            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSlider);

            const nameDiv = document.createElement('div');
            nameDiv.className = 'custom-chord-name';
            nameDiv.textContent = chord.name;

            nameWrap.appendChild(toggleLabel);
            nameWrap.appendChild(nameDiv);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'custom-chord-actions';

            const playBtn = document.createElement('button');
            playBtn.className = 'btn-icon';
            playBtn.innerHTML = '▶';
            playBtn.title = '再生';
            playBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.audio.resumeContext();
                this.audio.playCustomChord(chord, this.baseOctave, 1.5, 0, this.keyOffset);
            };

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-icon';
            editBtn.innerHTML = '✎';
            editBtn.title = '編集';
            editBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openChordEditor(chord);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon delete';
            delBtn.innerHTML = '×';
            delBtn.title = '削除';
            delBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('コード「' + chord.name + '」を削除しますか？')) {
                    this.customChords = this.customChords.filter(c => c.id !== chord.id);
                    // Also remove it from progressions if it's there
                    this.customProgressions.forEach(prog => {
                        prog.chords = prog.chords.filter(id => id !== chord.id);
                    });
                    this.saveCustomData();
                    this.renderCustomChordList();
                    if (this.renderCustomProgressionList) this.renderCustomProgressionList();
                }
            };

            actionsDiv.appendChild(playBtn);
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(delBtn);

            item.appendChild(nameWrap);
            item.appendChild(actionsDiv);
            listDiv.appendChild(item);
        });
    }

    openChordEditor(chordToEdit = null) {
        if (!this.chordEditorModal) return;

        // Reset form
        document.getElementById('editor-root').value = "0";
        document.getElementById('editor-third').value = "4";
        document.getElementById('editor-fifth').value = "7";
        document.getElementById('editor-seventh').value = "null";
        document.getElementById('editor-inversion').value = "0";
        document.querySelectorAll('.tension-checkbox').forEach(cb => cb.checked = false);

        this.editingChordId = null; // Reset editing state

        if (chordToEdit) {
            this.editingChordId = chordToEdit.id;
            document.getElementById('editor-root').value = chordToEdit.root;
            document.getElementById('editor-third').value = chordToEdit.third;
            document.getElementById('editor-fifth').value = chordToEdit.fifth;
            document.getElementById('editor-seventh').value = chordToEdit.seventh;
            document.getElementById('editor-inversion').value = chordToEdit.inversion;
            chordToEdit.tensions.forEach(tension => {
                const cb = document.querySelector('.tension-checkbox[value="' + tension + '"]');
                if (cb) cb.checked = true;
            });
            document.getElementById('chord-preview-name').textContent = chordToEdit.name;
        } else {
            document.getElementById('chord-preview-name').textContent = "C";
        }

        this.chordEditorModal.classList.remove('hidden');
    }

    readChordEditorState() {
        const tensions = Array.from(document.querySelectorAll('.tension-checkbox:checked')).map(cb => cb.value);
        return {
            root: document.getElementById('editor-root').value,
            third: document.getElementById('editor-third').value,
            fifth: document.getElementById('editor-fifth').value,
            seventh: document.getElementById('editor-seventh').value,
            tensions: tensions,
            inversion: document.getElementById('editor-inversion').value
        };
    }

    saveChordFromEditor() {
        const chordData = this.readChordEditorState();
        chordData.name = this.generateChordName(chordData);

        if (this.editingChordId) {
            // Edit existing
            const index = this.customChords.findIndex(c => c.id === this.editingChordId);
            if (index !== -1) {
                this.customChords[index] = { ...chordData, id: this.editingChordId, isActive: this.customChords[index].isActive };
            }
        } else {
            // Add new
            chordData.id = Date.now();
            chordData.isActive = true; // explicitly activate upon saving
            this.customChords.push(chordData);
        }

        this.saveCustomData();
        this.renderCustomChordList();
        this.chordEditorModal.classList.add('hidden');
    }

    generateChordName(chordData) {
        const rootNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        let name = rootNames[parseInt(chordData.root)] || 'C';

        let third = chordData.third;
        let fifth = chordData.fifth;
        let seventh = chordData.seventh;
        let tensions = chordData.tensions || [];

        // Determine base quality
        if (third === "3") {
            // minor
            if (fifth === "6" && seventh === "9") name += "dim7";
            else if (fifth === "6" && seventh === "10") name += "m7(b5)";
            else if (fifth === "6") name += "dim";
            else if (seventh === "10") name += "m7";
            else if (seventh === "11") name += "mM7";
            else name += "m";
        } else if (third === "5") {
            // sus4
            name += "sus4";
            if (seventh === "10") name += "7";
        } else if (third === "4") {
            // major
            if (fifth === "8") {
                if (seventh === "10") name += "aug7";
                else if (seventh === "11") name += "augM7";
                else name += "aug";
            } else {
                if (seventh === "10") name += "7";
                else if (seventh === "11") name += "M7";
                else if (seventh === "null" && fifth === "null") name += "(power)";
            }
        } else {
            // no 3rd
            name += "(omit3)";
        }

        // Add tensions
        if (tensions.length > 0) {
            const tNames = tensions.map(t => {
                if (t === "13") return "b9";
                if (t === "14") return "9";
                if (t === "15") return "#9";
                if (t === "17") return "11";
                if (t === "18") return "#11";
                if (t === "20") return "b13";
                if (t === "21") return "13";
                return "";
            });
            name += "(" + tNames.join(",") + ")";
        }

        // Add inversion
        if (chordData.inversion !== "0") {
            if (chordData.inversion === "1") name += " / 1st";
            else if (chordData.inversion === "2") name += " / 2nd";
            else if (chordData.inversion === "3") name += " / 3rd";
        }

        return name;
    }

    // --- Custom Progression Logic ---

    renderCustomProgressionList() {
        const listDiv = document.getElementById('pro-custom-progression-list');
        const countSpan = document.getElementById('pro-custom-progression-count');
        if (!listDiv || !countSpan) return;

        countSpan.textContent = this.customProgressions.length;
        listDiv.innerHTML = '';

        if (this.customProgressions.length === 0) {
            listDiv.innerHTML = '<div class="custom-chord-placeholder">まだ進行が登録されていません。<br>「+ 新規進行追加」から作成してください。</div>';
            return;
        }

        this.customProgressions.forEach(prog => {
            const item = document.createElement('div');
            item.className = 'custom-chord-item';
            if (!prog.isActive) item.classList.add('inactive');

            const nameWrap = document.createElement('div');
            nameWrap.style.display = 'flex';
            nameWrap.style.alignItems = 'center';
            nameWrap.style.gap = '10px';
            nameWrap.style.flex = '1';
            nameWrap.style.minWidth = '0'; // Allows children to truncate

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'switch';
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = prog.isActive !== false;

            const toggleHandler = (e) => {
                prog.isActive = e.target.checked;
                item.classList.toggle('inactive', !prog.isActive);
                this.saveCustomData();
            };
            toggleInput.addEventListener('change', toggleHandler);

            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'slider round';
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSlider);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'chord-name';
            // Clean up existing names that might have "(C, F, G, C)" from older app versions
            nameSpan.textContent = (prog.name || '名称未設定').replace(/\s*\(.*?\)$/, '');

            // Subtext for chord count
            const countLabel = document.createElement('span');
            countLabel.style.fontSize = '0.75rem';
            countLabel.style.color = 'rgba(255,255,255,0.5)';
            countLabel.textContent = prog.chords.length + 'コード';

            // Generate chords string like "C - F - G - C"
            const chordsStr = prog.chords.map(chordId => {
                const c = this.customChords.find(ch => ch.id === chordId);
                return c ? c.name : '?';
            }).join(' - ');

            const chordsSpan = document.createElement('div');
            chordsSpan.style.fontSize = '1.1rem';
            chordsSpan.style.fontWeight = 'bold';
            chordsSpan.style.color = 'var(--primary-color)';
            chordsSpan.style.marginTop = '4px';
            chordsSpan.style.whiteSpace = 'nowrap';
            chordsSpan.style.overflow = 'hidden';
            chordsSpan.style.textOverflow = 'ellipsis';
            chordsSpan.textContent = chordsStr;

            const textWrap = document.createElement('div');
            textWrap.style.display = 'flex';
            textWrap.style.flexDirection = 'column';
            textWrap.style.flex = '1';
            textWrap.style.minWidth = '0';

            const nameRow = document.createElement('div');
            nameRow.style.display = 'flex';
            nameRow.style.alignItems = 'baseline';
            nameRow.style.gap = '8px';
            nameRow.appendChild(nameSpan);
            nameRow.appendChild(countLabel);

            textWrap.appendChild(nameRow);
            textWrap.appendChild(chordsSpan);

            nameWrap.appendChild(toggleLabel);
            nameWrap.appendChild(textWrap);

            const actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '10px';

            const playBtn = document.createElement('button');
            playBtn.className = 'btn-icon';
            playBtn.innerHTML = '▶';
            playBtn.title = '試聴';
            playBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.audio.resumeContext();
                const now = this.audio.ctx.currentTime;
                prog.chords.forEach((chordId, index) => {
                    const chord = this.customChords.find(c => c.id === chordId);
                    if (chord) {
                        this.audio.playCustomChord(chord, this.baseOctave, 1.0, now + index * 1.2, this.keyOffset);
                    }
                });
            };

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-icon';
            editBtn.innerHTML = '✎';
            editBtn.title = '編集';
            editBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openProgressionEditor(prog);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon delete';
            delBtn.innerHTML = '×';
            delBtn.title = '削除';
            delBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('進行「' + prog.name + '」を削除しますか？')) {
                    this.customProgressions = this.customProgressions.filter(p => p.id !== prog.id);
                    this.saveCustomData();
                    this.renderCustomProgressionList();
                }
            };

            actionsDiv.appendChild(playBtn);
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(delBtn);

            item.appendChild(nameWrap);
            item.appendChild(actionsDiv);
            listDiv.appendChild(item);
        });
    }

    openProgressionEditor(progToEdit = null) {
        const modal = document.getElementById('progression-editor-modal');
        if (!modal) return;

        document.getElementById('progression-name').value = '';
        const container = document.getElementById('progression-sequence-container');
        container.innerHTML = '';

        this.editingProgressionId = null;

        if (progToEdit) {
            this.editingProgressionId = progToEdit.id;
            document.getElementById('progression-name').value = (progToEdit.name || '').replace(/\s*\(.*?\)$/, '');
            progToEdit.chords.forEach(chordId => {
                this.addProgressionChordSlot(chordId);
            });
        } else {
            // Default 2 slots
            this.addProgressionChordSlot();
            this.addProgressionChordSlot();
        }

        modal.classList.remove('hidden');
    }

    addProgressionChordSlot(selectedChordId = null) {
        if (this.customChords.length === 0) {
            alert('まずはコードを登録してください。');
            return;
        }

        const container = document.getElementById('progression-sequence-container');
        const select = document.createElement('select');
        select.className = 'preset-select progression-chord-slot';
        select.style.padding = '8px';
        select.style.fontSize = '1rem';

        this.customChords.forEach(chord => {
            const option = document.createElement('option');
            option.value = chord.id;
            option.textContent = chord.name;
            if (selectedChordId && chord.id === selectedChordId) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        select.addEventListener('change', () => this.updateProgressionChordsDisplay());

        container.appendChild(select);
        this.updateProgressionChordsDisplay();
    }

    updateProgressionChordsDisplay() {
        const display = document.getElementById('progression-chords-display');
        const slots = document.querySelectorAll('.progression-chord-slot');
        if (!display) return;

        const chordsStr = Array.from(slots).map(select => {
            const chordId = parseInt(select.value);
            const chord = this.customChords.find(c => c.id === chordId);
            return chord ? chord.name : '?';
        }).join(' - ');

        display.textContent = chordsStr;
    }

    saveProgressionFromEditor() {
        const name = document.getElementById('progression-name').value.trim() || '名称未設定';
        const slots = document.querySelectorAll('.progression-chord-slot');
        const chords = Array.from(slots).map(select => parseInt(select.value));

        if (chords.length < 2) {
            alert('進行には少なくとも2つのコードが必要です。');
            return;
        }

        const progData = {
            name: name,
            chords: chords
        };

        if (this.editingProgressionId) {
            const index = this.customProgressions.findIndex(p => p.id === this.editingProgressionId);
            if (index !== -1) {
                this.customProgressions[index] = { ...progData, id: this.editingProgressionId, isActive: this.customProgressions[index].isActive };
            }
        } else {
            if (this.customProgressions.length >= 50) {
                alert('進行は最大50個まで登録可能です。');
                return;
            }
            progData.id = Date.now();
            progData.isActive = true;
            this.customProgressions.push(progData);
        }

        this.saveCustomData();
        this.renderCustomProgressionList();
        document.getElementById('progression-editor-modal').classList.add('hidden');
    }

    // Replace the end of `init()` bracket with standard form

    applyScalePreset(preset) {
        const toggles = document.querySelectorAll('.note-toggle');
        const check = (note) => {
            const el = document.querySelector('.note-toggle[data-note="' + note + '"]');
            if (el) el.checked = true;
        };
        const uncheckAll = () => toggles.forEach(t => t.checked = false);

        uncheckAll();

        switch (preset) {
            case 'chromatic':
                toggles.forEach(t => t.checked = true);
                break;
            case 'major': // Ionian: C D E F G A B
                ['C', 'D', 'E', 'F', 'G', 'A', 'B'].forEach(check);
                break;
            case 'minor': // Aeolian: C D Eb F G Ab Bb
                ['C', 'D', 'D#', 'F', 'G', 'G#', 'A#'].forEach(check);
                break;
            case 'harmonic-minor': // Harmonic Minor: C D Eb F G Ab B
                ['C', 'D', 'D#', 'F', 'G', 'G#', 'B'].forEach(check);
                break;
            case 'melodic-minor': // Melodic Minor: C D Eb F G A B
                ['C', 'D', 'D#', 'F', 'G', 'A', 'B'].forEach(check);
                break;
            case 'dorian': // Dorian: C D Eb F G A Bb
                ['C', 'D', 'D#', 'F', 'G', 'A', 'A#'].forEach(check);
                break;
            case 'phrygian': // Phrygian: C Db Eb F G Ab Bb
                ['C', 'C#', 'D#', 'F', 'G', 'G#', 'A#'].forEach(check);
                break;
            case 'lydian': // Lydian: C D E F# G A B
                ['C', 'D', 'E', 'F#', 'G', 'A', 'B'].forEach(check);
                break;
            case 'mixolydian': // Mixolydian: C D E F G A Bb
                ['C', 'D', 'E', 'F', 'G', 'A', 'A#'].forEach(check);
                break;
            case 'locrian': // Locrian: C Db Eb F Gb Ab Bb
                ['C', 'C#', 'D#', 'F', 'F#', 'G#', 'A#'].forEach(check);
                break;
            case 'penta-maj': // C Major Pentatonic -> C D E G A
                ['C', 'D', 'E', 'G', 'A'].forEach(check);
                break;
            case 'penta-min': // C Minor Pentatonic -> C Eb F G Bb
                ['C', 'D#', 'F', 'G', 'A#'].forEach(check);
                break;
            case 'blues': // Blues: C Eb F F# G Bb
                ['C', 'D#', 'F', 'F#', 'G', 'A#'].forEach(check);
                break;
            case 'altered': // Altered: C Db Eb Fb(E) Gb(F#) Ab(G#) Bb(A#)
                ['C', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'].forEach(check);
                break;
            case 'whole-tone': // Whole Tone: C D E F# G# A#
                ['C', 'D', 'E', 'F#', 'G#', 'A#'].forEach(check);
                break;
            case 'diminished-wh': // Diminished (W-H): C D Eb F F# G# A B
                ['C', 'D', 'D#', 'F', 'F#', 'G#', 'A', 'B'].forEach(check);
                break;
            case 'diminished-hw': // Combination of Diminished (H-W): C Db Eb E F# G A Bb
                ['C', 'C#', 'D#', 'E', 'F#', 'G', 'A', 'A#'].forEach(check);
                break;
            case 'lydian-b7': // Lydian b7 / Acoustic: C D E F# G A Bb
                ['C', 'D', 'E', 'F#', 'G', 'A', 'A#'].forEach(check);
                break;
        }
    }

    applyChordPreset(preset) {
        const toggles = document.querySelectorAll('.chord-toggle');
        const check = (chord) => {
            const el = document.querySelector('.chord-toggle[data-chord="' + chord + '"]');
            if (el) el.checked = true;
        };
        const uncheckAll = () => toggles.forEach(t => t.checked = false);

        uncheckAll();

        switch (preset) {
            case 'diatonic-c':
                ['C', 'Dm', 'Em', 'F', 'G', 'Am'].forEach(check); // Bdim is usually omitted or mapped differently, keeping it simple
                break;
            case 'all-major':
                ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach(check);
                break;
            case 'all-minor':
                ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'].forEach(check);
                break;
            case 'all-chords':
                toggles.forEach(t => t.checked = true);
                break;
        }
    }

    /** Proコード設定を stageConfig に反映。失敗時 false */
    applyProChordSettingsFromUI() {
        const activeChords = this.customChords.filter(c => c.isActive !== false);

        if (activeChords.length === 0) {
            alert('少なくとも1つのコードを選択してください。');
            return false;
        }

        const countVal = parseInt(document.getElementById('pro-chord-count-slider').value) || 4;

        this.stageConfig[199] = {
            pool: activeChords,
            count: countVal,
            isChord: true,
            isCustomChord: true,
            label: 'Pro Stage',
            description: 'カスタム設定'
        };
        return true;
    }

    startProChordGame() {
        if (!this.applyProChordSettingsFromUI()) return;
        if (this.proChordSettingsModal) {
            this.proChordSettingsModal.classList.add('hidden');
        }
        this.startGame(199);
    }

    confirmProChordSettings() {
        if (!this.applyProChordSettingsFromUI()) return;
        if (this.proChordSettingsModal) {
            this.proChordSettingsModal.classList.add('hidden');
        }
        const inGame = this.isPlaying && this.stage === 199;
        this.startGame(199, { preserveProgress: inGame });
    }

    resetProChordSettingsToDefaults() {
        document.querySelectorAll('input[name="pro-question-mode"]').forEach(r => {
            r.checked = r.value === 'chords';
        });
        this.proQuestionMode = 'chords';
        const cs = document.getElementById('pro-chord-count-slider');
        const cv = document.getElementById('pro-chord-count-value');
        if (cs) cs.value = '4';
        if (cv) cv.textContent = '4';
        if (confirm('カスタムコード・進行のリストも、公式の初期セットに戻しますか？\n（いいえ＝出題モードとコード数だけ戻します）')) {
            this.loadDefaultCustomChords();
            this.saveCustomData();
            this.renderCustomChordList();
            if (this.renderCustomProgressionList) this.renderCustomProgressionList();
        }
    }

    getDegreeName(note) {
        const degreeMap = {
            'C': '1', 'C#': '♭2', 'D': '2', 'D#': '♭3', 'E': '3', 'F': '4',
            'F#': '♭5', 'G': '5', 'G#': '♭6', 'A': '6', 'A#': '♭7', 'B': '7'
        };
        return degreeMap[note] || note;
    }

    getSolfegeName(note) {
        return this.noteToSolfege[note] || note;
    }

    loadProMelodyAccidentalPref() {
        try {
            const v = localStorage.getItem('pitchTrainerProAccidentalDisplay');
            if (v === 'flat' || v === 'sharp') this.proAccidentalDisplay = v;
        } catch (e) { /* ignore */ }
    }

    saveProMelodyAccidentalPref() {
        try {
            localStorage.setItem('pitchTrainerProAccidentalDisplay', this.proAccidentalDisplay);
        } catch (e) { /* ignore */ }
    }

    /** Pro用: 音名表示（C# または D♭） */
    getProNoteLetterDisplay(note) {
        if (!note || !note.includes('#')) return note;
        if (this.proAccidentalDisplay === 'flat') {
            return this.proSharpToFlatLetter[note] || note;
        }
        return note;
    }

    /** Pro用: 階名表示（シャープ系 or フラット系） */
    getProSolfegeDisplay(note) {
        if (this.proAccidentalDisplay === 'flat' && this.proSolfegeFlatBySharpNote[note]) {
            return this.proSolfegeFlatBySharpNote[note];
        }
        return this.getSolfegeName(note);
    }

    /**
     * メロディ1音分を不正解メッセージ用の文字列にする。
     * 2オクターブ時は item が { note, octaveOffset } になるため、note 名を取り出してから表記変換する。
     */
    formatMelodySequenceItemForFeedback(item, cfg) {
        let noteName;
        let octaveOffset = 0;
        if (typeof item === 'object' && item !== null && item.note) {
            noteName = item.note;
            octaveOffset = item.octaveOffset || 0;
        } else if (typeof item === 'string') {
            noteName = item;
        } else {
            return String(item);
        }
        let label;
        if (this.stage === 99 && cfg.answerMethod === 'degree') {
            label = this.getDegreeName(noteName);
        } else if (this.stage === 99 && cfg.answerMethod === 'solfege') {
            label = this.getProSolfegeDisplay(noteName);
        } else if (this.stage === 99 && cfg.answerMethod === 'note') {
            label = this.getProNoteLetterDisplay(noteName);
        } else if (this.notationStyle === 'degree') {
            label = this.getDegreeName(noteName);
        } else {
            label = this.noteToSolfege[noteName] || noteName;
        }
        if (cfg.is2Octave && typeof item === 'object' && item !== null && item.note !== undefined) {
            label += octaveOffset === 0 ? '（下）' : '（上）';
        }
        return label;
    }

    syncProAccidentalToggleUi() {
        const acc = document.getElementById('pro-accidental-toggle');
        if (acc) acc.checked = this.proAccidentalDisplay === 'flat';
    }

    refreshProNoteToggleLabels() {
        const methodEl = document.getElementById('pro-answer-method');
        if (!methodEl) return;
        const method = methodEl.value || 'solfege';
        document.querySelectorAll('.note-toggle-wrapper').forEach(wrapper => {
            const checkbox = wrapper.querySelector('.note-toggle');
            const noteNameLabel = wrapper.querySelector('.note-name');
            const degreeLabel = wrapper.querySelector('.degree-label');
            if (checkbox && noteNameLabel) {
                const note = checkbox.dataset.note;
                if (method === 'degree') {
                    noteNameLabel.textContent = this.getDegreeName(note);
                } else if (method === 'solfege') {
                    noteNameLabel.textContent = this.getProSolfegeDisplay(note);
                } else {
                    noteNameLabel.textContent = this.getProNoteLetterDisplay(note);
                }
            }
            if (degreeLabel) degreeLabel.style.display = 'none';
        });
    }

    /** Proメロディ設定を stageConfig に反映。失敗時 false */
    applyProMelodySettingsFromUI() {
        const selectedNotes = [];
        document.querySelectorAll('.note-toggle:checked').forEach(t => {
            selectedNotes.push(t.dataset.note);
        });

        if (selectedNotes.length === 0) {
            alert('少なくとも1つの音を選択してください。');
            return false;
        }

        const count = parseInt(document.getElementById('pro-count-slider').value) || 4;
        const is2Octave = document.getElementById('pro-2octave-toggle') ? document.getElementById('pro-2octave-toggle').checked : false;
        const isPianoLayout = document.getElementById('pro-keyboard-layout-toggle') ? document.getElementById('pro-keyboard-layout-toggle').checked : false;
        const answerMethod = document.getElementById('pro-answer-method').value || 'note';
        const accEl = document.getElementById('pro-accidental-toggle');
        if (accEl) {
            this.proAccidentalDisplay = accEl.checked ? 'flat' : 'sharp';
        }
        this.saveProMelodyAccidentalPref();

        this.stageConfig[99].pool = selectedNotes;
        this.stageConfig[99].count = count;
        this.stageConfig[99].is2Octave = is2Octave;
        this.stageConfig[99].isPianoLayout = isPianoLayout;
        this.stageConfig[99].answerMethod = answerMethod;
        this.stageConfig[99].description = selectedNotes.length + '音 / ' + count + '問' + (is2Octave ? ' (2Oct)' : '');
        return true;
    }

    startProGame() {
        if (!this.applyProMelodySettingsFromUI()) return;
        if (this.proSettingsModal) this.proSettingsModal.classList.add('hidden');
        this.startGame(99);
    }

    confirmProMelodySettings() {
        if (!this.applyProMelodySettingsFromUI()) return;
        if (this.proSettingsModal) this.proSettingsModal.classList.add('hidden');
        const inGame = this.isPlaying && this.stage === 99;
        this.startGame(99, { preserveProgress: inGame });
    }

    resetProMelodySettingsToDefaults() {
        const presetSelect = document.getElementById('scale-preset-select');
        if (presetSelect) {
            presetSelect.value = 'major';
            this.applyScalePreset('major');
        }
        const slider = document.getElementById('pro-count-slider');
        const valSpan = document.getElementById('pro-count-value');
        if (slider) slider.value = '4';
        if (valSpan) valSpan.textContent = '4';
        document.querySelectorAll('.note-toggle').forEach(t => {
            const n = t.dataset.note;
            t.checked = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(n);
        });
        const t2 = document.getElementById('pro-2octave-toggle');
        if (t2) t2.checked = false;
        const t3 = document.getElementById('pro-keyboard-layout-toggle');
        if (t3) t3.checked = true;
        const am = document.getElementById('pro-answer-method');
        if (am) {
            am.value = 'solfege';
            am.dispatchEvent(new Event('change'));
        }
        const acc = document.getElementById('pro-accidental-toggle');
        if (acc) acc.checked = false;
        this.proAccidentalDisplay = 'sharp';
        this.saveProMelodyAccidentalPref();
        this.refreshProNoteToggleLabels();
    }

    openInGameProSettings() {
        if (this.stage === 99 && this.proSettingsModal) {
            this.syncProAccidentalToggleUi();
            this.refreshProNoteToggleLabels();
            this.proSettingsModal.classList.remove('hidden');
        } else if (this.stage === 199 && this.proChordSettingsModal) {
            this.renderCustomChordList();
            if (this.renderCustomProgressionList) this.renderCustomProgressionList();
            this.proChordSettingsModal.classList.remove('hidden');
        }
    }

    updateInGameProSettingsButton() {
        const btn = document.getElementById('in-game-pro-settings-btn');
        if (!btn) return;
        const show = this.isPlaying && (this.stage === 99 || this.stage === 199);
        btn.style.display = show ? 'flex' : 'none';
    }

    updateOctave(delta) {
        const newOctave = this.baseOctave + delta;
        if (newOctave >= 2 && newOctave <= 5) {
            this.baseOctave = newOctave;
            if (this.currentOctaveEl) {
                this.currentOctaveEl.textContent = this.baseOctave;
            }
            this.saveSettings();
        }
    }

    updateKey(offset) {
        this.keyOffset = offset;
        if (this.keySelector) {
            this.keySelector.value = offset;
        }
        this.saveSettings();
    }

    updateInstrument(instrument) {
        this.instrument = instrument;
        this.audio.currentInstrument = instrument;
        if (this.instrumentSelector) {
            this.instrumentSelector.value = instrument;
        }
        this.saveSettings();
    }

    updateNotation(style) {
        this.notationStyle = style;
        if (this.noteBtns && this.noteBtns.length > 0) {
            this.noteBtns.forEach(btn => {
                const noteData = btn.dataset.note;
                if (!noteData) return;
                // Never touch buttons when playing Pro Stage 99 with custom answer methods (Solfege, Degree)
                if (this.stage === 99 && this.stageConfig[99] && ['solfege', 'degree'].includes(this.stageConfig[99].answerMethod)) {
                    return;
                }
                if (style === 'doremi') {
                    btn.textContent = this.doremiMap[noteData] || noteData;
                } else if (style === 'degree') {
                    btn.textContent = this.getDegreeName(noteData);
                } else {
                    btn.textContent = noteData;
                }
            });
        }
        // Update chord buttons too
        if (this.chordBtns && this.chordBtns.length > 0) {
            this.chordBtns.forEach(btn => {
                const chordData = btn.dataset.chord;
                if (!chordData) return; // skip custom chord buttons
                if (style === 'degree') {
                    btn.textContent = this.chordDegreeMap[chordData] || chordData;
                } else {
                    btn.textContent = chordData;
                }
            });
        }
        if (this.notationSelector) {
            this.notationSelector.value = style;
        }
        this.saveSettings();
    }

    /**
     * 設定の「音を確認」ボタン
     * 現在の楽器・キー・オクターブ・余韻を全て反映してC音を再生する
     */
    async previewSound() {
        const btn = document.getElementById('preview-sound');

        // 再生中は連打防止
        if ((btn && btn.classList.contains('playing'))) return;

        await this.audio.resumeContext();

        // 現在の設定でC音（主音）を再生
        const noteName = 'C' + this.baseOctave;
        const previewDuration = 0.8;

        this.audio.playNote(noteName, previewDuration, 0, this.keyOffset);

        // ボタンをアニメーション状態に
        if (btn) {
            btn.classList.add('playing');
            btn.textContent = '🎵 再生中...';
            // 余韻が終わったらボタンを戻す
            const totalMs = (previewDuration + this.audio.sustainTime) * 1000 + 100;
            setTimeout(() => {
                btn.classList.remove('playing');
                btn.textContent = '🎵 音を確認';
            }, totalMs);
        }
    }

    resetToDefaults() {
        this.updateOctave(3 - this.baseOctave); // Reset to 3
        this.updateKey(0); // Reset to C
        this.updateInstrument('acoustic_guitar'); // Reset to acoustic guitar
        this.updateNotation('doremi'); // Reset to DoReMi
        // 基準周波数をデフォルト(440Hz)にリセット
        this.audio.setBaseHz(440);
        const hzSlider = document.getElementById('hz-slider');
        const hzSpan = document.getElementById('current-hz') || document.getElementById('hz-value');
        if (hzSlider) hzSlider.value = '440';
        if (hzSpan) hzSpan.textContent = '440';
        // 余韻をデフォルト(0.5秒)にリセット
        this.audio.sustainTime = 0.5;
        const sustainSlider = document.getElementById('sustain-slider');
        const sustainValue = document.getElementById('sustain-value');
        if (sustainSlider) sustainSlider.value = '0.5';
        if (sustainValue) sustainValue.textContent = '0.5';
        // 音階をデフォルト(ON)にリセット
        this.scaleEnabled = true;
        const scaleToggle = document.getElementById('scale-toggle');
        if (scaleToggle) scaleToggle.checked = true;
        // スピードをデフォルト(1.0x)にリセット
        this.noteSpeed = 1.0;
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        if (speedSlider) speedSlider.value = '1.0';
        if (speedValue) speedValue.textContent = '1.0';
    }


    updateStats() {
        if (this.comboEl) this.comboEl.textContent = this.streak;
    }

    startGame(level, options = {}) {
        if (isPitchTrainerBeta()) {
            const okMelody = level >= 1 && level <= 4;
            const okChord = level >= 101 && level <= 104;
            if (!okMelody && !okChord) return;
        }
        const preserveProgress = options.preserveProgress === true;
        this.stage = level;
        this.overlay.classList.add('hidden');
        this.hideSettingsModal();
        if (!preserveProgress) {
            this.score = 0;
            this.streak = 0;
            this.previousSequenceKeys = []; // Reset for new game session
            this.updateStats();
        }
        this.isPlaying = true;
        this.isRoundOver = false;

        const cfg = this.stageConfig[this.stage] || this.stageConfig[3];
        const pool = cfg.pool;

        // Update Stage Info Display
        const stageInfo = this.stageConfig[this.stage];
        const stageNameEl = document.getElementById('current-stage-name');
        const stageDescEl = document.getElementById('current-stage-desc');
        const stageDisplay = document.getElementById('stage-info-display');
        const appTitle = document.querySelector('h1');

        if (stageInfo && stageDisplay && stageNameEl && stageDescEl) {
            stageNameEl.textContent = (this.stage === 99 || this.stage === 199) ? 'Pro Stage' : 'STAGE ' + (this.stage > 100 ? this.stage - 100 : this.stage);
            stageDescEl.textContent = stageInfo.description;
            stageDisplay.style.display = 'block';
            if (appTitle) appTitle.style.display = 'none';
        } else {
            if (stageDisplay) stageDisplay.style.display = 'none';
            if (appTitle) appTitle.style.display = 'block';
        }

        // UI Toggle
        if (cfg.isChord) {
            this.noteButtonsContainer.style.display = 'none';
            this.chordButtonsContainer.style.display = 'flex';
        } else {
            this.noteButtonsContainer.style.display = 'flex';
            this.chordButtonsContainer.style.display = 'none';
        }

        // Filter buttons or generate custom ones
        if (cfg.isChord) {
            if (cfg.isCustomChord) {
                // Generate dynamic buttons for Custom Chords
                this.chordButtonsContainer.innerHTML = '';
                cfg.pool.forEach(chordObj => {
                    const btn = document.createElement('button');
                    btn.className = 'chord-btn';
                    btn.dataset.chordid = chordObj.id; // use ID to identify
                    btn.textContent = chordObj.name;

                    // Add listeners for custom chord buttons
                    btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleInput(chordObj); });
                    btn.addEventListener('mousedown', (e) => { if (e.button === 0) this.handleInput(chordObj); });

                    this.chordButtonsContainer.appendChild(btn);
                });
                this.chordBtns = document.querySelectorAll('.chord-btn');
            } else {
                // For normal Diatonic predefined chords
                this.chordBtns.forEach(btn => {
                    const chord = btn.dataset.chord;
                    const shouldShow = pool.includes(chord);
                    if (shouldShow) {
                        btn.style.display = 'flex';
                        // Apply degree notation if selected
                        if (this.notationStyle === 'degree') {
                            btn.textContent = this.chordDegreeMap[chord] || chord;
                        } else {
                            btn.textContent = chord;
                        }
                    } else {
                        btn.style.setProperty('display', 'none', 'important');
                    }
                });
            }
        } else {
            this.noteButtonsContainer.innerHTML = '';

            const renderOctaveKeys = (octaveOffset) => {
                const allNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

                const octaveDiv = document.createElement('div');
                octaveDiv.className = 'octave-group';
                if (!cfg.isPianoLayout) {
                    octaveDiv.style.display = 'flex';
                    octaveDiv.style.justifyContent = 'center';
                    octaveDiv.style.gap = '15px';
                    octaveDiv.style.flexWrap = 'wrap';
                    octaveDiv.style.width = '100%';
                    if (octaveOffset > 0) octaveDiv.style.marginTop = '15px';
                }

                allNotes.forEach(note => {
                    const isBlack = note.includes('#');
                    const shouldShow = pool.includes(note);

                    if (cfg.isPianoLayout) {
                        // In Piano layout, we must render a placeholder even if unselected to maintain key spacing
                        const btn = document.createElement('button');
                        btn.className = `note-btn ${isBlack ? 'black-key accidental' : 'white-key'}`;
                        if (!shouldShow) {
                            btn.style.visibility = 'hidden';
                            // Still add it to take up space in flow
                            octaveDiv.appendChild(btn);
                            return;
                        }

                        btn.dataset.note = note;
                        btn.dataset.octaveOffset = octaveOffset;

                        let text = note;
                        if (this.stage === 99) {
                            if (cfg.answerMethod === 'degree') {
                                text = this.getDegreeName(note);
                            } else if (cfg.answerMethod === 'solfege') {
                                text = this.getProSolfegeDisplay(note);
                            } else if (cfg.answerMethod === 'note') {
                                text = this.getProNoteLetterDisplay(note);
                            } else {
                                text = this.notationStyle === 'doremi' ? (this.getProSolfegeDisplay(note)) : (this.notationStyle === 'degree' ? this.getDegreeName(note) : this.getProNoteLetterDisplay(note));
                            }
                        } else {
                            text = this.notationStyle === 'doremi' ? (this.doremiMap[note] || note) : (this.notationStyle === 'degree' ? this.getDegreeName(note) : note);
                        }
                        btn.textContent = text;

                        btn.addEventListener('mousedown', (e) => this.handleInput(note, octaveOffset));
                        btn.addEventListener('touchstart', (e) => {
                            e.preventDefault();
                            this.handleInput(note, octaveOffset);
                        });

                        octaveDiv.appendChild(btn);
                    } else {
                        // Standard Layout - only render visible buttons
                        if (!shouldShow) return;

                        const btn = document.createElement('button');
                        btn.className = 'note-btn';
                        if (isBlack) btn.classList.add('accidental');
                        btn.dataset.note = note;
                        btn.dataset.octaveOffset = octaveOffset;

                        let text = note;
                        if (this.stage === 99) {
                            if (cfg.answerMethod === 'degree') {
                                text = this.getDegreeName(note);
                            } else if (cfg.answerMethod === 'solfege') {
                                text = this.getProSolfegeDisplay(note);
                            } else if (cfg.answerMethod === 'note') {
                                text = this.getProNoteLetterDisplay(note);
                            } else {
                                text = this.notationStyle === 'doremi' ? (this.getProSolfegeDisplay(note)) : (this.notationStyle === 'degree' ? this.getDegreeName(note) : this.getProNoteLetterDisplay(note));
                            }
                        } else {
                            text = this.notationStyle === 'doremi' ? (this.doremiMap[note] || note) : (this.notationStyle === 'degree' ? this.getDegreeName(note) : note);
                        }
                        btn.textContent = text;

                        btn.addEventListener('mousedown', (e) => this.handleInput(note, octaveOffset));
                        btn.addEventListener('touchstart', (e) => {
                            e.preventDefault();
                            this.handleInput(note, octaveOffset);
                        });

                        octaveDiv.appendChild(btn);
                    }
                });
                this.noteButtonsContainer.appendChild(octaveDiv);
            };

            renderOctaveKeys(0);
            if (this.stage === 99 && cfg.is2Octave) {
                renderOctaveKeys(1);
            }

            if (cfg.isPianoLayout) {
                this.noteButtonsContainer.classList.add('piano-layout');
            } else {
                this.noteButtonsContainer.classList.remove('piano-layout');
            }

            this.noteBtns = document.querySelectorAll('.note-btn');
            this.noteButtonsContainer.style.display = 'flex';
            this.chordButtonsContainer.style.display = 'none';
        }

        this.updateInGameProSettingsButton();

        // 初回問題の前に AudioContext を確実に running にしてから nextRound（無音の競合を減らす）
        setTimeout(async () => {
            try {
                await this.audio.resumeContext();
            } catch (_) { /* ignore */ }
            void this.nextRound();
        }, 500 / this.noteSpeed);
    }


    async playScale(callback) {
        await this.audio.resumeContext();
        const scale = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
        const noteDuration = 0.13 / this.noteSpeed; // スピードに連動
        const now = this.audio.ctx.currentTime;

        scale.forEach((note, index) => {
            const octave = (index === 7) ? this.baseOctave + 1 : this.baseOctave;
            this.audio.playNote(note + octave, noteDuration, now + (index * noteDuration), this.keyOffset);
        });

        // Callback after scale finishes (speed-adjusted)
        if (callback) {
            const delay = (scale.length * noteDuration * 1000) + 250 / this.noteSpeed;
            setTimeout(() => {
                Promise.resolve(callback()).catch(() => {});
            }, delay);
        }
    }

    // Helper: serialize a sequence into a comparable string key
    serializeSequence(seq) {
        return seq.map(item => {
            if (typeof item === 'string') return item;
            if (item && item.id) return item.id;           // custom chord object
            if (item && item.name) return item.name;       // named chord object
            if (item && item.note) return item.note + ':' + (item.octaveOffset || 0); // 2-octave note
            return JSON.stringify(item);
        }).join(',');
    }

    async nextRound() {
        if (!this.isPlaying) return;

        try {
            await this.audio.resumeContext();
        } catch (_) { /* ignore */ }

        this.isBlockingInput = true;
        this.isRoundOver = false;
        this.inputIndex = 0;

        const cfg = this.stageConfig[this.stage] || this.stageConfig[3];

        // Retry loop to avoid consecutive duplicate questions
        const maxRetries = 10;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            this.currentSequence = [];

            if (this.stage === 199 && this.proQuestionMode === 'progressions') {
                const activeProgs = this.customProgressions.filter(p => p.isActive !== false);
                const poolIds = cfg.pool.map(c => c.id);

                // Filter progressions where every chord is in the current active pool
                const validProgs = activeProgs.filter(prog =>
                    prog.chords.every(chordId => poolIds.includes(chordId))
                );

                if (validProgs.length > 0) {
                    const selectedProg = validProgs[Math.floor(Math.random() * validProgs.length)];
                    // Play the progression EXACTLY as defined, ignoring cfg.count
                    for (let i = 0; i < selectedProg.chords.length; i++) {
                        const chordId = selectedProg.chords[i];
                        const chordObj = cfg.pool.find(c => c.id === chordId);
                        if (chordObj) {
                            this.currentSequence.push(chordObj);
                        }
                    }
                }
            } else if (cfg.isChord && this.chordPatternMode === 'progression' && this.stage !== 199) {
                const baseProgressions = [
                    ['C', 'F', 'G', 'C'],        // 基本進行
                    ['C', 'F', 'C', 'G'],        // Pop Standard
                    ['C', 'G', 'F', 'G'],        // Pop Standard 2
                    ['C', 'Am', 'F', 'G'],       // 1950s
                    ['F', 'G', 'Em', 'Am'],      // 王道進行
                    ['Am', 'F', 'G', 'C'],       // 小室進行
                    ['Dm', 'G', 'C', 'Am'],      // 前ツーファイブワン
                    ['Am', 'Dm', 'G', 'C'],      // 後ツーファイブワン
                    ['C', 'G', 'Am', 'Em'],      // カノン進行前半
                    ['F', 'C', 'F', 'G'],        // カノン進行後半
                    ['F', 'C', 'G', 'Am'],       // ポップパンク
                    ['C', 'G', 'Am', 'F'],       // Let it be進行
                    ['Am', 'F', 'C', 'G'],       // 洋楽定番 (6415)
                    ['F', 'G', 'Am', 'C'],       // 王道アレンジ (4561)
                    ['Am', 'G', 'F', 'G'],       // マイナー下降
                    ['Em', 'Am', 'Dm', 'G'],     // 強進行 (3625)
                    ['C', 'Am', 'Dm', 'G'],      // 625強進行 (1625)
                    ['Em', 'F', 'G', 'Am'],      // 上昇順次進行 (3456)
                    ['C', 'Em', 'Am', 'C'],      // トニック進行 (1361)
                    ['Dm', 'Em', 'F', 'G']       // 上昇順次進行2 (2345)
                ];

                const isCustom = cfg.isCustomChord;
                // Get available chord names from the pool
                const poolNames = isCustom ? cfg.pool.map(c => c.name) : cfg.pool;

                // Filter progressions to those where ALL chords are present in the current pool
                const validProgressions = baseProgressions.filter(prog =>
                    prog.every(chord => poolNames.includes(chord))
                );

                if (validProgressions.length > 0) {
                    // Select a random valid progression
                    const selectedProg = validProgressions[Math.floor(Math.random() * validProgressions.length)];

                    // Build sequence up to cfg.count by looping the selected progression if needed
                    for (let i = 0; i < cfg.count; i++) {
                        const chordName = selectedProg[i % selectedProg.length];
                        if (isCustom) {
                            this.currentSequence.push(cfg.pool.find(c => c.name === chordName));
                        } else {
                            this.currentSequence.push(chordName);
                        }
                    }
                }
            }

            // Fallback to random if progression mode failed to find a match, or if in random mode
            if (this.currentSequence.length === 0) {
                for (let i = 0; i < cfg.count; i++) {
                    const randomNote = cfg.pool[Math.floor(Math.random() * cfg.pool.length)];
                    if (this.stage === 99 && cfg.is2Octave) {
                        const randomOctaveOffset = Math.floor(Math.random() * 2); // 0 or 1
                        this.currentSequence.push({ note: randomNote, octaveOffset: randomOctaveOffset });
                    } else {
                        this.currentSequence.push(randomNote);
                    }
                }
            }

            // Check for 3 consecutive duplicates (allow 2, block 3)
            const currentKey = this.serializeSequence(this.currentSequence);
            const isTripleDuplicate = this.previousSequenceKeys.length >= 2 &&
                this.previousSequenceKeys[this.previousSequenceKeys.length - 1] === currentKey &&
                this.previousSequenceKeys[this.previousSequenceKeys.length - 2] === currentKey;
            if (!isTripleDuplicate || attempt === maxRetries - 1) {
                // Keep only the last 2 keys
                this.previousSequenceKeys.push(currentKey);
                if (this.previousSequenceKeys.length > 2) {
                    this.previousSequenceKeys.shift();
                }
                break; // Accept this sequence
            }
            // else: 3rd consecutive duplicate detected, retry
        }

        if (this.scaleEnabled) {
            this.showFeedback('音階を聴いてください...');
            void this.playScale(async () => {
                this.showFeedback('問題を聴いてください...');
                await this.playSequence();
                this.isBlockingInput = false;
            });
        } else {
            this.showFeedback('問題を聴いてください...');
            await this.playSequence();
            this.isBlockingInput = false;
        }
    }

    showStageSelector() {
        this.isPlaying = false;
        this.updateInGameProSettingsButton();
        this.overlay.classList.remove('hidden');
        // 最後に選んだカテゴリ画面に戻る
        ['screen-home', 'screen-melody', 'screen-chord'].forEach(id => {
            if (document.getElementById(id)) document.getElementById(id).classList.add('hidden');
        });
        if (document.getElementById(this.lastCategory)) document.getElementById(this.lastCategory).classList.remove('hidden');
    }

    showHomeScreen() {
        this.isPlaying = false;
        this.updateInGameProSettingsButton();
        this.overlay.classList.remove('hidden');
        ['screen-home', 'screen-melody', 'screen-chord'].forEach(id => {
            if (document.getElementById(id)) document.getElementById(id).classList.add('hidden');
        });
        if (document.getElementById('screen-home')) document.getElementById('screen-home').classList.remove('hidden');

        // Restore title and hide stage info
        const stageDisplay = document.getElementById('stage-info-display');
        const appTitle = document.querySelector('h1');
        if (stageDisplay) stageDisplay.style.display = 'none';
        if (appTitle) appTitle.style.display = 'block';

        this.applyTranslations();
    }

    /** 将来の多言語切り替え用。未定義のままだと例外になるため空実装 */
    applyTranslations() {
        /* no-op */
    }

    async playSequence() {
        if (!this.currentSequence.length) return;

        await this.audio.resumeContext();
        const now = this.audio.ctx.currentTime;
        const noteDuration = 0.8 / this.noteSpeed;
        const gap = 0.2 / this.noteSpeed;

        this.currentSequence.forEach((item, index) => {
            const cfg = this.stageConfig[this.stage];
            if (cfg.isChord) {
                if (cfg.isCustomChord) {
                    // item is a chord object
                    this.audio.playCustomChord(item, this.baseOctave, noteDuration, now + (index * (noteDuration + gap)), this.keyOffset);
                } else {
                    // Pass voicing if defined
                    this.audio.playChord(item, this.baseOctave, noteDuration, now + (index * (noteDuration + gap)), this.keyOffset, cfg.chordVoicing);
                }
            } else {
                if (typeof item === 'object' && item !== null && item.note) {
                    // 2-Octave mode logic
                    const targetOctave = this.baseOctave + (item.octaveOffset || 0);
                    this.audio.playNote(item.note + targetOctave, noteDuration, now + (index * (noteDuration + gap)), this.keyOffset);
                } else {
                    this.audio.playNote(item + this.baseOctave, noteDuration, now + (index * (noteDuration + gap)), this.keyOffset);
                }
            }
        });
    }

    replaySequence() {
        // Allow replay even if playing, but reset blocking if we want to handle overlap visually
        // For now, just play. User asked to allow input during play, so we shouldn't block input.
        // We can just play the sequence.
        if (this.currentSequence.length) {
            this.showFeedback('問題を聴いてください...');
            void this.playSequence();
            // No blocking input
        }
    }

    async playTonic() {
        if (this.isPlaying) {
            await this.audio.resumeContext();
            this.audio.playNote('C' + this.baseOctave, 1.0, 0, this.keyOffset);
        }
    }

    playScaleManual() {
        // Play the scale (ドレミファソラシド) anytime the button is pressed
        void this.playScale();
    }

    async handleInput(note, inputOctaveOffset = 0) {
        if (!this.isPlaying || !this.currentSequence.length) return;

        await this.audio.resumeContext();

        const cfg = this.stageConfig[this.stage];

        // Visual feedback for click & play sound
        if (cfg.isChord) {
            if (cfg.isCustomChord) {
                this.audio.playCustomChord(note, this.baseOctave, 0.5, 0, this.keyOffset);
            } else {
                // Play with specific voicing if defined
                this.audio.playChord(note, this.baseOctave, 0.5, 0, this.keyOffset, cfg.chordVoicing);
            }
        } else {
            this.audio.playNote(note + (this.baseOctave + inputOctaveOffset), 0.3, 0, this.keyOffset);
        }

        // Check if answer mode is disabled (preview only)
        if (!this.isAnswerMode) return;

        // Prevent double submission after answering, but allow sound check above
        if (this.isRoundOver) return;

        const expectedItem = this.currentSequence[this.inputIndex];

        // Equality check depending on whether it's an object (CustomChord) or string
        let isCorrect = processEquality(note, inputOctaveOffset, expectedItem, cfg);

        function processEquality(input, inputOctave, expected, config) {
            if (config.isCustomChord) {
                return input.id === expected.id;
            }
            if (typeof expected === 'object' && expected !== null && expected.note) {
                if (config.is2Octave) {
                    return input === expected.note && inputOctave === (expected.octaveOffset || 0);
                } else {
                    return input === expected.note;
                }
            }
            return input === expected;
        }

        // Check if correct note in sequence
        if (isCorrect) {
            // Correct so far
            this.inputIndex++;
            const maxCount = this.currentSequence.length;
            this.showFeedback('正解! (' + this.inputIndex + '/' + maxCount + ')', 'correct');

            // Highlight button briefly
            let key;
            if (cfg.isChord) {
                if (cfg.isCustomChord) {
                    key = document.querySelector('.chord-btn[data-chordid="' + note.id + '"]');
                } else {
                    key = document.querySelector('.chord-btn[data-chord="' + note + '"]');
                }
            } else {
                if (cfg.is2Octave) {
                    key = document.querySelector(`.note-btn[data-note="${note}"][data-octave-offset="${inputOctaveOffset}"]`);
                } else {
                    key = document.querySelector(`.note-btn[data-note="${note}"]`);
                }
            }
            if (key) {
                key.classList.add('correct');
                setTimeout(() => key.classList.remove('correct'), 200);
            }

            if (this.inputIndex >= this.currentSequence.length) {
                this.handleCorrect();
            }
        } else {
            this.handleWrong(note, inputOctaveOffset);
        }
    }

    toggleAnswerMode(isChecked) {
        this.isAnswerMode = isChecked;
        const statusLabel = document.getElementById('answer-mode-status');

        if (this.isAnswerMode) {
            if (statusLabel) {
                statusLabel.textContent = '回答ON';
                statusLabel.style.color = '#fff';
            }
            if (this.feedbackEl) this.feedbackEl.textContent = '';
        } else {
            if (statusLabel) {
                statusLabel.textContent = '回答OFF (音確認のみ)';
                statusLabel.style.color = 'rgba(255, 255, 255, 0.6)';
            }
            if (this.feedbackEl) this.feedbackEl.textContent = '🎶 音確認モード (回答されません)';
        }
    }

    handleCorrect(note) {
        this.isRoundOver = true;
        // Score logic removed from UI, but keep internal streak
        this.streak++;
        this.updateStats();
        this.showFeedback('正解！ 素晴らしい！', 'correct');

        setTimeout(() => {
            void this.nextRound();
        }, 750 / this.noteSpeed);
    }

    handleWrong(note, inputOctaveOffset = 0) {
        this.isRoundOver = true;
        this.streak = 0;
        this.updateStats();

        let expectedNotes;
        const cfg = this.stageConfig[this.stage] || this.stageConfig[3];
        if (cfg.isChord) {
            const chordLabel = (c) => (typeof c === 'object' && c !== null && c.name ? c.name : c);
            if (cfg.isCustomChord) {
                expectedNotes = this.currentSequence.map((c) => chordLabel(c)).join(', ');
            } else {
                if (this.notationStyle === 'degree') {
                    expectedNotes = this.currentSequence.map((c) => {
                        const name = chordLabel(c);
                        return this.chordDegreeMap[name] || name;
                    }).join(', ');
                } else {
                    expectedNotes = this.currentSequence.map((c) => chordLabel(c)).join(', ');
                }
            }
        } else {
            expectedNotes = this.currentSequence.map((item) => this.formatMelodySequenceItemForFeedback(item, cfg)).join(', ');
        }
        this.showFeedback('不正解... 正解は: ' + expectedNotes, 'wrong');

        let key;
        if (cfg.isChord) {
            if (cfg.isCustomChord) {
                key = document.querySelector('.chord-btn[data-chordid="' + note.id + '"]');
            } else {
                key = document.querySelector('.chord-btn[data-chord="' + note + '"]');
            }
        } else {
            if (cfg.is2Octave && typeof note === 'string') {
                key = document.querySelector(
                    `.note-btn[data-note="${note}"][data-octave-offset="${inputOctaveOffset}"]`
                );
            }
            if (!key) {
                key = document.querySelector('.note-btn[data-note="' + note + '"]');
            }
        }
        if (key) key.classList.add('wrong');

        setTimeout(() => {
            if (key) key.classList.remove('wrong');

            // Replay correct sequence with highlights
            setTimeout(() => {
                void this.playSequence();

                // playSequence と同じ間隔でハイライト
                const noteDuration = 0.8 / this.noteSpeed;
                const gap = 0.2 / this.noteSpeed;
                const intervalMs = (noteDuration + gap) * 1000;

                this.currentSequence.forEach((item, index) => {
                    setTimeout(() => {
                        let correctKey;
                        // Use isChord property from config instead of stage number hack
                        const isChordStage = this.stageConfig[this.stage] && this.stageConfig[this.stage].isChord;

                        if (isChordStage) {
                            if (cfg.isCustomChord) {
                                correctKey = document.querySelector('.chord-btn[data-chordid="' + item.id + '"]');
                            } else {
                                const chordName = typeof item === 'object' && item !== null && item.name ? item.name : item;
                                correctKey = document.querySelector('.chord-btn[data-chord="' + chordName + '"]');
                            }
                        } else {
                            if (typeof item === 'object' && item !== null && item.note !== undefined && cfg.is2Octave) {
                                correctKey = document.querySelector(
                                    `.note-btn[data-note="${item.note}"][data-octave-offset="${item.octaveOffset || 0}"]`
                                );
                            } else {
                                const noteStr = typeof item === 'object' && item !== null && item.note ? item.note : item;
                                correctKey = document.querySelector('.note-btn[data-note="' + noteStr + '"]');
                            }
                        }

                        if (correctKey) {
                            correctKey.classList.add('correct');
                            setTimeout(() => correctKey.classList.remove('correct'), intervalMs * 0.8);
                        }
                    }, index * intervalMs);
                });

                // Delay based on sequence length × interval
                const stageLen = this.currentSequence.length;
                setTimeout(() => void this.nextRound(), (stageLen * intervalMs) + 750 / this.noteSpeed);
            }, 500 / this.noteSpeed);
        }, 250 / this.noteSpeed);
    }

    showFeedback(text, type = '') {
        this.feedbackEl.textContent = text;
        this.feedbackEl.className = 'feedback-display';
        if (type) {
            this.feedbackEl.classList.add('feedback-' + type);
        }
    }
}

/**
 * ページを読み直す（キャッシュを避けやすいようクエリを付与）
 */
function reloadAppWithCacheBust() {
    try {
        if (window.game && window.game.audio && typeof window.game.audio.closeContextForNavigation === 'function') {
            window.game.audio.closeContextForNavigation();
        }
    } catch (_) { /* ignore */ }
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('_r', String(Date.now()));
        window.location.replace(url.toString());
    } catch (e) {
        window.location.reload();
    }
}

function getPitchTrainerVersionLabel() {
    const edition = document.documentElement.dataset.appEdition;
    const ed = edition ? ` · ${edition}` : '';
    return `Ver ${PITCH_TRAINER_APP_VERSION}${ed}`;
}

function applyAppVersionDisplay() {
    const el = document.getElementById('app-version-display');
    if (el) el.textContent = getPitchTrainerVersionLabel();
}

/**
 * 右下「ページを更新」＋サービスワーカーで新しい版を検知したときのバナー
 */
function setupAppRefreshAndSwUpdates() {
    applyAppVersionDisplay();
    document.querySelectorAll('.js-reload-app').forEach((btn) => {
        btn.addEventListener('click', () => reloadAppWithCacheBust());
    });

    const banner = document.getElementById('app-update-banner');
    const updateReload = document.getElementById('app-update-reload-btn');
    const updateDismiss = document.getElementById('app-update-dismiss-btn');

    function showUpdateBanner() {
        if (banner) banner.classList.remove('hidden');
    }

    function hideUpdateBanner() {
        if (banner) banner.classList.add('hidden');
    }

    if (updateReload) {
        updateReload.addEventListener('click', () => reloadAppWithCacheBust());
    }
    if (updateDismiss) {
        updateDismiss.addEventListener('click', hideUpdateBanner);
    }

    if (!('serviceWorker' in navigator)) return;

    function attachUpdateListener(reg) {
        if (!reg || reg.__pitchTrainerUpdateHook) return;
        reg.__pitchTrainerUpdateHook = true;

        if (reg.waiting && navigator.serviceWorker.controller) {
            showUpdateBanner();
        }

        reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateBanner();
                }
            });
        });
    }

    navigator.serviceWorker.ready.then((reg) => attachUpdateListener(reg));

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            navigator.serviceWorker.getRegistration().then((r) => {
                if (r) void r.update();
            });
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    unregisterLegacyRootServiceWorker();
    window.game = new Game();
    setupAppRefreshAndSwUpdates();
});
