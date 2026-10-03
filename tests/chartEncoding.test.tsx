import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Trend } from "../src/features/insights/components/Charts";
it("keeps chart detail separators as valid UTF-8 text", () => {
  const html = renderToStaticMarkup(
    <Trend
      label="Rating"
      data={[{ label: "Today", value: 1000, detail: "Observed rating" }]}
    />,
  );
  expect(html).toContain("· Observed rating");
  expect(html).not.toContain("Â");
});
