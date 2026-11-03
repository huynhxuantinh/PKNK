import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useMobileNavigationDrawer } from "../../hooks/useMobileNavigationDrawer";

type PublicNavigationLink = {
  to: string;
  label: string;
};

export function PublicMobileNavigation({
  links,
  label = "Menu di động",
}: {
  links: PublicNavigationLink[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useMobileNavigationDrawer(open, () => setOpen(false), buttonRef, drawerRef);

  return (
    <>
      <button
        ref={buttonRef}
        className={`mobile-menu-btn ${open ? "open" : ""}`}
        type="button"
        aria-label={open ? "Đóng menu" : "Mở menu điều hướng"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>
      <div
        ref={drawerRef}
        className={`mobile-nav-drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        tabIndex={-1}
        aria-label={label}
      >
        <nav
          className="mobile-nav-links"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {links.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
