'use client';

import React from 'react';
import styles from './LoadingOverlay.module.css';

export type LoadingOverlayProps = {
  active: boolean;
  progress: number;
  message: string;
};

export default function LoadingOverlay({
  active,
  progress,
  message,
}: LoadingOverlayProps) {
  if (!active) return null;

  const boundedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={styles.loadingOverlay} role="status" aria-live="polite">
      <div className={styles.loadingCard}>
        <div className={styles.stage}>
          <div
            className={styles.cat}
            style={{
              left: `calc(${boundedProgress}% - ${boundedProgress * 0.7}px)`,
            }}
          >
            <div className={styles.catImgWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cat-loading-base.png"
                alt=""
                className={styles.catBase}
                draggable={false}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cat-pupil-left.png"
                alt=""
                className={`${styles.pupil} ${styles.pupilL}`}
                draggable={false}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cat-pupil-right.png"
                alt=""
                className={`${styles.pupil} ${styles.pupilR}`}
                draggable={false}
              />
            </div>
          </div>
        </div>

        <div className={styles.barTrack}>
          <div
            className={styles.barFill}
            style={{ width: `${boundedProgress}%` }}
          />
        </div>

        <p className={styles.loadingPercent}>
          Loading... {Math.floor(boundedProgress)}%
        </p>
        <p className={styles.loadingSub}>{message}</p>
      </div>
    </div>
  );
}

