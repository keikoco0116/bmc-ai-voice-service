export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onData: (base64Data: string) => void;

  constructor(onData: (base64Data: string) => void) {
    this.onData = onData;
    this.audioContext = new AudioContext({ sampleRate: 16000 });
  }

  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Failed to resume AudioRecorder context:', e);
      }
    }
  }

  async startWithStream(stream: MediaStream) {
    try {
      this.stream = stream;
      if (this.audioContext && this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
        } catch (e) {
          console.warn('Failed to resume AudioRecorder context in startWithStream:', e);
        }
      }
      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 16000 });
      }
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert Int16Array to base64
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        this.onData(base64);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (err) {
      console.error('Error starting audio recorder:', err);
      throw err;
    }
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      await this.startWithStream(stream);
    } catch (err) {
      console.error('Error starting audio recorder:', err);
      throw err;
    }
  }

  stop() {
    if (this.processor && this.source) {
      this.source.disconnect();
      this.processor.disconnect();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        console.warn('Failed to close AudioRecorder context:', e);
      }
    }
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextPlayTime = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
  }

  public getIsPlaying() {
    return this.activeSources.size > 0;
  }

  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Failed to resume AudioPlayer context:', e);
      }
    }
  }

  async playBase64(base64: string) {
    if (!this.audioContext) return;
    
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Failed to resume AudioPlayer context in playBase64:', e);
      }
    }
    
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pcm16 = new Int16Array(bytes.buffer);
      const audioBuffer = this.audioContext.createBuffer(1, pcm16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      for (let i = 0; i < pcm16.length; i++) {
        channelData[i] = pcm16[i] / 32768.0;
      }
      
      this.playBuffer(audioBuffer);
    } catch (err) {
      console.error('Error playing audio:', err);
    }
  }

  private playBuffer(buffer: AudioBuffer) {
    if (!this.audioContext) return;
    
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    
    const currentTime = this.audioContext.currentTime;
    // If nextPlayTime is in the past, start immediately
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }
    
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
    
    this.activeSources.add(source);
    
    source.onended = () => {
      this.activeSources.delete(source);
    };
  }

  stop() {
    this.activeSources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        console.warn('Failed to stop AudioPlayer source:', e);
      }
    });
    this.activeSources.clear();
    this.nextPlayTime = 0;
  }
}
