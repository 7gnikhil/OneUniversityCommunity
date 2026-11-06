"use client";

import { useState, type ChangeEvent } from "react";

// Password input with a Show/Hide visibility toggle (user-requested).
// Works uncontrolled (form reads FormData by name) or controlled
// (value + onChange), matching whichever form uses it.
export default function PasswordInput({
  name,
  autoComplete,
  placeholder,
  className,
  value,
  onChange,
}: {
  name: string;
  autoComplete: string;
  placeholder?: string;
  className: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const [visible, setVisible] = useState<boolean>(false);

  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`${className} pr-16`}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-2 my-auto h-fit rounded-md px-2 py-1 text-xs font-medium text-neutral-400 transition hover:text-white"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
