// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the BFF's Clock port: the machine's time.
import type { Clock } from '../ports/Clock.ts';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
