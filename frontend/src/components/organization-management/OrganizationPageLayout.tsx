import type { ReactNode } from "react";

import "./OrganizationLegacy.css";
import styles from "./OrganizationPageLayout.module.css";

interface OrganizationPageLayoutProps {
  organizationId: number | null;
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  heroAside?: ReactNode;
  children: ReactNode;
}

export function OrganizationPageLayout({
  organizationId,
  heroKicker,
  heroTitle,
  heroDescription,
  heroAside,
  children,
}: OrganizationPageLayoutProps) {
  return (
    <div className={`branch-management-page ${styles.page}`}>
      <main className="branch-management-main">
        <section className={`branch-management-hero ${styles.hero}`}>
          <div>
            <span className={styles.eyebrow}>{heroKicker}</span>
            <h1>{heroTitle}</h1>
            <p>{heroDescription}</p>
          </div>
          {heroAside && <div className={styles.tools}>{heroAside}</div>}
        </section>

        {organizationId ? (
          <>{children}</>
        ) : (
          <p className="management-error" role="alert">
            Tài khoản chưa được cấp quyền quản trị tổ chức.
          </p>
        )}
      </main>
    </div>
  );
}
