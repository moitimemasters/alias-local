interface PointerPosition {
  pointerId: number;
  clientX: number;
  clientY: number;
}

/** A short touch activates on release; moving away or scrolling cancels it. */
export class TouchTap {
  private origin: PointerPosition | null = null;
  private moved = false;

  begin(
    pointer: PointerPosition & {
      pointerType: string;
      isPrimary: boolean;
      button: number;
    },
  ) {
    if (
      !['touch', 'pen'].includes(pointer.pointerType) ||
      !pointer.isPrimary ||
      pointer.button !== 0
    ) {
      return;
    }
    this.origin = {
      pointerId: pointer.pointerId,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
    };
    this.moved = false;
  }

  move(pointer: PointerPosition) {
    if (this.origin?.pointerId === pointer.pointerId) {
      this.moved ||=
        Math.hypot(
          pointer.clientX - this.origin.clientX,
          pointer.clientY - this.origin.clientY,
        ) > 12;
    }
  }

  end(
    pointer: PointerPosition,
    bounds: { left: number; right: number; top: number; bottom: number },
  ) {
    if (this.origin?.pointerId !== pointer.pointerId) {
      return null;
    }
    this.move(pointer);
    this.origin = null;
    return (
      !this.moved &&
      pointer.clientX >= bounds.left &&
      pointer.clientX <= bounds.right &&
      pointer.clientY >= bounds.top &&
      pointer.clientY <= bounds.bottom
    );
  }

  cancel(pointerId: number) {
    if (this.origin?.pointerId === pointerId) {
      this.origin = null;
      return true;
    }
    return false;
  }
}

/** Survives removal of a dialog button until its compatibility click arrives. */
export class TouchClickGuard {
  private pointerId: number | null = null;

  arm(pointerId: number) {
    this.pointerId = pointerId;
  }

  reset() {
    this.pointerId = null;
  }

  consume(click: { detail: number; pointerId?: number }) {
    if (click.detail === 0 || this.pointerId === null) {
      return false;
    }
    if (
      click.pointerId !== undefined &&
      click.pointerId > 0 &&
      click.pointerId !== this.pointerId
    ) {
      return false;
    }
    this.reset();
    return true;
  }
}

export const touchClicks = new TouchClickGuard();
