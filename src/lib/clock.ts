/** The clock accounts for elapsed time only while playing, outside UI interactions. */
export class TurnClock {
  private anchor: number;
  private holds = new Set<string>();
  constructor(
    private running: () => boolean,
    private advance: (ms: number) => void,
    private now = () => performance.now(),
  ) {
    this.anchor = this.now();
  }
  flush() {
    const current = this.now();
    if (this.running() && !this.holds.size)
      this.advance(Math.max(0, current - this.anchor));
    this.anchor = current;
  }
  hold(reason: string) {
    this.flush();
    this.holds.add(reason);
  }
  release(reason: string) {
    this.flush();
    this.holds.delete(reason);
  }
  reset() {
    this.anchor = this.now();
  }
  clear() {
    this.holds.clear();
    this.reset();
  }
  /** Physical input can lose its release event; dialogs still own their holds. */
  clearInputHolds() {
    for (const reason of this.holds) {
      if (reason.startsWith('pointer:') || reason.startsWith('key:')) {
        this.holds.delete(reason);
      }
    }
    this.reset();
  }
  get held() {
    return this.holds.size > 0;
  }
}
