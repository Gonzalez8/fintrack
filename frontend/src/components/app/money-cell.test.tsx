import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MoneyCell, PctCell } from "./money-cell";

let mockPrivacyMode = false;

vi.mock("@/lib/privacy", () => ({
  usePrivacy: () => ({ privacyMode: mockPrivacyMode, togglePrivacy: vi.fn() }),
}));

beforeEach(() => {
  cleanup();
  mockPrivacyMode = false;
});

describe("MoneyCell", () => {
  it("renders a formatted currency value", () => {
    const { container } = render(<MoneyCell value={1234.56} />);
    const text = container.textContent ?? "";
    // Should contain the number 1234.56 formatted in some locale
    expect(text).toContain("1234");
    expect(text).toContain("56");
  });

  it("renders dash for null value", () => {
    const { container } = render(<MoneyCell value={null} />);
    expect(container.textContent).toBe("—");
  });

  it("renders dash for undefined value", () => {
    const { container } = render(<MoneyCell value={undefined} />);
    expect(container.textContent).toBe("—");
  });

  it("renders dash for empty string", () => {
    const { container } = render(<MoneyCell value="" />);
    expect(container.textContent).toBe("—");
  });

  it("renders dash for NaN string", () => {
    const { container } = render(<MoneyCell value="not-a-number" />);
    expect(container.textContent).toBe("—");
  });

  it("shows mask when privacy mode is on and not public", () => {
    mockPrivacyMode = true;
    const { container } = render(<MoneyCell value={1234.56} />);
    expect(container.textContent).toBe("•••••");
  });

  it("shows value when privacy mode is on but isPublic", () => {
    mockPrivacyMode = true;
    const { container } = render(<MoneyCell value={1234.56} isPublic />);
    const text = container.textContent ?? "";
    expect(text).toContain("1234");
  });

  it("renders green for positive colored value", () => {
    const { container } = render(<MoneyCell value={100} colored />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-green-500");
  });

  it("renders red for negative colored value", () => {
    const { container } = render(<MoneyCell value={-50} colored />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-red-500");
  });

  it("renders muted for zero colored value", () => {
    const { container } = render(<MoneyCell value={0} colored />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-muted-foreground");
  });

  it("renders with prefix", () => {
    const { container } = render(<MoneyCell value={100} prefix="≈ " />);
    expect(container.textContent).toContain("≈");
  });

  it("adds + sign for positive colored values", () => {
    const { container } = render(<MoneyCell value={50} colored />);
    expect(container.textContent).toContain("+");
  });
});

describe("PctCell", () => {
  it("renders percentage value", () => {
    const { container } = render(<PctCell value={12.34} />);
    expect(container.textContent).toBe("+12.34%");
  });

  it("renders dash for null value", () => {
    const { container } = render(<PctCell value={null} />);
    expect(container.textContent).toBe("—");
  });

  it("renders green for positive value", () => {
    const { container } = render(<PctCell value={5} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-green-500");
  });

  it("renders red for negative value", () => {
    const { container } = render(<PctCell value={-3.5} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-red-500");
  });

  it("renders muted for zero value", () => {
    const { container } = render(<PctCell value={0} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-muted-foreground");
  });

  it("renders dash for empty string", () => {
    const { container } = render(<PctCell value="" />);
    expect(container.textContent).toBe("—");
  });

  it("parses string values", () => {
    const { container } = render(<PctCell value="7.50" />);
    expect(container.textContent).toBe("+7.50%");
  });
});
