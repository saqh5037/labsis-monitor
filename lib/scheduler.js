// Scheduler simple con setTimeout (sin node-cron)

class Scheduler {
  constructor() {
    this.timers = [];
  }

  // dayOfWeek: 0=Dom, 1=Lun, ... 6=Sáb
  scheduleWeekly(dayOfWeek, hour, minute, fn) {
    const schedule = () => {
      const now = new Date();
      const target = new Date();
      target.setHours(hour, minute, 0, 0);

      const currentDay = now.getDay();
      let daysUntil = dayOfWeek - currentDay;
      if (daysUntil < 0 || (daysUntil === 0 && now >= target)) daysUntil += 7;
      target.setDate(target.getDate() + daysUntil);

      const delay = target.getTime() - now.getTime();
      console.log(`[Scheduler] Próximo reporte en ${(delay / 3600000).toFixed(1)}h (${target.toLocaleString('es-MX')})`);

      const timer = setTimeout(() => {
        console.log('[Scheduler] Ejecutando tarea programada...');
        try { fn(); } catch (e) { console.error('[Scheduler] Error:', e.message); }
        schedule();
      }, delay);

      this.timers.push(timer);
    };

    schedule();
  }

  stop() {
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
  }
}

module.exports = { Scheduler };
