import Image from "next/image";
import styles from "./showcase-card.module.css";

export function ShowcaseCard() {
  return (
    <div className={styles.stage} aria-hidden>
      <div className={styles.orbit}>
        <div className={styles.card}>
          <div className={styles.shine} />
          <Image
            src="/showcase/jane-schedule-card.png"
            alt=""
            width={640}
            height={480}
            className={styles.image}
            priority
          />
        </div>
      </div>
      <p className={styles.caption}>Agents build real interfaces — you just watch.</p>
    </div>
  );
}
