// AudioEngine Class
class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.notes = {
            // Octave 2
            'C2': 65.41, 'C#2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'E2': 82.41, 'F2': 87.31, 'F#2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'A2': 110.00, 'A#2': 116.54, 'B2': 123.47,
            // Octave 3
            'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
            // Octave 4
            'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
            // Octave 5
            'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
            // Octave 6 (Just C6 for high end)
            'C6': 1046.50
        };
        this.currentInstrument = 'acoustic_guitar';
        this.sustainTime = 0.5; // 余韻の長さ（秒）。設定から変更可能。

        // モバイルブラウザ対策: ユーザー操作でAudioContextを起こすリスナー
        this._setupResumeHandlers();
    }

    /**
     * AudioContextが確実に動作している状態にする
     * モバイルブラウザでは一定時間操作がないとsuspendされるケースがある
     */
    ensureContext() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        // AudioContextが壊れた場合（closed）の復旧
        if (this.ctx.state === 'closed') {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    /**
     * バックグラウンド復帰、タッチ操作などでAudioContextを自動的に復帰させる
     */
    _setupResumeHandlers() {
        // アプリがフォアグラウンドに戻った時にAudioContextを復帰
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        });

        // タッチ/クリック時にAudioContextを確実に起こす（一度だけ）
        const resumeOnInteraction = () => {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        };
        document.addEventListener('touchstart', resumeOnInteraction, { passive: true });
        document.addEventListener('touchend', resumeOnInteraction, { passive: true });
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
        // source → bodyRes1 → bodyRes2 → presence → highCut → outputGain → destination
        source.connect(bodyRes1);
        bodyRes1.connect(bodyRes2);
        bodyRes2.connect(presence);
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

        const transposedFrequency = frequency * Math.pow(2, keyOffset / 12);
        const now = time || this.ctx.currentTime;

        // Piano synthesis: Triangle wave with harmonics
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.value = transposedFrequency;

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        // Piano envelope: Fast attack, decay controlled by sustainTime
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.4, now + 0.005); // Fast attack
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration + this.sustainTime);

        osc.start(now);
        osc.stop(now + duration + this.sustainTime);
    }

    playViolin(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        const transposedFrequency = frequency * Math.pow(2, keyOffset / 12);
        const now = time || this.ctx.currentTime;

        // Violin synthesis: Sawtooth with bandpass filter and vibrato
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gainNode = this.ctx.createGain();
        const vibrato = this.ctx.createOscillator();
        const vibratoGain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.value = transposedFrequency;

        // Vibrato (6Hz, ~10 cents depth)
        vibrato.frequency.value = 6;
        vibratoGain.gain.value = transposedFrequency * 0.006; // ~10 cents
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);

        // Bandpass filter for formant
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 2;

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        // Violin envelope: Slow attack, sustained, release controlled by sustainTime
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.25, now + 0.05); // Slow attack (bowing)
        gainNode.gain.setValueAtTime(0.25, now + duration); // Sustain
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration + this.sustainTime);

        vibrato.start(now);
        osc.start(now);
        vibrato.stop(now + duration + this.sustainTime);
        osc.stop(now + duration + this.sustainTime);
    }

    playElectricGuitar(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        const transposedFrequency = frequency * Math.pow(2, keyOffset / 12);
        const now = time || this.ctx.currentTime;

        // Electric guitar: Square wave with distortion and long sustain
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const distortion = this.ctx.createWaveShaper();
        const gainNode = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.value = transposedFrequency;

        // Subtle distortion curve
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i - 128) / 128;
            curve[i] = Math.tanh(x * 1.5); // Soft clipping
        }
        distortion.curve = curve;

        // Lowpass filter
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(5000, now);
        filter.frequency.exponentialRampToValueAtTime(1000, now + 0.3);
        filter.Q.value = 1;

        osc.connect(distortion);
        distortion.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        // Electric guitar envelope: Fast attack, sustain controlled by sustainTime
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.005);
        gainNode.gain.setValueAtTime(0.2, now + duration);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration + this.sustainTime);

        osc.start(now);
        osc.stop(now + duration + this.sustainTime);
    }
}


// Game Class
class Game {
    constructor() {
        this.audio = new AudioEngine();
        this.currentSequence = [];
        this.inputIndex = 0;
        this.stage = 1;
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
        this.chordPatternMode = 'progression'; // 'random' または 'progression'
        this.proQuestionMode = 'chords'; // 'chords' or 'progressions'
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
            103: { pool: ['C', 'F', 'G', 'Am'], count: 4, isChord: true, chordVoicing: [0, 1], label: 'Stage 3', description: 'C, F, G, Am (2和音)' },
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
        if (document.getElementById('settings-btn')) document.getElementById('settings-btn').addEventListener('click', () => {
            if (this.settingsModal) {
                this.settingsModal.classList.remove('hidden');
            }
        });

        // Pro Settings button（ゲーム中ヘッダー、Proステージ用）
        if (document.getElementById('game-pro-settings-btn')) document.getElementById('game-pro-settings-btn').addEventListener('click', () => {
            if (this.stage === 99 && this.proSettingsModal) {
                this.proSettingsModal.classList.remove('hidden');
            } else if (this.stage === 199 && this.proChordSettingsModal) {
                this.proChordSettingsModal.classList.remove('hidden');
            }
        });

        // Settings button（トップページ）
        if (document.getElementById('home-settings-btn')) document.getElementById('home-settings-btn').addEventListener('click', () => {
            if (this.settingsModal) {
                this.settingsModal.classList.remove('hidden');
            }
        });

        // Settings button（メロディ選択画面）
        if (document.getElementById('melody-settings-btn')) document.getElementById('melody-settings-btn').addEventListener('click', () => {
            if (this.settingsModal) {
                this.settingsModal.classList.remove('hidden');
            }
        });

        // Settings button（コード選択画面）
        if (document.getElementById('chord-settings-btn')) document.getElementById('chord-settings-btn').addEventListener('click', () => {
            if (this.settingsModal) {
                this.settingsModal.classList.remove('hidden');
            }
        });

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

        // Settings modal close
        if (document.getElementById('close-settings')) document.getElementById('close-settings').addEventListener('click', () => {
            if (this.settingsModal) {
                this.settingsModal.classList.add('hidden');
            }
        });

        // Octave controls
        if (document.getElementById('octave-down')) document.getElementById('octave-down').addEventListener('click', () => this.updateOctave(-1));
        if (document.getElementById('octave-up')) document.getElementById('octave-up').addEventListener('click', () => this.updateOctave(1));

        // Key selector
        if (this.keySelector) {
            this.keySelector.addEventListener('change', (e) => this.updateKey(parseInt(e.target.value)));
        }

        // Instrument selector
        if (this.instrumentSelector) {
            this.instrumentSelector.addEventListener('change', (e) => this.updateInstrument(e.target.value));
        }

        // Language selector

        // Reset button
        if (document.getElementById('reset-settings')) document.getElementById('reset-settings').addEventListener('click', () => this.resetToDefaults());

        // 余韻スライダー
        const sustainSlider = document.getElementById('sustain-slider');
        const sustainValue = document.getElementById('sustain-value');
        if (sustainSlider) {
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

        // 問題スピードスライダー
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        if (speedSlider) speedSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.noteSpeed = val;
            if (speedValue) speedValue.textContent = val.toFixed(1);
            this.saveSettings();
        });

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

        // Open Pro Settings
        if (document.getElementById('btn-level-pro')) document.getElementById('btn-level-pro').addEventListener('click', () => {
            if (this.proSettingsModal) this.proSettingsModal.classList.remove('hidden');
        });

        // Cancel Pro Settings
        if (document.getElementById('btn-cancel-pro')) document.getElementById('btn-cancel-pro').addEventListener('click', () => {
            if (this.proSettingsModal) this.proSettingsModal.classList.add('hidden');
        });

        // Start Pro Game
        if (document.getElementById('btn-start-pro')) document.getElementById('btn-start-pro').addEventListener('click', () => {
            this.startProGame();
        });

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

        // Answer Method Logic for Pro Settings Keyboard Display
        const answerMethodSelect = document.getElementById('pro-answer-method');
        if (answerMethodSelect) {
            answerMethodSelect.addEventListener('change', (e) => {
                const method = e.target.value;
                document.querySelectorAll('.note-toggle-wrapper').forEach(wrapper => {
                    const checkbox = wrapper.querySelector('.note-toggle');
                    const noteNameLabel = wrapper.querySelector('.note-name');
                    const degreeLabel = wrapper.querySelector('.degree-label');

                    if (checkbox && noteNameLabel) {
                        const note = checkbox.dataset.note;
                        if (method === 'degree') {
                            noteNameLabel.textContent = this.getDegreeName(note);
                        } else if (method === 'solfege') {
                            noteNameLabel.textContent = this.getSolfegeName(note);
                        } else {
                            noteNameLabel.textContent = note; // default note name
                        }
                    }

                    // User requested to change the main text, so we hide the sub-label entirely
                    if (degreeLabel) {
                        degreeLabel.style.display = 'none';
                    }
                });
            });
            // Trigger initial setup
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
        const handleStartProChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault(); // Prevent double firing
            this.startProChordGame();
        };
        if (btnStartProChord) {
            btnStartProChord.addEventListener('click', handleStartProChord);
            btnStartProChord.addEventListener('touchstart', handleStartProChord, { passive: false });
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
            if (this.customChords.length >= 30) {
                alert("登録できるコードは最大30個までです。");
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
        const handlePreviewChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            const chordData = this.readChordEditorState();
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
                                { id: baseId + 100, name: '基本進行 (C, F, G, C)', chords: [c.id, f.id, g.id, c.id], isActive: true },
                                { id: baseId + 101, name: 'Pop Standard (C, F, C, G)', chords: [c.id, f.id, c.id, g.id], isActive: true },
                                { id: baseId + 102, name: 'Pop Standard 2 (C, G, F, G)', chords: [c.id, g.id, f.id, g.id], isActive: true },
                                { id: baseId + 103, name: '1950s (C, Am, F, G)', chords: [c.id, am.id, f.id, g.id], isActive: true },
                                { id: baseId + 104, name: '王道進行 (F, G, Em, Am)', chords: [f.id, g.id, em.id, am.id], isActive: true },
                                { id: baseId + 105, name: '小室進行 (Am, F, G, C)', chords: [am.id, f.id, g.id, c.id], isActive: true },
                                { id: baseId + 106, name: 'ツーファイブワン (Dm, G, C, Am)', chords: [dm.id, g.id, c.id, am.id], isActive: true },
                                { id: baseId + 107, name: 'カノン進行前半 (C, G, Am, Em)', chords: [c.id, g.id, am.id, em.id], isActive: true },
                                { id: baseId + 108, name: 'カノン進行後半 (F, C, F, G)', chords: [f.id, c.id, f.id, g.id], isActive: true },
                                { id: baseId + 109, name: 'ポップパンク (F, C, G, Am)', chords: [f.id, c.id, g.id, am.id], isActive: true },
                                { id: baseId + 110, name: 'マイナーツーファイブワン (Am, Dm, G, C)', chords: [am.id, dm.id, g.id, c.id], isActive: true }
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
            if (this.customProgressions.length >= 30) {
                alert('進行は最大30個まで登録可能です。');
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
            } else {
                alert('進行には少なくとも2つのコードが必要です。');
            }
        };
        if (btnRemoveProgChord) {
            btnRemoveProgChord.addEventListener('click', handleRemoveProgChord);
            btnRemoveProgChord.addEventListener('touchstart', handleRemoveProgChord, { passive: false });
        }

        const btnPreviewProgression = document.getElementById('btn-preview-progression');
        const handlePreviewProg = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
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
            { id: baseId + 100, name: '基本進行 (C, F, G, C)', chords: [cId, fId, gId, cId], isActive: true },
            { id: baseId + 101, name: 'Pop Standard (C, F, C, G)', chords: [cId, fId, cId, gId], isActive: true },
            { id: baseId + 102, name: 'Pop Standard 2 (C, G, F, G)', chords: [cId, gId, fId, gId], isActive: true },
            { id: baseId + 103, name: '1950s (C, Am, F, G)', chords: [cId, amId, fId, gId], isActive: true },
            { id: baseId + 104, name: '王道進行 (F, G, Em, Am)', chords: [fId, gId, emId, amId], isActive: true },
            { id: baseId + 105, name: '小室進行 (Am, F, G, C)', chords: [amId, fId, gId, cId], isActive: true },
            { id: baseId + 106, name: 'ツーファイブワン (Dm, G, C, Am)', chords: [dmId, gId, cId, amId], isActive: true },
            { id: baseId + 107, name: 'カノン進行前半 (C, G, Am, Em)', chords: [cId, gId, amId, emId], isActive: true },
            { id: baseId + 108, name: 'カノン進行後半 (F, C, F, G)', chords: [fId, cId, fId, gId], isActive: true },
            { id: baseId + 109, name: 'ポップパンク (F, C, G, Am)', chords: [fId, cId, gId, amId], isActive: true },
            { id: baseId + 110, name: 'マイナーツーファイブワン (Am, Dm, G, C)', chords: [amId, dmId, gId, cId], isActive: true }
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
                            { id: baseId + 100, name: '基本進行 (C, F, G, C)', chords: [c.id, f.id, g.id, c.id], isActive: true },
                            { id: baseId + 101, name: 'Pop Standard (C, F, C, G)', chords: [c.id, f.id, c.id, g.id], isActive: true },
                            { id: baseId + 102, name: 'Pop Standard 2 (C, G, F, G)', chords: [c.id, g.id, f.id, g.id], isActive: true },
                            { id: baseId + 103, name: '1950s (C, Am, F, G)', chords: [c.id, am.id, f.id, g.id], isActive: true },
                            { id: baseId + 104, name: '王道進行 (F, G, Em, Am)', chords: [f.id, g.id, em.id, am.id], isActive: true },
                            { id: baseId + 105, name: '小室進行 (Am, F, G, C)', chords: [am.id, f.id, g.id, c.id], isActive: true },
                            { id: baseId + 106, name: 'ツーファイブワン (Dm, G, C, Am)', chords: [dm.id, g.id, c.id, am.id], isActive: true },
                            { id: baseId + 107, name: 'カノン進行前半 (C, G, Am, Em)', chords: [c.id, g.id, am.id, em.id], isActive: true },
                            { id: baseId + 108, name: 'カノン進行後半 (F, C, F, G)', chords: [f.id, c.id, f.id, g.id], isActive: true },
                            { id: baseId + 109, name: 'ポップパンク (F, C, G, Am)', chords: [f.id, c.id, g.id, am.id], isActive: true },
                            { id: baseId + 110, name: 'マイナーツーファイブワン (Am, Dm, G, C)', chords: [am.id, dm.id, g.id, c.id], isActive: true }
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

    loadSettings() {
        try {
            const data = localStorage.getItem('pitchTrainerSettings');
            if (data) {
                const s = JSON.parse(data);
                this.isInitializing = true; // Add flag to prevent saveSettings during loading

                if (s.baseOctave !== undefined) this.updateOctave(s.baseOctave - this.baseOctave);
                if (s.keyOffset !== undefined) this.updateKey(s.keyOffset);
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
                if (s.noteSpeed !== undefined) {
                    this.noteSpeed = s.noteSpeed;
                    const speedSlider = document.getElementById('speed-slider');
                    const speedValue = document.getElementById('speed-value');
                    if (speedSlider) {
                        speedSlider.value = this.noteSpeed;
                        if (speedValue) speedValue.textContent = this.noteSpeed.toFixed(1);
                    }
                }
                if (s.isAnswerMode !== undefined) {
                    this.isAnswerMode = s.isAnswerMode;
                    const answerToggle = document.getElementById('answer-mode-toggle');
                    if (answerToggle) answerToggle.checked = this.isAnswerMode;
                    console.log("Game: toggling answer mode to", this.isAnswerMode);
                    this.toggleAnswerMode(this.isAnswerMode);
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

                this.isInitializing = false;
                this.isInitializing = false;
            } else {
                this.updateNotation('doremi');
            }
        } catch (e) {
            console.error("Failed to load settings from localStorage", e);
            this.isInitializing = false;
        }
    }

    saveSettings() {
        if (this.isInitializing) return; // Don't save while loading
        try {
            const data = {
                baseOctave: this.baseOctave,
                keyOffset: this.keyOffset,
                instrument: this.instrument,
                notationStyle: this.notationStyle,
                scaleEnabled: this.scaleEnabled,
                noteSpeed: this.noteSpeed,
                isAnswerMode: this.isAnswerMode,
                sustainTime: this.audio.sustainTime
            };
            localStorage.setItem('pitchTrainerSettings', JSON.stringify(data));
        } catch (e) {
            console.error("Failed to save settings to localStorage", e);
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
            playBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
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
            nameSpan.textContent = prog.name || '名称未設定';

            // Subtext for chord count
            const countLabel = document.createElement('span');
            countLabel.style.fontSize = '0.75rem';
            countLabel.style.color = 'rgba(255,255,255,0.5)';
            countLabel.textContent = prog.chords.length + 'コード';

            nameWrap.appendChild(toggleLabel);
            nameWrap.appendChild(nameSpan);
            nameWrap.appendChild(countLabel);

            const actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '10px';

            const playBtn = document.createElement('button');
            playBtn.className = 'btn-icon';
            playBtn.innerHTML = '▶';
            playBtn.title = '試聴';
            playBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Play chords in sequence
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
            document.getElementById('progression-name').value = progToEdit.name || '';
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

        container.appendChild(select);
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
            if (this.customProgressions.length >= 30) {
                alert('進行は最大30個まで登録可能です。');
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

    startProChordGame() {
        const activeChords = this.customChords.filter(c => c.isActive !== false);

        if (activeChords.length === 0) {
            alert('少なくとも1つのコードを選択してください。');
            return;
        }

        const countVal = parseInt(document.getElementById('pro-chord-count-slider').value) || 4;

        // For stage 199, we pass the active custom objects directly into the pool
        this.stageConfig[199] = {
            pool: activeChords,
            count: countVal,
            isChord: true,
            isCustomChord: true,
            label: 'Pro Stage',
            description: 'カスタム設定'
        };

        if (this.proChordSettingsModal) {
            this.proChordSettingsModal.classList.add('hidden');
        }

        this.startGame(199);
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

    startProGame() {
        // Collect selected notes
        const selectedNotes = [];
        document.querySelectorAll('.note-toggle:checked').forEach(t => {
            selectedNotes.push(t.dataset.note);
        });

        if (selectedNotes.length === 0) {
            alert('少なくとも1つの音を選択してください。');
            return;
        }

        // Get Note Count
        const count = parseInt(document.getElementById('pro-count-slider').value) || 4;

        // Get 2-Octave Mode
        const is2Octave = document.getElementById('pro-2octave-toggle') ? document.getElementById('pro-2octave-toggle').checked : false;

        // Get Keyboard Layout Mode
        const isPianoLayout = document.getElementById('pro-keyboard-layout-toggle') ? document.getElementById('pro-keyboard-layout-toggle').checked : false;

        // Get Answer Method
        const answerMethod = document.getElementById('pro-answer-method').value || 'note';

        // Update Stage Config 99
        this.stageConfig[99].pool = selectedNotes;
        this.stageConfig[99].count = count;
        this.stageConfig[99].is2Octave = is2Octave;
        this.stageConfig[99].isPianoLayout = isPianoLayout;
        this.stageConfig[99].answerMethod = answerMethod;
        this.stageConfig[99].description = selectedNotes.length + '音 / ' + count + '問' + (is2Octave ? ' (2Oct)' : '');

        // Hide Modal
        if (this.proSettingsModal) this.proSettingsModal.classList.add('hidden');

        // Start Game
        this.startGame(99);
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
                } else {
                    btn.textContent = noteData;
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
    previewSound() {
        const btn = document.getElementById('preview-sound');

        // 再生中は連打防止
        if ((btn && btn.classList.contains('playing'))) return;

        // AudioContextを起こす
        this.audio.ensureContext();

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

    startGame(level) {
        this.stage = level;
        this.overlay.classList.add('hidden');
        if (this.settingsModal) {
            this.settingsModal.classList.add('hidden');
        }
        this.score = 0;
        this.streak = 0;
        this.updateStats();
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

        // Pro Setting Button Toggle
        const gameProBtn = document.getElementById('game-pro-settings-btn');
        if (gameProBtn) {
            gameProBtn.style.display = 'flex';
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
                                text = this.getSolfegeName(note);
                            } else if (cfg.answerMethod === 'note') {
                                text = note;
                            } else {
                                text = this.notationStyle === 'doremi' ? (this.doremiMap[note] || note) : note;
                            }
                        } else {
                            text = this.notationStyle === 'doremi' ? (this.doremiMap[note] || note) : note;
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
                                text = this.getSolfegeName(note);
                            } else if (cfg.answerMethod === 'note') {
                                text = note;
                            } else {
                                text = this.notationStyle === 'doremi' ? (this.doremiMap[note] || note) : note;
                            }
                        } else {
                            text = this.notationStyle === 'doremi' ? (this.doremiMap[note] || note) : note;
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

        // Small delay before first note
        setTimeout(() => this.nextRound(), 500 / this.noteSpeed);
    }


    playScale(callback) {
        const scale = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
        const noteDuration = 0.13 / this.noteSpeed; // スピードに連動
        const now = this.audio.ctx.currentTime;

        scale.forEach((note, index) => {
            const octave = (index === 7) ? this.baseOctave + 1 : this.baseOctave;
            this.audio.playNote(note + octave, noteDuration, now + (index * noteDuration), this.keyOffset);
        });

        // Callback after scale finishes (speed-adjusted)
        if (callback) {
            setTimeout(callback, (scale.length * noteDuration * 1000) + 250 / this.noteSpeed);
        }
    }

    nextRound() {
        if (!this.isPlaying) return;

        this.isBlockingInput = true;
        this.isRoundOver = false;
        this.inputIndex = 0;
        this.currentSequence = [];

        const cfg = this.stageConfig[this.stage] || this.stageConfig[3];

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
                ['C', 'F', 'G', 'C'],        // I-IV-V-I
                ['C', 'F', 'C', 'G'],        // Pop standard
                ['C', 'G', 'F', 'G'],        // Pop standard
                ['C', 'Am', 'F', 'G'],       // 1950s progression
                ['F', 'G', 'Em', 'Am'],      // Royal Road (王道進行)
                ['Am', 'F', 'G', 'C'],       // TK progression (小室進行)
                ['Dm', 'G', 'C', 'Am'],      // ii-V-I-vi
                ['C', 'G', 'Am', 'Em'],      // Canon progression
                ['F', 'C', 'G', 'Am'],       // Pop Punk
                ['Am', 'Dm', 'G', 'C']       // Minor ii-V-I
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

        if (this.scaleEnabled) {
            this.showFeedback('音階を聴いてください...');
            this.playScale(() => {
                this.showFeedback('問題を聴いてください...');
                this.playSequence();
                this.isBlockingInput = false;
            });
        } else {
            this.showFeedback('問題を聴いてください...');
            this.playSequence();
            this.isBlockingInput = false;
        }
    }

    showStageSelector() {
        this.isPlaying = false;
        this.overlay.classList.remove('hidden');
        // 最後に選んだカテゴリ画面に戻る
        ['screen-home', 'screen-melody', 'screen-chord'].forEach(id => {
            if (document.getElementById(id)) document.getElementById(id).classList.add('hidden');
        });
        if (document.getElementById(this.lastCategory)) document.getElementById(this.lastCategory).classList.remove('hidden');
    }

    showHomeScreen() {
        this.isPlaying = false;
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

        this.applyTranslations(); // Refresh translations for home screen
    }

    playSequence() {
        if (!this.currentSequence.length) return;

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
            this.playSequence();
            // No blocking input
        }
    }

    playTonic() {
        if (this.isPlaying) {
            // Play the tonic note (C in the current key/octave)
            this.audio.playNote('C' + this.baseOctave, 1.0, 0, this.keyOffset);
        }
    }

    playScaleManual() {
        // Play the scale (ドレミファソラシド) anytime the button is pressed
        this.playScale();
    }

    handleInput(note, inputOctaveOffset = 0) {
        if (!this.isPlaying || !this.currentSequence.length) return;

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
            this.handleWrong(note);
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
            this.nextRound();
        }, 750 / this.noteSpeed);
    }

    handleWrong(note) {
        this.isRoundOver = true;
        this.streak = 0;
        this.updateStats();

        let expectedNotes;
        const cfg = this.stageConfig[this.stage] || this.stageConfig[3];
        if (cfg.isChord) {
            if (cfg.isCustomChord) {
                expectedNotes = this.currentSequence.map(c => c.name).join(', ');
            } else {
                expectedNotes = this.currentSequence.join(', ');
            }
        } else {
            if (this.stage === 99 && cfg.answerMethod === 'degree') {
                expectedNotes = this.currentSequence.map(n => this.getDegreeName(n)).join(', ');
            } else if (this.stage === 99 && cfg.answerMethod === 'solfege') {
                expectedNotes = this.currentSequence.map(n => this.getSolfegeName(n)).join(', ');
            } else {
                expectedNotes = this.currentSequence.map(n => this.noteToSolfege[n]).join(', ');
            }
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
            key = document.querySelector('.note-btn[data-note="' + note + '"]');
        }
        if (key) key.classList.add('wrong');

        setTimeout(() => {
            if (key) key.classList.remove('wrong');

            // Replay correct sequence with highlights
            setTimeout(() => {
                this.playSequence();

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
                                correctKey = document.querySelector('.chord-btn[data-chord="' + item + '"]');
                            }
                        } else {
                            correctKey = document.querySelector('.note-btn[data-note="' + item + '"]');
                        }

                        if (correctKey) {
                            correctKey.classList.add('correct');
                            setTimeout(() => correctKey.classList.remove('correct'), intervalMs * 0.8);
                        }
                    }, index * intervalMs);
                });

                // Delay based on sequence length × interval
                const stageLen = this.currentSequence.length;
                setTimeout(() => this.nextRound(), (stageLen * intervalMs) + 750 / this.noteSpeed);
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
