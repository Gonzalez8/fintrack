import { describe, it, expect, beforeEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { PrivacyProvider, usePrivacy, isPrivacyMode } from "./privacy";
import { useRef } from "react";

// Track values via a ref that persists across re-renders
let capturedValues: { privacyMode: boolean; toggleFn: (() => void) | null } = {
  privacyMode: false,
  toggleFn: null,
};

function TestConsumer() {
  const { privacyMode, togglePrivacy } = usePrivacy();
  // Capture values so we can inspect them outside React
  capturedValues = { privacyMode, toggleFn: togglePrivacy };
  return (
    <div>
      <span data-testid="mode">{String(privacyMode)}</span>
      <button data-testid="toggle" onClick={togglePrivacy}>
        toggle
      </button>
    </div>
  );
}

beforeEach(() => {
  cleanup();
  // Clear cookies
  document.cookie = "fintrack_privacy=;path=/;max-age=0";
  capturedValues = { privacyMode: false, toggleFn: null };
});

describe("PrivacyProvider", () => {
  it("defaults to privacyMode false", () => {
    render(
      <PrivacyProvider>
        <TestConsumer />
      </PrivacyProvider>,
    );
    expect(capturedValues.privacyMode).toBe(false);
  });

  it("toggles privacy mode to true", () => {
    const { container } = render(
      <PrivacyProvider>
        <TestConsumer />
      </PrivacyProvider>,
    );
    expect(capturedValues.privacyMode).toBe(false);

    act(() => {
      capturedValues.toggleFn?.();
    });

    expect(capturedValues.privacyMode).toBe(true);
  });

  it("toggles privacy mode back to false", () => {
    render(
      <PrivacyProvider>
        <TestConsumer />
      </PrivacyProvider>,
    );

    act(() => {
      capturedValues.toggleFn?.();
    });
    expect(capturedValues.privacyMode).toBe(true);

    act(() => {
      capturedValues.toggleFn?.();
    });
    expect(capturedValues.privacyMode).toBe(false);
  });

  it("sets cookie on toggle", () => {
    render(
      <PrivacyProvider>
        <TestConsumer />
      </PrivacyProvider>,
    );

    act(() => {
      capturedValues.toggleFn?.();
    });
    expect(document.cookie).toContain("fintrack_privacy=1");
  });

  it("reads initial state from cookie", () => {
    document.cookie = "fintrack_privacy=1;path=/";
    render(
      <PrivacyProvider>
        <TestConsumer />
      </PrivacyProvider>,
    );
    expect(capturedValues.privacyMode).toBe(true);
  });
});

describe("isPrivacyMode", () => {
  it("returns false by default", () => {
    render(
      <PrivacyProvider>
        <TestConsumer />
      </PrivacyProvider>,
    );
    expect(isPrivacyMode()).toBe(false);
  });

  it("returns true after toggle", () => {
    render(
      <PrivacyProvider>
        <TestConsumer />
      </PrivacyProvider>,
    );

    act(() => {
      capturedValues.toggleFn?.();
    });
    expect(isPrivacyMode()).toBe(true);
  });
});
