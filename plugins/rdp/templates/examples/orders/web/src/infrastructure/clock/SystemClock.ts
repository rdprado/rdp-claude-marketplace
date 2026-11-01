// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the front's Clock port: the browser's time.
import type { Clock } from '../../application/ports/Clock.ts';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
