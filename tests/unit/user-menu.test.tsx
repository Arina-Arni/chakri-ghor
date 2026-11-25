import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ role: "seeker" as "seeker" | "moderator" | "admin" }));

vi.mock("@/components/providers/session-provider", () => ({
  useSession: () => ({
    me: { fullName: "রহিমা আক্তার", email: "rahima@example.test", initials: "রআ" },
    role: session.role,
  }),
}));
vi.mock("@/data", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const { UserMenu } = await import("@/components/layout/user-menu");

// Radix menus use pointer capture and scrollIntoView, which jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

async function openMenu() {
  render(<UserMenu />);
  await userEvent.click(screen.getByRole("button"));
}

const badge = () => document.querySelector('[data-slot="badge"]')?.textContent;
const adminLink = () => screen.queryByRole("menuitem", { name: /অ্যাডমিন প্যানেল/ });

describe("UserMenu role label", () => {
  it("tells a job seeker what kind of account this is, with no admin link", async () => {
    session.role = "seeker";
    await openMenu();
    expect(screen.getByRole("button", { hidden: true })).toHaveAccessibleName(/চাকরিপ্রার্থী/);
    expect(badge()).toBe("চাকরিপ্রার্থী");
    expect(adminLink()).toBeNull();
  });

  it("labels an admin and shows the admin panel link", async () => {
    session.role = "admin";
    await openMenu();
    expect(badge()).toBe("অ্যাডমিন");
    expect(adminLink()).toHaveAttribute("href", "/admin");
  });

  it("labels a moderator", async () => {
    session.role = "moderator";
    await openMenu();
    expect(badge()).toBe("মডারেটর");
    expect(adminLink()).toHaveAttribute("href", "/admin");
  });
});
