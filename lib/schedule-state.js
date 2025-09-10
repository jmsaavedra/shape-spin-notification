// This module manages the schedule state
// Since Vercel Functions are stateless, we use environment variables or external storage

class ScheduleState {
  constructor() {
    // 24 hour cooldown period
    this.cooldownHours = 24;
  }

  // Calculate the next spin time based on last spin timestamp
  calculateNextSpinTime(lastSpinTimestamp) {
    if (!lastSpinTimestamp) {
      // If never spun, can spin now
      return new Date();
    }
    
    // Next spin is exactly 24 hours after last spin, rounded to next minute
    const nextSpinTime = new Date(lastSpinTimestamp + (this.cooldownHours * 60 * 60 * 1000));
    
    // Round up to the next minute for cleaner display
    nextSpinTime.setSeconds(0, 0);
    nextSpinTime.setMinutes(nextSpinTime.getMinutes() + 1);
    
    return nextSpinTime;
  }

  // Check if it's time to spin based on the current schedule
  shouldSpinNow(lastSpinTimestamp) {
    if (!lastSpinTimestamp) {
      // Never spun before, can spin now
      return true;
    }
    
    const now = Date.now();
    
    // Check if at least 24 hours have passed
    const twentyFourHours = this.cooldownHours * 60 * 60 * 1000;
    return (now - lastSpinTimestamp >= twentyFourHours);
  }

  // Get human-readable next spin time
  getNextSpinTimeString(lastSpinTimestamp) {
    const nextTime = this.calculateNextSpinTime(lastSpinTimestamp);
    const dateStr = nextTime.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit'
    });
    const timeStr = nextTime.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
    return `${dateStr}, ${timeStr}`;
  }
}

module.exports = new ScheduleState();