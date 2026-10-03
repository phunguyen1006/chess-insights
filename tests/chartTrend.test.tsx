// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Trend } from "../src/features/insights/components/Charts";
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("fills cyan areas only across contiguous known observations and keeps isolated observations visible", async () => {
  const data = [1, 2, null, 4, 5, null, 7].map((value, index) => ({
    label: "Day " + index,
    value,
  }));
  await act(() =>
    root.render(<Trend area data={data} label="Recorded hours" />),
  );
  expect(
    container.querySelector("linearGradient stop")?.getAttribute("stop-color"),
  ).toBe("var(--ci-chart-color, #42b8e8)");
  const fills = container.querySelectorAll('path[fill^="url"]');
  expect(fills.length).toBe(2);
  const line = container.querySelector('path[fill="none"]')!;
  expect(line.getAttribute("stroke")).toBe("var(--ci-chart-color, #42b8e8)");
  expect(line.getAttribute("d")?.match(/M/g)?.length).toBe(3);
  const points = [
    ...container.querySelectorAll<SVGCircleElement>("circle[aria-label]"),
  ];
  expect(points.length).toBe(5);
  expect(
    points
      .slice(0, 4)
      .every((point) => point.getAttribute("fill") === "transparent"),
  ).toBe(true);
  expect(points[4].getAttribute("fill")).toBe("var(--ci-chart-color, #42b8e8)");
  await act(() =>
    points[0].dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
  );
  expect(points[0].getAttribute("fill")).toBe("var(--ci-chart-color, #42b8e8)");
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Day 0: 1",
  );
  await act(() =>
    points[0].dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(points[0].getAttribute("fill")).toBe("transparent");
});
it("preserves missing-data gaps even when a long trend is sampled for rendering", async () => {
  const data = Array.from({ length: 241 }, (_, index) => ({
    label: String(index),
    value: index === 121 ? null : index + 1,
  }));
  await act(() =>
    root.render(<Trend area data={data} label="Long recorded history" />),
  );
  const line = container.querySelector('path[fill="none"]')!;
  expect(line.getAttribute("d")?.match(/M/g)?.length).toBe(2);
  expect(container.querySelectorAll('path[fill^="url"]').length).toBe(2);
  expect(
    [...container.querySelectorAll("circle[aria-label]")].every(
      (point) => point.getAttribute("fill") === "transparent",
    ),
  ).toBe(true);
});
it("shows an unavailable chart instead of plotting null duration as zero", async () => {
  await act(() =>
    root.render(
      <Trend
        area
        data={[{ label: "October", value: null }]}
        label="Missing duration month"
      />,
    ),
  );
  expect(container.textContent).toContain("No observations for this period");
  expect(container.querySelector("svg")).toBeNull();
});
