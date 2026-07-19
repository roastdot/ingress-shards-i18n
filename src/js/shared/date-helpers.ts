import * as ZonedDateTime from "temporal-polyfill/fns/zoneddatetime";
import * as Now from "temporal-polyfill/fns/now";
import * as Duration from "temporal-polyfill/fns/duration";
import { t, tChoice, getLocale } from "../i18n/index.js";

const MS_PER_SECOND = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface TimeLocaleOptions {
    locale: string;
    hourCycle: 'h12' | 'h23';
}

/**
 * Keep local clock conventions without using Chinese day-period text.
 * Mainland China and the UK use a 24-hour clock; Hong Kong, Taiwan and
 * the US use a 12-hour clock with Latin AM/PM markers.
 */
function getTimeLocaleOptions(locale: string): TimeLocaleOptions {
    switch (locale) {
        case 'zh-CN':
        case 'en-GB':
            return { locale, hourCycle: 'h23' };
        case 'zh-HK':
            return { locale: 'en-HK', hourCycle: 'h12' };
        case 'zh-TW':
            return { locale: 'en-TW', hourCycle: 'h12' };
        case 'en-US':
            return { locale, hourCycle: 'h12' };
        default:
            return { locale, hourCycle: 'h23' };
    }
}

function normaliseLatinDayPeriod(value: string): string {
    return value.replace(/\b(am|pm)\b/gi, (period) => period.toUpperCase());
}

/**
 * Converts a 13-digit millisecond epoch time string/number to a 10-digit
 * second epoch time string/number by truncating milliseconds. We only up to the second,
 * so the processed data doesn't need to store the ms.
 */
export function convertMsEpochToSecEpoch(epochMs: number | string): number {
    // Math.trunc ensures we just drop the milliseconds, moving toward zero.
    return Math.trunc(Number(epochMs) / MS_PER_SECOND);
}

/**
 * Converts a 13-digit millisecond epoch time to a simplified ISO 8601 string,
 * suitable for serialization (YYYY-MM-DDTHH:mm:ss, without milliseconds or Z).
 * This is the standard format required for the geocode storage date field.
 */
export function formatEpochToSerializationString(epochTimeMs: number | string): string {
    const dateObject = new Date(Number(epochTimeMs));
    return dateObject.toISOString().replace(/\.\d{3}Z$/, '');
}

/**
 * Formats the serialized ISO 8601 string (YYYY-MM-DDTHH:mm:ss) into a locale-specific short date string (e.g., 3/15/2023).
 */
export function formatIsoToShortDate(isoString: string, timeZone?: string, locale: string = getLocale()): string {
    const zdt = ZonedDateTime.fromString(isoString);
    const epochMillis = ZonedDateTime.epochMilliseconds(zdt);
    return new Date(epochMillis).toLocaleDateString(locale, { timeZone: ZonedDateTime.timeZoneId(zdt), dateStyle: 'short' });
}

/**
 * Formats the serialized ISO 8601 string into a locale-specific medium date string (e.g., 15 Mar 2023).
 */
export function formatIsoToMediumDate(isoString: string, timeZone?: string, locale: string = getLocale()): string {
    const zdt = ZonedDateTime.fromString(isoString);
    const epochMillis = ZonedDateTime.epochMilliseconds(zdt);
    return new Date(epochMillis).toLocaleDateString(locale, { timeZone: ZonedDateTime.timeZoneId(zdt), dateStyle: 'medium' });
}

/**
 * Formats the serialized ISO 8601 string into a locale-specific long date string (e.g., 15 March 2023).
 */
export function formatIsoToLongDate(isoString: string, timeZone?: string, locale: string = getLocale()): string {
    const zdt = ZonedDateTime.fromString(isoString);
    const epochMillis = ZonedDateTime.epochMilliseconds(zdt);
    return new Date(epochMillis).toLocaleDateString(locale, { timeZone: ZonedDateTime.timeZoneId(zdt), dateStyle: 'long' });
}

/**
 * Formats an epoch time for local display time.
 */
export function formatEpochToLocalTime(epochMs: number | string, timeZone: string, locale: string = getLocale()): string {
    const timeOptions = getTimeLocaleOptions(locale);
    const formatted = new Date(Number(epochMs)).toLocaleTimeString(timeOptions.locale, {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hourCycle: timeOptions.hourCycle,
    });
    return normaliseLatinDayPeriod(formatted);
}

/**
 * Formats an epoch time for local date and time display.
 */
export function formatEpochToLocalDateTime(epochMs: number | string, timeZone: string, locale: string = getLocale()): string {
    const date = new Date(Number(epochMs));
    const datePart = date.toLocaleDateString(locale, {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    });
    const timeOptions = getTimeLocaleOptions(locale);
    const timePart = date.toLocaleTimeString(timeOptions.locale, {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: timeOptions.hourCycle,
    });
    return `${datePart} ${normaliseLatinDayPeriod(timePart)}`;
}

/**
 * Checks if a given timestamp is within 24 hours of a reference timestamp.
 */
export function isWithin24Hours(targetTimeMs: number | string, referenceTimeMs: number | string): boolean {
    const target = Number(targetTimeMs);
    const reference = Number(referenceTimeMs);

    const differenceMs = Math.abs(target - reference);

    return differenceMs <= MS_PER_DAY;
}

/**
 * Creates a new Date object for a wave's start or end time, preserving the timezone of the original site event.
 * It correctly combines the date from the event's ISO string with a new time string.
 * @param siteDateIso - The original ISO 8601 date string for the site (e.g., "2025-11-15T14:00:00+01:00").
 * @param siteTimezone - The IANA timezone name for the site (e.g., "Europe/Amsterdam"). Unused directly — timezone is carried by the ISO string itself.
 * @param timeStr - The time string for the wave (e.g., "14:02").
 * @returns A new Date object representing the precise start/end of the wave.
 */
export function createWaveDate(siteDateIso: string, siteTimezone: string, timeStr: string): Date {
    const [hour, minute] = timeStr.split(':').map(Number);

    // 1. Create a ZonedDateTime object directly from the ISO string.
    const zdt = ZonedDateTime.fromString(siteDateIso);

    // 2. Create a new DateTime by setting the desired time.
    const waveZdt = ZonedDateTime.withFields(zdt, { hour, minute, second: 0, millisecond: 0 });

    // 3. Convert back to a native Date object for use in the rest of your application.
    return new Date(ZonedDateTime.epochMilliseconds(waveZdt));
}

/**
 * Calculates the time remaining until a site starts and returns a formatted string.
 * - > 24 hours: "X days"
 * - < 24 hours: "X hours"
 * - < 60 minutes: "X minutes"
 * Returns null if the event has already started.
 */
export function getTimeRemaining(siteDateIso: string, siteTimezone: string): string | null {
    const startTime = ZonedDateTime.fromString(siteDateIso);
    const now = Now.zonedDateTimeISO(siteTimezone);

    if (ZonedDateTime.compare(startTime, now) <= 0) {
        return null;
    }

    const diff = ZonedDateTime.until(now, startTime, { largestUnit: 'days' });
    const totalDays = diff.days;
    const totalHours = diff.hours;
    const totalMinutes = diff.minutes;

    if (totalDays >= 1) {
        const days = Math.floor(totalDays);
        return `${days} ${tChoice('dates.day', days)}`;
    }

    if (totalHours >= 1) {
        const hours = Math.floor(totalHours);
        return `${hours} ${tChoice('dates.hour', hours)}`;
    }

    if (totalMinutes >= 1) {
        const minutes = Math.floor(totalMinutes);
        return `${minutes} ${tChoice('dates.minute', minutes)}`;
    }

    return t('dates.less_than_minute');
}

/**
 * Calculates the remaining time for an active event.
 * @param siteDateIso - The start date of the site.
 * @param siteTimezone - The timezone of the site.
 * @param durationMins - The total duration of the event in minutes.
 * @returns Formatted string "X hours Y minutes" or null if not active.
 */
export function getActiveEventRemaining(siteDateIso: string, siteTimezone: string, durationMins: number): string | null {
    const startTime = ZonedDateTime.fromString(siteDateIso);
    const endTime = ZonedDateTime.add(startTime, Duration.fromFields({ minutes: durationMins }));
    const now = Now.zonedDateTimeISO(siteTimezone);

    if (ZonedDateTime.compare(now, startTime) < 0 || ZonedDateTime.compare(now, endTime) > 0) {
        return null;
    }

    const diff = ZonedDateTime.until(now, endTime, { largestUnit: 'hours' });
    const hours = Math.floor(diff.hours || 0);
    const minutes = Math.floor(diff.minutes || 0);

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} ${tChoice('dates.hour', hours)}`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} ${tChoice('dates.minute', minutes)}`);

    return parts.join(' ');
}
