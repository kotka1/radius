import { useId } from "react";
import styles from "./radius-spiral-spinner.module.css";

type Props = {
  /** Router label — e.g. "Choosing the best path…" */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = { sm: 40, md: 56, lg: 80 };

export function RadiusSpiralSpinner({
  label = "Thinking…",
  size = "md",
  className,
}: Props) {
  const px = SIZES[size];
  const gradId = useId();

  return (
    <div
      className={[styles.wrap, className].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className={styles.glow} aria-hidden />
      <svg
        className={styles.spiral}
        width={px}
        height={px}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient
            id={gradId}
            x1="8"
            y1="8"
            x2="56"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#f0dfa0" />
            <stop offset="45%" stopColor="#e8d18a" />
            <stop offset="100%" stopColor="#a88432" />
          </linearGradient>
        </defs>
        <path
          className={styles.path}
          d="M32 32c0-8 8-8 8 0s-8 8-16 8-16-16 16-16 24 0 24 24-32 32-40 8-40-32 48-32 48 40"
          stroke={`url(#${gradId})`}
          strokeWidth="2.25"
          strokeLinecap="round"
        />
      </svg>
      {label ? <p className={styles.label}>{label}</p> : null}
    </div>
  );
}
