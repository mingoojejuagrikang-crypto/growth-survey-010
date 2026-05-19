/**
 * MediaRecorder wrapper for per-field voice clip recording.
 * Records from the microphone independently of SpeechRecognition.
 */

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private resolveStop: ((b: Blob | null) => void) | null = null;

  async init(): Promise<boolean> {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return true;
    } catch {
      return false;
    }
  }

  startClip(): void {
    if (!this.stream) return;
    // Stop any previous recording
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.chunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : '';
    this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const blob = this.chunks.length > 0
        ? new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' })
        : null;
      this.resolveStop?.(blob);
      this.resolveStop = null;
    };
    this.recorder.start();
  }

  stopClip(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      this.resolveStop = resolve;
      this.recorder.stop();
    });
  }

  dispose(): void {
    // Codex 3차 HIGH: 진행 중인 stopClip() Promise가 좀비화되지 않도록 우선 해소.
    // recorder가 already-inactive 상태(이전 stopClip이 stop을 호출)여도 onstop이 큐에 남아 있을 수 있고,
    // dispose가 resolveStop을 null로 만들기 때문에 onstop이 fire되어도 no-op이 되어 awaiter가 영원히 hang.
    const pending = this.resolveStop;
    this.resolveStop = null;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    if (pending) pending(null);
    this.recorder = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.chunks = [];
  }
}
