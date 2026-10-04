const BASE_SEMITONES = { 'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11 };
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.connect(audioCtx.destination);

const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
const melodyInput = document.getElementById('melodyInput');
const playBtn = document.getElementById('playBtn');
const copyBtn = document.getElementById('copyBtn');
const statusText = document.getElementById('status');

let beatAlpha = 0;
let playbackTimeouts = [];

function clearScheduledPlayback() {
    playbackTimeouts.forEach(t => clearTimeout(t));
    playbackTimeouts = [];
}

function draw() {
    requestAnimationFrame(draw);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    canvasCtx.fillStyle = '#0f172a';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#38bdf8';
    canvasCtx.beginPath();
    const sliceWidth = canvas.width / dataArray.length;
    let x = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;
        if (i === 0) canvasCtx.moveTo(x, y); else canvasCtx.lineTo(x, y);
        x += sliceWidth;
    }
    canvasCtx.stroke();

    if (beatAlpha > 0) {
        canvasCtx.save();
        canvasCtx.shadowBlur = 20;
        canvasCtx.shadowColor = "#38bdf8";
        canvasCtx.fillStyle = `rgba(56, 189, 248, ${beatAlpha})`;
        canvasCtx.beginPath();
        canvasCtx.arc(canvas.width - 30, 30, 12, 0, Math.PI * 2);
        canvasCtx.fill();
        canvasCtx.restore();
        beatAlpha *= 0.88;
    }
}
draw();

function parseAccidentals(accidentalStr) {
    if (!accidentalStr) return 0;
    let offset = 0;
    for (const char of accidentalStr) {
        if (char === 'p') offset += 1;
        else if (char === 'q') offset -= 1;
    }
    return offset;
}

function getFrequency(pitch, accidentalStr, octave) {
    const base = BASE_SEMITONES[pitch] ?? 0;
    const offset = parseAccidentals(accidentalStr);
    const semitoneIndex = (octave * 12) + base + offset;
    return 440 * Math.pow(2, (semitoneIndex - 57) / 12);
}

function calculateDuration(denom, dotCount, commaCount, hyphenCount, tempo) {
    const baseDuration = (4 / denom) * (60 / tempo) * (1 + hyphenCount);
    const dotMultiplier = 2 - Math.pow(0.5, dotCount);
    const commaDivisor = Math.pow(2, commaCount);
    return (baseDuration * dotMultiplier) / commaDivisor;
}

function scheduleNote(notes, startTime, duration) {
    const vol = 0.32 / Math.max(1, notes.length);

    notes.forEach(n => {
        if (n.pitch === 'r') return;
        const freq = getFrequency(n.pitch, n.accidentals, n.octave);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        const initialCutoff = Math.min(9000, freq * 7 + 1000);
        const sustainCutoff = Math.min(5000, freq * 3.5 + 400);

        filter.frequency.setValueAtTime(initialCutoff, startTime);
        filter.frequency.exponentialRampToValueAtTime(sustainCutoff, startTime + Math.min(duration * 0.8, 1.2));
        filter.Q.setValueAtTime(0.7, startTime);
        filter.connect(analyser);

        const voiceGain = audioCtx.createGain();
        voiceGain.connect(filter);

        voiceGain.gain.setValueAtTime(0.0001, startTime);
        voiceGain.gain.linearRampToValueAtTime(vol, startTime + 0.007);
        voiceGain.gain.exponentialRampToValueAtTime(vol * 0.72, startTime + 0.12);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 1.9);

        const partials = [
            { mult: 1.000, detune: -2, gain: 0.85, type: 'sine' },
            { mult: 1.000, detune: +2, gain: 0.85, type: 'sine' },
            { mult: 2.003, detune: 0,  gain: 0.35, type: 'sine' },
            { mult: 3.010, detune: +1, gain: 0.18, type: 'triangle' },
            { mult: 4.020, detune: -2, gain: 0.08, type: 'sine' }
        ];

        partials.forEach(p => {
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();

            osc.type = p.type;
            osc.frequency.setValueAtTime(freq * p.mult, startTime);
            osc.detune.setValueAtTime(p.detune, startTime);

            g.gain.setValueAtTime(p.gain, startTime);
            if (p.mult > 2) {
                g.gain.exponentialRampToValueAtTime(0.01, startTime + Math.min(duration * 1.2, 0.9));
            }

            osc.connect(g);
            g.connect(voiceGain);
            osc.start(startTime);
            osc.stop(startTime + duration * 1.95);
        });

        playFeltHammerThud(startTime, freq, filter);
    });
}

function playFeltHammerThud(startTime, freq, destination) {
    const thudFreq = Math.max(70, Math.min(220, freq * 0.6));
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(thudFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.035);

    gain.gain.setValueAtTime(0.18, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.035);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(startTime);
    osc.stop(startTime + 0.04);
}

function getShareUrl() {
    const val = melodyInput.value.trim();
    const isBlob = window.location.protocol === 'blob:';
    const baseUrl = isBlob ? window.location.href.split('?')[0] : (window.location.origin + window.location.pathname);
    const url = new URL(baseUrl);
    if (val) {
        url.searchParams.set('melody', val);
    } else {
        url.searchParams.delete('melody');
    }
    return url.href;
}

function updateUrl() {
    const url = getShareUrl();
    if (window.location.protocol !== 'blob:' && window.location.protocol !== 'data:') {
        try {
            window.history.replaceState({}, '', url);
        } catch (e) {
            // Ignore state errors if sandboxed
        }
    }
    return url;
}

playBtn.addEventListener('click', async () => {
    clearScheduledPlayback();
    updateUrl();

    const raw = melodyInput.value;
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    // 1. Octaves: [KJkj]
    // 2. Settings: [LT]\d+
    // 3. Chords: \[[^\]]+\] followed by digits, modifiers [\.,\-]*
    // 4. Notes: [a-gr] followed by accidentals [pq]*, digits, modifiers [\.,\-]*
    const eventRegex = /([KJkj])|([LT])(\d+)|\[([^\]]+)\](\d*)([\.,\-]*)|([a-gr])([pq]*)(\d*)([\.,\-]*)/g;
    let match;
    let currentTime = audioCtx.currentTime + 0.1;
    let globalOctave = 4;
    let currentTempo = 120;
    let currentDefaultLen = 4;
    let localJump = 0;

    let nextBeatTime = currentTime;
    statusText.innerText = "• PLAYING •";

    while ((match = eventRegex.exec(raw)) !== null) {
        const [_, oct, stCmd, stVal, chordContent, chordDur, chordMods, noteP, noteAcc, noteDur, noteMods] = match;

        if (oct) {
            if (oct === 'K') globalOctave++; else if (oct === 'J') globalOctave--;
            else if (oct === 'k') localJump++; else if (oct === 'j') localJump--;
            continue;
        }
        if (stCmd) {
            if (stCmd === 'L') currentDefaultLen = parseInt(stVal, 10);
            else if (stCmd === 'T') currentTempo = parseInt(stVal, 10);
            continue;
        }

        let notes = [];
        let denomStr = null;
        let modStr = "";

        if (chordContent) {
            const intReg = /([jk])|([a-g])([pq]*)/g;
            let sub, lJump = 0;
            while ((sub = intReg.exec(chordContent)) !== null) {
                if (sub[1]) lJump += (sub[1] === 'k' ? 1 : -1);
                else {
                    notes.push({ 
                        pitch: sub[2].toLowerCase(), 
                        accidentals: sub[3], 
                        octave: globalOctave + localJump + lJump 
                    });
                    lJump = 0;
                }
            }
            denomStr = chordDur;
            modStr = chordMods || "";
        } else if (noteP) {
            notes.push({ 
                pitch: noteP.toLowerCase(), 
                accidentals: noteAcc, 
                octave: globalOctave + localJump 
            });
            denomStr = noteDur;
            modStr = noteMods || "";
        }

        if (notes.length) {
            const denom = denomStr ? parseInt(denomStr, 10) : currentDefaultLen;
            const dotCount = (modStr.match(/\./g) || []).length;
            const commaCount = (modStr.match(/,/g) || []).length;
            const hyphenCount = (modStr.match(/-/g) || []).length;
            
            const stepDur = calculateDuration(denom, dotCount, commaCount, hyphenCount, currentTempo);
            const noteEndTime = currentTime + stepDur;
            const beatInterval = 60 / currentTempo;

            while (nextBeatTime < noteEndTime - 0.001) {
                const scheduleAt = (nextBeatTime - audioCtx.currentTime) * 1000;
                if (scheduleAt >= 0) {
                    const tId = setTimeout(() => { beatAlpha = 1.0; }, scheduleAt);
                    playbackTimeouts.push(tId);
                }
                nextBeatTime += beatInterval;
            }

            scheduleNote(notes, currentTime, stepDur);
            currentTime += stepDur;
            localJump = 0;
        }
    }

    const totalDur = (currentTime - audioCtx.currentTime) * 1000;
    const endTId = setTimeout(() => { statusText.innerText = "IDLE"; }, Math.max(0, totalDur));
    playbackTimeouts.push(endTId);
});

copyBtn.addEventListener('click', async () => {
    const url = updateUrl();
    const fallbackCopy = (text) => {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    };

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
        } else {
            fallbackCopy(url);
        }
        const old = statusText.innerText;
        statusText.innerText = "LINK COPIED!";
        setTimeout(() => { statusText.innerText = old; }, 1500);
    } catch (err) {
        fallbackCopy(url);
        const old = statusText.innerText;
        statusText.innerText = "LINK COPIED!";
        setTimeout(() => { statusText.innerText = old; }, 1500);
    }
});

document.querySelectorAll('.help code').forEach(codeEl => {
    const txt = codeEl.innerText.trim();
    if (txt.length === 1) {
        codeEl.classList.add('token-chip');
        codeEl.title = `Click to insert "${txt}"`;
        codeEl.addEventListener('click', () => {
            const start = melodyInput.selectionStart;
            const end = melodyInput.selectionEnd;
            const val = melodyInput.value;
            melodyInput.value = val.substring(0, start) + txt + val.substring(end);
            melodyInput.selectionStart = melodyInput.selectionEnd = start + txt.length;
            melodyInput.focus();
        });
    }
});

window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('melody')) {
        melodyInput.value = params.get('melody');
    }
};