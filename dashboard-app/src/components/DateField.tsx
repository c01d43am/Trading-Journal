import { useEffect, useState, type FocusEventHandler } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isValid,
  parse,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DISPLAY_FORMAT = "dd-MM-yyyy";

function parseIsoDate(value: string) {
  const date = parseISO(value);
  return isValid(date) && format(date, "yyyy-MM-dd") === value ? date : undefined;
}

function parseDisplayDate(value: string) {
  const date = parse(value, DISPLAY_FORMAT, new Date());
  return isValid(date) && format(date, DISPLAY_FORMAT) === value ? date : undefined;
}

export function isValidDateFieldValue(value: string) {
  return Boolean(parseIsoDate(value) || parseDisplayDate(value));
}

export function DateField({
  id,
  label,
  value,
  onChange,
  onBlur,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: FocusEventHandler<HTMLInputElement>;
  invalid: boolean;
}) {
  const storedDate = parseIsoDate(value);
  const [inputText, setInputText] = useState(() =>
    storedDate ? format(storedDate, DISPLAY_FORMAT) : value,
  );
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(storedDate ?? new Date()),
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const date = parseIsoDate(value);
    setInputText(date ? format(date, DISPLAY_FORMAT) : value);
    if (date) setVisibleMonth(startOfMonth(date));
  }, [value]);

  const days = eachDayOfInterval({
    start: startOfMonth(visibleMonth),
    end: endOfMonth(visibleMonth),
  });
  const leadingDays = getDay(startOfMonth(visibleMonth));
  const selectedDate = parseIsoDate(value) ?? parseDisplayDate(value);
  const today = format(new Date(), "yyyy-MM-dd");

  function updateText(nextValue: string) {
    setInputText(nextValue);
    const date = parseDisplayDate(nextValue);
    onChange(date ? format(date, "yyyy-MM-dd") : nextValue);
  }

  function chooseDate(date: Date) {
    const isoDate = format(date, "yyyy-MM-dd");
    setInputText(format(date, DISPLAY_FORMAT));
    onChange(isoDate);
    setVisibleMonth(startOfMonth(date));
    setIsOpen(false);
  }

  return (
    <div className="field-label">
      <span>
        <label className="cursor-pointer" htmlFor={id}>{label}</label>
        <em>Required · dd-mm-yyyy</em>
      </span>
      <div className="relative flex min-w-0">
        <input
          id={id}
          className="min-w-0 flex-1 rounded-xl rounded-r-none border border-r-0 border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="dd-mm-yyyy"
          value={inputText}
          aria-invalid={invalid}
          aria-required="true"
          onChange={(event) => updateText(event.target.value)}
          onBlur={onBlur}
        />
        <button
          className="grid h-11 w-12 shrink-0 place-items-center rounded-r-xl border border-slate-700 bg-slate-900 text-lg text-slate-300 hover:border-slate-500 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          type="button"
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (selectedDate) setVisibleMonth(startOfMonth(selectedDate));
            setIsOpen((open) => !open);
          }}
        >
          <span aria-hidden="true">▦</span>
        </button>
        {isOpen && (
          <section
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-3rem))] rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
            role="dialog"
            aria-label={`Choose ${label.toLowerCase()}`}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                className="grid size-10 place-items-center rounded-lg border border-slate-700 text-lg text-slate-300 hover:bg-slate-800"
                type="button"
                aria-label="Previous month"
                onClick={() => setVisibleMonth((month) => subMonths(month, 1))}
              >
                ‹
              </button>
              <h3 className="text-sm font-semibold text-slate-100">
                {format(visibleMonth, "MMMM yyyy")}
              </h3>
              <button
                className="grid size-10 place-items-center rounded-lg border border-slate-700 text-lg text-slate-300 hover:bg-slate-800"
                type="button"
                aria-label="Next month"
                onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
              >
                ›
              </button>
            </div>
            <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-medium uppercase text-slate-500">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: leadingDays }, (_, index) => (
                <span key={`blank-${index}`} aria-hidden="true" />
              ))}
              {days.map((date) => {
                const dateValue = format(date, "yyyy-MM-dd");
                const selected = dateValue === (selectedDate ? format(selectedDate, "yyyy-MM-dd") : "");
                return (
                  <button
                    className={`min-h-10 rounded-lg text-sm transition ${
                      selected
                        ? "bg-sky-400 text-slate-950"
                        : dateValue === today
                          ? "border border-sky-400/60 text-sky-200 hover:bg-slate-800"
                          : "text-slate-200 hover:bg-slate-800"
                    }`}
                    key={dateValue}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseDate(date)}
                  >
                    {format(date, "d")}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
