export class SimulationClock {
  private currentStep: number = 0;
  private isRunning: boolean = false;
  private intervalMs: number = 400; // ms per step (speed)
  private timerId: any = null;
  private onTickCallback: ((step: number) => void) | null = null;

  constructor(initialStep = 0, intervalMs = 400) {
    this.currentStep = initialStep;
    this.intervalMs = intervalMs;
  }

  getStep(): number {
    return this.currentStep;
  }

  setStep(step: number) {
    this.currentStep = step;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getIntervalMs(): number {
    return this.intervalMs;
  }

  setSpeed(intervalMs: number) {
    this.intervalMs = Math.max(50, intervalMs);
    if (this.isRunning) {
      this.pause();
      this.start();
    }
  }

  onTick(callback: (step: number) => void) {
    this.onTickCallback = callback;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timerId = setInterval(() => {
      this.currentStep++;
      if (this.onTickCallback) {
        this.onTickCallback(this.currentStep);
      }
    }, this.intervalMs);
  }

  pause() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  stepOnce() {
    this.currentStep++;
    if (this.onTickCallback) {
      this.onTickCallback(this.currentStep);
    }
  }

  reset() {
    this.pause();
    this.currentStep = 0;
  }
}
