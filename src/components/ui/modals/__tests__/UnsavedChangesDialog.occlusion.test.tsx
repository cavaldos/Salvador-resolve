/**
 * Regression: the "Save changes before closing?" dialog was painted over by the
 * native GPU preview surface because it never asked the preview to step aside.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { UnsavedChangesDialog } from "../UnsavedChangesDialog";
import { useUIStore } from "@/store/uiStore";

const props = {
  projectName: "Demo",
  isSaving: false,
  onSave: vi.fn(),
  onDiscard: vi.fn(),
  onCancel: vi.fn(),
};
const ids = () => useUIStore.getState().activeOverlayIds;

describe("UnsavedChangesDialog native surface occlusion", () => {
  beforeEach(() => useUIStore.setState({ activeOverlayIds: [] }));

  it("occludes the native preview while open and releases it when closed", () => {
    const { rerender, getByRole } = render(<UnsavedChangesDialog isOpen {...props} />);
    expect(getByRole("dialog")).toBeTruthy();
    expect(ids()).toContain("unsaved-changes-dialog");

    rerender(<UnsavedChangesDialog isOpen={false} {...props} />);
    expect(ids()).not.toContain("unsaved-changes-dialog");
  });

  it("does not occlude the preview while closed", () => {
    render(<UnsavedChangesDialog isOpen={false} {...props} />);
    expect(ids()).toEqual([]);
  });
});
