import React from "react";
import { AbsoluteFill } from "remotion";
import { colors } from "./tokens.js";
import type { RecapData } from "./types.js";
import { TitleCard } from "./components/TitleCard.js";
import { RingFill } from "./components/RingFill.js";
import { BigNumber } from "./components/BigNumber.js";
import { StatLine } from "./components/StatLine.js";
import { PhotoStrip } from "./components/PhotoStrip.js";

/**
 * Main Remotion composition component.
 *
 * Layout varies by `kind`:
 *  - DAY  : title + ring showing today's amount vs goal + stat line + single photo
 *  - WEEK : title + big-number for days done this week + stat line + photo strip
 *  - FIFTY: title + ring showing total days completed (of 50) + big-number for
 *           total amount + stat line + full photo strip
 */
export function RecapVideo(props: RecapData) {
  const { title, kind, dayNumber, lengthDays, stats, days } = props;
  const photoUrls = days
    .map((d) => d.photoUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  return (
    <AbsoluteFill
      data-testid="recap-video"
      style={{
        background: colors.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "80px 60px 60px",
        gap: 40,
      }}
    >
      {/* Title — always present */}
      <TitleCard
        title={title}
        kind={kind}
        dayNumber={dayNumber}
        lengthDays={lengthDays}
        animationFrames={30}
      />

      {kind === "DAY" && <DayLayout stats={stats} photoUrls={photoUrls} />}
      {kind === "WEEK" && <WeekLayout stats={stats} photoUrls={photoUrls} days={days} />}
      {kind === "FIFTY" && (
        <FiftyLayout stats={stats} lengthDays={lengthDays} photoUrls={photoUrls} />
      )}
    </AbsoluteFill>
  );
}

/* ── Sub-layouts ─────────────────────────────────────────── */

interface DayLayoutProps {
  stats: RecapData["stats"];
  photoUrls: string[];
}

function DayLayout({ stats, photoUrls }: DayLayoutProps) {
  return (
    <>
      <RingFill
        value={stats.totalAmount}
        max={Math.max(stats.totalAmount, 1)}
        animationFrames={60}
        label={stats.unit ?? "done"}
      />
      <StatLine
        daysCompleted={stats.daysCompleted}
        totalAmount={stats.totalAmount}
        unit={stats.unit}
        currentStreak={stats.currentStreak}
      />
      <PhotoStrip photoUrls={photoUrls} width={960} height={420} framesPerPhoto={90} />
    </>
  );
}

interface WeekLayoutProps {
  stats: RecapData["stats"];
  photoUrls: string[];
  days: RecapData["days"];
}

function WeekLayout({ stats, photoUrls, days }: WeekLayoutProps) {
  const weekDaysCompleted = days.filter((d) => d.completed).length;
  return (
    <>
      <BigNumber
        value={weekDaysCompleted}
        animationFrames={45}
        unit={`of ${days.length} days`}
        fontSize={180}
      />
      <StatLine
        daysCompleted={stats.daysCompleted}
        totalAmount={stats.totalAmount}
        unit={stats.unit}
        currentStreak={stats.currentStreak}
      />
      <PhotoStrip
        photoUrls={photoUrls}
        width={960}
        height={380}
        framesPerPhoto={60}
        fadeDuration={15}
      />
    </>
  );
}

interface FiftyLayoutProps {
  stats: RecapData["stats"];
  lengthDays: number;
  photoUrls: string[];
}

function FiftyLayout({ stats, lengthDays, photoUrls }: FiftyLayoutProps) {
  return (
    <>
      <RingFill
        value={stats.daysCompleted}
        max={lengthDays}
        animationFrames={90}
        label="days"
        size={260}
      />
      <BigNumber
        value={stats.totalAmount}
        animationFrames={75}
        unit={stats.unit ?? "total"}
        fontSize={100}
      />
      <StatLine
        daysCompleted={stats.daysCompleted}
        totalAmount={stats.totalAmount}
        unit={stats.unit}
        currentStreak={stats.currentStreak}
      />
      <PhotoStrip
        photoUrls={photoUrls}
        width={960}
        height={340}
        framesPerPhoto={45}
        fadeDuration={12}
      />
    </>
  );
}
