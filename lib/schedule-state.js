// This module manages the incrementing schedule state
// Since Vercel Functions are stateless, we use environment variables or external storage

class ScheduleState {
  constructor() {
    // Base time: 4 PM ET (21:00 UTC during EST, 20:00 UTC during EDT)
    this.baseHour = 16; // 4 PM in ET
    this.incrementMinutes = 1; // Add 1 minute each day
  }

  // Calculate the next spin time based on spin count
  calculateNextSpinTime(spinCount = 0) {
    const now = new Date();
    
    // Calculate total minutes to add based on spin count
    const additionalMinutes = spinCount * this.incrementMinutes;
    
    // Create target time for today at 4 PM ET
    const targetTime = new Date();
    targetTime.setUTCHours(21, 0, 0, 0); // 4 PM ET (assuming EST)
    
    // Add the accumulated minutes
    targetTime.setMinutes(targetTime.getMinutes() + additionalMinutes);
    
    // If we've already passed today's target time, schedule for tomorrow
    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
      targetTime.setMinutes(targetTime.getMinutes() + this.incrementMinutes);
    }
    
    return targetTime;
  }

  // Check if it's time to spin based on the current schedule
  shouldSpinNow(lastSpinTimestamp, spinCount = 0) {
    const now = Date.now();
    
    // Ensure at least 24 hours have passed
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (lastSpinTimestamp && (now - lastSpinTimestamp < twentyFourHours)) {
      return false;
    }
    
    // Calculate the scheduled time for this spin
    const scheduledTime = this.calculateNextSpinTime(spinCount);
    
    // Allow a 5-minute window for execution
    const fiveMinutes = 5 * 60 * 1000;
    return Math.abs(now - scheduledTime.getTime()) <= fiveMinutes;
  }

  // Get human-readable next spin time
  getNextSpinTimeString(spinCount = 0) {
    const nextTime = this.calculateNextSpinTime(spinCount);
    return nextTime.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'short',
      timeStyle: 'medium'
    });
  }
}

module.exports = new ScheduleState();