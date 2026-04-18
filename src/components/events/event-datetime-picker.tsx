"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const ampm = h === 0 ? "12" : h <= 12 ? String(h) : String(h - 12);
  const suffix = h < 12 ? "AM" : "PM";
  const label = `${ampm}:${String(m).padStart(2, "0")} ${suffix}`;
  return { value, label };
});

const END_TIME_LAST = { value: "23:59", label: "11:59 PM" };

function buildEndTimeOptions() {
  return [...TIME_OPTIONS, END_TIME_LAST];
}

interface EventDateTimePickerProps {
  dateValue: string;
  timeValue: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  mode: "start" | "end";
  disabled?: boolean;
}

export function EventDateTimePicker({
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  mode,
  disabled,
}: EventDateTimePickerProps) {
  const timeOptions = mode === "end" ? buildEndTimeOptions() : TIME_OPTIONS;

  return (
    <div className="flex gap-2">
      <input
        type="date"
        value={dateValue}
        onChange={(e) => onDateChange(e.target.value)}
        disabled={disabled}
        className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Select value={timeValue} onValueChange={(v) => onTimeChange(v ?? timeValue)} disabled={disabled}>
        <SelectTrigger className="w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[240px]">
          {timeOptions.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export const DEFAULT_START_TIME = "00:00";
export const DEFAULT_END_TIME = "23:59";

export function splitDatetime(datetimeLocal: string): { date: string; time: string } {
  if (!datetimeLocal) return { date: "", time: "" };
  const [date, time] = datetimeLocal.split("T");
  return { date: date ?? "", time: time?.slice(0, 5) ?? "" };
}

export function joinDatetime(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}
