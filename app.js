(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const setText = (id, value) => {
    const element = byId(id);
    if (element) element.textContent = value;
  };

  function bilingualContent(element, chinese, english) {
    if (!element) return;
    const primary = document.createElement('span');
    primary.textContent = chinese;
    const secondary = document.createElement('span');
    secondary.className = 'en';
    secondary.lang = 'en';
    secondary.textContent = english;
    element.replaceChildren(primary, secondary);
  }

  const englishToggle = byId('english-toggle');
  function toggleEnglish() {
    const hidden = document.body.classList.toggle('hide-english');
    englishToggle?.setAttribute('aria-pressed', String(!hidden));
    if (englishToggle) englishToggle.textContent = hidden ? 'English off' : 'English on';
    try {
      localStorage.setItem('voice-light-show-english', String(!hidden));
    } catch (_) {
      // The page works when the browser blocks local preference storage.
    }
  }
  englishToggle?.addEventListener('click', toggleEnglish);
  try {
    if (localStorage.getItem('voice-light-show-english') === 'false') {
      document.body.classList.add('hide-english');
      englishToggle?.setAttribute('aria-pressed', 'false');
      if (englishToggle) englishToggle.textContent = 'English off';
    }
  } catch (_) {
    // A saved preference is optional.
  }

  const menuToggle = byId('menu-toggle');
  const mainNav = byId('main-nav');
  function closeMenu() {
    mainNav?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }
  menuToggle?.addEventListener('click', () => {
    const open = mainNav?.classList.toggle('is-open') ?? false;
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  mainNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  let progressQueued = false;
  function updateReadingProgress() {
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    const progress = distance > 0 ? Math.min(100, Math.max(0, window.scrollY / distance * 100)) : 0;
    const fill = byId('progress-fill');
    if (fill) fill.style.width = `${progress}%`;
    progressQueued = false;
  }
  window.addEventListener('scroll', () => {
    if (progressQueued) return;
    progressQueued = true;
    requestAnimationFrame(updateReadingProgress);
  }, { passive: true });
  window.addEventListener('resize', updateReadingProgress);
  updateReadingProgress();
  byId('jump-top')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  // A one-second, deliberately simplified signal makes sampling and quantization visible.
  const canvas = byId('wave-canvas');
  const sampleRate = byId('sample-rate');
  const bitDepth = byId('bit-depth');
  const signalFrequency = byId('signal-frequency');
  const audioButton = byId('audio-play');
  let audioContext;
  let audioOscillator;
  let audioGain;
  let audioTimer;
  let audioStarting = false;
  let audioRequest = 0;

  function waveValues() {
    return {
      rate: Number(sampleRate?.value ?? 24),
      bits: Number(bitDepth?.value ?? 3),
      frequency: Number(signalFrequency?.value ?? 4),
    };
  }

  function stopAudio() {
    audioRequest += 1;
    audioStarting = false;
    clearTimeout(audioTimer);
    if (audioOscillator) {
      try {
        audioOscillator.stop();
      } catch (_) {
        // An ended oscillator needs no further cleanup.
      }
      audioOscillator.disconnect();
      audioOscillator = undefined;
    }
    audioGain?.disconnect();
    audioGain = undefined;
    if (audioButton) {
      audioButton.setAttribute('aria-pressed', 'false');
      audioButton.textContent = '聽聽看 · Play tone';
    }
  }

  async function playTone() {
    if (audioOscillator || audioStarting) {
      stopAudio();
      return;
    }
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) {
      setText('wave-caption', '這個瀏覽器無法播放測試音，仍可操作波形。');
      return;
    }
    audioStarting = true;
    const request = ++audioRequest;
    try {
      audioContext ??= new AudioEngine();
      await audioContext.resume();
      if (request !== audioRequest || document.hidden) return;
      audioOscillator = audioContext.createOscillator();
      audioGain = audioContext.createGain();
      audioOscillator.type = 'sine';
      audioOscillator.frequency.value = waveValues().frequency * 55;
      audioGain.gain.value = 0.035;
      audioOscillator.connect(audioGain);
      audioGain.connect(audioContext.destination);
      audioOscillator.start();
      audioStarting = false;
      audioButton?.setAttribute('aria-pressed', 'true');
      if (audioButton) audioButton.textContent = '停止播放 · Stop';
      audioTimer = setTimeout(stopAudio, 2500);
    } catch (_) {
      stopAudio();
      setText('wave-caption', '瀏覽器暫時無法播放測試音，請繼續觀察波形。');
    }
  }

  function drawWave() {
    const { rate, bits, frequency } = waveValues();
    const levels = 2 ** bits;
    setText('sample-rate-value', `${rate} 點 / s`);
    setText('bit-depth-value', `${bits} bit · ${levels} 階`);
    setText('signal-frequency-value', `${frequency} Hz`);
    const risk = rate <= 2 * frequency;
    const samplingStatus = byId('sampling-status');
    if (samplingStatus) {
      samplingStatus.dataset.state = risk ? 'warning' : 'good';
      bilingualContent(samplingStatus,
        risk ? '取樣太慢，可能看錯頻率！' : '取樣頻率足夠，波形較容易辨認',
        risk ? 'At or below the Nyquist boundary. Try more samples.' : 'The sampling rate is above twice this signal frequency.');
    }
    setText('wave-caption', `一秒內取樣 ${rate} 次，以 ${levels} 個振幅階級記錄 ${frequency} Hz 的正弦波。${risk ? '請提高取樣率或降低聲音頻率。' : '試著降低位元數，觀察階梯變化。'}`);
    if (audioOscillator && audioContext) {
      audioOscillator.frequency.setTargetAtTime(frequency * 55, audioContext.currentTime, 0.04);
    }
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = Math.max(280, canvas.getBoundingClientRect().width || 780);
    const height = Math.max(180, canvas.getBoundingClientRect().height || 300);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const left = width < 420 ? 22 : 38;
    const right = width - 22;
    const top = 24;
    const bottom = height - 32;
    const center = (top + bottom) / 2;
    const amplitude = (bottom - top) * 0.40;
    const x = (time) => left + time * (right - left);
    const y = (value) => center - value * amplitude;
    const signal = (time) => {
      const value = Math.sin(2 * Math.PI * frequency * time);
      return Math.abs(value) < 1e-10 ? 0 : value;
    };
    const quantize = (value) => Math.round((value + 1) / 2 * (levels - 1)) / (levels - 1) * 2 - 1;

    context.lineWidth = 1;
    context.strokeStyle = 'rgba(198, 224, 183, 0.12)';
    for (let index = 0; index <= 8; index += 1) {
      context.beginPath();
      context.moveTo(x(index / 8), top);
      context.lineTo(x(index / 8), bottom);
      context.stroke();
    }
    for (let index = 0; index < levels; index += 1) {
      context.beginPath();
      const levelY = y(index / (levels - 1) * 2 - 1);
      context.moveTo(left, levelY);
      context.lineTo(right, levelY);
      context.stroke();
    }
    context.strokeStyle = 'rgba(198, 224, 183, 0.34)';
    context.beginPath();
    context.moveTo(left, center);
    context.lineTo(right, center);
    context.stroke();

    context.strokeStyle = '#b7d6bd';
    context.lineWidth = 2.5;
    context.beginPath();
    const resolution = Math.ceil(width * 1.5);
    for (let index = 0; index <= resolution; index += 1) {
      const time = index / resolution;
      if (index === 0) context.moveTo(x(time), y(signal(time)));
      else context.lineTo(x(time), y(signal(time)));
    }
    context.stroke();

    context.beginPath();
    context.strokeStyle = '#edc67f';
    context.lineWidth = 1.8;
    for (let index = 0; index <= rate; index += 1) {
      const time = index / rate;
      const levelY = y(quantize(signal(time)));
      if (index === 0) context.moveTo(x(time), levelY);
      else context.lineTo(x(time), levelY);
      if (index < rate) context.lineTo(x((index + 1) / rate), levelY);
    }
    context.stroke();

    for (let index = 0; index <= rate; index += 1) {
      const time = index / rate;
      context.strokeStyle = 'rgba(244, 103, 56, 0.30)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x(time), center);
      context.lineTo(x(time), y(signal(time)));
      context.stroke();
      context.fillStyle = '#f46738';
      context.beginPath();
      context.arc(x(time), y(signal(time)), width < 420 ? 2.6 : 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#bad1b4';
    context.font = '12px system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillText('0 s', left, height - 8);
    context.textAlign = 'right';
    context.fillText('1 s', right, height - 8);
  }
  [sampleRate, bitDepth, signalFrequency].forEach((input) => input?.addEventListener('input', drawWave));
  byId('wave-reset')?.addEventListener('click', () => {
    if (sampleRate) sampleRate.value = '24';
    if (bitDepth) bitDepth.value = '3';
    if (signalFrequency) signalFrequency.value = '4';
    stopAudio();
    drawWave();
  });
  audioButton?.addEventListener('click', playTone);
  if (canvas && 'ResizeObserver' in window) new ResizeObserver(drawWave).observe(canvas);
  else window.addEventListener('resize', drawWave);
  drawWave();

  const flowContent = {
    input: ['收進聲音', 'Capture audio', '麥克風把空氣中的振動轉成電訊號，再經過取樣與量化，變成電腦能處理的數位資料。', '你說「打開小燈」，麥克風收到聲波。'],
    features: ['找出聲音特徵', 'Extract features', '系統把聲音切成很短的片段，分析頻率與能量等特徵。這些線索能幫助模型分辨發音。', '觀察哪些頻率出現，以及聲音隨時間如何改變。'],
    recognize: ['辨認說了什麼', 'Automatic speech recognition', '語音辨識模型把聲音特徵轉成文字，或辨認預先設定的指令。背景噪音、口音與語速都可能影響結果。', 'ASR 產生文字「打開小燈」，或輸出對應指令標籤。'],
    intent: ['理解指令意思', 'Interpret the intent', '應用程式把辨識結果對應到動作。簡單聲控燈可以用固定詞彙比對，較複雜的助手會用語言處理分析意思。', '「打開小燈」對應到「開燈」這個動作。'],
    action: ['讓裝置回應', 'Run the action', '控制程式改變輸出，例如啟用燈光、調整亮度或切換顏色。實體裝置還需要合適的電路與供電。', '本頁的模擬燈亮起，顯示這次指令的回應。'],
  };
  document.querySelectorAll('[data-flow-stage]').forEach((button) => {
    button.addEventListener('click', () => {
      const content = flowContent[button.dataset.flowStage];
      if (!content) return;
      document.querySelectorAll('[data-flow-stage]').forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
      ['flow-title', 'flow-en', 'flow-description', 'flow-example'].forEach((id, index) => setText(id, content[index]));
    });
  });

  const lampScene = byId('lamp-scene');
  const lampColors = ['#ffbc68', '#ff735f', '#ffce58', '#83dc83', '#64d6dc', '#79aaff', '#bd94fa', '#ff97c5'];
  let lamp = { on: false, brightness: 2, color: 0, automatic: false };
  let colorTimer;

  function updateLamp() {
    if (lampScene) {
      lampScene.dataset.state = lamp.on ? 'on' : 'off';
      lampScene.style.setProperty('--lamp-color', lampColors[lamp.color]);
      lampScene.style.setProperty('--lamp-brightness', lamp.on ? [0.42, 0.70, 1][lamp.brightness - 1] : 0);
    }
    setText('lamp-status', lamp.on ? '燈光已開啟' : '燈光已關閉');
    setText('lamp-brightness-value', `${lamp.brightness} / 3`);
    setText('lamp-mode', lamp.automatic ? '自動變色' : lamp.color === 0 ? '暖光模式' : '單色模式');
    document.querySelectorAll('[data-command]').forEach((button) => {
      const command = button.dataset.command;
      const active = (command === 'on' && lamp.on) || (command === 'off' && !lamp.on) || (command === 'auto' && lamp.automatic);
      button.classList.toggle('is-active', active);
    });
  }

  function manageColorTimer() {
    clearInterval(colorTimer);
    colorTimer = undefined;
    if (!lamp.automatic || !lamp.on || document.hidden) return;
    colorTimer = setInterval(() => {
      lamp.color = (lamp.color + 1) % lampColors.length;
      updateLamp();
    }, 1800);
  }

  function rememberCommand(command, response) {
    const history = byId('command-history');
    if (!history) return;
    const item = document.createElement('li');
    const commandText = document.createElement('span');
    commandText.className = 'history-command';
    commandText.textContent = command;
    const responseText = document.createElement('span');
    responseText.className = 'history-response';
    responseText.textContent = response;
    item.append(commandText, responseText);
    history.prepend(item);
    while (history.children.length > 5) history.lastElementChild.remove();
  }

  const commandActions = {
    on: ['打開小燈', () => {
      lamp.on = true;
      return '開燈完成，試試調整亮度。';
    }],
    off: ['關閉小燈', () => {
      lamp.on = false;
      return '關燈完成。';
    }],
    brighter: ['調亮一點', () => {
      if (!lamp.on) return '燈目前關閉，請先下達「打開小燈」。';
      if (lamp.brightness === 3) return '目前已是第 3 段，亮度達到上限。';
      lamp.brightness += 1;
      return `亮度提高到第 ${lamp.brightness} 段。`;
    }],
    dimmer: ['調暗一點', () => {
      if (!lamp.on) return '燈目前關閉，請先下達「打開小燈」。';
      if (lamp.brightness === 1) return '目前已是第 1 段，亮度達到下限。';
      lamp.brightness -= 1;
      return `亮度降低到第 ${lamp.brightness} 段。`;
    }],
    warm: ['調到暖光', () => {
      lamp.on = true;
      lamp.automatic = false;
      lamp.color = 0;
      return '已切換為暖光。';
    }],
    color: ['換個顏色', () => {
      lamp.on = true;
      lamp.automatic = false;
      lamp.color = (lamp.color + 1) % lampColors.length;
      return `已切換到第 ${lamp.color + 1} 種顏色。`;
    }],
    auto: ['自動變色', () => {
      lamp.on = true;
      lamp.automatic = true;
      return '開始自動變色，可以用「停止變色」保留喜歡的顏色。';
    }],
    stop: ['停止變色', () => {
      lamp.automatic = false;
      return '已停止變色，保留目前顏色。';
    }],
    resume: ['繼續變色', () => {
      lamp.on = true;
      lamp.automatic = true;
      return '繼續自動變色。';
    }],
  };

  const aliases = {
    on: ['打開小燈', '打開燈', '開燈', '開小燈', 'turn on the light', 'light on', 'turn the light on'],
    off: ['關閉小燈', '關閉燈', '關燈', '關小燈', 'turn off the light', 'light off', 'turn the light off'],
    brighter: ['調亮一點', '調亮', '亮一點', 'a little brighter', 'brighter', 'increase brightness'],
    dimmer: ['調暗一點', '調暗', '暗一點', 'a little dimmer', 'dimmer', 'decrease brightness'],
    warm: ['調到暖光', '暖光', '切換暖光', 'switch to warm light', 'warm light', 'warm'],
    color: ['換個顏色', '換顏色', '切換顏色', 'change color', 'change colour', 'next color'],
    auto: ['自動變色', 'auto color change', 'automatic color change', 'start color change'],
    stop: ['停止變色', 'stop changing color', 'stop color change', 'stop'],
    resume: ['繼續變色', 'resume color change', 'resume changing color', 'resume'],
  };
  const cleanCommand = (text) => text.toLowerCase().trim().replace(/[，。！？、,.!?“”"'「」]/g, '').replace(/\s+/g, ' ');
  const aliasMap = new Map(Object.entries(aliases).flatMap(([command, phrases]) => phrases.map((phrase) => [cleanCommand(phrase), command])));

  function executeCommand(command, spokenText) {
    const action = commandActions[command];
    const label = spokenText || action?.[0] || '';
    setText('lamp-command', label || '等待一個指令');
    const response = action ? action[1]() : '還沒對應到指令。可以試試「打開小燈」或 Turn on the light。';
    setText('lamp-response', response);
    rememberCommand(label, response);
    updateLamp();
    manageColorTimer();
  }
  function submitText(text) {
    const cleaned = text.trim().slice(0, 120);
    if (!cleaned) {
      setText('lamp-response', '先輸入一個指令，或按上方的指令按鈕。');
      byId('command-input')?.focus();
      return;
    }
    executeCommand(aliasMap.get(cleanCommand(cleaned)), cleaned);
  }
  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => executeCommand(button.dataset.command));
  });
  byId('command-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitText(byId('command-input')?.value ?? '');
  });
  byId('lamp-reset')?.addEventListener('click', () => {
    lamp = { on: false, brightness: 2, color: 0, automatic: false };
    clearInterval(colorTimer);
    updateLamp();
    byId('command-history')?.replaceChildren();
    if (byId('command-input')) byId('command-input').value = '';
    setText('lamp-command', '等待一個指令');
    setText('lamp-response', '先試試「打開小燈」。');
  });
  updateLamp();

  const micButton = byId('mic-button');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition;
  let listening = false;
  function resetMicrophone() {
    listening = false;
    micButton?.setAttribute('aria-pressed', 'false');
    if (micButton) micButton.textContent = '用聲音試試 · Microphone';
  }
  if (micButton) {
    if (!SpeechRecognition) {
      micButton.disabled = true;
      micButton.textContent = '此瀏覽器未提供語音辨識';
      setText('mic-note', '請使用指令按鈕或文字輸入。語音功能取決於瀏覽器支援。');
    } else {
      micButton.addEventListener('click', () => {
        if (listening) {
          recognition?.stop();
          return;
        }
        try {
          recognition = new SpeechRecognition();
          recognition.lang = 'zh-TW';
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.onstart = () => {
            listening = true;
            micButton.setAttribute('aria-pressed', 'true');
            micButton.textContent = '停止收音 · Stop';
            setText('lamp-response', '正在聽，請說出一個中文指令。');
          };
          recognition.onresult = (event) => {
            const transcript = event.results[event.resultIndex]?.[0]?.transcript ?? '';
            if (byId('command-input')) byId('command-input').value = transcript;
            submitText(transcript);
          };
          recognition.onerror = (event) => {
            const messages = {
              'not-allowed': '麥克風權限未開啟，可改用文字或指令按鈕。',
              'service-not-allowed': '瀏覽器未開放語音服務，可改用文字或指令按鈕。',
              'audio-capture': '找不到可用的麥克風，可改用文字或指令按鈕。',
              'no-speech': '這次沒有收到清楚語音，可以再試一次。',
              network: '語音服務連線失敗，可改用文字或指令按鈕。',
              aborted: '收音已停止。',
            };
            setText('lamp-response', messages[event.error] || '語音辨識暫時無法使用，可改用文字或指令按鈕。');
            resetMicrophone();
          };
          recognition.onend = resetMicrophone;
          listening = true;
          micButton.setAttribute('aria-pressed', 'true');
          micButton.textContent = '正在啟動麥克風…';
          recognition.start();
        } catch (_) {
          resetMicrophone();
          setText('lamp-response', '語音辨識暫時無法啟動，可改用文字或指令按鈕。');
        }
      });
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAudio();
      recognition?.abort();
    }
    manageColorTimer();
  });
  window.addEventListener('pagehide', () => {
    stopAudio();
    clearInterval(colorTimer);
    recognition?.abort();
  });

  const assembly = {
    1: ['整理底座材料', 'Prepare the base pieces', '先依原稿整理左、右材料各 3 支。把零件排好，確認方向和數量，再開始組合。', '底座材料與燈條，準備左、右材料各三支'],
    2: ['斜面朝內，左右對接', 'Join the beveled ends', '把一左一右的材料對接，斜面朝內。先試排確認角度，再依課堂示範使用適合的接著方式。', '左右材料對接形成底座角落，兩端斜面朝內'],
    3: ['完成三組，固定形狀', 'Make and secure three pairs', '完成三組配對，依示範組成底座。用膠帶輔助固定，待接著穩定後再進行下一步。', '三組底座配對與膠帶固定後的形狀'],
    4: ['扣合 IQ 燈片', 'Assemble the IQ lampshade', '組裝時保持同一面朝外，讓直線邊依示範扣在下方。觀察三點與五點相交的位置，再逐步增加燈片。', 'IQ 燈片組裝，呈現相互扣合的曲面'],
  };
  document.querySelectorAll('[data-build-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const step = button.dataset.buildStep;
      const content = assembly[step];
      if (!content) return;
      document.querySelectorAll('[data-build-step]').forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
      ['build-step-title', 'build-step-en', 'build-step-copy'].forEach((id, index) => setText(id, content[index]));
      const image = byId('build-step-image');
      if (image) {
        image.src = `assets/assembly-${step}.webp`;
        image.alt = content[3];
      }
    });
  });

  const questions = [
    {
      question: '想記錄 4 Hz 的正弦波，哪個取樣率較合適？',
      english: 'Which sampling rate is suitable for this 4 Hz sine wave?',
      options: [['4 次／秒', '4 samples/s'], ['6 次／秒', '6 samples/s'], ['24 次／秒', '24 samples/s']],
      answer: 2,
      explanation: '24 次／秒超過訊號頻率的兩倍。這個實驗可用來觀察取樣不足造成的混淆。',
      explanationEn: '24 samples/s is above twice the signal frequency. Too few samples can create aliasing.',
    },
    {
      question: '把振幅記錄從 2 bit 改成 4 bit，會發生什麼？',
      english: 'What changes when quantization increases from 2 bits to 4 bits?',
      options: [['量化階級從 4 階變成 16 階', 'Levels increase from 4 to 16'], ['音量一定變大', 'Volume must increase'], ['取樣次數一定變多', 'Sampling rate must increase']],
      answer: 0,
      explanation: 'n 個位元可表示 2 的 n 次方個階級。位元數增加讓振幅的記錄更細緻。',
      explanationEn: 'n bits represent 2ⁿ levels. More bits provide finer amplitude steps.',
    },
    {
      question: '把「說出來的聲音」轉成文字，最直接對應哪個技術？',
      english: 'Which technology turns spoken audio into text?',
      options: [['TTS 語音合成', 'Text-to-speech'], ['ASR 自動語音辨識', 'Automatic speech recognition'], ['LED 發光二極體', 'Light-emitting diode']],
      answer: 1,
      explanation: 'ASR 處理聲音辨識。TTS 則把文字轉成合成語音。',
      explanationEn: 'ASR recognizes speech. TTS converts text into synthesized speech.',
    },
    {
      question: '「難過」可能是悲傷，也可能是不容易通過。理解它需要什麼？',
      english: 'The Chinese phrase 難過 can mean sad or hard to cross. What helps identify its meaning?',
      options: [['只把音量開大', 'Only increase the volume'], ['改變燈光顏色', 'Change the light color'], ['依上下文理解語意', 'Interpret the surrounding context']],
      answer: 2,
      explanation: '同一個詞可能有多種意思。語言處理需要利用上下文判斷這次的用法。',
      explanationEn: 'Words can have several meanings. Context helps identify the intended one.',
    },
    {
      question: '測試聲控燈時，什麼做法有助於公平比較辨識結果？',
      english: 'What helps compare voice recognition results fairly?',
      options: [['固定距離與指令，再比較安靜和有噪音的環境', 'Keep distance and commands fixed, then vary noise'], ['每次同時改距離、語速和音量', 'Change distance, speed, and volume together'], ['只成功一次就記為 100%', 'Report 100% after one successful attempt']],
      answer: 0,
      explanation: '先固定大部分條件，一次比較一個變因，並記錄多次測試，才能看出條件帶來的差異。',
      explanationEn: 'Control other conditions, vary one factor, and record repeated attempts.',
    },
    {
      question: '按下網站上的「開燈」按鈕，能直接證明實體燈盤的辨識率嗎？',
      english: 'Does clicking Light on prove the recognition accuracy of a physical light board?',
      options: [['能，畫面亮了就代表辨識成功', 'Yes, because the light appears'], ['不能，這是指令與回應的教學模擬', 'No, this is a command-and-response simulation'], ['能，只要網站有麥克風按鈕', 'Yes, if the page has a microphone button']],
      answer: 1,
      explanation: '網站示範指令如何對應動作。實體裝置的辨識表現，需要用該裝置在明確條件下實測。',
      explanationEn: 'The demo shows the mapping. Hardware accuracy requires tests on the actual device under defined conditions.',
    },
  ];
  let questionIndex = 0;
  let quizScore = 0;
  let answered = false;
  const quizNext = byId('quiz-next');
  const quizOptions = byId('quiz-options');

  function renderQuestion() {
    if (!quizOptions) return;
    answered = false;
    const question = questions[questionIndex];
    const progress = byId('quiz-progress');
    setText('quiz-score', `${quizScore}`);
    setText('quiz-total', `${questions.length}`);
    if (progress) {
      if ('value' in progress) {
        progress.max = questions.length;
        progress.value = questionIndex;
      } else {
        progress.textContent = `${String(questionIndex + 1).padStart(2, '0')} / ${String(questions.length).padStart(2, '0')}`;
      }
      progress.setAttribute('aria-label', `第 ${questionIndex + 1} 題，共 ${questions.length} 題`);
    }
    bilingualContent(byId('quiz-question'), question.question, question.english);
    byId('quiz-feedback')?.replaceChildren();
    if (byId('quiz-feedback')) delete byId('quiz-feedback').dataset.state;
    quizOptions.replaceChildren();
    question.options.forEach(([chinese, english], index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiz-option';
      button.setAttribute('aria-pressed', 'false');
      const letter = document.createElement('span');
      letter.className = 'quiz-letter';
      letter.textContent = String.fromCharCode(65 + index);
      const content = document.createElement('span');
      bilingualContent(content, chinese, english);
      button.append(letter, content);
      button.addEventListener('click', () => answerQuestion(index));
      quizOptions.append(button);
    });
    if (quizNext) {
      quizNext.hidden = false;
      quizNext.disabled = true;
      quizNext.textContent = questionIndex === questions.length - 1 ? '查看結果 · Results' : '下一題 · Next';
    }
  }

  function answerQuestion(choice) {
    if (answered) return;
    answered = true;
    const question = questions[questionIndex];
    const correct = choice === question.answer;
    if (correct) quizScore += 1;
    quizOptions?.querySelectorAll('button').forEach((button, index) => {
      button.disabled = true;
      button.setAttribute('aria-pressed', String(index === choice));
      if (index === question.answer) button.classList.add('is-correct');
      else if (index === choice) button.classList.add('is-incorrect');
    });
    const feedback = byId('quiz-feedback');
    if (feedback) {
      feedback.dataset.state = correct ? 'correct' : 'incorrect';
      bilingualContent(feedback, `${correct ? '答對了！' : '再想一想。'}${question.explanation}`, question.explanationEn);
    }
    setText('quiz-score', `${quizScore}`);
    if (quizNext) quizNext.disabled = false;
  }

  function showQuizResult() {
    const perfect = quizScore === questions.length;
    bilingualContent(byId('quiz-question'), perfect ? '全部答對，準備好點亮你的作品！' : '完成挑戰，帶著新發現再試一次！', perfect ? 'Every answer is correct. Ready to build?' : 'Challenge complete. Review and try again!');
    quizOptions?.replaceChildren();
    const feedback = byId('quiz-feedback');
    if (feedback) {
      feedback.dataset.state = 'complete';
      bilingualContent(feedback, `你答對 ${quizScore} / ${questions.length} 題。可以回到聲音實驗與聲控燈，重新觀察剛才的概念。`, `You answered ${quizScore} of ${questions.length} correctly. Revisit the experiments to explore the ideas.`);
    }
    if (quizNext) quizNext.hidden = true;
    const progress = byId('quiz-progress');
    if (progress && 'value' in progress) progress.value = questions.length;
    else if (progress) progress.textContent = '完成 · Complete';
    progress?.setAttribute('aria-label', '六題挑戰已完成');
  }
  quizNext?.addEventListener('click', () => {
    if (!answered) return;
    if (questionIndex === questions.length - 1) showQuizResult();
    else {
      questionIndex += 1;
      renderQuestion();
      byId('quiz-question')?.focus({ preventScroll: true });
    }
  });
  byId('quiz-reset')?.addEventListener('click', () => {
    questionIndex = 0;
    quizScore = 0;
    renderQuestion();
  });
  renderQuestion();
})();
