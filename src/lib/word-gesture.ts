interface PointerPosition {
  pointerId: number;
  clientX: number;
  clientY: number;
}

/** One completed swipe resolves one word; cancellation never resolves it. */
export class WordGesture {
  private origin: PointerPosition | null = null;
  private suppressedPointer: number | null = null;

  begin(
    pointer: PointerPosition & { isPrimary: boolean; button: number },
  ): boolean {
    if (!pointer.isPrimary || pointer.button !== 0) return false;
    this.origin = {
      pointerId: pointer.pointerId,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
    };
    this.suppressedPointer = null;
    return true;
  }

  end(pointer: PointerPosition): 'up' | 'down' | null {
    if (!this.origin || pointer.pointerId !== this.origin.pointerId)
      return null;
    const dx = pointer.clientX - this.origin.clientX;
    const dy = pointer.clientY - this.origin.clientY;
    this.origin = null;
    if (Math.abs(dy) < 55 || Math.abs(dx) > Math.abs(dy) * 0.65) return null;
    this.suppressedPointer = pointer.pointerId;
    return dy < 0 ? 'up' : 'down';
  }

  cancel(pointerId: number) {
    if (this.origin?.pointerId === pointerId) this.origin = null;
  }

  consumeClick(click: { detail: number; pointerId?: number }): boolean {
    if (click.detail === 0 || this.suppressedPointer === null) return false;
    if (
      click.pointerId !== undefined &&
      click.pointerId !== this.suppressedPointer
    )
      return false;
    this.suppressedPointer = null;
    return true;
  }
}
