"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type SearchableEmployeeOption = {
  value: string;
  label: string;
  searchText?: string;
};

type SearchableEmployeeSelectProps = {
  options: SearchableEmployeeOption[];
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder: string;
  requiredMessage: string;
  noResultsMessage: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
}

export function SearchableEmployeeSelect({
  options,
  value,
  onChange,
  searchPlaceholder,
  requiredMessage,
  noResultsMessage,
  disabled = false,
  required = false,
  className = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm",
}: SearchableEmployeeSelectProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !value ? requiredMessage : "");
  }, [required, requiredMessage, value]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const filteredOptions = useMemo(() => {
    const search = normalize(query);
    if (!search) return options;
    return options.filter((option) => normalize(`${option.label} ${option.searchText ?? ""}`).includes(search));
  }, [options, query]);

  function choose(option: SearchableEmployeeOption) {
    setEditing(false);
    setQuery(option.label);
    setOpen(false);
    onChange(option.value);
    inputRef.current?.setCustomValidity("");
  }

  function handleBlur() {
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setEditing(false);
    }, 120);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, filteredOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
          aria-controls={listboxId}
        aria-label={searchPlaceholder}
        autoComplete="off"
        value={editing ? query : selectedOption?.label ?? ""}
        placeholder={searchPlaceholder}
        className={className}
        disabled={disabled}
        required={required}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
          const nextQuery = event.target.value;
          setEditing(true);
          setQuery(nextQuery);
          setActiveIndex(0);
          setOpen(true);
          inputRef.current?.setCustomValidity(required ? requiredMessage : "");
          if (value) onChange("");
        }}
      />
      {open && !disabled ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg"
        >
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 ${index === activeIndex ? "bg-slate-50" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          )) : (
            <p className="px-3 py-2 text-sm text-slate-500">{noResultsMessage}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
