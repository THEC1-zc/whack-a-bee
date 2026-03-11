export function getCETDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(fmt.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function startOfSundayWeekUtc(date = new Date()) {
  const { year, month, day } = getCETDateParts(date);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dayNum);
  return d;
}

export function getSundayWeekId(date = new Date()) {
  const start = startOfSundayWeekUtc(date);
  const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((start.getTime() - yearStart.getTime()) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  return `${start.getUTCFullYear()}-S${String(week).padStart(2, "0")}`;
}

export function nextSundayCET(hour = 0, minute = 0): number {
  const now = new Date();
  const { year, month, day } = getCETDateParts(now);
  const base = new Date(Date.UTC(year, month - 1, day));
  const dayNum = base.getUTCDay();
  const daysToSun = (7 - dayNum) % 7;
  const target = new Date(Date.UTC(year, month - 1, day + daysToSun, hour - 1, minute, 0));
  return target.getTime();
}
