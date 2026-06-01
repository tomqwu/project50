import { describe, expect, it } from "vitest";
import { buildCardModel } from "./card-model";

describe("buildCardModel — headline", () => {
  it("returns 'Day 50 complete' when dayNumber === lengthDays", () => {
    const model = buildCardModel({
      title: "Run 5K",
      daysCompleted: 47,
      totalAmount: 235,
      unit: "km",
      dayNumber: 50,
      lengthDays: 50,
    });
    expect(model.headline).toBe("Day 50 complete");
  });

  it("returns 'Day 50 complete' when dayNumber > lengthDays", () => {
    const model = buildCardModel({
      title: "Run 5K",
      daysCompleted: 50,
      totalAmount: 250,
      unit: "km",
      dayNumber: 52,
      lengthDays: 50,
    });
    expect(model.headline).toBe("Day 50 complete");
  });

  it("returns 'Day N of M' when dayNumber < lengthDays", () => {
    const model = buildCardModel({
      title: "Run 5K",
      daysCompleted: 25,
      totalAmount: 125,
      unit: "km",
      dayNumber: 25,
      lengthDays: 50,
    });
    expect(model.headline).toBe("Day 25 of 50");
  });

  it("returns 'Day 1 of 30' for a 30-day challenge on day 1", () => {
    const model = buildCardModel({
      title: "Yoga",
      daysCompleted: 1,
      totalAmount: null,
      unit: null,
      dayNumber: 1,
      lengthDays: 30,
    });
    expect(model.headline).toBe("Day 1 of 30");
  });

  it("returns 'Day 30 complete' for a 30-day challenge at day 30", () => {
    const model = buildCardModel({
      title: "Yoga",
      daysCompleted: 30,
      totalAmount: null,
      unit: null,
      dayNumber: 30,
      lengthDays: 30,
    });
    expect(model.headline).toBe("Day 30 complete");
  });
});

describe("buildCardModel — subline", () => {
  it("returns the challenge title as subline", () => {
    const model = buildCardModel({
      title: "My Amazing Challenge",
      daysCompleted: 10,
      totalAmount: null,
      unit: null,
      dayNumber: 10,
      lengthDays: 50,
    });
    expect(model.subline).toBe("My Amazing Challenge");
  });
});

describe("buildCardModel — statText", () => {
  it("includes unit and totalAmount when both present", () => {
    const model = buildCardModel({
      title: "Run",
      daysCompleted: 47,
      totalAmount: 211,
      unit: "min",
      dayNumber: 50,
      lengthDays: 50,
    });
    expect(model.statText).toBe("47 days · 211 min");
  });

  it("omits totalAmount part when totalAmount is null", () => {
    const model = buildCardModel({
      title: "Meditate",
      daysCompleted: 20,
      totalAmount: null,
      unit: "min",
      dayNumber: 20,
      lengthDays: 50,
    });
    expect(model.statText).toBe("20 days");
  });

  it("omits totalAmount part when totalAmount is undefined", () => {
    const model = buildCardModel({
      title: "Meditate",
      daysCompleted: 20,
      dayNumber: 20,
      lengthDays: 50,
    });
    expect(model.statText).toBe("20 days");
  });

  it("omits totalAmount part when unit is null", () => {
    const model = buildCardModel({
      title: "Yoga",
      daysCompleted: 15,
      totalAmount: 300,
      unit: null,
      dayNumber: 15,
      lengthDays: 50,
    });
    expect(model.statText).toBe("15 days");
  });

  it("omits totalAmount part when unit is empty string", () => {
    const model = buildCardModel({
      title: "Run",
      daysCompleted: 10,
      totalAmount: 50,
      unit: "",
      dayNumber: 10,
      lengthDays: 50,
    });
    expect(model.statText).toBe("10 days");
  });

  it("omits totalAmount part when unit is undefined", () => {
    const model = buildCardModel({
      title: "Run",
      daysCompleted: 10,
      totalAmount: 50,
      dayNumber: 10,
      lengthDays: 50,
    });
    expect(model.statText).toBe("10 days");
  });

  it("shows '0 days' for a fresh challenge with no completions", () => {
    const model = buildCardModel({
      title: "New",
      daysCompleted: 0,
      totalAmount: null,
      unit: null,
      dayNumber: 1,
      lengthDays: 50,
    });
    expect(model.statText).toBe("0 days");
  });
});
